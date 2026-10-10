const {clearQuestion}=require('../question-intent');
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function harness(){
 const elements={};const make=()=>({value:'',textContent:'',hidden:false,checked:true,className:'',classList:{remove(){}},append(){},replaceChildren(){},addEventListener(){}});
 const ids=['state','notice','history','turn-count','partial','transcript','current-question','answer','latency','auto','mic-status','system-status','level','mic-level','reconnect','pause','send','clear','setup','close'];ids.forEach(id=>elements[id]=make());
 let keydown;let rt,answerListener,calls=[],classifications=[],decision={isQuestion:true,incomplete:false,question:'Why PostgreSQL?'};
 const desktop={onRealtime:f=>rt=f,onAnswer:f=>answerListener=f,getOverlayConfig:async()=>({}),cancelAnswer:async()=>{},stopRealtime:async()=>{},startAnswer:async args=>{calls.push(args)},classify:async args=>{classifications.push(args);return decision},showSetup(){},closeOverlay(){}};
 const context={clearQuestion,document:{addEventListener:(event,fn)=>{if(event==='keydown')keydown=fn},getElementById:id=>elements[id],createElement:make},window:{desktop,addEventListener(){}},crypto:require('node:crypto').webcrypto,performance,console};vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('../overlay.js'),'utf8'),context);
 vm.runInContext("sources.set('interviewer',{id:'remote',stream:{getTracks:()=>[]}});sources.set('candidate',{id:'local',stream:{getTracks:()=>[]}})",context);
 return{keydown:e=>keydown({preventDefault(){},...e}),elements,calls,classifications,context,rt:e=>rt(e),answer:e=>answerListener(e),setDecision:d=>decision=d};
}
const tick=()=>new Promise(r=>setImmediate(r));
test('microphone speech never classifies or answers, but grounds interviewer follow-ups',async()=>{
 const h=harness();h.rt({channel:'candidate',id:'local',type:'final',item:'1',text:'I selected PostgreSQL for transactions.'});await tick();assert.equal(h.calls.length,0);assert.equal(h.classifications.length,0);
 h.rt({channel:'interviewer',id:'remote',type:'final',item:'2',text:'Why?'});await tick();await tick();assert.equal(h.calls.length,1);assert.match(JSON.stringify(h.calls[0].history),/transactions/);
});
test('acknowledgments and incomplete questions do not produce an answer',async()=>{
 const h=harness();h.setDecision({isQuestion:false,incomplete:false,question:''});h.rt({channel:'interviewer',id:'remote',type:'final',item:'1',text:'Thanks.'});await tick();assert.equal(h.calls.length,0);
 h.setDecision({isQuestion:true,incomplete:true,question:'Tell me'});h.rt({channel:'interviewer',id:'remote',type:'final',item:'2',text:'Tell me'});await tick();assert.equal(h.calls.length,0);
 h.setDecision({isQuestion:true,incomplete:false,question:'Tell me about your project'});h.rt({channel:'interviewer',id:'remote',type:'final',item:'3',text:'about your project'});await tick();assert.equal(h.calls.length,1);assert.equal(h.calls[0].question,'Tell me about your project');
});
test('manual mode and stale answer events cannot overwrite a newer response',async()=>{
 const h=harness();h.elements.auto.checked=false;h.rt({channel:'interviewer',id:'remote',type:'final',item:'1',text:'Explain indexes'});await tick();assert.equal(h.calls.length,0);assert.equal(h.elements.transcript.value,'Explain indexes');h.keydown({key:'Enter'});await tick();const old=h.calls[0].id;
 h.elements.transcript.value='Explain joins';h.keydown({key:'Enter'});await tick();const next=h.calls[1].id;h.answer({id:old,type:'delta',delta:'OLD'});h.answer({id:next,type:'delta',delta:'NEW'});assert.equal(h.elements.answer.textContent,'NEW');
});
test('clearing session invalidates pending classification and removes history',async()=>{
 const h=harness();let release;h.context.window.desktop.classify=()=>new Promise(r=>release=r);h.rt({channel:'interviewer',id:'remote',type:'final',item:'1',text:'Explain indexes'});await tick();await h.elements.clear.onclick();release({isQuestion:true,incomplete:false,question:'Explain indexes'});await tick();assert.equal(h.calls.length,0);assert.equal(h.elements['turn-count'].textContent,'0 turns');
});
test('an explicit completed question auto-answers even if classifier is unavailable',async()=>{
 const h=harness();h.context.window.desktop.classify=async()=>{throw Error('Offline classifier')};
 h.rt({channel:'interviewer',id:'remote',type:'final',item:'1',text:'Tell me about your recent project.'});await tick();
 assert.equal(h.calls.length,1);assert.equal(h.calls[0].question,'Tell me about your recent project.');
});
test('Enter outside the question box uses latest interviewer text and bypasses pending classification',async()=>{
 const h=harness();let release;h.context.window.desktop.classify=()=>new Promise(r=>release=r);
 h.rt({channel:'interviewer',id:'remote',type:'final',item:'1',text:'Your approach to that migration'});await tick();
 assert.equal(h.elements.transcript.value,'');h.keydown({key:'Enter',target:{tagName:'BODY'}});await tick();
 assert.equal(h.calls.length,1);assert.equal(h.calls[0].question,'Your approach to that migration');
 release({isQuestion:true,incomplete:false,question:'Your approach to that migration'});await tick();assert.equal(h.calls.length,1);
});
test('Enter still works after the detector ignores a turn',async()=>{
 const h=harness();h.setDecision({isQuestion:false,incomplete:false,question:''});
 h.rt({channel:'interviewer',id:'remote',type:'final',item:'1',text:'Your thoughts on that'});await tick();h.keydown({key:'Enter'});await tick();
 assert.equal(h.calls[0].question,'Your thoughts on that');
});
test('Enter uses visible partial speech and its final transcript does not trigger twice',async()=>{
 const h=harness();h.rt({channel:'interviewer',id:'remote',type:'partial',item:'live',delta:'Tell me about your project'});
 h.keydown({key:'Enter'});await tick();assert.equal(h.calls.length,1);
 h.rt({channel:'interviewer',id:'remote',type:'final',item:'live',text:'Tell me about your project.'});await tick();assert.equal(h.calls.length,1);
});
test('typed override wins and repeated Enter does not restart an answer in flight',async()=>{
 const h=harness();h.elements.transcript.value='My typed question';h.keydown({key:'Enter'});await tick();
 h.elements.transcript.value='My typed question';h.keydown({key:'Enter'});await tick();assert.equal(h.calls.length,1);assert.equal(h.calls[0].question,'My typed question');
});
test('Shift+Enter, composing text, and held Enter do not submit',async()=>{
 const h=harness();h.elements.transcript.value='Question';for(const flags of [{shiftKey:true},{isComposing:true},{repeat:true}])h.keydown({key:'Enter',...flags});await tick();assert.equal(h.calls.length,0);
});
