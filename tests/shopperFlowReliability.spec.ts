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
          inventory:{...visitor.inventory,food:0}}
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
