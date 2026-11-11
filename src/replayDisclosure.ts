/** UI-only secrecy for recordings. Never enters GameState or affects simulation. */
const KEY="dungeon-shop:observed-expeditions";
const observed=new Set<string>();
try{
  for(const value of JSON.parse(sessionStorage.getItem(KEY)??"[]"))
    if(typeof value==="string")observed.add(value);
}catch{ /* session storage can be disabled by the browser */ }

export function hasObservedReplay(eventId:string):boolean {
  return observed.has(eventId);
}

export function observeReplay(eventId:string):void {
  if(!eventId||observed.has(eventId))return;
  observed.add(eventId);
  try{sessionStorage.setItem(KEY,JSON.stringify([...observed].slice(-200)));}
  catch{ /* secrecy still works for this page even without storage */ }
  window.dispatchEvent(new Event("expedition-observed"));
}

export function resetReplayDisclosure():void {
  observed.clear();
  try{sessionStorage.removeItem(KEY);}catch{ /* storage unavailable */ }
  window.dispatchEvent(new Event("expedition-observed"));
}
