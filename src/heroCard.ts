import {uiIcon,itemIcon,goldIcon,type InterfaceIcon} from "./uiIcons.ts";
import {portraitCssFrame} from "./game/portraitAtlas.ts";
import {heroPortraitIndex} from "./game/heroIdentity.ts";
import {ITEMS} from "./game/economy.ts";
import {heroXpProgress,type HeroCardView} from "./game/heroCardView.ts";

export type HeroCardVariant="mini"|"expanded"|"combat";
const make=<K extends keyof HTMLElementTagNameMap>(
  tag:K,cls:string,text?:string):HTMLElementTagNameMap[K]=>{
  const node=document.createElement(tag);node.className=cls;
  if(text!==undefined)node.textContent=text;
  return node;
};
const pict=(icon:InterfaceIcon,text:string)=>{
  const s=make("span","hero-card-glyph");
  s.title=text;s.setAttribute("aria-label",text);s.append(uiIcon(icon));
  return s;
};
const metric=(icon:InterfaceIcon,title:string,value:string)=>{
  const cell=make("span","hero-card-metric");
  cell.title=title+": "+value;cell.append(pict(icon,title),
    make("span","hero-card-metric-value",value));
  return cell;
};
const item=(id:string,count:string,title:string)=>{
  const cell=make("span","hero-card-item");
  cell.title=title;cell.setAttribute("aria-label",title);
  cell.append(itemIcon(id,"hero-card-item-art"),
    make("span","hero-card-item-count",count));
  return cell;
};
const label=(text:string)=>make("small","hero-card-overline",text);

