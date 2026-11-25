import type {Engine} from "@babylonjs/core/Engines/engine";
import type {UniversalCamera} from "@babylonjs/core/Cameras/universalCamera";
import type {Scene} from "@babylonjs/core/scene";
import type {GameStore} from "./gameStore.ts";
import type {GameSfx} from "../gameSfx.ts";
import {CombatLabSfxDebugPanel} from "../gameSfxDebug.ts";
import {DeveloperCombatLab} from "./developerCombatLab.ts";
import {BossModelLab} from "./bossModelLab.ts";

/** Owns the V hotkey and presentation lifecycle only. Every test encounter
 * uses DeveloperCombatLab and the same GroupCombat motor as the live world. */
export class CombatLabController {
  private readonly panel=document.querySelector<HTMLElement>("#arena-hud")!;
  private readonly modelPanel=document.querySelector<HTMLElement>("#arena-model-panel")!;
  private readonly modelToggle=document.querySelector<HTMLButtonElement>("#arena-model-toggle")!;
  private readonly lab:DeveloperCombatLab;
  private readonly sfxLab:CombatLabSfxDebugPanel;
  private modelLab:BossModelLab|null=null;
  private readonly pressed=new Set<string>();
  private active=false;
  constructor(
    private readonly engine:Engine,private readonly canvas:HTMLCanvasElement,
    private readonly shopCamera:UniversalCamera,store:GameStore,
    private readonly onActiveChange:(active:boolean)=>void,
    private readonly sfx?:GameSfx,
    onFightChanged?:(boss:boolean)=>void,
  ){
    this.lab=new DeveloperCombatLab(engine,canvas,this.panel,store,sfx,onFightChanged);
    this.sfxLab=new CombatLabSfxDebugPanel(sfx);
    document.querySelector("#open-arena")!.addEventListener("click",()=>this.open());
    document.querySelector("#close-arena")!.addEventListener("click",()=>this.close());
    document.querySelector("#restart-arena")!.addEventListener("click",()=>this.restart());
    this.modelToggle.addEventListener("click",()=>this.toggleModelLab());
    document.querySelector("#lab-model")!.addEventListener("click",()=>this.toggleModelLab());
    const ui=(event:KeyboardEvent)=>event.target instanceof Element&&
      !!event.target.closest("#music-panel, #arena-sfx-debug, #arena-sfx-debug-toggle, #arena-lab-panel");
    window.addEventListener("keydown",event=>{
      if(!document.querySelector<HTMLElement>("#world-hero-card")?.hidden)return;
      if(!this.active){
        if(event.code==="KeyV"&&!event.repeat&&!document.querySelector("dialog[open]")&&
          !document.body.classList.contains("dungeon-active")){
          event.preventDefault();event.stopImmediatePropagation();this.open();
        }
        return;
      }
      if(this.modelLab){
        if(event.code==="Escape"||event.code==="KeyV"){
          event.preventDefault();event.stopImmediatePropagation();
          if(event.code==="Escape")this.toggleModelLab();else this.close();
        }
        return;
      }
      if(ui(event))return;
      event.preventDefault();event.stopImmediatePropagation();
      if(event.repeat)return;
      if(event.code==="KeyV"||event.code==="Escape")this.close();
      else if(event.code==="Space"||event.code==="Enter")this.lab.skipIntro();
      else if(event.code==="Tab")this.lab.nextFocus();
      else if(event.code==="KeyM")document.querySelector<HTMLButtonElement>("#music-toggle")?.focus();
      else this.pressed.add(event.code);
    },true);
    window.addEventListener("keyup",event=>{
      this.pressed.delete(event.code);
      if(!this.active||this.modelLab||ui(event))return;
      event.preventDefault();event.stopImmediatePropagation();
    },true);
    window.addEventListener("blur",()=>this.pressed.clear());
    canvas.addEventListener("pointerdown",event=>{
      if(!this.active||this.modelLab)return;
      event.preventDefault();event.stopImmediatePropagation();
      if(!this.lab.isIntroActive&&document.pointerLockElement!==canvas)
        void canvas.requestPointerLock();
    },true);
    document.addEventListener("mousemove",event=>{
      if(this.active&&!this.modelLab&&!this.lab.isIntroActive&&document.pointerLockElement===canvas)
        this.lab.turnCamera(event.movementX,event.movementY);
    },true);
  }
  get isActive():boolean{return this.active;}
  get currentScene():Scene|null{return this.active?(this.modelLab?.scene??this.lab.currentScene):null;}
  open():void{
    if(this.active||document.querySelector("dialog[open]")||
      document.body.classList.contains("dungeon-active"))return;
    this.shopCamera.detachControl();
    if(document.pointerLockElement)void document.exitPointerLock();
    this.active=true;
    this.onActiveChange(true);
    this.pressed.clear();
    this.panel.hidden=false;
    this.panel.dataset.devLab="true";
    this.panel.dataset.modelViewer="false";
    this.modelPanel.hidden=true;
    document.body.classList.add("arena-active");
    this.lab.open();
    this.sfxLab.setAvailable(true);
  }
  close():void{
    if(!this.active)return;
    this.active=false;
    this.modelLab?.dispose();this.modelLab=null;
    this.modelPanel.hidden=true;
    this.modelToggle.textContent="Inspect Tripo GLB";
    this.panel.dataset.modelViewer="false";
    this.panel.dataset.devLab="false";
    this.lab.close();
    this.sfx?.endArena();
    this.sfxLab.setAvailable(false);
    this.onActiveChange(false);
    this.pressed.clear();
    if(document.pointerLockElement)void document.exitPointerLock();
    this.panel.hidden=true;
    document.body.classList.remove("arena-active");
    this.shopCamera.attachControl(this.canvas,true);
    this.canvas.focus();
  }
  restart():void{if(this.active&&!this.modelLab)this.lab.restart();}
  private toggleModelLab():void{
    if(!this.active)return;
    if(this.modelLab){
      this.modelLab.dispose();this.modelLab=null;
      this.modelPanel.hidden=true;
      this.panel.dataset.modelViewer="false";
      this.modelToggle.textContent="Inspect Tripo GLB";
      this.lab.restart();
      this.sfxLab.setAvailable(true);
      return;
    }
    if(document.pointerLockElement)void document.exitPointerLock();
    this.lab.suspendForModelInspector();
    this.sfx?.endArena();
    this.sfxLab.setAvailable(false);
    this.pressed.clear();
    this.modelPanel.hidden=false;
    this.panel.dataset.modelViewer="true";
    this.modelToggle.textContent="Return to battle";
    this.modelLab=new BossModelLab(this.engine,this.canvas,this.modelPanel);
  }
  update(dt:number):void{
    if(!this.active)return;
    if(this.modelLab)return;
    this.lab.update(dt,this.pressed);
  }
}
