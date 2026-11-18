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
  return [replay.heroId,
    ...actors.filter(actor=>actor.id!==replay.heroId).map(actor=>actor.id)];
}
