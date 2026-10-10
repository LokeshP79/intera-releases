'use strict';
const {app,BrowserWindow,desktopCapturer,screen,session,ipcMain,safeStorage,systemPreferences}=require('electron');
const fs=require('node:fs'),path=require('node:path');
const WebSocket=require('ws');
const {RealtimeChannel,classify,streamAnswer}=require('./services');
let win,overlayWin,overlayConfig={};
const channels=new Map(),answers=new Map();
const keyFile=()=>path.join(app.getPath('userData'),'api-key.bin');
function readKey(){try{return safeStorage.decryptString(fs.readFileSync(keyFile()))}catch{return ''}}
function writeKey(value){if(!safeStorage.isEncryptionAvailable())throw Error('Secure key storage unavailable.');if(value)fs.writeFileSync(keyFile(),safeStorage.encryptString(value),{mode:0o600});else if(fs.existsSync(keyFile()))fs.unlinkSync(keyFile())}
function trusted(wc){return wc&&!wc.isDestroyed()&&[win,overlayWin].some(w=>w&&!w.isDestroyed()&&w.webContents===wc)}
function guard(e){if(!trusted(e.sender))throw Error('Untrusted window')}
function key(){const value=readKey();if(!value)throw Error('Save your OpenAI API key in Setup first.');return value}
function emit(wc,name,data){if(!wc.isDestroyed())wc.send(name,data)}
function cleanup(wc){for(const [id,c]of channels)if(c.owner===wc.id){c.close();channels.delete(id)}answers.get(wc.id)?.abort();answers.delete(wc.id)}
function protect(w){w.setContentProtection(true);w.webContents.setWindowOpenHandler(()=>({action:'deny'}));w.webContents.on('will-navigate',e=>e.preventDefault());w.webContents.on('destroyed',()=>cleanup(w.webContents))}
function createWindow(){win=new BrowserWindow({width:860,height:900,minWidth:620,minHeight:600,title:'InterAI',backgroundColor:'#090909',webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true}});protect(win);win.loadFile('index.html')}
function createOverlay(config){
  overlayConfig=config;
  if(overlayWin&&!overlayWin.isDestroyed())overlayWin.close();
  const {x,y,width:areaWidth}=screen.getPrimaryDisplay().workArea;
  const width=720,height=320;
  overlayWin=new BrowserWindow({width,height,minWidth:450,minHeight:260,x:Math.round(x+(areaWidth-width)/2),y:y+48,title:'InterAI',frame:false,transparent:true,resizable:true,alwaysOnTop:true,skipTaskbar:false,backgroundColor:'#00000000',webPreferences:{preload:path.join(__dirname,'preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
  overlayWin.setAlwaysOnTop(true,'floating');protect(overlayWin);overlayWin.loadFile('overlay.html');const thisWindow=overlayWin;thisWindow.on('closed',()=>{if(overlayWin===thisWindow)overlayWin=null});
}
app.whenReady().then(()=>{
  session.defaultSession.setPermissionCheckHandler((wc,permission)=>trusted(wc)&&['display-capture','media'].includes(permission));
  session.defaultSession.setPermissionRequestHandler((wc,permission,callback)=>callback(trusted(wc)&&['display-capture','media'].includes(permission)));
  session.defaultSession.setDisplayMediaRequestHandler(async(request,callback)=>{
    try{if(!request.frame?.url?.startsWith('file:'))throw Error('Untrusted capture request');const sources=await desktopCapturer.getSources({types:['screen'],thumbnailSize:{width:0,height:0}});if(!sources.length)throw Error('No screen available');callback({video:sources[0],audio:'loopback'})}catch{callback({})}
  });createWindow();
});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit()});
app.on('activate',()=>{if(!win||win.isDestroyed())createWindow();else win.show()});
app.on('before-quit',()=>{for(const c of channels.values())c.close();for(const a of answers.values())a.abort()});
ipcMain.handle('key:has',e=>{guard(e);return Boolean(readKey())});
ipcMain.handle('key:save',(e,value)=>{guard(e);writeKey(String(value||'').trim());return true});
ipcMain.handle('overlay:open',(e,cfg)=>{guard(e);createOverlay(cfg||{});return true});
ipcMain.handle('overlay:config',e=>{guard(e);return overlayConfig});
ipcMain.handle('overlay:close',e=>{guard(e);overlayWin?.close()});
ipcMain.handle('setup:show',e=>{guard(e);if(!win||win.isDestroyed())createWindow();win.show();win.focus()});
ipcMain.handle('mic:permission',async e=>{guard(e);return process.platform==='darwin'?systemPreferences.askForMediaAccess('microphone'):true});
ipcMain.handle('realtime:start',async(e,{channel,id,model})=>{
  guard(e);if(!['interviewer','candidate'].includes(channel)||typeof id!=='string'||id.length>100)throw Error('Invalid channel');
  const slot=`${e.sender.id}:${channel}`;channels.get(slot)?.close();
  const c=new RealtimeChannel({WebSocket,key:key(),channel,id,model:model==='gpt-4o-transcribe'?'gpt-4o-transcribe':'gpt-live-transcribe',send:data=>emit(e.sender,'realtime:event',data)});
  c.owner=e.sender.id;channels.set(slot,c);
  try{await c.opened;return true}catch(error){if(channels.get(slot)===c)channels.delete(slot);throw error}
});
ipcMain.on('realtime:audio',(e,{channel,id,bytes})=>{if(!trusted(e.sender))return;const c=channels.get(`${e.sender.id}:${channel}`);if(c?.id===id&&bytes instanceof ArrayBuffer)c.audio(bytes)});
ipcMain.on('realtime:commit',(e,{channel,id})=>{if(!trusted(e.sender))return;const c=channels.get(`${e.sender.id}:${channel}`);if(c?.id===id)c.commit()});
ipcMain.handle('realtime:stop',e=>{guard(e);for(const[slot,c]of channels)if(c.owner===e.sender.id){c.close();channels.delete(slot)}return true});
ipcMain.handle('question:classify',(e,args)=>{guard(e);return classify({key:key(),...args,signal:AbortSignal.timeout(20000)})});
ipcMain.handle('answer:cancel',e=>{guard(e);answers.get(e.sender.id)?.abort();answers.delete(e.sender.id)});
ipcMain.handle('answer:start',async(e,{id,question,history,config})=>{
  guard(e);const apiKey=key();answers.get(e.sender.id)?.abort();const controller=new AbortController();answers.set(e.sender.id,controller);
  const timer=setTimeout(()=>controller.abort(new Error('Answer timed out')),60000);
  try{await streamAnswer({key:apiKey,config:config||{},question,history,signal:controller.signal,emit:delta=>emit(e.sender,'answer:event',{id,type:'delta',delta})});emit(e.sender,'answer:event',{id,type:'done'})}
  catch(error){if(!controller.signal.aborted)emit(e.sender,'answer:event',{id,type:'error',error:error.message});else if(controller.signal.reason?.message==='Answer timed out')emit(e.sender,'answer:event',{id,type:'error',error:'Answer timed out. Press Answer to retry.'})}
  finally{clearTimeout(timer);if(answers.get(e.sender.id)===controller)answers.delete(e.sender.id)}
});
