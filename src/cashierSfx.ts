/** Synthesized, royalty-free checkout UI cues. No audio assets or gameplay RNG. */
export type CashierCue="open"|"pulse"|"hit"|"miss"|"coins";
export function createCashierSfx(isEnabled:()=>boolean,getVolume:()=>number) {
  let context:AudioContext|null=null;
  let lastPulse=-1;
  const play=(cue:CashierCue)=>{
    if(!isEnabled()||getVolume()<=0)return;
    try{
      context??=new AudioContext();
      if(context.state==="suspended")void context.resume();
      const now=context.currentTime;
      const gain=context.createGain();
      gain.connect(context.destination);
      const level=Math.min(.18,Math.max(0,getVolume())*.16);
      const tone=(frequency:number,at:number,duration:number,wave:OscillatorType="sine")=>{
        const osc=context!.createOscillator();
        const envelope=context!.createGain();
        osc.type=wave;
        osc.frequency.setValueAtTime(frequency,at);
        envelope.gain.setValueAtTime(.0001,at);
        envelope.gain.exponentialRampToValueAtTime(Math.max(.0002,level),at+.012);
        envelope.gain.exponentialRampToValueAtTime(.0001,at+duration);
        osc.connect(envelope);envelope.connect(gain);
        osc.start(at);osc.stop(at+duration+.01);
      };
      if(cue==="open"){tone(360,now,.09);tone(540,now+.085,.13);}
      if(cue==="pulse")tone(310,now,.035);
      if(cue==="hit"){tone(720,now,.10);tone(1080,now+.075,.15);}
      if(cue==="miss"){tone(170,now,.18,"triangle");tone(120,now+.08,.2,"triangle");}
      if(cue==="coins"){for(let i=0;i<4;i++)tone(880+i*130,now+i*.075,.19,"triangle");}
    }catch{ /* Audio is optional; gameplay must continue without it. */ }
  };
  const pulse=(cycle:number)=>{
    if(cycle!==lastPulse){lastPulse=cycle;play("pulse");}
  };
  return {play,pulse};
}
