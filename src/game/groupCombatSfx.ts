import type {CombatantSpec,GroupCombatCue} from "./groupCombat.ts";
import type {GameSfxCue} from "../sfxCatalog.ts";

export interface GroupSoundEvent {
  readonly cue:GameSfxCue;
  /** Real combatant identity. The arena uses its committed position for 3D sound. */
  readonly actorId:string;
}

const isGhoul=(actor:CombatantSpec|undefined):boolean=>
  !!actor&&actor.team==="monsters"&&actor.specialAbility!=="grapple-throw";

function upperBound(events:readonly GroupCombatCue[],time:number):number {
  let lo=0,hi=events.length;
  while(lo<hi){
    const mid=(lo+hi)>>>1;
    if(events[mid].t<=time+1e-6)lo=mid+1;
    else hi=mid;
  }
  return lo;
}

/** Opt-in audio is derived ONLY from saved motor cues, never simulated 3D
 * motion or frame rate. A seek/late join never plays an old hit retroactively. */
export class GroupCombatSoundCursor {
  private readonly actors:Map<string,CombatantSpec>;
  private readonly attacks=new Map<string,number>();
  private readonly leaping=new Set<string>();
  private index=0;
  private time:number;
  constructor(actors:readonly CombatantSpec[],startTime:number){
    this.actors=new Map(actors.map(a=>[a.id,a]));
    this.time=startTime;
  }

  advance(events:readonly GroupCombatCue[],time:number):readonly GroupSoundEvent[]{
    if(!Number.isFinite(time))return [];
    if(time+1e-6<this.time||time-this.time>.75||
        this.index>events.length){
      // A replay seek or newly attached live spectator is NOT a new fight.
      // Never flood the speakers with historic combat while fast-forwarding.
      this.index=upperBound(events,time);
      this.time=time;
      this.leaping.clear();
      return [];
    }
    const out:GroupSoundEvent[]=[];
    const add=(cue:GameSfxCue,actorId:string)=>out.push({cue,actorId});
    while(this.index<events.length&&events[this.index].t<=time+1e-6){
      const e=events[this.index];
      const actor=this.actors.get(e.actorId);
      const target=this.actors.get(e.targetId??"");
      // Ignore archived events at/before the camera's initial timestamp.
      if(e.t>this.time+1e-6){
        if(e.kind==="attack"&&isGhoul(actor)){
          const count=(this.attacks.get(actor!.id)??0)+1;
          this.attacks.set(actor!.id,count);
          if(count===1)add("ghoul-aggro",actor!.id);
          else if(count%5===0)add("ghoul-growl",actor!.id);
          else add("ghoul-attack",actor!.id);
          if(count%3===0){
            this.leaping.add(actor!.id);
            add("ghoul-leap-takeoff",actor!.id);
            add("ghoul-leap-air",actor!.id);
          }
        }else if(e.kind==="hit"){
          if(isGhoul(actor)){
            add("ghoul-claw-hit",actor!.id);
            if(this.leaping.delete(actor!.id))
              add("ghoul-leap-land",actor!.id);
          }
          if(isGhoul(target)){
            const next=events[this.index+1];
            const fatal=next?.kind==="death"&&next.actorId===target!.id&&
              Math.abs(next.t-e.t)<1e-6;
            if(!fatal){
              add((e.amount??0)>=target!.maxHp*.22
                ?"ghoul-stagger":"ghoul-hurt",target!.id);
            }
          }
        }else if(e.kind==="miss"&&isGhoul(actor)){
          add("ghoul-claw-whiff",actor!.id);
          if(this.leaping.delete(actor!.id))
            add("ghoul-leap-land",actor!.id);
        }else if((e.kind==="dodge"||e.kind==="parry")&&isGhoul(target)){
          // Dodge/parry is emitted by the defender; targetId is the attacker.
          add("ghoul-claw-whiff",target!.id);
          if(this.leaping.delete(target!.id))
            add("ghoul-leap-land",target!.id);
          if(e.kind==="parry")add("ghoul-stagger",target!.id);
        }else if(e.kind==="death"&&isGhoul(actor)){
          add("ghoul-death",actor!.id);
          this.leaping.delete(actor!.id);
        }
      }
      this.index++;
    }
    this.time=time;
    return out;
  }
}
