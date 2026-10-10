// AudioContext resamples capture to 24 kHz; emit mono PCM16 in 100 ms frames.
class PCMProcessor extends AudioWorkletProcessor {
 constructor(){super();this.samples=new Float32Array(2400);this.offset=0;}
 process(inputs){
  const channels=inputs[0];if(!channels?.length)return true;
  for(let i=0;i<channels[0].length;i++){
   let value=0;for(const channel of channels)value+=channel[i];value/=channels.length;
   this.samples[this.offset++]=value;
   if(this.offset===2400){
    const bytes=new ArrayBuffer(4800),view=new DataView(bytes);let sum=0;
    for(let j=0;j<2400;j++){const v=Math.max(-1,Math.min(1,this.samples[j]));sum+=v*v;view.setInt16(j*2,Math.round(v*(v<0?32768:32767)),true)}
    this.port.postMessage({bytes,rms:Math.sqrt(sum/2400)},[bytes]);this.offset=0;
   }
  }return true;
 }
}
registerProcessor('pcm-capture',PCMProcessor);
