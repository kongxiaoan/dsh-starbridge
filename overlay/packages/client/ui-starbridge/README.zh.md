---
description: "Starbridge browser controls for independently installed ChatGPT access."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-starbridge

[English](README.md) | 中文

## 概述

在模型设置底部提供星桥账号和处理速度卡片。 发行包为 `@kongpingan/dsh-starbridge`；此工作区组件不单独发布。

## 目录

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

## Use this package

参见[星桥安装与兼容性指南](../../../plugins/starbridge/README.zh.md). 安装完整插件包，不要单独挂载此工作区组件。[LLM 子系统](../../../docs/subsystems/llm-streaming.zh.md) 负责模型请求语义。

## Understand the implementation

浏览器挂载生成的星桥 Remote 定义，订阅账号状态，并注册到 `settings.models.footer`。框架绑定的观察机制保持卡片状态更新，设置写入使用修订号。卸载会释放订阅、Remote 挂载和插槽内容。凭据不进入渲染进程。

## Model Experience

### Model requests

#### What the model sees

`starbridge-chatgpt` 路由经 Host 适配器传递所选对话已有的消息和工具；此包不增加提示词。

#### Token effect

不直接增加提示词 token。模型选择、回复长度和请求的服务档位决定提供方用量。

#### KV Cache effect

插件不增加对话前缀。缓存资格和保留策略仍由提供方控制。

## Known Limitations and Deferred Work

- 首个测试版仅声明支持 Harness `0.2.1-alpha.2`，已在本地 macOS Apple Silicon 验证；其他版本和平台需要独立验证。
- 模型目录不代表账号使用资格。Fast 处理取决于 OpenAI 支持，可能消耗更多套餐用量。

### 开发备注

发行构建将维护中的 Host、Client 组件和生成的 Remote 元数据合并。框架 peer 依赖使用精确版本，使安装流程能够拒绝不支持的运行时。
