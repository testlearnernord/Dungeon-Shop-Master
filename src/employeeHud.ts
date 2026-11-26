import type {UniversalCamera} from "@babylonjs/core/Cameras/universalCamera";
import type {GameStore} from "./game/gameStore.ts";
import {EMPLOYEE_DEFINITIONS,EMPLOYEE_TASKS,type EmployeeTask} from "./game/employees.ts";
const names:Record<EmployeeTask,string>={cashier:"Cashier",restocking:"Restocking",charity:"Charity"};
export function setupEmployeeHud(canvas:HTMLCanvasElement,camera:UniversalCamera,store:GameStore,shopActive:()=>boolean){
  const dialog=document.querySelector<HTMLDialogElement>("#employee-dialog")!;
  const list=document.querySelector<HTMLElement>("#employee-list")!;
  const render=()=>{
    list.replaceChildren(...store.state.employees.map(e=>{
      const def=EMPLOYEE_DEFINITIONS.find(d=>d.id===e.id)!;
      const card=document.createElement("section");card.className="employee-card";
      const title=document.createElement("h3");title.textContent=def.name;
      const traits=document.createElement("p");traits.textContent="Undead shop assistant · Reliable · No tips";
      const status=document.createElement("p");status.className="employee-status";
      status.textContent=e.status==="ready"?"At work point · training only":
        e.status==="blocked"?"Waiting for a clear route":
        e.status==="walking"?"Walking to "+(e.job?names[e.job.task]:"cellar"):"Idle in cellar";
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
      card.append(title,traits,status,tasks);return card;
    }));
  };
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
