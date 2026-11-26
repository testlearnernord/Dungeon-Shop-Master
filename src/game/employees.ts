import type {GameState} from "./gameState.ts";
import {counterDockPoint} from "./shopLayout.ts";
import {shelfServicePoint} from "./furnitureRegistry.ts";
import {employeeHome,employeeRoute,employeeSegmentClear,employeeStoragePoint,EMPLOYEE_HOME} from "./employeeNavigation.ts";
import {WORLD_TICK_SECONDS} from "./worldClock.ts";
import {turnNpcToward} from "./npcLocomotion.ts";
import type {ShopPoint} from "./shopperNavigation.ts";
import {ECONOMY,availableBagUnits,isShelfGood,transferShelf,type ItemId} from "./economy.ts";

export const EMPLOYEE_TASKS=["cashier","restocking","charity"] as const;
export type EmployeeTask=typeof EMPLOYEE_TASKS[number];
export const EMPLOYEE_WORK_SPEED=1.47;
export const EMPLOYEE_REPLAN_TICKS=20;
export type EmployeePriority=0|1|2|3|4|5|6|7|8|9;
export interface EmployeeDefinition{
  readonly id:string;readonly name:string;readonly visual:"ghoul";
  readonly workSpeed:number;readonly earnsTips:boolean;
  readonly skills:readonly EmployeeTask[];
}
export const EMPLOYEE_DEFINITIONS:readonly EmployeeDefinition[]=[{
  id:"tettel",name:"Tettel",visual:"ghoul",workSpeed:EMPLOYEE_WORK_SPEED,
  earnsTips:false,skills:EMPLOYEE_TASKS,
}];
export interface EmployeeJob{
  readonly task:EmployeeTask;
  readonly targetId:string;
  readonly point:ShopPoint;
}
export interface EmployeeRestock{
  readonly slotId:string;
  readonly itemId:ItemId;
  readonly units:number;
  readonly stage:"collect"|"deliver"|"return";
  readonly readySince:number|null;
}
export interface EmployeeState extends ShopPoint{
  readonly id:string;
  readonly priorities:Readonly<Record<EmployeeTask,EmployeePriority>>;
  readonly pendingSince:Readonly<Record<EmployeeTask,number|null>>;
  readonly job:EmployeeJob|null;
  readonly restock:EmployeeRestock|null;
  readonly route:readonly ShopPoint[];
  readonly yaw:number;
  readonly lastStepTick:number;
  readonly nextPlanTick:number;
  readonly status:"idle"|"walking"|"ready"|"blocked";
}
const defaultPriorities=():Record<EmployeeTask,EmployeePriority>=>({cashier:0,restocking:0,charity:0});
const emptySince=():Record<EmployeeTask,number|null>=>({cashier:null,restocking:null,charity:null});
export const createEmployees=():EmployeeState[]=>EMPLOYEE_DEFINITIONS.map(def=>({
  id:def.id,...EMPLOYEE_HOME,yaw:0,priorities:defaultPriorities(),pendingSince:emptySince(),
  job:null,restock:null,route:[],lastStepTick:0,nextPlanTick:0,status:"idle",
}));
export function setEmployeePriority(state:GameState,id:string,task:EmployeeTask,priority:number):GameState{
  const def=EMPLOYEE_DEFINITIONS.find(d=>d.id===id);
  const employee=state.employees.find(e=>e.id===id);
  if(!def||!employee||!def.skills.includes(task)||!Number.isInteger(priority)||priority<0||priority>9||
    employee.priorities[task]===priority)return state;
  return {...state,employees:state.employees.map(e=>e.id===id?{
    ...e,priorities:{...e.priorities,[task]:priority as EmployeePriority},
    nextPlanTick:state.worldClock.tick,
  }:e)};
}
/** Real currently observed opportunities. C2 transacts restocking only. */
export function employeeOpportunities(state:GameState):EmployeeJob[]{
  const jobs:EmployeeJob[]=[];
  const head=state.shopCarts.find(c=>c.lines.length>0);
  const waiting=head&&state.shopTraffic.actors.find(a=>a.heroId===head.heroId&&
    a.phase==="queueing"&&a.shoppingPhase==="awaiting-checkout"&&a.checkoutQueueIndex===0);
  if(waiting)jobs.push({task:"cashier",targetId:waiting.heroId,point:counterDockPoint(state.shopLayout,"staff")});
  for(const slot of state.shopEconomy.slots){
    if(!slot.itemId||slot.quantity>=slot.capacity||availableBagUnits(state,slot.itemId)<=0||
      state.employees.some(e=>e.restock?.slotId===slot.id)||
      state.shopCarts.some(cart=>cart.lines.some(line=>line.slotId===slot.id)))continue;
    const shelf=state.shopLayout.shelves.find(s=>s.id===slot.shelfId);
    if(shelf)jobs.push({task:"restocking",targetId:slot.id,point:shelfServicePoint(shelf,slot.index)});
  }
  for(const request of state.shopRequests){
    if(request.reason!=="cannot-afford")continue;
    const claim=state.shopTraffic.claims.find(c=>c.heroId===request.heroId&&c.role==="credit");
    if(claim)jobs.push({task:"charity",targetId:request.heroId,point:claim.point});
  }
  return jobs;
}
export function chooseEmployeeJob(employee:EmployeeState,jobs:readonly EmployeeJob[],tick:number){
  const pendingSince={...employee.pendingSince};
  for(const task of EMPLOYEE_TASKS)
    pendingSince[task]=employee.priorities[task]>0&&jobs.some(j=>j.task===task)
      ?pendingSince[task]??tick:null;
  const sorted=jobs.filter(j=>employee.priorities[j.task]>0).sort((a,b)=>
    employee.priorities[a.task]-employee.priorities[b.task]||
    (pendingSince[a.task]??tick)-(pendingSince[b.task]??tick)||
    EMPLOYEE_TASKS.indexOf(a.task)-EMPLOYEE_TASKS.indexOf(b.task)||
    a.targetId.localeCompare(b.targetId));
  // Keep the current equivalent opportunity stable; another task of the
  // same type may be offered once its prior target disappears.
  const first=sorted[0];
  const job=first?(sorted.find(j=>j.task===first.task&&j.targetId===employee.job?.targetId)??first):null;
  return {job,pendingSince};
}
const distance=(a:ShopPoint,b:ShopPoint)=>Math.hypot(a.x-b.x,a.z-b.z);
const sameJob=(a:EmployeeJob|null,b:EmployeeJob|null)=>
  a===b||!!a&&!!b&&a.task===b.task&&a.targetId===b.targetId&&distance(a.point,b.point)<.01;

