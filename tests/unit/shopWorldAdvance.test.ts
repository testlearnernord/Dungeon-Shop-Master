import assert from "node:assert/strict";
import test from "node:test";
import {advancePhysicalShopWorldTicks} from "../../src/game/shopWorldAdvance.ts";
import {createGameState} from "../../src/game/gameState.ts";
import {GameStore} from "../../src/game/gameStore.ts";
import {lastWorldTickOfDay} from "../../src/game/worldClock.ts";

test("world events and actual movement interleave identically regardless of frame grouping",()=>{
  const simulate=(batches:number[])=>{
    const store=new GameStore(createGameState());
    const history:string[]=[];
    for(const batch of batches)advancePhysicalShopWorldTicks(batch,
      ()=>store.state.worldClock.tick,
      ()=>{store.advanceWorldTime(1);history.push("time:"+store.state.worldClock.tick);},
      ()=>history.push("shop:"+store.state.worldClock.tick));
    return {clock:store.state.worldClock.tick,history};
  };
  assert.deepEqual(simulate([8,8,4]),simulate(Array(20).fill(1)));
});

test("no physical traffic after midnight cap; invalid nonmonotonic clocks throw",()=>{
  let tick=lastWorldTickOfDay(1)-1;
  let moved=0;
  const advanced=advancePhysicalShopWorldTicks(8,()=>tick,
    ()=>{tick=Math.min(lastWorldTickOfDay(1),tick+1);},()=>moved++);
  assert.equal(advanced,1);
  assert.equal(moved,1);
  assert.throws(()=>advancePhysicalShopWorldTicks(1,()=>tick,
    ()=>{tick+=2;},()=>moved++),/exactly one/);
  assert.throws(()=>advancePhysicalShopWorldTicks(9,()=>tick,()=>{},()=>{}),/bounded/);
});
