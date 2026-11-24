// Audit-only aggregation. Never called by the normal browser campaign.
// The exact gate/decision records come from the production scheduler;
// positions and floor dwell are sampled at the existing 200-tick cadence.
import {generateExpeditionLayout,dungeonDownStair} from "../../src/game/dungeonLayout.ts";
import {heroProgression} from "../../src/game/heroProgression.ts";
const add=(record,key,n=1)=>record[key]=(record[key]??0)+n;
export function createCampaignTelemetry(seed){
  const allHeroes=new Map(),daily=[],milestones=[],gateCounts={},floor9Examples={},depthDecisions={},depthChecks={},depthExamples={};
  const layouts=new Map(Array.from({length:9},(_,i)=>[i+1,generateExpeditionLayout(seed,i+1)]));
  let lastTick=null,deepest=0,dayDecisions={},dayGates={},dayParties={},dayHero=new Map();
  let previousFloors=new Map(),previousParties=new Set(),dayPartyChanges={};
  function heroDay(id){
    let row=dayHero.get(id);
    if(!row){row={id,deepest:0,floorTicks:{},decisions:{},returnReasons:{}};dayHero.set(id,row);}
    return row;
  }
  function observe(entry){
    const {stage,floor,heroId,checks,action,goal,reason}=entry;
    if(action){
      const row=heroDay(heroId);
      add(row.decisions,floor+":"+action+":"+goal);
      if(action==="shop")add(row.returnReasons,reason??"unclassified");
      add(dayDecisions,floor+":"+stage+":"+action+":"+(reason??"unknown"));
    }
    // The first audit established that the blockage is before Floor 9.
    // Aggregate real decisions and route/crossing samples on EVERY floor.
    const depth=String(floor);
    const tally=depthDecisions[depth]??={};
    if(action)add(tally,stage+":"+action+":"+(reason??"unknown"));
    const checkTally=depthChecks[depth]??={};
    add(checkTally,stage+":observations");
    for(const [name,passed] of Object.entries(checks)){
      const key=stage+":"+name+":"+String(passed);
      add(checkTally,key);
      if(!passed&&(stage==="depth-route"||stage==="depth-crossing")&&!depthExamples[depth+":"+key])
        depthExamples[depth+":"+key]=entry;
    }
    if(floor!==9)return;
    add(dayGates,stage+":observations");add(gateCounts,stage+":observations");
    for(const [name,passed] of Object.entries(checks)){
      const key=stage+":"+name+":"+String(passed);
      add(dayGates,key);add(gateCounts,key);
      if(!passed&&!floor9Examples[key])floor9Examples[key]=entry;
    }
    if(stage==="boss-crossing"&&checks.accepted)deepest=Math.max(deepest,10);
  }
  function sample(state){
    const tick=state.worldClock.tick;
    const elapsed=lastTick===null?0:Math.max(0,tick-lastTick);
    for(const [id,floor] of previousFloors){
      if(elapsed&&typeof floor==="number")add(heroDay(id).floorTicks,String(floor),elapsed);
    }
    lastTick=tick;previousFloors=new Map();
    const byId=new Map(state.adventurers.map(hero=>[hero.id,hero]));
    const plans=new Map(state.liveDungeon.plans.map(plan=>[plan.heroId,plan]));
    const returns=new Map(state.liveDungeon.returns.map(j=>[j.heroId,j]));
    const currentParties=new Set();
    for(const group of state.dungeonParties){
      const key=[...group.memberIds].sort().join("+");
      currentParties.add(key);
      if(!previousParties.has(key))add(dayPartyChanges,"formed");
      const members=group.memberIds.map(id=>byId.get(id)).filter(Boolean);
      const world=state.dungeonWorlds.find(w=>w.floor===group.floor)?.world;
      const positions=members.map(h=>world?.heroes.find(p=>p.heroId===h.id));
      const colocated=positions.length>1&&positions.every(p=>p&&p.x===positions[0]?.x&&p.z===positions[0]?.z);
      const record=dayParties[key]??={memberIds:[...group.memberIds],floorSamples:{},firstDay:group.formedDay,last:null};
      add(record.floorSamples,String(group.floor));
      record.last={floor:group.floor,colocated,positions:positions.map(p=>p?{x:p.x,z:p.z,visited:p.visited.length}:null),
        members:members.map(h=>({id:h.id,hp:h.health,maxHp:heroProgression(h).maxHealth,
          equipment:{...h.equipment},pass:h.bossPass,action:plans.get(h.id)?.action??null}))};
    }
    for(const key of previousParties)if(!currentParties.has(key))add(dayPartyChanges,"separated");
    previousParties=currentParties;
    for(const h of state.adventurers){
      const row=heroDay(h.id);
      const total=allHeroes.get(h.id)??{deepest:0,floorTicks:{}};
      if(typeof h.floor==="number"){
        row.deepest=Math.max(row.deepest,h.floor);total.deepest=Math.max(total.deepest,h.floor);
        deepest=Math.max(deepest,h.floor);
        if(h.status!=="dead")previousFloors.set(h.id,h.floor);
      }
      allHeroes.set(h.id,total);
      // Keep one final daily hero state, not thousands of repeated frames.
      const world=state.dungeonWorlds.find(w=>w.floor===h.floor)?.world;
      const pos=world?.heroes.find(p=>p.heroId===h.id);
      const layout=layouts.get(h.floor);
      const known=new Set(pos?.visited??[]);
      const resolved=new Set(world?.resolvedFeatureIds??[]);
      const resources=layout?.features.filter(site=>site.kind!=="trap")??[];
      const stair=layout?dungeonDownStair(layout):null;
      row.last={floor:h.floor,status:h.status,role:h.role,level:h.level,xp:h.xp,
        hp:h.health,maxHp:heroProgression(h).maxHealth,gold:h.gold,pass:h.bossPass,
        equipment:{...h.equipment},finds:{...h.inventory.finds},
        plan:plans.get(h.id)??null,returnPhase:returns.get(h.id)?.phase??null,
        position:pos?{x:pos.x,z:pos.z,visited:pos.visited.length}:null,
        resources:{resolved:resources.filter(site=>resolved.has(site.id)).length,
          unknown:resources.filter(site=>!resolved.has(site.id)&&!known.has(site.z*layout.width+site.x)).length,
          knownUnresolved:resources.filter(site=>!resolved.has(site.id)&&known.has(site.z*layout.width+site.x)).length},
        lowerStairVisited:stair?known.has(stair.z*layout.width+stair.x):false};
    }
  }
  function finishDay(state){
    sample(state);
    const heroes=[...dayHero.values()];
    for(const row of heroes){
      const total=allHeroes.get(row.id);
      if(total)for(const [floor,ticks] of Object.entries(row.floorTicks))add(total.floorTicks,floor,ticks);
    }
    const entry={day:state.day,deepestEver:deepest,heroes,parties:Object.values(dayParties),
      partyChanges:dayPartyChanges,decisions:dayDecisions,floor9Checks:dayGates};
    daily.push(entry);
    if([20,50,80,100].includes(state.day))milestones.push({day:state.day,deepestEver:deepest,
      heroesByDeepest:histogram(),floor9Checks:{...gateCounts}});
    dayHero=new Map();dayDecisions={};dayGates={};dayParties={};dayPartyChanges={};
    previousFloors=new Map();
  }
  function histogram(){
    const result={};for(const h of allHeroes.values())add(result,String(h.deepest));
    return result;
  }
  function report(){
    return {sampleIntervalTicks:200,partyCountsAreSampled:true,deepestFloor:deepest,heroesByDeepest:histogram(),
      floor9Checks:gateCounts,firstFailedCheckExamples:floor9Examples,
      depthDecisions,depthChecks,depthExamples,milestones,daily,
      lifetimeHeroes:Object.fromEntries(allHeroes),
      reachability:deepest<9?"floor9-not-observed":deepest===9?"floor9-observed-no-floor10":"floor10-observed",
      interpretation:"Failed checks overlap; counts are not unique heroes or proof of causality. Combat settlement currently supplies bossReady=false. Route checks describe known routes, not proof of unreachable geometry."};
  }
  return {observe,sample,finishDay,report,deepestFloor:()=>deepest};
}
