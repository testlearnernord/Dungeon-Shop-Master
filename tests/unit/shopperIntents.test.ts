import assert from "node:assert/strict";
import test from "node:test";
import { createGameState, advanceDay } from "../../src/game/gameState.ts";
import { forecastShoppingIntents } from "../../src/game/shopperIntents.ts";
import { createShopLayout, replaceShelfPlacement, rotateShelfOffset } from "../../src/game/shopLayout.ts";
import { isObstructed, pathToShopGoal, shopSegmentClear } from "../../src/game/shopperNavigation.ts";

function prepared() {
  const state=createGameState(7351);
  return {
    ...state,
    adventurers:state.adventurers.map((hero,i)=>
      i<3?{...hero,status:"at-shop" as const, floor:5 as const,
        gold:i===0?100:i===1?8:0,
        health:i===0?Math.max(1,hero.health-20):hero.health,
        inventory:{...hero.inventory,food:0,healing:0},
        equipment:{weapon:null,armor:null}}:hero),
  };
}
test("read-only projected shopping decisions equal actual confirmed day sales",()=>{
  const state=prepared();
  const pristine=structuredClone(state);
  const plans=forecastShoppingIntents(state);
  assert.deepEqual(state,pristine,"Planning must not mutate shop, hero, RNG or inventory");
  assert.deepEqual(forecastShoppingIntents(state),plans);
  const actual=advanceDay(state).events.filter(event=>event.type==="sale");
  const predicted=[...plans.values()].flatMap(plan=>plan.items.map(item=>({
    heroId:plan.heroId,slotId:item.slotId,itemId:item.itemId,
    quantity:item.quantity,revenue:item.subtotal,
  })));
  const booked=actual.map(event=>({
    heroId:event.adventurerId,
    slotId:event.id.substring(event.id.lastIndexOf(":sale:")+6),
    itemId:event.itemId,
    quantity:event.quantity,
    revenue:event.revenue,
  }));
  assert.deepEqual(predicted,booked,"No second AI with different needs, stock or buying order");
  assert(predicted.some(entry=>entry.itemId==="bread"));
  assert(predicted.every(entry=>entry.quantity!>0&&entry.revenue!>0));
  assert.equal(state.shopEconomy.balance,pristine.shopEconomy.balance);
});
test("broke heroes don't get imaginary purchases, stock never oversells",()=>{
  const state=prepared();
  const plans=forecastShoppingIntents(state);
  const broke=state.adventurers[2];
  assert.equal(broke.gold,0);
  assert.equal(plans.get(broke.id)?.items.length,0);
  assert.equal(plans.get(broke.id)?.reason,"cannot-afford");
  const first=plans.get(state.adventurers[0].id)!;
  assert(first.items.length>0);
  for(const slot of state.shopEconomy.slots){
    const planned=[...plans.values()].flatMap(p=>p.items)
      .filter(item=>item.slotId===slot.id).reduce((sum,item)=>sum+item.quantity,0);
    assert(planned<=slot.quantity,"Stock cannot be promised to two buyers");
  }
});
test("relocating a shelf reroutes the forecast but does not change pricing, sales or the RPG",()=>{
  const state=prepared();
  const original=forecastShoppingIntents(state);
  const moved=replaceShelfPlacement(state.shopLayout,{
    id:"shelf-1",x:0,z:-2,rotation:1,
  });
  assert.equal(moved.message,"Shelf placement saved.");
  assert.deepEqual(forecastShoppingIntents({...state,shopLayout:moved.layout}),original);
  assert.deepEqual(advanceDay({...state,shopLayout:moved.layout}).state.shopEconomy,
    advanceDay(state).state.shopEconomy);
  const target=rotateShelfOffset(1.75,-1,1);
  const route=pathToShopGoal({x:-4,z:6},{x:target.x,z:target.z-2},moved.layout);
  assert(route&&route.waypoints.length>0);
  for(const step of route.waypoints)assert.equal(isObstructed(step,moved.layout),false);
});
test("shop grid avoids walls and the counter, with stable no-diagonal route choices",()=>{
  const layout=createShopLayout();
  const cases=[
    [{x:-4,z:6},{x:-5.25,z:-1}],
    [{x:4,z:6},{x:5.25,z:1}],
    [{x:-5.25,z:-1},{x:-2.2,z:4.0}],
  ] as const;
  for(const [start,goal] of cases){
    const route=pathToShopGoal(start,goal,layout);
    assert(route,"The standard shelf must be accessible to customers");
    assert.deepEqual(route,pathToShopGoal(start,goal,layout));
    assert(route!.waypoints.length>0);
    let previous=start;
    for(const waypoint of route!.waypoints){
      assert.equal(isObstructed(waypoint,layout),false);
      // Each straight segment must remain in walkable space.
      const length=Math.hypot(waypoint.x-previous.x,waypoint.z-previous.z);
      for(let i=1;i<=Math.ceil(length*8);i++){
        const t=i/Math.ceil(length*8);
        assert.equal(isObstructed({
          x:previous.x+(waypoint.x-previous.x)*t,
          z:previous.z+(waypoint.z-previous.z)*t,
        },layout),false);
      }
      previous=waypoint;
    }
  }
  assert.equal(pathToShopGoal({x:Infinity,z:0},{x:0,z:0},layout),null);
  assert.equal(pathToShopGoal({x:100,z:100},{x:0,z:0},layout),null);
});

test("Copilot regression: a replan mid-segment never cuts across a rotated shelf",()=>{
  const base=createShopLayout();
  const result=replaceShelfPlacement(base,{id:"shelf-1",x:0,z:-2,rotation:1});
  assert.equal(result.message,"Shelf placement saved.");
  const layout=result.layout;
  const cases=[
    [{x:-3.3,z:-1.4},{x:-1,z:-3.75}], // mid-stride pickup destination
    [{x:-1,z:-3.75},{x:-4,z:6}],       // leave for the Level 4 corridor
    [{x:-1,z:-3.75},{x:4,z:6}],        // leave for the Level 6 corridor
  ] as const;
  for(const [start,goal] of cases){
    const route=pathToShopGoal(start,goal,layout);
    assert(route,JSON.stringify({start,goal})+" must be navigable");
    let previous=start;
    for(const point of route!.waypoints){
      assert(shopSegmentClear(previous,point,layout),
        "A continuous segment crossed furniture: "+JSON.stringify({previous,point}));
      previous=point;
    }
    const final=route!.waypoints.at(-1)!;
    assert(Math.hypot(final.x-goal.x,final.z-goal.z)<0.6,
      "Route must actually reach the requested shelf/corridor, not a distant substitute");
  }
  assert.equal(shopSegmentClear({x:-3.3,z:-1.4},{x:-1,z:-3.75},layout),false,
    "The original shortcut must remain rejected");
});
