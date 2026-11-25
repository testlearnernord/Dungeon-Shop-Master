// Audit-only aggregation. Never called by the normal browser campaign.
// The exact gate/decision records come from the production scheduler;
// positions and floor dwell are sampled at the existing 200-tick cadence.
import {generateExpeditionLayout,dungeonDownStair} from "../../src/game/dungeonLayout.ts";
import {heroProgression} from "../../src/game/heroProgression.ts";
import {equipmentEffects,gearFromName} from "../../src/game/gearCatalog.ts";
const add=(record,key,n=1)=>record[key]=(record[key]??0)+n;
export function createCampaignTelemetry(seed){
  const allHeroes=new Map(),daily=[],milestones=[],gateCounts={},floor9Examples={},depthDecisions={},depthChecks={},depthExamples={};
  const layouts=new Map(Array.from({length:9},(_,i)=>[i+1,generateExpeditionLayout(seed,i+1)]));
  const partyCompositionSamples={};
  const lastCrossing=new Map(),rapidReversals={};
  let participantCrossings=0;
  let lastTick=null,deepest=0,dayDecisions={},dayGates={},dayParties={},dayHero=new Map();
  let previousFloors=new Map(),previousParties=new Set(),dayPartyChanges={};
  function heroDay(id){
    let row=dayHero.get(id);
    if(!row){row={id,deepest:0,floorTicks:{},decisions:{},returnReasons:{}};dayHero.set(id,row);}
    return row;
  }
  function observe(entry){
    const {stage,floor,heroId,checks,action,goal,reason}=entry;
    // Actual committed stair crossings, never route previews or decisions.
    // Count short-window reversals per participant, including party members.
    if(stage==="depth-crossing"&&checks.accepted&&
       (action==="ascend"||action==="descend")){
      const destination=floor+(action==="ascend"?-1:1);
      for(const id of new Set(entry.memberIds??[heroId])){
        const previous=lastCrossing.get(id);
        const elapsed=previous?entry.tick-previous.tick:Infinity;
        if(previous&&previous.from===destination&&previous.to===floor&&
           elapsed>0&&elapsed<=600)
          add(rapidReversals,Math.min(floor,destination)+"-"+Math.max(floor,destination));
        lastCrossing.set(id,{from:floor,to:destination,tick:entry.tick});
        participantCrossings++;
      }
    }
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
      add(partyCompositionSamples,members.map(h=>h.role).sort().join("+"));
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
    if([20,50,80,100,150,200].includes(state.day))milestones.push({day:state.day,deepestEver:deepest,
      heroesByDeepest:histogram(),floor9Checks:{...gateCounts}});
    dayHero=new Map();dayDecisions={};dayGates={};dayParties={};dayPartyChanges={};
    previousFloors=new Map();
  }
  function histogram(){
    const result={};for(const h of allHeroes.values())add(result,String(h.deepest));
    return result;
  }
  function report(){
    return {sampleIntervalTicks:200,partyCountsAreSampled:true,partyCompositionSamples,deepestFloor:deepest,heroesByDeepest:histogram(),
      floor9Checks:gateCounts,firstFailedCheckExamples:floor9Examples,
      depthDecisions,depthChecks,depthExamples,milestones,daily,
      crossingStability:{participantCrossings,rapidReversals,windowTicks:600,
        interpretation:"Consecutive opposite crossings of the same boundary by one hero within three ordinary movement intervals. A reversal can be legitimate; counts are observations, not unique heroes or proof of unchanged risk."},
      lifetimeHeroes:Object.fromEntries(allHeroes),
      reachability:deepest<9?"floor9-not-observed":deepest===9?"floor9-observed-no-floor10":"floor10-observed",
      interpretation:"Failed checks overlap; counts are not unique heroes or proof of causality. Route checks describe known routes, not proof of unreachable geometry."};
  }
  return {observe,sample,finishDay,report,deepestFloor:()=>deepest};
}

