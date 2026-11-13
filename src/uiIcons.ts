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
];
export function setupInterfaceIcons(root:ParentNode=document):void{
  for(const [selector,icon,compact] of controls){
    const button=root.querySelector<HTMLButtonElement>(selector);
    if(button)setIconButton(button,icon,compact);
  }
}
