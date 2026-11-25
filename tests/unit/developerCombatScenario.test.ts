import assert from "node:assert/strict";
import test from "node:test";
import {createGameState} from "../../src/game/gameState.ts";
import {
  buildDeveloperCombat,developerHeroFromRoster,randomDeveloperHeroes,
  DEFAULT_DEVELOPER_CONFIG,validateDeveloperCombat,
  type DeveloperCombatConfig,
} from "../../src/game/developerCombatScenario.ts";
import {resolveGroupCombat,createGroupCombat,stepGroupCombat}
  from "../../src/game/groupCombat.ts";

test("developer lab defaults to a real solo Troll and never mutates campaign state",()=>{
  const campaign=createGameState(7351);
  const saved=structuredClone(campaign);
  const options=buildDeveloperCombat(DEFAULT_DEVELOPER_CONFIG);
  assert.equal(options.actors.length,2);
  assert.equal(options.actors.filter(a=>a.specialAbility==="grapple-throw").length,1);
  const state=createGroupCombat(options);
  for(let i=0;i<60;i++)stepGroupCombat(state);
  assert.equal(state.time,1.0000000000000013);
  assert.deepEqual(campaign,saved);
});

test("developer fixture supports 3 custom heroes against 3 real independent Ghouls",()=>{
  const heroes=randomDeveloperHeroes(654321,3);
  const config:DeveloperCombatConfig={arena:"crypt",enemy:"ghoul",
    enemyCount:3,heroes,seed:654321};
  assert.deepEqual(randomDeveloperHeroes(654321,3),heroes);
  assert.notDeepEqual(randomDeveloperHeroes(654322,3),heroes);
  const opts=buildDeveloperCombat(config);
  assert.equal(opts.actors.length,6);
  assert.equal(opts.actors.filter(a=>a.team==="heroes").length,3);
  assert.equal(opts.actors.filter(a=>a.team==="monsters").length,3);
  assert.equal(new Set(opts.actors.map(a=>a.id)).size,6);
  const first=resolveGroupCombat(opts,25);
  const repeated=resolveGroupCombat(opts,25);
  assert.deepEqual(first,repeated);
  assert(first.replay.frames.every(frame=>frame.actors.length===6));
  assert(first.replay.cues.some(c=>["attack","cast","hit"].includes(c.kind)));
});

test("roster import takes a value snapshot, and editable test values are validated",()=>{
  const campaign=createGameState(7351),original=structuredClone(campaign);
  const hero=developerHeroFromRoster(campaign.adventurers[0]);
  assert.equal(hero.maxHp,campaign.adventurers[0].stats.maxHealth);
  assert.equal(hero.role,campaign.adventurers[0].role);
  const options=buildDeveloperCombat({
    ...DEFAULT_DEVELOPER_CONFIG,heroes:[{...hero,damage:201,maxHp:350}],
  });
  assert.equal(options.actors[0].maxHp,350);
  assert.equal(options.actors[0].damage,201);
  assert.deepEqual(campaign,original);
  assert.throws(()=>validateDeveloperCombat({
    ...DEFAULT_DEVELOPER_CONFIG,enemy:"cave-troll",enemyCount:2,
  }),/Troll/);
  assert.throws(()=>validateDeveloperCombat({
    ...DEFAULT_DEVELOPER_CONFIG,heroes:[{...hero,damage:-1}],
  }),/attributes/);
  assert.throws(()=>validateDeveloperCombat({
    ...DEFAULT_DEVELOPER_CONFIG,seed:-1,
  }),/seed/);
});


test("Lab Ghoul profiles match LIVE seeded site strength on every ordinary floor",()=>{
  const campaign=createGameState(7351);
  for(const floor of [1,2,3,4,5,6,7,8,9] as const){
    const layout=generateExpeditionLayout(campaign.seed,floor);
    const site=layout.features.find(f=>f.kind==="monster"&&dungeonNeighbors(layout,f).length>0)!;
    assert(site);
    const seed=dungeonGenerationSeed((campaign.seed^Math.imul(site.x+37*site.z,2654435761))>>>0,0);
    const live=prepareSpatialDungeonCombat([campaign.adventurers[0]],site,campaign.seed,layout,dungeonNeighbors(layout,site)[0],0,true);
    const lab=buildDeveloperCombat({...DEFAULT_DEVELOPER_CONFIG,enemy:"ghoul",arena:"crypt",ghoulFloor:floor,seed});
    const {id,x,z,...labProfile}=lab.actors.find(a=>a.team==="monsters")!;
    const {id:liveId,x:liveX,z:liveZ,...liveProfile}=live.options.actors.find(a=>a.team==="monsters")!;
    assert.deepEqual(labProfile,liveProfile,"Floor "+floor);
  }
});
