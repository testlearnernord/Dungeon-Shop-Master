import type {GameStore} from "./game/gameStore.ts";
import type {WorldFeedCategory,WorldFeedEntry,WorldFeedTarget}
  from "./game/worldFeedProjection.ts";
import {initialWorldFeedCritical,projectWorldFeedChanges}
  from "./game/worldFeedProjection.ts";

export type WorldFeedLevel="minimal"|"standard"|"detailed";
export type WorldFeedSeconds=5|7|10;
interface FeedSettings {level:WorldFeedLevel;seconds:WorldFeedSeconds}
const SETTING_KEY="dsm-world-feed-preferences-v1";
const LOAD_PRESETS:Record<WorldFeedLevel,readonly WorldFeedCategory[]>={
  minimal:["death","boss"],
  standard:["death","boss","combat","party"],
  detailed:["death","boss","combat","party","treasure","travel"],
};
const validSeconds=(v:unknown):v is WorldFeedSeconds=>v===5||v===7||v===10;
function loadSettings():FeedSettings{
  try{
    const raw=JSON.parse(localStorage.getItem(SETTING_KEY)??"null");
    return {
      level:raw&&["minimal","standard","detailed"].includes(raw.level)
        ?raw.level as WorldFeedLevel:"standard",
      seconds:raw&&validSeconds(raw.seconds)?raw.seconds:7,
    };
  }catch{return {level:"standard",seconds:7};}
}

/** One global overlay across shop, LIVE floor and both combat stages.
 * Does not mutate the GameStore or create a second reporting authority. */