function advanceEmployee(state:GameState,e:EmployeeState,jobs:readonly EmployeeJob[],forced?:EmployeeJob):EmployeeState{
  const tick=state.worldClock.tick;
  if(e.lastStepTick>=tick)return e;
  // No catch-up movement after bedtime, reload or headless clock advances.
  // Actual physical shop callbacks own the committed movement slice.
  const def=EMPLOYEE_DEFINITIONS.find(d=>d.id===e.id)!;
  let next:EmployeeState={...e,lastStepTick:tick};
  if(tick>=e.nextPlanTick){
    const chosen=chooseEmployeeJob(e,jobs,tick);
    const {pendingSince}=chosen;
    const job=forced??chosen.job;
    const home=employeeHome(state);
    const goal=job?.point??home;
    const changed=!sameJob(e.job,job);
    let route=e.route;
    if(!goal)route=[];
    else if(changed||!route.length||distance(route.at(-1)!,goal)>.08||!employeeSegmentClear(state,e,route[0])){
      route=distance(e,goal)<.08?[]:employeeRoute(state,e,goal)?.waypoints??[];
    }
    const arrived=!!goal&&distance(e,goal)<.08;
    next={...next,job,pendingSince,route,nextPlanTick:tick+EMPLOYEE_REPLAN_TICKS,
      status:arrived?(job?"ready":"idle"):route.length?"walking":"blocked"};
  }
  const target=next.route[0];
  if(!target)return next;
  const d=distance(next,target),step=def.workSpeed*WORLD_TICK_SECONDS;
  const point=d<=step?target:{x:next.x+(target.x-next.x)*step/d,z:next.z+(target.z-next.z)*step/d};
  if(!employeeSegmentClear(state,next,point))return {...next,route:[],status:"blocked"};
  // Yield to an actual customer in the aisle, never push them through a wall.
  const blocked=state.shopTraffic.actors.some(a=>
    distance(a,point)<.65&&distance(a,point)<distance(a,next));
  if(blocked)return {...next,status:"blocked"};
  const route=d<=step?next.route.slice(1):next.route;
  return {...next,...point,route,status:route.length?"walking":next.job?"ready":"idle",
    yaw:turnNpcToward(next.yaw,Math.atan2(target.x-next.x,target.z-next.z),WORLD_TICK_SECONDS,3.2)};
}
const setEmployee=(state:GameState,employee:EmployeeState):GameState=>
  state.employees.find(e=>e.id===employee.id)===employee?state:
    {...state,employees:state.employees.map(e=>e.id===employee.id?employee:e)};
