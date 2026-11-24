import {Quickbar,quickbarIndexForKey} from "../../src/game/quickbar.ts";
import test from "node:test";
import assert from "node:assert/strict";
import {createGameState} from "../../src/game/gameState.ts";
import type {AdventurerState} from "../../src/game/adventurers.ts";
import {buyWholesale,ECONOMY,ITEMS}
  from "../../src/game/economy.ts";
import {craftAtCellarForge} from "../../src/game/cellarForge.ts";
import {buyHeroDungeonFind} from "../../src/game/dungeonBuyback.ts";
import {equipmentEffects,needsGearUpgrade} from "../../src/game/gearCatalog.ts";
import {createSave,parseSave} from "../../src/game/campaignSave.ts";
import {rollDungeonSiteLoot,distributeDungeonFinds} from "../../src/game/dungeonLoot.ts";
import {caveTrollPartyOptions} from "../../src/game/sharedBossCombat.ts";
import {GameStore} from "../../src/game/gameStore.ts";
import {createStockedShopState} from "./shopFixtures.ts";
import {forecastShoppingIntents} from "../../src/game/shopperIntents.ts";
import {cartTotal} from "../../src/game/shopCarts.ts";
import {generateExpeditionLayout,dungeonNeighbors,dungeonShortestPath,dungeonDownStair} from "../../src/game/dungeonLayout.ts";
import {prepareSpatialDungeonCombat,emptySpatialDungeonWorld} from "../../src/game/spatialDungeonExploration.ts";
import {activateLiveDungeon,DUNGEON_STEP_INTERVAL_TICKS,LIVE_COMBAT_INTERVAL_TICKS} from "../../src/game/liveDungeonRuntime.ts";
import {heroProgression} from "../../src/game/heroProgression.ts";
import {availableDungeonOffers} from "../../src/game/dungeonBuyback.ts";
import {chooseLiveHeroDungeonDecision} from "../../src/game/dungeonDecisions.ts";

test("T2 can never be bought wholesale; real recipes consume exactly their materials",()=>{
  const initial=createGameState(7351);
  const blocked=buyWholesale(initial,"forged-sword-shield",1);
  assert.equal(blocked.state,initial);
  assert.match(blocked.message,/forged/i);
  const empty=craftAtCellarForge(initial,"forged-sword-shield");
  assert.equal(empty.state,initial);
  const stocked={...initial,shopEconomy:{...initial.shopEconomy,
    materialStorage:{"iron-ore":1,coal:1,"ghoul-leather":2}}};
  const sword=craftAtCellarForge(stocked,"forged-sword-shield");
  assert.notEqual(sword.state,stocked);
  assert.equal(sword.state.shopEconomy.bag["forged-sword-shield"],1);
  assert.equal(sword.state.shopEconomy.materialStorage["iron-ore"],0);
  assert.equal(sword.state.shopEconomy.materialStorage.coal,0);
  assert.equal(sword.state.shopEconomy.materialStorage["ghoul-leather"],2);
  const noDouble=craftAtCellarForge(sword.state,"forged-spear");
  assert.equal(noDouble.state,sword.state,
    "one shared ore+coal pair cannot be spent by two recipes");
  const leather=craftAtCellarForge(sword.state,"ghoul-leather-vest");
  assert.equal(leather.state.shopEconomy.bag["ghoul-leather-vest"],1);
  assert.equal(leather.state.shopEconomy.materialStorage["ghoul-leather"],0);
  assert.equal(craftAtCellarForge(leather.state,"ghoul-leather-vest").state,
    leather.state);
  assert.deepEqual(parseSave(JSON.stringify(createSave(leather.state))),
    leather.state,"current strict save persists every material and crafted SKU");
});

