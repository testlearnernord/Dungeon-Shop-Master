/** Shared semantic UI symbol set. Product artwork continues to use the
 * same existing sprite atlas in the hotbar, wish bubbles and trade UI. */
export type InterfaceIcon="calendar"|"coin"|"shop"|"build"|"grid"|"users"|"shield"|"swords"|"map"|"book"|"bag"|"speaker"|"mute"|"close"|"rotate"|"check"|"warning"|"heart"|"food"|"play"|"pause"|"chevron"|"info"|"moon"|"pickaxe"|"receipt"|"search"|"settings"|"arrow-left"|"arrow-right"|"spark";
const NS="http://www.w3.org/2000/svg";
function symbol(src:string,name:string,className:string,viewBox:string):SVGSVGElement{
  const svg=document.createElementNS(NS,"svg");
  svg.classList.add(className);
  svg.setAttribute("viewBox",viewBox);
  svg.setAttribute("aria-hidden","true");
  svg.setAttribute("focusable","false");
  const use=document.createElementNS(NS,"use");
  use.setAttribute("href",import.meta.env.BASE_URL+"assets/"+src+"#"+name);
  svg.append(use);
  return svg;
}
export const uiIcon=(name:InterfaceIcon,className="ui-icon")=>
  symbol("ui-interface-icons.svg",name,className,"0 0 24 24");
export const itemIcon=(name:string,className="ui-item-icon")=>
  symbol("ui-item-icons.svg",name,className,"0 0 48 48");
/** The same gold artwork is used by every HTML and canvas UI. */
export const goldIconUrl=()=>import.meta.env.BASE_URL+"assets/ui-gold.svg";
export function goldIcon(className="ui-gold-icon"):HTMLImageElement{
  const image=document.createElement("img");
  image.src=goldIconUrl();
  image.className=className;
  image.alt="";
  image.setAttribute("aria-hidden","true");
  image.width=18;image.height=18;
  return image;
}
export function setIconButton(button:HTMLButtonElement,icon:InterfaceIcon,compact=false):void{
  if(button.dataset.uiIcon)return;
  const label=document.createElement("span");
  label.className="ui-action-label";
  label.textContent=button.textContent??"";
  button.replaceChildren(uiIcon(icon),label);
  button.dataset.uiIcon=icon;
  button.classList.add("ui-icon-button");
  if(compact)button.classList.add("ui-compact-action");
  if(compact)button.title=label.textContent??"";
}
export function setIconButtonLabel(button:HTMLButtonElement,text:string):void{
  const label=button.querySelector<HTMLElement>(".ui-action-label");
  if(label){label.textContent=text;button.title=text;}
  else button.textContent=text;
}
const controls:readonly [string,InterfaceIcon,boolean][]=[
  ["#toggle-shop-status","book",true],
  ["#open-wholesale","bag",true],
  ["#open-blueprint","build",true],
  ["#open-placement","grid",true],
  ["#toggle-adventurer-details","chevron",true],
  ["#open-roster","users",true],
  ["#open-arena","swords",true],
  ["#open-dungeon","map",true],
  ["#close-roster","close",false],
  ["#close-wholesale","close",false],
  ["#placement-cancel","close",false],
  ["#placement-rotate","rotate",false],
  ["#placement-save","check",false],
  ["#export-save","book",false],
  ["#import-save","arrow-left",false],
  ["#new-game","spark",false],
  ["#debt-book-close","close",false],
  ["#beggar-refuse","close",false],
  ["#beggar-close","chevron",false],
  ["#beggar-credit","receipt",false],
  ["#ledger-next","arrow-right",false],
  ["#ledger-previous","arrow-left",false],
  ["#ledger-begin","calendar",false],
  ["#ledger-skip","spark",false],
  ["#cashier-overlay .cashier-cancel","close",false],
  ["#blueprint-panel > button","close",false],
];
export function setupInterfaceIcons(root:ParentNode=document):void{
  for(const [selector,icon,compact] of controls){
    const button=root.querySelector<HTMLButtonElement>(selector);
    if(button)setIconButton(button,icon,compact);
  }
}
/** Game dialogs are mounted after the async campaign load. Decorate just
 * the new top-level overlays, not every new live receipt/roster entry. */
export function watchInterfaceDialogs():void{
  const observer=new MutationObserver(records=>{
    for(const record of records)for(const added of record.addedNodes){
      if(!(added instanceof HTMLElement))continue;
      if(added.matches('dialog,#cashier-overlay,#blueprint-panel'))
        setupInterfaceIcons(added);
    }
  });
  observer.observe(document.body,{childList:true});
}

