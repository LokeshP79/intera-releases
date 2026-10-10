const $=id=>document.getElementById(id);
for(const field of ['resume','job','instructions','model-select','stt-model','format','silence']){
 const el=$(field),saved=localStorage.getItem(field);if(saved!==null)el.value=saved;
 el.addEventListener('input',()=>localStorage.setItem(field,el.value));
}
$('mic').checked=localStorage.getItem('mic')==='true';$('mic').onchange=()=>localStorage.setItem('mic',String($('mic').checked));
$('platform').textContent=navigator.platform.includes('Mac')?'MACOS / SYSTEM AUDIO':'SYSTEM AUDIO';
window.desktop.hasKey().then(has=>$('keyStatus').textContent=has?'API key saved securely':'Add your API key to connect.').catch(e=>$('keyStatus').textContent=e.message);
$('save').onclick=async()=>{try{const key=$('key').value.trim();if(!key)throw Error('Enter a key before saving.');await window.desktop.saveKey(key);$('key').value='';$('keyStatus').textContent='API key saved securely'}catch(e){$('keyStatus').textContent=e.message}};
$('start').onclick=async()=>{const btn=$('start');btn.disabled=true;try{if(!await window.desktop.hasKey())throw Error('Save your API key first.');await window.desktop.openOverlay({resume:$('resume').value,job:$('job').value,instructions:$('instructions').value,model:$('model-select').value,sttModel:$('stt-model').value,format:$('format').value,silenceMs:Number($('silence').value),mic:$('mic').checked})}catch(e){$('keyStatus').textContent=e.message;$('keyStatus').scrollIntoView({block:'center'})}finally{btn.disabled=false}};