test("a real hero-owned ore and coal buyback pays gold before Galvik can forge",()=>{
  const state=createGameState(7351);
  const hero=state.adventurers.find(h=>h.status==="at-shop"&&h.floor==="shop")!;
  assert(hero);
  const found={...hero,inventory:{...hero.inventory,
    finds:{"iron-ore":1,coal:1}}};
  const recovered={...state,adventurers:state.adventurers.map(h=>
    h.id===hero.id?found:h)};
  const boughtOre=buyHeroDungeonFind(recovered,hero.id,"iron-ore");
  assert.notEqual(boughtOre.state,recovered);
  const boughtCoal=buyHeroDungeonFind(boughtOre.state,hero.id,"coal");
  assert.equal(boughtCoal.state.shopEconomy.materialStorage["iron-ore"],1);
  assert.equal(boughtCoal.state.shopEconomy.materialStorage.coal,1);
  const payments=state.shopEconomy.balance-
    boughtCoal.state.shopEconomy.balance;
  assert(payments>0,"buyback requires genuine merchant gold");
  const seller=boughtCoal.state.adventurers.find(h=>h.id===hero.id)!;
  assert.equal(seller.gold,hero.gold+payments);
  assert.equal(Object.keys(seller.inventory.finds??{}).length,0);
  const crafted=craftAtCellarForge(boughtCoal.state,"forged-staff");
  assert.equal(crafted.state.shopEconomy.bag["forged-staff"],1);
  assert.deepEqual(parseSave(JSON.stringify(createSave(crafted.state))),
    crafted.state);
});

test("Tank, DD and Healer each own one T1/T2 weapon family, shared leather armor",()=>{
  const none={weapon:null,armor:null};
  const classes=[
    ["tank","iron-sword","forged-sword-shield"],
    ["DPS","spear","forged-spear"],
    ["healer","staff","forged-staff"],
  ] as const;
  for(const [role,t1,t2] of classes){
    assert(needsGearUpgrade(role,none,t1));
    assert(needsGearUpgrade(role,none,t2));
    const names={
      "iron-sword":"Iron Sword","spear":"Spear","staff":"Staff",
    } as const;
    const upgraded={weapon:names[t1],armor:null};
    assert(!needsGearUpgrade(role,upgraded,t1));
    assert(needsGearUpgrade(role,upgraded,t2));
    const craftedName={
      "forged-sword-shield":"Forged Sword & Shield",
      "forged-spear":"Forged Spear",
      "forged-staff":"Forged Staff",
    } as const;
    const highest={weapon:craftedName[t2],armor:"Ghoul Leather Vest"};
    assert(!needsGearUpgrade(role,highest,t1));
    assert(!needsGearUpgrade(role,highest,"leather-vest"));
    assert(!needsGearUpgrade(role,highest,t2));
    for(const [otherRole,otherT1] of classes)
      if(otherRole!==role)
        assert(!needsGearUpgrade(role,none,otherT1));
    const before=equipmentEffects(role,{weapon:names[t1],armor:"Leather Vest"});
    const after=equipmentEffects(role,highest);
    assert(after.damage>before.damage);
    assert(after.armor>before.armor);
    assert(after.trapProtection>before.trapProtection);
    if(role==="healer")assert(after.magicHeals>before.magicHeals);
    if(role==="DPS")assert(after.reach>before.reach);
  }
});

