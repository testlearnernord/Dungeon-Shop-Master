// Diagnostic runner only. Never called by gameplay or the normal PR CI.
// Executes the real GameStore/clock/combat engine with explicit scripted
// merchant actions. Physical NPC walking is NOT emulated in Node.
import { writeFileSync } from "node:fs";
import { GameStore } from "../../src/game/gameStore.ts";
import { createGameState } from "../../src/game/gameState.ts";
import { forecastShoppingIntents } from "../../src/game/shopperIntents.ts";
import { ITEMS } from "../../src/game/economy.ts";

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
const targets = {bread:3,"healing-herb":3,"iron-sword":2,"leather-vest":2};
const slotIds = {bread:"shelf-1-slot-1","healing-herb":"shelf-1-slot-2",
  "iron-sword":"shelf-1-slot-3","leather-vest":"shelf-1-slot-4"};
const eligibleSkus = mode => mode==="full" ? catalog :
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
    abstractLootTokens:sum(living,h=>h.inventory.loot),
    heroesWithTwoLootTokens:living.filter(h=>h.inventory.loot>=2).length,
    heroPlans:counts(s.liveDungeon.plans.map(p=>p.action)),
    worldSiteCycles:sum(s.earlyDungeonWorlds??[],w=>w.world.siteCycles?.length??0),
    floorsCleared:s.dungeonFloors.filter(f=>f.cleared).map(f=>f.floor),
    activeCombats:s.liveDungeon.combats.length+(s.liveDungeon.bossCombat?1:0),
    events:s.events.length,
    unrecoveredFinds:sum(living,h=>sum(Object.values(h.inventory.finds??{}),v=>v??0)),
  };
}
function setup(mode) {
  const store=new GameStore(createGameState(SEED));
  if(mode!=="absent")for(const draft of placements){
    const response=store.placeFurniture(draft);
    if(response!=="Shelf placement saved.")throw Error("Shelf setup rejected: "+response);
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
      if(!available){
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
function actShop(store,mode,metrics){
  // All shop service and door completion below are externally scripted
  // idealized player/NPC actions. They use actual game mutations, not direct
  // balance/HP/stat edits, but do not model a human's movement or timing.
  if(mode!=="absent")restock(store,mode,metrics);
  const people=store.state.adventurers.filter(h=>h.status==="at-shop");
  for(const hero of people){
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
          store.completePhysicalShopExit(hero.id,13);
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
      metrics.unservedCustomers++;
    }
  }
  // Model the observed exit at the real door through its original API.
  // This explicitly replaces the unavailable Babylon pedestrian simulator.
  for(const hero of store.state.adventurers.filter(h=>h.status==="departing")){
    if(store.completePhysicalShopExit(hero.id,13))metrics.gateExits++;
  }
}
function summarizeEvents(metrics,added,knownDead){
  for(const e of added){
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
}
function classifyDeaths(metrics,previous,state,added) {
  const old=new Map(previous.map(h=>[h.id,h]));
  for(const hero of state.adventurers){
    if(hero.status!=="dead"||old.get(hero.id)?.status==="dead")continue;
    const relevant=added.filter(e=>e.adventurerId===hero.id);
    const replay=relevant.find(e=>(e.dungeonReplay||e.level7Replay)&&
      (e.dungeonReplay?.steps?.some(st=>st.action==="death")||
       e.level7Replay?.steps?.some(st=>st.action==="death")||
       e.dungeonReplay?.encounters?.length||
       e.level7Replay?.encounters?.length));
    const steps=replay?.dungeonReplay?.steps??replay?.level7Replay?.steps??[];
    const encounters=replay?.dungeonReplay?.encounters??replay?.level7Replay?.encounters??[];
    let cause=encounters.length?"combat":
      steps.some(step=>step.action==="trap")?"trap":"unclassified";
    if(relevant.some(e=>e.type==="level6-combat"))cause="boss";
    add(metrics.deathCauses,cause,1);
    add(metrics.deathFloors,String(hero.floor),1);
    metrics.deathRecords.push({day:state.day,id:hero.id,level:hero.level,
      floor:hero.floor,cause,weapon:!!hero.equipment.weapon,armor:!!hero.equipment.armor});
  }
}
function run(mode){
  const store=setup(mode);
  const initial=snap(store.state,0);
  const metrics={
    mode,seed:SEED,daysRequested:DAYS,model:"game engine, scripted storefront/observed exit",
    starting:initial, milestones:[initial], eventTypes:{}, salesUnits:{},
    salesRevenue:{},healingUsed:{},credits:{},replayStepActions:{},
    encounterOutcomes:{}, deathCauses:{},deathFloors:{},deathRecords:[],
    wholesaleUnits:{},wholesaleSpent:0,influxGold:0,
    lateEventTypes:{}, xpGrowthDays:[], servedCustomers:0,
    unservedCustomers:0,gateExits:0,failedCheckout:{},nextRequestId:1,
  };
  for(let completed=1;completed<=DAYS;completed++){
    const before=store.state.adventurers;
    const firstEvent=store.state.events.length;
    const startDay=store.state.day;
    for(let step=0;step<144;step++){
      actShop(store,mode,metrics);
      store.advanceWorldTime(200);
    }
    actShop(store,mode,metrics);
    store.endDay();
    if(store.state.day!==startDay+1)throw Error("World day did not advance");
    const added=store.state.events.slice(firstEvent);
    summarizeEvents(metrics,added);
    if(completed>20)for(const e of added)add(metrics.lateEventTypes,e.type,1);
    for(const e of added.filter(e=>e.type==="influx")){
      const newcomer=store.state.adventurers.find(h=>h.id===e.adventurerId);
      if(newcomer)metrics.influxGold+=newcomer.gold;
    }
    if(sum(before,h=>h.xp)!==sum(store.state.adventurers,h=>h.xp))
      metrics.xpGrowthDays.push(completed);
    classifyDeaths(metrics,before,store.state,added);
    const result=snap(store.state,completed);
    if([1,5,10,20,25,50,75,100,150,200].includes(completed)||
       completed===DAYS)metrics.milestones.push(result);
    if(completed%10===0||completed===DAYS)
      console.log("AUDIT_PROGRESS "+JSON.stringify({
        mode,completed,living:result.living,dead:result.dead,
        shopGold:result.shopGold,heroesGold:result.heroGoldLiving,
        peakLevel:result.peakLevel,events:result.events
      }));
  }
  const final=snap(store.state,DAYS);
  metrics.final=final;
  metrics.newHeroes=sum(store.state.events,e=>e.type==="influx"?1:0);
  metrics.paidUnits=sum(Object.values(metrics.salesUnits),x=>x);
  metrics.paidGold=sum(Object.values(metrics.salesRevenue),x=>x);
  metrics.debtOutstanding=sum(store.state.shopDebts,d=>d.outstandingGold);
  metrics.estimatedDungeonGoldCreated=final.totalRecordedGold-
    initial.totalRecordedGold+metrics.wholesaleSpent-metrics.influxGold;
  metrics.lastXpGrowthDay=metrics.xpGrowthDays.at(-1)??null;
  metrics.remainingGoods={bag:store.state.shopEconomy.bag,
    shelves:store.state.shopEconomy.slots.map(s=>({itemId:s.itemId,quantity:s.quantity}))};
  metrics.topSurvivors=store.state.adventurers.filter(h=>h.status!=="dead")
    .sort((a,b)=>b.xp-a.xp).slice(0,12).map(h=>({
      id:h.id,level:h.level,xp:h.xp,lootTokens:h.inventory.loot,role:h.role,
      hp:h.health,maxHp:h.stats.maxHealth,gold:h.gold,
      weapon:h.equipment.weapon,armor:h.equipment.armor,status:h.status,
      floor:h.floor
    }));
  delete metrics.nextRequestId;
  console.log("AUDIT_REPORT "+JSON.stringify(metrics));
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