import test from "node:test";
import assert from "node:assert/strict";
import {eventGroup,groupedDayEvents,dayReportMetrics}
  from "../../src/game/dayReportView.ts";
import type {WorldEvent} from "../../src/game/gameState.ts";
const event=(type:WorldEvent["type"],extra:Partial<WorldEvent>={}):WorldEvent=>
  ({id:type,day:4,message:"",type,...extra});
test("day report groups actual economic, visitor, survival and dungeon events",()=>{
  const events=[
    event("sale",{revenue:14,quantity:3}),
    event("shop-arrival"),
    event("level6-combat"),
    event("shop-credit",{debtGold:7}),
    event("healed"),event("sale",{revenue:4,quantity:1}),
  ];
  assert.deepEqual(groupedDayEvents(events).map(x=>[x.group,x.events.length]),[
    ["trade",3],["visitors",1],["expeditions",1],["survival",1],
  ]);
  assert.deepEqual(dayReportMetrics(events),{
    revenue:18,units:4,arrivals:1,expeditionEvents:1,loans:7,
  });
  assert.equal(eventGroup("level7-exploration"),"expeditions");
  assert.equal(eventGroup("shop-walkout"),"visitors");
});