// A bounded integration fixture, not an economy soak: the real deterministic
// loot table and ownership allocator supply materials. Shop arrival and budget
// are controlled so we can isolate every class's real checkout transaction.
for(const [role,t1,t2,t2Name] of [
  ["tank","Iron Sword","forged-sword-shield","Forged Sword & Shield"],
  ["DPS","Spear","forged-spear","Forged Spear"],
  ["healer","Staff","forged-staff","Forged Staff"],
] as const){
  test("forge loop: "+role+" loot ownership, paid buyback, crafting, reserved till and next combat",()=>{
    const original=createStockedShopState(7351);
    const buyer=original.adventurers.find(hero=>hero.role===role);
    assert(buyer);
    const hero={...buyer,status:"at-shop" as const,floor:"shop" as const,
      gold:100,health:buyer.stats.maxHealth,
      equipment:{weapon:t1,armor:"Leather Vest"},
      inventory:{...buyer.inventory,bread:ECONOMY.breadTarget,
        healing:ECONOMY.healingTarget,finds:{}}};
    let owner:AdventurerState=hero;
    const required={"iron-ore":1,coal:1,"ghoul-leather":2} as const;
    // Collect only actual generated drops; never inject finished T2 into stock.
    const loot=Array.from({length:150},(_,cycle)=>
      rollDungeonSiteLoot(7351,4,"monster-0",cycle,"monster",3).itemIds);
    for(let cycle=0;cycle<loot.length;cycle++){
      const next=distributeDungeonFinds([owner],loot[cycle],"monster-0",cycle)[0];
      owner=next;
      if(Object.entries(required).every(([id,n])=>
        (owner.inventory.finds?.[id as keyof typeof required]??0)>=n))break;
    }
    for(const id of Object.keys(required) as (keyof typeof required)[])
      assert((owner.inventory.finds?.[id]??0)>=required[id]);
    const initial={...original,adventurers:original.adventurers.map(h=>
      h.id===hero.id?owner:{...h,gold:0}),
      shopEconomy:{...original.shopEconomy,slots:original.shopEconomy.slots.map(slot=>
        ({...slot,itemId:null,quantity:0}))}};
    const store=new GameStore(initial);
    const goldBefore=initial.shopEconomy.balance+owner.gold;
    const currentHero=()=>store.state.adventurers.find(h=>h.id===hero.id)!;
    const reload=()=>store.restore(parseSave(JSON.stringify(createSave(store.state))));
    for(const id of Object.keys(required) as (keyof typeof required)[])
      for(let i=0;i<required[id];i++)assert.match(store.buyDungeonFind(hero.id,id),/bought/);
    const costs=initial.shopEconomy.balance-store.state.shopEconomy.balance;
    assert(costs>0);
    assert.equal(currentHero().gold,owner.gold+costs);
    assert.deepEqual(store.state.shopEconomy.materialStorage,required);
    const tradeGold=store.state.shopEconomy.balance;
    assert.match(store.craftAtForge(t2),/Forged 1/);
    assert.match(store.craftAtForge("ghoul-leather-vest"),/Forged 1/);
    assert.equal(store.state.shopEconomy.balance,tradeGold);
    assert.deepEqual(store.state.shopEconomy.materialStorage,
      {"iron-ore":0,coal:0,"ghoul-leather":0});
    assert.equal(store.state.shopEconomy.bag[t2],1);
    assert.equal(store.state.shopEconomy.bag["ghoul-leather-vest"],1);
    const exhausted=store.state;
    store.craftAtForge(t2);
    assert.equal(store.state,exhausted);
    reload();
    const slots=store.state.shopEconomy.slots;
    assert.match(store.transfer(slots[0].id,t2,"stock"),/Placed/);
    assert.match(store.transfer(slots[1].id,"ghoul-leather-vest","stock"),/Placed/);
    assert.equal(store.state.shopEconomy.bag[t2],0);
    assert.equal(store.state.shopEconomy.bag["ghoul-leather-vest"],0);
    const intent=forecastShoppingIntents(store.state).get(hero.id);
    assert(intent);
    assert.deepEqual(intent.items.map(line=>line.itemId),[t2,"ghoul-leather-vest"]);
    const unpaidGold=currentHero().gold;
    for(const line of intent.items)
      assert.match(store.pickUpShopItem(hero.id,line.slotId),/picked up/);
    assert.equal(store.state.shopEconomy.balance,tradeGold);
    assert.equal(currentHero().gold,unpaidGold);
    assert.deepEqual(currentHero().equipment,hero.equipment);
    assert.equal(store.state.events.filter(e=>e.type==="sale").length,0);
    const cart=store.state.shopCarts.find(c=>c.heroId===hero.id)!;
    const due=cartTotal(cart);
    assert.equal(due,ITEMS.find(i=>i.id===t2)!.salePrice+
      ITEMS.find(i=>i.id==="ghoul-leather-vest")!.salePrice);
    assert.equal(store.state.shopEconomy.slots[0].quantity,0);
    assert.equal(store.state.shopEconomy.slots[1].quantity,0);
    reload();
    assert.match(store.payReservedCart(hero.id),/paid/);
    const paid=store.state;
    assert.equal(paid.shopEconomy.balance,tradeGold+due);
    assert.equal(currentHero().gold,unpaidGold-due);
    assert.equal(paid.shopEconomy.balance+currentHero().gold,goldBefore);
    assert.deepEqual(currentHero().equipment,{weapon:t2Name,armor:"Ghoul Leather Vest"});
    assert.equal(paid.shopCarts.length,0);
    assert.equal(paid.events.filter(e=>e.type==="sale"&&e.saleChannel==="manual").length,2);
    assert.equal(paid.shopEconomy.dailySales.revenue,due);
    store.payReservedCart(hero.id);
    assert.equal(store.state,paid);
    reload();
    assert.deepEqual(store.state,paid);
    // A normal generated Ghoul encounter consumes the purchased gear, not a
    // separate combat lab or a manually assigned T2 combatant.
    const layout=generateExpeditionLayout(7351,3);
    const site=layout.features.find(f=>f.kind==="monster"&&dungeonNeighbors(layout,f).length);
    assert(site);
    const approach=dungeonNeighbors(layout,site)[0];
    const actor=(equipment:ReturnType<typeof currentHero>["equipment"])=>{
      const entrant={...currentHero(),equipment,status:"exploring" as const,floor:3 as const};
      const encounter=prepareSpatialDungeonCombat([entrant],site,layout.seed,layout,approach,0,true);
      return encounter.options.actors.find(a=>a.id===hero.id)!;
    };
    const before=actor(hero.equipment),after=actor(currentHero().equipment);
    assert(after.damage>before.damage);
    assert(after.armor>before.armor);
    if(role==="healer")assert((after.magicHeals??0)>(before.magicHeals??0));
  });
}

