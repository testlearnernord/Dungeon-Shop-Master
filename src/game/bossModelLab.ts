import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Engine } from "@babylonjs/core/Engines/engine";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Scene } from "@babylonjs/core/scene";
import { loadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import type { AssetContainer } from "@babylonjs/core/assetContainer";
import "@babylonjs/loaders/glTF/2.0";

/** Local GLB inspection in the actual Babylon canvas, not a second game or
 * a combat controller. Neither files nor animation state enter GameStore.
 * Import stays browser-local until an owner-approved model is checked in. */
export class BossModelLab {
  readonly scene: Scene;
  private readonly camera: ArcRotateCamera;
  private readonly input: HTMLInputElement;
  private readonly clips: HTMLSelectElement;
  private readonly info: HTMLElement;
  private container: AssetContainer | null = null;
  private generation = 0;
  private disposed = false;

  constructor(engine: Engine, canvas: HTMLCanvasElement, panel: HTMLElement) {
    this.scene = new Scene(engine);
    this.scene.clearColor = new Color4(.07,.085,.10,1);
    const light = new HemisphericLight("model-lab-light",new Vector3(0,1,0),this.scene);
    light.diffuse = new Color3(1,.91,.80);
    light.intensity = 1.35;
    this.camera = new ArcRotateCamera("model-lab-camera",
      Math.PI/2,1.25,15,new Vector3(0,3,0),this.scene);
    this.camera.lowerRadiusLimit = .5;
    this.camera.upperRadiusLimit = 200;
    this.camera.wheelPrecision = 38;
    this.scene.activeCamera = this.camera;
    this.camera.attachControl(canvas,true);
    this.input = panel.querySelector<HTMLInputElement>("#arena-model-file")!;
    this.clips = panel.querySelector<HTMLSelectElement>("#arena-model-clip")!;
    this.info = panel.querySelector<HTMLElement>("#arena-model-info")!;
    this.input.value = "";
    this.clips.replaceChildren(new Option("Import a GLB to inspect its clips",""));
    this.clips.disabled = true;
    this.info.textContent = "Load your exported Tripo .glb locally. The model is not uploaded or saved.";
    this.input.addEventListener("change",this.onFile);
    this.clips.addEventListener("change",this.onClip);
  }

  private readonly onFile = (): void => {
    const file = this.input.files?.[0];
    if(file) void this.load(file);
  };

  private readonly onClip = (): void => {
    if(!this.container)return;
    for(const group of this.container.animationGroups)group.stop();
    const index=Number(this.clips.value);
    const group=this.container.animationGroups[index];
    if(!group)return;
    group.reset();
    group.start(!/death|die|dying|fall|tod|sterb/i.test(group.name));
    this.info.textContent = "Playing " + group.name +
      " · " + this.container.animationGroups.length + " imported clips · Local preview only";
  };

  private async load(file: File): Promise<void> {
    if(!/\.glb$/i.test(file.name)){
      this.info.textContent="Only exported .glb files are supported.";
      return;
    }
    const generation=++this.generation;
    this.clips.disabled=true;
    this.clips.replaceChildren(new Option("Loading model…",""));
    this.info.textContent="Importing " + file.name + " · " +
      (file.size/1024/1024).toFixed(1) + " MiB";
    this.container?.dispose();
    this.container=null;
    try{
      const container=await loadAssetContainerAsync(file,this.scene);
      if(this.disposed||generation!==this.generation){
        container.dispose();
        return;
      }
      container.addAllToScene();
      this.container=container;
      const meshes=container.meshes.filter(mesh=>mesh.getTotalVertices()>0);
      if(!meshes.length)throw new Error("No renderable meshes in this GLB");
      let min=new Vector3(Infinity,Infinity,Infinity);
      let max=new Vector3(-Infinity,-Infinity,-Infinity);
      for(const mesh of meshes){
        mesh.computeWorldMatrix(true);
        const bounds=mesh.getBoundingInfo().boundingBox;
        min=Vector3.Minimize(min,bounds.minimumWorld);
        max=Vector3.Maximize(max,bounds.maximumWorld);
      }
      const center=min.add(max).scale(.5);
      const extent=max.subtract(min);
      const size=Math.max(extent.x,extent.y,extent.z,.5);
      this.camera.setTarget(center);
      this.camera.radius=size*1.65;
      this.camera.lowerRadiusLimit=size*.3;
      this.camera.upperRadiusLimit=size*7;
      this.clips.replaceChildren();
      if(container.animationGroups.length){
        container.animationGroups.forEach((group,index)=>{
          this.clips.add(new Option((index+1)+". "+group.name,String(index)));
        });
        this.clips.disabled=false;
        this.clips.value="0";
        this.onClip();
      }else{
        this.clips.add(new Option("No animation clips in this GLB",""));
        this.clips.disabled=true;
        this.info.textContent=meshes.length+" meshes loaded · no animation clips. " +
          "Export the rigged/animated GLB from Tripo, not the retopo-only version.";
      }
    }catch(error){
      if(this.disposed||generation!==this.generation)return;
      this.container?.dispose();
      this.container=null;
      this.clips.disabled=true;
      this.info.textContent="Model import failed: "+String(error);
    }
  }

  dispose():void{
    this.disposed=true;
    this.generation++;
    this.input.removeEventListener("change",this.onFile);
    this.clips.removeEventListener("change",this.onClip);
    this.camera.detachControl();
    this.container?.dispose();
    this.container=null;
    this.scene.dispose();
  }
}