const shelfTarget=(state:GameState,r:EmployeeRestock):EmployeeJob|null=>{
  const slot=state.shopEconomy.slots.find(s=>s.id===r.slotId);
  if(!slot||slot.itemId!==r.itemId||slot.quantity>=slot.capacity||
    state.shopCarts.some(cart=>cart.lines.some(line=>line.slotId===r.slotId)))return null;
  const shelf=state.shopLayout.shelves.find(s=>s.id===slot.shelfId);
  return shelf?{task:"restocking",targetId:r.slotId,point:shelfServicePoint(shelf,slot.index)}:null;
};
const clearWork=(e:EmployeeState,tick:number):EmployeeState=>({
  ...e,restock:null,job:null,route:[],status:"idle",nextPlanTick:tick,
});
const nextStage=(e:EmployeeState,stage:EmployeeRestock["stage"],tick:number):EmployeeState=>({
  ...e,restock:{...e.restock!,stage,readySince:null},job:null,route:[],status:"idle",nextPlanTick:tick,
});

/** One physical worker checkpoint and a reservation of canonical bag stock.
 * Galvik may refill/reassign a shelf while Tettel is walking. Work is
 * revalidated before collection and delivery; undelivered cargo is returned
 * to the physical chest without minting or destroying a single unit. */
export function advanceEmployees(state:GameState):GameState{
  if(state.employees.every(e=>!e.restock&&!e.job&&!e.route.length&&e.status==="idle"&&
    EMPLOYEE_TASKS.every(t=>e.priorities[t]===0)&&distance(e,employeeHome(state)??e)<.08))
    return state;
  const tick=state.worldClock.tick;
  let next=state;
  for(const id of state.employees.map(e=>e.id)){
    let e=next.employees.find(worker=>worker.id===id)!;
    if(e.lastStepTick>=tick)continue;
    // Bedtime or a suspended physical scene cannot finish a work timer remotely.
    if(e.restock&&e.restock.readySince!==null&&e.lastStepTick+1!==tick){
      e={...e,restock:{...e.restock,readySince:null}};next=setEmployee(next,e);
    }
    if(e.restock&&(e.priorities.restocking===0||!shelfTarget(next,e.restock))){
      if(e.restock.stage==="collect")e=clearWork(e,tick);
      else if(e.restock.stage==="deliver")e=nextStage(e,"return",tick);
      next=setEmployee(next,e);
    }
    // Unimplemented cashier and charity priorities may be configured but
    // must not starve the first genuine work type.
    const jobs=tick>=e.nextPlanTick&&!e.restock
      ?employeeOpportunities(next).filter(j=>j.task==="restocking"):[];
    if(!e.restock&&tick>=e.nextPlanTick){
      const chosen=chooseEmployeeJob(e,jobs,tick);
      const slot=next.shopEconomy.slots.find(s=>s.id===chosen.job?.targetId);
      if(chosen.job?.task==="restocking"&&slot?.itemId&&employeeStoragePoint(next)){
        const units=Math.min(slot.capacity-slot.quantity,availableBagUnits(next,slot.itemId));
        if(units>0){
          e={...e,pendingSince:chosen.pendingSince,restock:{
            slotId:slot.id,itemId:slot.itemId,units,stage:"collect",readySince:null,
          },job:null,route:[],nextPlanTick:tick,status:"idle"};
          next=setEmployee(next,e);
        }
      }
    }
    let forced:EmployeeJob|undefined;
    if(e.restock){
      const r=e.restock;
      const dock=r.stage==="deliver"?null:employeeStoragePoint(next);
      forced=(r.stage==="deliver"?shelfTarget(next,r):
        dock?{task:"restocking",targetId:r.slotId,point:dock}:null)??undefined;
      if(!forced){
        next=setEmployee(next,{...e,lastStepTick:tick,route:[],job:null,status:"blocked",
          restock:{...r,readySince:null},nextPlanTick:tick+EMPLOYEE_REPLAN_TICKS});
        continue;
      }
    }
    const moved=advanceEmployee(next,e,jobs,forced);
    next=setEmployee(next,moved);
    const r=moved.restock;
    if(!r||!forced)continue;
    if(moved.status!=="ready"||distance(moved,forced.point)>=.08){
      if(r.readySince!==null)next=setEmployee(next,{...moved,restock:{...r,readySince:null}});
      continue;
    }
    if(r.readySince===null){
      next=setEmployee(next,{...moved,restock:{...r,readySince:tick}});
      continue;
    }
    const workTicks=r.stage==="deliver"?20*r.units:20;
    if(tick-r.readySince<workTicks)continue;
    if(r.stage==="collect"){
      next=setEmployee(next,nextStage(moved,"deliver",tick));
      continue;
    }
    if(r.stage==="return"){
      next=setEmployee(next,clearWork(moved,tick));
      continue;
    }
    // Release only this worker's reservation in an isolated input snapshot.
    // The existing shelf mutation still checks stock, assignment, capacity
    // and unpaid cart locks; it is the sole transfer authority.
    const released=setEmployee(next,clearWork(moved,tick));
    const result=transferShelf(released,r.slotId,r.itemId,"stock",r.units);
    const deposited=released.shopEconomy.bag[r.itemId]-result.state.shopEconomy.bag[r.itemId];
    if(deposited===r.units)next=result.state;
    else if(deposited>0){
      next=setEmployee(result.state,{...nextStage(moved,"return",tick),
        restock:{...r,units:r.units-deposited,stage:"return",readySince:null}});
    }else next=setEmployee(next,nextStage(moved,"return",tick));
  }
  return next;
}

