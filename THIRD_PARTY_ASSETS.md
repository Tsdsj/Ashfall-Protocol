# 素材来源与授权

游戏模型、植被图集、原始备用材质、物品图标和合成音效由本项目程序原创生成。高分辨率地表与建筑纹理使用以下明确为 CC0 的 Poly Haven 素材，并随游戏本地分发，运行时不访问 Poly Haven。

| Asset | Author | Source | License | Local files |
| --- | --- | --- | --- | --- |
| Forest Ground 04 | Rob Tuytel; Rico Cilliers | [Asset page](https://polyhaven.com/a/forest_ground_04) | CC0-1.0 | public/textures/forest_ground_04/ |
| Bark Brown 02 | Rob Tuytel | [Asset page](https://polyhaven.com/a/bark_brown_02) | CC0-1.0 | public/textures/bark_brown_02/ |
| Asphalt 02 | Rob Tuytel | [Asset page](https://polyhaven.com/a/asphalt_02) | CC0-1.0 | public/textures/asphalt_02/ |
| Concrete Wall 003 | Dimitrios Savva; Rico Cilliers | [Asset page](https://polyhaven.com/a/concrete_wall_003) | CC0-1.0 | public/textures/concrete_wall_003/ |

原作者与许可证由 [Poly Haven 授权页](https://polyhaven.com/license) 和素材元数据验证。每个文件的下载地址、作者、MD5、大小记录于 public/textures/manifest.json。下载脚本 scripts/fetch-assets.mjs 验证所有原始文件校验和。

Powered by Poly Haven. Poly Haven 的素材是免费公共领域资源，独立于本项目提供。

## Engine and runtime

- Babylon.js: Apache-2.0, [Babylon.js](https://github.com/BabylonJS/Babylon.js). 使用 npm 分发，具体版本锁定于 package-lock.json。
- Babylon.js 附带的 glslang / twgsl WebAssembly 编译器从安装包原样复制到 public/vendor，确保 WebGPU 着色器转换无需 CDN。各上游许可保留于 public/vendor/NOTICES.md。
- 系统字体：由操作系统提供，本项目未分发商业字体文件。
