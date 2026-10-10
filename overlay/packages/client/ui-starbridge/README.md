---
description: "Starbridge browser controls for independently installed ChatGPT access."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-starbridge

English | [中文](README.zh.md)

## Summary

Contributes the Starbridge account and processing-speed card to the Models settings footer. The distributable is `@kongpingan/dsh-starbridge`; this workspace package is not published separately.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

## Use this package

See the [Starbridge installation and compatibility guide](../../../plugins/starbridge/README.md). Install the complete bundle rather than mounting this workspace component alone. The [LLM subsystem](../../../docs/subsystems/llm-streaming.md) owns model request semantics.

## Understand the implementation

The browser mounts the generated Starbridge Remote contribution, subscribes to account state, and registers in `settings.models.footer`. Framework-bound observation keeps the card current; settings writes use revisions. Unloading disposes the stream, Remote mount and slot contribution. Credentials never enter the renderer.

## Model Experience

### Model requests

#### What the model sees

The `starbridge-chatgpt` route passes the selected conversation's existing messages and tools through the Host adapter; this package adds no prompt text.

#### Token effect

No direct prompt-token overhead. Model choice, response length and the requested service tier determine provider usage.

#### KV Cache effect

The plugin adds no conversation prefix. Cache eligibility and retention remain provider-controlled.

## Known Limitations and Deferred Work

- The first beta declares only Harness `0.2.1-alpha.2` and has local macOS Apple Silicon validation. Other versions and platforms require qualification.
- The model catalog does not establish account entitlement. Fast processing depends on OpenAI support and can consume more plan usage.

### Dev Note

The release builder combines the maintained Host and Client owners with generated Remote metadata. It preserves exact framework peer versions so installation can reject unsupported runtimes.
