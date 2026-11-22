import type {DungeonPlaybackSnapshot,DungeonPlaybackTimeline} from "./dungeonReplayPlayback.ts";
import type {SpatialDungeonReplay} from "./spatialDungeonExploration.ts";
import {recordedTemporaryPartyVisuals} from "./dungeonReplayCast.ts";

/**
 * Presentation-only arrangement within the single ACTUALLY traversed tile.
 * All participants follow one saved spatial path. Lateral spacing and a
 * common facing make each visible without inventing separate navigation.
 * Stable party-ID order yields the same view from any member's replay POV.
 */
export interface TemporaryPartyFormationActor {
  readonly id:string;
  readonly offsetX:number;readonly offsetZ:number;
  readonly heading:number;
  readonly walking:boolean;
}

export function recordedTemporaryPartyFormation(
  replay:SpatialDungeonReplay,timeline:DungeonPlaybackTimeline,
  snapshot:DungeonPlaybackSnapshot,
):readonly TemporaryPartyFormationActor[] {
  if(snapshot.encounter&&snapshot.frame)return [];
  const visuals=recordedTemporaryPartyVisuals(replay);
  if(visuals.length<2)return [];

  const walks=timeline.segments.filter(segment=>segment.kind==="walk");
  // The current legitimate movement direction, then the last known
  // direction; at the start use the first actually recorded step.
  const current=walks.find(segment=>snapshot.time>=segment.start &&
    snapshot.time<segment.end);
  const prior=walks.filter(segment=>segment.end<=snapshot.time).at(-1);
  const segment=current??prior??walks[0];
  const dx=segment?segment.to.x-segment.from.x:0;
  const dz=segment?segment.to.z-segment.from.z:1;
  const magnitude=Math.hypot(dx,dz)||1;
  const fx=dx/magnitude,fz=dz/magnitude;
  const lateralX=-fz,lateralZ=fx;
  const heading=Math.atan2(fx,fz);
  const count=visuals.length;
  // All positions remain INSIDE the same grid cell (2.5 world units).
  const spread=count===2?0.43:0.56;
  return visuals.map((actor,index)=>{
    const sideways=count===2?(index===0?-spread:spread):
      index===0?0:index===1?-spread:spread;
    const behind=count===3&&index>0?0.23:0;
    return {
      id:actor.id,
      offsetX:sideways*lateralX-behind*fx,
      offsetZ:sideways*lateralZ-behind*fz,
      heading,
      walking:snapshot.action==="walk",
    };
  });
}

/** Only already-committed combat can tell us if an ally has fallen.
 * Do not resurrect a casualty for the post-combat exit view. */
export function recordedPartyMemberAlive(
  timeline:DungeonPlaybackTimeline,snapshot:DungeonPlaybackSnapshot,
  memberId:string,
):boolean {
  const completed=timeline.segments.filter(segment=>
    segment.kind==="combat"&&segment.end<=snapshot.time);
  for(const segment of completed){
    const last=segment.encounter?.combat.frames.at(-1);
    const actor=last?.actors.find(a=>a.id===memberId);
    if(actor&&actor.hp<=0)return false;
  }
  return true;
}
