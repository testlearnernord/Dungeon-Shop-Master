import assert from "node:assert/strict";
import test from "node:test";
import {createCombatExposureTelemetry,createCampaignTelemetry} from "./campaign-progression-telemetry.mjs";

test("shared party footage counts one physical encounter and one entry per actual hero",()=>{
  const actors=[
    {id:"t",team:"heroes",role:"tank",hp:80,maxHp:100,equipment:{weapon:"Iron Sword",armor:"Leather Vest"}},
    {id:"d",team:"heroes",role:"DPS",hp:90,maxHp:100,equipment:{weapon:"Forged Spear",armor:"Ghoul Leather Vest"}},
    {id:"g",team:"monsters",role:"monster",hp:30,maxHp:30},
  ];
  const combat={actors,outcome:"heroes",frames:[{t:4,actors:[
    {id:"t",hp:0},{id:"d",hp:72},{id:"g",hp:0}
  ]}],cues:[
    {kind:"hit",actorId:"g",targetId:"t",amount:80},
    {kind:"hit",actorId:"g",targetId:"d",amount:18},
    {kind:"hit",actorId:"d",targetId:"g",amount:30},
    {kind:"parry",actorId:"t",targetId:"g"},
    {kind:"attack",actorId:"d",targetId:"g"},
  ]};
  const event=(heroId,worldTick=400,siteCycle=0)=>({type:"dungeon-live",day:1,worldTick,
    adventurerId:heroId,dungeonReplay:{floor:3,heroId,encounters:[{featureId:"ghoul:1",siteCycle,combat}]}});
  const exposure=createCombatExposureTelemetry();
  exposure.observe([event("t"),event("d"),event("t",600,1),event("d",600,1)]);
  const report=exposure.report();
  assert.equal(report.encounters,2);
  assert.equal(report.participants,4);
  assert.deepEqual(report.encounterOutcomes,{heroes:2});
  assert.equal(report.byRole.tank.deaths,2);
  assert.equal(report.byRole.tank.wins,0);
  assert.equal(report.byRole.tank.damageReceived,160);
  assert.equal(report.byRole.tank.parries,2);
  assert.equal(report.byRole.DPS.wins,2);
  assert.equal(report.byRole.DPS.damageDealt,60);
  assert.equal(report.byRole.DPS.deathShare,0);
  assert.equal(report.byLoadout["DPS:W2/A2"].entries,2);
  assert.equal(report.byContext["tank:1-3:party-2:W1/A1"].entries,2);
  assert.equal(report.byParty["DPS:party-2"].meanExitHpRatio,.72);
});

test("invalid or off-class gear never counts as a real upgrade and bosses are excluded",()=>{
  const exposure=createCombatExposureTelemetry();
  const combat={actors:[
    {id:"h",team:"heroes",role:"DPS",hp:80,maxHp:100,equipment:{weapon:"Forged Staff",armor:null}},
    {id:"g",team:"monsters",role:"monster",hp:30,maxHp:30},
  ],outcome:"draw",frames:[{t:25,actors:[{id:"h",hp:12},{id:"g",hp:5}]}],cues:[]};
  exposure.observe([3,10].map(floor=>({type:"dungeon-live",day:1,worldTick:400,
    dungeonReplay:{floor,encounters:[{featureId:"g",combat}]}})));
  const report=exposure.report();
  assert.equal(report.encounters,1);
  assert.equal(report.byLoadout["DPS:W0/A0"].draws,1);
  assert.equal(report.byRole.DPS.deaths,0);
});

test("stair reversal telemetry counts actual participants and excludes slow or unrelated crossings",()=>{
  const telemetry=createCampaignTelemetry(7351);
  const crossing=(floor,action,tick,memberIds=["a","b"])=>telemetry.observe({
    stage:"depth-crossing",floor,action,tick,day:1,heroId:memberIds[0],
    memberIds,checks:{accepted:true}});
  crossing(5,"descend",200);
  crossing(6,"ascend",600);
  crossing(5,"descend",1000,["a"]);
  crossing(6,"ascend",1800,["a"]);
  crossing(4,"descend",2000,["a"]);
  telemetry.observe({stage:"depth-route",floor:5,action:"ascend",tick:2200,
    heroId:"a",memberIds:["a"],checks:{accepted:true}});
  const result=telemetry.report().crossingStability;
  assert.equal(result.participantCrossings,7);
  assert.deepEqual(result.rapidReversals,{"5-6":3});
});
