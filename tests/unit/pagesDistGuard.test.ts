import assert from "node:assert/strict";
import {test} from "node:test";
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {resolve,dirname} from "node:path";
import {verifyPagesDist} from "../../tools/maintenance/verify_pages_dist.mjs";

const BASE="/Dungeon-Shop-Master/";
function fixture(){
  const root=mkdtempSync(resolve(tmpdir(),"dsm-pages-dist-"));
  const put=(name:string,bytes:string|Buffer)=>{
    const p=resolve(root,name);
    mkdirSync(dirname(p),{recursive:true});writeFileSync(p,bytes);
  };
  put("dist/index.html",
    '<script type="module" src="'+BASE+'assets/index-123.js"></script>'+
    '<link rel="stylesheet" href="'+BASE+'assets/index-123.css">');
  put("dist/assets/index-123.js","console.log('compiled')");
  put("dist/assets/index-123.css","body{color:inherit}");
  const audio=[
    "the-lean-season.mp3","beneath-the-surface.mp3","no-safe-passage.mp3",
    "desperate-measures.mp3",
    ...Array.from({length:21},(_,i)=>"sfx/ghoul/ghoul-"+i+".wav"),
    ...Array.from({length:11},(_,i)=>"sfx/cave-troll/troll-"+i+".mp3"),
  ];
  for(const name of audio){
    put("public/audio/"+name,"music/foley-"+name);
    put("dist/audio/"+name,"music/foley-"+name);
  }
  const glb=Buffer.alloc(20);
  glb.write("glTF",0,"ascii");glb.writeUInt32LE(2,4);
  glb.writeUInt32LE(glb.length,8);
  for(const name of ["ashen-tunnel-mauler-tripo.glb",
    "ashen-tunnel-mauler-tripo-combat.glb","dungeon-ghoul-tripo.glb"]){
    put("public/assets/models/"+name,glb);
    put("dist/assets/models/"+name,glb);
  }
  return {root,put};
}
test("Pages dist contains correctly based JS/CSS, 32 creature sounds and all required GLBs",()=>{
  const {root}=fixture();
  try{
    const status=verifyPagesDist(root);
    assert.equal(status.base,BASE);
    assert.equal(status.htmlAssets,2);
    assert.equal(status.audio.count,36);
    assert.equal(status.models.count,3);
    assert.equal(status.audio.bytes>0,true);
  }finally{rmSync(root,{recursive:true,force:true});}
});
test("broken Pages base and missing production files fail independently",()=>{
  const {root,put}=fixture();
  try{
    const html=readFileSync(resolve(root,"dist/index.html"),"utf8");
    put("dist/index.html",html.replaceAll(BASE,"/"));
    assert.throws(()=>verifyPagesDist(root),/base path/);
    put("dist/index.html",html);
    put("dist/assets/index-123.js","");
    // A zero-byte JS would not be a viable game asset; restore to test actual missing soundtrack instead.
    put("dist/assets/index-123.js","console.log('compiled')");
    put("dist/audio/no-safe-passage.mp3","truncated audio");
    assert.throws(()=>verifyPagesDist(root),/differs from source/);
  }finally{rmSync(root,{recursive:true,force:true});}
});
test("generated GLB corruption is detected despite a matching filename",()=>{
  const {root,put}=fixture();
  try{
    put("dist/assets/models/dungeon-ghoul-tripo.glb",Buffer.alloc(20));
    assert.throws(()=>verifyPagesDist(root),/differs from source bytes|Invalid or truncated GLB/);
  }finally{rmSync(root,{recursive:true,force:true});}
});
