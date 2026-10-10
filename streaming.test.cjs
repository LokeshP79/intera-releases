const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {sseEvents,TurnOrder,answerMessages}=require('../streaming');
const {AudioGate}=require('../audio-gate');
const {RealtimeChannel,streamAnswer}=require('../services');
test('SSE preserves fragmented UTF-8 and multiple events per packet',async()=>{
 const text='data: {"choices":[{"delta":{"content":"café"}}]}\r\n\r\ndata: {"choices":[{"delta":{"content":" ✓"}}]}\n\ndata: [DONE]\n\n';
 const encoded=new TextEncoder().encode(text);async function* chunks(){for(let i=0;i<encoded.length;i+=3)yield encoded.slice(i,i+3)}
 const events=[];for await(const e of sseEvents(chunks()))events.push(e);
 assert.equal(events.map(e=>e.choices[0].delta.content).join(''),'café ✓');
});
test('out-of-order final transcripts are delivered in committed order',()=>{
 const out=[],order=new TurnOrder((id,v)=>out.push([id,v]));order.commit('a');order.commit('b');order.complete('b','second');assert.equal(out.length,0);order.complete('a','first');assert.deepEqual(out,[['a','first'],['b','second']]);order.commit('a');assert.equal(order.order.length,0);
});
test('silence is not uploaded; pre-roll and speech are streamed before commit',()=>{
 const sent=[],commits=[];const gate=new AudioGate({send:x=>sent.push(x),commit:()=>commits.push(sent.length),silenceMs:800});
 for(let i=0;i<20;i++)gate.push(i,0);assert.equal(sent.length,0);
 gate.push(20,.05);assert.deepEqual(sent,[18,19,20]);assert.equal(commits.length,0);
 for(let i=21;i<24;i++)gate.push(i,.05);for(let i=24;i<32;i++)gate.push(i,0);
 assert.equal(commits.length,1);gate.push(32,0);assert.equal(commits.length,1);
});
test('long speech is bounded and begins a new turn without losing incoming audio',()=>{
 let total=0,commits=0;const gate=new AudioGate({send:()=>total++,commit:()=>commits++});
 for(let i=0;i<500;i++)gate.push(new ArrayBuffer(4800),.1);
 assert.equal(total,500);assert.equal(commits,1);
});
test('answer prompt grounds personal facts and includes actual candidate follow-up context',()=>{
 const messages=answerMessages({resume:'Built a billing service',format:'paragraphs'},'Why?', [{speaker:'candidate',text:'We chose PostgreSQL for transactions.'}]);
 assert.match(messages[0].content,/Never invent/);assert.match(messages[0].content,/no bullets/);assert.match(messages[1].content,/PostgreSQL/);
});
class FakeSocket extends EventEmitter {constructor(){super();this.sent=[];this.bufferedAmount=0;FakeSocket.last=this}send(data){this.sent.push(JSON.parse(data))}close(){this.emit('close')}}
test('Realtime waits for server readiness, forwards deltas, orders finals, and stops',async()=>{
 const events=[],c=new RealtimeChannel({WebSocket:FakeSocket,key:'fake',channel:'candidate',id:'test',model:'gpt-live-transcribe',send:x=>events.push(x)});const socket=FakeSocket.last;
 c.audio(new ArrayBuffer(4800));assert.equal(socket.sent.length,0);socket.emit('open');assert.equal(socket.sent[0].session.audio.input.format.rate,24000);
 socket.emit('message',Buffer.from(JSON.stringify({type:'session.updated'})));await c.opened;c.audio(new ArrayBuffer(4800));c.commit();assert.equal(socket.sent.at(-1).type,'input_audio_buffer.commit');
 c.event({type:'input_audio_buffer.committed',item_id:'1'});c.event({type:'conversation.item.input_audio_transcription.delta',item_id:'1',delta:'Hello'});c.event({type:'conversation.item.input_audio_transcription.completed',item_id:'1',transcript:'Hello there'});
 assert.equal(events.at(-1).text,'Hello there');assert.equal(events.at(-1).channel,'candidate');c.close();const count=events.length;c.event({type:'session.updated'});assert.equal(events.length,count);
});
test('Realtime rejects provider errors and fails closed under backpressure',async()=>{
 const c=new RealtimeChannel({WebSocket:FakeSocket,key:'fake',channel:'interviewer',id:'x',model:'gpt-live-transcribe',send:()=>{}});
 const rejected=assert.rejects(c.opened,/invalid key/);c.event({type:'error',error:{message:'invalid key'}});await rejected;assert.equal(c.closed,true);
 const d=new RealtimeChannel({WebSocket:FakeSocket,key:'fake',channel:'interviewer',id:'y',model:'gpt-live-transcribe',send:()=>{}});d.event({type:'session.updated'});await d.opened;d.socket.bufferedAmount=2000000;d.audio(new ArrayBuffer(4800));assert.equal(d.closed,true);
});
test('answer emits each delta before stream completion',async()=>{
 const out=[];const fake=async()=>({ok:true,body:(async function*(){yield new TextEncoder().encode('data: {"choices":[{"delta":{"content":"First"}}]}\n\n');assert.deepEqual(out,['First']);yield new TextEncoder().encode('data: {"choices":[{"delta":{"content":" second"}}]}\n\ndata: [DONE]\n\n')})()});
 await streamAnswer({key:'fake',config:{},question:'Explain',history:[],signal:new AbortController().signal,emit:d=>out.push(d),fetchImpl:fake});assert.deepEqual(out,['First',' second']);
});
test('a truncated response stream surfaces an error instead of false success',async()=>{
 const fake=async()=>({ok:true,body:(async function*(){yield new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Partial"}}]}\n\n')})()});
 await assert.rejects(streamAnswer({key:'fake',config:{},question:'Explain',history:[],signal:new AbortController().signal,emit:()=>{},fetchImpl:fake}),/ended unexpectedly/);
});
