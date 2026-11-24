import {mkdirSync,writeFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {resolve} from "node:path";

/** Rebuild committed original gear GLBs without external dependencies. */
function generateGearModels(){
  // Original shelf-scale gear. glTF Y-up; +X points toward the customer.
  const results=new Map();
  const C={iron:[112,120,125],edge:[183,191,187],dark:[63,73,77],steel:[153,167,172],
    brass:[174,125,61],gold:[213,163,86],wood:[87,57,37],oak:[139,92,53],
    wrap:[70,48,34],hide:[110,117,78],leather:[81,93,67],stitch:[180,151,97],
    amethyst:[108,120,175],crystal:[150,174,215]};
  function make(id,author){
    const pos=[],nor=[],col=[];
    const sub=(a,b)=>a.map((v,i)=>v-b[i]);
    const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
    const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
    const unit=a=>{const n=Math.hypot(...a);if(n<1e-10)throw Error("Degenerate "+id);return a.map(v=>v/n)};
    function poly(vertices,faces,color){
      const center=[0,1,2].map(i=>vertices.reduce((s,v)=>s+v[i],0)/vertices.length);
      for(const indices of faces){
        const f=indices.map(i=>vertices[i]);
        let n=unit(cross(sub(f[1],f[0]),sub(f[2],f[0])));
        if(dot(n,sub(f[0],center))<0){f.reverse();n=n.map(v=>-v)}
        for(let i=1;i<f.length-1;i++)for(const v of [f[0],f[i],f[i+1]]){
          pos.push(...v);nor.push(...n);col.push(...color,255);
        }
      }
    }
    function box(x,y,z,w,h,d,c){
      const v=[[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]]
        .map(([a,b,q])=>[x+a*w/2,y+b*h/2,z+q*d/2]);
      poly(v,[[0,1,2,3],[4,5,6,7],[0,1,5,4],[3,2,6,7],[0,3,7,4],[1,2,6,5]],c);
    }
    function tube(a,b,r0,r1,c,n=8){
      const d=unit(sub(b,a)),t=unit(cross(d,Math.abs(d[1])<.9?[0,1,0]:[1,0,0])),q=cross(d,t);
      const v=[];
      for(const [p,r] of [[a,r0],[b,r1]])for(let i=0;i<n;i++){
        const f=2*Math.PI*i/n;v.push(p.map((x,k)=>x+r*(t[k]*Math.cos(f)+q[k]*Math.sin(f))));
      }
      const faces=[Array.from({length:n},(_,i)=>i),Array.from({length:n},(_,i)=>i+n)];
      for(let i=0;i<n;i++){const j=(i+1)%n;faces.push([i,j,j+n,i+n])}
      poly(v,faces,c);
    }
    function prism(outline,y0,y1,c,scale=1){
      const v=[y0,y1].flatMap(y=>outline.map(([x,z])=>[x*scale,y,z*scale]));
      const n=outline.length,faces=[Array.from({length:n},(_,i)=>i),Array.from({length:n},(_,i)=>i+n)];
      for(let i=0;i<n;i++){const j=(i+1)%n;faces.push([i,j,j+n,i+n])}poly(v,faces,c);
    }
    function blade(x0,x1,y,z,w,h,c){
      const mid=x0+(x1-x0)*.70;
      const ring=(x,w,h)=>[[x,y+h,z],[x,y,z+w],[x,y-h,z],[x,y,z-w]];
      poly([...ring(x0,w,h),...ring(mid,w*.78,h*.75),[x1,y,z]],
        [[0,1,2,3],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7],
          [4,5,8],[5,6,8],[6,7,8],[7,4,8]],c);
      box(x0+(mid-x0)*.48,y+h*.96,z,(mid-x0)*.87,.003,.007,C.edge);
    }
    function sword(t2){
      // Bundled shield under a beveled sword: a single economic item.
      const outline=[[-.14,-.105],[.085,-.105],[.145,0],[.085,.105],[-.14,.105],[-.173,0]];
      prism(outline,0,.019,t2?C.steel:C.dark);prism(outline,.019,.036,t2?C.brass:C.iron,.95);
      prism(outline,.036,.049,t2?C.dark:C.oak,.81);
      for(const z of [-.063,0,.063])box(-.022,.050,z,.19,.004,.006,t2?C.steel:C.wood);
      tube([-.02,.049,0],[-.02,.071,0],.035,.022,t2?C.gold:C.edge,10);
      for(const [x,z] of [[-.12,-.068],[-.12,.068],[.071,-.071],[.071,.071],[.109,0]])
        tube([x,.038,z],[x,.054,z],.009,.006,t2?C.gold:C.edge,6);
      const y=.091,z=.012;
      tube([-.248,y,z],[-.137,y,z],.015,.015,C.wrap);
      for(let i=0;i<5;i++)tube([-.244+i*.021,y,z],[-.238+i*.021,y,z],.018,.018,t2?C.brass:C.wood);
      tube([-.267,y,z],[-.248,y,z],.019,.024,t2?C.gold:C.iron);
      box(-.12,y,z,.028,.035,t2?.146:.116,t2?C.brass:C.iron);
      tube([-.106,y,z],[-.080,y,z],.025,.025,t2?C.gold:C.dark);
      blade(-.083,.257,y,z,t2?.041:.032,.014,t2?C.steel:C.iron);
      if(t2){box(-.107,y+.025,z,.046,.012,.046,C.gold);tube([-.12,y+.023,z],[-.12,y+.037,z],.013,.006,C.dark,6)}
    }
    function spear(t2){
      const y=.037,z=0;
      tube([-.257,y,z],[.148,y,z],.013,.013,t2?C.wood:C.oak);
      tube([-.267,y,z],[-.232,y,z],.017,.017,t2?C.brass:C.iron);
      for(let i=0;i<5;i++)tube([-.115+i*.025,y,z],[-.109+i*.025,y,z],.016,.016,C.wrap);
      tube([.100,y,z],[.157,y,z],.021,.021,t2?C.brass:C.iron);
      blade(.133,.262,y,z,t2?.048:.035,.021,t2?C.steel:C.iron);
      if(t2){blade(.122,.187,y,-.025,.018,.009,C.edge);blade(.122,.187,y,.025,.018,.009,C.edge)}
    }
    function staff(t2){
      const y=.041,z=0;
      tube([-.255,y,z],[.145,y,z],.017,.022,t2?C.wood:C.oak);
      tube([-.266,y,z],[-.225,y,z],.023,.022,t2?C.brass:C.iron);
      for(let i=0;i<6;i++)tube([-.16+i*.023,y,z],[-.151+i*.023,y,z],.021,.021,C.wrap);
      tube([.10,y,z],[.154,y,z],.032,.040,t2?C.brass:C.dark);
      const x=.196,r=t2?.044:.033;
      poly([[x-.045,y,0],[x+.05,y,0],[x,y+r,0],[x,y,r],[x,y-r,0],[x,y,-r]],
        [[0,2,3],[0,3,4],[0,4,5],[0,5,2],[1,3,2],[1,4,3],[1,5,4],[1,2,5]],t2?C.crystal:C.amethyst);
      for(const [dy,dz] of [[.025,.025],[.025,-.025],[-.025,0]]){
        tube([.135,y,0],[.19,y+dy*1.45,dz*1.45],.009,.008,t2?C.gold:C.iron,6);
        tube([.19,y+dy*1.45,dz*1.45],[.232,y+dy,dz],.008,.005,t2?C.gold:C.iron,6);
      }
    }
    function vest(){
      box(0,.135,0,.068,.217,.194,C.leather);
      box(.004,.261,-.079,.074,.07,.068,C.hide);box(.004,.261,.079,.074,.07,.068,C.hide);
      for(const z of [-.073,.073]){
        box(.041,.174,z,.025,.157,.039,C.hide);box(.052,.243,z,.021,.037,.060,C.dark);
        for(const y of [.128,.175,.22])tube([.055,y,z],[.064,y,z],.006,.005,C.brass,6);
      }
      box(.047,.085,0,.023,.038,.224,C.wrap);box(.063,.087,0,.017,.040,.050,C.brass);
      box(.073,.087,0,.009,.019,.029,C.dark);
      for(const y of [.128,.161,.194,.227]){
        tube([.055,y,-.026],[.055,y+.021,.026],.005,.005,C.stitch,6);
        tube([.055,y,.026],[.055,y+.021,-.026],.005,.005,C.stitch,6);
      }
      for(const z of [-.075,0,.075])box(.039,.045,z,.025,.028,.062,C.hide);
    }
    author({sword,spear,staff,vest});
    const minY=Math.min(...pos.filter((_,i)=>i%3===1));
    for(let i=1;i<pos.length;i+=3)pos[i]-=minY;
    for(let i=0;i<pos.length;i++)pos[i]=Math.fround(pos[i]);
    const count=pos.length/3,align=n=>(n+3)&~3;
    if(count<24||count>=65536)throw Error("Invalid vertex count "+id);
    const o=[0,pos.length*4,pos.length*8,pos.length*8+col.length];
    const total=align(o[3]+count*2),binary=new Uint8Array(total),v=new DataView(binary.buffer);
    pos.forEach((n,i)=>v.setFloat32(o[0]+i*4,n,true));nor.forEach((n,i)=>v.setFloat32(o[1]+i*4,n,true));
    binary.set(col,o[2]);for(let i=0;i<count;i++)v.setUint16(o[3]+i*2,i,true);
    const min=[0,1,2].map(k=>Math.min(...pos.filter((_,i)=>i%3===k)));
    const max=[0,1,2].map(k=>Math.max(...pos.filter((_,i)=>i%3===k)));
    const gltf={asset:{version:"2.0",generator:"DSM authored equipment mesh generator"},scene:0,
      scenes:[{nodes:[0]}],nodes:[{name:id,mesh:0}],
      meshes:[{name:id,primitives:[{attributes:{POSITION:0,NORMAL:1,COLOR_0:2},indices:3,material:0}]}],
      materials:[{name:"vertex-painted",pbrMetallicRoughness:{baseColorFactor:[1,1,1,1],metallicFactor:0,roughnessFactor:.72}}],
      buffers:[{byteLength:total}],bufferViews:[
        {buffer:0,byteOffset:o[0],byteLength:pos.length*4,target:34962},
        {buffer:0,byteOffset:o[1],byteLength:nor.length*4,target:34962},
        {buffer:0,byteOffset:o[2],byteLength:col.length,target:34962},
        {buffer:0,byteOffset:o[3],byteLength:count*2,target:34963}],
      accessors:[{bufferView:0,componentType:5126,count,type:"VEC3",min,max},
        {bufferView:1,componentType:5126,count,type:"VEC3"},
        {bufferView:2,componentType:5121,normalized:true,count,type:"VEC4"},
        {bufferView:3,componentType:5123,count,type:"SCALAR",min:[0],max:[count-1]}]};
    const json=JSON.stringify(gltf),jsize=align(json.length);
    const bytes=new Uint8Array(28+jsize+total),h=new DataView(bytes.buffer);
    h.setUint32(0,0x46546c67,true);h.setUint32(4,2,true);h.setUint32(8,bytes.length,true);
    h.setUint32(12,jsize,true);h.setUint32(16,0x4e4f534a,true);bytes.fill(32,20,20+jsize);
    for(let i=0;i<json.length;i++)bytes[20+i]=json.charCodeAt(i);
    h.setUint32(20+jsize,total,true);h.setUint32(24+jsize,0x004e4942,true);
    bytes.set(binary,28+jsize);results.set(id,{bytes,count,min,max});
  }
  make("iron-sword",s=>s.sword(false));make("forged-sword-shield",s=>s.sword(true));
  make("spear",s=>s.spear(false));make("forged-spear",s=>s.spear(true));
  make("staff",s=>s.staff(false));make("forged-staff",s=>s.staff(true));
  make("ghoul-leather-vest",s=>s.vest());return results;
}

export {generateGearModels};
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
  const out=new URL("../../public/assets/models/",import.meta.url);
  mkdirSync(out,{recursive:true});
  for(const [id,model] of generateGearModels()){
    writeFileSync(new URL(id+".glb",out),model.bytes);
    console.log(id+": "+model.count+" vertices, "+model.bytes.length+" bytes");
  }
}
