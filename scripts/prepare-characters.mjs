import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { cloneDocument, compactPrimitive, dedup, prune, resample, simplify, textureCompress, weld } from "@gltf-transform/functions";
import { MeshoptSimplifier } from "meshoptimizer";
import sharp from "sharp";

const root = process.cwd();
const destination = path.join(root, "public/assets/characters");
const input = path.join(root, "output/assets");
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const clips = new Set([
  "Idle_Loop", "Idle_Talking_Loop", "Walk_Loop", "Jog_Fwd_Loop", "Sprint_Loop", "Crouch_Idle_Loop", "Crouch_Fwd_Loop",
  "Jump_Start", "Jump_Loop", "Jump_Land", "Death01", "Hit_Chest", "Hit_Head", "Interact", "PickUp_Table", "Fixing_Kneeling",
  "Pistol_Idle_Loop", "Pistol_Shoot", "Pistol_Reload", "Punch_Jab", "Punch_Cross", "Driving_Loop", "Sitting_Enter", "Sitting_Exit",
  "Sitting_Idle_Loop", "Sitting_Talking_Loop", "Swim_Fwd_Loop", "Swim_Idle_Loop", "Roll",
  "Zombie_Idle_Loop", "Zombie_Walk_Fwd_Loop", "Zombie_Scratch", "Melee_Hook", "Hit_Knockback", "LayToIdle", "ClimbUp_1m",
  "Consume", "Chest_Open", "TreeChopping_Loop", "Farm_Harvest", "Farm_PlantSeed", "Farm_Watering", "OverhandThrow", "Yes", "Idle_Rail_Loop", "Idle_FoldArms_Loop",
]);
async function find(directory, filename) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const name = path.join(directory, entry.name);
    if (entry.isDirectory()) { const found = await find(name, filename);if (found) return found; }
    else if (entry.name === filename) return name;
  }
  return null;
}
const multiply = (a,b) => [a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]];
const inverse = q => [-q[0],-q[1],-q[2],q[3]];
function accessor(document, name, type, array) { return document.createAccessor(name).setType(type).setArray(array).setBuffer(document.getRoot().listBuffers()[0]); }
async function readCharacter(filename) {
  const json=JSON.parse(await fs.readFile(filename,"utf8")),resources={};
  for(const entry of [...(json.buffers??[]),...(json.images??[])]){
    if(!entry.uri||entry.uri.startsWith("data:"))continue;
    let resource=path.join(path.dirname(filename),entry.uri);
    try{await fs.access(resource);}catch{resource=path.join(path.dirname(filename),entry.uri.replace(/_png\.png$/,".png"));}
    resources[entry.uri]=new Uint8Array(await fs.readFile(resource));
  }
  return io.readJSON({json,resources});
}

