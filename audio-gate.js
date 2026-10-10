(function(root){
 class AudioGate {
  constructor({send,commit,silenceMs=1000,threshold=0.008}){Object.assign(this,{send,commit,silenceMs,threshold});this.reset()}
  reset(){this.pre=[];this.speaking=false;this.quiet=0;this.duration=0}
  push(bytes,rms){
   const voice=rms>=this.threshold;
   if(!this.speaking){
    this.pre.push(bytes);if(this.pre.length>3)this.pre.shift();
    if(!voice)return;
    this.speaking=true;this.duration=this.pre.length*100;for(const b of this.pre)this.send(b);this.pre=[];this.quiet=0;
   }else{this.send(bytes);this.duration+=100;this.quiet=voice?0:this.quiet+100}
   if(this.quiet>=this.silenceMs||this.duration>=45000){this.commit();this.reset()}
  }
 }
 if(typeof module!=='undefined')module.exports={AudioGate};else root.AudioGate=AudioGate;
})(globalThis);
