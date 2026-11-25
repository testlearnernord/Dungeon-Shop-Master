// Controlled Floor-10 experiments; same production options and motor as LIVE.
// No campaign mutation, new rules, merchant grants or artificial rewards.
import {generateAdventurer} from "../../src/game/adventurers.ts";
import {heroProgression} from "../../src/game/heroProgression.ts";
import {caveTrollPartyOptions} from "../../src/game/sharedBossCombat.ts";
import {resolveGroupCombat} from "../../src/game/groupCombat.ts";
import {REPLAY_MAX_SECONDS} from "../../src/game/bossCombatReplay.ts";
import {measureCombatHorizons,addHorizonSummary} from "./combat-horizon-audit.mjs";
import {summarizeBossFight} from "./campaign-progression-telemetry.mjs";
const seed=Number(process.argv[2]??7351);
const roles=["tank","DPS","healer"];
const pools=Object.fromEntries(roles.map(role=>[role,[]]));
let rng=seed;
for(let i=1;i<=100&&roles.some(role=>pools[role].length<3);i++){
  const {adventurer,rngState}=generateAdventurer(i,rng);
  rng=rngState;pools[adventurer.role].push(adventurer);
}
if(roles.some(role=>pools[role].length<3))throw Error("Incomplete seeded roster");
const compositions=[];
for(let a=0;a<roles.length;a++)for(let b=a;b<roles.length;b++){
  compositions.push([roles[a],roles[b]]);
  for(let c=b;c<roles.length;c++)compositions.push([roles[a],roles[b],roles[c]]);
}
const weapons={tank:["Iron Sword","Forged Sword & Shield"],DPS:["Spear","Forged Spear"],healer:["Staff","Forged Staff"]};
// Offline enemy-profile experiment only. The live composer is untouched.
const sweep=process.argv[3]==="sweep";
const horizonMode=process.argv[3]==="horizon";
const horizonSummary={},horizonCutoff={};
let horizonCases=0;
const profiles=sweep?[
  {id:"anchor",hp:360,armor:8,damage:27,grappleDamage:34},
  {id:"lighter-armor",hp:360,armor:4,damage:27,grappleDamage:34},
  {id:"larger-health-pool",hp:480,armor:8,damage:27,grappleDamage:34},
  {id:"higher-pressure",hp:360,armor:8,damage:34,grappleDamage:42},
]:[{id:"production"}];
const rows=[],summary={},byPreparation={},byProfile={},byProfilePreparation={},roleExposure={};
const add=(table,key,row)=>{
  const g=table[key]??={cases:0,wins:0,losses:0,draws:0,deaths:0,bossHpRemaining:0,seconds:0};
  g.cases++;g.wins+=Number(row.outcome==="heroes");
  g.losses+=Number(row.outcome==="monsters");g.draws+=Number(row.outcome==="draw");
  g.deaths+=row.deaths;g.bossHpRemaining+=row.bossExitHp;g.seconds+=row.seconds;
};
for(const profile of profiles)for(const composition of compositions)for(const level of [6,9,12])
  for(const tier of [1,2])for(const hpRatio of [.65,1])
  for(const herbs of [0,2])for(const tacticsSeed of [0,7,16,31]){
    const counts={tank:0,DPS:0,healer:0};
    const members=composition.map(role=>{
      const base=pools[role][counts[role]++];
      const hero={...base,level,xp:(level-1)*100,floor:9,status:"exploring",bossPass:true,
        equipment:{weapon:weapons[role][tier-1],armor:tier===2?"Ghoul Leather Vest":"Leather Vest"},
        inventory:{...base.inventory,healing:herbs}};
      return {...hero,health:Math.floor(heroProgression(hero).maxHealth*hpRatio)};
    });
    // Rotate formation slots across the selected production tactics seeds.
    const rotate=tacticsSeed%members.length;
    const party=[...members.slice(rotate),...members.slice(0,rotate)];
    const canonical=caveTrollPartyOptions(party,tacticsSeed);
    const options=sweep?{...canonical,actors:canonical.actors.map(actor=>
      actor.team==="monsters"?{...actor,hp:profile.hp,maxHp:profile.hp,
        armor:profile.armor,damage:profile.damage,grappleDamage:profile.grappleDamage}:actor)}:canonical;
    if(horizonMode){
      const snapshots=measureCombatHorizons(options,[90,120,180,240]);
      const key=[composition.slice().sort().join("+"),tier].join(":");
      addHorizonSummary(horizonSummary,key,snapshots);
      if(snapshots[0].outcome==="fighting")addHorizonSummary(horizonCutoff,key,snapshots);
      horizonCases++;
      continue;
    }
    const fight=resolveGroupCombat(options,REPLAY_MAX_SECONDS);
    const row={seed,profile:profile.id,level,tier,hpRatio,herbs,...summarizeBossFight(fight.replay)};
    rows.push(row);
    add(summary,row.composition,row);
    add(byPreparation,[row.composition,level,tier,hpRatio,herbs].join(":"),row);
    add(byProfile,[profile.id,row.composition].join(":"),row);
    add(byProfilePreparation,[profile.id,row.composition,level,tier,hpRatio,herbs].join(":"),row);
    for(const h of row.members){
      const k=[profile.id,row.composition,h.role].join(":");
      const v=roleExposure[k]??={entries:0,deaths:0,damage:0,received:0,healing:0};
      v.entries++;v.deaths+=Number(h.exitHp<=0);v.damage+=h.damageDealt;
      v.received+=h.meleeDamageReceived+h.landingDamage+h.lavaDamage;v.healing+=h.healingReceived;
    }
  }
