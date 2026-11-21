/**
 * Validate the exact files that Vite will deploy to GitHub Pages.
 * Run only AFTER 'npm run build' produced dist/. Read-only, no network.
 */
import {existsSync,readFileSync,readdirSync,statSync} from "node:fs";
import {resolve,join,relative,sep} from "node:path";
import {pathToFileURL} from "node:url";

const BASE="/Dungeon-Shop-Master/";
const REQUIRED_MUSIC=[
  "the-lean-season.mp3","beneath-the-surface.mp3",
  "no-safe-passage.mp3","desperate-measures.mp3",
];
const REQUIRED_GENERATED_MODELS=[
  "ashen-tunnel-mauler-tripo-combat.glb","dungeon-ghoul-tripo.glb",
];

function requireFile(path,what){
  if(!existsSync(path)||!statSync(path).isFile())
    throw new Error(what+" missing: "+path);
  return path;
}
function listFiles(directory){
  if(!existsSync(directory))return [];
  return readdirSync(directory,{withFileTypes:true}).flatMap(entry=>
    entry.isDirectory()?listFiles(join(directory,entry.name)):
      entry.isFile()?[join(directory,entry.name)]:[]).sort();
}
function verifyGlb(path){
  const header=readFileSync(path);
  if(header.length<20||header.toString("ascii",0,4)!=="glTF"||
     header.readUInt32LE(4)!==2||header.readUInt32LE(8)!==header.length)
    throw new Error("Invalid or truncated GLB in published build: "+path);
}
function checkMirrored(root,subdir){
  const original=resolve(root,"public",subdir);
  const deployed=resolve(root,"dist",subdir);
  const files=listFiles(original);
  if(!files.length)throw new Error("No source assets in "+subdir);
  let bytes=0;
  for(const path of files){
    const rel=relative(original,path);
    const copy=requireFile(join(deployed,rel),"Published "+subdir+" asset");
    const before=readFileSync(path),after=readFileSync(copy);
    if(!before.equals(after))
      throw new Error("Published asset differs from source bytes: "+subdir+"/"+rel);
    if(rel.endsWith(".glb"))verifyGlb(copy);
    bytes+=after.length;
  }
  return {count:files.length,bytes};
}
/** Purely checks an already built Vite deployment tree; never edits anything. */
export function verifyPagesDist(root){
  const project=resolve(root),dist=resolve(project,"dist");
  const html=readFileSync(requireFile(join(dist,"index.html"),"Vite index"),"utf8");
  if(html.includes("/src/main.ts"))
    throw new Error("Vite left a development entrypoint in production HTML");
  const assets=[...html.matchAll(/(?:src|href)=["']([^"']+\.(?:js|css)(?:\?[^"']*)?)["']/g)]
    .map(match=>match[1]);
  if(!assets.some(url=>url.split("?")[0].endsWith(".js"))||
     !assets.some(url=>url.split("?")[0].endsWith(".css")))
    throw new Error("Production HTML lacks emitted JS or CSS references");
  for(const url of assets){
    if(!url.startsWith(BASE))throw new Error("Wrong GitHub Pages base path: "+url);
    const local=url.slice(BASE.length).split("?")[0];
    if(local.includes("..")||local.startsWith("/")||!local)
      throw new Error("Unsafe production asset URL: "+url);
    requireFile(resolve(dist,local),"Vite HTML asset");
  }
  const audioDir=resolve(project,"public/audio");
  for(const music of REQUIRED_MUSIC)
    requireFile(join(audioDir,music),"Canonical soundtrack");
  const ghoul=listFiles(join(audioDir,"sfx/ghoul")).filter(x=>x.endsWith(".wav"));
  const troll=listFiles(join(audioDir,"sfx/cave-troll")).filter(x=>x.endsWith(".mp3"));
  if(ghoul.length!==21||troll.length!==11)
    throw new Error("Creature SFX catalog changed: "+
      ghoul.length+" Ghoul WAV, "+troll.length+" Troll MP3; review asset inventory");
  const modelDir=resolve(project,"public/assets/models");
  for(const name of ["ashen-tunnel-mauler-tripo.glb",...REQUIRED_GENERATED_MODELS])
    requireFile(join(modelDir,name),"Required curated/generated model");
  const audio=checkMirrored(project,"audio");
  const models=checkMirrored(project,"assets/models");
  return {base:BASE,htmlAssets:assets.length,audio,models};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const result=verifyPagesDist(process.cwd());
  console.log("Verified deployed GitHub Pages dist/ assets: "+JSON.stringify(result));
}
