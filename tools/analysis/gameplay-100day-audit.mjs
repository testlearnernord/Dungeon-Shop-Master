// Diagnostic runner only. Never called by gameplay or the normal PR CI.
// Executes the real GameStore/clock/combat engine with explicit scripted
// merchant actions. Physical NPC walking is NOT emulated in Node.
import { writeFileSync } from "node:fs";
import { GameStore } from "../../src/game/gameStore.ts";
import { createGameState } from "../../src/game/gameState.ts";
import { forecastShoppingIntents } from "../../src/game/shopperIntents.ts";
import { ITEMS,ECONOMY,isMaterial } from "../../src/game/economy.ts";
import {availableDungeonOffers} from "../../src/game/dungeonBuyback.ts";
import {FORGE_OUTPUTS,FORGE_RECIPES,isForgeOutput} from "../../src/game/cellarForge.ts";
import {createCampaignTelemetry,createCombatExposureTelemetry} from "./campaign-progression-telemetry.mjs";
import {equipmentEffects} from "../../src/game/gearCatalog.ts";
import {heroProgression} from "../../src/game/heroProgression.ts";

const DAYS = Number(process.env.AUDIT_DAYS ?? 100);
const SEED = Number(process.env.AUDIT_SEED ?? 7351);
const MODES = (process.env.AUDIT_MODES ?? "absent,consumables,equipment,full").split(",");
if (!Number.isSafeInteger(DAYS) || DAYS < 1 || DAYS > 200) throw Error("AUDIT_DAYS 1..200");
const itemById = new Map(ITEMS.map(x=>[x.id,x]));
const catalog = ["bread","healing-herb","iron-sword","leather-vest"];
const placements = [
  {id:"shelf-1",x:-7,z:0,rotation:0},
  {id:"shelf-2",x:7,z:0,rotation:2},
];
const targets = {bread:3,"healing-herb":3,"iron-sword":2,"leather-vest":2,spear:2,staff:2,
  ...Object.fromEntries(FORGE_OUTPUTS.map(id=>[id,1]))};
const slotIds = {bread:"shelf-1-slot-1","healing-herb":"shelf-1-slot-2",
  "iron-sword":"shelf-1-slot-3","leather-vest":"shelf-1-slot-4",
  spear:"shelf-2-slot-1",staff:"shelf-2-slot-2",
  ...Object.fromEntries(FORGE_OUTPUTS.map((id,i)=>[id,"shelf-3-slot-"+(i+1)]))};
const forges=mode=>mode==="forge"||mode==="forge-ready";
const buysSalvage=mode=>mode==="buyback"||forges(mode);
const eligibleSkus = mode => forges(mode) ? [...catalog,"spear","staff",...FORGE_OUTPUTS] :
  mode==="tier1"||mode==="buyback" ? [...catalog,"spear","staff"] :
  mode==="full" ? catalog :
  mode==="consumables" ? catalog.slice(0,2) :
  mode==="equipment" ? catalog.slice(2) : [];