if(horizonMode){
  if(horizonCases!==1536)throw Error("Incomplete boss horizon audit: "+horizonCases);
  const report={seed,cases:horizonCases,summary:horizonSummary,cutoffActive:horizonCutoff};
  console.error("BOSS_HORIZON_SUMMARY "+JSON.stringify({seed,cases:horizonCases,summary:horizonSummary}));
  console.error("BOSS_HORIZON_CUTOFF "+JSON.stringify(horizonCutoff));
  console.log(JSON.stringify(report));
  process.exit(0);
}
if(rows.length!==1536*profiles.length)throw Error("Incomplete controlled boss matrix: "+rows.length);
if(sweep){
  console.error("BOSS_PROFILE_SUMMARY "+JSON.stringify({seed,cases:rows.length,profiles,byProfile}));
  const prepared={};
  for(const row of rows.filter(r=>r.tier===2&&r.hpRatio===1&&r.herbs===2))
    add(prepared,[row.profile,row.composition,row.level].join(":"),row);
  console.error("BOSS_PROFILE_PREPARED "+JSON.stringify(prepared));
  console.error("BOSS_PROFILE_ROLES "+JSON.stringify(roleExposure));
}else{
  console.error("BOSS_MATRIX_SUMMARY "+JSON.stringify({seed,cases:rows.length,summary}));
  const tierSummary={},prepared={};
  for(const row of rows){
    add(tierSummary,[row.composition,row.tier].join(":"),row);
    if(row.hpRatio===1&&row.herbs===2)
      add(prepared,[row.composition,row.tier,row.level].join(":"),row);
  }
  console.error("BOSS_MATRIX_TIERS "+JSON.stringify(tierSummary));
  console.error("BOSS_MATRIX_PREPARED "+JSON.stringify(prepared));
  console.error("BOSS_MATRIX_ROLES "+JSON.stringify(roleExposure));
}
console.log(JSON.stringify({contract:"Controlled homogeneous level/gear/HP/herb comparisons; actual production boss motor, not natural party frequencies",seed,cases:rows.length,summary,byPreparation,profiles,byProfile,byProfilePreparation,roleExposure,rows}));
