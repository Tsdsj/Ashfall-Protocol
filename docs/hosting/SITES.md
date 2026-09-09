# Sites 密码访问部署

项目沿用 Vite 7 与 Babylon，游戏存档仍保存在玩家自己的浏览器中。托管入口是 `src/hosting/password-gate.ts`，访问密码和会话签名密钥保存在 Sites secrets，不进入 HTML、前端包或 Git。会话有效期为 24 小时；修改密码会使旧会话失效。

本次实际托管检查发现，Sites 的静态文件路由会先于自定义 Worker 返回文件，不能仅靠 Worker 保护 `dist/client`。因此发布包不携带公开静态目录；`.openai/hosting.json` 声明私有 `GAME_ASSETS` R2 binding，Worker 验证会话后才读取对应版本的对象。所有入口、脚本、模型、音频、纹理和离线清单均走这一检查，音频支持字节范围请求。

`npm run build:sites` 先执行正常游戏构建，然后输出 `dist/server/index.js` 与托管配置。游戏资源位于 `output/sites-assets/<precache version>`，通过 `scripts/upload-sites-assets.mjs` 上传。该脚本从 stdin 接收部署凭据、Sites origin 和版本号，逐个核验服务端计算的 SHA-256；凭据不落盘。上传端点要求独立的 `SITE_DEPLOY_SECRET`，玩家访问密码不能用于上传。

运行变量见 `.env.example`。`SITE_ASSET_VERSION` 对应当前完整资源版本。先在 owner-only 的 Sites 访问策略下发布并上传，验证无会话时脚本/清单返回 401、正确密码能获取游戏、伪造会话被拒绝，再将外层访问设为 public，让访客打开密码页。public 只用于抵达服务端入口，游戏内容仍受密码保护。

Sites 0.2 的 Vite 插件要求 Vite 8；本项目不为部署更换已验证的构建器，使用兼容 Cloudflare ESM 的独立输出及官方 Sites 打包脚本。不得把 client 目录重新加入部署包，否则会绕过密码层。

参考：[Cloudflare R2 Workers API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/)、[通过 Worker 访问 R2](https://developers.cloudflare.com/r2/api/workers/workers-api-usage/)。
