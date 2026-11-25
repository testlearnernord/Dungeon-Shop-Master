import {expect,test} from "@playwright/test";

test("Floor 6 runs ordinary LIVE GroupCombat and no solo Troll checkpoints exist @ci-smoke",async({page})=>{
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto("./?e2e-pause-world");
  await expect(page.locator("#save-status")).toHaveText("Saved Day 1.");
  const probe=await page.evaluate(async()=>{
    const {createGameState}=await import("/Dungeon-Shop-Master/src/game/gameState.ts");
    const {GameStore}=await import("/Dungeon-Shop-Master/src/game/gameStore.ts");
    const {createSave,parseSave}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    const {DUNGEON_STEP_INTERVAL_TICKS}=await import("/Dungeon-Shop-Master/src/game/liveDungeonRuntime.ts");
    const state=createGameState(7351);
    const hero=state.adventurers[0];
    const prepared={...state,adventurers:state.adventurers.map(h=>
      h.id===hero.id?{...h,status:"exploring" as const,
        floor:6 as const}:h)};
    const store=new GameStore(prepared);
    store.enableLiveDungeon();
    store.advanceWorldTime(DUNGEON_STEP_INTERVAL_TICKS);
    const committed=store.state;
    const save=createSave(committed);
    let rejectedOldBoss=false;
    try{
      const tampered=structuredClone(save) as any;
      tampered.payload.liveDungeon.bossCombat={
        id:"live-boss:1:200:forged",heroId:hero.id,
      };
      parseSave(JSON.stringify(tampered));
    }catch{rejectedOldBoss=true;}
    return {
      noSoloBoss:!("bossCombat" in committed.liveDungeon),
      ordinaryFloor:committed.adventurers.find(h=>h.id===hero.id)?.floor===6,
      noSoloEvents:committed.events.every(e=>e.type!=="level6-combat"),
      noSoloClear:committed.dungeonFloors.every(f=>f.floor!==6),
      roundtrip:JSON.stringify(parseSave(JSON.stringify(save)))===
        JSON.stringify(committed),
      rejectedOldBoss,
    };
  });
  expect(probe).toEqual({
    noSoloBoss:true,ordinaryFloor:true,noSoloEvents:true,
    noSoloClear:true,roundtrip:true,rejectedOldBoss:true,
  });
  expect(errors).toEqual([]);
});
