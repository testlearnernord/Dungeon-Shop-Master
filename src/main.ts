import { createMerchantActions } from "./game/merchantActions.ts";
import { createLevel5RoomVisuals } from "./game/level5RoomVisuals.ts";
import { createCashierSfx } from "./cashierSfx.ts";
import { setupGameSfx } from "./gameSfx.ts";
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { createFirstPersonCamera } from "./game/firstPersonController";
import { ITEMS, type ItemId } from "./game/inventory";
import { ECONOMY } from "./game/economy";
import { GameStore } from "./game/gameStore";
import { WorldClockPacer } from "./game/worldClockPacer.ts";
import {WORLD_TICKS_PER_GAME_MINUTE} from "./game/worldClock.ts";
import {advancePhysicalShopWorldTicks} from "./game/shopWorldAdvance.ts";
import { InteractionSystem } from "./game/interactionSystem";
import { NpcVisualSystem } from "./game/npcVisualSystem";
import { manuallyPaidVisitors,type VisitorSnapshot } from "./game/npcVisitors.ts";
import { forecastShoppingIntents } from "./game/shopperIntents.ts";
import { setupNpcTrafficDebug } from "./game/npcTrafficDebug.ts";
import { Level6Arena } from "./game/level6Arena";
import { DungeonViewer } from "./game/dungeonViewer";
import { createRosterBoard } from "./game/rosterBoard";
import {setupWallPortraitVisuals} from "./game/wallPortraitVisuals.ts";
import { setupRosterBoardHud } from "./rosterBoardHud";
import { Shop } from "./game/shop";
import { setupBlueprintHud } from "./blueprintHud.ts";
import { setupBedroomFurnitureVisuals } from "./game/bedroomFurnitureVisuals.ts";
import { buildWorld } from "./game/world";
import { setupDayHud } from "./dayHud";
import { setupMerchantLedger, type MerchantLedger } from "./merchantLedger.ts";
import { setupBedtime, type BedtimeController } from "./bedtime.ts";
import { resetReplayDisclosure } from "./replayDisclosure.ts";
import { setupEconomyHud } from "./economyHud";
import { setupSalesHud } from "./salesHud";
import { setupExpeditionHud } from "./expeditionHud";
import {setupExpeditionArchiveHud} from "./expeditionArchiveHud.ts";
import { currentDayReceipts } from "./game/saleView";
import { loadCampaign, setupCampaignHud } from "./campaignHud";
import { setupSoundtrack } from "./soundtrack";
import { setupCashierHud } from "./cashierHud.ts";
import { setupBeggarHud } from "./beggarHud.ts";
import { setupDebtBookHud } from "./debtBookHud.ts";
import { setupShopStatusToggle,setupControlsHotbarClearance,
  setupTransientStatus,setupShopServiceBrief } from "./shopHudLayout";
import { setupAdventurerOverview } from "./adventurerOverview";
import { setupHudMouseMode } from "./hudMouseMode";
import { setupInterfaceIcons,watchInterfaceDialogs,uiIcon } from "./uiIcons.ts";
import "./styles.css";
import "./uiTheme.css";
import "./merchantLedger.css";
import "./beggarHud.css";
import "./blueprintHud.css";
import "./debtBookHud.css";
import "./immersiveUi.css";
import "./expeditionArchive.css";

