import {expect,test} from "@playwright/test";

/** Exercises arrival at the relocated cash register without bypassing NPC
 * pathfinding or marking a payment in the save. */
test("a single buyer can reach and request service at a rotated register @ci-smoke",async({page})=>{
  test.setTimeout(100000);
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto("./");
  await expect(page.locator("#day")).toHaveText("Day 1");
  const buyer=await page.evaluate(async()=>{
    const {createGameState}=await import("/Dungeon-Shop-Master/src/game/gameState.ts");
    const {replaceCounterPlacement,replaceShelfPlacement}=await import("/Dungeon-Shop-Master/src/game/shopLayout.ts");
    const {createEmptyShelfSlots}=await import("/Dungeon-Shop-Master/src/game/economy.ts");
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    const initial=createGameState(7351);
    const built=replaceShelfPlacement(initial.shopLayout,{
      id:"shelf-1",x:-7,z:0,rotation:0,
    });
    if(built.message!=="Shelf placement saved.")throw Error(built.message);
    const moved=replaceCounterPlacement(built.layout,{x:0,z:2.25,rotation:1});
    if(moved.message!=="Counter placement saved.")throw Error(moved.message);
    const hero=initial.adventurers[0];
    const state={...initial,shopLayout:moved.layout,
      adventurers:initial.adventurers.map((visitor,index)=>index===0
        ?{...visitor,status:"at-shop" as const,floor:5 as const,gold:100,
          inventory:{...visitor.inventory,bread:0}}
        :{...visitor,status:"exploring" as const,floor:4 as const,shopStayDays:0}),
      shopEconomy:{...initial.shopEconomy,
        slots:createEmptyShelfSlots("shelf-1").map(slot=>
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
  // Player-facing guidance uses a REAL first-person shelf ray, not a
  // decorative shelf label. It follows the selected hotbar item.
  await page.evaluate(async()=>
    (await import("/Dungeon-Shop-Master/tests/scene.ts")).aimAtShelfSlot());
  await expect(page.locator("#shop-shelf-focus")).toBeVisible();
  await expect(page.locator("#shelf-focus-title")).toContainText("Empty shelf slot");
  await expect(page.locator("#shelf-focus-action"))
    .toContainText("Left-click: stock Healing Herb");
  await page.keyboard.press("4");
  await expect(page.locator("#shelf-focus-action"))
    .toContainText("Left-click: stock Waybread");
  expect(errors).toEqual([]);
});


/** Browser-only crowd test. Deliberately combines relocated furniture, eight
 * simultaneous customer spawns, and limited Waybread stock. This catches
 * actual Babylon movement failures missed by pure route allocation tests. */
test("eight incoming customers return unpaid carts at bed-close without phantom sales",async({page})=>{
  test.setTimeout(150000);
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
    const {ECONOMY,createEmptyShelfSlots}=await import("/Dungeon-Shop-Master/src/game/economy.ts");
    const {forecastShoppingIntents}=await import("/Dungeon-Shop-Master/src/game/shopperIntents.ts");
    const original=createGameState(7351);
    const movedShelf=replaceShelfPlacement(original.shopLayout,{
      id:"shelf-1",x:0,z:-2,rotation:1,
    });
    if(movedShelf.message!=="Shelf placement saved.")throw Error(movedShelf.message);
    const second=replaceShelfPlacement(movedShelf.layout,{
      id:"shelf-2",x:7,z:0,rotation:2,
    });
    if(second.message!=="Shelf placement saved.")throw Error(second.message);
    const movedCounter=replaceCounterPlacement(second.layout,{
      x:0,z:2.25,rotation:1,
    });
    if(movedCounter.message!=="Counter placement saved.")
      throw Error(movedCounter.message);
    const problem=shopServiceReachabilityProblem(
      movedCounter.layout,original.shopRoom);
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
        slots:[...createEmptyShelfSlots("shelf-1"),
          ...createEmptyShelfSlots("shelf-2")].map(slot=>
          slot.id==="shelf-1-slot-2"||slot.id==="shelf-2-slot-2"
            ?{...slot,itemId:"bread" as const,quantity:slot.capacity}
            :slot)},
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
      // Requests now roam after a short petition; requiring both visitors
      // to remain frozen at exact stations would reintroduce the behavior
      // this test is supposed to prevent.
      return visitors.some(v=>v.shoppingReason==="cannot-afford"&&
        (v.restockRemaining??0)>0) &&
        visitors.some(v=>v.shoppingReason==="unavailable"&&
          (v.restockRemaining??0)>0);
    },{timeout:80000,intervals:[800,1200,2000]}).toBe(true);
  }catch(error){
    console.error("NPC_TRAFFIC_FAILURE",JSON.stringify(trafficSamples));
    throw error;
  }
  // During the real eight-customer scene, show the ACTUAL urgent restock
  // request from NPCs, not forecast demand. F selects its requested item in
  // the existing inventory hotbar; no automatic transfer or payment occurs.
  await expect(page.locator("#service-restock")).toBeVisible();
  const urgent=await page.locator("#service-restock").getAttribute("data-item-id");
  expect(urgent).toBeTruthy();
  await expect(page.locator("#service-restock-label")).toContainText("RESTOCK");
  const beforePick=await page.evaluate(async()=>{
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    const state=await new CampaignStorage().loadGame();
    return {bag:state?.shopEconomy.bag,slots:state?.shopEconomy.slots};
  });
  await page.keyboard.press("f");
  await expect(page.locator("#inventory .inventory-row.selected"))
    .toHaveAttribute("data-item-id",urgent!);
  const afterPick=await page.evaluate(async()=>{
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    const state=await new CampaignStorage().loadGame();
    return {bag:state?.shopEconomy.bag,slots:state?.shopEconomy.slots};
  });
  expect(afterPick).toEqual(beforePick);
  // Verify actual animated limb transforms in the live Babylon scene.
  // A request phase label by itself is not an interaction animation.
  await expect.poll(async()=>{
    const {visitors}=await read();
    return visitors.some(v=>
      (v.shopGesture==="restock"&&v.rightArmPitch>.12)||
      (v.shopGesture==="credit"&&v.leftArmPitch>.12));
  },{timeout:30000,intervals:[300,600,1000]}).toBe(true);
  // The handoff animation is only triggered by a successful GameStore
  // stock reservation, never by a buyer simply walking toward a shelf.
  await expect.poll(async()=>{
    const {visitors}=await read();
    return visitors.some(v=>(v.confirmedPickups??0)>0);
  },{timeout:75000,intervals:[500,1000,1600]}).toBe(true);
  await expect.poll(async()=>{
    const {visitors}=await read();
    return visitors.filter(visitor=>(visitor.cartUnits??0)>0 ||
      visitor.shoppingPhase==="waiting-for-restock"||
      visitor.shoppingPhase==="waiting-for-credit"||
      visitor.shoppingPhase==="awaiting-checkout").length;
  },{timeout:75000,intervals:[1000,2000,3000]}).toBeGreaterThanOrEqual(3);
  // Check several *real frames* rather than one instant. A line that looks
  // safe in a single screenshot can still be full of NPC shoulder clipping
  // while visitors arrive, wait for credit, and reroute around shelves.
  const settled=new Set(["awaiting-checkout","considering-item","waiting-for-restock",
    "waiting-for-credit","waiting-for-shelf","waiting-for-restock-overflow",
    "waiting-for-credit-overflow","checkout-overflow-wait"]);
  let carriedAtLeastOnce=false;
  for(let frame=0;frame<5;frame++){
    const snapshot=(await read()).visitors;
    const stationary=snapshot.filter(visitor=>settled.has(visitor.shoppingPhase??""));
    for(let i=0;i<stationary.length;i++)for(let j=i+1;j<stationary.length;j++){
      const a=stationary[i],b=stationary[j];
      expect(Math.hypot(a.x-b.x,a.z-b.z),a.id+" and "+b.id+
        " overlap at reserved service spots").toBeGreaterThan(0.82);
    }
    expect(snapshot.every(visitor=>visitor.wallClear)).toBe(true);
    carriedAtLeastOnce ||= snapshot.some(visitor=>(visitor.cartUnits??0)>0);
    if(frame<4)await page.waitForTimeout(280);
  }
  expect(carriedAtLeastOnce).toBe(true);

  // Continue this SAME crowded browser session through bedtime and reload.
  // Shelf pickup is NOT payment. Until a real cashier completes checkout,
  // every unpaid cart must return its stock and cannot mint merchant gold.
  const snapshot=()=>page.evaluate(async()=>{
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    const state=await new CampaignStorage().loadGame();
    if(!state)throw Error("No campaign save found");
    return {day:state.day,balance:state.shopEconomy.balance,
      carts:state.shopCarts.map(cart=>({
        id:cart.heroId,units:cart.lines.reduce((sum,line)=>sum+line.quantity,0),
        lines:cart.lines.map(line=>({slotId:line.slotId,units:line.quantity})),
      })).filter(cart=>cart.units>0),
      sales:state.events.filter(event=>event.type==="sale")
        .map(event=>({id:event.id,day:event.day,hero:event.adventurerId})),
      stocks:state.shopEconomy.slots.map(slot=>({id:slot.id,units:slot.quantity}))};
  });
  await expect.poll(async()=> (await snapshot()).carts.length,{
    timeout:12000,intervals:[250,500,900],
  }).toBeGreaterThan(0);
  const beforeClose=await snapshot();
  expect(beforeClose.day).toBe(1);
  await page.evaluate(async()=>(
    await import("/Dungeon-Shop-Master/tests/scene.ts")).aimAtBed());
  await expect(page.locator("#sleep-bed-prompt")).toBeVisible();
  await page.keyboard.down("e");
  await expect(page.locator("#merchant-ledger")).toBeVisible({timeout:12000});
  await page.keyboard.up("e");
  await expect(page.locator("#day")).toHaveText("Day 2");
  const afterClose=await snapshot();
  expect(afterClose.day).toBe(2);
  expect(afterClose.carts).toEqual([]);
  expect(afterClose.balance).toBe(beforeClose.balance);
  expect(afterClose.stocks.every(stock=>stock.units>=0)).toBe(true);
  expect(afterClose.sales).toEqual(beforeClose.sales);
  const quantityBefore=new Map(beforeClose.stocks.map(slot=>[slot.id,slot.units]));
  const restoredUnits=new Map<string,number>();
  for(const cart of beforeClose.carts)for(const line of cart.lines)
    restoredUnits.set(line.slotId,(restoredUnits.get(line.slotId)??0)+line.units);
  for(const slot of afterClose.stocks)expect(slot.units,
    "Unpaid shelf reservation must return at bed: "+slot.id)
    .toBe((quantityBefore.get(slot.id)??0)+(restoredUnits.get(slot.id)??0));
  expect(new Set(afterClose.sales.map(sale=>sale.id)).size)
    .toBe(afterClose.sales.length);
  await page.reload();
  await expect(page.locator("#day")).toHaveText("Day 2");
  await expect(page.locator("#merchant-ledger")).toBeVisible();
  const reloaded=await snapshot();
  expect(reloaded.carts).toEqual([]);
  expect(reloaded.sales).toEqual(afterClose.sales);
  expect(reloaded.balance).toBe(afterClose.balance);
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
    const {ECONOMY,createEmptyShelfSlots}=await import("/Dungeon-Shop-Master/src/game/economy.ts");
    const {forecastShoppingIntents}=await import("/Dungeon-Shop-Master/src/game/shopperIntents.ts");
    const original=createGameState(7351);
    let room={...original.shopRoom,expansionTier:2};
    for(let x=8;x<=9;x++)for(let z=-6;z<=6;z++){
      const next=excavateLevel5Cell(room,{x,z});
      if(!next.ok)throw Error(next.reason);
      room=next.room;
    }
    const shelf=replaceShelfPlacement(original.shopLayout,{
      id:"shelf-1",x:8.25,z:0,rotation:2,
    },room);
    if(shelf.message!=="Shelf placement saved.")throw Error(shelf.message);
    const till=replaceCounterPlacement(shelf.layout,{x:0,z:2.25,rotation:1},room);
    if(till.message!=="Counter placement saved.")throw Error(till.message);
    const problem=shopServiceReachabilityProblem(till.layout,room);
    if(problem)throw Error(problem);
    const state={...original,shopRoom:room,shopLayout:till.layout,
      adventurers:original.adventurers.map((hero,index)=>index<4
        ?{...hero,status:"at-shop" as const,floor:5 as const,
          gold:index===0?0:index===1?8:100,
          inventory:{...hero.inventory,
            bread:index===1?ECONOMY.breadTarget:0,healing:0},
          equipment:{weapon:null,armor:null}}
        :{...hero,status:"exploring" as const,floor:4 as const,shopStayDays:0}),
      shopEconomy:{...original.shopEconomy,
        slots:createEmptyShelfSlots("shelf-1").map(slot=>
          slot.id==="shelf-1-slot-2"
            ?{...slot,itemId:"bread" as const,quantity:slot.capacity}
            :slot)},
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
  // Buyer pickup and two independent petitioners are asynchronous.
  // Latch a real, physically filled cart whenever observed, rather than
  // require the (possibly departed) buyer to overlap the exact same polling
  // instant at which both petitioners have active request timers.
  let buyerWithCart=false;
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
      const requestsLive=!!request&&!!begging&&
        (request.restockRemaining??0)>0 &&
        (begging.restockRemaining??0)>0;
      if(snapshot.visitors.some(v=>
        ids.buyers.includes(v.id)&&(v.cartUnits??0)>0))
        buyerWithCart=true;
      return requestsLive&&buyerWithCart&&
        (request!.roamLeg??0)>0 &&
        (begging!.roamLeg??0)>0 &&
        snapshot.visitors.every(v=>v.wallClear);
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

/** Real customer request -> world-anchored line, no fake sale or NPC action. */
test("a real stockout produces one short, nonblocking customer comment",async({page})=>{
  test.setTimeout(95000);
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto("./");
  const heroId=await page.evaluate(async()=>{
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    const {createGameState}=await import("/Dungeon-Shop-Master/src/game/gameState.ts");
    const state=createGameState(7351);
    const hero=state.adventurers[0]!;
    await new CampaignStorage().saveGame({...state,
      adventurers:state.adventurers.map((entry,index)=>index===0
        ?{...entry,status:"at-shop" as const,floor:5 as const,
            gold:100,inventory:{...entry.inventory,bread:0,healing:0},
            equipment:{weapon:null,armor:null}}
        :{...entry,status:"exploring" as const,floor:4 as const,shopStayDays:0}),
    });
    return hero.id;
  });
  await page.reload();
  await expect(page.locator("#day")).toHaveText("Day 1");
  const line=page.locator("#npc-customer-bark");
  await expect.poll(async()=>{
    const snapshot=await page.evaluate(async heroId=>{
      const tools=await import("/Dungeon-Shop-Master/tests/scene.ts");
      const shopper=tools.inspectNpcVisuals().visitors.find(v=>v.id===heroId);
      if(shopper && (shopper.restockRemaining??0)>0)
        tools.aimAtCustomerBark(heroId);
      const bubble=document.querySelector<HTMLElement>("#npc-customer-bark");
      return {request:!!shopper&&(shopper.restockRemaining??0)>0,
        visible:!!bubble&&!bubble.hidden && bubble.dataset.kind==="restock",
        text:bubble?.textContent??""};
    },heroId);
    return snapshot.request&&snapshot.visible&&snapshot.text.includes("Waybread");
  },{timeout:80000,intervals:[300,500,800]}).toBe(true);
  await expect(line).toBeVisible();
  await expect(line).toHaveAttribute("data-kind","restock");
  await expect(page.locator("#day")).toHaveText("Day 1");
  await expect(page.locator("#merchant-gold")).toHaveText("Merchant gold: 20g");
  expect(await line.evaluate(element=>getComputedStyle(element).pointerEvents)).toBe("none");
  expect(errors).toEqual([]);
});