function clothing(document) {
  const docRoot=document.getRoot();
  const skinNode=docRoot.listNodes().find(n=>n.getMesh()?.listPrimitives().some(p=>p.getMaterial()?.getName().includes("Superhero")));
  if(!skinNode)throw new Error("Source character body mesh is missing");
  const mesh=skinNode.getMesh(),skin=skinNode.getSkin(),bones=skin.listJoints().map(n=>n.getName().toLowerCase());
  const source=mesh.listPrimitives()[0];
  const positions=source.getAttribute("POSITION").getArray(),normals=source.getAttribute("NORMAL").getArray();
  const joints=source.getAttribute("JOINTS_0").getArray(),weights=source.getAttribute("WEIGHTS_0").getArray();
  const indices=source.getIndices().getArray();
  for(const material of docRoot.listMaterials())if(material.getName().includes("Hair"))material.setNormalTexture(null);
  const skinMaterial=source.getMaterial();skinMaterial.setRoughnessFactor(.82).setMetallicFactor(0).setDoubleSided(false);
  skinMaterial.setName("survivor-skin");
  const materials={skin:skinMaterial,shirt:document.createMaterial("survivor-shirt").setMetallicFactor(0).setBaseColorFactor([.24,.29,.25,1]).setRoughnessFactor(.92),pants:document.createMaterial("survivor-pants").setMetallicFactor(0).setBaseColorFactor([.15,.18,.15,1]).setRoughnessFactor(.95),boots:document.createMaterial("survivor-boots").setMetallicFactor(0).setBaseColorFactor([.07,.075,.06,1]).setRoughnessFactor(.88)};
  const groups={skin:[],shirt:[],pants:[],boots:[]};
  const membership=new Uint8Array(positions.length/3),bits={skin:1,shirt:2,pants:4,boots:8};
  for(let i=0;i<indices.length;i+=3){
    const vertices=[indices[i],indices[i+1],indices[i+2]];
    const y=vertices.reduce((sum,v)=>sum+positions[v*3+1],0)/3;
    let hand=0,head=0;
    for(const v of vertices)for(let k=0;k<4;k++)if(/hand|thumb|index|middle|ring|pinky/.test(bones[joints[v*4+k]]??""))hand+=weights[v*4+k]/3;
    for(const v of vertices)for(let k=0;k<4;k++)if(/head|neck/.test(bones[joints[v*4+k]]??""))head+=weights[v*4+k]/3;
    const group=head>.30||hand>.35?"skin":y<.15?"boots":y<.89?"pants":"shirt";
    groups[group].push(...vertices);
    for(const vertex of vertices)membership[vertex]|=bits[group];
  }
  mesh.removePrimitive(source);
  for(const [name,list]of Object.entries(groups)){
    if(!list.length)continue;
    const primitive=source.clone().setMaterial(materials[name]);
    primitive.setIndices(accessor(document,"indices-"+name,"SCALAR",new Uint32Array(list)));
    if(name!=="skin"){
      const adjusted=new Float32Array(positions),uv=new Float32Array(positions.length/3*2);
      const padding=name==="shirt"?.018:name==="pants"?.010:.015;
      for(let v=0;v<positions.length/3;v++){
        const amount=(membership[v]&(membership[v]-1))?0:padding;
        adjusted[v*3]+=normals[v*3]*amount;adjusted[v*3+1]+=normals[v*3+1]*amount;adjusted[v*3+2]+=normals[v*3+2]*amount;
        uv[v*2]=positions[v*3]*4+positions[v*3+2]*3;uv[v*2+1]=positions[v*3+1]*4;
      }
      primitive.setAttribute("POSITION",accessor(document,"clothing-"+name,"VEC3",adjusted));
      primitive.setAttribute("TEXCOORD_0",accessor(document,"cloth-uv-"+name,"VEC2",uv));
    }
    for(const semantic of primitive.listSemantics())if(/^TEXCOORD_[1-9]|^COLOR_/.test(semantic))primitive.setAttribute(semantic,null);
    compactPrimitive(primitive);mesh.addPrimitive(primitive);
  }
  source.dispose();
  for(const primitive of docRoot.listMeshes().flatMap(m=>m.listPrimitives()))for(const semantic of primitive.listSemantics())if(/^TEXCOORD_[1-9]|^COLOR_/.test(semantic))primitive.setAttribute(semantic,null);
  return materials;
}

