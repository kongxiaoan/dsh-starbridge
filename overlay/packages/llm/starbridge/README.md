---
description: "Starbridge Host for independently installed ChatGPT access."
kind: "package-reference"
---

# @deepseek-ai/dsh-starbridge

English | [中文](README.zh.md)

## Summary

Owns official ChatGPT browser authorization and the independently registered `starbridge-chatgpt` model route. The distributable is `@kongpingan/dsh-starbridge`; this workspace package is not published separately.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

## Use this package

See the [Starbridge installation and compatibility guide](../../../plugins/starbridge/README.md). Install the complete bundle rather than mounting this workspace component alone. The [LLM subsystem](../../../docs/subsystems/llm-streaming.md) owns model request semantics.

## Understand the implementation

The Host reuses Harness credentials, authorization, settings, attachments and the pi-ai adapter. `serviceTier` is a live `default` or `fast` setting. `signInTimeoutMs` bounds browser consent and `requestTimeoutMs` bounds refresh and revocation. Credentials remain on the Host; `starbridge` Remote methods return account labels and pending authorization state. Disposal closes the callback listener and removes the model route.

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
