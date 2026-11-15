import {expect,test} from "@playwright/test";

/** Exercises arrival at the relocated cash register without bypassing NPC
 * pathfinding or marking a payment in the save. */
test("a single buyer can reach and request service at a rotated register",async({page})=>{
  test.setTimeout(100000);
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto("./");
  await expect(page.locator("#day")).toHaveText("Day 1");
  const buyer=await page.evaluate(async()=>{
    const {createGameState}=await import("/Dungeon-Shop-Master/src/game/gameState.ts");
    const {replaceCounterPlacement}=await import("/Dungeon-Shop-Master/src/game/shopLayout.ts");
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    const initial=createGameState(7351);
    const moved=replaceCounterPlacement(initial.shopLayout,{x:0,z:2.25,rotation:1});
    if(moved.message!=="Counter placement saved.")throw Error(moved.message);
    const hero=initial.adventurers[0];
    const state={...initial,shopLayout:moved.layout,
      adventurers:initial.adventurers.map((visitor,index)=>index===0
        ?{...visitor,status:"at-shop" as const,floor:5 as const,gold:100,
          inventory:{...visitor.inventory,bread:0}}
        :{...visitor,status:"exploring" as const,floor:4 as const,shopStayDays:0}),
      shopEconomy:{...initial.shopEconomy,
        slots:initial.shopEconomy.slots.map(slot=>
          slot.id==="shelf-1-slot-2"
            ?{...slot,itemId:"bread" as const,quantity:5}:slot)}
    };
    await new CampaignStorage().saveGame(state);
    return hero.id;
  });
  await page.reload();
  await expect(page.locator("#day")).toHaveText("Day 1");
  const ready=()=>page.evaluate(()=>{
    const hook=(window as Window&{__shopTestReadyCheckout?:()=>string|null})
      .__shopTestReadyCheckout;
    return hook?.()??null;
  });
  await expect.poll(ready,{timeout:65000,intervals:[400,800,1500]}).toBe(buyer);
  const visuals=await page.evaluate(async()=>(
    await import("/Dungeon-Shop-Master/tests/scene.ts")).inspectNpcVisuals());
  expect(visuals.visitors.find(v=>v.id===buyer)?.shoppingPhase).toBe("awaiting-checkout");
  expect(errors).toEqual([]);
});


/** Browser-only crowd test. Deliberately combines relocated furniture, eight
 * simultaneous customer spawns, and limited Waybread stock. This catches
 * actual Babylon movement failures missed by pure route allocation tests. */
