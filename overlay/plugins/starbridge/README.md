# Starbridge · ChatGPT

English | [中文](README.zh.md)

[Source code](https://github.com/kongxiaoan/dsh-starbridge) · [DSH integration](https://github.com/kongxiaoan/dsh-starbridge/blob/main/docs/dsh-integration.md) · [Development guide](https://github.com/kongxiaoan/dsh-starbridge/blob/main/docs/development.md) · [Report an issue](https://github.com/kongxiaoan/dsh-starbridge/issues)

![Starbridge](icon.svg)

**Your ChatGPT plan, inside DeepSeek Harness.** Starbridge is a community plugin for official browser sign-in, account switching, credential renewal, and optional Fast processing. It does not request your ChatGPT password or read Codex credentials.

## Supported versions

| Component | This release |
| --- | --- |
| Starbridge | `0.1.0-beta.6` |
| DeepSeek Harness Desktop / Web | **`0.2.0-rc.2`, `0.2.1-alpha.2`, and `0.2.1-rc.2`** |
| Verified platform | macOS Apple Silicon |
| Windows / Linux | Not validated for this beta |
| Earlier or later Harness versions | Not declared compatible; installation checks the listed framework peer versions |
| Desktop Node.js | Uses the desktop application's bundled runtime |
| Standalone Web Node.js | `^22.19.0` or `>=24.0.0`, matching Harness |

This is a preview release. Matching a version does not grant ChatGPT model or Fast entitlement. OpenAI controls account eligibility, model access, limits, and processing tier.

## Install

In DeepSeek Harness Desktop, open **Plugins → Install** and enter the exact package specification:

```text
@kongpingan/dsh-starbridge@0.1.0-beta.6
```

Select the installed Starbridge bundle. Restart the desktop app when the plugin manager requests it, after ongoing tasks have finished. For a standalone Harness Web profile, use its CLI:

```sh
dsh plugin --profile web add --ignore-scripts @kongpingan/dsh-starbridge@0.1.0-beta.6
```

After CLI installation, open Plugins and enable Starbridge. `--ignore-scripts` avoids dependency build prompts; Starbridge does not need installation scripts. The package installs one optional bundle. It adds its own settings card and `starbridge-chatgpt` model route; it does not replace existing model providers.

## Sign in and use a model

1. Open **Settings → Models → Starbridge · ChatGPT**.
2. Choose **Continue with ChatGPT**. Complete the official OpenAI sign-in and consent in your browser. If a popup is blocked, use **Open sign-in page**.
3. Return to Harness. Select an account and choose **Use account** if necessary.
4. Select a model under **Starbridge · ChatGPT** in the conversation model picker, then send a short message.

Browser and Harness Host must run on the same machine: OAuth returns to a temporary `127.0.0.1` callback. Remote-host browser sign-in is not supported by this release. The bundled model catalog is a list of candidates, not proof that your account can use each one.

In the same card, choose **Standard** or **Fast** under Processing speed. This saves immediately and applies to subsequent model requests, without changing reasoning effort or interrupting an in-flight request. Fast may consume more plan usage. An unsupported tier or model remains a visible provider failure; the plugin does not silently switch accounts, models, or billing credentials.

![Starbridge settings, captured from the local test build](settings.png)

## Security and account removal

Starbridge uses official Sign in with ChatGPT, PKCE, callback state, signed ID-token validation, and the public Responses API with streaming and `store: false`. Tokens stay on the Host in the existing Harness credential store; the renderer receives account labels and pending authorization state. Refresh is serialized through the credential store. Do not include your Harness home or credential files in bug reports.

**Sign out** removes local tokens and attempts remote revocation. If revocation fails, disconnect the application in [ChatGPT settings](https://chatgpt.com/settings/usage). Uninstalling the plugin preserves credentials and conversations; sign out first when you want to remove access. Reinstalling in the same Harness home can reuse the saved registration.

## Disable or uninstall

Finish running tasks and choose another provider as the conversation's model. Disable or remove Starbridge in the Plugins panel. Existing conversations remain readable; further requests using `starbridge-chatgpt` require reinstalling the plugin or selecting another provider. For a standalone Web profile:

```sh
dsh plugin --profile web remove @kongpingan/dsh-starbridge
```

If you tested the earlier built-in prototype, use the new **Starbridge · ChatGPT** route. The old `chatgpt` provider row is not this plugin; remove that row through Models settings when no longer needed. The existing ChatGPT credential record is reused.

## Troubleshooting

- **Dependency build approval:** the desktop plugin manager may ask about transitive SDK dependencies. Review that prompt before retrying installation.
- **Incompatible version:** use one of the listed supported Harness releases; do not bypass the peer-version check.
- **Browser succeeded but app is still waiting:** ensure the browser and Host are on the same computer and the callback is not blocked; cancel and start a new attempt.
- **Sign-in expired:** sign in again using the saved account. Repeated authentication failures require checking the account's application authorization.
- **Usage limit or unsupported model:** inspect [ChatGPT usage](https://chatgpt.com/settings/usage) and select an eligible model. API-key billing is not a fallback.

## Development and verification

The Host owner is `packages/llm/starbridge`; the browser owner is `packages/client/ui-starbridge`. `plugins/starbridge/build.mjs` builds one distributable from these owners and the shared Harness pi-ai adapter. Framework services remain peers restricted to the listed tested releases; the package includes its own generated Remote descriptors and browser artifact. Build from this repository after the normal Host/Client build:

```sh
node plugins/starbridge/build.mjs
npm pack ./.artifacts/starbridge/package --pack-destination .artifacts/starbridge
npm install --prefix .artifacts/starbridge/clean-install --ignore-scripts ./.artifacts/starbridge/kongpingan-dsh-starbridge-0.1.0-beta.6.tgz
DSH_TEST_BROWSER_CHANNEL=chrome pnpm exec vitest run --config plugins/starbridge/vitest.config.ts
```

Tests cover OAuth callback validation, token renewal, cancellation, revocation failure, streamed Requests, service-tier serialization, and browser controls. Compatibility evidence and publication checks are recorded with the release artifacts. Live account access still depends on the user's consent and entitlement.

The release peer ranges are explicit in `plugins/starbridge/package.json`; the build rejects undeclared framework imports. `verify-runtime.mjs` checks all supported versions and rejects untested versions, then probes settings writes and OAuth start/cancel against an isolated running Web profile. Pass the runtime installation directory and its startup log; use a test home without real accounts.

```sh
node plugins/starbridge/verify-runtime.mjs <runtime-installation> <web-startup-log>
```

## License and affiliation

MIT; includes MIT-licensed DeepSeek Harness components. Starbridge is not an official OpenAI or DeepSeek product. Official protocol references: [Sign in with ChatGPT](https://developers.openai.com/siwc/token-sharing-open-source), [preview limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations), and [Fast mode](https://developers.openai.com/api/docs/guides/fast-mode). Paid or remotely hosted distribution needs a separate review of OpenAI's applicable integration conditions.
