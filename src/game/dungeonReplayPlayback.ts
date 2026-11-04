import type { DungeonLayout, DungeonPoint } from "./dungeonLayout.ts";
import type {
  Level7Replay, Level7ReplayStep, Level7ReplayEncounter,
} from "./level7Exploration.ts";
import type { GroupReplayFrame } from "./groupCombat.ts";

/**
 * Read-only time mapping. This module never calls combat, simulation or RNG.
 * The real saved animation frames are the ONLY combat playback data source.
 */
export type DungeonSegmentKind = "walk" | "event" | "combat";
export interface DungeonPlaybackSegment {
  readonly kind: DungeonSegmentKind;
  readonly start: number;
  readonly end: number;
  readonly from: DungeonPoint;
  readonly to: DungeonPoint;
  readonly step: Level7ReplayStep;
  readonly encounter?: Level7ReplayEncounter;
}
export interface DungeonPlaybackTimeline {
  readonly segments: readonly DungeonPlaybackSegment[];
  readonly duration: number;
}
export interface DungeonPlaybackSnapshot {
  readonly time: number;
  readonly duration: number;
  readonly x: number;
  readonly z: number;
  readonly hp: number;
  readonly action: string;
  readonly known: ReadonlySet<number>;
  readonly resolved: ReadonlySet<string>;
  readonly encounter: Level7ReplayEncounter | null;
  readonly frame: GroupReplayFrame | null;
  readonly finished: boolean;
  readonly percent: number;
}
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
const grid=(layout:DungeonLayout,p:DungeonPoint)=>p.z*layout.width+p.x;

export function buildDungeonPlayback(replay:Level7Replay): DungeonPlaybackTimeline {
  if(!replay.steps.length) throw new RangeError("Replay has no steps");
  const segments:DungeonPlaybackSegment[]=[];
  let cursor=0;
  let previous=replay.steps[0];
  for(let i=1;i<replay.steps.length;i++){
    const step=replay.steps[i];
    let encounter:Level7ReplayEncounter|undefined;
    let duration=0.48;
    let kind:DungeonSegmentKind="event";
    if(step.action==="walk"){
      duration=0.95;kind="walk";
    }else if(step.action==="combat"){
      encounter=replay.encounters.find(e=>e.featureId===step.featureId);
      if(!encounter)throw new RangeError("Recorded combat is missing encounter frames");
      kind="combat";
      duration=Math.max(0.2,encounter.combat.frames.at(-1)?.t??0.2);
    }
    segments.push({
      kind,start:cursor,end:cursor+duration,
      from:{x:previous.x,z:previous.z},to:{x:step.x,z:step.z},
      step,...(encounter?{encounter}:{}),
    });
    cursor+=duration;
    previous=step;
  }
  return {segments,duration:cursor};
}

export function dungeonPlaybackAt(
  replay:Level7Replay, timeline:DungeonPlaybackTimeline,
  layout:DungeonLayout, elapsed:number,
): DungeonPlaybackSnapshot {
  const time=clamp(Number.isFinite(elapsed)?elapsed:0,0,timeline.duration);
  const known=new Set<number>(replay.knownAtStart ??
    [grid(layout,replay.steps[0])]);
  const resolved=new Set<string>(replay.resolvedAtStart??[]);
  const first=replay.steps[0];
  let x=first.x,z=first.z,hp=first.hp;
  let action="enter";
  let encounter:Level7ReplayEncounter|null=null,frame:GroupReplayFrame|null=null;
  for(const segment of timeline.segments) {
    if(time>=segment.end-1e-7){
      x=segment.to.x;z=segment.to.z;
      hp=segment.step.hp;
      action=segment.step.action;
      if(segment.kind==="walk")known.add(grid(layout,segment.to));
      if(segment.step.featureId &&
          ["treasure","trap","defeat-monster"].includes(segment.step.action))
        resolved.add(segment.step.featureId);
      continue;
    }
    if(time<segment.start)break;
    const portion=clamp((time-segment.start)/(segment.end-segment.start),0,1);
    if(segment.kind==="walk"){
      x=segment.from.x+(segment.to.x-segment.from.x)*portion;
      z=segment.from.z+(segment.to.z-segment.from.z)*portion;
      action="walk";
      // On entering a field, reveal it, not before the walk begins.
      if(portion>=0.75)known.add(grid(layout,segment.to));
    }else if(segment.kind==="combat"&&segment.encounter){
      encounter=segment.encounter;
      const frames=encounter.combat.frames;
      const fightTime=portion*(frames.at(-1)?.t??0);
      // Frame HP is authoritative. Interpolated positions are purely cosmetic.
      let idx=0;
      while(idx+1<frames.length&&frames[idx+1].t<=fightTime)idx++;
      const src=frames[idx];
      const next=frames[Math.min(idx+1,frames.length-1)];
      const alpha=next.t===src.t?0:clamp((fightTime-src.t)/(next.t-src.t),0,1);
      frame={
        ...src,
        actors:src.actors.map(actor=>{
          const follow=next.actors.find(other=>other.id===actor.id)??actor;
          return {...actor,
            x:actor.x+(follow.x-actor.x)*alpha,
            z:actor.z+(follow.z-actor.z)*alpha,
          };
        }),
        projectiles:src.projectiles.map((p,i)=>{
          const n=next.projectiles[i];
          return n&&n.ownerId===p.ownerId
            ?{...p,x:p.x+(n.x-p.x)*alpha,z:p.z+(n.z-p.z)*alpha}
            :p;
        }),
      };
      const hero=frame.actors.find(a=>a.id===replay.heroId);
      if(hero){
        hp=hero.hp;
        x=encounter.x+hero.x/2.5;
        z=encounter.z+hero.z/2.5;
      }
      action="combat";
    }else{
      x=segment.to.x;z=segment.to.z;action=segment.step.action;
      // HP/results of an action are disclosed only when it finishes.
    }
    break;
  }
  const finished=time>=timeline.duration-1e-7;
  return {time,duration:timeline.duration,x,z,hp,action,known,resolved,
    encounter,frame,finished,percent:timeline.duration?time/timeline.duration:1};
}

/** Fog of war uses only one hero's previously known cells and current steps. */
export function dungeonVisibleTiles(
  layout:DungeonLayout, known:ReadonlySet<number>,
): ReadonlySet<number> {
  const visible=new Set<number>(known);
  for(const cell of known){
    const x=cell%layout.width,z=Math.floor(cell/layout.width);
    for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const nx=x+dx,nz=z+dz;
      if(nx>=0&&nx<layout.width&&nz>=0&&nz<layout.height)
        visible.add(nz*layout.width+nx);
    }
  }
  return visible;
}