async function startGame(): Promise<void> {
setupInterfaceIcons();
watchInterfaceDialogs();
setupShopStatusToggle();
setupAdventurerOverview();
const canvas = document.querySelector<HTMLCanvasElement>("#renderCanvas");
const inventoryElement = document.querySelector<HTMLDivElement>("#inventory");
const statusElement = document.querySelector<HTMLDivElement>("#status");

if (!canvas || !inventoryElement || !statusElement) {
  throw new Error("The game canvas and HUD must exist before the game starts.");
}

setupHudMouseMode(canvas);
const inventoryHud = inventoryElement;
const statusHud = statusElement;
setupTransientStatus(statusHud);
const campaign = await loadCampaign();
const engine = new Engine(canvas, true, { antialias: true, preserveDrawingBuffer: false });
const scene = new Scene(engine);
const camera = createFirstPersonCamera(canvas, scene);
const worldItems = buildWorld(scene);
const store = new GameStore(campaign.state);
// Live time is the exclusive owner in real gameplay. Unit fixtures that
// directly advance a legacy day do not run simultaneous spatial motors.
store.enableLiveDungeon();
const worldClockPacer = new WorldClockPacer();
// E2E-only CPU attribution for the real world clock. No extra engine,
// timer, render or save mutation. Vite eliminates this in production builds.
const profileCounters=new Map<string,{ms:number;calls:number;maxMs:number}>();
const profile=<T>(phase:string,work:()=>T):T=>{
  if(import.meta.env.VITE_E2E!=="1")return work();
  const start=performance.now();
  try{return work();}
  finally{
    const elapsed=performance.now()-start;
    const old=profileCounters.get(phase)??{ms:0,calls:0,maxMs:0};
    profileCounters.set(phase,{ms:old.ms+elapsed,calls:old.calls+1,
      maxMs:Math.max(old.maxMs,elapsed)});
  }
};

let ignoreNextClockFrame=false;
document.addEventListener("visibilitychange",()=>{
  worldClockPacer.reset();
  ignoreNextClockFrame=true;
});
setupBedroomFurnitureVisuals(scene,store);
const roomVisuals=createLevel5RoomVisuals(scene);
let lastDrawnRoom:typeof store.state.level5Room|null=null;
const refreshRoom=()=>{
  const room=store.state.level5Room;
  if(room===lastDrawnRoom)return;
  lastDrawnRoom=room;
  roomVisuals.update(room);
};
store.subscribe(refreshRoom);
refreshRoom();
const shop = new Shop(scene, store);
const board = createRosterBoard(scene, store);
setupWallPortraitVisuals(scene,store);
worldItems.push({ id: "adventurer-roster-board", mesh: board.mesh, kind: "roster-board" });
let watchLiveHero:(heroId:string)=>void=()=>{};
const openRoster = setupRosterBoardHud(canvas, camera, store,
  id=>watchLiveHero(id));
const debtBook=setupDebtBookHud(canvas,camera,store);
let bedtime:BedtimeController|null=null;
let ledger:MerchantLedger|null=null;
let beggarHud:ReturnType<typeof setupBeggarHud>|null=null;
const blueprint=setupBlueprintHud(canvas,camera,store,()=>isShopActive());
const npcVisuals = new NpcVisualSystem(scene);
// The physical customer motor reports exits after removing its outgoing mesh.
// The store commits the event only after saving that motor's new checkpoint.
setupNpcTrafficDebug(npcVisuals);
const toggleCatalog = setupEconomyHud(canvas, store, (open) => {
  if (open) camera.detachControl();
  else camera.attachControl(canvas, true);
});
let currentVisitorSnapshots:readonly VisitorSnapshot[]=[];
const dayClock=setupDayHud(
  canvas, store,
  (current, previous) => {
    currentVisitorSnapshots=current;
    npcVisuals.reconcile(current, previous);
  },
  () => npcVisuals.showSales(currentDayReceipts(store.state)),
);
/** E2E-only access to the existing authoritative transition.
 * No player-facing shortcut or production build entry point is created. */
if(import.meta.env.VITE_E2E==="1"){
  const hooks=window as Window & {
    __shopTestAdvanceDay?:()=>void;
    __shopTestStockItem?:(slotId:string,itemId:ItemId)=>string;
    __shopTestRestockWait?:(heroId:string,seconds:number)=>void;
    __shopTestReadyCheckout?:()=>string|null;
    __shopTestTraffic?:()=>unknown;
    __shopTestPauseWorld?:(paused:boolean)=>void;
    __shopTestSaveTrafficNow?:()=>Promise<unknown>;
    __shopTestHydratedTraffic?:unknown;
    __shopTestAdvanceDungeonTick?:()=>void;
    __shopTestAdvanceWorldTicks?:(ticks:number)=>void;
    __shopTestReadProfile?:()=>Record<string,{ms:number;calls:number;maxMs:number}>;
  };
  hooks.__shopTestAdvanceDay=()=>dayClock.endDayFromBed();
  hooks.__shopTestStockItem=(slotId,itemId)=>
    store.transfer(slotId,itemId,"stock");
  hooks.__shopTestRestockWait=(heroId,seconds)=>
    npcVisuals.setRestockTimeForE2E(heroId,seconds);
  hooks.__shopTestReadyCheckout=()=>npcVisuals.readyCheckoutHeroId();
  // This invokes the real scheduled world event owner, not a second
  // explorer/combat engine. Test-only fast-forward avoids 30s wall delay.
  hooks.__shopTestAdvanceDungeonTick=()=>store.advanceWorldTime(600);
  // Single genuine scheduler, with a small test-controlled tick count.
  // This only instruments the fast/slow render-path guard; production has
  // no hook and no alternate movement or economic resolver.
  hooks.__shopTestAdvanceWorldTicks=ticks=>store.advanceWorldTime(ticks);
  hooks.__shopTestReadProfile=()=>{
    const sample=Object.fromEntries(profileCounters);
    profileCounters.clear();
    return sample;
  };
  hooks.__shopTestTraffic=()=>structuredClone(store.state.shopTraffic);
  hooks.__shopTestPauseWorld=paused=>worldClockPacer.setPaused("e2e",paused);
  hooks.__shopTestSaveTrafficNow=async()=>{
    const {CampaignStorage}=await import("./game/campaignSave.ts");
    await new CampaignStorage().saveGame(store.state);
    return structuredClone(store.state.shopTraffic);
  };
}
// The forecast is read-only. It uses exactly the same purchase decisions
// as the confirmed next-day transaction. Stock changes trigger replanning.
let lastShoppingState:typeof store.state|null=null;
const refreshShoppingIntents = () => {
  const state=store.state;
  // World time changes every second. Replan physical routes ONLY if the
  // buyer, money, stock, carts, events, layout or room actually changed.
  // Saved petition countdowns are read directly through their clock accessor.
  if(lastShoppingState&&lastShoppingState.adventurers===state.adventurers&&
    lastShoppingState.shopEconomy===state.shopEconomy&&
    lastShoppingState.shopCarts===state.shopCarts&&
    lastShoppingState.shopLayout===state.shopLayout&&
    lastShoppingState.level5Room===state.level5Room&&
    lastShoppingState.events===state.events)return;
  lastShoppingState=state;
  npcVisuals.setShoppingIntents(
  forecastShoppingIntents(state),
  store.state.shopLayout, shop, store.state.shopCarts,
  (heroId,slotId)=>{
    const previous=store.state;
    store.pickUpShopItem(heroId,slotId);
    return store.state!==previous;
  },
  manuallyPaidVisitors(state.events,state.day),
  (heroId,reason)=>store.walkOutWithoutPurchase(heroId,reason),state.level5Room,{
    start:(heroId,itemId,reason)=>{
      const due=store.startShopRequest(heroId,itemId,reason);
      return due===null?null:
        (due-store.state.worldClock.tick)/WORLD_TICKS_PER_GAME_MINUTE;
    },
    remaining:heroId=>{
      const remaining=store.shopRequestRemaining(heroId);
      return remaining===null?null:remaining/WORLD_TICKS_PER_GAME_MINUTE;
    },
    shortenE2E:(heroId,seconds)=>store.shortenShopRequestForE2E(heroId,seconds),
    expiredWithoutStock:heroId=>store.state.events.some(event=>
      event.day===store.state.day&&event.type==="shop-walkout"&&
      event.adventurerId===heroId&&event.shopReason==="unavailable"),
  });
};
store.subscribe(refreshShoppingIntents);
refreshShoppingIntents();
// The existing physical NPC motor is the ONLY authority for its movement
// checkpoint. A snapshot is committed after a real shop step or material
// player mutation, and never regenerated by another movement algorithm.
let trafficSyncing=false;
let shopTickInProgress=false;
let replacingCampaign=false;
// The authoritative NPC motor always advances after a successful 50ms
// tick. Its checkpoint MUST be saved, even when the actor graph happens
// to be stationary. A deep JSON equality check on all moving actors/routes
// has no meaning on this hot path, and used to run twice every tick.
const syncTrafficCheckpointAfterStep=()=>syncTrafficCheckpoint(true);
const syncTrafficCheckpoint=(committedPhysicalTick=false)=>{
  if(trafficSyncing||replacingCampaign)return;
  const state=store.state;
  const checkpoint=profile("traffic-snapshot",
    ()=>npcVisuals.snapshotTraffic(state.day,state.worldClock.tick));
  // Explicit furniture/roster writes can call this without a world step:
  // keep the equivalence guard in that cold path to avoid no-op commits.
  if(!committedPhysicalTick&&profile("traffic-compare",
    ()=>JSON.stringify(checkpoint)===JSON.stringify(state.shopTraffic)))return;
  trafficSyncing=true;
  try{profile("traffic-validate-notify",()=>store.commitShopTraffic(checkpoint));}
  finally{trafficSyncing=false;}
};
const restoreTrafficCheckpoint=()=>{
  const state=store.state;
  npcVisuals.restoreTraffic(state.shopTraffic,currentVisitorSnapshots);
  if(import.meta.env.VITE_E2E==="1")
    (window as Window & {__shopTestHydratedTraffic?:unknown})
      .__shopTestHydratedTraffic=structuredClone(npcVisuals.snapshotTraffic(
        state.day,state.worldClock.tick));
  replacingCampaign=false;
  if(!state.shopTraffic.initialized)syncTrafficCheckpoint();
};
// On first load, actual visitors and read-only shopping plans already exist.
restoreTrafficCheckpoint();
store.subscribe(()=>{
  if(!shopTickInProgress&&!replacingCampaign&&!trafficSyncing)
    syncTrafficCheckpoint();
});
setupSalesHud(store);
setupExpeditionHud(store);
let selectedItemId: ItemId = ITEMS[0].id;
setupCampaignHud(store, campaign, () => {
  replacingCampaign=true;
  npcVisuals.reconcile([], []);
  lastShoppingState=null;
  worldClockPacer.reset();
  dungeon.close();
  bedtime?.reset();
  ledger?.close();
  resetReplayDisclosure();
  cashier?.close();
  beggarHud?.close();
  blueprint.close();
  debtBook.close();
  interactions.reset();
  camera.position.set(0, 1.7, -4.6);
  camera.rotation.setAll(0);
  camera.cameraDirection.setAll(0);
  camera.cameraRotation.setAll(0);
  const catalog = document.querySelector<HTMLDialogElement>("#wholesale")!;
  if (catalog.open) catalog.close();
  statusHud.textContent = "Campaign ready. Click to enter the shop.";
},restoreTrafficCheckpoint);

function renderInventory(selectedItem: ItemId): void {
  const focusedItemId = document.activeElement instanceof HTMLElement &&
    inventoryHud.contains(document.activeElement) ? document.activeElement.dataset.itemId : undefined;
  inventoryHud.replaceChildren();
  const rows = new Map<string, HTMLDivElement>();
  for (const [index,item] of ITEMS.entries()) {
    const row = document.createElement("div");
    row.className = `inventory-row${item.id === selectedItem ? " selected" : ""}${store.state.shopEconomy.bag[item.id]===0?" empty":""}`;
    row.setAttribute("role","button");
    row.setAttribute("tabindex","0");
    row.dataset.itemId = item.id;
    row.setAttribute("aria-label",`Select ${item.name}, ${store.state.shopEconomy.bag[item.id]} available`);
    row.setAttribute("aria-pressed",String(item.id===selectedItem));
    row.title=`${index+1}: ${item.name}`;
    row.addEventListener("click",()=>interactions.selectItem(item.id));
    row.addEventListener("keydown",event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();interactions.selectItem(item.id);}});
    const key=document.createElement("kbd");
    key.className="hotbar-key";key.textContent=String(index+1);
    const dot = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    dot.classList.add("item-pictogram");
    dot.setAttribute("viewBox", "0 0 48 48");
    dot.setAttribute("aria-hidden", "true");
    const symbol = document.createElementNS("http://www.w3.org/2000/svg", "use");
    symbol.setAttribute("href", import.meta.env.BASE_URL + "assets/ui-item-icons.svg#" + item.id);
    dot.append(symbol);
    const name = document.createElement("span");
    name.textContent = item.name;
    name.className="item-name";
    const quantity = document.createElement("strong");
    quantity.textContent = String(store.state.shopEconomy.bag[item.id]);
    row.append(key,dot, name, quantity);
    inventoryHud.append(row);
    rows.set(item.id, row);
  }
  const capacity = document.createElement("div");
  capacity.className = "capacity";
  const bagCount=Object.values(store.state.shopEconomy.bag)
    .reduce((sum,quantity)=>sum+quantity,0);
  capacity.setAttribute("aria-label",`Bag ${bagCount} of ${ECONOMY.bagCapacity}`);
  const amount=document.createElement("span");
  amount.textContent=`${bagCount}/${ECONOMY.bagCapacity}`;
  capacity.append(uiIcon("bag"),amount);
  inventoryHud.append(capacity);
  const selectedStock=ITEMS.find(item=>item.id===selectedItem)!;
  const selectedStatus=document.createElement("div");
  selectedStatus.className="hotbar-selected";
  selectedStatus.setAttribute("role","status");
  selectedStatus.dataset.empty=String(store.state.shopEconomy.bag[selectedStock.id]===0);
  selectedStatus.textContent="READY TO STOCK · "+selectedStock.name+" · "+
    store.state.shopEconomy.bag[selectedStock.id]+" in bag";
  inventoryHud.append(selectedStatus);
  const hint=document.createElement("span");hint.className="hotbar-hint";
  hint.textContent="Wheel / 1–6 select · Click one · Shift+click fill / clear";
  inventoryHud.append(hint);
  if (focusedItemId) rows.get(focusedItemId)?.focus({ preventScroll: true });
}

