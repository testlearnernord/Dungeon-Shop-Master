/**
 * Conservative source reachability audit. This is evidence for human review,
 * NOT a dead-code deletion tool: type imports are counted as dependencies,
 * and computed imports/reflection are deliberately flagged as unknown.
 * Usage: node tools/maintenance/module_graph.mjs [--json]
 */
import {readFileSync, readdirSync, existsSync} from "node:fs";
import {dirname, extname, join, relative, resolve, sep} from "node:path";
import {pathToFileURL} from "node:url";
import ts from "typescript";

const sourceExtensions=new Set([".ts",".tsx"]);
const recognizedImports=new Set(["",".ts",".tsx",".js",".jsx",".mjs",".mts"]);
function walk(directory){
  if(!existsSync(directory))return [];
  return readdirSync(directory,{withFileTypes:true})
    .flatMap(entry=>entry.isDirectory()?walk(join(directory,entry.name)):
      entry.isFile()&&sourceExtensions.has(extname(entry.name))&&
      !entry.name.endsWith(".d.ts")?[join(directory,entry.name)]:[])
    .sort();
}
function moduleReferences(file){
  const input=readFileSync(file,"utf8");
  const ast=ts.createSourceFile(file,input,ts.ScriptTarget.Latest,true,
    file.endsWith(".tsx")?ts.ScriptKind.TSX:ts.ScriptKind.TS);
  const references=[],computed=[];
  const capture=(value,kind,node)=>{
    if(value&&ts.isStringLiteralLike(value))references.push({specifier:value.text,kind});
    else{
      const pos=ast.getLineAndCharacterOfPosition(node.getStart(ast));
      computed.push({line:pos.line+1,kind});
    }
  };
  const visit=node=>{
    if(ts.isImportDeclaration(node)||ts.isExportDeclaration(node)){
      if(node.moduleSpecifier)capture(node.moduleSpecifier,"static",node);
    }else if(ts.isCallExpression(node)&&node.expression.kind===ts.SyntaxKind.ImportKeyword){
      capture(node.arguments[0],"dynamic",node);
    }else if(ts.isImportTypeNode(node)){
      const argument=node.argument;
      if(ts.isLiteralTypeNode(argument))capture(argument.literal,"type",node);
      else capture(null,"type",node);
    }else if(ts.isImportEqualsDeclaration(node)&&ts.isExternalModuleReference(node.moduleReference)){
      capture(node.moduleReference.expression,"static",node);
    }
    ts.forEachChild(node,visit);
  };
  visit(ast);
  return {references,computed};
}
function key(root,file){return relative(root,file).split(sep).join("/");}
function entrypoints(root,sourceSet){
  const index=readFileSync(join(root,"index.html"),"utf8");
  const out=[];
  const pattern=/<script\b[^>]*\bsrc\s*=\s*(["'])([^"']+)\1[^>]*>/gi;
  for(const match of index.matchAll(pattern)){
    const url=match[2].replace(/^[\/]+/,"").split(/[?#]/,1)[0];
    const file=resolve(root,url);
    if(sourceSet.has(file))out.push(file);
  }
  if(!out.length)throw Error("No TypeScript entrypoint script from index.html exists in src/");
  return [...new Set(out)].sort();
}
function targetFor(from,specifier,allSet){
  if(!specifier.startsWith("."))return null;
  const base=resolve(dirname(from),specifier);
  const ext=extname(specifier);
  if(!recognizedImports.has(ext))return null;
  const candidates=ext===".js"||ext===".jsx"||ext===".mjs"||ext===".mts"
    ?[base.slice(0,-ext.length)+".ts",base.slice(0,-ext.length)+".tsx"]
    :ext?[base]:[base+".ts",base+".tsx",join(base,"index.ts"),join(base,"index.tsx")];
  return candidates.find(path=>allSet.has(path))??null;
}
function reached(roots,edges){
  const visited=new Set(),pending=[...roots];
  while(pending.length){
    const file=pending.pop();
    if(visited.has(file))continue;
    visited.add(file);
    for(const dependency of edges.get(file)??[])if(!visited.has(dependency))pending.push(dependency);
  }
  return visited;
}
/** Input root must be a checked-out repo. Results contain sorted repo-relative paths. */
export function auditModuleGraph(root){
  const absRoot=resolve(root);
  const source=walk(join(absRoot,"src"));
  const tests=walk(join(absRoot,"tests"));
  const sourceSet=new Set(source),allSet=new Set([...source,...tests]);
  const edges=new Map(),unknownImports=[],unresolvedSourceImports=[];
  for(const file of allSet){
    const {references,computed}=moduleReferences(file);
    edges.set(file,new Set());
    for(const issue of computed)unknownImports.push({file:key(absRoot,file),...issue});
    for(const {specifier,kind} of references){
      if(!specifier.startsWith("."))continue;
      const target=targetFor(file,specifier,allSet);
      if(target)edges.get(file).add(target);
      else if(recognizedImports.has(extname(specifier))&&sourceSet.has(file))
        unresolvedSourceImports.push({file:key(absRoot,file),specifier,kind});
    }
  }
  const entries=entrypoints(absRoot,sourceSet);
  const fromEntry=reached(entries,edges),fromTests=reached(tests,edges);
  const entryReachable=source.filter(p=>fromEntry.has(p)).map(p=>key(absRoot,p));
  const testOnly=source.filter(p=>!fromEntry.has(p)&&fromTests.has(p)).map(p=>key(absRoot,p));
  const unreferenced=source.filter(p=>!fromEntry.has(p)&&!fromTests.has(p)).map(p=>key(absRoot,p));
  return {
    entrypoints:entries.map(p=>key(absRoot,p)),
    sourceModules:source.length,unitAndBrowserTestModules:tests.length,
    entryReachableCount:entryReachable.length,
    testOnlyModules:testOnly,
    unreferencedModules:unreferenced,
    unknownImports:unknownImports.sort((a,b)=>a.file.localeCompare(b.file)||a.line-b.line),
    unresolvedSourceImports:unresolvedSourceImports.sort((a,b)=>a.file.localeCompare(b.file)||a.specifier.localeCompare(b.specifier)),
    caveat:"Static/type/dynamic-literal graph only. Indirect references, CSS/GLB and computed dynamic imports require manual inspection; do not delete files automatically.",
  };
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const result=auditModuleGraph(process.cwd());
  if(process.argv.includes("--json"))console.log(JSON.stringify(result,null,2));
  else{
    console.log("Source modules: "+result.sourceModules+", entry-reachable: "+result.entryReachableCount);
    console.log("Test-only candidates ("+result.testOnlyModules.length+"): "+(result.testOnlyModules.join(", ")||"none"));
    console.log("Unreferenced candidates ("+result.unreferencedModules.length+"): "+(result.unreferencedModules.join(", ")||"none"));
    console.log("Computed imports to inspect: "+result.unknownImports.length);
    console.log("Unresolved relative source imports to inspect: "+result.unresolvedSourceImports.length);
    console.log(result.caveat);
  }
}
