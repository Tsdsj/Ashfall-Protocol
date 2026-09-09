"""Summarize captured browser samples; does not run or alter the game."""
from pathlib import Path
import json
import statistics
from datetime import datetime

ROOT = Path(__file__).resolve().parents[2]
EVIDENCE = ROOT / 'docs/phase2/evidence'

def load(name):
    return json.loads((EVIDENCE / name).read_text())

def summary(run):
    samples = run['samples']
    warm = [sample for sample in samples if sample['seconds'] >= 300]
    metrics = {}
    for key in ['fps', 'frameP95', 'frameP99', 'drawCalls', 'gpuMs', 'sceneMs',
                'animationMs', 'simulationMs', 'physicsQueries', 'meshes',
                'materials', 'textures', 'geometries', 'actorRigs',
                'animationGroups', 'transformNodes', 'skeletons', 'heapMB']:
        values = [sample[key] for sample in warm
                  if isinstance(sample.get(key), (int, float))]
        if values:
            metrics[key] = dict(zip(['min', 'median', 'max'],
                                   [round(min(values), 3), round(statistics.median(values), 3), round(max(values), 3)]))
    windows = []
    for start in range(0, 1800, 300):
        interval = [sample for sample in samples if start <= sample['seconds'] < start + 300]
        windows.append({'from': start, 'to': start + 300, 'samples': len(interval),
                        'fpsMedian': round(statistics.median(row['fps'] for row in interval), 2),
                        'heapMinMB': min(row['heapMB'] for row in interval),
                        'heapMaxMB': max(row['heapMB'] for row in interval)})
    regions = {}
    for sample in warm:
        p = sample['position']
        nearest = min(run['environment']['places'], key=lambda poi: (poi['x']-p['x'])**2 + (poi['z']-p['z'])**2)
        key = 'underground' if nearest['id'] == 'lab-0' and p['y'] < nearest['y']-3 else nearest['id']
        regions.setdefault(key, []).append(sample)
    return {'samples': len(samples), 'warmSamples': len(warm), 'metrics': metrics, 'windows': windows,
            'fpsByRegion': {key: {'samples':len(rows), 'median':round(statistics.median(r['fps'] for r in rows), 2),
                                 'min':round(min(r['fps'] for r in rows), 2), 'max':round(max(r['fps'] for r in rows), 2)}
                            for key, rows in regions.items()},
            'meanRenderedFPS': round(run['frames']/run['elapsedSeconds'], 2),
            'maxDisposedInRenderTargets': max((target['disposed'] for row in samples for target in row.get('renderTargets', [])), default=0),
            'transmissionTargets': sorted({target['name'] for row in samples for target in row.get('renderTargets', []) if 'opaqueSceneTexture' in target['name']}),
            'maxOneShotVoices': max(row['audio']['activeVoices'] for row in samples),
            'maxLoops': max(row['audio']['loops'] for row in samples),
            'audioFailures': sorted({failure for row in samples for failure in row['audio']['failed']})}

before = load('soak-before-transmission-fix.json')
after = load('soak-final.json')
candidate = load('candidate.json')
assert after['stopReason'] == 'completed' and after['activeSeconds'] >= 1800
assert not after['running'] and not after['errors'] and not after['warnings']
assert all(not sample['worldError'] for sample in after['samples'])
assert all('renderTargets' in sample for sample in after['samples'])
old, new = summary(before), summary(after)
assert not new['transmissionTargets'] and not new['audioFailures']
# Lists may briefly contain a mesh disposed later in the same frame. Report the exact count;
# do not silently convert it into zero or define performance success by one FPS threshold.
result = {'candidate':candidate, 'before':old, 'after':new}
(EVIDENCE / 'soak-summary.json').write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n')

def triplet(run, key):
    row = run['metrics'][key]
    return ' / '.join(f'{row[k]:g}' for k in ['min','median','max'])

rows = []
for label, key in [('FPS','fps'),('最近 600 帧 P95（ms）','frameP95'),('最近 600 帧 P99（ms）','frameP99'),
                   ('draw calls','drawCalls'),('GPU 主渲染 pass（ms）','gpuMs'),('scene CPU（ms）','sceneMs'),
                   ('动画阶段（ms）','animationMs'),('模拟（ms）','simulationMs'),('每帧碰撞查询','physicsQueries'),
                   ('Mesh','meshes'),('Material','materials'),('Texture','textures'),('Geometry','geometries'),
                   ('实际呈现 actor rig','actorRigs'),('AnimationGroup','animationGroups'),('JS heap（MiB）','heapMB')]:
    rows.append(f'| {label} | {triplet(old,key)} | {triplet(new,key)} |')
window_rows = [f"| {a['from']//60}–{a['to']//60} 分钟 | {a['fpsMedian']:g} | {b['fpsMedian']:g} | {a['heapMinMB']}–{a['heapMaxMB']} | {b['heapMinMB']}–{b['heapMaxMB']} |"
               for a,b in zip(old['windows'],new['windows'])]