function retarget(document,library) {
  const targetNodes=new Map(document.getRoot().listNodes().map(n=>[n.getName(),n]));
  const sourcePelvis=library.getRoot().listNodes().find(n=>n.getName()==="pelvis");
  const targetPelvis=targetNodes.get("pelvis");
  const scale=Math.hypot(...targetPelvis.getTranslation())/Math.hypot(...sourcePelvis.getTranslation());
  for(const source of library.getRoot().listAnimations()){
    const name=source.getName();if(!clips.has(name)||document.getRoot().listAnimations().some(a=>a.getName()===name))continue;
    const animation=document.createAnimation(name);
    for(const channel of source.listChannels()){
      const sourceNode=channel.getTargetNode(),targetNode=targetNodes.get(sourceNode.getName()),type=channel.getTargetPath();
      if(!targetNode||type==="scale"||(type==="translation"&&!["root","pelvis"].includes(sourceNode.getName())))continue;
      const sampler=channel.getSampler(),values=sampler.getOutput().getArray(),output=new Float32Array(values.length);
      if(type==="rotation"){
        const correction=multiply(targetNode.getRotation(),inverse(sourceNode.getRotation()));
        let previous=null;
        for(let i=0;i<values.length;i+=4){
          let q=multiply(correction,Array.from(values.slice(i,i+4)));const length=Math.hypot(...q)||1;q=q.map(v=>v/length);
          if(previous&&q.reduce((n,v,j)=>n+v*previous[j],0)<0)q=q.map(v=>-v);
          output.set(q,i);previous=q;
        }
      }else{
        const sourceRest=sourceNode.getTranslation(),targetRest=targetNode.getTranslation();
        for(let i=0;i<values.length;i++)output[i]=targetRest[i%3]+(values[i]-sourceRest[i%3])*scale;
      }
      const clone=document.createAnimationSampler().setInterpolation(sampler.getInterpolation()).setInput(accessor(document,name+"-time","SCALAR",new Float32Array(sampler.getInput().getArray()))).setOutput(accessor(document,name+"-"+type,type==="rotation"?"VEC4":"VEC3",output));
      animation.addSampler(clone).addChannel(document.createAnimationChannel().setTargetNode(targetNode).setTargetPath(type).setSampler(clone));
    }
  }
}
function firstPersonParts(document, part) {
  for(const node of document.getRoot().listNodes()){
    const mesh=node.getMesh(),skin=node.getSkin();if(!mesh||!skin)continue;
    const bones=skin.listJoints().map(n=>n.getName().toLowerCase());
    for(const primitive of [...mesh.listPrimitives()]){
      const positions=primitive.getAttribute("POSITION").getArray(),joints=primitive.getAttribute("JOINTS_0").getArray(),weights=primitive.getAttribute("WEIGHTS_0").getArray(),indices=primitive.getIndices().getArray(),keep=[];
      for(let i=0;i<indices.length;i+=3){
        let arm=0,y=0;
        for(const vertex of [indices[i],indices[i+1],indices[i+2]]){
          y+=positions[vertex*3+1]/3;
          for(let k=0;k<4;k++)if(/clavicle|upperarm|lowerarm|hand|thumb|index|middle|ring|pinky/.test(bones[joints[vertex*4+k]]??""))arm+=weights[vertex*4+k]/3;
        }
        if(part==="arms"?arm>.55:arm<.28&&y<1.50)keep.push(indices[i],indices[i+1],indices[i+2]);
      }
      if(!keep.length){mesh.removePrimitive(primitive);primitive.dispose();continue;}
      primitive.setIndices(accessor(document,part+"-indices","SCALAR",new Uint32Array(keep)));compactPrimitive(primitive);
    }
    if(!mesh.listPrimitives().length){node.setMesh(null);node.setSkin(null);}
  }
}
function removeAnimations(document) {
  for(const animation of [...document.getRoot().listAnimations()]){
    const samplers=[...animation.listSamplers()];
    for(const channel of [...animation.listChannels()])channel.dispose();
    for(const sampler of samplers)sampler.dispose();
    animation.dispose();
  }
}

