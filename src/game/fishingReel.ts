/** A transient reel duel, fed by browser input in the existing fishing HUD.
 * It never modifies GameStore, advances the world clock or awards a catch.
 * Coordinates are normalized: 0 is bottom and 1 is the top of the gauge. */
export type ReelMouseButton="left"|"right";
export interface FishingReel {
  readonly fishY:number;
  readonly fishGoal:number;
  readonly barY:number;
  readonly barVelocity:number;
  readonly progress:number;
  readonly targetChangesIn:number;
  readonly breakoutIn:number;
  readonly elapsed:number;
  readonly lastButton:ReelMouseButton|null;
  readonly alternatingClicks:number;
}
export type ReelStepEvent="none"|"breakout"|"landed"|"escaped";
export const REEL_BAR_HALF_HEIGHT=.125;
export const REEL_BITE_MIN_SECONDS=1;
export const REEL_BITE_MAX_SECONDS=10;
const clamp=(value:number,min:number,max:number)=>
  Math.max(min,Math.min(max,value));
const sample=(random:()=>number)=>clamp(random(),0,.9999999);
export function nextFishBiteDelay(random:()=>number):number{
  return REEL_BITE_MIN_SECONDS+sample(random)*
    (REEL_BITE_MAX_SECONDS-REEL_BITE_MIN_SECONDS);
}
export function nextBreakoutDelay(random:()=>number):number{
  return 2.5+sample(random)*2.5;
}
export function createFishingReel(random:()=>number):FishingReel{
  return {
    fishY:.51,fishGoal:.51,barY:.43,barVelocity:0,
    progress:.26,targetChangesIn:.42,
    breakoutIn:nextBreakoutDelay(random),
    elapsed:0,lastButton:null,alternatingClicks:0,
  };
}
/** LEFT then RIGHT (or vice versa) is a valid ratchet pair. Repeating the
 * same button never pumps the green bar, and does not reset its alternation. */
export function clickFishingReel(
  state:FishingReel,button:ReelMouseButton,
):{state:FishingReel;accepted:boolean}{
  if(button===state.lastButton)return {state,accepted:false};
  return {accepted:true,state:{
    ...state,lastButton:button,
    alternatingClicks:state.alternatingClicks+1,
    barVelocity:Math.min(1.25,state.barVelocity+.34),
  }};
}
/** One world-independent visual update; frame delta is capped by the caller
 * and a single, explicit fork reports actual win, escape or breakout. */
export function stepFishingReel(
  state:FishingReel,seconds:number,random:()=>number,
):{state:FishingReel;event:ReelStepEvent}{
  const dt=clamp(Number.isFinite(seconds)?seconds:0,0,.05);
  if(dt===0)return {state,event:"none"};
  let fishGoal=state.fishGoal;
  let targetChangesIn=state.targetChangesIn-dt;
  if(targetChangesIn<=0){
    fishGoal=.11+sample(random)*.78;
    targetChangesIn=.38+sample(random)*.65;
  }
  const fishY=clamp(state.fishY+clamp(fishGoal-state.fishY,
    -dt*.60,dt*.60),.07,.93);
  let barVelocity=(state.barVelocity-1.35*dt)*Math.exp(-.95*dt);
  let barY=state.barY+barVelocity*dt;
  if(barY<REEL_BAR_HALF_HEIGHT){
    barY=REEL_BAR_HALF_HEIGHT;
    barVelocity=Math.max(0,barVelocity)*.18;
  }
  if(barY>1-REEL_BAR_HALF_HEIGHT){
    barY=1-REEL_BAR_HALF_HEIGHT;
    barVelocity=Math.min(0,barVelocity)*.18;
  }
  const inside=Math.abs(fishY-barY)<=REEL_BAR_HALF_HEIGHT+.025;
  const progress=clamp(state.progress+dt*(inside ? .235 : -.125),0,1);
  const breakoutIn=state.breakoutIn-dt;
  const next:FishingReel={...state,fishY,fishGoal,barY,barVelocity,
    targetChangesIn,breakoutIn,progress,elapsed:state.elapsed+dt};
  if(progress>=1)return {state:next,event:"landed"};
  if(progress<=0&&next.elapsed>=6)return {state:next,event:"escaped"};
  if(breakoutIn<=0)return {state:next,event:"breakout"};
  return {state:next,event:"none"};
}
/** A three-flick escape sequence is an interruption, NOT a second fish.
 * Successful counters return to this same in-progress duel. */
export function resumeFishingReel(
  state:FishingReel,successful:boolean,random:()=>number,
):FishingReel{
  return {...state,
    progress:clamp(state.progress+(successful ? .12 : -.20),.08,.94),
    breakoutIn:nextBreakoutDelay(random),
    targetChangesIn:.28+sample(random)*.26,
    lastButton:null,
    barVelocity:0,
  };
}
