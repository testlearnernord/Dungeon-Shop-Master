import test from "node:test";
import assert from "node:assert/strict";
import {createGameState} from "../../src/game/gameState.ts";
import {buyWholesale,createEmptyShelfSlots,tradeAtStartOfDay}
  from "../../src/game/economy.ts";
import {craftAtCellarForge} from "../../src/game/cellarForge.ts";
import {buyHeroDungeonFind} from "../../src/game/dungeonBuyback.ts";
import {equipmentEffects,needsGearUpgrade} from "../../src/game/gearCatalog.ts";
import {createSave,parseSave} from "../../src/game/campaignSave.ts";
import {rollDungeonSiteLoot} from "../../src/game/dungeonLoot.ts";
import {caveTrollPartyOptions} from "../../src/game/sharedBossCombat.ts";

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

test("a crafted T2 weapon sells via genuine stocked slot, not phantom gear",()=>{
  const original=createGameState(7351);
  const dps=original.adventurers.find(h=>h.role==="DPS")!;
  assert(dps);
  const hero={...dps,gold:200,status:"at-shop" as const,floor:"shop" as const,
    equipment:{weapon:"Spear",armor:"Leather Vest"}};
  const slots=createEmptyShelfSlots("shelf-1");
  const [first,...rest]=slots;
  const selling={...original,adventurers:original.adventurers.map(h=>
    h.id===hero.id?hero:h),
    shopEconomy:{...original.shopEconomy,slots:[
      {...first,itemId:"forged-spear" as const,quantity:1},...rest],
    }};
  const result=tradeAtStartOfDay(selling,1);
  const next=result.adventurers.find(h=>h.id===hero.id)!;
  assert.equal(next.equipment.weapon,"Forged Spear");
  assert.equal(result.economy.balance,
    selling.shopEconomy.balance+25);
  assert.equal(result.economy.slots[0].quantity,0);
  assert(result.events.some(e=>e.type==="sale"&&
    e.itemId==="forged-spear"&&e.adventurerId===hero.id));
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