await fs.mkdir(destination,{recursive:true});
await MeshoptSimplifier.ready;
const libraries=[];
for(const filename of ["UAL1_Standard.glb","UAL2_Standard.glb"]){const source=await find(input,filename);if(!source)throw new Error("Missing free Standard source: "+filename);libraries.push(await io.read(source));}
const report={license:"CC0-1.0",authors:["Quaternius","Gonzalo Furnier (animation collaboration)"],sources:["https://quaternius.com/packs/universalbasecharacters.html","https://quaternius.com/packs/universalanimationlibrary.html","https://quaternius.itch.io/universal-animation-library-2"],files:[]};
for(const gender of ["Male","Female"]){
  const source=await find(input,`Superhero_${gender}_FullBody.gltf`);if(!source)throw new Error("Missing free Standard base character "+gender);
  const document=await readCharacter(source);clothing(document);
  removeAnimations(document);
  for(const library of libraries)retarget(document,library);
  await document.transform(prune(),dedup(),weld(),resample(),textureCompress({encoder:sharp,targetFormat:"webp",resize:[1024,1024],quality:86,slots:/^(?!normalTexture).*$/}),textureCompress({encoder:sharp,targetFormat:"webp",resize:[1024,1024],lossless:true,effort:85,slots:/normalTexture/}));
  const motion=cloneDocument(document);
  for(const node of motion.getRoot().listNodes()){node.setMesh(null);node.setSkin(null);}
  await motion.transform(prune(),dedup());
  const motionName=`survivor-${gender.toLowerCase()}-motion.glb`;
  await io.write(path.join(destination,motionName),motion);
  const motionBytes=await fs.readFile(path.join(destination,motionName));
  report.files.push({file:motionName,bytes:motionBytes.length,triangles:0,animations:motion.getRoot().listAnimations().map(a=>a.getName()),sha256:crypto.createHash("sha256").update(motionBytes).digest("hex"),modifications:"Rest-pose retargeted animation-only bundle, shared by both mesh LODs."});
  removeAnimations(document);
  await document.transform(prune(),dedup());
  if(gender==="Male")for(const part of ["arms","body"]){
    const view=cloneDocument(document);firstPersonParts(view,part);await view.transform(prune(),dedup());
    const file=`survivor-player-${part}.glb`;await io.write(path.join(destination,file),view);
    const bytes=await fs.readFile(path.join(destination,file));
    report.files.push({file,bytes:bytes.length,triangles:view.getRoot().listMeshes().flatMap(m=>m.listPrimitives()).reduce((n,p)=>n+p.getIndices().getCount()/3,0),animations:[],sha256:crypto.createHash("sha256").update(bytes).digest("hex"),modifications:"First-person mesh extraction by skinning influences; retains the original articulated hands or clothed body, excluding self-occluding head geometry."});
  }
  for(const [lod,ratio]of [["high",1],["low",.48]]){
    const output=cloneDocument(document);
    if(ratio<1)await output.transform(simplify({simplifier:MeshoptSimplifier,ratio,error:.003}),textureCompress({encoder:sharp,targetFormat:"webp",resize:[512,512],lossless:true}),prune(),dedup());
    const filename=`survivor-${gender.toLowerCase()}-${lod}.glb`,file=path.join(destination,filename);
    await io.write(file,output);
    const bytes=await fs.readFile(file),triangles=output.getRoot().listMeshes().flatMap(m=>m.listPrimitives()).reduce((n,p)=>n+(p.getIndices()?.getCount()??p.getAttribute("POSITION").getCount())/3,0);
    report.files.push({file:filename,bytes:bytes.length,triangles,animations:output.getRoot().listAnimations().map(a=>a.getName()),sha256:crypto.createHash("sha256").update(bytes).digest("hex"),modifications:"Clothed surface partitions and small normal inflation; rest-pose retargeting; duplicate attributes removed; animation resampling; 1024px texture resize; WebP colors and lossless WebP normals; source filename aliases repaired; low LOD mesh simplification."});
    console.log(filename,Math.round(bytes.length/1024)+" KiB",triangles+" triangles");
  }
}
await fs.writeFile(path.join(destination,"manifest.json"),JSON.stringify(report,null,2)+"\n");
const license=await find(input,"License.txt");
await fs.copyFile(license,path.join(destination,"LICENSE.txt"));
