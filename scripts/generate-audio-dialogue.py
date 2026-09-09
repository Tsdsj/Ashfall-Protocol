#!/usr/bin/env python3
"""Generate original Chinese dialogue locally. Requires the private audio-tools venv.
No system voices, remote TTS calls, celebrity voices or reference recordings.
Exports NARRATIVE_AUDIO from the current source, then generates local MP3 files.
Model downloads are pinned and confined to output/audio-source/kokoro.
"""
import pathlib,json,hashlib,re,subprocess,os,urllib.request
ROOT=pathlib.Path(__file__).resolve().parents[1]
os.environ.setdefault('HF_HOME',str(ROOT/'output/audio-source/huggingface'))
import torch,numpy as np,soundfile as sf,imageio_ffmpeg
from kokoro import KModel,KPipeline
SRC=ROOT/'output/audio-source';MODEL=SRC/'kokoro';OUT=ROOT/'public/audio/dialogue';OUT.mkdir(parents=True,exist_ok=True)
REPO='hexgrad/Kokoro-82M-v1.1-zh';REV='01e7505bd6a7a2ac4975463114c3a7650a9f7218'
for name in ['config.json','kokoro-v1_1-zh.pth','voices/zf_001.pt','voices/zm_010.pt']:
 path=MODEL/name;path.parent.mkdir(parents=True,exist_ok=True)
 if not path.exists():urllib.request.urlretrieve(f'https://huggingface.co/{REPO}/resolve/{REV}/{name}',path)
model_sha=hashlib.sha256((MODEL/'kokoro-v1_1-zh.pth').read_bytes()).hexdigest()
assert model_sha=='b1d8410fa44dfb5c15471fd6c4225ea6b4e9ac7fa03c98e8bea47a9928476e2b'
torch.set_num_threads(4);torch.manual_seed(7347)
model=KModel(repo_id=REPO,config=str(MODEL/'config.json'),model=str(MODEL/'kokoro-v1_1-zh.pth')).to('cpu').eval()
pipeline=KPipeline(lang_code='z',repo_id=REPO,model=model,en_callable=lambda text:'')
voices={v:torch.load(MODEL/f'voices/{v}.pt',weights_only=True) for v in ['zf_001','zm_010']}
subprocess.run(['node','--input-type=module','-e',r'''
import ts from 'typescript'; import fs from 'node:fs'; import { pathToFileURL } from 'node:url';
const text = fs.readFileSync('src/narrative/content.ts', 'utf8');
fs.writeFileSync('output/audio-source/narrative.mjs', ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText);
const { NARRATIVE_AUDIO } = await import(pathToFileURL(process.cwd() + '/output/audio-source/narrative.mjs').href);
fs.writeFileSync('output/audio-source/dialogue.json', JSON.stringify(NARRATIVE_AUDIO, null, 2));
'''],cwd=ROOT,check=True)
script=json.loads((SRC/'dialogue.json').read_text());old={}
if (OUT/'manifest.json').exists():old={e['id']:e for e in json.loads((OUT/'manifest.json').read_text())['assets']}
assets=[];ffmpeg=imageio_ffmpeg.get_ffmpeg_exe()
def voice_for(speaker):
 return 'zf_001' if re.search('米拉|女人|知微|林漪|许禾|陈娅|护士|许弥|罗岚|乔榆',speaker) else 'zm_010'
for cue_id,cue in script.items():
 text_hash=hashlib.sha256(cue['text'].encode()).hexdigest();target=OUT/(cue_id+'.mp3')
 if cue_id in old and old[cue_id]['textSha256']==text_hash and target.exists():assets.append(old[cue_id]);continue
 segments=[];used=set()
 for paragraph in cue['text'].split('\n'):
  speaker=cue['speaker'];parts=paragraph.split('：',1)
  if len(parts)==2 and len(parts[0])<12:speaker,paragraph=parts
  voice=voice_for(speaker);used.add(voice)
  paragraph=paragraph.replace('ASHFALL','灰烬协议').replace('R-07','第七研究站').replace('R-七','第七研究站')
  for sentence in re.findall(r'[^。！？；]+[。！？；]?',paragraph):
   for result in pipeline(sentence,voice=voices[voice],speed=0.97):
    if result.audio is not None:segments.append(result.audio.detach().cpu().numpy())
   segments.append(np.zeros(3600,dtype=np.float32))
  segments.append(np.zeros(4800,dtype=np.float32))
 wav=np.concatenate(segments);wav*=.77/max(float(np.max(np.abs(wav))),.001)
 tmp=SRC/'dialogue-temp.wav';sf.write(tmp,wav,24000,subtype='PCM_16')
 subprocess.run([ffmpeg,'-y','-v','error','-i',str(tmp),'-map_metadata','-1','-af','highpass=f=90,lowpass=f=11500,volume=0.794328','-codec:a','libmp3lame','-b:a','64k',str(target)],check=True)
 raw=subprocess.check_output([ffmpeg,'-v','error','-i',str(target),'-f','f32le','-ac','1','-ar','24000','-']);values=np.frombuffer(raw,dtype='<f4')
 entry={'id':cue_id,'file':target.name,**cue,'voices':sorted(used),'textSha256':text_hash,'duration':round(len(values)/24000,3),'peakDbFS':round(20*np.log10(max(float(np.max(np.abs(values))),1e-9)),2),'bytes':target.stat().st_size,'sha256':hashlib.sha256(target.read_bytes()).hexdigest()};assets.append(entry)
 manifest={'model':REPO,'revision':REV,'modelSha256':model_sha,'license':'Apache-2.0','source':f'https://huggingface.co/{REPO}/tree/{REV}','voiceFiles':{v:hashlib.sha256((MODEL/f'voices/{v}.pt').read_bytes()).hexdigest() for v in voices},'authorship':'Original ASHFALL PROTOCOL Chinese script; synthesized locally with licensed model voices. No imitation of a named real person.','changes':'Chinese pronunciation normalization; speaker segmentation; 24kHz mono; highpass 90Hz lowpass 11.5kHz; peak normalized; additional -2 dB mastering headroom; MP3 64kbps.','assets':assets,'totalBytes':sum(e['bytes'] for e in assets)}
 (OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
 print(cue_id,entry['duration'],entry['bytes'],flush=True)
# Cache hits after the final regenerated cue must also be persisted.
manifest=json.loads((OUT/'manifest.json').read_text())
manifest['assets']=assets
manifest['totalBytes']=sum(e['bytes'] for e in assets)
(OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
# Preserve the sound-bank catalog; only replace generated dialogue mapping.
p=ROOT/'src/audio/catalog.ts';content=p.read_text();prefix=content.split('export const DIALOGUE_FILES')[0]
p.write_text(prefix+'export const DIALOGUE_FILES: Record<string, string> = '+json.dumps({e['id']:'dialogue/'+e['file'] for e in assets},indent=2)+';\n')
(ROOT/'src/audio/dialogue-durations.ts').write_text('/** Generated local Chinese voice lengths, in seconds. */\nexport const DIALOGUE_DURATIONS: Record<string, number> = '+json.dumps({e['id']:e['duration'] for e in assets},indent=2)+';\n')
print('complete',len(assets),sum(e['bytes'] for e in assets),flush=True)
