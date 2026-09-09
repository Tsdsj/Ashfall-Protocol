# 第二阶段声音交付

> 本文保留模块设计、接入约定与交接时的验证边界；整体已完成接入，当前真实浏览器与最终验证结果见 [第二阶段验收](ACCEPTANCE.md)。

本轮将原有几乎全部由短噪声和振荡器组成的声音，替换为本地采样与分层混音。保持 `AudioManager` 原有 `constructor / unlock / apply / event / update / dispose` 接口。

## 文件和加载

- 104 个 CC0 音效，1,381,072 bytes（约 1.32 MiB），含实录枪械、材质拟音、门与装备、感染者、动物、风、雨和引擎循环。
- 45 个原创中文语音文件，6,910,524 bytes（约 6.59 MiB），共 859.8 秒。使用中文女声 `zf_001` 和男声 `zm_010`，按对白中的说话人分段；这是合成配音，不是真人演员表演。
- 149 个音频文件合计 8,291,596 bytes（约 7.91 MiB）；加上清单与许可文件，目录占用约 8.3 MiB。浏览器只下载这些 MP3，不下载生成模型。
- 第一次用户手势 `unlock()` 后，4 个工作队列异步预解码音效。语音按 cue 加载，依赖 HTTP 本地缓存与现有全文件离线 precache。声音请求不访问外部供应商。
- 解码缓存上限 64 MiB，先逐出旧语音；最多 36 个短声部，最多 5 个环境/引擎循环，6 个声学 impulse 缓存。节点在 `onended` 和 `dispose()` 时断开，取消未完成下载；不存在不断新增的 `setTimeout`。
- 采样选择避免相邻变体索引重复，播放速率与音量有轻微变化。感染者按实体与状态限流，动作循环至少间隔 0.85 秒；限额时优先保留枪口与对白，淘汰低优先级尾音。

## 声音行为

| 操作 | 采样与处理 |
| --- | --- |
| 手枪 / 霰弹枪 / 步枪 | 使用不同真实枪械录音；枪口与尾音单独裁切，叠加机械动作，室内额外混响 |
| 近战 | 刀具挥动、衣物动作，命中再按材质触发 |
| wood / metal / concrete / dirt / glass / flesh | 独立命中素材组，每组 3 个变体 |
| 脚步 | wood、metal、concrete、dirt、glass、water；音量和滤波随速度、姿态、负重变化，并叠加装备摩擦 |
| 感染者 | idle / alert / search / chase / attack / hit / death 对应独立声组，位置声像与距离衰减 |
| 动物 | CC0 狗类真实低吼变体用于当前狼类与野兽反馈；林间鸟声来自自然公园实录 |
| 门与动作 | open / close / locked / blocked / break，弹匣、枪机、拾取、搜索、治疗、维修和水声反馈 |
| 声学空间 | 小房间、大房间、走廊、地下、室外、森林，6 个不同预延迟/衰减/滤波的卷积 impulse；按 POI 类型、名称、长宽比与区域选择 |
| 雨与水下 | 实录雨声、屋顶滤波层及低音量屋顶敲击；水下整体 650 Hz 低通 |
| 车辆与手电 | 采样引擎随速度交叉调整音高、增益与滤波；手电 on/off 开关声；`flashlight-low` 提供限流低电提示 |

真实世界目前没有独立手电电量字段，因此低电提示只在显式 `sound.kind='flashlight-low'`，或存在 `flashlight` 物品且 durability < 15 时触发。这里没有为已有无限电量手电凭空增加隐藏的耗电规则。

六种混响为项目原创算法生成的 impulse，区别来自空间延迟与吸声特征。地下/地铁/矿井入口按现有 POI 中文名称识别；走廊由明确命名或长宽比识别，未把普通方形房间假定为走廊。

## 中文语音集成

```ts
import { NARRATIVE_AUDIO } from "../../narrative/content";
import { DIALOGUE_DURATIONS } from "../../audio/dialogue-durations";

const line = NARRATIVE_AUDIO[audioId];
await audio.playDialogue({
  id: audioId,
  text: line.text,
  speaker: line.speaker,
  radio: line.delivery === "radio" || line.delivery === "log",
  position: sourcePosition,
});
const duration = DIALOGUE_DURATIONS[audioId];
// 暂停页面或设置菜单保留句内位置：
audio.pauseDialogue();
await audio.resumeDialogue();
// 跳过、离开或被更高优先级序列中断时清除整句：
audio.stopDialogue();
```

`playDialogue()` 返回是否开始播放。音频与字幕应同时触发，序列使用生成后的时长串行安排，避免旧的固定 6 秒字幕截断实际 12–30 秒语音。单独 `dialogue` cue 不应再次播放对应 `audio` cue 已启动的语音。

