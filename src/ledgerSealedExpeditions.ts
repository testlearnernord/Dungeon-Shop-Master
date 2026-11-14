import type {GameState,WorldEvent} from "./game/gameState.ts";
import type {AdventurerRole} from "./game/adventurers.ts";
import {heroDisplayNames,heroPortraitIndex} from "./game/heroIdentity.ts";

/**
 * A sealed recording is an invitation to spectate, not a post-battle report.
 * Only record type, ID, day and stable adventurer identity are allowed here.
 * NEVER project combatOutcome, event.message, replay content, after.status,
 * after.level, XP, loot, injuries or gold into these dossier headers.
 */
export interface SealedExpeditionDossier {
  readonly recordId:string;
  readonly heroId:string|null;
  readonly heroName:string;
  readonly role:AdventurerRole|null;
  /** Level as known before sleeping; never the post-combat level. */
  readonly knownLevel:number|null;
  readonly portrait:number|null;
  readonly day:number;
  readonly floor:6|7;
  readonly kind:"combat"|"exploration";
  readonly title:string;
  readonly category:string;
}
export interface SealedExpeditionCounts {
  readonly total:number;
  readonly combat:number;
  readonly exploration:number;
}

export function sealedExpeditionDossiers(
  before:GameState,after:GameState,recordings:readonly WorldEvent[],
):readonly SealedExpeditionDossier[]{
  const beforeHeroes=new Map(before.adventurers.map(hero=>[hero.id,hero]));
  // Stable IDs and names are public character identity. Hero status, level
  // progression and resources after the night are deliberately not read.
  const identities=new Map(after.adventurers.map(hero=>[hero.id,{
    id:hero.id,name:hero.name,role:hero.role,
  }]));
  const names=heroDisplayNames([...before.adventurers,
    ...after.adventurers.filter(hero=>!beforeHeroes.has(hero.id))]);
  return recordings.map(event=>{
    if(event.type!=="level6-combat"&&event.type!=="level7-exploration")
      throw new RangeError("Expedition dossier requires a replay event");
    const combat=event.type==="level6-combat";
    const id=event.adventurerId??null;
    const earlier=id?beforeHeroes.get(id):undefined;
    const person=id?identities.get(id):undefined;
    return {
      recordId:event.id,
      heroId:id,
      heroName:(id?names.get(id):undefined)??earlier?.name??person?.name??
        "Unknown adventurer",
      role:earlier?.role??person?.role??null,
      knownLevel:earlier?.level??null,
      portrait:id&&earlier||id&&person?heroPortraitIndex(id):null,
      day:event.day,
      floor:combat?6:7,
      kind:combat?"combat":"exploration",
      title:combat?"THE CAVE TROLL":"UNCHARTED DEPTHS",
      category:combat?"COMBAT RECORDING":"EXPLORATION RECORDING",
    };
  });
}

export function sealedExpeditionCounts(
  dossiers:readonly SealedExpeditionDossier[],
):SealedExpeditionCounts{
  const combat=dossiers.filter(record=>record.kind==="combat").length;
  return {total:dossiers.length,combat,exploration:dossiers.length-combat};
}