const counts = values => Object.fromEntries([...new Set(values)].sort().map(v=>[v,values.filter(x=>x===v).length]));
const add = (object,key,value) => object[key]=(object[key]??0)+value;
const sum = (arr,fn) => arr.reduce((t,v)=>t+fn(v),0);
function snap(s,dayCompleted) {
  const living=s.adventurers.filter(h=>h.status!=="dead");
  const dead=s.adventurers.filter(h=>h.status==="dead");
  const originalLiving=living.filter(h=>Number(h.id.split("-")[1])<=10);
  const goldLiving=sum(living,h=>h.gold),goldDead=sum(dead,h=>h.gold);
  return {
    dayCompleted, populationTotal:s.adventurers.length, living:living.length,
    dead:dead.length, originalLiving:originalLiving.length,
    peakLevel:Math.max(...s.adventurers.map(h=>h.level)),
    peakLivingLevel:Math.max(0,...living.map(h=>h.level)),
    peakXp:Math.max(...s.adventurers.map(h=>h.xp)),
    meanLivingLevel:living.length?+(sum(living,h=>h.level)/living.length).toFixed(2):0,
    activeFloors:counts(living.map(h=>String(h.floor))),
    statuses:counts(living.map(h=>h.status)),
    shopGold:s.shopEconomy.balance, heroGoldLiving:goldLiving,
    heroGoldDead:goldDead,totalRecordedGold:s.shopEconomy.balance+goldLiving+goldDead,
    spendableGold:s.shopEconomy.balance+goldLiving,
    weapons:living.filter(h=>h.equipment.weapon).length,
    armor:living.filter(h=>h.equipment.armor).length,
    hasHealing:living.filter(h=>h.inventory.healing>0).length,
    hasBread:living.filter(h=>h.inventory.bread>0).length,
    zeroGold:living.filter(h=>h.gold===0).length,
    physicalFinds:sum(living,h=>sum(Object.values(h.inventory.finds??{}),v=>v??0)),
    heroesWithTwoPhysicalFinds:living.filter(h=>
      sum(Object.values(h.inventory.finds??{}),v=>v??0)>=2).length,
    heroPlans:counts(s.liveDungeon.plans.map(p=>p.action)),
    worldSiteCycles:sum(s.dungeonWorlds,w=>w.world.siteCycles?.length??0),
    floorsCleared:s.dungeonFloors.filter(f=>f.cleared).map(f=>f.floor),
    activeCombats:s.liveDungeon.combats.length+(s.liveDungeon.partyBossCombat?1:0),
    events:s.events.length,
    unrecoveredFinds:sum(living,h=>sum(Object.values(h.inventory.finds??{}),v=>v??0)),
  };
}
function setup(mode,diagnostic) {
  const store=new GameStore(createGameState(SEED),diagnostic);
  if(mode!=="absent")for(const draft of placements){
    const response=store.placeFurniture(draft);
    if(response!=="Shelf placement saved.")throw Error("Shelf setup rejected: "+response);
  }
  // Identical extra physical shelf in both salvage treatments. Use the real
  // placement validator; never invent inaccessible stock or extra bag space.
  if(buysSalvage(mode)){
    const third=[{x:-7,z:-4},{x:7,z:-4},{x:-7,z:4},{x:7,z:4}]
      .map(p=>({id:"shelf-3",...p,rotation:p.x<0?0:2}))
      .find(p=>store.previewFurniturePlacement(p)===null);
    if(!third||store.placeFurniture(third)!=="Shelf placement saved.")
      throw Error("No valid third shelf for the matched salvage comparison");
  }
  store.enableLiveDungeon();
  return store;
}
function restock(store,mode,metrics){
  for(const itemId of eligibleSkus(mode)){
    const slotId=slotIds[itemId];
    for(let i=0;i<3;i++){
      const slot=store.state.shopEconomy.slots.find(s=>s.id===slotId);
      if(!slot || slot.quantity>=targets[itemId])break;
      let available=store.state.shopEconomy.bag[itemId];
      if(!available&&isForgeOutput(itemId)){
        const reserve=store.state.shopEconomy.materialStorage;
        const recipe=FORGE_RECIPES[itemId];
        const used=Object.values(store.state.shopEconomy.bag).reduce((n,q)=>n+q,0);
        if(used>=ECONOMY.bagCapacity||Object.entries(recipe).some(([id,n])=>reserve[id]<n))break;
        const before=store.state;
        const msg=store.craftAtForge(itemId);
        if(store.state===before)throw Error("Real forge rejected available recipe: "+msg);
        add(metrics.craftedUnits,itemId,1);
        for(const [id,n] of Object.entries(recipe))if(n)add(metrics.materialsConsumed,id,n);
        available=store.state.shopEconomy.bag[itemId];
      }
      if(!available){
        if(isForgeOutput(itemId))break; // Never buy T2 from the supplier.
        const before=store.state.shopEconomy.balance;
        const msg=store.purchase(itemId,Math.min(2,targets[itemId]-slot.quantity),
          metrics.nextRequestId++);
        if(store.state.shopEconomy.balance===before){
          // A single unit may still fit the remaining merchant budget.
          const one=store.purchase(itemId,1,metrics.nextRequestId++);
          if(store.state.shopEconomy.balance===before)break;
        }
        const diff=before-store.state.shopEconomy.balance;
        metrics.wholesaleSpent+=diff;
        add(metrics.wholesaleUnits,itemId,diff/itemById.get(itemId).wholesaleCost);
        available=store.state.shopEconomy.bag[itemId];
      }
      if(!available)break;
      const before=store.state.shopEconomy.bag[itemId];
      const msg=store.transfer(slotId,itemId,"stock",
        Math.min(available,targets[itemId]-slot.quantity));
      if(store.state.shopEconomy.bag[itemId]===before)
        throw Error("Shelf stock rejected: "+itemId+" "+msg);
    }
  }
}
// Bounded, explicit shopkeeper policy rather than free materials. Both
// treatments use identical price, purse reserve, and workshop stock caps.
// Buyback-only retains materials; forge replenishes them as recipes consume
// the reserve, so realized spending is reported rather than assumed equal.
function purchaseSalvage(store,metrics){
  const caps={"iron-ore":8,coal:8,"ghoul-leather":16};
  for(const offer of availableDungeonOffers(store.state)){
    if(!isMaterial(offer.itemId))continue;
    const id=offer.itemId;
    const n=Math.min(offer.count,caps[id]-store.state.shopEconomy.materialStorage[id],
      Math.floor((store.state.shopEconomy.balance-10)/offer.price));
    for(let i=0;i<n;i++){
      const before=store.state;
      const msg=store.buyDungeonFind(offer.heroId,id);
      if(store.state===before)throw Error("Real buyback rejected eligible offer: "+msg);
      const paid=before.shopEconomy.balance-store.state.shopEconomy.balance;
      if(paid!==offer.price)throw Error("Buyback payment mismatch");
      metrics.buybackGold+=paid;add(metrics.materialsBought,id,1);
    }
  }
}
function actShop(store,mode,metrics){
  // All shop service and door completion below are externally scripted
  // idealized player/NPC actions. They use actual game mutations, not direct
  // balance/HP/stat edits, but do not model a human's movement or timing.
  if(buysSalvage(mode))purchaseSalvage(store,metrics);
  if(mode!=="absent")restock(store,mode,metrics);
  const people=store.state.adventurers.filter(h=>h.status==="at-shop");
  for(const hero of people){
    // The real player can grant this saved permission only while a living
    // hero visits Galvik. Exercise that actual GameStore action so a
    // natural Floor-10 attempt is possible, never teleport the party.
    // Keep the old permissive comparison. A second Forge treatment
    // models a player who approves only veterans with gear and sufficient HP.
    // No direct state edits, no artificial revocation and no gate changes.
    if(!hero.bossPass){
      const gear=equipmentEffects(hero.role,hero.equipment);
      const ready=hero.level>=5&&!!gear.weapon&&!!gear.vest&&
        hero.health/heroProgression(hero).maxHealth>=.75;
      add(metrics.passConsiderations,ready?"ready":"not-ready",1);
      if((mode!=="forge-ready"||ready)&&store.setBossPass(hero.id,true)){
        metrics.bossPassesGranted++;
        add(metrics.passGrants,ready?"ready":"not-ready",1);
      }
    }
    const forecast=forecastShoppingIntents(store.state).get(hero.id);
    if(!forecast)continue;
    if(mode!=="absent" && forecast.items.length){
      let successes=0;
      for(const line of forecast.items){
        const before=store.state.shopCarts.find(c=>c.heroId===hero.id)?.lines.length??0;
        store.pickUpShopItem(hero.id,line.slotId);
        const after=store.state.shopCarts.find(c=>c.heroId===hero.id)?.lines.length??0;
        if(after>before)successes++;
      }
      if(successes){
        const before=store.state.shopEconomy.balance;
        const msg=store.payReservedCart(hero.id,false);
        if(store.state.shopEconomy.balance>before) {
          metrics.servedCustomers++;
          if(store.completePhysicalShopExit(hero.id,13))metrics.gateExits++;
          continue;
        }
        add(metrics.failedCheckout,msg,1);
        store.returnShopCart(hero.id);
      }
    }
    if(forecast.reason==="unavailable"&&forecast.wantedItemId){
      // Real authoritative 60-second request expiry, not a fake free sale.
      store.startShopRequest(hero.id,forecast.wantedItemId,"unavailable");
    }else {
      store.walkOutWithoutPurchase(hero.id,forecast.reason);
      // Count actual committed shop-walkout events in the day ledger.
    }
  }
  // Model the observed exit at the real door through its original API.
  // This explicitly replaces the unavailable Babylon pedestrian simulator.
  for(const hero of store.state.adventurers.filter(h=>h.status==="departing")){
    if(store.completePhysicalShopExit(hero.id,13))metrics.gateExits++;
  }
}
function summarizeEvents(metrics,added,knownDead){
  const bossEntryTicks=new Set();
  for(const e of added){
    if(e.type==="dungeon-live"&&
       e.message?.includes(" entered Floor 10 together to challenge the Cave Troll."))
      bossEntryTicks.add(e.day+":"+e.worldTick);
    add(metrics.eventTypes,e.type,1);
    if(e.type==="sale"){
      add(metrics.salesUnits,e.itemId??"unknown",e.quantity??0);
      add(metrics.salesRevenue,e.itemId??"unknown",e.revenue??0);
    }
    if(e.type==="healed")add(metrics.healingUsed,e.itemId??"unknown",e.quantity??0);
    if(e.type==="shop-credit")add(metrics.credits,e.itemId??"unknown",e.debtGold??0);
    if(e.type==="dungeon-live"&&e.dungeonReplay){
      const replay=e.dungeonReplay;
      for(const step of replay.steps??[])add(metrics.replayStepActions,step.action,1);
      for(const encounter of replay.encounters??[])add(metrics.encounterOutcomes,
        encounter.combat?.outcome??"unknown",1);
    }
  }
  metrics.bossAttempts+=bossEntryTicks.size;
}
function classifyDeaths(metrics,previous,state,added) {
  const old=new Map(previous.map(h=>[h.id,h]));
  for(const hero of state.adventurers){
    if(hero.status!=="dead"||old.get(hero.id)?.status==="dead")continue;
    const relevant=added.filter(e=>e.adventurerId===hero.id);
    // Only current committed replay/event contracts can explain a death.
    // Floor 10 is the unique real party boss; retired Solo-F6 events and
    // dedicated F7 replay payloads must never classify modern campaigns.
    const replay=relevant.find(e=>e.dungeonReplay&&
      (e.dungeonReplay.steps?.some(st=>st.action==="death")||
       e.dungeonReplay.encounters?.length));
    const steps=replay?.dungeonReplay?.steps??[];
    const encounters=replay?.dungeonReplay?.encounters??[];
    const origin=old.get(hero.id);
    const cause=origin?.floor===10||hero.floor===10?"boss":
      encounters.length?"combat":
      steps.some(step=>step.action==="trap")?"trap":"unclassified";
    add(metrics.deathCauses,cause,1);
    add(metrics.deathFloors,String(hero.floor),1);
    const equipment=equipmentEffects(hero.role,hero.equipment);
    metrics.deathRecords.push({day:state.day,id:hero.id,level:hero.level,
      floor:hero.floor,cause,weapon:!!equipment.weapon,armor:!!equipment.vest,
      role:hero.role,startingHero:metrics.startingIds.has(hero.id)});
  }
}
function run(mode){
  const telemetry=createCampaignTelemetry(SEED);
  const combatExposure=createCombatExposureTelemetry();
  const store=setup(mode,telemetry.observe);
  telemetry.sample(store.state);
  const initial=snap(store.state,0);
  const metrics={
    mode,seed:SEED,daysRequested:DAYS,
    model:"real GameStore, scripted storefront and manual boss passes",
    stockPolicy:eligibleSkus(mode),
    passPolicy:mode==="forge-ready"?"veteran-equipped-healthy-at-shop":"all-living-visitors",
    passConsiderations:{},passGrants:{},
    starting:initial, startingIds:new Set(store.state.adventurers.map(h=>h.id)),
    milestones:[initial], eventTypes:{}, salesUnits:{},
    salesRevenue:{},healingUsed:{},credits:{},replayStepActions:{},
    encounterOutcomes:{}, deathCauses:{},deathFloors:{},deathRecords:[],
    wholesaleUnits:{},wholesaleSpent:0,influxGold:0,
    buybackGold:0,materialsBought:{},materialsConsumed:{},craftedUnits:{},
    lateEventTypes:{}, xpGrowthDays:[], servedCustomers:0,
    activitySamples:{living:0,offDuty:0,exploring:0,count:0},
    shortExpeditions:{completed:0,within600Ticks:0,withoutRecordedRewardOrFight:0},
    unservedCustomers:0,gateExits:0,bossPassesGranted:0,
    bossAttempts:0,failedCheckout:{},nextRequestId:1,
  };
  const renewed=new Map();
  for(let completed=1;completed<=DAYS;completed++){
    const before=store.state.adventurers;
    const firstEvent=store.state.events.length;
    const startDay=store.state.day;
    for(let step=0;step<144;step++){
      actShop(store,mode,metrics);
      store.advanceWorldTime(200);
      telemetry.sample(store.state);
      const active=store.state.adventurers.filter(h=>h.status!=="dead");
      metrics.activitySamples.living+=active.length;
      metrics.activitySamples.offDuty+=active.filter(h=>h.status==="off-duty").length;
      metrics.activitySamples.exploring+=active.filter(h=>h.status==="exploring").length;
      metrics.activitySamples.count++;
    }
    actShop(store,mode,metrics);
    telemetry.finishDay(store.state);
    store.endDay();
    telemetry.sample(store.state);
    if(store.state.day!==startDay+1)throw Error("World day did not advance");
    const added=store.state.events.slice(firstEvent);
    summarizeEvents(metrics,added);
    for(const event of added){
      const id=event.adventurerId;
      if(!id)continue;
      if(event.type==="dungeon-live"&&event.message.includes("began a new expedition")&&
        event.worldTick!==undefined)
        renewed.set(id,{tick:event.worldTick,activity:false});
      const previous=renewed.get(id);
      if(!previous)continue;
      if(event.type==="dungeon-live"&&
        (event.dungeonHighlight==="treasure"||event.dungeonReplay?.encounters?.length))
        previous.activity=true;
      if(event.type==="shop-arrival"&&event.worldTick!==undefined){
        metrics.shortExpeditions.completed++;
        if(event.worldTick-previous.tick<=600){
          metrics.shortExpeditions.within600Ticks++;
          if(!previous.activity)metrics.shortExpeditions.withoutRecordedRewardOrFight++;
        }
        renewed.delete(id);
      }
      if(event.type==="hero-death-signal")renewed.delete(id);
    }
    combatExposure.observe(added);
    if(completed>20)for(const e of added)add(metrics.lateEventTypes,e.type,1);
    for(const e of added.filter(e=>e.type==="influx")){
      const newcomer=store.state.adventurers.find(h=>h.id===e.adventurerId);
      if(newcomer)metrics.influxGold+=newcomer.gold;
    }
    if(sum(before,h=>h.xp)!==sum(store.state.adventurers,h=>h.xp))
      metrics.xpGrowthDays.push(completed);
    classifyDeaths(metrics,before,store.state,added);
    const result=snap(store.state,completed);
    if([1,5,10,20,25,50,75,80,100,150,200].includes(completed)||
       completed===DAYS)metrics.milestones.push(result);
    if(completed%10===0||completed===DAYS)
      console.log("AUDIT_PROGRESS "+JSON.stringify({
        mode,completed,living:result.living,dead:result.dead,
        shopGold:result.shopGold,heroesGold:result.heroGoldLiving,
        peakLevel:result.peakLevel,events:result.events,
        deepestFloor:telemetry.deepestFloor()
      }));
  }
  const final=snap(store.state,DAYS);
  metrics.final=final;
  metrics.activitySamples.offDutyShare=metrics.activitySamples.offDuty/Math.max(1,metrics.activitySamples.living);
  metrics.activitySamples.exploringShare=metrics.activitySamples.exploring/Math.max(1,metrics.activitySamples.living);
  // Final cohort turnover and death equipment are not exposure-adjusted
  // hazard estimates. Keep them explicit instead of treating a full
  // replacement roster as proof of successful survival.
  const deaths=metrics.deathRecords;
  metrics.survival={
    entrants:final.populationTotal,dead:final.dead,
    deadShare:final.populationTotal?final.dead/final.populationTotal:0,
    initialEntrants:metrics.startingIds.size,initialSurvivors:final.originalLiving,
    initialSurvivalShare:metrics.startingIds.size?final.originalLiving/metrics.startingIds.size:0,
    recordedDeaths:deaths.length,
    unarmedDeaths:deaths.filter(d=>!d.weapon).length,
    fullyEquippedDeaths:deaths.filter(d=>d.weapon&&d.armor).length,
    earlyDeaths:deaths.filter(d=>d.level<=3).length,
    upperFloorDeaths:deaths.filter(d=>typeof d.floor==="number"&&d.floor<=3).length,
  };
  metrics.roleSurvival=Object.fromEntries(["tank","DPS","healer"].map(role=>{
    const entrants=store.state.adventurers.filter(h=>h.role===role);
    const living=entrants.filter(h=>h.status!=="dead");
    return [role,{entrants:entrants.length,living:living.length,
      dead:entrants.length-living.length,deadShare:entrants.length?(entrants.length-living.length)/entrants.length:0,
      veterans:living.filter(h=>h.level>=5).length,
      peakLivingLevel:Math.max(0,...living.map(h=>h.level)),
      permittedVeterans:living.filter(h=>h.level>=5&&h.bossPass).length,
      deepestLiving:Math.max(0,...living.map(h=>typeof h.floor==="number"?h.floor:h.lastDungeonFloor??0))}];
  }));
  delete metrics.startingIds;
  metrics.progression=telemetry.report();
  const {byContext,...exposureSummary}=combatExposure.report();
  metrics.combatExposure={...exposureSummary,byContext};
  metrics.newHeroes=sum(store.state.events,e=>e.type==="influx"?1:0);
  // Request expiries are committed asynchronously by the LIVE clock, not
  // necessarily by a direct shopper action in actShop().
  metrics.unservedCustomers=metrics.eventTypes["shop-walkout"]??0;
  metrics.bossVictory=final.floorsCleared.includes(10);
  metrics.paidUnits=sum(Object.values(metrics.salesUnits),x=>x);
  metrics.paidGold=sum(Object.values(metrics.salesRevenue),x=>x);
  metrics.debtOutstanding=sum(store.state.shopDebts,d=>d.outstandingGold);
  metrics.estimatedDungeonGoldCreated=final.totalRecordedGold-
    initial.totalRecordedGold+metrics.wholesaleSpent-metrics.influxGold;
  metrics.lastXpGrowthDay=metrics.xpGrowthDays.at(-1)??null;
  metrics.remainingGoods={bag:store.state.shopEconomy.bag,
    materialReserve:store.state.shopEconomy.materialStorage,
    shelves:store.state.shopEconomy.slots.map(s=>({itemId:s.itemId,quantity:s.quantity}))};
  metrics.topSurvivors=store.state.adventurers.filter(h=>h.status!=="dead")
    .sort((a,b)=>b.xp-a.xp).slice(0,12).map(h=>({
      id:h.id,level:h.level,xp:h.xp,physicalFinds:
        sum(Object.values(h.inventory.finds??{}),v=>v??0),role:h.role,
      hp:h.health,maxHp:heroProgression(h).maxHealth,gold:h.gold,
      weapon:h.equipment.weapon,armor:h.equipment.armor,status:h.status,
      floor:h.floor
    }));
  // Conservation checks are independent of the report and use genuine
  // final store state. Starting reserve is zero. No external material source.
  for(const id of ["iron-ore","coal","ghoul-leather"]){
    if((metrics.materialsBought[id]??0)-(metrics.materialsConsumed[id]??0)!==
       store.state.shopEconomy.materialStorage[id])throw Error("Material ledger imbalance: "+id);
  }
  for(const id of FORGE_OUTPUTS){
    const onShelves=store.state.shopEconomy.slots.filter(s=>s.itemId===id)
      .reduce((sum,s)=>sum+s.quantity,0);
    if((metrics.craftedUnits[id]??0)!==(metrics.salesUnits[id]??0)+
       store.state.shopEconomy.bag[id]+onShelves)
      throw Error("Forged merchandise ledger imbalance: "+id);
  }
  delete metrics.nextRequestId;
  // Daily per-hero telemetry is intentionally retained in the JSON artifact,
  // not dumped as a huge single line into GitHub's job log.
  const {daily,lifetimeHeroes,...progressionSummary}=metrics.progression;
  // Detailed context strata stay in the artifact to bound the job-log line.
  console.log("AUDIT_REPORT "+JSON.stringify({...metrics,progression:progressionSummary,combatExposure:exposureSummary}));
  return metrics;
}
const reports=[],failures=[];
console.log("AUDIT_START "+JSON.stringify({DAYS,SEED,MODES,commit:process.env.GITHUB_SHA??"local"}));
for(const mode of MODES){
  try{reports.push(run(mode));}
  catch(error){
    const failure={mode,message:String(error),stack:error?.stack??""};
    failures.push(failure);
    console.error("AUDIT_FAILURE "+JSON.stringify(failure));
  }
}
writeFileSync("gameplay-100day-audit.json",JSON.stringify({reports,failures},null,2));
if(failures.length)process.exitCode=1;