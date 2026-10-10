const {contextBridge,ipcRenderer}=require('electron');
const listen=(channel,callback)=>{const fn=(_event,data)=>callback(data);ipcRenderer.on(channel,fn);return()=>ipcRenderer.removeListener(channel,fn)};
contextBridge.exposeInMainWorld('desktop',{
 hasKey:()=>ipcRenderer.invoke('key:has'),saveKey:key=>ipcRenderer.invoke('key:save',key),
 openOverlay:config=>ipcRenderer.invoke('overlay:open',config),getOverlayConfig:()=>ipcRenderer.invoke('overlay:config'),
 closeOverlay:()=>ipcRenderer.invoke('overlay:close'),showSetup:()=>ipcRenderer.invoke('setup:show'),micPermission:()=>ipcRenderer.invoke('mic:permission'),
 startRealtime:args=>ipcRenderer.invoke('realtime:start',args),stopRealtime:()=>ipcRenderer.invoke('realtime:stop'),
 sendAudio:args=>ipcRenderer.send('realtime:audio',args),commitAudio:args=>ipcRenderer.send('realtime:commit',args),
 onRealtime:fn=>listen('realtime:event',fn),classify:args=>ipcRenderer.invoke('question:classify',args),
 startAnswer:args=>ipcRenderer.invoke('answer:start',args),cancelAnswer:()=>ipcRenderer.invoke('answer:cancel'),onAnswer:fn=>listen('answer:event',fn)
});
