// Controlled tuning only: production actor composer and 60 Hz motor,
// no alternate rules, rewards, persistent data or campaign advancement.
import {createGameState} from "../../src/game/gameState.ts";
import {generateAdventurer} from "../../src/game/adventurers.ts";
import {generateExpeditionLayout,dungeonNeighbors} from "../../src/game/dungeonLayout.ts";
import {prepareSpatialDungeonCombat} from "../../src/game/spatialDungeonExploration.ts";
import {heroProgression} from "../../src/game/heroProgression.ts";
import {caveTrollPartyOptions} from "../../src/game/sharedBossCombat.ts";
import {createGroupCombat,stepGroupCombat} from "../../src/game/groupCombat.ts";

const seed=Number(process.argv[2]??7351);
const roles=["tank","DPS","healer"];
const weapons={tank:["Iron Sword","Forged Sword & Shield"],DPS:["Spear","Forged Spear"],healer:["Staff","Forged Staff"]};
const ordinaryProfiles=["baseline","healer-offense-minus-3","ghoul-impact-plus-3","ghoul-poise-6","vest-mitigation-minus-2"];
const bossProfiles=["baseline","healer-offense-minus-3","troll-speed-plus-0.5","troll-impact-plus-7","troll-health-plus-120"];
const initial=createGameState(seed);
const pool=Object.fromEntries(roles.map(role=>[role,[]]));
let rng=seed;
for(let i=1;i<=100&&roles.some(role=>pool[role].length<3);i++){
  const {adventurer,rngState}=generateAdventurer(i,rng);
  rng=rngState;pool[adventurer.role].push(adventurer);
}
if(roles.some(role=>pool[role].length<3))throw Error("Incomplete roster");
function prepareHero(base,level,tier,floor,herbs){
  const h={...base,level,xp:(level-1)*100,floor,status:"exploring",bossPass:true,
    equipment:{weapon:tier?weapons[base.role][tier-1]:null,
      armor:tier===2?"Ghoul Leather Vest":tier===1?"Leather Vest":null},
    inventory:{...base.inventory,healing:herbs}};
  return {...h,health:heroProgression(h).maxHealth};
}
function experiment(options,profile){
  return {...options,actors:options.actors.map(a=>{
    if(a.team==="heroes"){
      if(profile==="healer-offense-minus-3"&&a.role==="healer")
        return {...a,damage:Math.max(1,a.damage-3)};
      if(profile==="vest-mitigation-minus-2"&&a.equipment?.armor)
        return {...a,armor:Math.max(0,a.armor-2)};
    }else{
      if(profile==="ghoul-impact-plus-3")return {...a,damage:a.damage+3};
      if(profile==="ghoul-poise-6"&&a.staggerThreshold===undefined)
        return {...a,staggerThreshold:6};
      if(profile==="troll-speed-plus-0.5")return {...a,speed:a.speed+.5};
      if(profile==="troll-impact-plus-7")return {...a,damage:a.damage+7,grappleDamage:a.grappleDamage+7};
      if(profile==="troll-health-plus-120")return {...a,hp:a.hp+120,maxHp:a.maxHp+120};
    }
    return a;
  })};
}
function measure(options){
  const s=createGroupCombat(options);
  for(let i=0;i<240*60&&s.outcome==="fighting";i++)stepGroupCombat(s);
  const heroes=s.actors.filter(a=>a.team==="heroes");
  const byId=new Map(heroes.map(a=>[a.id,a]));
  const exposure={};
  for(const h of heroes){
    const r=exposure[h.role]??={entries:0,deaths:0,damage:0,received:0,healing:0,attacks:0};
    r.entries++;r.deaths+=Number(h.hp<=0);
  }
  for(const e of s.events){
    const actor=byId.get(e.actorId),target=byId.get(e.targetId);
    if(e.kind==="hit"){
      if(actor)exposure[actor.role].damage+=e.amount??0;
      if(target)exposure[target.role].received+=e.amount??0;
    }
    if(e.kind==="landing"&&target)exposure[target.role].received+=e.amount??0;
    if(e.kind==="lava"&&actor)exposure[actor.role].received+=e.amount??0;
    if(e.kind==="heal"&&target)exposure[target.role].healing+=e.amount??0;
    if((e.kind==="attack"||e.kind==="cast")&&actor)exposure[actor.role].attacks++;
  }
  return {outcome:s.outcome,seconds:s.time,deaths:heroes.filter(a=>a.hp<=0).length,exposure};
}
function add(table,key,result){
  const r=table[key]??={n:0,w:0,l:0,a:0,draw:0,d:0,sec:0,roles:{}};
  r.n++;r.w+=Number(result.outcome==="heroes");r.l+=Number(result.outcome==="monsters");
  r.a+=Number(result.outcome==="fighting");r.draw+=Number(result.outcome==="draw");
  r.d+=result.deaths;r.sec+=result.seconds;
  for(const [role,values] of Object.entries(result.exposure)){
    const dst=r.roles[role]??={};
    for(const [k,v] of Object.entries(values))dst[k]=(dst[k]??0)+v;
  }
}
const ordinary={},boss={};
for(const floor of [1,3,5,7,8,9]){
  const layout=generateExpeditionLayout(seed,floor);
  const sites=[];
  const probe=prepareHero(initial.adventurers[0],floor,0,floor,0);
  for(const site of layout.features.filter(f=>f.kind==="monster")){
    const approaches=dungeonNeighbors(layout,site);
    if(!approaches.length)continue;
    const prepared=prepareSpatialDungeonCombat([probe],site,seed,layout,approaches[0],0,true);
    if(prepared.elite)continue;
    sites.push({site,approaches,pack:prepared.options.actors.filter(a=>a.team==="monsters").length});
  }
  // Real sites only; sample up to four from each available pack size.
  const selected=[1,2,3].flatMap(n=>sites.filter(s=>s.pack===n).slice(0,4));
  for(const {site,approaches} of selected)for(const approach of approaches.slice(0,2))
    for(const role of roles)for(const tier of [0,1,2]){
      const hero=prepareHero(pool[role][0],floor,tier,floor,0);
      const options=prepareSpatialDungeonCombat([hero],site,seed,layout,approach,0,true).options;
      const pack=options.actors.filter(a=>a.team==="monsters").length;
      for(const profile of ordinaryProfiles)
        add(ordinary,[profile,role,tier,pack].join(":"),measure(experiment(options,profile)));
    }
}
for(const composition of [["tank","DPS","healer"],["healer","healer","healer"],["tank","tank","tank"],["DPS","DPS","DPS"],["tank","DPS"],["healer","healer"]])
  for(const tier of [1,2])for(const herbs of [0,2])for(const tacticsSeed of [0,7,16,31]){
    const count={tank:0,DPS:0,healer:0};
    const heroes=composition.map(role=>prepareHero(pool[role][count[role]++],9,tier,9,herbs));
    const rotate=tacticsSeed%heroes.length;
    const options=caveTrollPartyOptions([...heroes.slice(rotate),...heroes.slice(0,rotate)],tacticsSeed);
    for(const profile of bossProfiles)
      add(boss,[profile,composition.slice().sort().join("+"),tier,herbs].join(":"),measure(experiment(options,profile)));
  }
if(!Object.keys(ordinary).length||!Object.keys(boss).length)throw Error("Empty sweep");
// Keep individual log records small. The JSON artifact retains all exposure.
for(const [domain,table] of [["ordinary",ordinary],["boss",boss]]){
  for(const [key,row] of Object.entries(table))
    console.error("BALANCE_ROW "+JSON.stringify({seed,domain,key,...row}));
}
console.log(JSON.stringify({seed,contract:"Matched-level full-health solo fixtures without herbs; real pack sizes; level-9 boss parties. Profile changes are analysis-only; no retreat yet. Vest profile changes raw mitigation only, not derived poise or item catalog.",ordinary,boss}));
