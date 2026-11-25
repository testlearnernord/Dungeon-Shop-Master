// Controlled Floor-10 experiments; same production options and motor as LIVE.
// No campaign mutation, new rules, merchant grants or artificial rewards.
import {generateAdventurer} from "../../src/game/adventurers.ts";
import {heroProgression} from "../../src/game/heroProgression.ts";
import {caveTrollPartyOptions} from "../../src/game/sharedBossCombat.ts";
import {resolveGroupCombat} from "../../src/game/groupCombat.ts";
import {REPLAY_MAX_SECONDS} from "../../src/game/bossCombatReplay.ts";
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
const rows=[],summary={},byPreparation={};
const add=(table,key,row)=>{
  const g=table[key]??={cases:0,wins:0,losses:0,draws:0,deaths:0,bossHpRemaining:0,seconds:0};
  g.cases++;g.wins+=Number(row.outcome==="heroes");
  g.losses+=Number(row.outcome==="monsters");g.draws+=Number(row.outcome==="draw");
  g.deaths+=row.deaths;g.bossHpRemaining+=row.bossExitHp;g.seconds+=row.seconds;
};
for(const composition of compositions)for(const level of [6,9,12])
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
    const fight=resolveGroupCombat(caveTrollPartyOptions(party,tacticsSeed),REPLAY_MAX_SECONDS);
    const row={seed,level,tier,hpRatio,herbs,...summarizeBossFight(fight.replay)};
    rows.push(row);
    add(summary,row.composition,row);
    add(byPreparation,[row.composition,level,tier,hpRatio,herbs].join(":"),row);
  }
if(rows.length!==1536)throw Error("Incomplete controlled boss matrix: "+rows.length);
console.error("BOSS_MATRIX_SUMMARY "+JSON.stringify({seed,cases:rows.length,summary}));
console.log(JSON.stringify({contract:"Controlled homogeneous level/gear/HP/herb comparisons; actual production boss motor, not natural party frequencies",seed,cases:rows.length,summary,byPreparation,rows}));
