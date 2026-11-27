import {test,expect} from "@playwright/test";
import type {GameState,WorldEvent} from "../src/game/gameState.ts";

const policy=process.env.EMPLOYEE_AUDIT_POLICY;
const windows=3,windowTicks=1800; // 90 unpaused seconds per day, not full days.
type AuditEvent=Pick<WorldEvent,"id"|"type"|"adventurerId"|"itemId"|"quantity"|"revenue"|"debtGold"|"cost"|"message"|"shopReason">;
type Snapshot={
  day:number;tick:number;worker:GameState["employees"][number];
  actors:readonly Pick<GameState["shopTraffic"]["actors"][number],"heroId"|"phase"|"shoppingPhase"|"checkoutQueueIndex">[];
  carts:GameState["shopCarts"];requests:GameState["shopRequests"];
  balance:number;bag:GameState["shopEconomy"]["bag"];slots:GameState["shopEconomy"]["slots"];
  debts:GameState["shopDebts"];events:AuditEvent[];
};
type Hooks=Window&{
  __shopTestEmployeeAuditSnapshot:()=>Snapshot;
  __shopTestPauseWorld:(paused:boolean)=>void;
  __shopTestAdvanceDay:()=>void;
  __shopTestSaveTrafficNow:()=>Promise<unknown>;
  __shopTestReadProfile:()=>Record<string,{ms:number;calls:number;maxMs:number}>;
};

