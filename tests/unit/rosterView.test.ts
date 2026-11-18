import assert from "node:assert/strict";
import test from "node:test";
import { advanceDay, createGameState } from "../../src/game/gameState.ts";
import {
  locationLabel, partySizeLabel, portraitIndex, rosterEntries, rosterPartyDetails,
  rosterBoardEquipment,
} from "../../src/game/rosterView.ts";

test("roster entries show shop visitors first and stable portrait IDs", () => {
  const state = createGameState();
  const active = rosterEntries(state, "active");
  assert.equal(active.length, 10);
  assert(active.slice(0, 3).every((hero) => hero.status === "at-shop"));
  assert.equal(portraitIndex("adventurer-1"), 0);
  assert.equal(portraitIndex("adventurer-25"), 24);
  assert.equal(portraitIndex("adventurer-26"), 0);
  assert.equal(locationLabel(active[0]), "F5 · Shop");
  assert.equal(rosterEntries(state, "fallen").length, 0);
  assert.equal(state.rngState, createGameState().rngState);
});

test("roster read views do not mutate campaign state and remain bounded after long play", () => {
  let state = createGameState();
  for (let day = 0; day < 220; day++) state = advanceDay(state).state;
  const snapshot = structuredClone(state);
  const active = rosterEntries(state, "active");
  const fallen = rosterEntries(state, "fallen");
  assert(active.length <= state.populationConfig.maxActive);
  assert(fallen.length <= 40);
  assert(fallen.every((hero) => hero.status === "dead"));
  assert.deepEqual(state, snapshot);
  assert.deepEqual(rosterEntries(state, "active").map((hero) => hero.id), active.map((hero) => hero.id));
});

test("fallen roster is ordered by latest event before limiting to 40 heroes", () => {
  const state = createGameState();
  const heroes = Array.from({ length: 41 }, (_, index) => ({
    ...state.adventurers[0],
    id: `adventurer-${index + 1}`,
    status: "dead" as const,
  }));
  const deaths = [...heroes.slice(1), heroes[0]].map((hero, index) => ({
    id: `death-${index}`,
    type: "dungeon-outcome" as const,
    outcome:"death" as const,
    day: index + 1,
    message: `${hero.name} died.`,
    adventurerId: hero.id,
  }));
  const fallen = rosterEntries({ ...state, adventurers: heroes, events: deaths }, "fallen");

  assert.equal(fallen.length, 40);
  assert.equal(fallen[0].id, "adventurer-1");
  assert.equal(fallen.at(-1)?.id, "adventurer-3");
  assert(!fallen.some((hero) => hero.id === "adventurer-2"));
});

test("saved travel companions reveal identities, health and founding day without inventing a party",()=>{
  const initial=createGameState(7351);
  const first=initial.adventurers[0],second=initial.adventurers[1];
  const state={...initial,
    adventurers:initial.adventurers.map(hero=>[first.id,second.id].includes(hero.id)
      ?{...hero, status:"exploring" as const,floor:1 as const}:hero),
    dungeonParties:[{memberIds:[first.id,second.id],floor:1 as const,formedDay:1}],
  };
  const frozen=structuredClone(state);
  const details=rosterPartyDetails(state,first.id);
  assert.equal(details?.floor,1);
  assert.equal(details?.formedDay,1);
  assert.deepEqual(details?.members.map(hero=>hero.id),[first.id,second.id]);
  assert.equal(details?.members[1].health,second.health);
  assert.equal(details?.members[1].stats.maxHealth,second.stats.maxHealth);
  assert.equal(partySizeLabel(state,first.id)," · Temporary Party #1 (2)");
  assert.equal(partySizeLabel(state,second.id)," · Temporary Party #1 (2)");
  assert.equal(rosterPartyDetails(state,initial.adventurers[2].id),null);
  assert.equal(rosterPartyDetails(initial,first.id),null,
    "Sharing a floor without a saved relationship is not friendship");
  assert.deepEqual(state,frozen,"Read-only roster projections never mutate game state");

  const malformed={...state,dungeonParties:[{
    memberIds:[first.id,initial.adventurers[2].id],floor:1 as const,formedDay:1,
  }]};
  assert.equal(rosterPartyDetails(malformed,first.id),null,
    "A broken relationship must not be advertised on the board");
  assert.equal(partySizeLabel(malformed,first.id),"");
});

test("board shows only genuine weapon and armor slots plus exact numeric HP",()=>{
  const state=createGameState(7351),hero=state.adventurers[0];
  assert.deepEqual(rosterBoardEquipment(hero),{
    weapon:false,armor:false,hp:hero.health+"/"+hero.stats.maxHealth,
  });
  const equipped={...hero,health:hero.stats.maxHealth-7,
    equipment:{weapon:"Iron Sword",armor:"Leather Vest"}};
  assert.deepEqual(rosterBoardEquipment(equipped),{
    weapon:true,armor:true,hp:equipped.health+"/"+hero.stats.maxHealth,
  });
  assert.deepEqual(rosterBoardEquipment({...equipped,
    equipment:{weapon:null,armor:"Leather Vest"}}),{
    weapon:false,armor:true,hp:equipped.health+"/"+hero.stats.maxHealth,
  });
});