test("eight incoming customers progress around relocated shelves and checkout",async({page})=>{
  test.setTimeout(110000);
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto("./");
  await expect(page.locator("#day")).toHaveText("Day 1");
  await page.evaluate(async()=>{
    const {createGameState}=await import("/Dungeon-Shop-Master/src/game/gameState.ts");
    const {replaceShelfPlacement,replaceCounterPlacement}=await import(
      "/Dungeon-Shop-Master/src/game/shopLayout.ts");
    const {shopServiceReachabilityProblem}=await import(
      "/Dungeon-Shop-Master/src/game/shopServiceReachability.ts");
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    const {ECONOMY}=await import("/Dungeon-Shop-Master/src/game/economy.ts");
    const {forecastShoppingIntents}=await import("/Dungeon-Shop-Master/src/game/shopperIntents.ts");
    const original=createGameState(7351);
    const movedShelf=replaceShelfPlacement(original.shopLayout,{
      id:"shelf-1",x:0,z:-2,rotation:1,
    });
    if(movedShelf.message!=="Shelf placement saved.")throw Error(movedShelf.message);
    const movedCounter=replaceCounterPlacement(movedShelf.layout,{
      x:0,z:2.25,rotation:1,
    });
    if(movedCounter.message!=="Counter placement saved.")
      throw Error(movedCounter.message);
    const problem=shopServiceReachabilityProblem(
      movedCounter.layout,original.level5Room);
    if(problem)throw Error(problem);
    const state={
      ...original,shopLayout:movedCounter.layout,
      adventurers:original.adventurers.map((hero,index)=>index<8
        ?{...hero,status:"at-shop" as const,floor:5 as const,
          gold:index%4===0?0:index%4===1?8:100,
          inventory:{...hero.inventory,bread:index%4===1?ECONOMY.breadTarget:0,healing:0},
          equipment:{weapon:null,armor:null}}
        :{...hero,status:"exploring" as const,floor:4 as const,shopStayDays:0}),
      shopEconomy:{...original.shopEconomy,
        slots:original.shopEconomy.slots.map(slot=>
          slot.id==="shelf-1-slot-2"||slot.id==="shelf-2-slot-2"
            ?{...slot,itemId:"bread" as const,quantity:slot.capacity}
            :{...slot,itemId:null,quantity:0})},
    };
    const reasons=[...forecastShoppingIntents(state).values()].map(x=>x.reason);
    for(const desired of ["interested","unavailable","cannot-afford"])
      if(!reasons.includes(desired))throw Error("Missing buyer scenario: "+desired);
    await new CampaignStorage().saveGame(state);
  });
  await page.reload();
  await expect(page.locator("#day")).toHaveText("Day 1");
  const read=()=>page.evaluate(async()=>(
    await import("/Dungeon-Shop-Master/tests/scene.ts")).inspectNpcVisuals());
  const starting=await read();
  expect(starting.visitors.length).toBeGreaterThanOrEqual(8);
  // Keep compact crowd breadcrumbs only when the browser test fails.
  // Successful CI stays quiet; a failing wait still exposes each hero's
  // position, intention and blocked time instead of just a generic timeout.
  const trafficSamples:unknown[]=[];
  let lastDiagnostic=-10000;
  try{
    await expect.poll(async()=>{
      const {visitors,time}=await read();
      if(time-lastDiagnostic>=10000){
        lastDiagnostic=time;
        trafficSamples.push(visitors.map(v=>({
          id:v.id.slice(-6),reason:v.shoppingReason,phase:v.shoppingPhase,
          x:Math.round(v.x*10)/10,z:Math.round(v.z*10)/10,
          remaining:v.restockRemaining,blocked:v.blockedSeconds,
        })));
      }
      const phases=visitors.map(v=>v.shoppingPhase??"");
      return phases.includes("waiting-for-credit")&&phases.includes("waiting-for-restock");
    },{timeout:80000,intervals:[800,1200,2000]}).toBe(true);
  }catch(error){
    console.error("NPC_TRAFFIC_FAILURE",JSON.stringify(trafficSamples));
    throw error;
  }
  await expect.poll(async()=>{
    const {visitors}=await read();
    return visitors.filter(visitor=>(visitor.cartUnits??0)>0 ||
      visitor.shoppingPhase==="waiting-for-restock"||
      visitor.shoppingPhase==="waiting-for-credit"||
      visitor.shoppingPhase==="awaiting-checkout").length;
  },{timeout:75000,intervals:[1000,2000,3000]}).toBeGreaterThanOrEqual(3);
  const final=await read();
  // A service place is not a magic coordinate. Customers who have actually
  // finished reaching a station must not be standing on top of another
  // stationary customer, even with rotated furniture.
  const settled=new Set(["awaiting-checkout","considering-item","waiting-for-restock",
    "waiting-for-credit","waiting-for-shelf","waiting-for-restock-overflow",
    "waiting-for-credit-overflow","checkout-overflow-wait"]);
  const stationary=final.visitors.filter(visitor=>settled.has(visitor.shoppingPhase??""));
  for(let i=0;i<stationary.length;i++)for(let j=i+1;j<stationary.length;j++){
    const a=stationary[i],b=stationary[j];
    expect(Math.hypot(a.x-b.x,a.z-b.z),a.id+" and "+b.id+
      " overlap at reserved service spots").toBeGreaterThan(0.82);
  }
  expect(final.visitors.every(visitor=>visitor.wallClear)).toBe(true);
  expect(final.visitors.some(visitor=>(visitor.cartUnits??0)>0)).toBe(true);
  expect(errors).toEqual([]);
});

