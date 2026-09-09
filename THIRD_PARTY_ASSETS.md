# 素材来源与授权

第一阶段的程序化模型、植被图集、备用材质、物品图标和合成音效由本项目生成。第二阶段开始引入以下授权明确的模型、动画与摄影纹理，并随游戏本地分发。

| Asset | Author | Source | License | Local files |
| --- | --- | --- | --- | --- |
| Forest Ground 04 | Rob Tuytel; Rico Cilliers | [Asset page](https://polyhaven.com/a/forest_ground_04) | CC0-1.0 | public/textures/forest_ground_04/ |
| Bark Brown 02 | Rob Tuytel | [Asset page](https://polyhaven.com/a/bark_brown_02) | CC0-1.0 | public/textures/bark_brown_02/ |
| Asphalt 02 | Rob Tuytel | [Asset page](https://polyhaven.com/a/asphalt_02) | CC0-1.0 | public/textures/asphalt_02/ |
| Concrete Wall 003 | Dimitrios Savva; Rico Cilliers | [Asset page](https://polyhaven.com/a/concrete_wall_003) | CC0-1.0 | public/textures/concrete_wall_003/ |
| Denim Fabric 06 | Greg Zaal; Rico Cilliers | [Asset page](https://polyhaven.com/a/denim_fabric_06) | CC0-1.0 | public/textures/denim_fabric_06/ |

原作者与许可证由 [Poly Haven 授权页](https://polyhaven.com/license) 和素材元数据验证。每个文件的下载地址、作者、MD5、大小记录于 public/textures/manifest.json。下载脚本 scripts/fetch-assets.mjs 验证所有原始文件校验和。

Powered by Poly Haven. Poly Haven 的素材是免费公共领域资源，独立于本项目提供。

## 第二阶段角色与动画

| Asset | Type | Author | Source | License | Modification / Usage |
| --- | --- | --- | --- | --- | --- |
| Universal Base Characters, Standard | 人体模型、骨架与皮肤纹理 | Quaternius | [作者页面](https://quaternius.com/packs/universalbasecharacters.html) | CC0-1.0 | 采用免费 Standard 包。按骨骼权重划分衣物与第一人称部位，适度扩展衣物表面，生成两档 LOD；用于玩家身体、双手及世界人物。 |
| Universal Animation Library, Standard | 人形动作 | Quaternius；动画合作 Gonzalo Furnier | [作者页面](https://quaternius.com/packs/universalanimationlibrary.html) | CC0-1.0 | 采用免费 Standard 包，选择实际使用的动作，按目标角色绑定姿态重定向，重采样并独立打包；用于移动、交互、攻击与死亡。 |
| Universal Animation Library 2, Standard | 人形动作 | Quaternius；动画合作 Gonzalo Furnier | [作者页面](https://quaternius.itch.io/universal-animation-library-2) | CC0-1.0 | 采用免费 Standard 包；用于感染者步态、攀越、倒地起身、消耗物品及设施动作。 |

未购买或使用上述包的付费 Pro / Source 内容。模型与动画的作者声明和下载包内 `License.txt` 一并核验。输出文件的 SHA-256、尺寸、三角形和动作列表记录于 `public/assets/characters/manifest.json`，原许可保存于同目录 `LICENSE.txt`。模型处理脚本为 `scripts/prepare-characters.mjs`；颜色纹理使用 WebP，法线使用无损 WebP，高低档分别限制为 1024 / 512 像素。感染者肤色、受击、IK 与动作混合由本项目运行时代码完成。

## Engine and runtime

- Babylon.js: Apache-2.0, [Babylon.js](https://github.com/BabylonJS/Babylon.js). 使用 npm 分发，具体版本锁定于 package-lock.json。
- Babylon.js 附带的 glslang / twgsl WebAssembly 编译器从安装包原样复制到 public/vendor，确保 WebGPU 着色器转换无需 CDN。各上游许可保留于 public/vendor/NOTICES.md。
- 系统字体：由操作系统提供，本项目未分发商业字体文件。

## 第二阶段补充资产索引（2026-09-09）

以下索引补全环境、动物、武器和声音来源；保留上方既有摄影纹理、角色/动画和运行时历史。此次文件完整性核对见 [资产审计](docs/phase2/ASSET_AUDIT.md)。外部资产均保留作者与许可来源，改色、重定向、拆件、减面或转码不代表原资产由本项目原创，也不代表原作者为本项目背书。

### 环境模型与摄影枝叶

下表均为 Poly Haven 的 CC0-1.0 资产。其[官方许可](https://polyhaven.com/license)明确涵盖模型和纹理的商业使用与分发；此许可不扩展到网站商标、用户头像或展示渲染图。项目分发的是处理后的模型/纹理，而非 Poly Haven 网站图片。

| 原始资产 | 作者 | 修改 | 用途与本地输出 |
| --- | --- | --- | --- |
| [Fern 02](https://polyhaven.com/a/fern_02) | Rob Tuytel；Rico Cilliers | 选择单株、减面、焊接、两档 LOD、WebP PBR 纹理 | 林地和道路边缘蕨类；`public/assets/environment/fern-{high,low}.glb` |
| [Rock Moss Set 01](https://polyhaven.com/a/rock_moss_set_01) | Kless Gyzen | 选择石块、合并兼容材质、两档 LOD、纹理缩放 | 苔石和地表层次；`rocks-{high,low}.glb` |
| [Painted Wooden Chair 01](https://polyhaven.com/a/painted_wooden_chair_01) | Kuutti Siitonen | 两档 LOD、PBR 纹理转换 | 废弃房间座椅；`chair-{high,low}.glb` |
| [Painted Wooden Table](https://polyhaven.com/a/painted_wooden_table) | Kirill Sannikov | 两档 LOD、PBR 纹理转换 | 房间桌面与叙事物件支撑；`table-{high,low}.glb` |
| [Trashbag](https://polyhaven.com/a/trashbag) | Benny Weimer | 减面、两档 LOD、纹理缩放 | 建筑边缘垃圾；`trash-{high,low}.glb` |
| [Barrel 03](https://polyhaven.com/a/barrel_03) | Serhii Khromov | 减面、两档 LOD、纹理缩放 | 工业和军用储油桶；`barrel-{high,low}.glb` |
| [Metal Jerrycan Green](https://polyhaven.com/a/metal_jerrycan_green) | Ulan Cabanilla | 减面、两档 LOD、纹理缩放 | 备用燃料与维修布景；`jerrycan-{high,low}.glb` |
| [Cardboard Box 01](https://polyhaven.com/a/cardboard_box_01) | Rahul Chaudhary | 减面、两档 LOD、纹理缩放 | 开口纸箱与撤离物资；`carton-{high,low}.glb` |
| [Adjustable Wrench](https://polyhaven.com/a/adjustable_wrench) | Mateusz Sadek | 减面、两档 LOD、纹理缩放 | 维修台工具；`wrench-{high,low}.glb` |
| [Portable Generator](https://polyhaven.com/a/portable_generator) | James Ray Cock | 减面、两档 LOD、纹理缩放；运行时将小块玻璃改为 alpha / clear coat，避免全场景折射 pass | 工业/设施备用发电机；`generator-{high,low}.glb` |
| [Pine Tree 01](https://polyhaven.com/a/pine_tree_01) | Rob Tuytel；Rico Cilliers | 仅提取源缓冲区前段的树干/枝条；不分发原高密度针叶几何；使用作者针叶照片重做枝叶 alpha 图集与三档树冠 | `pine-wood-{high,low}.glb`；`public/textures/phase2-environment/pine-{twig,bough}.webp` |

除显式标出的纹理目录外，上表模型均位于 `public/assets/environment/`。完整作者角色、原始 API/素材页、源缓冲区记录、逐文件 SHA-256 和修改说明见 [环境清单](public/assets/environment/manifest.json)与 [LICENSE](public/assets/environment/LICENSE.txt)，场景用途见 [ENVIRONMENT.md](docs/phase2/ENVIRONMENT.md)。高档纹理按物体限制在 256–1024 px，低档最多 256 px；原始松树只获取前 3,175,876 bytes，清单中的该源 hash 对应所获取前段，不是 948,849,556-byte 完整源缓冲区的 hash。

### 动物模型、纹理、骨架与动作

| 原始资产 | 作者 / 许可 | 修改 | 用途与输出 |
| --- | --- | --- | --- |
| Stag、Wolf，来自 [Ultimate Animated Animal Pack](https://quaternius.com/packs/ultimateanimatedanimals.html) | Quaternius；CC0-1.0；[作者发布说明](https://www.patreon.com/quaternius/posts/ultimate-animals-53427821) | 保留原模型、骨架和核心动作；克制调整毛色，增加细毛表面；生成 LOD、动作独立打包；烘焙脚底与死亡落地校正 | 鹿、狼的移动、攻击、受击、进食和死亡；`public/assets/animals/{deer,wolf}-{high,low,motion}.glb` |
| [Boar](https://opengameart.org/content/boar) | Teh_Bucket；CC0-1.0 | 原作者模型、手绘纹理、四足骨架及 Walk/Attack；应用原修饰器、选择最终 UVMap、烘焙 IK；Run 为 Walk 重定时；Idle 补呼吸，Hit/HitAlt/Death 为本项目补充动作 | 野猪及其四足动作；`public/assets/animals/boar-{high,low,motion}.glb` |

作者原始动作与项目新增动作不能混称为原作者动画。详细来源文件、直接下载地址、输入/输出 SHA-256 与逐动作 provenance 见 [动物清单](public/assets/animals/manifest.json)、[LICENSE](public/assets/animals/LICENSE.txt)及 [ANIMALS.md](docs/phase2/ANIMALS.md)。没有把低多边形模型称为扫描动物。

### 第一人称枪械

五个模型均来自 Quaternius 的 [Ultimate Guns Pack](https://quaternius.com/packs/ultimategun.html)，通过作者页面链接的[公开下载目录](https://drive.google.com/drive/folders/12V-mHNB6bnW2WzgpJfRBQd-TG4pOO3yx)取得 OBJ/MTL，许可 CC0-1.0。

| 原始文件 | 游戏用途 | 修改与保留部件 |
| --- | --- | --- |
| Pistol_2.obj / .mtl | pistol、pistol45 | 保留滑套/准星/护圈，拆分滑套，补充适配握把的弹匣插入体与底板 |
| AssaultRifle_2.obj / .mtl | military | 保留木托、木护木、曲形弹匣；弹匣按原拓扑拆出，补充可动枪机面/拉机柄 |
| SniperRifle_6.obj / .mtl | rifle 民用猎枪 | 保留木托、原作者拉机柄/枪机和可选镜体；补充机械准星及支座 |
| Shotgun_3.obj / .mtl | shotgun | 保留管式枪身、木托和独立泵把，补充枪机面 |
| SubmachineGun_3.obj / .mtl | smg | 保留伸缩托、前握把、直弹匣；拆分弹匣并补充可动枪机小件 |

共同修改为凹多边形三角化、保留原法线和轮廓、低饱和 PBR 材质、项目生成的微表面纹理、兼容现有手模型的厚度/尺度调整、本地 +Z 枪口与握持锚点、焊接和去重。没有分发其他作者的贴图或付费资源。

产物位于 `public/assets/weapons/`；[公开许可清单](public/assets/weapons/manifest.json)保存作者、原始输入/输出 SHA-256 和变更说明，[原包 LICENSE](public/assets/weapons/LICENSE.txt)原样保留。`src/data/weapon-assets.json` 只是精简运行时元数据，不替代公开的来源/许可清单。用途和部件接口见 [WEAPONS.md](docs/phase2/WEAPONS.md)。

### 采样音效

下表全部明确选择 **CC0-1.0**。源同时列出 CC-BY 选项时，本项目选用来源单独提供的 CC0 选项。原始采样按需裁切、去前后静音、转为单声道 24 kHz MP3、处理峰值/滤波/循环接缝，再由本项目混音器组合；不将这些外部录音标为项目原创。

| 原始声音包 | 作者 | 文件数 | 修改与游戏用途 |
| --- | --- | ---: | --- |
| [Impact Sounds](https://kenney.nl/assets/impact-sounds) | Kenney | 36 | 按木、金属、混凝土、泥土、玻璃与肉体等材质组织脚步和命中采样 |
| [RPG Audio](https://kenney.nl/assets/rpg-audio) | Kenney Vleugels / Kenney | 22 | 门、锁扣、衣物、装备动作、近战挥动与轻量提示拟音 |
| [Sci-fi Sounds](https://kenney.nl/assets/sci-fi-sounds) | Kenney | 3 | 爆炸和低频雷鸣设计层；不将合成爆炸称为雷电实录 |
| [The Free Firearm Sound Library](https://opengameart.org/content/the-free-firearm-sound-library) | Ben Jaszczak；Brian Nelson；Kevin Heras；Matthew Nanney | 12 | 真实手枪、步枪、霰弹枪录音拆为枪口与尾音，叠加机械层与环境反射 |
| [Zombies Sound Pack](https://opengameart.org/content/zombies-sound-pack) | artisticdude | 18 | 感染者 idle、alert、search、chase、attack、hit、death 分组 |
| [Park ambiences](https://opengameart.org/content/park-ambiences) | Thimras | 4 | 公园风和鸟类实录裁成环境循环与远处鸟声 |
| [Rain (loopable)](https://opengameart.org/content/rain-loopable) | Ylmir | 2 | 实录雨声，屋顶/室外滤波与循环接缝处理 |
| [Engine/Mechanic working sound](https://opengameart.org/content/enginemechanic-working-sound) | jwiese | 1 | 引擎循环，速度相关音高、音量和滤波；来源同时提供 CC-BY 3.0 与 CC0，本项目选择 CC0 |
| [40 CC0 water / splash / slime SFX](https://opengameart.org/content/40-cc0-water-splash-slime-sfx) | rubberduck | 3 | 水面脚步与水花 |
| [Dog Snarl Grunt Grumble](https://opengameart.org/content/dog-snarl-grunt-grumble) | qubodup | 3 | 真实狗类低吼变体，作为狼类/野兽声音设计来源；不将其声称为独立野猪或鹿实录 |

104 个输出 MP3 逐文件记录作者、素材页、下载地址、原文件名、源 SHA-256、输出 SHA-256、处理方式、时长与峰值：[音效清单](public/audio/manifest.json)。Kenney 原许可、来源页面/下载包核验索引见 [public/audio/licenses/](public/audio/licenses/)。六类声学空间的卷积 impulse、限流、变体与混音逻辑由本项目制作，说明见 [AUDIO.md](docs/phase2/AUDIO.md)。

### 原创中文文本与合成配音

45 条中文台词来自本项目 [NARRATIVE_AUDIO](src/narrative/content.ts)，覆盖开局、广播、调查日志、人物对话、任务回报与多结局。没有采用影视对白、商业系统语音导出或指定真实人物的仿声。

- 制作模型与声音向量：[hexgrad / Kokoro-82M-v1.1-zh](https://huggingface.co/hexgrad/Kokoro-82M-v1.1-zh)，Apache-2.0。中文数据由 LongMaoData 提供，模型作者在[固定版本模型卡](https://huggingface.co/hexgrad/Kokoro-82M-v1.1-zh/blob/01e7505bd6a7a2ac4975463114c3a7650a9f7218/README.md)说明其取得了宽松使用授权。
- 固定 revision：`01e7505bd6a7a2ac4975463114c3a7650a9f7218`；模型 SHA-256：`b1d8410fa44dfb5c15471fd6c4225ea6b4e9ac7fa03c98e8bea47a9928476e2b`。
- 使用中文女声 `zf_001`、男声 `zm_010`；在本地对原创文本按说话人分段合成，规范化读音、停顿、24 kHz 单声道、滤波和峰值余量，输出 MP3。属于合成配音，不是真人演员演出。
- 输出：`public/audio/dialogue/*.mp3`。模型许可、声音向量 hash、原始文字与文字 hash、输出 hash、角色及逐条时长见 [配音清单](public/audio/dialogue/manifest.json)；[Apache 2.0 文本](public/audio/licenses/Kokoro-Apache-2.0.txt)和[模型卡留档](public/audio/licenses/Kokoro-model-card.md)随项目保留。

Apache-2.0 在此记录的是制作模型/软件的上游许可；这批配音不属于上表 CC0 实录采样。制作模型及 Python 工具环境位于被忽略的离线缓存，未作为游戏运行时资产分发。浏览器系统语音仅可作为本地可访问性回退，不导出或随包分发。候选 Piper huayan 因模型卡中的训练数据许可为 Unknown 而未被采用。

### 项目制作部分与审计边界

原程序化备用模型/合成音效、建筑壳体、开场侧翻撤离车、环境小物件、材质微表面、混响 impulse、角色 IK/混合和明确标注的补充动物动作属于本项目制作或对已列资源的改编。它们不需要凭空新增外部素材来源，也不能掩盖作为基础的外部模型/纹理/录音。

作者、许可、修改、用途与当前文件完整性已汇总到 [ASSET_AUDIT.md](docs/phase2/ASSET_AUDIT.md)。该审计不宣告游戏整体阶段完成，也不替代实机美术、听感、动画或交互验收。