test("full bag rejects forging without consuming paid materials; stocking frees exactly one slot",()=>{
  const original=createStockedShopState(7351);
  const initial={...original,shopEconomy:{...original.shopEconomy,
    materialStorage:{"iron-ore":1,coal:1,"ghoul-leather":2},
    bag:{...Object.fromEntries(ITEMS.map(i=>[i.id,0])) as typeof original.shopEconomy.bag,
      bread:ECONOMY.bagCapacity}}};
  const store=new GameStore(initial);
  assert.match(store.craftAtForge("forged-spear"),/bag is full/i);
  assert.equal(store.state,initial);
  const empty=store.state.shopEconomy.slots.find(slot=>slot.quantity===0)!;
  assert.match(store.transfer(empty.id,"bread","stock"),/Placed/);
  assert.match(store.craftAtForge("forged-spear"),/Forged 1/);
  assert.equal(store.state.shopEconomy.bag["forged-spear"],1);
  assert.equal(Object.values(store.state.shopEconomy.bag).reduce((sum,n)=>sum+n,0),
    ECONOMY.bagCapacity);
  assert.deepEqual(store.state.shopEconomy.materialStorage,
    {"iron-ore":0,coal:0,"ghoul-leather":2});
  const full=store.state;
  assert.match(store.craftAtForge("ghoul-leather-vest"),/bag is full/i);
  assert.equal(store.state,full);
  assert.deepEqual(parseSave(JSON.stringify(createSave(full))),full);
});