export function setupWorldEventFeed(
  store:GameStore,
  onJump:(target:WorldFeedTarget)=>boolean,
):void{
  const root=document.createElement("aside");
  root.id="world-event-feed";
  root.setAttribute("aria-label","Living World events and notification settings");
  const stack=document.createElement("div");
  stack.className="world-feed-stack";
  stack.setAttribute("aria-live","polite");
  stack.setAttribute("aria-relevant","additions");
  const footer=document.createElement("div");
  footer.className="world-feed-footer";
  const settingsButton=document.createElement("button");
  settingsButton.type="button";
  settingsButton.id="world-feed-toggle";
  settingsButton.textContent="✦ WORLD ECHOES · SETTINGS";
  settingsButton.setAttribute("aria-expanded","false");
  const panel=document.createElement("div");
  panel.id="world-feed-settings";
  panel.hidden=true;
  const levelLabel=document.createElement("label");
  levelLabel.textContent="Announcements ";
  const level=document.createElement("select");
  level.id="world-feed-level";
  level.setAttribute("aria-label","World event importance");
  for(const [id,title] of [
    ["minimal","Critical only"],
    ["standard","Standard · important"],
    ["detailed","Detailed · discoveries too"],
  ]){
    level.add(new Option(title,id));
  }
  const durationLabel=document.createElement("label");
  durationLabel.textContent="Duration ";
  const duration=document.createElement("select");
  duration.id="world-feed-duration";
  duration.setAttribute("aria-label","World event duration");
  for(const value of [5,7,10])
    duration.add(new Option(value+" seconds",String(value)));
  let settings=loadSettings();
  level.value=settings.level;
  duration.value=String(settings.seconds);
  levelLabel.append(level);
  durationLabel.append(duration);
  const help=document.createElement("small");
  help.textContent="No world clock, AI or combat actions. Click a notice to observe.";
  panel.append(levelLabel,durationLabel,help);
  footer.append(settingsButton,panel);
  root.append(stack,footer);
  document.body.append(root);

  const pending:WorldFeedEntry[]=[];
  const active=new Map<string,{node:HTMLElement;clear:()=>void}>();
  const seen=new Set<string>();
  const saveSettings=()=>{
    settings={level:level.value as WorldFeedLevel,
      seconds:Number(duration.value) as WorldFeedSeconds};
    try{localStorage.setItem(SETTING_KEY,JSON.stringify(settings));}
    catch{/* Browser storage may be disabled; settings still work this session. */}
    for(const [id,item] of [...active]){
      if(LOAD_PRESETS[settings.level].includes(
        (item.node.dataset.category??"") as WorldFeedCategory))continue;
      item.clear();active.delete(id);item.node.remove();
    }
    for(let i=pending.length-1;i>=0;i--)if(!LOAD_PRESETS[settings.level]
      .includes(pending[i].category))pending.splice(i,1);
    drain();
  };
  level.addEventListener("change",saveSettings);
  duration.addEventListener("change",saveSettings);
  settingsButton.addEventListener("click",()=>{
    panel.hidden=!panel.hidden;
    settingsButton.setAttribute("aria-expanded",String(!panel.hidden));
  });

  function drain():void{
    while(active.size<2&&pending.length){
      const item=pending.shift()!;
      if(!LOAD_PRESETS[settings.level].includes(item.category))continue;
      const toast=document.createElement("article");
      toast.className="world-feed-toast";
      toast.dataset.category=item.category;
      toast.dataset.feedId=item.id;
      toast.setAttribute("role",item.category==="death"?"alert":"status");
      const action=document.createElement("button");
      action.type="button";
      action.className="world-feed-jump";
      action.setAttribute("aria-label","Jump to event: "+item.title);
      const eyebrow=document.createElement("small");
      eyebrow.textContent="THE LIVING WORLD · "+item.category.toUpperCase();
      const title=document.createElement("strong");
      title.textContent=item.title;
      const detail=document.createElement("span");
      detail.textContent=item.detail;
      const prompt=document.createElement("small");
      prompt.className="world-feed-prompt";
      prompt.textContent="CLICK TO OBSERVE";
      action.append(eyebrow,title,detail,prompt);
      const close=document.createElement("button");
      close.type="button";
      close.className="world-feed-dismiss";
      close.setAttribute("aria-label","Dismiss "+item.title);
      close.textContent="×";
      toast.append(action,close);
      let timer:ReturnType<typeof setTimeout>|undefined;
      const stop=()=>{if(timer!==undefined)clearTimeout(timer);};
      const dispose=()=>{
        stop();active.delete(item.id);toast.remove();
        drain();
      };
      const arm=()=>{stop();timer=setTimeout(dispose,settings.seconds*1000);};
      toast.addEventListener("mouseenter",stop);
      toast.addEventListener("mouseleave",arm);
      toast.addEventListener("focusin",stop);
      toast.addEventListener("focusout",event=>{
        if(!toast.contains(event.relatedTarget as Node|null))arm();
      });
      action.addEventListener("click",()=>{
        if(onJump(item.target))dispose();
        else {
          prompt.textContent="EVENT NO LONGER LIVE · CHECK THE BOARD";
          arm();
        }
      });
      close.addEventListener("click",dispose);
      stack.prepend(toast);
      active.set(item.id,{node:toast,clear:stop});
      arm();
    }
  }
  function enqueue(entries:readonly WorldFeedEntry[]):void{
    for(const item of entries){
      if(seen.has(item.id))continue;
      seen.add(item.id);
      if(!LOAD_PRESETS[settings.level].includes(item.category))continue;
      pending.push(item);
    }
    // Keep the latest, highest-priority critical notices when a full
    // day-close batch arrives. Never fill the viewport with 20 cards.
    if(pending.length>10){
      const selected=pending.slice(-10);
      pending.splice(0,pending.length,...selected);
    }
    drain();
  }
  let previous=store.state;
  const critical=initialWorldFeedCritical(previous);
  if(critical)enqueue([critical]);
  store.subscribe(()=>{
    const next=store.state;
    if(next.events===previous.events&&
       next.liveDungeon.combats===previous.liveDungeon.combats&&
       next.liveDungeon.bossCombat===previous.liveDungeon.bossCombat){
      previous=next;return;
    }
    const entries=projectWorldFeedChanges(previous,next);
    previous=next;
    enqueue(entries);
  });
}