/** End-to-end check of the same contextual P flow used by shelves, now with
 * a grouped bedroom prop. The Book of Debts, desk and collider must never
 * split up, and the placement must survive save/reload. */
test("contextual P moves the accounting desk with its Book of Debts and collision",async({page})=>{
  test.setTimeout(80000);
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto("./");
  await expect(page.locator("#day")).toHaveText("Day 1");
  await page.evaluate(async()=>
    (await import("/Dungeon-Shop-Master/tests/scene.ts")).aimAtDebtBook());
  await expect(page.locator("#furniture-look-prompt")).toContainText("Book of Debts");
  await page.keyboard.press("p");
  await expect(page.locator("#blueprint-panel")).toBeVisible();
  await expect(page.locator("#blueprint-panel h2")).toContainText("Accounting desk");
  await page.evaluate(async()=>
    (await import("/Dungeon-Shop-Master/tests/scene.ts"))
      .aimAtBedroomPlacement(-2.25,-9.75));
  await expect.poll(()=>
    page.locator("#blueprint-panel .blueprint-status").getAttribute("data-valid"),
    {timeout:10000}).toBe("true");
  await page.keyboard.press("r");
  await expect(page.locator("#blueprint-facing")).toContainText("90°");
  await page.mouse.click(400,300);
  await expect(page.locator("#blueprint-panel")).toBeHidden();
  await expect.poll(async()=>page.evaluate(async()=>{
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    const state=await new CampaignStorage().loadGame();
    return state?.bedroomFurniture?.find(item=>item.id==="desk")?.z;
  }),{timeout:15000}).toBe(-9.75);
  const before=await page.evaluate(async()=>(
    await import("/Dungeon-Shop-Master/tests/scene.ts")).inspectModularBedroom());
  expect(before.desk.z).toBeCloseTo(-9.75,3);
  expect(before.deskCollider.z).toBeCloseTo(-9.75,3);
  await page.reload();
  const persisted=await page.evaluate(async()=>(
    await import("/Dungeon-Shop-Master/tests/scene.ts")).inspectModularBedroom());
  expect(persisted.desk.z).toBeCloseTo(before.desk.z,3);
  expect(persisted.book.z).toBeCloseTo(before.book.z,3);
  expect(persisted.deskCollider.z).toBeCloseTo(before.deskCollider.z,3);
  expect(persisted.candleLightParent).toBe("bedroom-module-candle");
  expect(errors).toEqual([]);
});

/** Physically move both remaining fixtures through P. The sleep action and
 * roster interaction must follow their moved meshes after a full reload. */
