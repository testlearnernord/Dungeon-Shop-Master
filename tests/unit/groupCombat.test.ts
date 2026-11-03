import assert from "node:assert/strict";
import test from "node:test";
import {
  createGroupCombat, resolveGroupCombat, stepGroupCombat,
  type CombatantSpec, type GroupCombatOptions,
} from "../../src/game/groupCombat.ts";

const bounds = { minX: -12, maxX: 12, minZ: -12, maxZ: 12 };
const fighter = (id: string, team: "heroes" | "monsters", x: number, z: number,
  overrides: Partial<CombatantSpec> = {}): CombatantSpec => ({
  id, team, role: team === "heroes" ? "DPS" : "monster",
  style: "melee", x, z, hp: 75, maxHp: 75,
  damage: 12, armor: 2, speed: 2.8, reach: 1.4,
  ...overrides,
});

test("multi-actor simulation is deterministic regardless of input actor ordering", () => {
  const actors = [
    fighter("tank", "heroes", -4, 0, {
      role: "tank", hp: 100, maxHp: 100, damage: 15, armor: 5, speed: 2.4,
    }),
    fighter("archer", "heroes", -5, -3, {
      style: "ranged", damage: 9, speed: 3.2,
    }),
    fighter("healer", "heroes", -6, 3, {
      role: "healer", style: "ranged", damage: 6, healCharges: 2,
    }),
    fighter("goblin", "monsters", 3, -1, { hp: 50, maxHp: 50, damage: 10 }),
    fighter("skeleton", "monsters", 4, 2, { hp: 55, maxHp: 55, damage: 9 }),
  ];
  const a = resolveGroupCombat({actors,bounds}, 28);
  const b = resolveGroupCombat({actors: [...actors].reverse(),bounds}, 28);
  assert.deepEqual(a.state.actors,b.state.actors);
  assert.deepEqual(a.replay.frames,b.replay.frames);
  assert.deepEqual(a.replay.cues,b.replay.cues);
  assert.equal(a.replay.outcome,a.state.outcome);
  assert(a.state.events.some(e => e.kind === "hit" || e.kind === "parry"),
    "At least one attack must physically connect");
  assert(a.state.actors.some(actor => actor.distanceTraveled > 2),
    "Actors must move in world space, not just attack from spawn");
  assert(a.replay.frames.length <= 282, "Recorded frames should be bounded at 10Hz");
  assert(a.replay.frames.every(frame => frame.actors.length === 5));
});

function imminentMonsterStrike() {
  const s = createGroupCombat({ bounds, actors: [
    fighter("hero", "heroes", 0, 0, { role:"tank", hp:100,maxHp:100,armor:0 }),
    fighter("monster", "monsters", 0, 2.1, { damage:18,armor:0 }),
  ]});
  const hero=s.actors.find(x=>x.id==="hero")!;
  const monster=s.actors.find(x=>x.id==="monster")!;
  monster.phase="strike"; monster.phaseAge=0.16; monster.lockedHeading=Math.PI;
  monster.targetId=hero.id; monster.applied=false;
  return {s,hero,monster};
}

test("active-frame strike applies damage once, never off arc or out of range", () => {
  const {s,hero,monster}=imminentMonsterStrike();
  const event=stepGroupCombat(s);
  assert.equal(hero.hp,82);
  assert(event.some(e=>e.kind==="hit"&&e.targetId==="hero"&&e.amount===18));
  for(let i=0;i<10;i++)stepGroupCombat(s);
  assert.equal(hero.hp,82,"An attack cannot apply damage each frame");
  assert(monster.hp>0);

  const back=imminentMonsterStrike();
  back.monster.lockedHeading=0;
  stepGroupCombat(back.s);
  assert.equal(back.hero.hp,100);
  assert(back.s.events.some(e=>e.kind==="miss"));
});

test("actual roll/parry invulnerability and facing use the same geometry as Level 6", () => {
  const roll=imminentMonsterStrike();
  roll.hero.phase="roll"; roll.hero.phaseAge=0.20;
  stepGroupCombat(roll.s);
  assert.equal(roll.hero.hp,100);
  assert(roll.s.events.some(e=>e.kind==="dodge"));

  const parry=imminentMonsterStrike();
  parry.hero.phase="parry"; parry.hero.phaseAge=0.20;
  parry.hero.heading=0;
  stepGroupCombat(parry.s);
  assert.equal(parry.hero.hp,100);
  assert.equal(parry.monster.phase,"hurt");
  assert(parry.s.events.some(e=>e.kind==="parry"));

  const late=imminentMonsterStrike();
  late.hero.phase="parry"; late.hero.phaseAge=0.41;
  late.hero.heading=0;
  stepGroupCombat(late.s);
  assert(late.hero.hp<100);
});