// The world feed archives one copy of the same ordinary fight per hero.
// Deduplicate physical encounters, then count each participant exactly once.
// This is an offline reader of committed footage, never another simulation.
export function createCombatExposureTelemetry(){
  const byRole={},byLoadout={},byFloor={},byParty={},byContext={},byPack={},byEntryHealth={},bySoloRisk={};
  const encounterOutcomes={};
  let encounters=0,participants=0;
  const row=(table,key)=>table[key]??={entries:0,deaths:0,wins:0,draws:0,
    damageReceived:0,damageDealt:0,healingReceived:0,parries:0,dodges:0,
    attackStarts:0,entryHpRatioSum:0,exitHpRatioSum:0,seconds:0};
  function observe(events){
    // The scheduler settles all party copies in the same world-tick batch;
    // the audit passes complete day batches, never partial party events.
    const seen=new Set();
    for(const event of events){
      const replay=event.dungeonReplay;
      if(event.type!=="dungeon-live"||!replay||replay.floor>=10)continue;
      for(const site of replay.encounters??[]){
        const fight=site.combat;
        const key=JSON.stringify([event.day,event.worldTick,replay.floor,site.featureId,site.siteCycle??0]);
        if(seen.has(key))continue;
        seen.add(key);
        const heroes=fight.actors.filter(actor=>actor.team==="heroes");
        const monsters=fight.actors.filter(actor=>actor.team==="monsters");
        const end=fight.frames.at(-1);
        if(!end||!heroes.length||!monsters.length)throw Error("Incomplete combat exposure footage: "+key);
        encounters++;
        add(encounterOutcomes,fight.outcome);
        for(const hero of heroes){
          const final=end.actors.find(actor=>actor.id===hero.id);
          if(!final)throw Error("Combat exposure missing final participant: "+hero.id);
          const gear=equipmentEffects(hero.role,hero.equipment??{weapon:null,armor:null});
          const weapon=gearFromName(gear.weapon)?.tier??0;
          const armor=gearFromName(gear.vest)?.tier??0;
          const loadout="W"+weapon+"/A"+armor;
          const party=heroes.length===1?"solo":"party-"+heroes.length;
          const band=replay.floor<=3?"1-3":replay.floor<=7?"4-7":"8-9";
          const ratio=hero.hp/hero.maxHp;
          const healthBand=ratio<.50?"under50":ratio<.75?"50to75":ratio<.90?"75to90":"90to100";
          const keys=[
            row(byRole,hero.role),row(byLoadout,hero.role+":"+loadout),
            row(byFloor,hero.role+":"+replay.floor),
            row(byParty,hero.role+":"+party),
            row(byContext,hero.role+":"+band+":"+party+":"+loadout),
            row(byPack,replay.floor+":"+hero.role+":"+party+":"+monsters.length),
            row(byEntryHealth,hero.role+":"+party+":"+healthBand),
            ...(heroes.length===1?[row(bySoloRisk,replay.floor+":"+hero.role+":"+monsters.length+":"+loadout+":"+healthBand)]:[]),
          ];
          participants++;
          const stats={entries:1,deaths:Number(final.hp<=0),
            wins:Number(fight.outcome==="heroes"&&final.hp>0),
            draws:Number(fight.outcome==="draw"&&final.hp>0),
            damageReceived:0,damageDealt:0,healingReceived:0,parries:0,dodges:0,
            attackStarts:0,entryHpRatioSum:hero.hp/hero.maxHp,
            exitHpRatioSum:final.hp/hero.maxHp,seconds:end.t};
          for(const cue of fight.cues){
            if(cue.kind==="hit"){
              if(cue.targetId===hero.id)stats.damageReceived+=cue.amount??0;
              if(cue.actorId===hero.id)stats.damageDealt+=cue.amount??0;
            }
            if(cue.kind==="heal"&&cue.targetId===hero.id)stats.healingReceived+=cue.amount??0;
            if(cue.actorId===hero.id){
              if(cue.kind==="parry")stats.parries++;
              if(cue.kind==="dodge")stats.dodges++;
              if(cue.kind==="attack"||cue.kind==="cast")stats.attackStarts++;
            }
          }
          for(const r of keys)for(const [field,value] of Object.entries(stats))add(r,field,value);
        }
      }
    }
  }
  function summarize(table){
    return Object.fromEntries(Object.entries(table).map(([key,r])=>[key,{
      ...r,deathShare:r.deaths/r.entries,meanEntryHpRatio:r.entryHpRatioSum/r.entries,
      meanExitHpRatio:r.exitHpRatioSum/r.entries,
    }]));
  }
  function report(){
    if(Object.values(byRole).reduce((n,r)=>n+r.entries,0)!==participants||
       Object.values(encounterOutcomes).reduce((n,v)=>n+v,0)!==encounters)
      throw Error("Combat exposure ledger mismatch");
    return {encounters,participants,encounterOutcomes,
      byRole:summarize(byRole),byLoadout:summarize(byLoadout),
      byFloor:summarize(byFloor),byParty:summarize(byParty),byContext:summarize(byContext),
      byPack:summarize(byPack),byEntryHealth:summarize(byEntryHealth),bySoloRisk:summarize(bySoloRisk),
      interpretation:"Ordinary completed fights only; one entry per participant, not per unique hero. Damage is recorded hit cues; healing is recorded heal cues. Repeated encounters and self-selection by floor/gear/party confound causal comparisons. Bosses and traps excluded."};
  }
  return {observe,report};
}

