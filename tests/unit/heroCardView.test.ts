import assert from "node:assert/strict";
import test from "node:test";
import {createGameState} from "../../src/game/gameState.ts";
import {liveHeroCard,combatHeroCard,heroXpProgress,liveRosterCards}
  from "../../src/game/heroCardView.ts";
import type {CombatantSpec,GroupReplayFrame}
  from "../../src/game/groupCombat.ts";

test("World Wide Hero Card live projection has real gear, stats, gold and stable identity",()=>{
  const state=createGameState(7351),hero=state.adventurers[0];
  const before=JSON.stringify(state);
  const view=liveHeroCard(state,hero.id)!;
  assert.equal(view.id,hero.id);
  assert.equal(view.name,hero.name);
  assert.equal(view.level,hero.level);
  assert.equal(view.health,hero.health);
  assert.equal(view.maxHealth,hero.stats.maxHealth);
  assert.deepEqual(view.equipment,hero.equipment);
  assert.deepEqual(view.stats,hero.stats);
  assert.equal(view.gold,hero.gold);
  assert.equal(view.source,"live");
  assert.equal(JSON.stringify(state),before,
    "Opening a card cannot mutate the authoritative campaign");
  assert.equal(liveHeroCard(state,"not-a-saved-hero"),null);
});

test("historical actor card never fills missing identity stats from today's roster",()=>{
  const state=createGameState(7351),hero=state.adventurers[0];
  const actor={
    id:hero.id,team:"heroes",role:hero.role,style:"melee",
    x:0,z:0,hp:34,maxHp:48,damage:9,armor:3,speed:3,reach:2,
    equipment:{weapon:"Iron Sword",armor:"Leather Vest"},
  } as CombatantSpec;
  const frame={t:1.2,actors:[{
    id:hero.id,x:0,z:0,hp:21,stamina:67,heading:0,phase:"parry",
  }],projectiles:[]} as GroupReplayFrame;
  const historical=combatHeroCard(actor,frame,{name:hero.name});
  assert.equal(historical.source,"recorded");
  assert.equal(historical.health,21);
  assert.equal(historical.maxHealth,48);
  assert.deepEqual(historical.equipment,{
    weapon:"Iron Sword",armor:"Leather Vest",
  });
  assert.equal(historical.combat?.phase,"parry");
  assert.equal(historical.combat?.damage,9);
  assert.equal(historical.combat?.armor,3);
  for(const field of ["level","xp","gold","floor","stats","traits","inventory"] as const)
    assert.equal(historical[field],null,field+" was not recorded");
  const live=combatHeroCard(actor,frame,{name:hero.name,liveHero:hero});
  assert.equal(live.source,"live");
  assert.deepEqual(live.stats,hero.stats);
  assert.equal(live.level,hero.level);
});

test("experience progress remains cosmetic and bounded",()=>{
  assert.equal(heroXpProgress(null),null);
  assert.equal(heroXpProgress(0),0);
  assert.equal(heroXpProgress(235),35);
  assert.equal(heroXpProgress(1000),0);
});

test("shared LIVE roster shows current remote facts and excludes actual fallen heroes",()=>{
  const state=createGameState(7351);
  const remote=state.adventurers.find(h=>h.status==="exploring")!;
  const updated={...state,adventurers:state.adventurers.map(h=>h.id===remote.id?{...h,health:17}:h)};
  const view=liveRosterCards(updated,"active").find(h=>h.id===remote.id)!;
  assert.equal(view.health,17);
  assert.equal(view.floor,remote.floor);
  assert.deepEqual(view.equipment,remote.equipment);
  const fallen={...updated,adventurers:updated.adventurers.map(h=>h.id===remote.id?{...h,health:0,status:"dead" as const}:h)};
  assert(!liveRosterCards(fallen,"active").some(h=>h.id===remote.id));
  assert.equal(liveRosterCards(fallen,"fallen")[0].id,remote.id);
});
