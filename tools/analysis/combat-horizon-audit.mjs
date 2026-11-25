// Read-only diagnostic: advance the exact production motor past the current
// live encounter cutoff. No alternate combat rules, settlement or replay.
import {createGroupCombat,stepGroupCombat} from "../../src/game/groupCombat.ts";
import {combatSegmentBox} from "../../src/game/combatProjectile.ts";
import {selectCombatTarget} from "../../src/game/combatTactics.ts";

// Observations, not new combat rules. Keep a bounded 30-second history.
function activity(state){
  return {distance:state.actors.reduce((n,a)=>n+a.distanceTraveled,0),
    attacks:state.actors.reduce((n,a)=>n+a.attacksStarted,0)};
}
function classifyStall(state,previous){
  const now=activity(state);
  const distance=now.distance-previous.distance;
  const attacks=now.attacks-previous.attacks;
  const alive=state.actors.filter(a=>a.hp>0);
  let blocked=0, outOfRange=0;
  for(const actor of alive){
    const target=selectCombatTarget(actor,alive);
    if(!target)continue;
    if(state.obstacles.some(o=>combatSegmentBox(actor,target,o)!==null))blocked++;
    const range=actor.style==="ranged"?11:actor.reach+target.radius;
    if(Math.hypot(actor.x-target.x,actor.z-target.z)>range)outOfRange++;
  }
  return {kind:attacks>0?"attacksWithoutDamage":distance>0.5?"movingWithoutDamage":
    blocked>0?"stationaryObstructed":outOfRange>0?"stationaryOutOfRange":"stationaryInRange",
    blocked:blocked>0,outOfRange:outOfRange>0};
}

export function measureCombatHorizons(options,horizons){
  if(!horizons.length||horizons.some((n,i)=>!Number.isInteger(n)||n<1||n>240||(i>0&&n<=horizons[i-1])))
    throw Error("Invalid diagnostic horizons");
  const state=createGroupCombat(options);
  let ticks=0,lastDamage=0,lastMonsterDamage=0;
  const initialHp=Object.fromEntries(state.actors.map(a=>[a.id,a.hp]));
  const snapshots=[];
  const history=[activity(state)];
  for(const seconds of horizons){
    while(ticks<seconds*60&&state.outcome==="fighting"){
      const cues=stepGroupCombat(state);
      ticks++;
      if(ticks%60===0){
        history.push(activity(state));
        if(history.length>31)history.shift();
      }
      for(const cue of cues){
        if(cue.amount>0&&["hit","landing","lava"].includes(cue.kind)){
          lastDamage=ticks;
          const victim=state.actors.find(a=>a.id===(cue.kind==="lava"?cue.actorId:cue.targetId));
          if(victim?.team==="monsters")lastMonsterDamage=ticks;
        }
      }
    }
    const heroes=state.actors.filter(a=>a.team==="heroes");
    const monsters=state.actors.filter(a=>a.team==="monsters");
    snapshots.push({horizon:seconds,elapsed:ticks/60,outcome:state.outcome,
      heroDeaths:heroes.filter(a=>a.hp<=0).length,
      heroHp:heroes.reduce((n,a)=>n+a.hp,0),monsterHp:monsters.reduce((n,a)=>n+a.hp,0),
      initialHeroHp:heroes.reduce((n,a)=>n+initialHp[a.id],0),
      initialMonsterHp:monsters.reduce((n,a)=>n+initialHp[a.id],0),
      herbs:heroes.reduce((n,a)=>n+a.healCharges,0),
      spells:heroes.reduce((n,a)=>n+(a.magicHeals??0),0),
      secondsWithoutDamage:(ticks-lastDamage)/60,
      secondsWithoutMonsterDamage:(ticks-lastMonsterDamage)/60,
      stall:state.outcome==="fighting"&&ticks-lastDamage>=30*60
        ?classifyStall(state,history[0]):null});
  }
  return snapshots;
}

export function addHorizonSummary(table,key,snapshots){
  for(const row of snapshots){
    const k=key+":"+row.horizon;
    const g=table[k]??={cases:0,wins:0,losses:0,mutualDeaths:0,active:0,
      deaths:0,seconds:0,monsterHp:0,heroHp:0,initialMonsterHp:0,initialHeroHp:0,
      noDamage30:0,noMonsterDamage30:0,activeWithoutHealing:0};
    g.cases++;
    g.wins+=Number(row.outcome==="heroes");
    g.losses+=Number(row.outcome==="monsters");
    g.mutualDeaths+=Number(row.outcome==="draw");
    g.active+=Number(row.outcome==="fighting");
    g.deaths+=row.heroDeaths;g.seconds+=row.elapsed;
    g.monsterHp+=row.monsterHp;g.heroHp+=row.heroHp;
    g.initialMonsterHp+=row.initialMonsterHp;g.initialHeroHp+=row.initialHeroHp;
    if(row.outcome==="fighting"){
      g.noDamage30+=Number(row.secondsWithoutDamage>=30);
      if(row.stall){
        const reasons=g.stallReasons??={};
        reasons[row.stall.kind]=(reasons[row.stall.kind]??0)+1;
        g.stallWithObstruction=(g.stallWithObstruction??0)+Number(row.stall.blocked);
        g.stallWithOutOfRange=(g.stallWithOutOfRange??0)+Number(row.stall.outOfRange);
      }
      g.noMonsterDamage30+=Number(row.secondsWithoutMonsterDamage>=30);
      g.activeWithoutHealing+=Number(row.herbs+row.spells===0);
    }
  }
}
