# 第二阶段资产来源与文件完整性审计

审计快照：**2026-09-09T05:10:21+08:00（Asia/Shanghai）**。范围为当前工作目录中的角色/动画、动物、枪械、环境、音效、中文配音，以及既有摄影纹理与随包许可。此文档只记录资产来源和文件完整性，不宣告 `goal2.md` 或整体第二阶段完成。

## 结论

- **195 / 195 个新增资源**的文件存在性、实际字节数、SHA-256 与公开 manifest 完全一致，合计 **26,016,170 bytes**。包含 44 个 GLB、149 个 MP3、2 个 WebP；未发现缺失文件、大小不符或 hash 漂移。
- **15 / 15 个既有摄影纹理**的 MD5 和字节数与 `public/textures/manifest.json` 一致，合计 11,225,322 bytes。
- 已采用的外部模型、动画、环境与采样音效均有 **CC0-1.0** 来源；Kokoro 制作模型/声音向量为 **Apache-2.0**。根据作者公开声明、项目来源清单及本地许可文本，本轮**未发现许可不明的已采用第三方资源**。
- `src/data/weapon-assets.json` 与 `public/assets/weapons/manifest.json` 的全部共享字段一致。前者是运行时精简数据；本审计使用后者的完整来源和资产 hash，未混淆两份清单。
- 唯一未登记在六份资产 manifest 中的媒体文件是项目生成的 `public/assets/weapons/inspection.png`。它是明确标注的几何检查图，非游戏截图、非第三方网站预览；其当前 hash 已另记于本报告。

## 核对方法与结果

逐项读取 manifest 的 `files` 或 `assets`，解析当前发布路径，重新读取文件 bytes 并计算 SHA-256，不接受只读取清单自报 hash 的结果。环境清单中 `/textures/...` 的路径按项目 `public/` 根目录解析。另扫描对应发布目录中的 GLB/glTF/bin/MP3/OGG/WAV/PNG/JPG/WebP，检查是否存在未登记媒体。

| 类别 | 文件数 | 实际 bytes | 大小与 SHA-256 | 类型 |
| --- | ---: | ---: | --- | --- |
| 角色与人形动画 | 8 | 9,073,608 | 8/8 | 8 .glb |
| 动物模型与动画 | 9 | 1,497,612 | 9/9 | 9 .glb |
| 枪械模型 | 5 | 688,492 | 5/5 | 5 .glb |
| 环境模型与摄影枝叶 | 24 | 6,464,862 | 24/24 | 22 .glb、2 .webp |
| 采样音效 | 104 | 1,381,072 | 104/104 | 104 .mp3 |
| 原创中文合成配音 | 45 | 6,910,524 | 45/45 | 45 .mp3 |
| 新增资源合计 | 195 | 26,016,170 | 195/195 | 44 GLB、149 MP3、2 WebP |

以上数字不包括 JSON、许可文本和检查图，不等于整个游戏发布包体积。已有摄影纹理单独核对；没有把私有模型权重、原始下载包或离线 Python 工具环境计入游戏资源。

本次 195 行 `路径|bytes|实际SHA-256\n` 按项目相对路径排序后形成的快照 SHA-256：

`e76b13b95c02e4bd110081c7b1cecdc30d37bca0cc6b0b6915a82d4b2876b622`

### 使用的公开清单

| manifest | 当前 SHA-256 |
| --- | --- |
| [public/assets/characters/manifest.json](../../public/assets/characters/manifest.json) | `94e7783dbca683d66f6acd89114ea87b73633faa188df021e9c013eae8ef0d36` |
| [public/assets/animals/manifest.json](../../public/assets/animals/manifest.json) | `ac6ee47c967491b3480bd290b12df4ee484dfb1da1011435d8e0cc7839a4e53c` |
| [public/assets/weapons/manifest.json](../../public/assets/weapons/manifest.json) | `4487d3774ff7ed64767cd65d165d3fc6a89fb1c4d653ac47325047a0b0efbc87` |
| [public/assets/environment/manifest.json](../../public/assets/environment/manifest.json) | `527ceaa5fdab3b3353e81feabb2ed791671fb93d375492d56540310d474dfc0c` |
| [public/audio/manifest.json](../../public/audio/manifest.json) | `89a8b90c7e395a446ad18d388cd0a632d6a627991599cb8f29c36e862d0e69a6` |
| [public/audio/dialogue/manifest.json](../../public/audio/dialogue/manifest.json) | `887648ebc1490a995c3e81af80cd1dedda9e7d86d230ed217b5f38969744cab6` |

## 作者、原始来源、许可、修改和用途

完整整合索引位于 [THIRD_PARTY_ASSETS.md](../../THIRD_PARTY_ASSETS.md)，原有摄影纹理、角色/动画和运行时条目均保留，新增环境、动物、枪械、采样音效和中文合成配音条目。细节与各子系统说明交叉核对：