let isShopActive = () => true;
let cashier:ReturnType<typeof setupCashierHud>|null=null;
beggarHud=setupBeggarHud(canvas,camera,store,npcVisuals,
  ()=>isShopActive(),message=>{statusHud.textContent=message;});
const merchantActions=createMerchantActions(scene,camera,()=>sfx.soundEnabled,()=>sfx.soundVolume,()=>isShopActive(),()=>selectedItemId);
const interactions = new InteractionSystem(scene, canvas, camera, shop, worldItems, (message, selected) => {
  selectedItemId = selected;
  statusHud.textContent = message;
  renderInventory(selected);
}, toggleCatalog, 3, openRoster, () => cashier?.open()??"Register unavailable.",
  () => isShopActive(), () => bedtime?.isNearBed()??false,
  () => beggarHud?.openNearest()??false,
  debtBook.open,store,action=>merchantActions.play(action));
setupControlsHotbarClearance();
setupShopServiceBrief(scene,store,npcVisuals,()=>isShopActive(),
  itemId=>interactions.selectItem(itemId));
let lastRenderedBag=store.state.shopEconomy.bag;
store.subscribe(()=>{
  const bag=store.state.shopEconomy.bag;
  if(bag===lastRenderedBag)return;
  lastRenderedBag=bag;
  renderInventory(selectedItemId);
});
renderInventory(selectedItemId);
const soundtrack = setupSoundtrack();
const sfx = setupGameSfx();
const cashierSfx=createCashierSfx(()=>sfx.soundEnabled,()=>sfx.soundVolume);
const arena = new Level6Arena(engine, canvas, camera, store, (active) => {
  soundtrack.setArenaMix(active);
  sfx.setArenaMix(active);
  soundtrack.setScene(active ? "boss" : "shop");
},()=>soundtrack.bossPlaybackSeconds,
  ()=>soundtrack.restartBossTheme(),
  seconds=>soundtrack.skipBossIntro(seconds),sfx);
