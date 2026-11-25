import assert from "node:assert/strict";
import test from "node:test";
import {createGroupCombat,stepGroupCombat,type CombatantSpec} from "../../src/game/groupCombat.ts";
test("ranged recovery movement depends on distance, not opponent identity",()=>{
  for(const gap of [3.5,6,9])for(const signature of [false,true]){
    const common={hp:100,maxHp:100,damage:10,armor:0,reach:1.6};
    const actors:CombatantSpec[]=[
      {...common,id:"healer",team:"heroes",role:"healer",style:"ranged",x:0,z:0,speed:3.1},
      {...common,id:"enemy",team:"monsters",role:"monster",style:"melee",x:0,z:gap,speed:0,
        ...(signature?{specialAbility:"grapple-throw" as const}:{})},
    ];
    const s=createGroupCombat({bounds:{minX:-12,maxX:12,minZ:-12,maxZ:12},actors});
    const h=s.actors.find(a=>a.id==="healer")!,m=s.actors.find(a=>a.id==="enemy")!;
    h.cooldown=100;m.cooldown=100;
    for(let tick=0;tick<12;tick++)stepGroupCombat(s);
    assert.equal(h.x,0);
    if(gap===3.5)assert(h.z<0);
    if(gap===6)assert.equal(h.z,0);
    if(gap===9)assert(h.z>0);
  }
});


test("melee recovery movement also ignores enemy identity",()=>{
  for(const gap of [1.7,4])for(const signature of [false,true]){
    const common={hp:100,maxHp:100,damage:10,armor:0,reach:1.6};
    const actors:CombatantSpec[]=[
      {...common,id:"hero",team:"heroes",role:"DPS",style:"melee",x:0,z:0,speed:3.1},
      {...common,id:"enemy",team:"monsters",role:"monster",style:"melee",x:0,z:gap,speed:0,
        ...(signature?{specialAbility:"grapple-throw" as const}:{})},
    ];
    const s=createGroupCombat({bounds:{minX:-12,maxX:12,minZ:-12,maxZ:12},actors});
    const h=s.actors.find(a=>a.id==="hero")!,m=s.actors.find(a=>a.id==="enemy")!;
    h.cooldown=100;m.cooldown=100;
    for(let tick=0;tick<12;tick++)stepGroupCombat(s);
    assert.equal(h.x,0,"no opponent-specific orbit");
    if(gap===1.7)assert.equal(h.z,0,"hold valid melee distance");
    else assert(h.z>0,"approach through shared movement");
  }
});

test("single-target telegraphs never provoke a bystander defense",()=>{
  for(const signature of [false,true])for(let seed=0;seed<24;seed++){
    const common={hp:100,maxHp:100,damage:10,armor:0,reach:1.6,speed:0};
    const actors:CombatantSpec[]=[
      {...common,id:"bystander",team:"heroes",role:"DPS",style:"melee",x:1.1,z:0},
      {...common,id:"target",team:"heroes",role:"tank",style:"melee",x:0,z:0},
      {...common,id:"enemy",team:"monsters",role:"monster",style:"melee",x:0,z:1.7,
        ...(signature?{specialAbility:"grapple-throw" as const}:{})},
    ];
    const s=createGroupCombat({bounds:{minX:-12,maxX:12,minZ:-12,maxZ:12},actors,tacticsSeed:seed});
    const bystander=s.actors.find(a=>a.id==="bystander")!,target=s.actors.find(a=>a.id==="target")!;
    const enemy=s.actors.find(a=>a.id==="enemy")!;
    bystander.cooldown=100;target.cooldown=100;
    enemy.phase="windup";enemy.phaseAge=signature?.76:.54;
    enemy.activeMeleeAbility=signature?"troll-smash":"ordinary";
    enemy.lockedHeading=Math.PI;enemy.targetId=target.id;enemy.attacksStarted=1;
    stepGroupCombat(s);
    assert.equal(bystander.phase,"move");
    assert.equal(bystander.stamina,100);
  }
});

test("signature attack uses its real reach instead of a fixed boss approach gate",()=>{
  const common={hp:100,maxHp:100,damage:10,armor:0,reach:1.6,speed:0};
  const actors:CombatantSpec[]=[
    {...common,id:"hero",team:"heroes",role:"tank",style:"melee",x:0,z:0},
    {...common,id:"enemy",team:"monsters",role:"monster",style:"melee",x:0,z:5.4,
      specialAbility:"grapple-throw"},
  ];
  const s=createGroupCombat({bounds:{minX:-12,maxX:12,minZ:-12,maxZ:12},actors});
  const h=s.actors.find(a=>a.id==="hero")!,m=s.actors.find(a=>a.id==="enemy")!;
  h.cooldown=100;m.cooldown=0;
  stepGroupCombat(s);
  assert.equal(m.phase,"windup");
  assert.equal(m.activeMeleeAbility,"troll-smash");
  assert.equal(m.targetId,h.id);
});


test("tracking a grapple follows the committed target, not a nearer bystander",()=>{
  const common={hp:100,maxHp:100,damage:10,armor:0,reach:1.6,speed:0};
  const actors:CombatantSpec[]=[
    {...common,id:"target",team:"heroes",role:"tank",style:"melee",x:0,z:-4},
    {...common,id:"bystander",team:"heroes",role:"DPS",style:"melee",x:2,z:0},
    {...common,id:"enemy",team:"monsters",role:"monster",style:"melee",x:0,z:0,
      specialAbility:"grapple-throw"},
  ];
  const s=createGroupCombat({bounds:{minX:-12,maxX:12,minZ:-12,maxZ:12},actors});
  const m=s.actors.find(a=>a.id==="enemy")!;
  for(const a of s.actors)a.cooldown=100;
  m.phase="windup";m.phaseAge=.1;m.activeMeleeAbility="grapple";
  m.targetId="target";m.attacksStarted=1;
  stepGroupCombat(s);
  assert.equal(m.targetId,"target");
  assert(Math.abs(Math.abs(m.lockedHeading)-Math.PI)<1e-8);
});