test("Ghoul Leather originates in deterministic monster rewards, never in chests",()=>{
  let sampled=false;
  for(let cycle=0;cycle<150;cycle++){
    const drop=rollDungeonSiteLoot(7351,4,"monster-0",cycle,"monster",3);
    const repeat=rollDungeonSiteLoot(7351,4,"monster-0",cycle,"monster",3);
    assert.deepEqual(drop,repeat);
    if(drop.itemIds.includes("ghoul-leather"))sampled=true;
    const chest=rollDungeonSiteLoot(7351,4,"chest-0",cycle,"treasure",1);
    assert(!chest.itemIds.includes("ghoul-leather"));
  }
  assert(sampled);
});

test("true Floor-10 60Hz party options gain real class-specific T2 bonuses",()=>{
  const population=createGameState(7351).adventurers;
  const roles=["tank","DPS","healer"] as const;
  const base=roles.map(role=>{
    const hero=population.find(h=>h.role===role);
    assert(hero,"seed must provide real character role "+role);
    return {...hero,bossPass:true};
  });
  const t1=base.map(hero=>({...hero,equipment:{
    weapon:hero.role==="tank"?"Iron Sword":
      hero.role==="DPS"?"Spear":"Staff",armor:"Leather Vest",
  }}));
  const t2=base.map(hero=>({...hero,equipment:{
    weapon:hero.role==="tank"?"Forged Sword & Shield":
      hero.role==="DPS"?"Forged Spear":"Forged Staff",
    armor:"Ghoul Leather Vest",
  }}));
  const before=caveTrollPartyOptions(t1,918);
  const after=caveTrollPartyOptions(t2,918);
  for(const hero of base){
    const first=before.actors.find(actor=>actor.id===hero.id)!;
    const upgraded=after.actors.find(actor=>actor.id===hero.id)!;
    assert(upgraded.damage>first.damage,
      "the boss shares genuine T2 gear damage, not merely item names");
    assert(upgraded.armor>first.armor);
    if(hero.role==="healer")
      assert((upgraded.magicHeals??0)>(first.magicHeals??0));
  }
  assert.deepEqual(after,caveTrollPartyOptions(t2,918));
});

/** A controlled veteran and previously cleared sites, with one genuine
 * seeded unresolved reward site. The scheduler, fights and loot are real. */
function supplySiteFixture(kind:"monster"|"treasure"){
  for(let seed=7351;seed<7400;seed++){
    const layout=generateExpeditionLayout(seed,1);
    const site=layout.features.find(f=>f.kind===kind&&
      dungeonNeighbors(layout,f).length>0&&
      dungeonShortestPath(layout,layout.entrance,f).length<24&&
      rollDungeonSiteLoot(seed,1,f.id,0,kind).itemIds.some(id=>
        kind==="monster"?id==="ghoul-leather":id==="iron-ore"||id==="coal"));
    if(!site)continue;
    const base=createStockedShopState(seed,{dailyInflux:0,maxActive:10});
    const source=base.adventurers[3];
    const hero:AdventurerState={...source,role:"DPS",status:"exploring",
      floor:1,health:200,gold:100,
      stats:{...source.stats,maxHealth:200,agility:160,strength:160},
      equipment:{weapon:"Spear",armor:"Leather Vest"},
      inventory:{bread:ECONOMY.breadTarget,healing:ECONOMY.healingTarget,
        finds:kind==="monster"?{"iron-ore":1,coal:1,"ghoul-leather":1}:{}}};
    const approach=dungeonNeighbors(layout,site)[0];
    const visited=layout.tiles.flatMap((tile,index)=>
      tile!=="wall"&&index!==site.z*layout.width+site.x?[index]:[]);
    const store=new GameStore({...base,adventurers:base.adventurers.map(h=>
      h.id===hero.id?hero:{...h,status:"off-duty",floor:"away",
        shopStayDays:0,offDutyUntilDay:4}),
      dungeonWorlds:[{floor:1,world:{...emptySpatialDungeonWorld(),
        resolvedFeatureIds:layout.features.filter(f=>f.id!==site.id).map(f=>f.id),
        heroes:[{heroId:hero.id,...approach,visited}]}}],
      shopEconomy:{...base.shopEconomy,slots:base.shopEconomy.slots.map(slot=>
        ({...slot,itemId:null,quantity:0}))}});
    return {store,hero,site,layout,seed};
  }
  throw Error("No suitable deterministic physical salvage site");
}