function portrait(hero:HeroCardView):HTMLElement {
  const node=make("span","hero-card-portrait roster-portrait");
  const index=heroPortraitIndex(hero.id);
  node.dataset.portraitId=String(index);
  node.setAttribute("aria-hidden","true");
  node.style.backgroundImage="url('"+import.meta.env.BASE_URL+
    "assets/hero-portraits.webp')";
  Object.assign(node.style,portraitCssFrame(index));
  return node;
}
function identity(hero:HeroCardView):HTMLElement{
  const row=make("header","hero-card-identity");
  const info=make("span","hero-card-person");
  const name=make("strong","hero-card-name",
    hero.name+(hero.level!==null?" · Lv "+hero.level:"")+
    " · "+hero.role.toUpperCase());
  const state=make("small","hero-card-status",hero.source==="recorded"?
    "RECORDED · "+hero.status.toUpperCase():
    hero.source==="training"?"TRAINING · "+hero.status.toUpperCase():
      hero.status.toUpperCase()+
      (hero.floor!==null?" · FLOOR "+hero.floor:""));
  info.append(name,state);
  const sigil=pict(hero.role==="tank"?"shield":
    hero.role==="healer"?"heart":"swords",hero.role);
  sigil.classList.add("hero-card-role");
  row.append(portrait(hero),info,sigil);
  return row;
}
function vitals(hero:HeroCardView):HTMLElement{
  const host=make("section","hero-card-vitals");
  const max=hero.maxHealth??0,health=hero.health??0;
  if(hero.maxHealth!==null&&hero.health!==null){
    const row=make("div","hero-card-vital-heading");
    row.append(pict("heart","Health"),make("span","", "HP"),
      make("strong","hero-card-vital-value",
        Math.max(0,Math.round(health))+" / "+max));
    const meter=make("span","hero-card-vital-track");
    meter.setAttribute("role","meter");meter.setAttribute("aria-label","Health");
    meter.setAttribute("aria-valuemin","0");
    meter.setAttribute("aria-valuemax",String(max));
    meter.setAttribute("aria-valuenow",String(Math.max(0,Math.round(health))));
    const fill=make("span","hero-card-vital-fill");
    const rate=max?Math.max(0,Math.min(100,health/max*100)):0;
    fill.style.width=rate+"%";meter.dataset.risk=rate<=30?"critical":
      rate<=60?"wounded":"healthy";
    meter.append(fill);host.append(row,meter);
  }
  const row=make("div","hero-card-economy");
  if(hero.xp!==null){
    const xp=metric("spark","Experience",String(hero.xp)+" XP");
    xp.classList.add("hero-card-xp");
    const progress=heroXpProgress(hero.xp);
    xp.title+=" · "+progress+" / 100 towards next level";
    row.append(xp);
  }
  if(hero.gold!==null){
    const gold=make("span","hero-card-metric");
    gold.title="Gold: "+hero.gold;
    gold.append(goldIcon("hero-card-gold-icon"),
      make("span","hero-card-metric-value",String(hero.gold)));
    row.append(gold);
  }
  if(hero.inventory)row.append(metric("heart",
    "Healing herbs",String(hero.inventory.healing)));
  host.append(row);return host;
}
function equipment(hero:HeroCardView,compact=false):HTMLElement{
  const zone=make("section","hero-card-equipment");
  if(!compact)zone.append(label("EQUIPMENT"));
  for(const [key,icon,empty] of [
    ["weapon","iron-sword","Unarmed"],["armor","leather-vest","No armor"],
  ] as const){
    const value=hero.equipment[key];
    const slot=make("div","hero-card-slot");
    slot.dataset.empty=String(!value);
    slot.title=value??empty;
    slot.setAttribute("aria-label",(key==="weapon"?"Weapon: ":"Armor: ")+(value??empty));
    slot.append(item(icon,"",value??empty));
    if(!compact)slot.append(make("small","hero-card-slot-label",
      value??empty));
    zone.append(slot);
  }
  return zone;
}
function stats(hero:HeroCardView):HTMLElement{
  const zone=make("section","hero-card-stats");
  zone.append(label("ATTRIBUTES"));
  if(hero.stats){
    for(const [key,icon,title] of [
      ["strength","swords","STR"],["agility","arrow-right","AGI"],
      ["intellect","spark","INT"],
    ] as const)zone.append(metric(icon,title,String(hero.stats[key])));
  }else zone.append(make("small","hero-card-unknown",
    "Historical attributes not recorded"));
  return zone;
}
function situation(hero:HeroCardView):HTMLElement{
  const zone=make("section","hero-card-situation");
  zone.append(label("CURRENT ACTIVITY"));
  const chips=make("div","hero-card-chips");
  const entries:[InterfaceIcon,string][]=[];
  if(hero.activity)entries.push(["map",hero.activity]);
  if(hero.goal)entries.push(["spark",hero.goal]);
  if(hero.action)entries.push(["arrow-right",hero.action]);
  if(hero.party.length>1)entries.push(["users",
    "Party · "+hero.party.length]);
  if(hero.floor!==null)entries.push(["map","Floor "+hero.floor]);
  if(!entries.length)entries.push(["info",
    hero.source==="recorded"?"Historical snapshot":"No active plan"]);
  for(const [icon,title] of entries){
    const chip=make("span","hero-card-chip");
    chip.append(uiIcon(icon),make("span","",title));chip.title=title;
    chips.append(chip);
  }
  zone.append(chips);return zone;
}
function inventory(hero:HeroCardView):HTMLElement{
  const zone=make("section","hero-card-inventory");
  zone.append(label("CARRIED GOODS"));
  if(!hero.inventory){
    zone.append(make("small","hero-card-unknown",
      "Items were not saved in this recording"));return zone;
  }
  const list=make("div","hero-card-item-list");
  const inv=hero.inventory;
  if(inv.bread)list.append(item("bread","×"+inv.bread,"Waybread ×"+inv.bread));
  if(inv.healing)list.append(item("healing-herb","×"+inv.healing,
    "Healing Herbs ×"+inv.healing));
  const finds=Object.entries(inv.finds??{}).filter(([,n])=>!!n&&n>0);
  for(const [id,number] of finds){
    const n=number??0;
    const label=ITEMS.find(x=>x.id===id)?.name??id;
    list.append(item(id,"×"+n,label+" ×"+n));
  }
  if(inv.loot)list.append(item("iron-ore","×"+inv.loot,
    "Unspecified legacy loot tokens ×"+inv.loot));
  if(!list.childElementCount)list.append(make("small","hero-card-unknown",
    "No carried goods"));
  zone.append(list);return zone;
}
function combat(hero:HeroCardView):HTMLElement{
  const zone=make("div","hero-card-combat-info");
  const c=hero.combat;
  if(!c)return zone;
  zone.append(metric("swords","Damage",String(c.damage)),
    metric("shield","Armor",String(c.armor)));
  if(hero.role==="healer"||c.heals>0)
    zone.append(metric("heart","Healing resources",String(c.heals)));
  if(c.stamina!==null)
    zone.append(metric("spark","Stamina",String(Math.round(c.stamina))));
  return zone;
}
function actions(hero:HeroCardView):HTMLElement{
  const zone=make("section","hero-card-events");
  zone.append(label("LATEST ECHOES"));
  if(!hero.recent.length)zone.append(make("small","hero-card-unknown",
    hero.source==="recorded"?"Historical events not present in tape":
      "No recent signals"));
  else for(const signal of hero.recent){
    const entry=make("p","hero-card-echo");
    entry.append(uiIcon("spark"),make("span","",signal));
    zone.append(entry);
  }
  return zone;
}
/** The SAME sprite, slots and semantic icon language in all three layouts.
 * Combat mode is NOT another floating HP plate: keep the existing 3D health
 * bars over fighters. Here status, phase, gear and tactical stats win space. */
export function renderHeroCard(
  hero:HeroCardView,variant:HeroCardVariant,
):HTMLElement {
  const root=make("article","hero-card hero-card--"+variant);
  root.dataset.heroId=hero.id;root.dataset.source=hero.source;
  root.dataset.role=hero.role;
  root.setAttribute("aria-label",hero.name+" hero card");
  root.append(identity(hero));
  if(variant==="combat"){
    const phase=make("div","hero-card-combat-phase");
    const text=hero.combat?.phase??hero.activity??"Awaiting pose";
    phase.dataset.phase=text;
    phase.append(pict(text==="parry"?"shield":text==="heal"?"heart":
      text==="dead"?"skull":"swords",text),
      make("strong","hero-card-phase-value",text.toUpperCase()));
    root.append(phase,combat(hero),equipment(hero,true));
    return root;
  }
  root.append(vitals(hero));
  if(variant==="mini"){
    root.append(equipment(hero,true));
    return root;
  }
  root.append(equipment(hero),stats(hero),situation(hero),inventory(hero));
  if(hero.traits){
    const traits=make("section","hero-card-traits");
    traits.append(label("TRAITS"));
    for(const trait of [hero.traits.positive,hero.traits.neutral,
      hero.traits.negative]){
      const chip=make("span","hero-card-chip",trait);
      traits.append(chip);
    }
    root.append(traits);
  }
  root.append(actions(hero));
  return root;
}