export function validateEmployees(raw:unknown,tick:number):asserts raw is readonly EmployeeState[]{
  const fail=(why:string):never=>{throw new RangeError("Invalid employees: "+why);};
  const exact=(v:unknown,keys:readonly string[]):v is Record<string,unknown>=>
    !!v&&typeof v==="object"&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
  const integer=(v:unknown,min:number,max:number)=>typeof v==="number"&&Number.isSafeInteger(v)&&v>=min&&v<=max;
  const finite=(v:unknown,min:number,max:number)=>typeof v==="number"&&Number.isFinite(v)&&v>=min&&v<=max;
  const point=(v:unknown)=>exact(v,["x","z"])&&finite(v.x,-13,13)&&finite(v.z,-34,7);
  if(!Array.isArray(raw)||raw.length!==EMPLOYEE_DEFINITIONS.length)fail("wrong employee count");
  const seen=new Set<string>();
  for(const e of raw as unknown[]){
    if(!exact(e,["id","x","z","yaw","priorities","pendingSince","job","restock","route","lastStepTick","nextPlanTick","status"]))fail("unexpected fields");
    const v=e as Record<string,unknown>;
    if(typeof v.id!=="string"||!EMPLOYEE_DEFINITIONS.some(d=>d.id===v.id)||seen.has(v.id as string))fail("unknown or duplicate ID");
    seen.add(v.id as string);
    if(!point({x:v.x,z:v.z})||!finite(v.yaw,-10000,10000)||
      !integer(v.lastStepTick,0,tick)||!integer(v.nextPlanTick,0,tick+EMPLOYEE_REPLAN_TICKS))fail("invalid position or time");
    if(!exact(v.priorities,EMPLOYEE_TASKS)||!EMPLOYEE_TASKS.every(k=>integer((v.priorities as Record<string,unknown>)[k],0,9)))fail("invalid priorities");
    if(!exact(v.pendingSince,EMPLOYEE_TASKS)||!EMPLOYEE_TASKS.every(k=>{
      const value=(v.pendingSince as Record<string,unknown>)[k];return value===null||integer(value,0,tick);
    }))fail("invalid waiting age");
    if(v.job!==null&&(!exact(v.job,["task","targetId","point"])||
      !EMPLOYEE_TASKS.includes(v.job.task as EmployeeTask)||typeof v.job.targetId!=="string"||
      !v.job.targetId.length||v.job.targetId.length>100||!point(v.job.point)))fail("invalid job");
    if(v.restock!==null){
      if(!exact(v.restock,["slotId","itemId","units","stage","readySince"]))fail("invalid restock checkpoint");
      const r=v.restock as Record<string,unknown>;
      if(typeof r.slotId!=="string"||!/^shelf-[1-9][0-9]*-slot-[1-4]$/.test(r.slotId)||
        typeof r.itemId!=="string"||!isShelfGood(r.itemId as ItemId)||
        !integer(r.units,1,ECONOMY.slotCapacity)||
        !["collect","deliver","return"].includes(r.stage as string)||
        (r.readySince!==null&&!integer(r.readySince,0,tick)))fail("invalid restock checkpoint");
    }
    if(!Array.isArray(v.route)||v.route.length>256||!v.route.every(point)||
      !["idle","walking","ready","blocked"].includes(v.status as string))fail("invalid route or status");
  }
}
