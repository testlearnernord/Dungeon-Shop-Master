import {expect,test} from "@playwright/test";

/** Actual Babylon FPS integration: the secret portrait is picked by E,
 * the blocker changes collision, and Galvik walks down the same scene's ramp.
 * No game-store mutation or fake cellar teleport is used. */
test("portrait reveals a physical staircase to the mineable cellar @ci-smoke",async({page})=>{
  test.setTimeout(90000);
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto("./");
  await expect(page.locator("#day")).toHaveText("Day 1");
  await page.evaluate(async()=>{
    const {inspectPlayer}=await import("/Dungeon-Shop-Master/tests/scene.ts");
    inspectPlayer({x:-.85,y:1.7,z:-11.55});
    const {Engine}=await import("@babylonjs/core/Engines/engine");
    const {Vector3}=await import("@babylonjs/core/Maths/math.vector");
    const scene=Engine.LastCreatedScene!;
    scene.activeCamera!.setTarget(new Vector3(-.85,2.15,-12.02));
  });
  await page.keyboard.press("e");
  await expect.poll(async()=>page.evaluate(async()=>{
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    return (await new CampaignStorage().loadGame())?.cellarDoorOpen;
  }),{timeout:12000}).toBe(true);
  const gate=await page.evaluate(async()=>{
    const {Engine}=await import("@babylonjs/core/Engines/engine");
    const scene=Engine.LastCreatedScene!;
    return {
      blocked:scene.getMeshByName("cellar-portrait-barrier")?.checkCollisions,
      ramp:scene.getMeshByName("cellar-stair-walkable-ramp")?.checkCollisions,
      cellarFloor:scene.getMeshByName("cellar-floor")?.checkCollisions,
      chest:!!scene.getMeshByName("cellar-chest-body"),
    };
  });
  expect(gate).toEqual({blocked:false,ramp:true,cellarFloor:true,chest:true});
  // Start at the actual upper stair landing and WALK downhill. The real FPS
  // camera must follow the slope, not be teleported to a second world.
  await page.evaluate(async()=>{
    const {inspectPlayer}=await import("/Dungeon-Shop-Master/tests/scene.ts");
    inspectPlayer({x:-.85,y:1.72,z:-12.9});
    const {Engine}=await import("@babylonjs/core/Engines/engine");
    const {Vector3}=await import("@babylonjs/core/Maths/math.vector");
    Engine.LastCreatedScene!.activeCamera!.setTarget(new Vector3(-.85,0,-21));
  });
  await page.keyboard.down("w");
  await page.waitForTimeout(550);
  await page.keyboard.up("w");
  const after=await page.evaluate(async()=>{
    const {inspectPlayer}=await import("/Dungeon-Shop-Master/tests/scene.ts");
    return inspectPlayer();
  });
  expect(after.z).toBeLessThan(-13.5);
  expect(after.y).toBeLessThan(1.65);
  expect(errors).toEqual([]);
});
