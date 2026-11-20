import type {GroupReplayFrame} from "./groupCombat.ts";

/**
 * Read-only, sub-frame presentation of already committed 60Hz combat.
 * Combat snapshots are stored ~10Hz to bound saves, but spectators render
 * at their actual display refresh rate. The current/previous committed
 * poses are the only input: NO predictions, new physics, HP, RNG or events.
 *
 * Actor phase, stamina and HP belong to the last recorded frame at/before t.
 * Only cosmetic x/z, heading and matching projectile positions interpolate.
 */
export function sampleGroupReplayPresentation(
  frames:readonly GroupReplayFrame[],time:number,
):GroupReplayFrame{
  if(!frames.length)throw new RangeError("Missing committed combat frames");
  const first=frames[0]!,last=frames[frames.length-1]!;
  const t=Math.min(last.t,Math.max(first.t,Number.isFinite(time)?time:first.t));
  let lo=0,hi=frames.length-1;
  while(lo<hi){
    const mid=Math.floor((lo+hi+1)/2);
    if(frames[mid]!.t<=t)lo=mid;
    else hi=mid-1;
  }
  const src=frames[lo]!,next=frames[Math.min(lo+1,frames.length-1)]!;
  const alpha=src===next||next.t===src.t?0:
    Math.max(0,Math.min(1,(t-src.t)/(next.t-src.t)));
  const following=new Map(next.actors.map(actor=>[actor.id,actor]));
  const projectiles=new Map(next.projectiles.map(p=>[p.ownerId,p]));
  const turn=(start:number,end:number)=>{
    // Turning across +/-Pi must follow the short arc, never spin 360 degrees.
    const difference=Math.atan2(Math.sin(end-start),Math.cos(end-start));
    return start+difference*alpha;
  };
  return {
    ...src,t,
    actors:src.actors.map(actor=>{
      const future=following.get(actor.id)??actor;
      return {...actor,
        x:actor.x+(future.x-actor.x)*alpha,
        z:actor.z+(future.z-actor.z)*alpha,
        heading:turn(actor.heading,future.heading),
      };
    }),
    projectiles:src.projectiles.map(p=>{
      const future=projectiles.get(p.ownerId);
      return future?{...p,
        x:p.x+(future.x-p.x)*alpha,
        z:p.z+(future.z-p.z)*alpha}:p;
    }),
  };
}