test("finite healer charges restore real teammate HP without reviving dead actors", () => {
  const s=createGroupCombat({bounds,actors:[
    fighter("a-injured","heroes",-3,0,{hp:18,maxHp:100,armor:6,damage:6}),
    fighter("b-healer","heroes",-4,1,{role:"healer",style:"ranged",healCharges:1,
      hp:70,maxHp:70}),
    fighter("z-monster","monsters",9,9,{hp:300,maxHp:300,speed:0,damage:1}),
  ]});
  const patient=s.actors.find(a=>a.id==="a-injured")!;
  const doctor=s.actors.find(a=>a.id==="b-healer")!;
  for(let i=0;i<70;i++)stepGroupCombat(s);
  assert(patient.hp>18,"Healing must resolve on a timed action");
  assert.equal(doctor.healCharges,0);
  assert.equal(s.events.filter(e=>e.kind==="heal").length,1);
  assert(s.events.some(e=>e.kind==="heal"&&e.targetId==="a-injured"));
});

test("walls physically prevent traversal and block fast-moving projectiles", () => {
  const wall={id:"stone-wall",minX:-0.4,maxX:0.4,minZ:-7,maxZ:7};
  const s=createGroupCombat({bounds,obstacles:[wall],actors:[
    fighter("hero","heroes",-3,0,{style:"ranged",hp:90,maxHp:90,damage:16}),
    fighter("monster","monsters",3,0,{hp:90,maxHp:90,damage:16}),
  ]});
  for(let i=0;i<600;i++)stepGroupCombat(s);
  assert(s.actors.find(a=>a.id==="hero")!.x < -0.8);
  assert(s.actors.find(a=>a.id==="monster")!.x > 0.8);
  assert.equal(s.actors.find(a=>a.id==="hero")!.hp,90);
  assert.equal(s.actors.find(a=>a.id==="monster")!.hp,90);
  s.projectiles.push({ownerId:"hero",team:"heroes",x:-2,z:0,vx:180,vz:0,
    damage:35,ttl:1});
  const batch=stepGroupCombat(s);
  assert(batch.some(e=>e.kind==="blocked"));
  assert.equal(s.projectiles.length,0);
  assert.equal(s.actors.find(a=>a.id==="monster")!.hp,90);
});

test("projectiles cannot damage allies; deaths finish the encounter once", () => {
  const s=createGroupCombat({bounds,actors:[
    fighter("hero","heroes",-3,0,{hp:100,maxHp:100,style:"ranged"}),
    fighter("friend","heroes",0,0,{hp:100,maxHp:100}),
    fighter("monster","monsters",2.5,0,{hp:8,maxHp:8,armor:0,speed:0}),
  ]});
  s.projectiles.push({ownerId:"hero",team:"heroes",x:-2,z:0,vx:360,vz:0,
    damage:12,ttl:1});
  const initialFriend=s.actors.find(a=>a.id==="friend")!.hp;
  stepGroupCombat(s);
  assert.equal(s.actors.find(a=>a.id==="friend")!.hp,initialFriend);
  assert.equal(s.actors.find(a=>a.id==="monster")!.hp,0);
  assert.equal(s.outcome,"heroes");
  assert(s.events.some(e=>e.kind==="death"&&e.actorId==="monster"));
  const finishedEvents=s.events.length;
  assert.deepEqual(stepGroupCombat(s),[]);
  assert.equal(s.events.length,finishedEvents);
});

test("malformed actors/obstacles and unbounded replays are rejected", () => {
  const actors=[
    fighter("hero","heroes",-3,0),
    fighter("goblin","monsters",3,0),
  ];
  assert.throws(()=>createGroupCombat({bounds,actors:[actors[0],actors[0]]}),/Duplicate/);
  assert.throws(()=>createGroupCombat({bounds,actors:actors.map(a=>({...a,team:"heroes"}))}),/Both/);
  assert.doesNotThrow(()=>createGroupCombat({bounds,actors,obstacles:[{
    id:"wall",minX:-1,maxX:1,minZ:-1,maxZ:1,
  }]}),"Small dungeon walls are valid obstacles");
  assert.throws(()=>resolveGroupCombat({bounds,actors},91),/bounded/);
  assert.throws(()=>createGroupCombat({bounds,actors:[
    {...actors[0],x:NaN},actors[1],
  ]}),/outside arena/);
});
