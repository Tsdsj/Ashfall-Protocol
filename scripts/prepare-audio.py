#!/usr/bin/env python3
"""Build the curated local audio bank. Use output/audio-tools/bin/python.
Source archives are deliberately kept outside the shipped public directory.
Run --download to restore missing upstream sources before processing.
"""
import hashlib,json,pathlib,subprocess,urllib.request,zipfile,argparse
import numpy as np
import soundfile as sf
import imageio_ffmpeg
ROOT=pathlib.Path(__file__).resolve().parents[1]
SRC=ROOT/'output/audio-source'; OUT=ROOT/'public/audio'; OUT.mkdir(parents=True,exist_ok=True)
SOURCES={
 'impact': ('Kenney','https://kenney.nl/assets/impact-sounds','https://kenney.nl/media/pages/assets/impact-sounds/87b4ddecda-1677589768/kenney_impact-sounds.zip','impact.zip'),
 'rpg': ('Kenney','https://kenney.nl/assets/rpg-audio','https://kenney.nl/media/pages/assets/rpg-audio/8e99002d76-1677590336/kenney_rpg-audio.zip','rpg.zip'),
 'sci-fi': ('Kenney','https://kenney.nl/assets/sci-fi-sounds','https://kenney.nl/media/pages/assets/sci-fi-sounds/6b296f9ecf-1677589334/kenney_sci-fi-sounds.zip','sci-fi.zip'),
 'guns': ('Ben Jaszczak, Brian Nelson, Kevin Heras, Matthew Nanney','https://opengameart.org/content/the-free-firearm-sound-library','https://opengameart.org/sites/default/files/Prepared%20SFX%20Library.7z','guns.7z'),
 'zombies': ('artisticdude','https://opengameart.org/content/zombies-sound-pack','https://opengameart.org/sites/default/files/zombies.zip','zombies.zip'),
 'rain-field': ('Ylmir','https://opengameart.org/content/rain-loopable','https://opengameart.org/sites/default/files/Rain%20OGG.zip','Rain OGG.zip'),
 'park': ('Thimras','https://opengameart.org/content/park-ambiences','https://opengameart.org/sites/default/files/park_ambience_birds.wav','park_ambience_birds.wav'),
 'wind': ('Thimras','https://opengameart.org/content/park-ambiences','https://opengameart.org/sites/default/files/park_ambience_wind.wav','park_ambience_wind.wav'),
 'engine': ('jwiese','https://opengameart.org/content/enginemechanic-working-sound','https://opengameart.org/sites/default/files/loop.flac','loop.flac'),
 'water': ('rubberduck','https://opengameart.org/content/40-cc0-water-splash-slime-sfx','https://opengameart.org/sites/default/files/water-splash-slime-sfx.zip','water-splash-slime-sfx.zip'),
 'animal': ('qubodup','https://opengameart.org/content/dog-snarl-grunt-grumble','https://opengameart.org/sites/default/files/dog_0.7z','animal.7z'),
}
args=argparse.ArgumentParser(); args.add_argument('--download',action='store_true');args=args.parse_args()
if args.download:
 expected={e['key']:e['sourceArchiveSha256'] for e in json.loads((OUT/'licenses/sources.json').read_text())} if (OUT/'licenses/sources.json').exists() else {}
 SRC.mkdir(parents=True,exist_ok=True)
 for key,(_,page,url,name) in SOURCES.items():
  target=SRC/name
  if not target.exists():urllib.request.urlretrieve(url,target)
  if key in expected:assert hashlib.sha256(target.read_bytes()).hexdigest()==expected[key],f'Source archive hash mismatch: {key}'
  if target.suffix=='.zip':
   with zipfile.ZipFile(target) as z:z.extractall(SRC/target.stem)
  elif target.suffix=='.7z':
   folder=SRC/key;folder.mkdir(exist_ok=True);subprocess.run(['tar','-xf',str(target),'-C',str(folder)],check=True)

