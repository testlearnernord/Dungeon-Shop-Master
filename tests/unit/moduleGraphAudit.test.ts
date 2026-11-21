import assert from "node:assert/strict";
import test from "node:test";
import {mkdtempSync,writeFileSync,mkdirSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {resolve,dirname} from "node:path";
import {auditModuleGraph} from "../../tools/maintenance/module_graph.mjs";

function fixture(files:Record<string,string>){
  const root=mkdtempSync(resolve(tmpdir(),"dsm-module-graph-"));
  for(const [name,contents] of Object.entries(files)){
    const path=resolve(root,name);mkdirSync(dirname(path),{recursive:true});
    writeFileSync(path,contents);
  }
  return root;
}
test("real entry graph includes static, type and literal lazy imports but not test-only modules",()=>{
  const root=fixture({
    "index.html":'<script type="module" src="/src/main.ts"></script>',
    "src/main.ts":'import "./runtime"; import("./lazy.ts");',
    "src/runtime.ts":'import type {T} from "./types.ts"; export const x=1;',
    "src/types.ts":"export type T={id:string};",
    "src/lazy.ts":"export const lazy=1;",
    "src/test-only.ts":"export const test=1;",
    "src/unreferenced.ts":"export const missing=1;",
    "tests/unit/isolated.test.ts":'import "../../src/test-only.ts";',
  });
  try{
    const graph=auditModuleGraph(root);
    assert.deepEqual(graph.entrypoints,["src/main.ts"]);
    assert.equal(graph.entryReachableCount,4);
    assert.deepEqual(graph.testOnlyModules,["src/test-only.ts"]);
    assert.deepEqual(graph.unreferencedModules,["src/unreferenced.ts"]);
    assert.deepEqual(graph.unknownImports,[]);
  }finally{rmSync(root,{recursive:true,force:true});}
});
test("computed imports and missing source imports remain explicit review flags",()=>{
  const root=fixture({
    "index.html":'<script type="module" src="/src/main.ts"></script>',
    "src/main.ts":'const path="./unknown"; import(path); import "./missing"; import "./theme.css";',
  });
  try{
    const graph=auditModuleGraph(root);
    assert.deepEqual(graph.unknownImports,[{file:"src/main.ts",line:1,kind:"dynamic"}]);
    assert.deepEqual(graph.unresolvedSourceImports,[{
      file:"src/main.ts",specifier:"./missing",kind:"static",
    }]);
    assert.equal(graph.entryReachableCount,1);
  }finally{rmSync(root,{recursive:true,force:true});}
});

test("ordinary exported functions are not mistaken for re-export imports",()=>{
  const root=fixture({
    "index.html":'<script type="module" src="/src/main.ts"></script>',
    "src/main.ts":'export function valid(from:string){return from;} export {z} from "./other.ts";',
    "src/other.ts":"export const z=1;",
  });
  try{
    const graph=auditModuleGraph(root);
    assert.equal(graph.entryReachableCount,2);
    assert.deepEqual(graph.unknownImports,[]);
    assert.deepEqual(graph.unreferencedModules,[]);
  }finally{rmSync(root,{recursive:true,force:true});}
});