region_rows = [f"| {key} | {row['samples']} | {row['min']:g} / {row['median']:g} / {row['max']:g} |" for key,row in new['fpsByRegion'].items()]
text = f'''# 最终连续运行与性能记录

日期：2026-09-09。候选 `{candidate['buildVersion']}`，运行源码 SHA-256 `{candidate['sourceSha256']}`。本记录保留第一次长测发现的真实退化，并使用修复后的完整第二次长测核验。

![同分辨率长测前后对比](screenshots/performance-comparison.png)

指标正文由脚本生成，稳定性判断与全阶段结论见 [最终验收](ACCEPTANCE.md)。

## 测试条件

- 本机 `Mac17,8`、Apple M5 Pro、48 GiB RAM（sysctl 实际读回）；浏览器 UA 的 Intel 字符串是兼容 UA，不能用它判断硬件。
- Chrome 152 / WebGPU / High，实际渲染分辨率 `{after['samples'][-1]['resolution'][0]} × {after['samples'][-1]['resolution'][1]}`。
- UTC `{after['startedAt']}` 至 `{after['finishedAt']}`；墙钟 {after['elapsedSeconds']:.2f} 秒，有效渲染运行 {after['activeSeconds']:.2f} 秒，{after['frames']:,} 帧、{after['transitions']} 次场景位置切换、{new['samples']} 个采样点。
- 松谷、城市、军事、工业、湖岸、矿场、研究站、广播站和地下循环；六种武器、ADS/装填、昼夜/五种天气、手电、正常世界人口、声音与每两分钟保存。
- 使用开发自动操作、旅行、无敌和供弹，不强制新增敌人。它检查长期资源/渲染/模拟稳定性，不证明生存资源平衡；正常伤害生存链路另测。
- 世界模拟累计 {after['samples'][-1]['simulationSeconds']:.2f} 秒。游戏单帧模拟 dt 上限 50 ms，有效长测计时上限 100 ms，因此它们不会在低帧率/加载帧上与墙钟完全相等。

## 发现、修复与复核

首次 30 分钟虽无 JS 错误，却不能通过性能验收：结束时约 10 FPS，堆回收低点增长。CPU profile 指向 ObjectRenderer 的准备/提交；实际 `opaqueSceneTexture` 含 137,138 个网格，其中 135,992 个已销毁。发电机一块玻璃的 glTF transmission 扩展启用了跟踪全场景网格的 helper，已卸载网格仍被保留。仅清理该列表的诊断实验使同场景 CPU 从约 93 ms 降至 27 ms。

修复将环境 GLB 统一经过 `loadEnvironmentAsset()`，关闭自动 transmission helper，小块玻璃使用 alpha 与 clear coat。没有降低全局画质、删掉敌人或缩短长测。真实 GLB 导入/销毁回归已加入，共 180 项测试通过。

第二次长测捕获错误 **{len(after['errors'])}**、警告 **{len(after['warnings'])}**，所有 worldError 为空；自动正常结束。渲染目标中 transmission pass 数为 **{len(new['transmissionTargets'])}**，采样到的已销毁网格最大数为 **{new['maxDisposedInRenderTargets']}**。音频加载失败 **{len(new['audioFailures'])}**，一次性声部最大 {new['maxOneShotVoices']}、循环声最大 {new['maxLoops']}。

## 采样数据

以下排除最初五分钟预热，分别为各采样值的 **最小 / 中位 / 最大**，不是所有帧的全量分布。

| 指标 | 修复前 | 修复后 |
| --- | ---: | ---: |
{chr(10).join(rows)}

整个墙钟运行的平均已呈现帧率：修复前 **{old['meanRenderedFPS']} FPS**，修复后 **{new['meanRenderedFPS']} FPS**。区域、天气和角色行为并非每一帧严格相同，不能把两次运行当成逐帧同负载的微基准。

| 时间段 | 修复前 FPS 采样中位 | 修复后 FPS 采样中位 | 修复前 heap MiB | 修复后 heap MiB |
| --- | ---: | ---: | ---: | ---: |
{chr(10).join(window_rows)}

修复后各地的采样（含该地不同天气与方向，前五分钟除外）：

| 地点 | 采样数 | FPS 最小 / 中位 / 最大 |
| --- | ---: | ---: |
{chr(10).join(region_rows)}

## 测量边界

- FPS 来自引擎窗口平均；P95/P99 是每个采样点最近 600 帧的滚动百分位。表内是这些滚动值的分布，不能称作整场全量 P95。
- GPU 值明确为 `main-pass`，不包含所有阴影/反射 pass；旧整帧 timestamp 在当前 Chrome 下返回 0，本报告未伪造完整 GPU 时间。`shadowAndTargetsMs=0` 也不解释为阴影免费。
- animationMs 是 Scene 的动画阶段，部分手动采样/IK 在渲染更新的其它阶段；AnimationGroup 数含每个 rig 的未播放片段，不能当成全部同时播放的动画数。
- raw `activeEnemies` 是整个持久世界中生命大于零的 Actor 数（含动物），不是近场正在追击的 AI 数；画面实际 rig 数另列。
- JS heap 包含临时分配、GC 周期和动态资源。比较预热后多区域回收低点与实际对象列表；单个高点不独立证明泄漏。无强制 GC 干预这两次完整长测，诊断清理实验单独记录。
- 当前验收不承诺全部场景、Ultra 或所有设备稳定 60 FPS。一次 30 分钟测试也不能替代数小时、更多种子与硬件覆盖。

## 原始证据与复现

- [第一次完整长测](evidence/soak-before-transmission-fix.json)、[CPU profile 汇总](evidence/cpu-profile-before.json)、[保留列表诊断](evidence/transmission-retention-probe.json)。
- [修复后完整长测](evidence/soak-final.json)、[机器可读汇总](evidence/soak-summary.json)、[候选指纹](evidence/candidate.json)。
- 执行脚本 `scripts/qa/phase2-soak-start.txt`；保持前台运行，Esc 可中断。汇总命令：`python3 scripts/qa/summarize-phase2-soak.py`。
'''
(ROOT/'docs/phase2/PERFORMANCE.md').write_text(text)
print(json.dumps({'after':new}, ensure_ascii=False))
