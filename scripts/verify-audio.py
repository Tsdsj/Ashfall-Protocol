#!/usr/bin/env python3
"""Decode and verify every shipped audio file against its provenance manifest."""
import pathlib,json,hashlib,subprocess,math
import numpy as np,imageio_ffmpeg
ROOT=pathlib.Path(__file__).resolve().parents[1];base=ROOT/'public/audio';ffmpeg=imageio_ffmpeg.get_ffmpeg_exe();reports=[]
for manifest in [base/'manifest.json',base/'dialogue/manifest.json']:
 data=json.loads(manifest.read_text())
 for asset in data['assets']:
  file=manifest.parent/asset['file'];assert hashlib.sha256(file.read_bytes()).hexdigest()==asset['sha256'],file
  raw=subprocess.check_output([ffmpeg,'-v','error','-i',str(file),'-f','f32le','-ac','1','-ar','24000','-']);values=np.frombuffer(raw,dtype='<f4')
  assert np.isfinite(values).all() and len(values)>360,file
  peak=float(np.max(np.abs(values)));db=20*math.log10(max(peak,1e-9));seconds=len(values)/24000
  assert db < -1,file
  assert abs(seconds-asset['duration'])<.002,file
  assert abs(db-asset['peakDbFS'])<.011,file
  reports.append(dict(file=str(file.relative_to(base)),seconds=round(seconds,3),peakDbFS=round(db,2),bytes=file.stat().st_size))
result={'files':len(reports),'bytes':sum(r['bytes'] for r in reports),'seconds':round(sum(r['seconds'] for r in reports),3),'maxPeakDbFS':max(r['peakDbFS'] for r in reports),'filesVerified':reports}
out=ROOT/'output/audio-source/verification.json';out.write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({k:v for k,v in result.items() if k!='filesVerified'}))
