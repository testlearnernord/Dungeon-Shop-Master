import assert from "node:assert/strict";
import test from "node:test";
import {
  createGroupCombat, resolveGroupCombat, stepGroupCombat, captureGroupCombatFrame,
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
    fighter("monster", "monsters", 0, 1.7, { damage:18,armor:0 }),
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

test("a wounded unarmed DPS and tank can use purchased Herbs, not magic or imaginary stock",()=>{
  for(const role of ["DPS","tank"] as const){
    const s=createGroupCombat({bounds,actors:[
      fighter("hero","heroes",-3,0,{
        role,style:"melee",hp:30,maxHp:100,healCharges:1,
        damage:8,armor:2,speed:2.8,
      }),
      fighter("monster","monsters",9,9,{
        hp:180,maxHp:180,speed:0,damage:1,
      }),
    ]});
    const hero=s.actors.find(actor=>actor.id==="hero")!;
    for(let i=0;i<65;i++) stepGroupCombat(s);
    const uses=s.events.filter(cue=>cue.kind==="heal"&&cue.actorId==="hero");
    assert.equal(uses.length,1,role+" consumes one physically owned herb");
    assert.equal(uses[0].amount,18);
    assert.equal(uses[0].targetId,"hero");
    assert.equal(hero.healCharges,0);
    assert(hero.hp>=48,"healing really changes persistent combat HP");
  }
  const bare=createGroupCombat({bounds,actors:[
    fighter("hero","heroes",-3,0,{role:"healer",hp:30,maxHp:100}),
    fighter("monster","monsters",9,9,{speed:0}),
  ]});
  for(let i=0;i<65;i++)stepGroupCombat(bare);
  assert.equal(bare.actors.find(actor=>actor.id==="hero")!.healCharges,0);
  assert.equal(bare.events.filter(cue=>cue.kind==="heal").length,0,
    "a healer must not magically mint an item that was never bought");
});

test("a tank usually parries but can dodge the same telegraphed Troll attack",()=>{
  const choices:string[]=[];
  for(let attackNumber=1;attackNumber<=24;attackNumber++){
    const state=createGroupCombat({bounds,actors:[
      fighter("lab-hero-1","heroes",0,0,{
        role:"tank",style:"melee",hp:120,maxHp:120,
        equipment:{weapon:"Iron Sword",armor:"Leather Vest"},
      }),
      fighter("lab-cave-troll","monsters",0,3,{
        hp:280,maxHp:280,role:"monster",radius:1.8,
        specialAbility:"grapple-throw",agility:7,
      }),
    ]});
    const troll=state.actors.find(a=>a.id==="lab-cave-troll")!;
    troll.phase="windup";troll.phaseAge=.72;troll.lockedHeading=Math.PI;
    troll.activeMeleeAbility="troll-smash";
    troll.attacksStarted=attackNumber;
    const hero=state.actors.find(a=>a.id==="lab-hero-1")!;
    stepGroupCombat(state);
    choices.push(hero.phase);
  }
  assert(choices.filter(phase=>phase==="parry").length>=12,
    "shield-first tanks should mostly parry");
  assert(choices.some(phase=>phase==="roll"),
    "a tank must retain actual timed dodge movement");
});

test("the real cave arena damages a boundary-crossing hero, but crypt does not",()=>{
  const actors=[
    fighter("hero","heroes",14.5,10,{role:"tank",hp:100,maxHp:100}),
    fighter("boss","monsters",0,0,{specialAbility:"grapple-throw",
      hp:280,maxHp:280,damage:33}),
  ];
  const lava=createGroupCombat({actors,bounds:{minX:-15,maxX:15,minZ:-15,maxZ:15},
    environment:"cave-lava"});
  const crypt=createGroupCombat({actors,bounds:{minX:-15,maxX:15,minZ:-15,maxZ:15}});
  const cues=stepGroupCombat(lava);
  stepGroupCombat(crypt);
  const burned=lava.actors.find(a=>a.id==="hero")!;
  assert.equal(burned.hp,88);
  assert(cues.some(c=>c.kind==="lava"&&c.actorId===burned.id&&c.amount===12));
  assert(Math.hypot(burned.x,burned.z)<16.8,
    "the hero must land back inside real authored stone");
  assert.equal(crypt.actors.find(a=>a.id==="hero")!.hp,100,
    "changing the lab arena must change real environment rules");
});

test("committed group frames retain real Troll slam/grab skill provenance",()=>{
  const s=createGroupCombat({actors:[
    fighter("hero","heroes",0,-5),
    fighter("troll","monsters",0,4,{specialAbility:"grapple-throw",hp:280,maxHp:280}),
  ],bounds});
  const troll=s.actors.find(a=>a.id==="troll")!;
  troll.phase="windup";
  troll.activeMeleeAbility="troll-slam";
  assert.equal(captureGroupCombatFrame(s).actors.find(a=>a.id==="troll")?.ability,
    "troll-slam");
  troll.activeMeleeAbility="grapple";
  assert.equal(captureGroupCombatFrame(s).actors.find(a=>a.id==="troll")?.ability,
    "grapple");
});

test("healer magic is distinct from purchased herbs and runs in the common motor",()=>{
  const s=createGroupCombat({actors:[
    fighter("healer","heroes",-3,0,{role:"healer",style:"ranged",
      hp:30,maxHp:100,healCharges:0,magicHeals:2,damage:8}),
    fighter("monster","monsters",9,9,{speed:0,hp:300,maxHp:300}),
  ],bounds});
  const healer=s.actors.find(a=>a.id==="healer")!;
  for(let i=0;i<180;i++)stepGroupCombat(s);
  assert.equal(healer.healCharges,0,
    "magic must not mint any purchased herb");
  assert.equal(healer.magicHeals,0);
  assert(healer.hp>=80);
  const spells=s.events.filter(e=>e.kind==="heal"&&e.actorId==="healer");
  assert.equal(spells.length,2);
  assert(spells.every(e=>e.amount===25));
});

test("real melee equipment prevents light-hit interruption but never negates damage",()=>{
  for(const [role,weapon] of [["tank","Iron Sword"],["DPS","Spear"]] as const){
    for(const armed of [false,true]){
      for(const raw of [8,18]){
        const state=createGroupCombat({bounds,actors:[
          fighter("hero","heroes",0,0,{role,hp:100,maxHp:100,armor:6,
            equipment:{weapon:armed?weapon:null,armor:"Leather Vest"}}),
          fighter("monster","monsters",0,1.7,{damage:raw,armor:0}),
        ]});
        const hero=state.actors.find(a=>a.id==="hero")!;
        const monster=state.actors.find(a=>a.id==="monster")!;
        hero.phase="windup";hero.phaseAge=.1;
        monster.phase="strike";monster.phaseAge=.16;monster.lockedHeading=Math.PI;
        monster.targetId=hero.id;monster.applied=false;
        stepGroupCombat(state);
        assert.equal(hero.hp,100-(raw-6));
        assert.equal(hero.phase,armed&&raw===8?"windup":"hurt");
      }
    }
  }
});

test("ordinary melee defense can forfeit a pending swing and costs stamina",()=>{
  for(const role of ["tank","DPS"] as const){
    const {s,hero,monster}=imminentMonsterStrike();
    const state=createGroupCombat({bounds,actors:[
      fighter("hero","heroes",hero.x,hero.z,{role,hp:100,maxHp:100}),
      fighter("monster","monsters",monster.x,monster.z),
    ]});
    const h=state.actors.find(a=>a.id==="hero")!;
    const m=state.actors.find(a=>a.id==="monster")!;
    h.phase="windup";h.phaseAge=.1;h.stamina=50;
    m.phase="windup";m.phaseAge=.54;m.targetId=h.id;m.lockedHeading=Math.PI;
    stepGroupCombat(state);
    assert(["roll","parry"].includes(h.phase));
    assert(h.stamina<50);
    assert(!state.events.some(e=>e.kind==="hit"&&e.actorId===h.id));
    assert.equal(s.time,0);
  }
});

test("ordinary tank reaction remains active at actual contact",()=>{
  let parries=0;
  for(let ordinal=1;ordinal<=24;ordinal++){
    const {s,hero,monster}=imminentMonsterStrike();
    monster.phase="windup";monster.phaseAge=.54;monster.attacksStarted=ordinal;
    stepGroupCombat(s);
    if(hero.phase!=="parry")continue;
    for(let i=0;i<18;i++)stepGroupCombat(s);
    assert.equal(hero.hp,100,"the telegraphed strike must meet the active parry window");
    assert(s.events.some(e=>e.kind==="parry"&&e.actorId===hero.id));
    parries++;
  }
  assert(parries>0);
});

test("ordinary DPS uses a compact physical sidestep while boss and ranged rolls retain full travel",()=>{
  for(const [role,style,boss,expected] of [
    ["DPS","melee",false,4.2],["DPS","melee",true,7.8],
    ["healer","ranged",false,7.8],["tank","melee",false,7.8],
  ] as const){
    const s=createGroupCombat({bounds,actors:[
      fighter("hero","heroes",0,0,{role,style,hp:100,maxHp:100}),
      fighter("monster","monsters",0,8,{speed:0,
        ...(boss?{specialAbility:"grapple-throw" as const}:{}),
      }),
    ]});
    const hero=s.actors.find(a=>a.id==="hero")!;
    hero.phase="roll";hero.phaseAge=0;hero.rollX=1;hero.rollZ=0;
    for(let i=0;i<24;i++)stepGroupCombat(s);
    assert(Math.abs(hero.x-expected*.4)<1e-6,role+" "+boss);
    assert.equal(hero.hp,100);
    assert.equal(hero.phase,"roll");
  }
});

test("ordinary DPS selects an open flank instead of rolling into a nearby wall",()=>{
  const make=(blocked:boolean)=>createGroupCombat({bounds,obstacles:blocked?[
    {id:"blocked-east",minX:.65,maxX:2.5,minZ:-2,maxZ:2},
  ]:[],actors:[
    fighter("hero","heroes",0,0,{role:"DPS",style:"melee",hp:100,maxHp:100}),
    fighter("monster","monsters",0,1.7,{speed:0}),
  ]});
  for(const blocked of [false,true]){
    const s=make(blocked);
    const hero=s.actors.find(a=>a.id==="hero")!;
    const monster=s.actors.find(a=>a.id==="monster")!;
    hero.stamina=50;
    monster.phase="windup";monster.phaseAge=.54;
    monster.targetId=hero.id;monster.lockedHeading=Math.PI;
    stepGroupCombat(s);
    assert.equal(hero.phase,"roll");
    assert(hero.stamina<50);
    assert(blocked?hero.rollX<0:hero.rollX>0,
      "Use the normal east flank unless the wall blocks it.");
    for(let i=0;i<24;i++)stepGroupCombat(s);
    assert(blocked?hero.x< -1.5:hero.x>1.5);
    assert.equal(hero.hp,100);
  }
});

test("a compact sidestep is not free invulnerability after the existing roll window",()=>{
  const {s,hero,monster}=imminentMonsterStrike();
  const dps=createGroupCombat({bounds,actors:[
    fighter("hero","heroes",hero.x,hero.z,{role:"DPS",hp:100,maxHp:100,armor:0}),
    fighter("monster","monsters",monster.x,monster.z,{damage:18,armor:0}),
  ]});
  const h=dps.actors.find(a=>a.id==="hero")!,m=dps.actors.find(a=>a.id==="monster")!;
  h.phase="roll";h.phaseAge=.46;h.rollX=0;h.rollZ=0;
  m.phase="strike";m.phaseAge=.16;m.lockedHeading=Math.PI;
  m.targetId=h.id;m.applied=false;
  stepGroupCombat(dps);
  assert.equal(h.hp,82);
  assert.equal(s.time,0);
});
