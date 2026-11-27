import type {UniversalCamera} from "@babylonjs/core/Cameras/universalCamera";
import type {GameStore} from "./game/gameStore.ts";
import {EMPLOYEE_DEFINITIONS,EMPLOYEE_TASKS,type EmployeeTask,type EmployeeState} from "./game/employees.ts";
const names:Record<EmployeeTask,string>={cashier:"Cashier",restocking:"Restocking",charity:"Charity (credit)"};
export function setupEmployeeHud(canvas:HTMLCanvasElement,camera:UniversalCamera,store:GameStore,shopActive:()=>boolean){
  const dialog=document.querySelector<HTMLDialogElement>("#employee-dialog")!;
  const list=document.querySelector<HTMLElement>("#employee-list")!;
  const describe=(e:EmployeeState)=>{
    if(!e.restock&&!e.job&&EMPLOYEE_TASKS.every(t=>e.priorities[t]===0))
      return e.status==="walking"?"Returning to cellar · work disabled":"Off duty · enable work or set priorities";
    if(!store.state.cellarDoorOpen&&e.z<-12.1&&EMPLOYEE_TASKS.some(t=>e.priorities[t]>0))
      return "Cellar passage closed · open the portrait to let Tettel work";
    return e.restock?
    (e.restock.stage==="collect"?"Collecting stock":e.restock.stage==="return"?"Returning unused stock":"Delivering "+e.restock.units+" units")+
      (e.status==="blocked"?" · route blocked":""):
    e.status==="blocked"?"Waiting for a clear route":e.job?.task==="cashier"?(e.status==="ready"?"Serving customer":"Walking to register"):e.job?.task==="charity"?(e.status==="ready"?"Serving credit request":"Walking to petitioner"):e.status==="walking"?"Walking to standby":e.z>=-6.5?"On standby in shop":"Idle · no available work";
  };
  const render=()=>{
    list.replaceChildren(...store.state.employees.map(e=>{
      const def=EMPLOYEE_DEFINITIONS.find(d=>d.id===e.id)!;
      const card=document.createElement("section");card.className="employee-card";
      const title=document.createElement("h3");title.textContent=def.name;
      const traits=document.createElement("p");traits.textContent="Undead shop assistant · Reliable · No tips";
      const status=document.createElement("p");status.className="employee-status";status.dataset.employeeId=e.id;
      status.textContent=describe(e);
      const tasks=document.createElement("div");tasks.className="employee-priorities";
      for(const task of EMPLOYEE_TASKS.filter(t=>def.skills.includes(t))){
        const label=document.createElement("label");label.textContent=names[task];
        const input=document.createElement("select");input.dataset.task=task;
        input.setAttribute("aria-label",def.name+" "+names[task]+" priority");
        for(let i=0;i<=9;i++)input.add(new Option(i===0?"Off":String(i),String(i)));
        input.value=String(e.priorities[task]);
        input.addEventListener("change",()=>store.setEmployeePriority(e.id,task,Number(input.value)));
        label.append(input);tasks.append(label);
      }
      const presets=document.createElement("div");presets.className="employee-presets";
      const enable=document.createElement("button");enable.type="button";enable.textContent="Enable work";
      enable.addEventListener("click",()=>{
        store.setEmployeePriority(e.id,"cashier",1);
        store.setEmployeePriority(e.id,"restocking",5);
        // Credit is deliberately opt-in.
        render();
      });
      const stop=document.createElement("button");stop.type="button";stop.textContent="Off duty";
      stop.addEventListener("click",()=>{for(const task of EMPLOYEE_TASKS)store.setEmployeePriority(e.id,task,0);render();});
      const hint=document.createElement("p");hint.className="employee-note";
      hint.textContent="Open the portrait passage. Restocking requires an assigned shelf and owned bag stock.";
      presets.append(enable,stop);
      card.append(title,traits,status,presets,tasks,hint);return card;
    }));
  };
  store.subscribe(()=>{
    if(!dialog.open)return;
    for(const e of store.state.employees){
      const status=list.querySelector<HTMLElement>('[data-employee-id="'+e.id+'"]');
      const value=describe(e);
      if(status&&status.textContent!==value)status.textContent=value;
    }
  });
  const close=()=>{if(dialog.open)dialog.close();};
  const open=()=>{
    if(!shopActive()||dialog.open||document.querySelector("dialog[open]")||
      document.body.classList.contains("blueprint-active"))return;
    if(document.pointerLockElement===canvas)void document.exitPointerLock();
    camera.detachControl();render();dialog.showModal();
  };
  document.querySelector("#open-employees")!.addEventListener("click",open);
  document.querySelector("#close-employees")!.addEventListener("click",close);
  dialog.addEventListener("close",()=>{if(shopActive())camera.attachControl(canvas,true);});
  window.addEventListener("keydown",event=>{
    if(event.code!=="KeyJ"||event.repeat||event.ctrlKey||event.altKey||event.metaKey)return;
    if(event.target instanceof HTMLElement&&event.target.closest("input,textarea,select,[contenteditable]"))return;
    if(dialog.open)close();else open();
  });
  return {close};
}
