# 修改与二次开发

## 构建模型

本仓库保存可编辑源码及必要的 DSH 集成补丁。构建使用 [固定 DSH 提交](../integration/dsh.json)的工作区、编译器、Remote 生成器、CSS 和 Client 工具链。固定构建基线与运行时兼容范围是两个概念：用 alpha 基线编译的发行物支持 `0.2.0-rc.2`、`0.2.1-alpha.2` 和 `0.2.1-rc.2`，兼容范围由发行运行时验证。

首次准备需要网络访问 GitHub 与 npm。建议使用 Node.js 24，安装 Git、npm 和 DSH 基线要求的 pnpm `11.28.5`；构建 native 组件还需要 DSH 官方开发文档要求的平台工具链。macOS 使用 Xcode Command Line Tools。

```sh
npm run prepare:dsh
npm run build
npm test
npm run check:docs
```

`prepare:dsh` 创建 `.work/dsh` 并检出固定提交。目录已存在时它会停止；不要重复准备。`build` 先同步源码，再执行锁定依赖安装、DSH 构建和插件打包。它会占用比单个插件更多的时间和磁盘，因为 Client 与 Remote 生成依赖 DSH 的构建程序。运行时和构建依赖不会上传到本仓库。

## 代码归属

- `overlay/packages/llm/starbridge/src/chatgpt-oauth.ts`：PKCE、回调服务器、签名 Token 验证、刷新和撤销。
- `overlay/packages/llm/starbridge/src/chatgpt.ts`：凭据记录、账号生命周期和不含令牌的 Remote 状态。
- `overlay/packages/llm/starbridge/src/index.ts`：配置、服务注册和独立模型路由。
- `overlay/packages/client/ui-starbridge/src/client/`：账号卡片、速度设置、订阅和中英文文案。
- `overlay/packages/llm/llm-pi-ai/src/`：对 DSH 适配器的源码覆盖；其余适配器文件由固定基线提供。
- `overlay/plugins/starbridge/build.mjs`：将 Host、Remote 和 Client 合并为一个 npm 包，保留共享框架 peer 依赖。

源码应修改在 `overlay/`，不要只改 `.work/dsh` 中的投影。同步只覆盖本仓库维护的文件，不负责删除旧文件；重命名或删除覆盖文件后，应重新准备一个干净的构建目录。

## 常见改动

### 增加设置或调整界面

同时修改 Host 配置、Remote 数据类型和 Client 本地化文案，复用 DSH 的设置、凭据、槽位和错误处理能力。配置写入带上最新修订号，显示写入失败；UI 不应保存令牌或独立实现账号存储。

### 修改模型或请求参数

在适配器层修改请求转换及模型目录。Fast 通过 Responses 的 `service_tier` 参数传递，不应通过降低推理强度伪装成加速。修改后检查 `tests/expected/` 中实际序列化的请求，并加入能捕获错误行为的测试。

### 修改 OAuth

保持 PKCE、state、nonce、签名、issuer 和 audience 校验，不从 Codex 或浏览器存储中提取其他应用的凭据。取消、超时、关闭插件时都必须释放回调监听器；刷新继续使用 DSH 凭据锁。变更官方授权协议前，先核对官方文档与适用条件。

### 适配新的 DSH 版本

先比较服务和 Client 接口，使用该版本的真实发行运行时执行插件安装、界面、设置写入、授权发起/取消、卸载测试，再更新 `overlay/plugins/starbridge/package.json` 的 peer 范围及双语 README。不要将范围简单改成 `*`、`>=` 或删除 peer 声明。

若要升级构建基线，请在单独分支中更新 `integration/dsh.json` 并重做 `integration/dsh.patch`。在干净的目标提交上运行 `git apply --check`，再验证全部源码覆盖和依赖锁文件。基线升级不能代替支持版本的运行时测试。

## 测试

`npm test` 执行 OAuth、真实 Loader 组合和 UI 的三个定向测试文件。源码迁移还需要执行 `npm run build`，才能发现缺失的工作区依赖和生成产物。文档校验使用 `npm run check:docs`。

浏览器测试需要 Chrome 和已经生成的安装包。在本仓库根目录运行：

```sh
npm run test:browser
```

脚本将测试依赖固定为构建基线的整套框架版本，再安装 `dist/` 中的插件压缩包。不要直接在空目录中让 npm 自动选择宽松 peer 范围内的版本，否则它可能混装 rc 与 alpha 的框架包；正常使用仍通过 DSH 插件管理器安装。

定向浏览器测试验证授权入口、取消、标准/Fast 设置和 ARIA 快照。它不证明真实账号能使用任何指定模型。

发行运行时兼容检查需要使用隔离的 `DSH_HOME`，经正常 `dsh plugin --profile web add --ignore-scripts <安装包>` 安装并启动 `dsh --profile web --no-open --port 0`，把启动输出写入本地日志。然后在 `.work/dsh` 中执行：

```sh
node plugins/starbridge/verify-runtime.mjs <运行时安装目录> <Web启动日志>
```

此探测会修改测试配置的速度档位、发起再取消 OAuth，并恢复原档位。因此只对不含真实账号的隔离测试主目录运行。它会检查已支持版本的接受、未测试版本的拒绝、配置写入、官方授权地址及取消后的监听器释放。日志含本地访问令牌，不能提交到 GitHub。

在源码仓库根目录运行 `node scripts/verify-browser.mjs <Web启动日志>`，可对同一个 `0.2.1-rc.2` 发行运行时执行 Chrome 验证：账号状态订阅、授权发起/取消、回调释放，以及 Fast/标准设置刷新后保持。脚本复用 `.work/dsh` 的 Playwright，使用新的浏览器上下文；只对测试主目录运行，成功后处理速度为标准。

## 打包与发布

发行清单位于 `overlay/plugins/starbridge/package.json`，不是仓库根目录的私有工具清单。修改代码后，先递增版本，同时更新两个语言的发行 README，再重新构建和验证。

```sh
npm run build
npm test
npm run check:docs
```

压缩包在 `dist/`。用 DSH 插件管理器安装这个确切产物完成验证，然后才运行 `npm publish <压缩包路径> --access public --tag latest`。需要 npm 发布权限与双重验证；不要提交发布令牌。已发布的 npm 版本不能覆盖。

Fork 后应使用自己的 npm 名称，并同步修改 bundle 中的包名及文档示例。Host / Client 源码所有者名称由构建脚本重映射为发行包名。GitHub 仓库根清单设置了 `private: true`，避免误发源码工具仓库。

## 现有验证与限制

发布 `0.1.0-beta.3` 前已完成 19 项定向单元/组合/UI 测试、2 项 Chrome 发行测试，以及两个声明版本的运行时探测；rc.2 安装与卸载未使用版本豁免。文档检查为 43 项通过。

`0.1.0-beta.6` 增加 `0.2.1-rc.2` 及其 Cordis/Schemastery 发行版本的精确 peer 范围，保持构建基线和业务代码不变。该版本完成构建、19 项定向测试、2 项构建基线 Chrome 测试，以及 rc.2 发行运行时的正常安装、Remote 探测、Chrome 设置持久化和卸载检查。

此前 DSH 全量 hygiene 有一个已知的上游 `vendor-rescope` 检查失败（17 处已有残留）；其他 18 项通过。这里不将全量 hygiene 声称为通过。真实 ChatGPT 授权与付费模型推理、Windows 和 Linux 均不在已验证范围内。

本仓库不会自动发布 npm 包。提交前至少运行构建、定向测试、文档检查和 `git diff --check`，并检查产物不包含 `.env`、凭据、缓存或会话日志。
