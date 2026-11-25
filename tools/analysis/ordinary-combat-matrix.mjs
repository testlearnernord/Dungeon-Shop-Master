// Offline controlled experiments using the production composer and 60 Hz motor.
// No campaign mutation, alternate simulation, or artificial rewards.
import {createGameState} from "../../src/game/gameState.ts";
import {generateExpeditionLayout,dungeonNeighbors} from "../../src/game/dungeonLayout.ts";
import {prepareSpatialDungeonCombat,SPATIAL_DUNGEON_COMBAT_SECONDS} from "../../src/game/spatialDungeonExploration.ts";
import {heroProgression} from "../../src/game/heroProgression.ts";
import {resolveGroupCombat} from "../../src/game/groupCombat.ts";
const seeds=process.argv[2]?[Number(process.argv[2])]:[7351,42,2026,9321];
const floors=process.argv[3]?process.argv[3].split(',').map(Number):[1,2,3,4,5,6,7,8,9];
const roles=["tank","DPS","healer"];
const weapons={tank:["Iron Sword","Forged Sword & Shield"],DPS:["Spear","Forged Spear"],healer:["Staff","Forged Staff"]};
const rows=[];
for(const seed of seeds){
  const initial=createGameState(seed);
  for(const floor of floors){
    const layout=generateExpeditionLayout(seed,floor);
    // Select one genuine non-elite site per floor and seed with the largest
    // available pack. Subsets retain identical stats, geometry and IDs.
    let selected;
    const probe={...initial.adventurers[0],floor,status:"exploring"};
    for(const site of layout.features.filter(f=>f.kind==="monster")){
      for(const approach of dungeonNeighbors(layout,site)){
        const options=prepareSpatialDungeonCombat([probe],site,seed,layout,approach,0,true).options;
        const count=options.actors.filter(a=>a.team==="monsters").length;
        if(!selected||count>selected.count)selected={site,approach,count};
        if(count===(floor===1?1:floor<8?2:3))break;
      }
      if(selected?.count===(floor===1?1:floor<8?2:3))break;
    }
    if(!selected)throw Error("No actual monster site: "+seed+"/"+floor);
    for(const role of roles)for(const level of [1,3,5,7,10])
      for(const tier of [0,1,2])for(const hpRatio of [.5,.75,1])
      for(const supplies of [0,2]){
        const base=initial.adventurers.find(h=>h.role===role);
        if(!base)throw Error("Missing role "+role);
        const hero={...base,floor,status:"exploring",level,xp:(level-1)*100,
          equipment:{weapon:tier?weapons[role][tier-1]:null,
            armor:tier===2?"Ghoul Leather Vest":tier===1?"Leather Vest":null},
          inventory:{...base.inventory,healing:supplies}};
        hero.health=Math.max(1,Math.floor(heroProgression(hero).maxHealth*hpRatio));
        const options=prepareSpatialDungeonCombat([hero],selected.site,seed,layout,selected.approach,0,true).options;
        const monsters=options.actors.filter(a=>a.team==="monsters");
        for(let pack=1;pack<=monsters.length;pack++){
          const fight=resolveGroupCombat({...options,actors:[options.actors.find(a=>a.team==="heroes"),...monsters.slice(0,pack)]},SPATIAL_DUNGEON_COMBAT_SECONDS);
          const actor=fight.state.actors.find(a=>a.id===hero.id);
          const cues=fight.replay.cues;
          const sum=(kind,field)=>cues.filter(c=>c.kind===kind&&c[field]===hero.id).reduce((n,c)=>n+(c.amount??0),0);
          const count=kind=>cues.filter(c=>c.kind===kind&&c.actorId===hero.id).length;
          rows.push({seed,floor,role,level,tier,hpRatio,supplies,pack,site:selected.site.id,
            ghoulHp:monsters[0].hp,ghoulDamage:monsters[0].damage,
            outcome:fight.state.outcome,dead:actor.hp<=0,exitHp:actor.hp,
            seconds:fight.state.time,damageDealt:sum("hit","actorId"),
            damageReceived:sum("hit","targetId"),healingReceived:sum("heal","targetId"),
            parries:count("parry"),dodges:count("dodge"),attacks:count("attack")+count("cast")});
        }
      }
  }
}
const groups=new Map();
for(const row of rows){
  const key=[row.floor,row.role,row.level,row.tier,row.hpRatio,row.supplies,row.pack].join(":");
  const g=groups.get(key)??{cases:0,deaths:0,wins:0,draws:0,seconds:0};
  g.cases++;g.deaths+=Number(row.dead);g.wins+=Number(row.outcome==="heroes");g.draws+=Number(row.outcome==="draw");g.seconds+=row.seconds;groups.set(key,g);
}
const summary={};
for(const row of rows){const key=[row.floor,row.role,row.pack].join(':');const g=summary[key]??={cases:0,deaths:0,wins:0,draws:0,seconds:0};g.cases++;g.deaths+=Number(row.dead);g.wins+=Number(row.outcome==='heroes');g.draws+=Number(row.outcome==='draw');g.seconds+=row.seconds;}
console.error('MATRIX_SUMMARY '+JSON.stringify({cases:rows.length,summary}));
console.log(JSON.stringify({contract:"Production combat; controlled pack subsets, not natural encounter frequencies. Each floor/seed uses a real site; no unavailable pack sizes fabricated.",cases:rows.length,groups:Object.fromEntries(groups),rows}));