entries=[];groups={};ffmpeg=imageio_ffmpeg.get_ffmpeg_exe()
def add(group,source_key,rel,start=None,duration=None,loop=False,filter=None,tail=False):
 path=SRC/rel; data,sr=sf.read(path,dtype='float32',always_2d=True)
 data=data.mean(axis=1)
 # Transients keep a short lead-in and no trailing silence. This makes input feedback immediate.
 if start is None:
  above=np.flatnonzero(np.abs(data)>max(.001,float(np.max(np.abs(data)))*.018))
  begin=max(0,int(above[0])-int(sr*.004)) if len(above) else 0
 else:begin=int(start*sr)
 end=min(len(data),begin+int(duration*sr)) if duration else len(data)
 data=data[begin:end]
 if tail:data=data[int(sr*.105):]
 if not loop:
  above=np.flatnonzero(np.abs(data)>max(.0006,float(np.max(np.abs(data)))*.008))
  if len(above):data=data[:min(len(data),above[-1]+int(sr*.055))]
 if loop:
  overlap=min(int(sr*.3),len(data)//8);fade=np.linspace(0,1,overlap)
  data[-overlap:]=data[-overlap:]*(1-fade)+data[:overlap]*fade;data=data[overlap:]
 else:
  n=min(int(sr*.003),len(data)//4);data[:n]*=np.linspace(0,1,n)
  n=min(int(sr*.035),len(data)//4);data[-n:]*=np.linspace(1,0,n)
 peak=float(np.max(np.abs(data)));data*=.72/max(peak,.0001)
 index=len(groups.get(group,[]));file=f'{group}-{index}.mp3';target=OUT/file
 temp=SRC/'prepared.wav';sf.write(temp,data,sr,subtype='PCM_16')
 command=[ffmpeg,'-y','-hide_banner','-loglevel','error','-i',str(temp),'-map_metadata','-1','-ac','1','-ar','24000']
 if filter:command+=['-af',filter]
 command+=['-codec:a','libmp3lame','-b:a','64k' if loop else '80k',str(target)]
 subprocess.run(command,check=True)
 decoded=subprocess.check_output([ffmpeg,'-v','error','-i',str(target),'-f','f32le','-ac','1','-ar','24000','-'])
 values=np.frombuffer(decoded,dtype='<f4');pk=float(np.max(np.abs(values)))
 author,page,url,archive=SOURCES[source_key]
 entries.append(dict(file=file,group=group,author=author,source=page,download=url,originalFile=rel,license='CC0-1.0',licenseUrl='https://creativecommons.org/publicdomain/zero/1.0/',sourceSha256=hashlib.sha256(path.read_bytes()).hexdigest(),sha256=hashlib.sha256(target.read_bytes()).hexdigest(),bytes=target.stat().st_size,duration=round(len(values)/24000,4),peakDbFS=round(20*np.log10(max(pk,1e-9)),2),changes=f'Mono 24 kHz MP3, onset trim {begin/sr:.4f}s, peak normalized -2.85 dBFS before encoding, fades'+(', 300 ms loop crossfade' if loop else '')+(', tail extracted after 105 ms' if tail else '')+(f', {filter}' if filter else ''),loop=loop))
 groups.setdefault(group,[]).append(file)
for material,original in [('wood','wood'),('concrete','concrete'),('dirt','grass')]:
 for i in range(4):add('step-'+material,'impact',f'impact/Audio/footstep_{original}_{i:03}.ogg')
for material,original in [('wood','impactWood_medium'),('metal','impactMetal_light'),('concrete','impactMining'),('dirt','impactSoft_medium'),('glass','impactGlass_medium'),('flesh','impactPunch_heavy')]:
 for i in range(3):add('hit-'+material,'impact',f'impact/Audio/{original}_{i:03}.ogg')
for i in range(3):
 add('step-metal','impact',f'impact/Audio/impactPlate_light_{i:03}.ogg',filter='lowpass=f=3800')
 add('step-glass','impact',f'impact/Audio/impactGlass_light_{i:03}.ogg',filter='lowpass=f=6500')
 add('step-water','water',f'water-splash-slime-sfx/splash_{i+1:02}.ogg',duration=.55)
 add('cloth','rpg',f'rpg/Audio/cloth{i+1}.ogg')
 add('door-open','rpg',f'rpg/Audio/doorOpen_{i%2+1}.ogg')
 add('door-close','rpg',f'rpg/Audio/doorClose_{i+1}.ogg')
for group,names in {'swing':['knifeSlice','knifeSlice2'],'mechanical':['metalLatch','metalClick'],'mag-out':['drawKnife1','drawKnife2'],'mag-in':['metalClick','metalLatch'],'latch':['metalLatch'],'switch':['metalClick'],'ui':['handleCoins'],'radio':['bookFlip1'],'water':['clothBelt']}.items():
 for name in names:add(group,'rpg',f'rpg/Audio/{name}.ogg')
for i in range(2):add('explosion','sci-fi',f'sci-fi/Audio/explosionCrunch_{i:03}.ogg',duration=2.6)
for weapon,records in {'pistol':['1911/A_42P.wav','Walther PPQ/X_39P.wav'],'rifle':['AR-15/D_32P.wav','AK-47/C_28P.wav'],'shotgun':['Nova/O_21P.wav','Model 12/K_22P.wav']}.items():
 for record in records:
  rel='guns/Prepared SFX Library/'+record
  add('gun-'+weapon,'guns',rel,duration=.145)
  add('tail-'+weapon,'guns',rel,duration=1.65,tail=True)
for phase,ids in {'idle':[1,2,3],'alert':[4,5],'search':[6,7],'chase':[8,9],'attack':[10,11,12],'hit':[13,14,15],'death':[20,21,23]}.items():
 for i in ids:add('infected-'+phase,'zombies',f'zombies/zombies/zombie-{i}.wav',duration=2.8)
add('forest','park','park_ambience_birds.wav',start=15,duration=28,loop=True)
add('wind','wind','park_ambience_wind.wav',start=10,duration=24,loop=True,filter='highpass=f=75,lowpass=f=7500')
for start in [40,64]:add('birds','park','park_ambience_birds.wav',start=start,duration=2.5)
add('rain','rain-field','Rain OGG/1.ogg',start=0,duration=22,loop=True)
add('rain-roof','rain-field','Rain OGG/2.ogg',start=0,duration=18,loop=True,filter='highpass=f=250,lowpass=f=5000')
add('engine','engine','loop.flac',start=0,loop=True,filter='highpass=f=45,lowpass=f=1600')
add('thunder','sci-fi','sci-fi/Audio/lowFrequency_explosion_000.ogg',duration=4,filter='lowpass=f=900')
animal_files=sorted((SRC/'animal').rglob('*.flac'))
for path in animal_files[:3]:add('animal','animal',str(path.relative_to(SRC)),duration=2.5)
(OUT/'manifest.json').write_text(json.dumps({'version':2,'sources':SOURCES,'assets':entries,'totalBytes':sum(e['bytes'] for e in entries)},ensure_ascii=False,indent=2)+'\n')
catalog=ROOT/'src/audio/catalog.ts'
dialogue={}
if (OUT/'dialogue/manifest.json').exists():dialogue={e['id']:'dialogue/'+e['file'] for e in json.loads((OUT/'dialogue/manifest.json').read_text())['assets']}
catalog.write_text('/** Generated by the local audio preparation scripts. */\nexport const SOUND_GROUPS: Record<string, string[]> = '+json.dumps(groups,indent=2)+';\nexport const DIALOGUE_FILES: Record<string, string> = '+json.dumps(dialogue,indent=2)+';\n')
print(json.dumps({'files':len(entries),'bytes':sum(e['bytes'] for e in entries),'duration':sum(e['duration'] for e in entries),'peakDbFS':max(e['peakDbFS'] for e in entries)}))
