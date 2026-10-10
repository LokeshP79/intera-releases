'use strict';
const $=id=>document.getElementById(id);
let config={},generation=0,connecting=false,paused=false,answerId=null,firstToken=0,startedAt=0;
let history=[],pending='',questionRevision=0,checkQueue=Promise.resolve();
const sources=new Map(),partials=new Map(),manuallyHandledItems=new Set();
let latestInterviewer='',answerInFlight=false;
const status=text=>$('state').textContent=text;
const setHiddenValue=(id,value)=>{const el=$(id);if(el)el.value=value};
const setMeter=(id,value)=>{const el=$(id);if(el)el.value=value};
function notice(text){$('notice').textContent=text;$('notice').hidden=!text}
function current(run){return run===generation}
function renderHistory(){
 const container=$('history');container.replaceChildren();
 if(!history.length){const p=document.createElement('p');p.className='empty';p.textContent='Your conversation will appear here. Only interviewer questions trigger answers.';container.append(p)}
 for(const t of history){const box=document.createElement('div');box.className='turn '+t.speaker;const label=document.createElement('strong');label.textContent=t.speaker==='candidate'?'YOU · CONTEXT':'INTERVIEWER';const text=document.createElement('p');text.textContent=t.text;box.append(label,text);container.append(box)}
 container.scrollTop=container.scrollHeight;$('turn-count').textContent=history.length+' turns';
}
function addTurn(speaker,text){history.push({speaker,text:text.slice(0,6000),at:Date.now()});history=history.slice(-40);renderHistory()}
function renderPartial(){ $('partial').textContent=[...partials.values()].filter(t=>t.channel==='candidate').map(t=>'Mic context: '+t.text).join('\n') }
function cancelAnswer(){answerInFlight=false;answerId=null;$('answer').classList.remove('streaming');window.desktop.cancelAnswer().catch(()=>{})}
function manualQuestion(){
 const typed=($('transcript')?.value||'').trim();if(typed)return typed;
 const live=[...partials.entries()].filter(([,value])=>value.channel==='interviewer');
 if(live.length){for(const [item]of live)manuallyHandledItems.add(item);return [pending,...live.map(([,value])=>value.text)].filter(Boolean).join(' ').trim()}
 return pending.trim()||latestInterviewer;
}
async function generate(question,automatic=false){
 if(question===undefined)question=manualQuestion();question=String(question||'').trim();
 if(!question){status('Waiting for a question · speak or type one');return}
 if(answerInFlight&&question===$('current-question').textContent)return;
 if(!automatic)questionRevision++;pending='';setHiddenValue('transcript','');cancelAnswer();
 const id=crypto.randomUUID();answerId=id;answerInFlight=true;firstToken=0;startedAt=performance.now();
 $('current-question').textContent=question;$('partial').textContent='';$('answer').textContent='';$('answer').className='answer streaming';$('latency').textContent='Generating…';status('Preparing response');
 try{await window.desktop.startAnswer({id,question,history:history.slice(-24),config})}catch(error){if(answerId===id){answerInFlight=false;notice(error.message);$('answer').classList.remove('streaming');setHiddenValue('transcript',question);status('Answer unavailable')}}
}
window.desktop.onAnswer(event=>{
 if(event.id!==answerId)return;
 if(event.type==='delta'){
  if(!firstToken){firstToken=performance.now();$('latency').textContent=((firstToken-startedAt)/1000).toFixed(1)+'s to first text';status('Response streaming')}
  $('answer').textContent+=event.delta;
 }else if(event.type==='done'){answerInFlight=false;$('answer').classList.remove('streaming');status('Answer ready')}
 else if(event.type==='error'){answerInFlight=false;$('answer').classList.remove('streaming');notice(event.error);setHiddenValue('transcript',$('current-question').textContent);status('Answer failed · retry')}
});
window.desktop.onRealtime(event=>{
 const source=sources.get(event.channel);if(!source||event.id!==source.id)return;
 const label=event.channel==='candidate'?'mic-status':'system-status';
 if(event.type==='ready'){$(label).textContent='Live';return}
 if(event.type==='error'){
  source.failed=true;source.stream.getTracks().forEach(t=>t.stop());source.context?.close().catch(()=>{});
  $(label).textContent='Disconnected';status('Audio needs attention');notice(event.error);return;
 }
 const item=event.channel+':'+event.item;
 if(event.type==='partial'){
  const previous=partials.get(item)?.text||'';partials.set(item,{channel:event.channel,text:previous+event.delta});
  if(partials.size>12)partials.delete(partials.keys().next().value);renderPartial();if(event.channel==='interviewer')$('current-question').textContent=partials.get(item)?.text||'Listening…';
 }else if(event.type==='final'){
  partials.delete(item);renderPartial();const text=event.text.trim();if(!text)return;
  addTurn(event.channel,text);
  if(event.channel==='candidate')return;
  latestInterviewer=text;$('current-question').textContent=text;
  if(manuallyHandledItems.delete(item))return;
  const run=generation,revision=questionRevision;
  checkQueue=checkQueue.then(async()=>{
   if(!current(run)||revision!==questionRevision)return;
   pending=(pending?pending+' ':'')+text;pending=pending.slice(-10000);
   if(!$('auto').checked){setHiddenValue('transcript',pending);status('Ready · press Return');return}
   const question=pending;
   if(clearQuestion(question)){pending='';generate(question,true);return}
   status('Checking question · Enter to answer now');
   const decision=await window.desktop.classify({text:question,history:history.slice(-12)});
   if(!current(run)||revision!==questionRevision||!$('auto').checked)return;
   if(decision.isQuestion&&!decision.incomplete){pending='';generate(decision.question?.trim()||question,true)}
   else if(!decision.incomplete){pending='';status('Listening · Enter to answer latest transcript')}
   else status('Listening · question still in progress');
  }).catch(error=>{if(current(run)){notice(error.message);setHiddenValue('transcript',pending);status('Question check failed · use Return')}});
 }
});
function releaseSource(source){source.failed=true;source.stream.getTracks().forEach(t=>t.stop());source.node?.disconnect();source.input?.disconnect();source.context?.close().catch(()=>{})}
async function stopAudio(){
 generation++;questionRevision++;connecting=false;manuallyHandledItems.clear();
 for(const source of sources.values())releaseSource(source);sources.clear();partials.clear();renderPartial();
 setMeter('level',0);setMeter('mic-level',0);if($('system-status'))$('system-status').textContent='Stopped';if($('mic-status'))$('mic-status').textContent=config.mic?'Stopped':'Off';
 await window.desktop.stopRealtime();
}
async function attach(channel,stream,run){
 const source={stream,id:`${run}-${channel}`,failed:false};
 if(!current(run)){stream.getTracks().forEach(t=>t.stop());return}
 sources.set(channel,source);
 try{
  const context=new AudioContext({sampleRate:24000});source.context=context;await context.resume();
  if(context.sampleRate!==24000)throw Error('This audio device cannot provide 24 kHz capture.');
  await context.audioWorklet.addModule('pcm-worklet.js');if(!current(run))return;
  const input=context.createMediaStreamSource(stream),node=new AudioWorkletNode(context,'pcm-capture');source.input=input;source.node=node;node.port.onmessage=()=>{};
  input.connect(node);node.connect(context.destination);
  const gate=new AudioGate({silenceMs:config.silenceMs||1100,
   send:bytes=>window.desktop.sendAudio({channel,id:source.id,bytes}),commit:()=>window.desktop.commitAudio({channel,id:source.id})});
  const meter=channel==='candidate'?'mic-level':'level';
  await window.desktop.startRealtime({channel,id:source.id,model:config.sttModel});if(!current(run))return;
  let lastSignal=performance.now(),warned=false;
  node.port.onmessage=({data})=>{
   if(!current(run)||source.failed)return;setMeter(meter,Math.min(1,data.rms*15));gate.push(data.bytes,data.rms);
   if(data.rms>.008){lastSignal=performance.now();if(warned){warned=false;notice('')}}
   if(channel==='interviewer'&&!warned&&performance.now()-lastSignal>20000){warned=true;notice('No meeting audio detected for 20 seconds. If someone is speaking, check macOS system-audio permissions and your meeting output. Silence between turns is normal.')}
  };
  for(const track of stream.getAudioTracks())track.onended=()=>{if(current(run)&&!source.failed){source.failed=true;notice(`${channel==='candidate'?'Microphone':'System audio'} stopped. Click Reconnect.`);$(channel==='candidate'?'mic-status':'system-status').textContent='Stopped'}};
 }catch(error){releaseSource(source);throw error}
}
async function connect(){
 if(connecting)return;let run;connecting=true;$('reconnect').disabled=true;$('pause').disabled=true;notice('');cancelAnswer();
 try{
  await stopAudio();connecting=true;run=generation;paused=false;pending='';$('pause').textContent='Pause';status('Connecting system audio…');
  const captured=await navigator.mediaDevices.getDisplayMedia({video:true,audio:true});
  if(!current(run)){captured.getTracks().forEach(t=>t.stop());return}
  const tracks=captured.getAudioTracks();if(!tracks.length||tracks[0].readyState==='ended'){captured.getTracks().forEach(t=>t.stop());throw Error('No system audio track. Enable System Audio Recording for InterAI in macOS Privacy & Security, then quit and reopen the app.')}
  await attach('interviewer',captured,run);
  if(!current(run))return;
  if(config.mic){
   try{
    if(!await window.desktop.micPermission())throw Error('Microphone permission denied');
    if(!current(run))return;
    const mic=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
    await attach('candidate',mic,run);
   }catch(error){if(current(run)){if($('mic-status'))$('mic-status').textContent='Unavailable';notice('Interviewer audio is connected. Microphone context is unavailable: '+error.message)}}
  }
  if(current(run)){status('Listening');$('pause').disabled=false;$('reconnect').textContent='Reconnect'}
 }catch(error){if(run!==undefined&&!current(run))return;notice(error.message);status('Audio unavailable · typed questions work');await stopAudio();$('pause').disabled=true}
 finally{connecting=false;$('reconnect').disabled=false}
}
document.addEventListener('keydown',e=>{
 if(e.key!=='Enter'||e.shiftKey||e.ctrlKey||e.metaKey||e.altKey||e.isComposing||e.repeat)return;
 e.preventDefault();generate();
});
$('auto').onchange=()=>{questionRevision++;if(!$('auto').checked)setHiddenValue('transcript',pending);};
$('reconnect').onclick=connect;
$('pause').onclick=async()=>{if(paused){await connect();return}paused=true;cancelAnswer();await stopAudio();$('pause').textContent='Resume';status('Paused · audio disconnected')};
$('clear').onclick=async()=>{cancelAnswer();await stopAudio();history=[];pending='';latestInterviewer='';checkQueue=Promise.resolve();renderHistory();setHiddenValue('transcript','');$('answer').textContent='Session cleared. Connect to begin again.';$('answer').className='answer muted';$('current-question').textContent='Your interviewer’s question will appear here.';$('partial').textContent='';$('latency').textContent='—';$('pause').disabled=true;notice('');status('Session cleared')};
$('setup').onclick=()=>window.desktop.showSetup();$('close').onclick=()=>window.desktop.closeOverlay();
window.addEventListener('beforeunload',()=>{generation++;for(const source of sources.values())releaseSource(source)});
window.desktop.getOverlayConfig().then(value=>{config=value;if($('mic-status'))$('mic-status').textContent=config.mic?'Ready':'Off';status('Ready · click Connect')}).catch(error=>notice(error.message));