test("matched real-browser employee throughput, three early-closed business windows @employee-audit",async({page},info)=>{
  test.skip(!policy,"Explicit audit only: set EMPLOYEE_AUDIT_POLICY");
  test.setTimeout(18*60*1000);
  if(policy!=="cashier-first"&&policy!=="restock-first")throw Error("Unknown employee audit policy");
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto("./?e2e-pause-world");
  await expect(page.locator("#save-status")).toHaveText("Saved Day 1.");
  // Warm the fixture's dev-only dependency graph BEFORE writing the seed.
  // This audit needs no Babylon scene-probe imports. Vite may invalidate the
  // page on the first dynamic import; retry only this read-only warmup.
  const ready=async()=>{
    await expect.poll(()=>page.evaluate(()=>typeof (window as Hooks).__shopTestEmployeeAuditSnapshot),
      {timeout:45000}).toBe("function");
    await expect.poll(()=>page.evaluate(()=>typeof (window as Hooks).__shopTestSaveTrafficNow),
      {timeout:45000}).toBe("function");
  };
  await ready();
  for(let attempt=0;attempt<3;attempt++){
    try{
      await page.evaluate(async()=>{
        await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
        await import("/Dungeon-Shop-Master/src/game/gameState.ts");
        await import("/Dungeon-Shop-Master/tests/browserShelfFixture.ts");
      });
      break;
    }catch(error){
      if(attempt===2||!/context was destroyed|navigation|ERR_ABORTED|frame was detached/i.test(String(error)))throw error;
      await page.waitForLoadState("domcontentloaded");
      await ready();
    }
  }
  await ready();
  const reloadSaved=async()=>{
    for(let attempt=0;attempt<3;attempt++){
      try{await page.reload({waitUntil:"domcontentloaded"});break;}
      catch(error){
        if(attempt===2||!/ERR_ABORTED|frame was detached|navigation/i.test(String(error)))throw error;
        await page.waitForLoadState("domcontentloaded");
      }
    }
    await ready();
  };
  await page.evaluate(async policy=>{
    const {CampaignStorage}=await import("/Dungeon-Shop-Master/src/game/campaignSave.ts");
    const {createGameState}=await import("/Dungeon-Shop-Master/src/game/gameState.ts");
    const {withStockedSmallShelf}=await import("/Dungeon-Shop-Master/tests/browserShelfFixture.ts");
    const base=withStockedSmallShelf(createGameState(7351));
    // Matched opening inventory only. All heroes, RNG, prices, shop
    // movements, transactions and subsequent arrivals remain canonical.
    const state={...base,cellarDoorOpen:true,
      shopEconomy:{...base.shopEconomy,bag:{...base.shopEconomy.bag,
        bread:14,"healing-herb":10,"mana-potion":0},
        slots:base.shopEconomy.slots.map(s=>s.itemId==="bread"||s.itemId==="healing-herb"
          ?{...s,quantity:s.capacity}:s)},
      employees:base.employees.map(e=>({...e,priorities:policy==="cashier-first"
        ?{cashier:1 as const,restocking:5 as const,charity:3 as const}
        :{cashier:5 as const,restocking:1 as const,charity:3 as const}}))};
    await new CampaignStorage().saveGame(state);
  },policy);
  await reloadSaved();
  await expect(page.locator("#save-status")).toContainText("Continued saved Day 1");
  const read=()=>page.evaluate(()=>(window as Hooks).__shopTestEmployeeAuditSnapshot());
  const report:unknown[]=[];
  for(let day=1;day<=windows;day++){
    const opening=await read();
    expect(opening.day).toBe(day);
    expect(opening.worker.priorities.cashier).toBe(policy==="cashier-first"?1:5);
    await page.evaluate(()=>{const h=window as Hooks;h.__shopTestReadProfile();h.__shopTestPauseWorld(false);});
    let last=opening,samples=0,queueTicks=0,requestTicks=0,maxQueue=0;
    let longestGap=0,blockedStreak=0,longestBlocked=0;
    const statusTicks:Record<string,number>={},taskTicks:Record<string,number>={};
    const observedJobs:Record<string,number>={};
    let priorJob="";
    const deadline=Date.now()+240000;
    while(last.tick-opening.tick<windowTicks){
      if(Date.now()>deadline)throw Error("Physical audit window stalled at "+JSON.stringify({
        day,tick:last.tick,worker:last.worker,carts:last.carts,requests:last.requests}));
      await page.waitForTimeout(1000);
      const now=await read();
      expect(now.day).toBe(day);
      expect(now.tick).toBeGreaterThanOrEqual(last.tick);
      const dt=now.tick-last.tick;
      if(dt===0)continue;
      samples++;longestGap=Math.max(longestGap,dt);
      // Time-weighted samples, not exact per-tick transition accounting.
      const status=last.worker.status,task=last.worker.job?.task??"none";
      statusTicks[status]=(statusTicks[status]??0)+dt;
      taskTicks[task]=(taskTicks[task]??0)+dt;
      blockedStreak=status==="blocked"?blockedStreak+dt:0;
      longestBlocked=Math.max(longestBlocked,blockedStreak);
      const queue=last.actors.filter(a=>a.phase==="queueing"&&a.shoppingPhase==="awaiting-checkout").length;
      queueTicks+=dt*queue;requestTicks+=dt*last.requests.length;maxQueue=Math.max(maxQueue,queue);
      const job=now.worker.job?now.worker.job.task+":"+now.worker.job.targetId:"";
      if(job&&job!==priorJob)observedJobs[now.worker.job!.task]=(observedJobs[now.worker.job!.task]??0)+1;
      priorJob=job;
      for(const slot of now.slots)expect(slot.quantity).toBeGreaterThanOrEqual(0);
      expect(Object.values(now.bag).every(n=>Number.isSafeInteger(n)&&n>=0)).toBe(true);
      const cargo=now.worker.restock;
      if(cargo)expect(now.bag[cargo.itemId]).toBeGreaterThanOrEqual(cargo.units);
      last=now;
    }
    await page.evaluate(()=>(window as Hooks).__shopTestPauseWorld(true));
    const closing=await read();
    const profile=await page.evaluate(()=>(window as Hooks).__shopTestReadProfile());
    const openingIds=new Set(opening.events.map(e=>e.id));
    const events=closing.events.filter(e=>!openingIds.has(e.id));
    const sales=events.filter(e=>e.type==="sale"),credits=events.filter(e=>e.type==="shop-credit");
    expect(sales.every(e=>e.message.includes("Served by Tettel."))).toBe(true);
    expect(credits.every(e=>e.message.includes("Served by Tettel."))).toBe(true);
    expect(events.filter(e=>e.type==="tip")).toEqual([]);
    const sum=(rows:AuditEvent[],key:"quantity"|"revenue"|"debtGold"|"cost")=>
      rows.reduce((n,e)=>n+(e[key]??0),0);
    // Merchant-owned bread/herbs include unpaid carts, but NOT an extra
    // employee cargo pool: those units are already reserved inside the bag.
    // Sales/credit move actual ownership to customers; no wholesale is
    // performed after the matched opening fixture.
    for(const id of ["bread","healing-herb"] as const){
      const owned=(s:Snapshot)=>s.bag[id]+s.slots.filter(x=>x.itemId===id).reduce((n,x)=>n+x.quantity,0)+
        s.carts.flatMap(c=>c.lines).filter(x=>x.itemId===id).reduce((n,x)=>n+x.quantity,0);
      expect(owned(closing)+sum([...sales,...credits].filter(e=>e.itemId===id),"quantity")).toBe(owned(opening));
    }
    const result={policy,seed:7351,day,physicalTicks:last.tick-opening.tick,
      closingTick:closing.tick,samples,longestSampleGapTicks:longestGap,
      sampledStatusTicks:statusTicks,sampledTaskTicks:taskTicks,observedJobStarts:observedJobs,
      sampledLongestBlockedTicks:longestBlocked,sampledQueueCustomerTicks:queueTicks,
      sampledRequestCustomerTicks:requestTicks,maxSampledCheckoutQueue:maxQueue,
      saleLines:sales.length,soldUnits:sum(sales,"quantity"),revenue:sum(sales,"revenue"),
      creditUnits:sum(credits,"quantity"),newFaceDebt:sum(credits,"debtGold"),
      departures:events.filter(e=>e.type==="shop-departure").length,
      walkouts:events.filter(e=>e.type==="shop-walkout").length,
      buybackCost:sum(events.filter(e=>e.type==="hero-buyback"),"cost"),
      closingGold:closing.balance,openingGold:opening.balance,closingBag:closing.bag,
      closingSlots:closing.slots,closingUnpaidCarts:closing.carts.length,
      closingRequests:closing.requests.length,employeeProfile:profile["employee-step"]??null};
    report.push(result);
    console.log("EMPLOYEE_THROUGHPUT "+JSON.stringify(result));
    await info.attach("employee-throughput.json",{body:JSON.stringify(report,null,2),contentType:"application/json"});
    if(day<windows){
      // Existing bed transition fast-forwards the remaining dungeon time
      // without pedestrian service. EXCLUDE that interval from all samples.
      await page.evaluate(async()=>{const h=window as Hooks;h.__shopTestAdvanceDay();await h.__shopTestSaveTrafficNow();});
      await expect(page.locator("#day")).toHaveText("Day "+(day+1),{timeout:60000});
      await reloadSaved();
      expect((await read()).day).toBe(day+1);
    }
  }
  expect(errors).toEqual([]);
});
