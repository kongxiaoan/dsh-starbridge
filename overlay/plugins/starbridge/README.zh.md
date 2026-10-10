# 星桥 · ChatGPT

[English](README.md) | 中文

![星桥](icon.svg)

**在 DeepSeek Harness 中使用你的 ChatGPT 套餐。** 星桥是社区插件，支持官方浏览器登录、账号切换、凭据自动续期和可选的 Fast 处理。插件不会索取 ChatGPT 密码，也不会读取 Codex 凭据。

## 支持版本

| 组件 | 本次发布 |
| --- | --- |
| 星桥 | `0.1.0-beta.3` |
| DeepSeek Harness 桌面端 / Web | **`0.2.0-rc.2`（桌面端最新渠道）和 `0.2.1-alpha.2`（alpha 渠道）** |
| 已验证平台 | macOS Apple Silicon |
| Windows / Linux | 本次测试版尚未验证 |
| 更早或更新的 Harness 版本 | 未声明兼容；安装时检查明确列出的框架依赖版本 |
| 桌面端 Node.js | 使用桌面应用自带运行时 |
| 独立 Web 版 Node.js | `^22.19.0` 或 `>=24.0.0`，与 Harness 一致 |

这是预览版本。版本匹配不代表账号具有 ChatGPT 模型或 Fast 使用资格。账号资格、模型权限、用量限制和处理档位由 OpenAI 决定。

## 安装

在 DeepSeek Harness 桌面端打开 **插件 → 安装**，输入完整包名和版本：

```text
@kongpingan/dsh-starbridge@0.1.0-beta.3
```

启用已安装的星桥插件包。若插件管理器提示需要重启，请等待进行中的任务结束后重启桌面端。独立 Harness Web 配置可使用其 CLI：

```sh
dsh plugin --profile web add --ignore-scripts @kongpingan/dsh-starbridge@0.1.0-beta.3
```

CLI 安装后，请打开插件面板启用星桥。`--ignore-scripts` 避免依赖构建提示；星桥无需安装脚本。安装包只增加一个可选插件包，提供独立设置卡片和 `starbridge-chatgpt` 模型路由，不替换已有模型提供方。

## 登录和使用模型

1. 打开 **设置 → 模型 → 星桥 · ChatGPT**。
2. 点击 **使用 ChatGPT 继续**，在浏览器中完成 OpenAI 官方登录和授权。弹窗被拦截时，点击 **打开登录页面**。
3. 返回 Harness，必要时选择账号并点击 **使用此账号**。
4. 在对话的模型选择器中选择 **Starbridge · ChatGPT** 下的模型，发送一条简短消息。

浏览器和 Harness Host 必须运行在同一台电脑上：OAuth 通过临时的 `127.0.0.1` 地址回调。本版本不支持远程 Host 的浏览器登录。内置模型目录提供候选项，不代表账号有权使用其中每一个模型。

在同一卡片的「处理速度」中选择 **标准** 或 **Fast**。设置立即保存，从后续模型请求生效，不改变推理强度，也不中断正在进行的请求。Fast 可能消耗更多套餐用量。不支持的档位或模型会显示提供方错误；插件不会自动切换账号、模型或计费凭据。

![星桥设置，截图来自本地测试构建](settings.png)

## 安全与账号移除

星桥使用官方 Sign in with ChatGPT、PKCE、回调状态校验、签名 ID Token 校验，以及开启流式且设置 `store: false` 的公开 Responses API。令牌保存在 Host 的现有 Harness 凭据存储中，界面只接收账号标签和待完成的授权状态。刷新通过凭据存储锁串行执行。反馈问题时不要附带 Harness 主目录或凭据文件。

**退出登录**会清除本地令牌，并尝试撤销远端授权。如果撤销失败，请到 [ChatGPT 设置](https://chatgpt.com/settings/usage)断开应用授权。卸载插件会保留凭据和对话；需要移除访问权限时，请先退出登录。在同一个 Harness 主目录下重新安装，可复用已保存的注册信息。

## 停用或卸载

先结束正在运行的任务，并将对话模型切换到其他提供方，然后在插件面板停用或卸载星桥。已有对话仍可阅读；继续使用 `starbridge-chatgpt` 发起请求需要重新安装插件或更换提供方。独立 Web 配置可执行：

```sh
dsh plugin --profile web remove @kongpingan/dsh-starbridge
```

如果你使用过此前的内置原型，请改选新的 **Starbridge · ChatGPT** 路由。旧的 `chatgpt` 提供方行不是此插件；不再需要时可在模型设置中移除。已有 ChatGPT 凭据记录会被复用。

## 排查问题

- **依赖构建审批：** 桌面插件管理器可能对间接 SDK 依赖提出构建审批；请审阅该提示后重试安装。
- **版本不兼容：** 使用上表明确支持的 Harness 版本，不要绕过依赖版本检查。
- **浏览器成功但应用仍等待：** 确认浏览器与 Host 在同一台电脑，且回调没有被阻断；取消后重新发起授权。
- **登录失效：** 使用已保存的账号重新登录；反复失败时检查账号的应用授权状态。
- **用量受限或模型不支持：** 检查 [ChatGPT 用量](https://chatgpt.com/settings/usage)，选择有权限的模型。插件不会回退到 API 密钥计费。

## 开发与验证

Host 代码归属 `packages/llm/starbridge`，界面代码归属 `packages/client/ui-starbridge`。`plugins/starbridge/build.mjs` 将它们与复用的 Harness pi-ai 适配器打包为一个发行物。框架服务保持为仅允许已列出测试版本的 peer 依赖，安装包携带自己的生成 Remote 描述和浏览器产物。在本仓库完成常规 Host/Client 构建后执行：

```sh
node plugins/starbridge/build.mjs
npm pack ./.artifacts/starbridge/package --pack-destination .artifacts/starbridge
npm install --prefix .artifacts/starbridge/clean-install --ignore-scripts ./.artifacts/starbridge/kongpingan-dsh-starbridge-0.1.0-beta.3.tgz
DSH_TEST_BROWSER_CHANNEL=chrome pnpm exec vitest run --config plugins/starbridge/vitest.config.ts
```

测试覆盖 OAuth 回调校验、令牌续期、取消、撤销失败、流式请求、服务档位序列化和浏览器控件。兼容性证据与发布检查随发行产物记录。真实账号的访问仍取决于用户授权和账号资格。

发行包的依赖版本范围明确保存在 `plugins/starbridge/package.json`；构建会拒绝未声明的框架导入。`verify-runtime.mjs` 检查两个支持版本及未测试版本的拒绝行为，然后在隔离运行的 Web 配置中验证设置写入和 OAuth 发起与取消。传入运行时安装目录及启动日志；测试主目录不能包含真实账号。

```sh
node plugins/starbridge/verify-runtime.mjs <runtime-installation> <web-startup-log>
```

## 许可与关联说明

MIT，包含 MIT 许可的 DeepSeek Harness 组件。星桥并非 OpenAI 或 DeepSeek 官方产品。官方协议参考：[Sign in with ChatGPT](https://developers.openai.com/siwc/token-sharing-open-source)、[预览限制](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations)和 [Fast 模式](https://developers.openai.com/api/docs/guides/fast-mode)。付费或远程托管分发需要另行审核 OpenAI 适用的接入条件。