test("movable bed still closes the day and relocated board still opens the roster",async({page})=>{
  test.setTimeout(110000);
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto("./");
  await expect(page.locator("#day")).toHaveText("Day 1");
  const api="/Dungeon-Shop-Master/tests/scene.ts";

  await page.evaluate(async(url)=>{(await import(url)).aimAtBed();},api);
  await expect(page.locator("#furniture-look-prompt")).toContainText("Galvik's bed");
  await page.keyboard.press("p");
  await expect(page.locator("#blueprint-panel h2")).toContainText("Galvik's bed");
  await page.evaluate(async(url)=>{(await import(url)).aimAtBedroomPlacement(0.75,-10);},api);
  await expect.poll(()=>
    page.locator("#blueprint-panel .blueprint-status").getAttribute("data-valid"),
    {timeout:15000}).toBe("true");
  await page.mouse.click(400,300);
  await expect(page.locator("#blueprint-panel")).toBeHidden();
  const afterBed=await page.evaluate(async(url)=>
    (await import(url)).inspectMovedBedAndBoard(),api);
  expect(afterBed.mattress.z).toBeCloseTo(-10,2);
  expect(afterBed.frame.z).toBeCloseTo(-10,1);

  await page.evaluate(async(url)=>{(await import(url)).aimAtRosterBoard();},api);
  await expect(page.locator("#furniture-look-prompt")).toContainText("Adventurer board");
  await page.keyboard.press("p");
  await expect(page.locator("#blueprint-panel h2")).toContainText("Adventurer board");
  await page.evaluate(async(url)=>{(await import(url)).aimAtMainShopWall(5.5,-7);},api);
  await expect.poll(()=>
    page.locator("#blueprint-panel .blueprint-status").getAttribute("data-valid"),
    {timeout:15000}).toBe("true");
  await page.mouse.click(400,300);
  await expect(page.locator("#blueprint-panel")).toBeHidden();
  const moved=await page.evaluate(async(url)=>(
    await import(url)).inspectMovedBedAndBoard(),api);
  expect(moved.roster.x).toBeCloseTo(5.5,2);
  expect(moved.rosterFrame.x).toBeGreaterThan(5.5);
  await expect.poll(async()=>page.evaluate(async()=>{
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    const state=await new CampaignStorage().loadGame();
    return {bed:state?.bedroomFurniture?.find(p=>p.id==="bed")?.z,
      board:state?.rosterBoard?.x};
  }),{timeout:15000}).toEqual({bed:-10,board:5.5});

  await page.reload();
  const persisted=await page.evaluate(async(url)=>
    (await import(url)).inspectMovedBedAndBoard(),api);
  expect(persisted.mattress.z).toBeCloseTo(-10,2);
  expect(persisted.roster.x).toBeCloseTo(5.5,2);
  expect(persisted.rosterFrame.x).toBeCloseTo(moved.rosterFrame.x,2);

  await page.evaluate(async(url)=>{(await import(url)).aimAtRelocatedRosterBoard();},api);
  await page.keyboard.press("e");
  await expect(page.locator("#roster-dialog")).toBeVisible();
  await page.locator("#close-roster").click();
  await page.evaluate(async(url)=>{(await import(url)).aimAtBed();},api);
  await expect(page.locator("#sleep-bed-prompt")).toBeVisible();
  await page.keyboard.down("e");
  await expect(page.locator("#merchant-ledger")).toBeVisible({timeout:12000});
  await page.keyboard.up("e");
  await expect(page.locator("#day")).toHaveText("Day 2");
  expect(errors).toEqual([]);
});

/** Live Babylon integration, not a synthetic route-only check:
 * connected 1m excavation, relocated shelf, rotated till, independently
 * shopping, petitioning and credit-seeking visitors. A restock customer
 * wanders without resetting the real request or holding other people hostage.
 */