| 类别 | 上游与授权 | 已核对的改编归属与用途 | 明细 |
| --- | --- | --- | --- |
| 人体模型 | Quaternius Universal Base Characters，免费 Standard，CC0 | 原人体、骨架和皮肤纹理；项目进行衣物表面划分、局部扩展、手臂/身体提取和 LOD；用于玩家、NPC 与感染者 | [角色 manifest](../../public/assets/characters/manifest.json)、[作者页面](https://quaternius.com/packs/universalbasecharacters.html) |
| 人形动画 | Quaternius；动画合作 Gonzalo Furnier；UAL 1/2 Standard，CC0 | 保留作者动作来源；项目筛选、重定向、重采样与混合；用于移动、交互、战斗和设施操作 | [UAL 1 作者说明](https://quaternius.itch.io/universal-animation-library)、[UAL 2 作者说明](https://quaternius.itch.io/universal-animation-library-2) |
| 鹿与狼 | Quaternius Ultimate Animated Animal Pack，CC0 | 原模型、骨架与主要动作；项目色彩、LOD、接触时刻与落地修正 | [ANIMALS.md](ANIMALS.md)、[作者页面](https://quaternius.com/packs/ultimateanimatedanimals.html) |
| 野猪 | Teh_Bucket Boar，CC0 | 原模型、手绘纹理、骨架和 Walk/Attack；Run 为重定时，Hit/HitAlt/Death 为项目新增，不混称原作者动作 | [作者页面](https://opengameart.org/content/boar)、[动物 manifest](../../public/assets/animals/manifest.json) |
| 枪械 | Quaternius Ultimate Guns，CC0 | 原枪型、部件轮廓与 MTL；项目三角化、拆件、PBR、拟合弹匣/枪机小件和锚点；5 类装备对应 5 个 GLB | [WEAPONS.md](WEAPONS.md)、[作者页面](https://quaternius.com/packs/ultimategun.html) |
| 环境模型与摄影纹理 | Poly Haven 的 11 个模型/枝叶源与既有 5 个纹理源，CC0 | 选择扫描部件、减面、LOD、PBR 转码；松针摄影图像组成新枝叶图集；用于森林和室内/工业布景 | [ENVIRONMENT.md](ENVIRONMENT.md)、[官方许可](https://polyhaven.com/license)、[环境 manifest](../../public/assets/environment/manifest.json) |
| 104 条采样音效 | Kenney、Ben Jaszczak/Brian Nelson/Kevin Heras/Matthew Nanney、artisticdude、Thimras、Ylmir、jwiese、rubberduck、qubodup；CC0 | 外部录音或设计音效按组裁切、归一、转码并混音；没有把狗类低吼称为独立野猪/鹿实录，也没有把合成爆炸称为雷电实录 | [AUDIO.md](AUDIO.md)、[逐采样来源](../../public/audio/manifest.json)、[来源核验索引](../../public/audio/licenses/sources.json) |
| 45 条中文配音 | 原创项目台词；hexgrad Kokoro-82M-v1.1-zh 模型/声音向量，Apache-2.0 | 两个中文声音本地合成，按角色分段、读音处理、滤波与峰值余量；用于广播、日志、对话与结局 | [配音 manifest](../../public/audio/dialogue/manifest.json)、[固定模型卡](https://huggingface.co/hexgrad/Kokoro-82M-v1.1-zh/blob/01e7505bd6a7a2ac4975463114c3a7650a9f7218/README.md) |

### 来源声明交叉核对

本轮重新读取 Quaternius 人体/UAL 1/UAL 2/动物官方页面及 Teh_Bucket 发布页，均明确列出 CC0；UAL 1/2 官方页面同时署名 Gonzalo Furnier，并区分免费 Standard 与付费版本。沿用的角色条目没有被改写为付费内容来源。

Poly Haven 官方许可明确覆盖模型、摄影纹理及商用/分发；其网站展示图片与商标不在该资产授权范围。通过官方 `api.polyhaven.com/info/{id}` 逐个核对 **16 / 16** 个模型/纹理源的作者姓名集合，与 manifest 一致。

中文配音采用固定 revision `01e7505bd6a7a2ac4975463114c3a7650a9f7218`。当前私有制作缓存中的模型文件及 `zf_001.pt`、`zm_010.pt` 三项 hash 也与配音 manifest 一致。模型 SHA-256 为 `b1d8410fa44dfb5c15471fd6c4225ea6b4e9ac7fa03c98e8bea47a9928476e2b`。中文数据授权依据模型作者对 LongMaoData 的公开说明；Apache-2.0 记录制作模型/软件的上游许可，不将这批原创台词的合成输出误标成 CC0 实录采样。

## 差异、缺项与边界

| 项目 | 本轮结果 | 处理/说明 |
| --- | --- | --- |
| 已登记输出缺失、字节差异、hash 漂移 | **0 项** | 195 项 SHA-256 与大小一致，15 项历史纹理 MD5 与大小一致 |
| 已采用第三方资源许可不明 | **0 项** | 已有作者/公开来源/CC0 或 Apache 许可依据；未采用许可为 Unknown 的 Piper huayan 候选 |
| 未登记媒体 | 1 张项目几何检查图 | `public/assets/weapons/inspection.png`，254,811 bytes，SHA-256 `9e40aa0cdaa0603f621573905a7275936e9aa11f1e57ff56dab4142e7600b9d5`；是文档检查产物，非未申报第三方素材 |
| 角色输入追溯粒度 | 包级来源已记录，单份输入文件 hash/直接下载 URL 未列入该 manifest | 不影响本轮 8 个输出的核验，许可也明确；但不把它描述为已完成与音效/枪械同等粒度的逐输入校验 |
| 松树输入 hash 的范围 | 仅获取的前 3,175,876 bytes | 按原清单解释为源缓冲区前段 hash；未声称核对了 948,849,556-byte 完整输入 |
| 武器两份 JSON | 共享字段无差异 | runtime 精简清单供游戏读取，public manifest 继续承担公开来源/许可/文件 hash |
| 真实视觉/听感验收 | 不在本次文档审计范围 | 本次没有重跑游戏、重导出模型、重生成音频或改业务/测试；文件 hash 匹配不证明画面/听感质量 |

## 当前文件逐项实算记录

下面的 SHA-256 来自本轮实际读取的文件内容，已逐行与对应公开 manifest 比较。所有表内文件的字节数也一致；expected hash 与 actual hash 相同，因此不重复两列。完整音效作者与逐段配音文字仍以对应 manifest 为准。

### 角色与人形动画

| 当前文件 | bytes | 实算 SHA-256（与清单一致） |
| --- | ---: | --- |
| [assets/characters/survivor-male-motion.glb](../../public/assets/characters/survivor-male-motion.glb) | 1663044 | `7e4a5ab839c834cf6b440b4f44bac14881f9abcc92e1c94a1651c8a90499a822` |
| [assets/characters/survivor-player-arms.glb](../../public/assets/characters/survivor-player-arms.glb) | 1031064 | `75e7764cdc71a371da82270b5b9f3e5bd815bcc643f28b06ec100d6fd90127b6` |
| [assets/characters/survivor-player-body.glb](../../public/assets/characters/survivor-player-body.glb) | 155016 | `c7752917391a2e0a288bceecb1e72341fd15e4171c6b54ee10db55cac86ff2e2` |
| [assets/characters/survivor-male-high.glb](../../public/assets/characters/survivor-male-high.glb) | 1389232 | `746ee18a6db99bbc080e5629942e1fe90b58f1ca07519f23c3cd31047c22fe4a` |
| [assets/characters/survivor-male-low.glb](../../public/assets/characters/survivor-male-low.glb) | 926464 | `e042767c1fbd4fe4273edb53ed421835dd03ec6aeba57f7fd9ab0156dc59dfeb` |
| [assets/characters/survivor-female-motion.glb](../../public/assets/characters/survivor-female-motion.glb) | 1664764 | `0d01fff908f3cee955915507b5de832179a6faab308b61c0a65e1f89265f7bc0` |
| [assets/characters/survivor-female-high.glb](../../public/assets/characters/survivor-female-high.glb) | 1307440 | `4907c6bc890e82bf30a6aa49ffaf58e85ae8e59b43d90462bc48972e0811cf13` |
| [assets/characters/survivor-female-low.glb](../../public/assets/characters/survivor-female-low.glb) | 936584 | `72556199cc6e76961517a842fe377df51907d2e2a8ca55d8b97c9cfaeae4af9a` |

### 动物模型与动画

| 当前文件 | bytes | 实算 SHA-256（与清单一致） |
| --- | ---: | --- |
| [assets/animals/deer-motion.glb](../../public/assets/animals/deer-motion.glb) | 346656 | `8c56fc75084e12813811305bedb541b1b0f6e4b6b48e91cd438bd7e8d54e9360` |
| [assets/animals/deer-high.glb](../../public/assets/animals/deer-high.glb) | 143608 | `1dac10d1723feb73c99b28464be2ced87e84eb9fd669a045770037aa938a19d5` |
| [assets/animals/deer-low.glb](../../public/assets/animals/deer-low.glb) | 117312 | `9620d6481fed3c2d4022f27f92d0e046e7a71a970e99fb711d67b84b72afb973` |
| [assets/animals/wolf-motion.glb](../../public/assets/animals/wolf-motion.glb) | 434036 | `88a8951ef7e5129038ea5635d37cca11ada9cf517884867bd79f732d55609b99` |
| [assets/animals/wolf-high.glb](../../public/assets/animals/wolf-high.glb) | 106056 | `bfa976752697129012a93d1713dc9ae28da8701a58bbd6ffbe7ac850457644ef` |
| [assets/animals/wolf-low.glb](../../public/assets/animals/wolf-low.glb) | 76936 | `73f622de774b30694c3af2f3143fde02738e8c472563a4595da13eae51113f2d` |
| [assets/animals/boar-motion.glb](../../public/assets/animals/boar-motion.glb) | 132596 | `71a456d0b1cd4b2266db9d514669d7263bd2e39f6ac05c90ad24c83a9a10c7e8` |
| [assets/animals/boar-high.glb](../../public/assets/animals/boar-high.glb) | 85812 | `02bc8035643947fc985ab97fe6605536e0f279ed1eadbf2f05de2b3f1b654ae0` |
| [assets/animals/boar-low.glb](../../public/assets/animals/boar-low.glb) | 54600 | `3ff5c16241fefa76f196445c266dadf3f13cc5ea2cf1d2aec21e464cbbd19a0e` |

### 枪械模型

| 当前文件 | bytes | 实算 SHA-256（与清单一致） |
| --- | ---: | --- |
| [assets/weapons/pistol.glb](../../public/assets/weapons/pistol.glb) | 137024 | `ada87923ab8985806da3999a938098b8a8d4b236032319fd82030e8e7972c3fe` |
| [assets/weapons/military.glb](../../public/assets/weapons/military.glb) | 144512 | `39530104dd45454766924927e565992df3ceb4e84a11703c50c77859bf1fd8c5` |
| [assets/weapons/rifle.glb](../../public/assets/weapons/rifle.glb) | 155212 | `b40b0ef45e2ed7f93afb885af011cc9b13995cfc8439782be3282ade3f8c2f14` |
| [assets/weapons/shotgun.glb](../../public/assets/weapons/shotgun.glb) | 120912 | `8332e2bef0d1c5f0b24e73a7328b455df17a3a43c5a038c79204d6af0ae91999` |
| [assets/weapons/smg.glb](../../public/assets/weapons/smg.glb) | 130832 | `a4ad9c52f0beeefcd44fa0c578e22f04bc5d11bbb689a0be4cee456f6606947d` |

### 环境模型与摄影枝叶

| 当前文件 | bytes | 实算 SHA-256（与清单一致） |
| --- | ---: | --- |
| [assets/environment/fern-high.glb](../../public/assets/environment/fern-high.glb) | 134496 | `06e68e33519ea8f1f895488fcc326679a93117ecda7c328c190ee0f4006e7f77` |
| [assets/environment/fern-low.glb](../../public/assets/environment/fern-low.glb) | 49112 | `86d9d63fbb209c3978884b8a80c255b6dad7954680bb13d2b859ca6c852930e7` |
| [assets/environment/rocks-high.glb](../../public/assets/environment/rocks-high.glb) | 499928 | `b1c044c3bad34755bce8da78bf7fbe9797195476ce46bd7f63452290cf8c7e64` |
| [assets/environment/rocks-low.glb](../../public/assets/environment/rocks-low.glb) | 54948 | `4a2eb261f5a726fd9d68d0f0dcd60956dfa8c15e00f82d45ba3a8d4e64d08f2f` |
| [assets/environment/chair-high.glb](../../public/assets/environment/chair-high.glb) | 128192 | `757e54cb632a3fb25067c4eb711703655cf8c4d4187a99417c4deb4b334e876a` |
| [assets/environment/chair-low.glb](../../public/assets/environment/chair-low.glb) | 57744 | `9a0ab10ccd83a19b5320d718035ab4d08fbe0e675a80dd522c80b97e213799bb` |
| [assets/environment/table-high.glb](../../public/assets/environment/table-high.glb) | 272432 | `9e7261c2ee02d05a847f177152c14d2e97a9e06a99e56b612001b4c6be347afb` |
| [assets/environment/table-low.glb](../../public/assets/environment/table-low.glb) | 38092 | `0c089eaf157e52b0f42fb2bfdc13f80534eebae71bcf6196fd24a771fed62dbb` |
| [assets/environment/trash-high.glb](../../public/assets/environment/trash-high.glb) | 199848 | `4883b7aeafc53828a3eb77ce9786322336f6c8deae6c2fe5e2f37a4ad8a80bc1` |
| [assets/environment/trash-low.glb](../../public/assets/environment/trash-low.glb) | 68932 | `d644f660dcb5e238a1717225f322c257dddcc402f084557a74230e83edea1f61` |
| [assets/environment/barrel-high.glb](../../public/assets/environment/barrel-high.glb) | 157164 | `5d92f49c246c702d3ec4b50c6119ab90b1fe985e836bc7789d05f50c79cecdf8` |
| [assets/environment/barrel-low.glb](../../public/assets/environment/barrel-low.glb) | 55048 | `ca26db619db5d875e1dcda8375be2a91d98c5a9c4c25ed539b6624068595ddf7` |
| [assets/environment/jerrycan-high.glb](../../public/assets/environment/jerrycan-high.glb) | 354912 | `3bd6ed34048382eea008ace5bb306f7437e96f336bc116d425da5282076f413f` |
| [assets/environment/jerrycan-low.glb](../../public/assets/environment/jerrycan-low.glb) | 116896 | `998c188bd86208fee846be913652a62a1594c29437a12e6f9155fd7de2f54ec8` |
| [assets/environment/carton-high.glb](../../public/assets/environment/carton-high.glb) | 257508 | `5b47c3c251c9391fd8cd6ec58bfbd594d5849135839c50a330fbb65dc5c63190` |
| [assets/environment/carton-low.glb](../../public/assets/environment/carton-low.glb) | 78192 | `643a7a7453cb96ef4acf5b0813c1159e5ef831261857d4b14ab309a972bf1b43` |
| [assets/environment/wrench-high.glb](../../public/assets/environment/wrench-high.glb) | 185600 | `49fd2bca4fdb7956eb5e224f3e02f29db4b2a06ad651c19f0421a37564f00820` |
| [assets/environment/wrench-low.glb](../../public/assets/environment/wrench-low.glb) | 102592 | `64adf56792779d6b3f9ec8d0e9c9ca02f73702c8ef5fad36fa9c5a84f5bb3918` |
| [assets/environment/generator-high.glb](../../public/assets/environment/generator-high.glb) | 1124260 | `c4dc1e0073f87546ca2e3767b67e6a53a98839d33ecfc12eaefd40f6559af82a` |
| [assets/environment/generator-low.glb](../../public/assets/environment/generator-low.glb) | 332304 | `7facb8bf978c85f5931b8248af73ac10773c7b0bd68a6f6f07ce5d4aee18bceb` |
| [assets/environment/pine-wood-high.glb](../../public/assets/environment/pine-wood-high.glb) | 1587308 | `bf7b1838a89b0b546a322e91e87799635042ae2588e0b8f7231a2e3ee60113a5` |
| [assets/environment/pine-wood-low.glb](../../public/assets/environment/pine-wood-low.glb) | 137332 | `96d12a768d480574acd9a30cbf0722d2e1d0894da8b33bfc30a90745d62f66e0` |
| [textures/phase2-environment/pine-twig.webp](../../public/textures/phase2-environment/pine-twig.webp) | 46892 | `7e581c1a1a59cd06598714c14375b4a62078df8eb701c12b72b67b421dae37da` |
| [textures/phase2-environment/pine-bough.webp](../../public/textures/phase2-environment/pine-bough.webp) | 425130 | `307cbeb183187f5068e3b0cfa04417a2e3bf9952eac6b5fb384e95ecf8a9bb4e` |

### 采样音效

| 当前文件 | bytes | 实算 SHA-256（与清单一致） |
| --- | ---: | --- |
| [audio/step-wood-0.mp3](../../public/audio/step-wood-0.mp3) | 3404 | `06ecaa6784c03b6c186e7a57aeb881af3a9e896d8df864e35d46599e24504792` |
| [audio/step-wood-1.mp3](../../public/audio/step-wood-1.mp3) | 2204 | `6433d5f07b5c5b38d8a1e80cc45893624bedf9015ee069bdf644cafbc2b0d738` |
| [audio/step-wood-2.mp3](../../public/audio/step-wood-2.mp3) | 2444 | `41049da1e2f08ae9a09d3906ca87cce8befd172ce69b13c7ea95ae7e3cbdac0c` |
| [audio/step-wood-3.mp3](../../public/audio/step-wood-3.mp3) | 3404 | `7475365ea875b2090087a68e3ed33756393411e004a02e08b48fa7249644e0a0` |
| [audio/step-concrete-0.mp3](../../public/audio/step-concrete-0.mp3) | 1964 | `a2ad0c27e2bbe52b1931f451757c574d27fb9d2816e74f01078f8091867ed288` |
| [audio/step-concrete-1.mp3](../../public/audio/step-concrete-1.mp3) | 1964 | `d34f3fde65d3a51a9e1329ca29d0d60160b116023c6467c2811c89e0f44c0237` |
| [audio/step-concrete-2.mp3](../../public/audio/step-concrete-2.mp3) | 1964 | `5943bcdd10e455f0bd1972884254d57bf5e0066e10cb7f81b95dadbe0b852566` |
| [audio/step-concrete-3.mp3](../../public/audio/step-concrete-3.mp3) | 1964 | `ab2c3502c9919deacca2ca40a508ea4eef720d4909b95f7eb483c49a44daf1ec` |
| [audio/step-dirt-0.mp3](../../public/audio/step-dirt-0.mp3) | 2684 | `587a1cc3e258e488527a6bedfc522adda5422415bafcea2fda397a097a06b00d` |
| [audio/step-dirt-1.mp3](../../public/audio/step-dirt-1.mp3) | 2684 | `33b1465a82e9a7c003245c9a20716e812c3cb4bc1633d0ed93d7fe40531a3185` |
| [audio/step-dirt-2.mp3](../../public/audio/step-dirt-2.mp3) | 2924 | `377049d7a4e9e06a9d9b5edff10fa01de1e84a4659fd4e31292d08f6cc3947b6` |
| [audio/step-dirt-3.mp3](../../public/audio/step-dirt-3.mp3) | 2204 | `8853a47d1eb68d3e4acbfe64a7e6162055ff2cd8a86210bf9e29b7a819125691` |
| [audio/hit-wood-0.mp3](../../public/audio/hit-wood-0.mp3) | 3164 | `28fce3352d34406b3c9d0271bab3446ddf2e661ffb732b2045e4bcba82e4fa7c` |
| [audio/hit-wood-1.mp3](../../public/audio/hit-wood-1.mp3) | 3164 | `e7d38755f862ee7269b37c69820993c660026cbd3dd36affc9f64b157250c751` |
| [audio/hit-wood-2.mp3](../../public/audio/hit-wood-2.mp3) | 3644 | `f67c1c3fa5c9ecb186026d76684ea3000389924e6e285e88ddcbc770c8962fa3` |
| [audio/hit-metal-0.mp3](../../public/audio/hit-metal-0.mp3) | 3404 | `736d4d33dd06c0bdacebc6c6a4c42357c6d0906758d2c5eaf8637ec3999fcd05` |
| [audio/hit-metal-1.mp3](../../public/audio/hit-metal-1.mp3) | 2924 | `d4f7b147b03f286fcfd06eff2d87ab0f9b9575702ec473543b560ffdb454d049` |
| [audio/hit-metal-2.mp3](../../public/audio/hit-metal-2.mp3) | 2924 | `585702ec8f7bf30c270015f305e4fd3b410deafd42dd681dd26896653f1302b7` |
| [audio/hit-concrete-0.mp3](../../public/audio/hit-concrete-0.mp3) | 7004 | `3c852f23d08a7e2c9c75d699e31d31b83bcbc520d0fe3a4e984a967bb2ced030` |
| [audio/hit-concrete-1.mp3](../../public/audio/hit-concrete-1.mp3) | 6764 | `e83a8cd295007c759e08876a3fa3f6e09bdc45ea521121f0c3f3c50439187967` |
| [audio/hit-concrete-2.mp3](../../public/audio/hit-concrete-2.mp3) | 6044 | `d211eb9bea4c66cc7aeb85efcd4afcf16c460320083106a271ed1aa7cf439f4a` |
| [audio/hit-dirt-0.mp3](../../public/audio/hit-dirt-0.mp3) | 1964 | `8e39489ff502424e45f8bf07d1c65f89716389cb22d9750b050d1309360e1058` |
| [audio/hit-dirt-1.mp3](../../public/audio/hit-dirt-1.mp3) | 2684 | `10cd0239b2af65d135ecc8d2535afc9edb1fc6dbd45a0e3aaa9d9f7fe8a8f3e5` |
| [audio/hit-dirt-2.mp3](../../public/audio/hit-dirt-2.mp3) | 2204 | `12bec82a6c8d15ae77e9bbe3544e821c17c01df5062459eb598788f6d61666cb` |
| [audio/hit-glass-0.mp3](../../public/audio/hit-glass-0.mp3) | 4604 | `7bcf3768a87abedd51e06c59c8b865ddaca8da7675b4a6c811251b897d34ee2e` |
| [audio/hit-glass-1.mp3](../../public/audio/hit-glass-1.mp3) | 4604 | `272a71f5c6f75334feb03834fbcb3f8eb11f654786959ffc7c4a7f7af6096530` |
| [audio/hit-glass-2.mp3](../../public/audio/hit-glass-2.mp3) | 4364 | `f12e70f670b4b834662eeece09a9d6436236b1a0d5d382ab3dc6484296f68296` |
| [audio/hit-flesh-0.mp3](../../public/audio/hit-flesh-0.mp3) | 5324 | `099b912de9bfaac3ba09739c00648cbb830d5e4d52093f35b3fce064617dfff1` |
| [audio/hit-flesh-1.mp3](../../public/audio/hit-flesh-1.mp3) | 5084 | `5897b169a27ef135d70c5d3189179c72befb9e7575b74840a6619945f3d81d23` |
| [audio/hit-flesh-2.mp3](../../public/audio/hit-flesh-2.mp3) | 4604 | `7d27aa43dbe1181f437a825ac75a2a93f5f429d99abee08ac89f1bb717f8b93d` |
| [audio/step-metal-0.mp3](../../public/audio/step-metal-0.mp3) | 4124 | `f598f3ed10570451a6258a760b50bb7f36af9cf792b25e4ea3c9814bed04e7c0` |
| [audio/step-glass-0.mp3](../../public/audio/step-glass-0.mp3) | 2684 | `2a9311657cf341d48c4578bdbf30eb400bd92872e78a5d64ad97006381c6654b` |
| [audio/step-water-0.mp3](../../public/audio/step-water-0.mp3) | 6284 | `30c6548ff0814e4073b1c7b1e362681f8d93f40884839c706f466472e3dfa60e` |
| [audio/cloth-0.mp3](../../public/audio/cloth-0.mp3) | 6284 | `cfdb3b8e194849a9d93396b930078b8670278037ecb2139d9287b612fb336e82` |
| [audio/door-open-0.mp3](../../public/audio/door-open-0.mp3) | 10124 | `bcea648690bf697445e007629e4629376ae618f137394a7b7cb3db213f18cad1` |
| [audio/door-close-0.mp3](../../public/audio/door-close-0.mp3) | 5804 | `63107f4d8ce4b37b52472dd8976d3561d4c081e3e64a0fcd21726bf38de6491e` |
| [audio/step-metal-1.mp3](../../public/audio/step-metal-1.mp3) | 6524 | `09b022691481e88c48958e9d905bfcb8a922161e83f05d204b78010d533cf684` |
| [audio/step-glass-1.mp3](../../public/audio/step-glass-1.mp3) | 2444 | `93968f5939262e3ffacbddc62d375e0c99dc90e7cbed4e207c046005ee3f9f21` |
| [audio/step-water-1.mp3](../../public/audio/step-water-1.mp3) | 6284 | `a1150447b3a97eed3f10baa06a3fec1a1f6e9cc3876feebcd8338f9cad3225ab` |
| [audio/cloth-1.mp3](../../public/audio/cloth-1.mp3) | 4364 | `203a919cd7818ddc4ebf5b5cd42dcda097e6ddcf3d7db9bffeb87a0e9d0695a0` |
| [audio/door-open-1.mp3](../../public/audio/door-open-1.mp3) | 14684 | `2f51dde9a38c6f44cf3e5a375a7d000706c69abf436e98a4c7dd2482f0dac21c` |
| [audio/door-close-1.mp3](../../public/audio/door-close-1.mp3) | 6524 | `3e40591794b75d1e39cdfd3375219ed1cb49187b73535ecb9ad7374544d20d20` |
| [audio/step-metal-2.mp3](../../public/audio/step-metal-2.mp3) | 5324 | `af510de33c707e0ab105ee550fde0ba94045550f64346f6358048cb0dfc26edd` |
| [audio/step-glass-2.mp3](../../public/audio/step-glass-2.mp3) | 2684 | `afa74d1baa8ddd27ff3323cb48bd3b8d5eb2b1375c67de47ae959590f3bc66d9` |
| [audio/step-water-2.mp3](../../public/audio/step-water-2.mp3) | 6284 | `6f55dcad3671c239137a6e50f2fa66ee8f0c7aca76cd2c310b4025233cc6a3eb` |
| [audio/cloth-2.mp3](../../public/audio/cloth-2.mp3) | 5564 | `402d7a1fdd8ebeedfe1fb136e2f3637834e4129580153f0395c7148db99dd836` |
| [audio/door-open-2.mp3](../../public/audio/door-open-2.mp3) | 10124 | `bcea648690bf697445e007629e4629376ae618f137394a7b7cb3db213f18cad1` |
| [audio/door-close-2.mp3](../../public/audio/door-close-2.mp3) | 7724 | `61c12804a4b95e4266ac2f952beda39b553dff734c0a06dbcad1add3d8781c21` |
| [audio/swing-0.mp3](../../public/audio/swing-0.mp3) | 4844 | `949bba202d87ee8f42ea7ac3f59777b2d58d8f69b8cbd739a4b741eb4a8d03ae` |
| [audio/swing-1.mp3](../../public/audio/swing-1.mp3) | 5564 | `c98fcbd13fc58cca95fba327487412dfb37a968a2fc7de8da54f3b1eff2f069f` |
| [audio/mechanical-0.mp3](../../public/audio/mechanical-0.mp3) | 3164 | `ac6c47b82e7f2f5fc838397a0b373a0dff3bdafad718d5c76db91fce6b7399a0` |
| [audio/mechanical-1.mp3](../../public/audio/mechanical-1.mp3) | 4844 | `800d8ab406aebb68d0f2f93e57afa3352022ecea44b29aa6fcf3e3af70d34c1b` |
| [audio/mag-out-0.mp3](../../public/audio/mag-out-0.mp3) | 3884 | `8222ac3a5d4a90c617771eb4863967c2e3a901198ac11e5935277b7e7f80f7ef` |
| [audio/mag-out-1.mp3](../../public/audio/mag-out-1.mp3) | 4844 | `daef531ea503fc2ba2b55555c1106bc9f191d72e510e710b8473ccb0c753018c` |
| [audio/mag-in-0.mp3](../../public/audio/mag-in-0.mp3) | 4844 | `800d8ab406aebb68d0f2f93e57afa3352022ecea44b29aa6fcf3e3af70d34c1b` |
| [audio/mag-in-1.mp3](../../public/audio/mag-in-1.mp3) | 3164 | `ac6c47b82e7f2f5fc838397a0b373a0dff3bdafad718d5c76db91fce6b7399a0` |
| [audio/latch-0.mp3](../../public/audio/latch-0.mp3) | 3164 | `ac6c47b82e7f2f5fc838397a0b373a0dff3bdafad718d5c76db91fce6b7399a0` |
| [audio/switch-0.mp3](../../public/audio/switch-0.mp3) | 4844 | `800d8ab406aebb68d0f2f93e57afa3352022ecea44b29aa6fcf3e3af70d34c1b` |
| [audio/ui-0.mp3](../../public/audio/ui-0.mp3) | 8444 | `77d5735730a34d47323f288dfd33d7fb322b3538e15a9f8f352fd09085c28c6c` |
| [audio/radio-0.mp3](../../public/audio/radio-0.mp3) | 7484 | `2355ac898925e1740128dc659f1d629997c00f300ab174e77e44fc934e115b7f` |
| [audio/water-0.mp3](../../public/audio/water-0.mp3) | 7724 | `c004aef33e5bf3f2cd8793dfe2358dea288a72f76e02816789bebc1c88dc61ad` |
| [audio/explosion-0.mp3](../../public/audio/explosion-0.mp3) | 8684 | `468c28a3d23eb574613f74e3be5c79eca0d7e7d4e64a4d33ab201737182f773b` |
| [audio/explosion-1.mp3](../../public/audio/explosion-1.mp3) | 14444 | `f1c8af458db711354a99a81dca5ba24df5dfc716ef754b4fb1d90d3a51aea4a8` |
| [audio/gun-pistol-0.mp3](../../public/audio/gun-pistol-0.mp3) | 2444 | `3df02740060990c16b0473982f3a91dadf8330e8092e66e33f60f03b1df6a4a9` |
| [audio/tail-pistol-0.mp3](../../public/audio/tail-pistol-0.mp3) | 14924 | `d97e84ba84962b097d01e3b207bddb0bd461502dfa6a83a31dad1a349b84b726` |
| [audio/gun-pistol-1.mp3](../../public/audio/gun-pistol-1.mp3) | 2204 | `fb8493da646353b80b44154fb0fcd48a42ac01a2e528c74f82b148e648866469` |
| [audio/tail-pistol-1.mp3](../../public/audio/tail-pistol-1.mp3) | 8444 | `8c8f5017e4e9a15ed6ebca9672143b1beb390bda2400082154add7089f96b38b` |
| [audio/gun-rifle-0.mp3](../../public/audio/gun-rifle-0.mp3) | 2444 | `6b34184a3b3b3b9b0eb2a8bab3652dfce79a86fe2268901a9122813c129df4d4` |
| [audio/tail-rifle-0.mp3](../../public/audio/tail-rifle-0.mp3) | 14444 | `3b167fc10f09f5a346b250f7c13b370bc6ca8563ed81ca6527aef142402081db` |
| [audio/gun-rifle-1.mp3](../../public/audio/gun-rifle-1.mp3) | 2444 | `4d0d57555c1c202a056f2bb97fb58f7fad1ca8f529659bbe9e428683f4ef2744` |
| [audio/tail-rifle-1.mp3](../../public/audio/tail-rifle-1.mp3) | 16364 | `4e41b2637f6e4b44dcfaa2477df2f67c19f5ff1cfae65748842031665528a77b` |
| [audio/gun-shotgun-0.mp3](../../public/audio/gun-shotgun-0.mp3) | 2444 | `a5a76ea28cbfd1a020fb96bca07ce60ad44ad5e6fbde1745d467b5be34995181` |
| [audio/tail-shotgun-0.mp3](../../public/audio/tail-shotgun-0.mp3) | 16364 | `5526401a09fe81c6116d6b6d9204da048159ba27dd8dbea11618aee5c33ccde1` |
| [audio/gun-shotgun-1.mp3](../../public/audio/gun-shotgun-1.mp3) | 2444 | `c8b362424cfa9930aaa77b258b32b5c41be440a97b494ea10c801e874973ce68` |
| [audio/tail-shotgun-1.mp3](../../public/audio/tail-shotgun-1.mp3) | 16364 | `336c1eeef0a32cd5f6c9e794988273b5fe1a6dd1b68357fc786a6ef70505188e` |
| [audio/infected-idle-0.mp3](../../public/audio/infected-idle-0.mp3) | 8924 | `8e8e191b0a8b31a16c3cb1daa1ff9c1ba9502638cbd35412dda6ae5fc23fe0b7` |
| [audio/infected-idle-1.mp3](../../public/audio/infected-idle-1.mp3) | 7484 | `3ec876ef0e858d43b8fe1d028c520b3eb1bf3ab55f2c93d5e22f6df3245addc9` |
| [audio/infected-idle-2.mp3](../../public/audio/infected-idle-2.mp3) | 6524 | `0d8117e4f04b2e77658ae3ba4860a09cfbf6aa1e61396eed1fed8d43fbff86cf` |
| [audio/infected-alert-0.mp3](../../public/audio/infected-alert-0.mp3) | 7964 | `30685d9a6a7e69bf9b17e1de8d1819a25839bca930bf184c567a97ca8fb71849` |
| [audio/infected-alert-1.mp3](../../public/audio/infected-alert-1.mp3) | 5564 | `4d9e68cae3f3d63711a76010638279f3d63debbd734acd544b701dbc45178934` |
| [audio/infected-search-0.mp3](../../public/audio/infected-search-0.mp3) | 6044 | `f063a16ea70e2231f8f95776f17d614d7345edf26a6f50709f75b0c3b9f69396` |
| [audio/infected-search-1.mp3](../../public/audio/infected-search-1.mp3) | 6524 | `14e4e2c577aba203f85874e55d44a8564270cda1797b11b097731ff2964cd67d` |
| [audio/infected-chase-0.mp3](../../public/audio/infected-chase-0.mp3) | 8684 | `6696d0ca123ef00460277b7219b2806ca46b3aa9ae3cea5f19b191aded7eb7e4` |
| [audio/infected-chase-1.mp3](../../public/audio/infected-chase-1.mp3) | 9164 | `e74840bb88083b8dd906da26b8c08c77c26431c5bb7cd42a56a22102d3f3fc8a` |
| [audio/infected-attack-0.mp3](../../public/audio/infected-attack-0.mp3) | 7244 | `7ca7b95749d11d78abaa341b9a0609959c3f392cfa34cfb0a87fb849fe9ff103` |
| [audio/infected-attack-1.mp3](../../public/audio/infected-attack-1.mp3) | 5804 | `ce57227afdd0535f49047854a3c0d251cf25a58b52a10eb818c66278959dd802` |
| [audio/infected-attack-2.mp3](../../public/audio/infected-attack-2.mp3) | 8444 | `91fc6abc397fc121c6ba6fa6ccf8105f18d9665bc46400a9fcf584a0d76d4bd2` |
| [audio/infected-hit-0.mp3](../../public/audio/infected-hit-0.mp3) | 6044 | `701d68e11335ef330b7f7b43cbe270fa32669830909a4ed5a94a9a80455b2a82` |
| [audio/infected-hit-1.mp3](../../public/audio/infected-hit-1.mp3) | 7244 | `ade74be8e236d952a324f760a5468401ee6a0a26a6ad26982a629a9617be5bc8` |
| [audio/infected-hit-2.mp3](../../public/audio/infected-hit-2.mp3) | 9164 | `9514920603520ae0083173bfa8a8be5781dd0987804df74dd9c0337de6f62825` |
| [audio/infected-death-0.mp3](../../public/audio/infected-death-0.mp3) | 10124 | `aa1bece01de3e034f64cef155de2b4425317e4bf5fe50ee84c773f962af35b10` |
| [audio/infected-death-1.mp3](../../public/audio/infected-death-1.mp3) | 11564 | `4599bc479cd846e7a8d15730cbe6775b6291f5df8f56600b2aa3cecb95ca17b4` |
| [audio/infected-death-2.mp3](../../public/audio/infected-death-2.mp3) | 8444 | `8e98100d69c2f8232ffbcb960df934fb0bc889b3e99b584bb3abdcee0eac148e` |
| [audio/forest-0.mp3](../../public/audio/forest-0.mp3) | 222380 | `cdb1dcec58353ac390c691d2a075805f03e16f74ed97fa88b0f528f193e94bd6` |
| [audio/wind-0.mp3](../../public/audio/wind-0.mp3) | 190316 | `7c6e0c9c3453a658318ced34224d0bfb17c1a7abac82f78989ae169515a1c5fb` |
| [audio/birds-0.mp3](../../public/audio/birds-0.mp3) | 25964 | `cc4937bb82920a665228029d5397beedade1c5a15fefd19035bfdce3fd09d32f` |
| [audio/birds-1.mp3](../../public/audio/birds-1.mp3) | 25964 | `506759be2979e8088864850d722560580fadcf4529f6599c8405d4f6dcc33bbb` |
| [audio/rain-0.mp3](../../public/audio/rain-0.mp3) | 174380 | `e6701329ae5926b85d5b909afb25f10b3928262bbc2436d4f78ed2dca2038fdf` |
| [audio/rain-roof-0.mp3](../../public/audio/rain-roof-0.mp3) | 142316 | `ea7f3d171b637b8f4b8db9c4d2073e61f5121c82790ebdb50d0a1e3ea82683cc` |
| [audio/engine-0.mp3](../../public/audio/engine-0.mp3) | 13484 | `bfdb2ab54507bd72595ba0f8f2891338fe920e4216d43b488d2b5b26a0e3ef50` |
| [audio/thunder-0.mp3](../../public/audio/thunder-0.mp3) | 15404 | `642867304b7463dc2d6f12b7995ca8009cbcbe0b3c8a278eb3f1a215d4d3bde1` |
| [audio/animal-0.mp3](../../public/audio/animal-0.mp3) | 6524 | `28d8784738f67fad647bff292b0992f3044457e372ac61b8dd296ae5d788cce2` |
| [audio/animal-1.mp3](../../public/audio/animal-1.mp3) | 6284 | `b17cfe0a668f831622a7e28ffc136e6f7f014479ac49cda41e003d411151d361` |
| [audio/animal-2.mp3](../../public/audio/animal-2.mp3) | 7724 | `edb861cfa2eda1220af696f7ad42629e7af6614797b7792b590c3303f074eb34` |

### 原创中文合成配音

| 当前文件 | bytes | 实算 SHA-256（与清单一致） |
| --- | ---: | --- |
| [audio/dialogue/opening-impact.mp3](../../public/audio/dialogue/opening-impact.mp3) | 95852 | `fadbdd8406838422a690645faef12d78e2f3ace7110f8be09d997eaaf93582b8` |
| [audio/dialogue/opening-order.mp3](../../public/audio/dialogue/opening-order.mp3) | 98732 | `9fa89d62815d6b66c2a62f3696c0daaea191ad605347b5fb5653b1ac39c1da76` |
| [audio/dialogue/opening-mira.mp3](../../public/audio/dialogue/opening-mira.mp3) | 121196 | `9e7efb94241fb92612a159710ee72ddd200df9762e7d0557f18ae8fb18cf39a6` |
| [audio/dialogue/evac-loop.mp3](../../public/audio/dialogue/evac-loop.mp3) | 103532 | `496c1125214fb8a49d65a2cc3bf7d52b1df565c0983a1c6d97d886dc3cddaf93` |
| [audio/dialogue/ranger-warning.mp3](../../public/audio/dialogue/ranger-warning.mp3) | 143084 | `999fb5237332529b303f23954fb64ff686111e66e1cdd2d81004d3fd10af8ab1` |
| [audio/dialogue/mira-cases.mp3](../../public/audio/dialogue/mira-cases.mp3) | 171884 | `ea21a302e442df17af8a07dfb19e75a0030aa70b06ae19a9326d13e4a31aa5e2` |
| [audio/dialogue/military-order.mp3](../../public/audio/dialogue/military-order.mp3) | 170156 | `ea2b9709f8162a78d9662bed9d8d6ff3d287688db07392874963549446e49e5a` |
| [audio/dialogue/contractor-ledger.mp3](../../public/audio/dialogue/contractor-ledger.mp3) | 146156 | `a273d124db3c65fddc11be2b53904aa2bb277a312c7275224cfff2fb10bcd425` |
| [audio/dialogue/missing-voices.mp3](../../public/audio/dialogue/missing-voices.mp3) | 173420 | `22911037b9368887b8f9d3a2e24e2e9e11500d88b766137c59476bf90cc8b516` |
| [audio/dialogue/mayor-session.mp3](../../public/audio/dialogue/mayor-session.mp3) | 195884 | `dafe98e29195b809902d80aea509a75e73a81740aa5f28c0a9974ec33b70edd2` |
| [audio/dialogue/ashfall-countdown.mp3](../../public/audio/dialogue/ashfall-countdown.mp3) | 108524 | `8d757b4fa93e314654fb885ce3b2a8c132a77262c8afc8883d8d18522e67f9f2` |
| [audio/dialogue/ashfall-reveal.mp3](../../public/audio/dialogue/ashfall-reveal.mp3) | 193580 | `c60af4e195e5a05157b238bf240648a6f247343acc8926cf8be1aa74c0fafd8d` |
| [audio/dialogue/facility-adaptation.mp3](../../public/audio/dialogue/facility-adaptation.mp3) | 200300 | `eddecaea55fa1bae577870b5bcb8f4ff8abd25af94ba0f8b50a006a32f4439c9` |
| [audio/dialogue/facility-military.mp3](../../public/audio/dialogue/facility-military.mp3) | 160940 | `886df8cc8c545acd78f1d036e96bf9f0d8df8791be4bd71ecfbf4c532cdd3f2f` |
| [audio/dialogue/facility-research.mp3](../../public/audio/dialogue/facility-research.mp3) | 185900 | `c92323cfea8c039fb9712ccfe17704b1479268dea2bbb5f2b352027e6daf5991` |
| [audio/dialogue/facility-government.mp3](../../public/audio/dialogue/facility-government.mp3) | 157484 | `85c8fc7c8ecc70d8efc8c7b082b0c16a878b2909f03fd854434d2cce93e35a4f` |
| [audio/dialogue/facility-contractor.mp3](../../public/audio/dialogue/facility-contractor.mp3) | 208556 | `db101da7d95a0c063290ddf4922547382b77aae5f999a17cd958becf71c2b021` |
| [audio/dialogue/facility-reveal.mp3](../../public/audio/dialogue/facility-reveal.mp3) | 209516 | `f422a46d3ee28929f1ced9d250bc785bf96ae8f96aae84c6354fa61e27dcb48b` |
| [audio/dialogue/finale-choice.mp3](../../public/audio/dialogue/finale-choice.mp3) | 161324 | `ae40858d81cdde282fd5c315bce388da673759ef6cabe003b7969437560282a3` |
| [audio/dialogue/ending-truth.mp3](../../public/audio/dialogue/ending-truth.mp3) | 197420 | `33343c7a697e301d0fa56e22e697a8eec65eda6351d27d72fef63d910cda71c1` |
| [audio/dialogue/ending-ash.mp3](../../public/audio/dialogue/ending-ash.mp3) | 197804 | `12ba5a23dfe3c9308dd3d61cf493aaac52f5ae8b28f24ce931ad425d233ca8b7` |
| [audio/dialogue/ending-survivor.mp3](../../public/audio/dialogue/ending-survivor.mp3) | 205676 | `8780996303221c13733cdd5398624ec87a6283d411cf772814418f338d09e6c4` |
| [audio/dialogue/shelf-collapse.mp3](../../public/audio/dialogue/shelf-collapse.mp3) | 113324 | `2e0904a7fa332abf1228ae9bf8dc442a46b0a18412043d28db963c6b10926ea7` |
| [audio/dialogue/fort-alarm.mp3](../../public/audio/dialogue/fort-alarm.mp3) | 128684 | `48c5bd58be07718954739062609a3e85a517180933518dc09f5d9b1ef51e77f3` |
| [audio/dialogue/doctor-request.mp3](../../public/audio/dialogue/doctor-request.mp3) | 134252 | `7aead52660b0ebeb1644a7bb92195bb23c766a4f8249d24670fe85c15208e79e` |
| [audio/dialogue/doctor-found.mp3](../../public/audio/dialogue/doctor-found.mp3) | 193772 | `de13dc36d25da9df7f277f0d418dd8de4fd304940f517b56a9c7ff11bf7abf8d` |
| [audio/dialogue/doctor-return.mp3](../../public/audio/dialogue/doctor-return.mp3) | 151916 | `c6125e49fbf41e0ef41eb537d642133ab0fa0b3604d1821113b1db42425d9500` |
| [audio/dialogue/hunter-request.mp3](../../public/audio/dialogue/hunter-request.mp3) | 142508 | `73f951f3f10331160d916dca4a4f29785d5728104dfe53da45adbca2bf67fce6` |
| [audio/dialogue/hunter-route.mp3](../../public/audio/dialogue/hunter-route.mp3) | 137708 | `5c955b97f7f41cc55fcb4394901cf44d1b38e72ce27cb9adea0fd595bb401df3` |
| [audio/dialogue/hunter-return.mp3](../../public/audio/dialogue/hunter-return.mp3) | 139820 | `3f051738c75dc27a5ab6908f586ecd2143519dc15cf0b453de510dfa7e4dc320` |
| [audio/dialogue/checkpoint-request.mp3](../../public/audio/dialogue/checkpoint-request.mp3) | 150188 | `6c6fee2fd8d10d5cc6a256aab1a19c7d094961f3ad87b87cbc6ef1b6b8c5d9eb` |
| [audio/dialogue/checkpoint-proof.mp3](../../public/audio/dialogue/checkpoint-proof.mp3) | 145580 | `be49cbf74c2d981b0c02972fa6fcecdaeb126bf9081c08405e0fc3a7c821e133` |
| [audio/dialogue/checkpoint-return.mp3](../../public/audio/dialogue/checkpoint-return.mp3) | 123500 | `54509d70aa89ec5bd3344d9e497e3f52b245717f73c98e0963bdc3a707c40a2b` |
| [audio/dialogue/raider-request.mp3](../../public/audio/dialogue/raider-request.mp3) | 152876 | `4bd2d9fcf43a06b036fede7eeed4b49dd5266d8e3e1422bba831cef23ecf25f2` |
| [audio/dialogue/raider-deal.mp3](../../public/audio/dialogue/raider-deal.mp3) | 169580 | `7cf1818f4f5b5a8e734d6b8aa8bc671167890c4cef6d3c5fbed412c881134ab0` |
| [audio/dialogue/raider-return.mp3](../../public/audio/dialogue/raider-return.mp3) | 148460 | `56848235a93f435067b84bc11192867ba4e08a1a76c9704b2b21a26391300b1d` |
| [audio/dialogue/radio-request.mp3](../../public/audio/dialogue/radio-request.mp3) | 155180 | `8a502299c8889db6817841942d940341e15838853cd0c528d2c4d2c5c4487bd2` |
| [audio/dialogue/radio-repair.mp3](../../public/audio/dialogue/radio-repair.mp3) | 146540 | `8ba9ca84c0c7b8ce4a4ca940a35d039a49c9248dae7bc4e6c105da88a66b25cd` |
| [audio/dialogue/radio-return.mp3](../../public/audio/dialogue/radio-return.mp3) | 123116 | `665e582c962f476561b7698a5d3c8f76ce6bc081866efd31b2b2f35abebafe57` |
| [audio/dialogue/shelter-request.mp3](../../public/audio/dialogue/shelter-request.mp3) | 137900 | `c91196783e8ec3449571da15402cdb955122bce969663cbe6f6a09c4cdfe2c92` |
| [audio/dialogue/shelter-power.mp3](../../public/audio/dialogue/shelter-power.mp3) | 129452 | `34965353919171ae8cde3cb9612b0d0440797b38e7894412f4b3b1021f7358b8` |
| [audio/dialogue/shelter-return.mp3](../../public/audio/dialogue/shelter-return.mp3) | 145580 | `64b9d3dfb5b883e6505b8df33e055fff53ef04e8504ebf472c6a5dbf681e6763` |
| [audio/dialogue/officer-request.mp3](../../public/audio/dialogue/officer-request.mp3) | 138860 | `67a60298270017596b73c5cbdb6b74ac6e9ae3e31ad6d2835e208052bd90744a` |
| [audio/dialogue/officer-proof.mp3](../../public/audio/dialogue/officer-proof.mp3) | 150188 | `e9cd659bf60b3af9591c66e13cfc87bccc5d9e591a3894b4bba8021cb69c01c6` |
| [audio/dialogue/officer-return.mp3](../../public/audio/dialogue/officer-return.mp3) | 144620 | `f615fe0c3ef747838c100ed8a1558c967c690dbf5a77a149f1abbc2ccd90c1a5` |

## 既有摄影纹理核对

保留历史来源和使用范围，使用其原清单声明的 MD5 进行核验，不把 MD5 字段误读成 SHA-256。

| 文件 | bytes | 实算 MD5 | 与历史清单 |
| --- | ---: | --- | --- |
| [textures/forest_ground_04/albedo.jpg](../../public/textures/forest_ground_04/albedo.jpg) | 1113899 | `6ad9df4d731a238299806f739a26af83` | 匹配 |
| [textures/forest_ground_04/normal.jpg](../../public/textures/forest_ground_04/normal.jpg) | 1326812 | `a010a0802c2d9a930c6f00d3b1f196d2` | 匹配 |
| [textures/forest_ground_04/orm.jpg](../../public/textures/forest_ground_04/orm.jpg) | 882694 | `3fbb079d961f59b8fac7ec4f6dab9f20` | 匹配 |
| [textures/bark_brown_02/albedo.jpg](../../public/textures/bark_brown_02/albedo.jpg) | 659592 | `6669cca520594bdca19f94084984ab72` | 匹配 |
| [textures/bark_brown_02/normal.jpg](../../public/textures/bark_brown_02/normal.jpg) | 1015623 | `1cad3fe0349a44df2d4d1c2859c79920` | 匹配 |
| [textures/bark_brown_02/orm.jpg](../../public/textures/bark_brown_02/orm.jpg) | 232742 | `6a566390a8930454c9ad4056273b08fb` | 匹配 |
| [textures/asphalt_02/albedo.jpg](../../public/textures/asphalt_02/albedo.jpg) | 731707 | `fa19772d4817754c3efab708c651f5a8` | 匹配 |
| [textures/asphalt_02/normal.jpg](../../public/textures/asphalt_02/normal.jpg) | 1240122 | `338da8de636ea36133170578cac82e8e` | 匹配 |
| [textures/asphalt_02/orm.jpg](../../public/textures/asphalt_02/orm.jpg) | 296770 | `33820445f43af5e5ee484674b6939271` | 匹配 |
| [textures/concrete_wall_003/albedo.jpg](../../public/textures/concrete_wall_003/albedo.jpg) | 264756 | `1277cc6bcfc8e4f074f9852fbf19b2d3` | 匹配 |
| [textures/concrete_wall_003/normal.jpg](../../public/textures/concrete_wall_003/normal.jpg) | 228062 | `ba9639f62ebd5434f5bd8fb97415c1ad` | 匹配 |
| [textures/concrete_wall_003/orm.jpg](../../public/textures/concrete_wall_003/orm.jpg) | 204702 | `fc3621ea80ea29af1a431ad770a522d0` | 匹配 |
| [textures/denim_fabric_06/albedo.jpg](../../public/textures/denim_fabric_06/albedo.jpg) | 821758 | `0441b69c4ebb2bcf1c0c1fb179c2c1cc` | 匹配 |
| [textures/denim_fabric_06/normal.jpg](../../public/textures/denim_fabric_06/normal.jpg) | 1240070 | `93f7e9233d923c3b021de6367cc9c4f0` | 匹配 |
| [textures/denim_fabric_06/orm.jpg](../../public/textures/denim_fabric_06/orm.jpg) | 966013 | `f2c48eda8d83f0c9b1c3d51931c5591c` | 匹配 |

## 随包许可与证据文件快照

这些是许可文本或核验记录的当前 hash，不是把许可证本身作为音效/模型计算到前述 195 项中。动物和环境 LICENSE 是项目编写的授权索引；Quaternius 枪械/角色与 Kenney 文件保留原包许可文本，不能混称全部 LICENSE 均是原包原文。

| 许可/来源记录 | bytes | 实算 SHA-256 |
| --- | ---: | --- |
| [public/assets/weapons/LICENSE.txt](../../public/assets/weapons/LICENSE.txt) | 364 | `83d8959f9fc56353ed571fbe2dc52e4bcd64508e2399501cd45ac2ce3df0bf8c` |
| [public/assets/animals/LICENSE.txt](../../public/assets/animals/LICENSE.txt) | 927 | `8b1c3d2237b630c79b77717a341154d9a1bfd79072ed5e0d6d0f21ad36506f9d` |
| [public/assets/environment/LICENSE.txt](../../public/assets/environment/LICENSE.txt) | 638 | `5a57746833631a9fa039f45600de4b87e6dc2e775bd5ff44c3df409575f149a4` |
| [public/assets/characters/LICENSE.txt](../../public/assets/characters/LICENSE.txt) | 332 | `6d01f55c6e4c49a2c9963e147e561945ae2c83958c8ca667d90a6bffdbfac061` |
| [public/audio/licenses/sources.json](../../public/audio/licenses/sources.json) | 7210 | `ab2c03903dfb982f07a45c61dd74acc2855910f68e8b277fa4e408355843b506` |
| [public/audio/licenses/Kenney-impact.txt](../../public/audio/licenses/Kenney-impact.txt) | 608 | `b49aa9c56b04528b95913de13e506a0f7c5e807b9925db9bfef86af1f91120db` |
| [public/audio/licenses/Kokoro-Apache-2.0.txt](../../public/audio/licenses/Kokoro-Apache-2.0.txt) | 11357 | `c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4` |
| [public/audio/licenses/Kenney-rpg.txt](../../public/audio/licenses/Kenney-rpg.txt) | 478 | `5735dfd72cb64cbbceda4ebc00c380c41ca680edb82ff153aa7c9ab97614c539` |
| [public/audio/licenses/Kenney-sci-fi.txt](../../public/audio/licenses/Kenney-sci-fi.txt) | 571 | `a9767b25c3533f69d03af136480efad08efba19a9f0d89616992b34c79fd6186` |
| [public/audio/licenses/Kokoro-model-card.md](../../public/audio/licenses/Kokoro-model-card.md) | 6006 | `02ed578bdd24c42f3e4ed0d88d33e923365b41e6a37e86d3a5055f75d456f8e6` |

## 只读复核命令

在项目根目录执行以下命令，不写入资产，不重生成 manifest：

```sh
python3 - <<'PY'
from pathlib import Path
import json, hashlib

root = Path.cwd()
sets = [
    ("public/assets/characters/manifest.json", "files"),
    ("public/assets/animals/manifest.json", "files"),
    ("public/assets/weapons/manifest.json", "files"),
    ("public/assets/environment/manifest.json", "files"),
    ("public/audio/manifest.json", "assets"),
    ("public/audio/dialogue/manifest.json", "assets"),
]
rows = []
for relative, key in sets:
    manifest = root / relative
    for item in json.loads(manifest.read_text())[key]:
        p = (root / "public" / item["file"].lstrip("/")) if item["file"].startswith("/") else manifest.parent / item["file"]
        content = p.read_bytes()
        actual = hashlib.sha256(content).hexdigest()
        assert actual == item["sha256"], p
        assert len(content) == item["bytes"], p
        rows.append((str(p.relative_to(root)), len(content), actual))
snapshot = "".join(f"{p}|{size}|{digest}\n" for p, size, digest in sorted(rows))
print(len(rows), "matched;", sum(row[1] for row in rows), "bytes")
print("snapshot SHA-256:", hashlib.sha256(snapshot.encode()).hexdigest())
for item in json.loads((root / "public/textures/manifest.json").read_text()):
    content = (root / item["path"]).read_bytes()
    assert hashlib.md5(content).hexdigest() == item["md5"], item["path"]
    assert len(content) == item["bytes"], item["path"]
print("15 existing texture records matched")
PY
```
