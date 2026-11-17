/** Human-readable metadata for sample-backed and provisional synthesized Level 6 SFX. */
export const SFX_OWNERS = [
  {id:"hero",label:"Hero"},
  {id:"troll",label:"Troll"},
  {id:"world",label:"World / Rest"},
] as const;
export const SFX_FAMILIES = [
  {id:"voice",label:"Voice"},
  {id:"movement",label:"Movement"},
  {id:"melee",label:"Melee"},
  {id:"ranged",label:"Ranged"},
  {id:"magic",label:"Magic / Heal"},
  {id:"environment",label:"Environment"},
] as const;

export type SfxOwner = typeof SFX_OWNERS[number]["id"];
export type SfxFamily = typeof SFX_FAMILIES[number]["id"];
export type SfxAxis = "owner" | "family";

export const SFX_CATALOG = [
  {id:"troll-roar",label:"Troll · roar",owner:"troll",family:"voice"},
  {id:"troll-breath",label:"Troll · breath",owner:"troll",family:"voice"},
  {id:"troll-grunt",label:"Troll · grunt",owner:"troll",family:"voice"},
  {id:"troll-step",label:"Troll · footstep",owner:"troll",family:"movement"},
  {id:"hero-step",label:"Hero · footstep",owner:"hero",family:"movement"},
  {id:"troll-swing",label:"Troll · fist swing",owner:"troll",family:"melee"},
  {id:"troll-impact",label:"Troll · ground impact",owner:"troll",family:"melee"},
  {id:"hero-hurt",label:"Hero · hurt",owner:"hero",family:"voice"},
  {id:"hero-attack",label:"Hero · weapon swing",owner:"hero",family:"melee"},
  {id:"boss-hurt",label:"Troll · hurt",owner:"troll",family:"voice"},
  {id:"projectile",label:"Hero · projectile",owner:"hero",family:"ranged"},
  {id:"shield-parry",label:"Hero · parry",owner:"hero",family:"melee"},
  {id:"dodge",label:"Hero · dodge",owner:"hero",family:"movement"},
  {id:"stagger",label:"Troll · stagger",owner:"troll",family:"voice"},
  {id:"heal",label:"Hero · heal",owner:"hero",family:"magic"},
  {id:"lava-burn",label:"Lava · damage",owner:"world",family:"environment"},
  {id:"troll-death",label:"Troll · death",owner:"troll",family:"voice"},
  {id:"hero-death",label:"Hero · death",owner:"hero",family:"voice"},
  {id:"rock-crumble",label:"Rock · crumble",owner:"world",family:"environment"},
] as const satisfies readonly {
  id:string; label:string; owner:SfxOwner; family:SfxFamily
}[];

export type GameSfxCue = typeof SFX_CATALOG[number]["id"];
export type SfxCatalogEntry = typeof SFX_CATALOG[number];
const entryMap = new Map<string,SfxCatalogEntry>(SFX_CATALOG.map(entry=>[entry.id,entry]));
export function sfxDetails(cue:GameSfxCue): SfxCatalogEntry {
  const entry=entryMap.get(cue);
  if(!entry)throw new Error("Unregistered sound cue: "+cue);
  return entry;
}

/** Preview filters are deliberately transient: no storage and no gameplay state. */
export interface SfxDebugFilters {
  readonly soloOwner:SfxOwner|null;
  readonly soloFamily:SfxFamily|null;
  readonly mutedOwners:ReadonlySet<SfxOwner>;
  readonly mutedFamilies:ReadonlySet<SfxFamily>;
}
export function blankSfxDebugFilters():SfxDebugFilters {
  return {soloOwner:null,soloFamily:null,
    mutedOwners:new Set<SfxOwner>(),mutedFamilies:new Set<SfxFamily>()};
}
export function passesSfxDebugFilter(
  owner:SfxOwner, family:SfxFamily, filters:SfxDebugFilters,
):boolean {
  return (!filters.soloOwner||filters.soloOwner===owner) &&
    (!filters.soloFamily||filters.soloFamily===family) &&
    !filters.mutedOwners.has(owner)&&!filters.mutedFamilies.has(family);
}
