# 在 DSH 中使用星桥

## 选择集成方式

日常使用优先安装 npm bundle。只有修改星桥实现或研究 DSH 扩展点时，才需要源码构建。本仓库不要求修改 Agent Loop，也不会替换已有提供方。

| 使用场景 | 入口 |
| --- | --- |
| 已安装的 DSH 桌面端 | 插件面板安装 npm 包 |
| 已构建的 DSH 开源项目 | 项目根目录 `pnpm dsh plugin --profile web add ...` |
| 独立 npm CLI | `dsh plugin --profile web add ...` |
| 修改星桥源码 | 本仓库 `npm run prepare:dsh`、`npm run build` |

## npm 插件

支持 DSH `0.2.0-rc.2`、`0.2.1-alpha.2` 和 `0.2.1-rc.2`。在已有 DSH 源码项目根目录运行：

```sh
pnpm dsh plugin --profile web add --ignore-scripts @kongpingan/dsh-starbridge@0.1.0-beta.6
pnpm dsh --profile web
```

`--ignore-scripts` 跳过安装依赖的生命周期脚本；星桥运行不需要这些脚本。插件管理器会将 bundle 写入目标 profile，再由 DSH 组合加载 Host 与 Client。请查看命令的安装结果，出现错误时先处理错误，不要继续启动并假定安装成功。

插件面板应显示星桥，模型设置中应出现「星桥 · ChatGPT」。未出现时确认安装的 profile 与启动的 profile 相同。桌面端使用 `desktop`，这里的命令使用 `web`。

## 本地修改后的安装包

在本仓库构建后，将实际生成的压缩包绝对路径交给 DSH 插件管理器：

```sh
pnpm dsh plugin --profile web add --ignore-scripts /absolute/path/to/dsh-starbridge/dist/kongpingan-dsh-starbridge-0.1.0-beta.6.tgz
pnpm dsh --profile web
```

这里的路径是需要替换的示例。不要反复用相同包名、版本和文件路径覆盖旧压缩包来测试更新，包管理器可能复用缓存。修改版本号，生成新的包路径，再安装新包。

## 配置和扩展点

发行包的 `dsh.bundle.patch` 引入 `starbridge` 行。Host 注入已有 `llm`、`credentials`、`authorization` 和 `settings` 服务，注册独立提供方 `starbridge-chatgpt`；Client 在模型设置页的 `settings.models.footer` 扩展点挂载卡片。

通常直接通过界面修改处理速度。若需要 profile 级配置，按 DSH 的 patch 规则为 `starbridge` 行设置配置；不要再插入第二个同名实例。插件配置如下：

| 配置项 | 默认值 | 行为 |
| --- | --- | --- |
| `serviceTier` | `default` | `default` 或 `fast`，后续请求生效 |
| `signInTimeoutMs` | `600000` | 浏览器授权最长等待时间 |
| `requestTimeoutMs` | `30000` | 刷新令牌或撤销授权的请求时限 |

超时配置为 `1..2147483647` 的整数毫秒。高优先级配置覆盖可能使设置卡片的写入被拒绝；按错误信息移除冲突配置，不要绕过设置修订检查。

## 登录验收

1. 点击「使用 ChatGPT 继续」，确认打开 OpenAI 官方授权页。
2. 完成授权，返回 DSH，确认出现账号。
3. 选取账号有权使用的模型，发送一条短消息。
4. 如需 Fast，切换处理速度后再次发送；不能将有开关等同于账号具有 Fast 权限。

本版本使用同机回调，不支持远程 Host 的浏览器登录。错误应在界面显示；不允许悄悄回退到其他账号、模型或 API Key 计费。

## 停用和卸载

先结束相关任务并切换到其他模型提供方，再运行：

```sh
pnpm dsh plugin --profile web remove @kongpingan/dsh-starbridge
```

已有会话不会因卸载而删除，但继续使用星桥路由需要重新安装。卸载不撤销已保存的凭据；需要移除授权时应先退出登录。
