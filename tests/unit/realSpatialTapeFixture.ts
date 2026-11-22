import assert from "node:assert/strict";
import {createGameState,type GameState,type WorldEvent} from "../../src/game/gameState.ts";
import {generateExpeditionLayout,dungeonNeighbors} from "../../src/game/dungeonLayout.ts";
import {simulateSpatialDungeonPartyDay} from "../../src/game/spatialDungeonExploration.ts";
import {createSave,parseSave} from "../../src/game/campaignSave.ts";

type OrdinaryFloor=1|2|3|4|5|6|7|8|9;

/** Real seeded dungeon movement and fixed-step battle recorder, not an
 * alternate day engine. All source and destination geometry is authoritative. */
export function realSpatialTapeFixture(floor:OrdinaryFloor=6,kind:"monster"|"treasure"="monster"):
  {state:GameState;event:WorldEvent}{
  const seed=7351,base=createGameState(seed);
  const layout=generateExpeditionLayout(seed,floor);
  const feature=layout.features.find(item=>item.kind===kind);
  assert(feature,"Seeded floor must contain the requested real site");
  const approach=dungeonNeighbors(layout,feature)[0];
  assert(approach,"Encounter must have a physically connected approach");
  const excluded=feature.z*layout.width+feature.x;
  const visited=layout.tiles.flatMap((tile,i)=>
    tile!=="wall"&&i!==excluded?[i]:[]);
  const original=base.adventurers[0];
  const hero={...original,floor,status:"exploring" as const,
    equipment:{weapon:"Iron Sword",armor:"Leather Vest"},
    inventory:{...original.inventory,healing:5},
    health:original.stats.maxHealth};
  const world={
    resolvedFeatureIds:layout.features.filter(site=>site.id!==feature.id)
      .map(site=>site.id),
    heroes:[{heroId:hero.id,...approach,visited}],
  };
  const stepped=simulateSpatialDungeonPartyDay([hero],world,seed,1,
    new Set([hero.id]),{maxSteps:1,maxEncounters:1,deferReturn:true});
  const tape=stepped.ticks[0].replay;
  assert(tape.steps.length>1,"Recorded movement must have occurred");
  if(kind==="monster")
    assert(tape.encounters.some(e=>e.featureId===feature.id),
      "The fight must be a genuine seeded site encounter");
  const event:WorldEvent={
    id:"day-1:"+hero.id+":dungeon-live:1000",
    type:"dungeon-live",day:1,worldTick:1000,adventurerId:hero.id,
    reportedZone:floor>=6?"deep":"upper",dungeonReplay:tape,
    message:"A genuine numbered-floor dungeon step was recorded.",
  };
  const state:GameState={...base,
    worldClock:{...base.worldClock,tick:1000},
    shopTraffic:{...base.shopTraffic,tick:1000},
    adventurers:base.adventurers.map(h=>
      h.id===hero.id?stepped.ticks[0].adventurer:h),
    dungeonWorlds:[{floor,world:stepped.world}],
    events:[...base.events,event],
  };
  assert.deepEqual(parseSave(JSON.stringify(createSave(state))),state,
    "Current-schema real encounter must round-trip without old events");
  return {state,event};
}