const dungeon = new DungeonViewer(engine, canvas, camera, store, (active) => {
  soundtrack.setScene(active ? "dungeon" : "shop");
});
watchLiveHero=id=>{
  if(!dungeon.openLive(id))
    statusHud.textContent="No active LIVE dungeon observation for this signature.";
};
setupExpeditionArchiveHud(canvas,camera,store,
  (eventId,seconds)=>dungeon.openReplayAt(eventId,seconds),
  eventId=>{arena.open(eventId);return arena.isActive;});
isShopActive=()=>!arena.isActive&&!dungeon.isActive&&!(bedtime?.isBlocking??false);
ledger=setupMerchantLedger(()=>{
  camera.attachControl(canvas,true);
  statusHud.textContent="Morning has come. The shop is open.";
},(event)=>{
  if(event.type==="level6-combat"&&event.combatReplay){
    arena.open(event.id);
    return arena.isActive;
  }
  if((event.type==="level7-exploration"&&event.level7Replay) ||
     (event.type==="dungeon-exploration"&&event.dungeonReplay)){
    dungeon.open();
    if(!dungeon.isActive)return false;
    const selector=document.querySelector<HTMLSelectElement>("#dungeon-replay-select")!;
    selector.value=event.id;
    selector.dispatchEvent(new Event("change",{bubbles:true}));
    return selector.value===event.id;
  }
  return false;
},()=>sfx.soundEnabled,()=>sfx.soundVolume);
if(ledger.resumePending(store.state))camera.detachControl();
bedtime=setupBedtime(scene,canvas,camera,
  ()=>!arena.isActive&&!dungeon.isActive,
  ()=>{
    const before=store.state;
    dayClock.endDayFromBed();
    worldClockPacer.reset();
    ledger!.open(before,store.state);
    statusHud.textContent="Day closed. The merchant's ledger is open.";
  },
  ()=>!!ledger&&(ledger.isOpen||ledger.isSuspended));
