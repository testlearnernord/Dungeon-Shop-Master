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
        ?{...hero,status:"at-shop" as const,floor:5 as const,gold:100,
          inventory:{...hero.inventory,bread:0,healing:0},
          equipment:{weapon:null,armor:null}}
        :{...hero,status:"exploring" as const,floor:4 as const,shopStayDays:0}),
      shopEconomy:{...original.shopEconomy,
        slots:original.shopEconomy.slots.map(slot=>
          slot.id==="shelf-1-slot-2"||slot.id==="shelf-2-slot-2"
            ?{...slot,itemId:"bread" as const,quantity:slot.capacity}
            :{...slot,itemId:null,quantity:0})},
    };
    await new CampaignStorage().saveGame(state);
  });
  await page.reload();
  await expect(page.locator("#day")).toHaveText("Day 1");
  const read=()=>page.evaluate(async()=>(
    await import("/Dungeon-Shop-Master/tests/scene.ts")).inspectNpcVisuals());
  const starting=await read();
  expect(starting.visitors.length).toBeGreaterThanOrEqual(8);
  await expect.poll(async()=>{
    const {visitors}=await read();
    return visitors.filter(visitor=>(visitor.cartUnits??0)>0 ||
      visitor.shoppingPhase==="waiting-for-restock"||
      visitor.shoppingPhase==="awaiting-checkout").length;
  },{timeout:75000,intervals:[1000,2000,3000]}).toBeGreaterThanOrEqual(3);
  const final=await read();
  expect(final.visitors.every(visitor=>visitor.wallClear)).toBe(true);
  expect(final.visitors.some(visitor=>(visitor.cartUnits??0)>0)).toBe(true);
  expect(errors).toEqual([]);
});
