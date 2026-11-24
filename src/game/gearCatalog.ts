import type {AdventurerRole} from "./adventurers.ts";

/** A single source for true class restrictions, upgrade tiers and 60-Hz combat
 * benefits. Item IDs are stable economic keys; internal equipment names retain
 * the two original T1 encodings ("Iron Sword", "Leather Vest"), while all
 * player-facing labels correctly say T1 Sword & Shield / T1 Leather Vest.
 * An obsolete universal sword is NEVER a class-neutral weapon. */
export const GEAR_BY_ITEM={
  "iron-sword":{name:"Iron Sword",label:"T1 Sword & Shield",slot:"weapon",role:"tank",tier:1,damage:5,armor:0,reach:1.75,magicHeals:0,trapProtection:0},
  "spear":{name:"Spear",label:"T1 Spear",slot:"weapon",role:"DPS",tier:1,damage:5,armor:0,reach:2.1,magicHeals:0,trapProtection:0},
  "staff":{name:"Staff",label:"T1 Staff",slot:"weapon",role:"healer",tier:1,damage:2,armor:0,reach:2.5,magicHeals:1,trapProtection:0},
  "forged-sword-shield":{name:"Forged Sword & Shield",label:"T2 Sword & Shield",slot:"weapon",role:"tank",tier:2,damage:7,armor:4,reach:1.75,magicHeals:0,trapProtection:0},
  "forged-spear":{name:"Forged Spear",label:"T2 Spear",slot:"weapon",role:"DPS",tier:2,damage:9,armor:0,reach:2.5,magicHeals:0,trapProtection:0},
  "forged-staff":{name:"Forged Staff",label:"T2 Staff",slot:"weapon",role:"healer",tier:2,damage:5,armor:0,reach:2.5,magicHeals:3,trapProtection:0},
  "leather-vest":{name:"Leather Vest",label:"T1 Leather Vest",slot:"armor",role:"all",tier:1,damage:0,armor:4,reach:0,magicHeals:0,trapProtection:3},
  "ghoul-leather-vest":{name:"Ghoul Leather Vest",label:"T2 Ghoul Leather Vest",slot:"armor",role:"all",tier:2,damage:0,armor:8,reach:0,magicHeals:0,trapProtection:6},
} as const;
export type GearItemId=keyof typeof GEAR_BY_ITEM;
export type GearName=typeof GEAR_BY_ITEM[GearItemId]["name"];
export type GearSlot="weapon"|"armor";
export const GEAR_NAMES=Object.values(GEAR_BY_ITEM).map(gear=>gear.name);
export const isGearItemId=(id:string):id is GearItemId=>
  Object.hasOwn(GEAR_BY_ITEM,id);
export const gearFromName=(name:string|null|undefined)=>
  name?Object.values(GEAR_BY_ITEM).find(item=>item.name===name)??null:null;
export const gearForItem=(id:string)=>
  isGearItemId(id)?GEAR_BY_ITEM[id]:null;
export const displayEquipment=(name:string|null):string|null=>
  name?(gearFromName(name)?.label??name):null;

/** No class can equip another class's weapon. Both v1 starter entries are
 * treated as T1, and a bought lower tier may never replace real T2 gear. */
export function needsGearUpgrade(
  role:AdventurerRole,equipment:Readonly<{weapon:string|null;armor:string|null}>,
  itemId:string,
):boolean{
  const item=gearForItem(itemId);
  if(!item||(item.role!=="all"&&item.role!==role))return false;
  const current=gearFromName(equipment[item.slot]);
  return !current||current.slot===item.slot&&item.tier>current.tier;
}

/** Data is also consumed by dungeon combat, traps and rendered equipment. */
export function equipmentEffects(
  role:AdventurerRole,equipment:Readonly<{weapon:string|null;armor:string|null}>,
){
  const weapon=gearFromName(equipment.weapon);
  const armor=gearFromName(equipment.armor);
  const validWeapon=weapon?.slot==="weapon"&&weapon.role===role?weapon:null;
  const validArmor=armor?.slot==="armor"?armor:null;
  return {
    damage:validWeapon?.damage??0,
    armor:(validWeapon?.armor??0)+(validArmor?.armor??0),
    reach:validWeapon?.reach??1.75,
    magicHeals:role==="healer"?(validWeapon?.magicHeals??0):0,
    trapProtection:validArmor?.trapProtection??0,
    weapon:validWeapon?.name??null,
    vest:validArmor?.name??null,
  };
}