cashier=setupCashierHud(canvas,camera,store,()=>npcVisuals.readyCheckoutHeroId(),isShopActive,
  (heroId,perfectTiming)=>{
    const before=store.state;
    const result=store.payReservedCart(heroId,perfectTiming);
    if(store.state!==before)merchantActions.play("checkout");
    return result;
  },message=>{statusHud.textContent=message;},cashierSfx.play,cashierSfx.pulse);

engine.runRenderLoop(() => {
  const frameMs=ignoreNextClockFrame?0:engine.getDeltaTime();
  ignoreNextClockFrame=false;
  // The register is a DOM-only modal. Its world clock is paused already,
  // so avoid wasting GPU/CPU on a hidden 3D scene while input matters.
  if(cashier?.isOpen||document.body.classList.contains("cashier-active")){
    npcVisuals.setWorldPaused(true);
    worldClockPacer.reset();
    return;
  }
  // LIVE spectator is a camera only: the saved world and physical shop
  // customers must continue on the one authoritative 50ms clock.
  const paused=document.hidden||(!isShopActive()&&!dungeon.isWatchingLive)||
    !!document.querySelector("dialog[open]")||
    document.body.classList.contains("blueprint-active");
  npcVisuals.setWorldPaused(paused);
  worldClockPacer.step(frameMs,paused,ticks=>{
    // One committed timeline drives both store mutations and physical motion.
    // Shopper/stock events caused by physical arrival occur in this fixed-step
    // callback, never during Babylon scene.render().
    shopTickInProgress=true;
    try{
      advancePhysicalShopWorldTicks(ticks,
        ()=>store.state.worldClock.tick,
        ()=>profile("world-step",()=>store.advanceWorldTime(1)),
        ()=>{
          profile("npc-step",()=>npcVisuals.advanceWorldTicks(1));
          syncTrafficCheckpointAfterStep();
          for(const exit of npcVisuals.drainCompletedExits())
            store.completePhysicalShopExit(exit.heroId,exit.outerGateZ);
        });
    }finally{
      shopTickInProgress=false;
    }
  });
  npcVisuals.setWishBubblesVisible(!arena.isActive&&!dungeon.isActive);
  if(ledger?.isSuspended&&!arena.isActive&&!dungeon.isActive){
    ledger.resumeIfReady();
    camera.detachControl();
  }
  if (dungeon.isActive) {
    dungeon.update(engine.getDeltaTime() / 1000);
    dungeon.currentScene?.render();
  } else if (arena.isActive) {
    arena.update(engine.getDeltaTime() / 1000);
    arena.currentScene?.render();
  } else profile("scene-render",()=>scene.render());
});
window.addEventListener("resize", () => engine.resize());
}

void startGame();
