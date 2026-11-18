import type { DungeonFeature, DungeonLayout } from "./dungeonLayout.ts";

/**
 * One persistent location may host several GENERATIONS of ordinary content.
 * Geometry, history and unique bosses are deliberately outside this table.
 *
 * An absent record is the initial world generation. A null resolvedDay
 * means that the current generation is active and may be encountered once.
 */
export interface DungeonSiteCycle {
  readonly id: string;
  readonly cycle: number;
  readonly resolvedDay: number | null;
}

export interface RegeneratingDungeonWorld {
  readonly resolvedFeatureIds: readonly string[];
  readonly heroes: readonly { readonly x: number; readonly z: number }[];
  /** Optional for backwards compatibility with already saved version-13 worlds. */
  readonly siteCycles?: readonly DungeonSiteCycle[];
}

const hashName = (name: string): number => {
  let hash = 2166136261;
  for (let i = 0; i < name.length; i++) {
    hash = Math.imul(hash ^ name.charCodeAt(i), 16777619);
  }
  return hash >>> 0;
};

/** Seed-independent of render order, camera and mutable global RNG. */
export function dungeonGenerationSeed(baseSeed: number, cycle: number): number {
  return (baseSeed ^ Math.imul(cycle, 0x9e3779b1)) >>> 0;
}

/** Staggered site-specific cooldowns; exact values are future balance knobs. */
export function dungeonSiteCooldown(layout: DungeonLayout, site: DungeonFeature): number {
  const span = site.kind === "treasure" ? 3 : 3;
  const minimum = site.kind === "monster" ? 2 : site.kind === "trap" ? 3 : 4;
  return minimum + ((layout.seed ^ hashName(site.id)) >>> 0) % span;
}

export function dungeonSiteGeneration(
  sites: readonly DungeonSiteCycle[] | undefined, id: string,
): number {
  return sites?.find(site => site.id === id)?.cycle ?? 0;
}

/** Mark a real resolved encounter/chest/trap, exactly once for this generation. */
export function resolveDungeonSite(
  sites: readonly DungeonSiteCycle[], id: string, day: number,
): DungeonSiteCycle[] {
  const old = sites.find(site => site.id === id);
  const record: DungeonSiteCycle = {
    id, cycle: old?.cycle ?? 0, resolvedDay: day,
  };
  return old
    ? sites.map(site => site.id === id ? record : site)
    : [...sites, record];
}

/**
 * Refresh on a COMMITTED dungeon/day step, never on opening a viewer.
 * Existing v13 saves with no siteCycles are seeded as *recently cleared*,
 * not instantly refilled. Don't respawn on a hero occupying the site's tile.
 */
export function refreshDungeonSites<T extends RegeneratingDungeonWorld>(
  world: T, layout: DungeonLayout, day: number,
): { resolvedFeatureIds: string[]; siteCycles: DungeonSiteCycle[] } {
  if (!Number.isSafeInteger(day) || day < 1) throw new RangeError("Invalid dungeon day");
  const features = new Map(layout.features.map(feature => [feature.id, feature]));
  const resolved = new Set(world.resolvedFeatureIds);
  const saved = new Map((world.siteCycles ?? []).map(site => [site.id, site]));
  const siteCycles: DungeonSiteCycle[] = [];
  for (const feature of layout.features) {
    let record = saved.get(feature.id);
    // A recorded old clear stays cleared for a full normal cooldown.
    if (!record && resolved.has(feature.id)) {
      record = { id: feature.id, cycle: 0, resolvedDay: day };
    }
    if (!record) continue;
    const occupied = world.heroes.some(hero =>
      hero.x === feature.x && hero.z === feature.z);
    if (record.resolvedDay !== null &&
        day - record.resolvedDay >= dungeonSiteCooldown(layout, feature) &&
        !occupied) {
      record = { id: record.id, cycle: record.cycle + 1, resolvedDay: null };
      resolved.delete(feature.id);
    }
    siteCycles.push(record);
  }
  // Invalid site IDs should be caught by the strict save validator. No new
  // object may be invented from an unknown id or a deprecated site.
  for (const id of resolved) {
    if (!features.has(id)) throw new RangeError("Unknown resolved dungeon site");
  }
  return { resolvedFeatureIds: [...resolved], siteCycles };
}