test("LIVE chest settlement creates individually owned goods, not shop stock",()=>{
  const {store,hero,site,seed}=supplySiteFixture("treasure");
  const expected=rollDungeonSiteLoot(seed,1,site.id,0,"treasure").itemIds;
  store.enableLiveDungeon();
  store.advanceWorldTime(DUNGEON_STEP_INTERVAL_TICKS);
  const after=store.state.adventurers.find(h=>h.id===hero.id)!;
  const counts=Object.fromEntries([...new Set(expected)].map(id=>
    [id,expected.filter(item=>item===id).length]));
  assert.deepEqual(after.inventory.finds,counts);
  assert(store.state.dungeonWorlds.find(w=>w.floor===1)!.world.resolvedFeatureIds.includes(site.id));
  assert.deepEqual(store.state.shopEconomy.materialStorage,{"iron-ore":0,coal:0,"ghoul-leather":0});
  assert.equal(availableDungeonOffers(store.state).length,0);
  assert.deepEqual(parseSave(JSON.stringify(createSave(store.state))),store.state);
});

test("LIVE Ghoul victory initiates a physical salvage return and funds the next expedition",()=>{
  const {store,hero,site,layout}=supplySiteFixture("monster");
  const current=()=>store.state.adventurers.find(h=>h.id===hero.id)!;
  store.enableLiveDungeon();
  store.advanceWorldTime(DUNGEON_STEP_INTERVAL_TICKS);
  const fight=store.state.liveDungeon.combats.find(c=>c.heroIds.includes(hero.id));
  assert(fight,"The generated site must start the actual 60Hz fight");
  assert.equal(fight.encounter.featureId,site.id);
  assert.equal(availableDungeonOffers(store.state).length,0);
  assert.equal(store.state.liveDungeon.returns.length,0);
  for(let i=0;i<60&&store.state.liveDungeon.combats.some(c=>c.heroIds.includes(hero.id));i++)
    store.advanceWorldTime(LIVE_COMBAT_INTERVAL_TICKS);
  const result=store.state.events.find(e=>e.adventurerId===hero.id&&
    e.dungeonReplay?.encounters.some(encounter=>encounter.featureId===site.id));
  assert(result?.dungeonReplay);
  assert.equal(result.dungeonReplay.encounters[0].combat.outcome,"heroes");
  assert.equal(current().inventory.finds?.["ghoul-leather"],2);
  assert(store.state.liveDungeon.returns.some(j=>j.heroId===hero.id&&j.phase==="backtrack"));
  assert.equal(current().status,"exploring");
  assert.equal(availableDungeonOffers(store.state).length,0);
  const settledWorld=store.state.dungeonWorlds.find(w=>w.floor===1)!.world;
  assert(settledWorld.resolvedFeatureIds.includes(site.id));
  assert(!settledWorld.monsters?.some(monster=>monster.id===site.id),
    "Victory retires the map occupant in the same authoritative tick");
  assert.equal(store.state.liveDungeon.combats.some(c=>c.encounter.featureId===site.id),false);
  const restored=new GameStore(parseSave(JSON.stringify(createSave(store.state))));
  const position=()=>store.state.dungeonWorlds.find(w=>w.floor===1)!.world.heroes.find(h=>h.heroId===hero.id)!;
  let portalObserved=false;
  for(let i=0;i<600&&current().status!=="at-shop";i++){
    const before=position();
    store.advanceWorldTime(LIVE_COMBAT_INTERVAL_TICKS);
    restored.advanceWorldTime(LIVE_COMBAT_INTERVAL_TICKS);
    const after=position();
    if(before.x!==after.x||before.z!==after.z)
      assert(dungeonNeighbors(layout,before).some(p=>p.x===after.x&&p.z===after.z));
    if(current().status==="traveling"){
      portalObserved=true;
      assert.equal(after.x,layout.entrance.x);
      assert.equal(after.z,layout.entrance.z);
      assert.equal(availableDungeonOffers(store.state).length,0);
    }
  }
  assert(portalObserved);
  assert.equal(current().status,"at-shop");
  assert.deepEqual(store.state,restored.state);
  assert.equal(store.state.events.filter(e=>e.type==="shop-arrival"&&e.adventurerId===hero.id).length,1);
  const gold=store.state.shopEconomy.balance+current().gold;
  for(const [id,n] of [["iron-ore",1],["coal",1],["ghoul-leather",2]] as const)
    for(let i=0;i<n;i++)assert.match(store.buyDungeonFind(hero.id,id),/bought/);
  assert.equal(availableDungeonOffers(store.state).filter(o=>o.heroId===hero.id).length,0);
  assert.match(store.craftAtForge("forged-spear"),/Forged 1/);
  assert.match(store.craftAtForge("ghoul-leather-vest"),/Forged 1/);
  const slots=store.state.shopEconomy.slots;
  assert.match(store.transfer(slots[0].id,"forged-spear","stock"),/Placed/);
  assert.match(store.transfer(slots[1].id,"ghoul-leather-vest","stock"),/Placed/);
  const wanted=forecastShoppingIntents(store.state).get(hero.id)!;
  for(const line of wanted.items)assert.match(store.pickUpShopItem(hero.id,line.slotId),/picked up/);
  assert.equal(current().equipment.weapon,"Spear");
  assert.match(store.payReservedCart(hero.id),/paid/);
  assert.deepEqual(current().equipment,{weapon:"Forged Spear",armor:"Ghoul Leather Vest"});
  assert.equal(store.state.shopEconomy.balance+current().gold,gold);
  assert.equal(store.completePhysicalShopExit(hero.id,11),false);
  assert.equal(store.completePhysicalShopExit(hero.id,13),true);
  assert.equal(current().status,"off-duty");
  assert.equal(current().offDutyUntilDay,4);
  for(let day=2;day<=4;day++){
    store.endDay();
    assert.equal(store.state.day,day);
    assert.deepEqual(current().equipment,{weapon:"Forged Spear",armor:"Ghoul Leather Vest"});
    assert.equal(current().status,day<4?"off-duty":"exploring");
  }
  assert.equal(current().floor,1);
  assert.equal(position().x,layout.entrance.x);
  assert.equal(position().z,layout.entrance.z);
  assert.deepEqual(parseSave(JSON.stringify(createSave(store.state))),store.state);
  // Same successful replay, but no new owned loot: no fresh haul.
  const stale={...hero,inventory:{...hero.inventory,finds:{"iron-ore":4}}};
  assert.notEqual(chooseLiveHeroDungeonDecision(stale,undefined,
    result.dungeonReplay,undefined,undefined,false,4).action,"shop");
  assert.equal(chooseLiveHeroDungeonDecision(stale,undefined,
    result.dungeonReplay,undefined,undefined,false,3).action,"shop");
});

