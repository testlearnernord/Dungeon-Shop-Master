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
