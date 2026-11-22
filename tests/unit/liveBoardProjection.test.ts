import assert from "node:assert/strict";
import test from "node:test";
import {createGameState} from "../../src/game/gameState.ts";
import {GameStore} from "../../src/game/gameStore.ts";
import {createSave,parseSave} from "../../src/game/campaignSave.ts";
import {generateExpeditionLayout,dungeonNeighbors}
  from "../../src/game/dungeonLayout.ts";
import {emptySpatialDungeonWorld} from "../../src/game/spatialDungeonExploration.ts";
import {selectLiveBoardHeroes,liveBoardHeroesForFilter,committedDeathSignals}
  from "../../src/game/liveBoardProjection.ts";
import {DUNGEON_STEP_INTERVAL_TICKS}
  from "../../src/game/liveDungeonRuntime.ts";

test("LIVE Board never exposes hidden remote HP, loot, gear or a silent death",()=>{
  const base=createGameState(7351);
  const remote=base.adventurers.find(h=>h.status==="exploring")!;
  const observed=selectLiveBoardHeroes(base).find(h=>h.id===remote.id)!;
  assert.equal(observed.visible,null);
  assert.equal(observed.status,"last-seen");
  assert.equal(observed.report,null);
  const changed={...base,adventurers:base.adventurers.map(h=>
    h.id===remote.id?{...h,health:0,status:"dead" as const,
      gold:999999,equipment:{weapon:"Iron Sword" as const,
        armor:"Leather Vest" as const},
      inventory:{...h.inventory,finds:{"iron-ore":500}}}:h)};
  const after=selectLiveBoardHeroes(changed).find(h=>h.id===remote.id)!;
  assert.deepEqual(after,observed,
    "Raw real dungeon death/HP, coins, gear and loot must not leak.");
  assert.equal(liveBoardHeroesForFilter(changed,"fallen").some(h=>h.id===remote.id),false);
  assert.equal(liveBoardHeroesForFilter(changed,"active").some(h=>h.id===remote.id),true);
  const shop=selectLiveBoardHeroes(base).find(h=>h.visible)!;
  assert.equal(shop.visible?.status,"at-shop");
  assert.equal(shop.visible?.health,base.adventurers.find(h=>h.id===shop.id)?.health);
});

function realTrapDeath():{store:GameStore;id:string}{
  const seed=7351,initial=createGameState(seed);
  const layout=generateExpeditionLayout(seed,1);
  const feature=layout.features.find(f=>f.kind==="trap"&&
    dungeonNeighbors(layout,f).length>0);
  assert(feature);
  const approach=dungeonNeighbors(layout,feature)[0];
  const target=feature.z*layout.width+feature.x;
  const visited=layout.tiles.flatMap((tile,i)=>
    tile==="wall"||i===target?[]:[i]);
  const hero=initial.adventurers.find(h=>h.status==="exploring")!;
  const adventurers=initial.adventurers.map(h=>h.id===hero.id
    ?{...h,health:1,floor:1 as const,status:"exploring" as const}
    :h.status==="exploring"?{...h,floor:4 as const}:h);
  const world={...emptySpatialDungeonWorld(),heroes:[{
    heroId:hero.id,...approach,visited,
  }]};
  const store=new GameStore({...initial,adventurers,
    dungeonWorlds:[{floor:1 as const,world}]});
  return {store,id:hero.id};
}

test("a real lethal trap announces ONE magic loss without disclosing cause or coordinates",()=>{
  const {store,id}=realTrapDeath();
  store.enableLiveDungeon();
  store.advanceWorldTime(DUNGEON_STEP_INTERVAL_TICKS);
  const signals=committedDeathSignals(store.state);
  assert.equal(signals.length,1,"One actual zero-HP transition yields one alert.");
  assert.equal(signals[0].adventurerId,id);
  assert.equal(signals[0].worldTick,DUNGEON_STEP_INTERVAL_TICKS);
  assert(!/trap|floor|loot|room|spike|monster/i.test(signals[0].message),
    "Magical warning must not spoil an unobserved encounter.");
  const projected=selectLiveBoardHeroes(store.state).find(h=>h.id===id)!;
  assert.equal(projected.status,"lost");
  assert.equal(projected.visible,null);
  assert.equal(projected.report?.source,"magical-signal");
  assert.equal(projected.report?.occurredAtTick,signals[0].worldTick);
  assert.equal(liveBoardHeroesForFilter(store.state,"fallen").some(h=>h.id===id),true);
  const checkpoint=parseSave(JSON.stringify(createSave(store.state)));
  const resumed=new GameStore(checkpoint);
  store.advanceWorldTime(DUNGEON_STEP_INTERVAL_TICKS);
  resumed.advanceWorldTime(DUNGEON_STEP_INTERVAL_TICKS);
  assert.deepEqual(store.state,resumed.state);
  assert.equal(store.state.events.filter(e=>e.type==="hero-death-signal"&&
    e.adventurerId===id).length,1,"Sleeping or walking cannot kill twice.");
});

test("v22 rejects fake death alerts, IDs, timestamps and invented remote regions",()=>{
  const {store}=realTrapDeath();
  store.enableLiveDungeon();
  store.advanceWorldTime(DUNGEON_STEP_INTERVAL_TICKS);
  const original=createSave(store.state);
  const tamper=(change:(s:any)=>void,re:RegExp)=>{
    const mutated=structuredClone(original) as any;
    change(mutated.payload);
    assert.throws(()=>parseSave(JSON.stringify(mutated)),re);
  };
  tamper(s=>{s.events.find((e:any)=>e.type==="hero-death-signal").worldTick+=1;},/id/);
  tamper(s=>{s.events.find((e:any)=>e.type==="hero-death-signal").reportedZone="deep";},/reportedZone/);
  tamper(s=>{s.events.find((e:any)=>e.type==="dungeon-live").reportedZone="underground";},/reportedZone/);
  tamper(s=>{
    const e=s.events.find((e:any)=>e.type==="hero-death-signal");
    s.events.push({...e,id:e.id+":forged"});
  },/id/);
  tamper(s=>{
    const e=s.events.find((e:any)=>e.type==="hero-death-signal");
    const living=s.adventurers.find((h:any)=>h.health>0&&h.status==="exploring");
    assert(living);e.adventurerId=living.id;
    e.id="day-1:"+living.id+":hero-death-signal:"+e.worldTick;
  },/adventurerId/);
  assert.deepEqual(parseSave(JSON.stringify(original)),store.state);
});
