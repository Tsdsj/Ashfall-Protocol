"""Render measured before/after samples without changing the source data."""
from pathlib import Path
import json
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

root = Path(__file__).resolve().parents[2]
evidence = root / 'docs/phase2/evidence'
before = json.loads((evidence / 'soak-before-transmission-fix.json').read_text())
after = json.loads((evidence / 'soak-final.json').read_text())
assert after['stopReason'] == 'completed' and after['activeSeconds'] >= 1800
assert before['samples'][-1]['resolution'] == after['samples'][-1]['resolution'] == [1500,1112]
plt.rcParams.update({'font.family':'DejaVu Sans', 'font.size':10, 'axes.spines.top':False,
                     'axes.spines.right':False, 'axes.labelcolor':'#3b4652', 'text.color':'#1f2933',
                     'xtick.color':'#5e6d7c', 'ytick.color':'#5e6d7c', 'axes.edgecolor':'#c5cdd5'})
fig, axes = plt.subplots(3, 1, figsize=(12,8), sharex=True, layout='constrained')
colors = ['#b76238','#167f7e']
for axis, field, title in zip(axes, ['fps','sceneMs','heapMB'],
                             ['Engine FPS (sampled)', 'Scene CPU time (ms)', 'JS heap (MiB)']):
    axis.axvspan(0,5,color='#edf1f4',zorder=0)
    for data, label, color in zip([before,after],['Before: retained transmission list','After: local glass material'],colors):
        points = data['samples']
        axis.plot([p['seconds']/60 for p in points], [p[field] for p in points],
                  label=label, color=color, lw=1.7, alpha=.92)
    axis.set_ylabel(title)
    axis.set_ylim(bottom=0)
    axis.grid(axis='y',color='#e4e8ec',lw=.7)
axes[0].legend(loc='upper right',frameon=False,fontsize=9)
axes[0].text(.01,.85,'First 5 min: warm-up',transform=axes[0].transAxes,fontsize=9,color='#687787')
axes[-1].set_xlim(0,30)
axes[-1].set_xlabel('Active render time (minutes)')
fig.suptitle('Ashfall Protocol · 30-minute streaming stress run\nHigh · 1500 × 1112 · Chrome 152 / WebGPU · Apple M5 Pro',
             fontsize=15,ha='left',x=.07)
fig.text(.07,-.035,'~20-second samples; FPS is an engine window average. Nine areas, cycling weather/weapons.\n'
         'Same test script and pixel resolution; scene activity is not a frame-identical microbenchmark.',
         fontsize=9,color='#687787')
output=root/'docs/phase2/screenshots/performance-comparison.png'
fig.savefig(output,dpi=160,bbox_inches='tight',facecolor='white')
print(output)