test("mined shop lets requesting visitors roam while buyers shop and finished customers leave",async({page})=>{
  test.setTimeout(125000);
  const errors:string[]=[];
  page.on("pageerror",e=>errors.push(e.message));
  await page.goto("./");
  const ids=await page.evaluate(async()=>{
    const {createGameState}=await import("/Dungeon-Shop-Master/src/game/gameState.ts");
    const {excavateLevel5Cell}=await import("/Dungeon-Shop-Master/src/game/level5Room.ts");
    const {replaceShelfPlacement,replaceCounterPlacement}=await import(
      "/Dungeon-Shop-Master/src/game/shopLayout.ts");
    const {shopServiceReachabilityProblem}=await import(
      "/Dungeon-Shop-Master/src/game/shopServiceReachability.ts");
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    const {ECONOMY}=await import("/Dungeon-Shop-Master/src/game/economy.ts");
    const {forecastShoppingIntents}=await import("/Dungeon-Shop-Master/src/game/shopperIntents.ts");
    const original=createGameState(7351);
    let room={...original.level5Room,expansionTier:2};
    for(let x=8;x<=9;x++)for(let z=-6;z<=6;z++){
      const next=excavateLevel5Cell(room,{x,z});
      if(!next.ok)throw Error(next.reason);
      room=next.room;
    }
    const shelf=replaceShelfPlacement(original.shopLayout,{
      id:"shelf-2",x:8.25,z:0,rotation:2,
    },room);
    if(shelf.message!=="Shelf placement saved.")throw Error(shelf.message);
    const till=replaceCounterPlacement(shelf.layout,{x:0,z:2.25,rotation:1},room);
    if(till.message!=="Counter placement saved.")throw Error(till.message);
    const problem=shopServiceReachabilityProblem(till.layout,room);
    if(problem)throw Error(problem);
    const state={...original,level5Room:room,shopLayout:till.layout,
      adventurers:original.adventurers.map((hero,index)=>index<4
        ?{...hero,status:"at-shop" as const,floor:5 as const,
          gold:index===0?0:index===1?8:100,
          inventory:{...hero.inventory,
            bread:index===1?ECONOMY.breadTarget:0,healing:0},
          equipment:{weapon:null,armor:null}}
        :{...hero,status:"exploring" as const,floor:4 as const,shopStayDays:0}),
      shopEconomy:{...original.shopEconomy,
        slots:original.shopEconomy.slots.map(slot=>
          slot.id==="shelf-2-slot-2"?
            {...slot,itemId:"bread" as const,quantity:slot.capacity}
            :{...slot,itemId:null,quantity:0})},
    };
    const plans=[...forecastShoppingIntents(state).values()];
    for(const needed of ["interested","unavailable","cannot-afford"])
      if(!plans.some(plan=>plan.reason===needed))
        throw Error("Missing buyer type "+needed);
    await new CampaignStorage().saveGame(state);
    return {
      restock:plans.find(plan=>plan.reason==="unavailable")!.heroId,
      beggar:plans.find(plan=>plan.reason==="cannot-afford")!.heroId,
      buyers:plans.filter(plan=>plan.reason==="interested").map(plan=>plan.heroId),
    };
  });
  await page.reload();
  await expect(page.locator("#day")).toHaveText("Day 1");
  const read=()=>page.evaluate(async()=>(
    await import("/Dungeon-Shop-Master/tests/scene.ts")).inspectNpcVisuals());
  const samples:unknown[]=[];
  let last=-10000;
  try{
    await expect.poll(async()=>{
      const snapshot=await read();
      if(snapshot.time-last>7000){
        last=snapshot.time;
        samples.push(snapshot.visitors.map(v=>({
          id:v.id.slice(-4),phase:v.shoppingPhase,
          x:Math.round(v.x*10)/10,z:Math.round(v.z*10)/10,
          remaining:v.restockRemaining,roam:v.roamLeg,
        })));
      }
      const request=snapshot.visitors.find(v=>v.id===ids.restock);
      const begging=snapshot.visitors.find(v=>v.id===ids.beggar);
      return !!request&&!!begging&&
        (request.roamLeg??0)>0 &&
        (begging.roamLeg??0)>0 &&
        snapshot.visitors.every(v=>v.wallClear)&&
        snapshot.visitors.some(v=>ids.buyers.includes(v.id)&&
          (v.cartUnits??0)>0);
    },{timeout:90000,intervals:[600,1000,1700]}).toBe(true);
  }catch(e){
    console.error("INTEGRATED_SHOP_FAILURE",JSON.stringify(samples));
    throw e;
  }
  const before=(await read()).visitors.find(v=>v.id===ids.restock)!;
  expect(before.wantedItemId).toBeTruthy();
  expect(before.restockRemaining).toBeGreaterThan(0);
  // Compress only the remaining real-time timer, not the economy or NPC route.
  await page.evaluate(id=>{
    (window as Window&{
      __shopTestRestockWait?:(heroId:string,seconds:number)=>void;
    }).__shopTestRestockWait?.(id,0.8);
  },ids.restock);
  await expect.poll(async()=>page.evaluate(async id=>{
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    const save=await new CampaignStorage().loadGame();
    return save?.adventurers.find(v=>v.id===id)?.status;
  },ids.restock),{timeout:10000}).toBe("returning");
  await expect.poll(async()=>!(await read()).visitors.some(v=>v.id===ids.restock),
    {timeout:25000}).toBe(true);
  const final=await read();
  expect(final.visitors.some(v=>v.id===ids.beggar)).toBe(true);
  expect(final.visitors.every(v=>v.wallClear)).toBe(true);
  await page.reload();
  expect((await read()).visitors.some(v=>v.id===ids.restock)).toBe(false);
  expect(errors).toEqual([]);
});