广播使用 3.8 kHz 低通；直接对白可空间化。对白播放期间环境总线压至 48%。`pauseDialogue()` 记录样本偏移，`resumeDialogue()` 从断点继续，暂停期间不消耗音频时间；`playDialogue()` 也支持 `offsetSeconds`。`stopDialogue()` 的序号令牌会丢弃稍后完成下载的旧语音，防止跳过后再次出声。若本地文件确实加载失败，允许浏览器已安装的本地中文 Web Speech voice 作为可访问性回退；没有可用语音时返回 false，由字幕保留信息。没有导出或分发 macOS/Windows 系统语音。

`audio.diagnostics()` 返回 activeVoices / loops / loaded / failed / decodedBytes / space / dialogue / dialoguePaused / dialogueOffset，供真实浏览器验收观察。

## 许可和来源附录

所有外部音效均选择 CC0-1.0。包含多许可时，明确选择来源单独提供的 CC0 选项。原始来源、作者、下载地址、源文件 SHA-256、输出 SHA-256、裁切与滤波方式逐文件记录在 `public/audio/manifest.json`。许可核验记录与原始 Kenney 许可放在 `public/audio/licenses/`。

| 素材 | 作者 | 许可 / 原始页面 |
| --- | --- | --- |
| Impact Sounds | Kenney | CC0 · https://kenney.nl/assets/impact-sounds |
| RPG Audio | Kenney | CC0 · https://kenney.nl/assets/rpg-audio |
| Sci-fi Sounds（爆炸和雷鸣设计层） | Kenney | CC0 · https://kenney.nl/assets/sci-fi-sounds |
| The Free Firearm Sound Library | Ben Jaszczak、Brian Nelson、Kevin Heras、Matthew Nanney | CC0 · https://opengameart.org/content/the-free-firearm-sound-library |
| Zombies Sound Pack | artisticdude | CC0 · https://opengameart.org/content/zombies-sound-pack |
| Rain (loopable) | Ylmir | CC0 · https://opengameart.org/content/rain-loopable |
| Park ambiences | Thimras | CC0 · https://opengameart.org/content/park-ambiences |
| Engine/Mechanic working sound | jwiese | CC0（来源同时提供 CC-BY 3.0）· https://opengameart.org/content/enginemechanic-working-sound |
| 40 CC0 water / splash / slime SFX | rubberduck | CC0 · https://opengameart.org/content/40-cc0-water-splash-slime-sfx |
| Dog Snarl Grunt Grumble | qubodup | CC0 · https://opengameart.org/content/dog-snarl-grunt-grumble |
| Kokoro-82M-v1.1-zh 及中文模型声音 | hexgrad；中文数据由 LongMaoData 授予宽松使用 | Apache-2.0 · https://huggingface.co/hexgrad/Kokoro-82M-v1.1-zh |

模型固定 revision `01e7505bd6a7a2ac4975463114c3a7650a9f7218`；模型 SHA-256 `b1d8410fa44dfb5c15471fd6c4225ea6b4e9ac7fa03c98e8bea47a9928476e2b`。声音向量文件 hash、完整原创文本、作者角色、处理方式和输出 hash 记录在 `public/audio/dialogue/manifest.json`。模型卡和 Apache 许可已留档。本次没有使用 Piper huayan，其模型卡将训练数据许可标为 Unknown。

## 生成与验证

项目 `package.json`、全局 Python/npm 环境未变更。制作依赖仅在被 Git 忽略的 `output/audio-tools` 私有 Python 3.12 venv：Kokoro、misaki[zh]、PyTorch、numpy、soundfile、imageio-ffmpeg。下载的源素材与模型在 `output/audio-source`，同样不会进入发布包。

```sh
# 用已有 source cache 重建音效；加 --download 可重新下载来源。
output/audio-tools/bin/python scripts/prepare-audio.py
# 读取当前 src/narrative/content.ts 并生成原创对白，更新 catalog 与 duration。
output/audio-tools/bin/python scripts/generate-audio-dialogue.py
# 对每个发布文件真正解码，检查 hash、有限采样、峰值、时长。
output/audio-tools/bin/python scripts/verify-audio.py
npx vitest run tests/audio.test.ts tests/phase2-audio.test.ts
npx eslint src/audio tests/phase2-audio.test.ts
npx tsc --noEmit
```

2026-09-09 验证：149 个 MP3 全部实际解码通过；总时长 1007.22 秒，所有峰值 ≤ -2.02 dBFS，对白峰值 ≤ -3.20 dBFS。主输出另有 -9 dB 阈值动态压缩与 0.78 输出余量。12 项音频单元测试通过，覆盖旧版 Firefox Listener 回退、资产许可/完整性、对白时长和文字匹配、材质与武器路由、姿态负重、6 类空间、冷却变体、36 声部上限、完整释放，以及跳过后异步语音不得恢复、多次暂停与按偏移接续、下载中暂停。TypeScript 与音频 ESLint 已通过。

本子任务未夺取父任务浏览器焦点；游戏内实际试听、各场景混音平衡与全流程过场验收由父任务统一完成。数字峰值检查不能替代耳机或扬声器上的主观听感验收。
