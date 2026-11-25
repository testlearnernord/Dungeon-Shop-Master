import type {Point2} from "./combatGeometry.ts";
import type {GroupCombatState,GroupActor,CombatBounds,CombatEnvironment} from "./groupCombat.ts";

/** The whole surviving team commits to a physical arena exit. No actor
 * becomes invulnerable or disappears while a companion is still fighting. */
export const RETREAT_EXIT_RADIUS=2.4;
function livingHeroes(s:GroupCombatState):GroupActor[]{
  return s.actors.filter(a=>a.team==="heroes"&&a.hp>0);
}
/** Conservative last-resort decision: badly depleted team, no remaining
 * medicine/spells, and opponents still meaningfully healthy. No clock. */
export function shouldRetreat(s:GroupCombatState):boolean{
  const heroes=livingHeroes(s),monsters=s.actors.filter(a=>a.team==="monsters"&&a.hp>0);
  if(!heroes.length||!monsters.length||
    heroes.some(a=>a.healCharges>0||(a.magicHeals??0)>0))return false;
  const fraction=(actors:readonly GroupActor[])=>actors.reduce((n,a)=>n+a.hp,0)/
    actors.reduce((n,a)=>n+a.maxHp,0);
  const health=fraction(heroes),threat=fraction(monsters);
  return health<=.30&&threat>=.40&&health<threat*.65;
}
/** Candidate exit zones are derived from actual arena geometry. For lava
 * arenas, exits sit on safe rock rather than inside the molten ring. */
export function combatRetreatExits(bounds:CombatBounds,environment?:CombatEnvironment):Point2[]{
  const mx=(bounds.minX+bounds.maxX)/2,mz=(bounds.minZ+bounds.maxZ)/2;
  const dx=Math.max(0,(bounds.maxX-bounds.minX)/2-2),dz=Math.max(0,(bounds.maxZ-bounds.minZ)/2-2);
  return [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]].map(([x,z])=>{
    const p={x:mx+x*dx,z:mz+z*dz};
    const r=Math.hypot(p.x,p.z);
    const scale=environment==="cave-lava"&&r>13?13/r:1;
    return {x:p.x*scale||0,z:p.z*scale||0};
  });
}
export function chooseRetreatExit(s:GroupCombatState):Point2|null{
  const heroes=livingHeroes(s),monsters=s.actors.filter(a=>a.team==="monsters"&&a.hp>0);
  if(!heroes.length||!monsters.length)return null;
  const exits=combatRetreatExits(s.bounds,s.environment).filter(p=>
    !s.obstacles.some(o=>p.x>=o.minX-.5&&p.x<=o.maxX+.5&&p.z>=o.minZ-.5&&p.z<=o.maxZ+.5));
  const cost=(p:Point2)=>Math.max(...heroes.map(a=>Math.hypot(a.x-p.x,a.z-p.z)))-
    .6*Math.min(...monsters.map(a=>Math.hypot(a.x-p.x,a.z-p.z)));
  return exits.sort((a,b)=>cost(a)-cost(b)||a.x-b.x||a.z-b.z)[0]??null;
}
export function atRetreatExit(actor:Point2,exit:Point2):boolean{
  return Math.hypot(actor.x-exit.x,actor.z-exit.z)<=RETREAT_EXIT_RADIUS;
}
export function retreatComplete(s:GroupCombatState):boolean{
  const heroes=livingHeroes(s),exit=s.retreat;
  return !!exit&&heroes.length>0&&heroes.every(a=>a.phase==="move"&&atRetreatExit(a,exit));
}
/** Strict checkpoint validation, shared by normal and party-boss saves. */
export function validRetreatExit(value:unknown,bounds:CombatBounds,environment?:CombatEnvironment):boolean{
  if(!value||typeof value!=="object"||Array.isArray(value))return false;
  const p=value as Record<string,unknown>;
  return Object.keys(p).length===2&&combatRetreatExits(bounds,environment)
    .some(exit=>p.x===exit.x&&p.z===exit.z);
}
