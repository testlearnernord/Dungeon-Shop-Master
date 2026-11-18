import type { CombatantSpec, GroupPhase } from "./groupCombat.ts";
import type { Level7Replay } from "./level7Exploration.ts";
import type { DungeonPlaybackSnapshot } from "./dungeonReplayPlayback.ts";

/**
 * Read-only projection of the committed group combat recording.
 * The viewer is not allowed to calculate HP, select targets or replay RNG.
 */
export interface RecordedDungeonActor {
  readonly id: string;
  readonly team: CombatantSpec["team"];
  readonly role: CombatantSpec["role"];
  readonly x: number;
  readonly z: number;
  readonly heading: number;
  readonly phase: GroupPhase;
  readonly hp: number;
  readonly radius: number;
  readonly specialAbility?: CombatantSpec["specialAbility"];
}

/** Historical cast metadata is recorded at fight creation, never read from today's roster. */
export function dungeonReplayCast(replay: Level7Replay): readonly CombatantSpec[] {
  const cast = new Map<string, CombatantSpec>();
  for (const encounter of replay.encounters) {
    for (const actor of encounter.combat.actors) {
      if (!cast.has(actor.id)) cast.set(actor.id, actor);
    }
  }
  return [...cast.values()];
}

/** Original group companions exist before combat. A new recording
 * captures their exact historical appearance even when the party never
 * finds a monster. Older recordings can use authentic recorded fighters;
 * without either record, no fake equipped companion model is created. */
export function recordedTemporaryPartyVisuals(
  replay:Level7Replay,
):readonly {
  id:string;role:"tank"|"DPS"|"healer";
  equipment:{weapon:"Iron Sword"|null;armor:"Leather Vest"|null};
}[] {
  const ids=replay.partyMemberIds??[];
  if(ids.length<2||!ids.includes(replay.heroId))return [];
  const fromStart=new Map(replay.partyAppearances?.map(hero=>[hero.id,hero])??[]);
  const fromCombat=new Map(dungeonReplayCast(replay).filter(actor=>
    actor.team==="heroes"&&actor.role!=="monster").map(actor=>[actor.id,actor]));
  const projected: {
    id:string;role:"tank"|"DPS"|"healer";
    equipment:{weapon:"Iron Sword"|null;armor:"Leather Vest"|null};
  }[]=[];
  for(const id of ids){
    if(id===replay.heroId){
      projected.push({id,role:replay.appearance.role,
        equipment:{
          weapon:replay.appearance.equipment.weapon==="Iron Sword"?"Iron Sword":null,
          armor:replay.appearance.equipment.armor==="Leather Vest"?"Leather Vest":null,
        }});
      continue;
    }
    const snap=fromStart.get(id);
    if(snap){
      projected.push({id,role:snap.role,equipment:{
        weapon:snap.equipment.weapon==="Iron Sword"?"Iron Sword":null,
        armor:snap.equipment.armor==="Leather Vest"?"Leather Vest":null,
      }});
      continue;
    }
    const fighter=fromCombat.get(id);
    if(fighter&&fighter.role!=="monster"){
      projected.push({id,role:fighter.role,
        equipment:fighter.equipment?{...fighter.equipment}:
          {weapon:null,armor:null}});
    }
  }
  return projected;
}

/** Do not expose enemies or companions before the encounter footage starts. */
export function visibleDungeonCombatActors(
  snapshot: DungeonPlaybackSnapshot,
): readonly RecordedDungeonActor[] {
  if (!snapshot.encounter || !snapshot.frame) return [];
  const byId = new Map(snapshot.encounter.combat.actors.map(actor => [actor.id, actor]));
  const actors: RecordedDungeonActor[] = [];
  for (const frameActor of snapshot.frame.actors) {
    const spec = byId.get(frameActor.id);
    if (!spec) continue;
    actors.push({
      id: frameActor.id, team: spec.team, role: spec.role,
      x: frameActor.x, z: frameActor.z,
      heading: frameActor.heading, phase: frameActor.phase, hp: frameActor.hp,
      radius: spec.radius ?? 0.5,
      ...(spec.specialAbility ? {specialAbility: spec.specialAbility} : {}),
    });
  }
  return actors;
}

/** TAB only cycles actors visible in the current footage, not future opponents. */
export function dungeonReplayFocusIds(
  replay: Level7Replay, snapshot: DungeonPlaybackSnapshot | null,
): readonly string[] {
  const actors=snapshot?visibleDungeonCombatActors(snapshot):[];
  const companions=recordedTemporaryPartyVisuals(replay).map(actor=>actor.id)
    .filter(id=>id!==replay.heroId);
  const already=new Set([replay.heroId,...companions]);
  return [replay.heroId,...companions,
    ...actors.filter(actor=>!already.has(actor.id)).map(actor=>actor.id)];
}