test("real Level-10 T2 party survives active and archived save validation",()=>{
  const seed=7351,base=createGameState(seed);
  const layout=generateExpeditionLayout(seed,9);
  const down=dungeonDownStair(layout);
  const visited=dungeonShortestPath(layout,layout.entrance,down)
    .map(p=>p.z*layout.width+p.x);
  assert(visited.length>=2);
  const members=(["tank","DPS","healer"] as const).map(role=>{
    const hero=base.adventurers.find(h=>h.role===role);
    assert(hero);
    const veteran:AdventurerState={...hero,level:12,xp:1100,bossPass:true,
      floor:9,status:"exploring",equipment:{
        weapon:role==="tank"?"Forged Sword & Shield":
          role==="DPS"?"Forged Spear":"Forged Staff",
        armor:"Ghoul Leather Vest",
      },inventory:{...hero.inventory,healing:3,bread:2}};
    return {...veteran,health:heroProgression(veteran).maxHealth};
  });
  const ids=members.map(h=>h.id);
  const active=activateLiveDungeon({...base,
    adventurers:base.adventurers.map(h=>members.find(m=>m.id===h.id)??{
      ...h,floor:"shop" as const,status:"at-shop" as const}),
    dungeonWorlds:[{floor:9 as const,world:{...emptySpatialDungeonWorld(),
      heroes:members.map(h=>({heroId:h.id,...down,visited}))}}],
    dungeonParties:[{floor:9 as const,memberIds:ids,formedDay:1}],
  });
  const store=new GameStore({...active,liveDungeon:{...active.liveDungeon,
    plans:ids.map(heroId=>({heroId,floor:9 as const,goal:"progress" as const,
      action:"descend" as const,updatedTick:0}))}});
  store.advanceWorldTime(DUNGEON_STEP_INTERVAL_TICKS);
  assert(store.state.liveDungeon.partyBossCombat);
  store.advanceWorldTime(40);
  const checkpoint=parseSave(JSON.stringify(createSave(store.state)));
  const resumed=new GameStore(checkpoint);
  store.advanceWorldTime(2200);
  resumed.advanceWorldTime(2200);
  assert.deepEqual(resumed.state,store.state);
  assert.equal(store.state.liveDungeon.partyBossCombat,null);
  const archives=store.state.events.filter(e=>e.partyBossReplay);
  assert.equal(archives.length,1);
  const tape=archives[0].partyBossReplay!;
  for(const member of members)
    assert.deepEqual(tape.actors.find(a=>a.id===member.id)?.equipment,member.equipment);
  assert.deepEqual(parseSave(JSON.stringify(createSave(store.state))),store.state);
  // Tamper only with the historical equipment identity. The gear validator
  // must reject foreign roles and slot swaps, not just accept every string.
  for(const [slot,name] of [["weapon","Forged Staff"],["armor","Forged Spear"]] as const){
    const forged=structuredClone(createSave(store.state));
    const replay=forged.payload.events.find(e=>e.partyBossReplay)!.partyBossReplay!;
    const tank=replay.actors.find(a=>a.id===members[0].id)!;
    (tank.equipment as {weapon:string|null;armor:string|null})[slot]=name;
    assert.throws(()=>parseSave(JSON.stringify(forged)),/partyBossReplay/);
  }
});

test("quickbar references support move, swap, clear and empty selection",()=>{
  const bar=new Quickbar(["bread","bread","iron-ore","forged-staff","unknown"]);
  assert.deepEqual(bar.slots,["bread",null,null,"forged-staff",null,null]);
  assert.deepEqual(new Quickbar().slots,Array(6).fill(null));
  assert(bar.bind(1,"forged-spear"));assert(bar.swap(1,3));
  assert.equal(bar.slots[1],"forged-staff");assert.equal(bar.slots[3],"forged-spear");
  assert(bar.bind(5,"bread"));assert.equal(bar.slots[0],null);
  assert(bar.select(5));assert.equal(bar.selected,"bread");
  bar.cycle(1);assert.equal(bar.selected,null);
  assert(bar.clear(3));assert.equal(bar.slots[3],null);
  assert.equal(bar.bind(7,"bread"),false);assert.equal(bar.bind(2,"iron-ore"),false);
  assert.equal(quickbarIndexForKey("Digit6"),5);assert.equal(quickbarIndexForKey("Digit0"),null);
});