/** Read the single committed Floor-10 party recording. No simulation, state
 * mutation, inferred member levels or message-based damage classification. */
export function createBossExposureTelemetry(){
  const seen=new Set(),attempts=[],byComposition={};
  function observe(events){
    for(const event of events){
      const fight=event.partyBossReplay;
      if(event.type!=="dungeon-live"||!fight)continue;
      const key=JSON.stringify([event.day,event.worldTick]);
      if(seen.has(key))continue;
      seen.add(key);
      const heroes=fight.actors.filter(a=>a.team==="heroes");
      const boss=fight.actors.find(a=>a.specialAbility==="grapple-throw");
      const end=fight.frames.at(-1);
      if(!boss||!end||heroes.length<2||heroes.length>3)
        throw Error("Incomplete Floor-10 recording "+key);
      const final=id=>{
        const actor=end.actors.find(a=>a.id===id);
        if(!actor)throw Error("Missing final boss participant "+id);
        return actor;
      };
      const amount=(kind,field,id)=>fight.cues
        .filter(c=>c.kind===kind&&c[field]===id)
        .reduce((n,c)=>n+(c.amount??0),0);
      const count=(kind,field,id)=>fight.cues
        .filter(c=>c.kind===kind&&c[field]===id).length;
      const members=heroes.map(h=>({
        id:h.id,role:h.role,entryHp:h.hp,maxHp:h.maxHp,exitHp:final(h.id).hp,
        weaponTier:gearFromName(h.equipment?.weapon)?.tier??0,
        armorTier:gearFromName(h.equipment?.armor)?.tier??0,
        herbs:h.healCharges??0,spells:h.magicHeals??0,
        damage:h.damage,armor:h.armor,agility:h.agility??10,reach:h.reach,
        damageDealt:amount("hit","actorId",h.id),
        meleeDamageReceived:amount("hit","targetId",h.id),
        landingDamage:amount("landing","targetId",h.id),
        lavaDamage:amount("lava","actorId",h.id),
        healingReceived:amount("heal","targetId",h.id),
        grabs:count("grab","targetId",h.id),dodges:count("dodge","actorId",h.id),
        parries:count("parry","actorId",h.id),
        attackStarts:count("attack","actorId",h.id)+count("cast","actorId",h.id),
      }));
      const composition=heroes.map(h=>h.role).sort().join("+");
      const deaths=members.filter(h=>h.exitHp<=0).length;
      const row={day:event.day,tick:event.worldTick,tacticsSeed:fight.tacticsSeed??null,
        composition,outcome:fight.outcome,seconds:end.t,bossEntryHp:boss.hp,
        bossExitHp:final(boss.id).hp,deaths,members};
      attempts.push(row);
      const g=byComposition[composition]??={attempts:0,wins:0,losses:0,draws:0,deaths:0};
      g.attempts++;g.deaths+=deaths;
      if(fight.outcome==="heroes")g.wins++;
      else if(fight.outcome==="monsters")g.losses++;
      else if(fight.outcome==="draw")g.draws++;
      else throw Error("Unsettled Floor-10 recording");
    }
  }
  function report(){
    return {completed:attempts.length,byComposition,attempts,
      interpretation:"Committed Floor-10 recordings; one row per settled attempt. Entry combat attributes are recorded facts, not reconstructed levels. Damage sources use hit/landing/lava cues. Natural composition and readiness are confounded."};
  }
  return {observe,report};
}
