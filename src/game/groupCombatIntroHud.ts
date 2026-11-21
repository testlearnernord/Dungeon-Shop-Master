import type {CinematicFrame} from "./combatCinematic.ts";
import type {CombatantSpec} from "./groupCombat.ts";

/**
 * Presentation-only title card for the same authored camera intro watched
 * in the original Floor-6 preview. Never steps an encounter or exposes
 * uncommitted HP. One DOM overlay per opted-in spectator, disposed on exit.
 */
export class GroupCombatIntroHud {
  private readonly root:HTMLDivElement;
  private readonly caption:HTMLParagraphElement;
  private readonly progress:HTMLDivElement;

  constructor(host:HTMLElement,actors:readonly CombatantSpec[]){
    const monsters=actors.filter(actor=>actor.team==="monsters");
    const troll=monsters.some(actor=>actor.specialAbility==="grapple-throw");
    const root=document.createElement("div");
    root.className="group-combat-cinematic";
    root.dataset.kind=troll?"boss":"normal";
    root.hidden=true;
    root.setAttribute("aria-hidden","true");
    const copy=document.createElement("div");
    copy.className="arena-cinematic-copy";
    const eyebrow=document.createElement("small");
    eyebrow.textContent=troll?"BOSS ENCOUNTER":"THE LIVING DUNGEON";
    const title=document.createElement("strong");
    title.textContent=troll?"THE ASHEN TUNNEL MAULER":
      monsters.length===1?"THE GHOUL":"THE GHOUL PACK";
    const caption=document.createElement("p");
    caption.className="group-combat-cinematic-caption";
    const hint=document.createElement("span");
    hint.textContent="SPACE / ENTER · SKIP INTRO";
    const track=document.createElement("div");
    track.className="arena-cinematic-track";
    track.setAttribute("aria-hidden","true");
    const progress=document.createElement("div");
    progress.className="group-combat-cinematic-progress";
    track.append(progress);
    copy.append(eyebrow,title,caption,hint,track);
    root.append(copy);
    host.append(root);
    this.root=root;
    this.caption=caption;
    this.progress=progress;
  }

  show(frame:CinematicFrame):void{
    this.root.hidden=false;
    this.caption.textContent=frame.caption;
    this.progress.style.width=Math.round(frame.progress*100)+"%";
  }
  hide():void{this.root.hidden=true;}
  dispose():void{this.root.remove();}
}
