/** Browser authorization through the Loader, durable credentials and the real Responses serializer. */
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { exportJWK, generateKeyPair, SignJWT } from 'jose'
import { afterEach, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import { profileComposition } from '../../../settings/settings/tests/profile-composition.ts'
import Include from '@deepseek-ai/cordis-plugin-include'
import type { ModuleLoaderV2 } from '@deepseek-ai/cordis-plugin-loader'
import LlmRuntime, { createUserMessage, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import AuthorizationService from '@deepseek-ai/dsh-authorization'
import LocalCredentialProvider from '@deepseek-ai/dsh-credentials-local'
import { credentialKey } from '@deepseek-ai/dsh-credentials'
import * as LlmPiAi from '../src/index.ts'
import { resolveProfiles } from '@deepseek-ai/dsh-llm-pi-ai/src/config.ts'
import { assemble } from '../../llm-pi-ai/tests/assemble.ts'

let ctx: Context | undefined
let root: string | undefined
const realFetch = globalThis.fetch

afterEach(async () => {
  await ctx?.fiber.dispose()
  ctx = undefined
  vi.unstubAllGlobals()
  if (root) await rm(root, { force: true, recursive: true })
  root = undefined
})

async function boot(serviceTier?: string) {
  root = await mkdtemp(join(tmpdir(), 'dsh-chatgpt-'))
  const configPath = join(root, 'cordis.yml')
  await writeFile(configPath, [
    '- name: llm', '- name: credentials', '  config:', `    path: ${JSON.stringify(join(root, 'credentials.yml'))}`,
    '    watch: false', '- name: authorization', '- id: starbridge', '  name: pi-ai', '  config:',
    `    serviceTier: ${serviceTier ?? 'default'}`,
  ].join('\n'))
  const context = new Context()
  ctx = context
  context.baseUrl = pathToFileURL(root).href + '/'
  await context.plugin(Loader)
  const modules = new Map<string, unknown>([['llm', LlmRuntime], ['credentials', LocalCredentialProvider],
    ['authorization', AuthorizationService], ['pi-ai', LlmPiAi]])
  const internal: ModuleLoaderV2 = {
    version: 'v2', loadCache: new Map(),
    import: (specifier) => { if (!modules.has(specifier)) throw new Error(`Unexpected module ${specifier}`); return Promise.resolve(modules.get(specifier)) },
    register(): never { throw new Error('Unexpected register') },
    getOrCreateModuleJob(): never { throw new Error('Unexpected module job') },
    resolveSync(): never { throw new Error('Unexpected sync resolve') },
    load(): never { throw new Error('Unexpected load') },
  }
  context.loader.internal = internal
  context.loader.builtins.include = Include
  await profileComposition(context, root, configPath)
  await context.loader.await()
  expect(context.get('llm')).toBeDefined()
  expect(context.get('credentials')).toBeDefined()
  expect(context.get('authorization')).toBeDefined()
  await vi.waitFor(() => { expect(context.get('chatGpt')).toBeDefined() })
  return context
}

async function authorize(context: Context, options: { expired?: boolean; revokeFailure?: boolean } = {}) {
  const { privateKey, publicKey } = await generateKeyPair('RS256')
  const key = await exportJWK(publicKey)
  let refreshes = 0
  const requests: { url: string; body: unknown; authorization: string | null }[] = []
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : input.toString()
    if (url.startsWith('http://127.0.0.1:')) return realFetch(input, init)
    if (url.endsWith('/.well-known/openid-configuration')) return Response.json({ issuer: 'https://auth.openai.com',
      jwks_uri: 'https://auth.openai.com/.well-known/jwks.json', revocation_endpoint: 'https://auth.openai.com/oauth/revoke' })
    if (url.endsWith('/jwks.json')) return Response.json({ keys: [{ ...key, kid: 'test', alg: 'RS256' }] })
    if (url.endsWith('/oauth/revoke')) return new Response(null, { status: options.revokeFailure ? 503 : 200 })
    if (url.endsWith('/oauth/token')) {
      const body = new URLSearchParams(init?.body instanceof URLSearchParams ? init.body : '')
      const isRefresh = body.get('grant_type') === 'refresh_token'
      if (isRefresh) refreshes++
      const idToken = await new SignJWT({ nonce: auth?.searchParams.get('nonce'), email: 'tester@example.com' })
        .setProtectedHeader({ alg: 'RS256', kid: 'test' }).setIssuer('https://auth.openai.com').setAudience('oaiapp_test')
        .setSubject('subject').setIssuedAt().setExpirationTime('5m').sign(privateKey)
      return Response.json({ access_token: isRefresh ? 'renewed' : 'initial', refresh_token: 'refresh', id_token: idToken,
        expires_in: !isRefresh && options.expired ? 1 : 3600, token_type: 'Bearer', scope: 'openid resource.invoke chatgpt.tokens.use.direct' })
    }
    requests.push({ url, body: JSON.parse(typeof init?.body === 'string' ? init.body : '{}'), authorization: new Headers(init?.headers).get('authorization') })
    const item = { type: 'message', id: 'msg_test', role: 'assistant', status: 'in_progress', content: [] }
    const events = [
      { type: 'response.output_item.added', output_index: 0, item },
      { type: 'response.content_part.added', item_id: item.id, output_index: 0, content_index: 0,
        part: { type: 'output_text', text: '', annotations: [] } },
      { type: 'response.output_text.delta', item_id: item.id, output_index: 0, content_index: 0, delta: 'Hello' },
      { type: 'response.output_item.done', output_index: 0, item: { ...item, status: 'completed',
        content: [{ type: 'output_text', text: 'Hello', annotations: [] }] } },
      { type: 'response.completed', response: { id: 'resp_test', status: 'completed',
        usage: { input_tokens: 2, output_tokens: 1, total_tokens: 3 } } },
    ]
    return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''), {
      headers: { 'content-type': 'text/event-stream' },
    })
  })
  const state = await context.chatGpt.startSignIn(null)
  const auth = new URL(state.attempt!.url!)
  const callback = new URL(auth.searchParams.get('redirect_uri')!)
  callback.searchParams.set('state', auth.searchParams.get('state')!)
  callback.searchParams.set('code', 'code')
  callback.searchParams.set('client_id', 'oaiapp_test')
  await realFetch(callback)
  await vi.waitFor(async () => { expect((await context.chatGpt.getState()).attempt?.status).toBe('complete') })
  return { requests, refreshes: () => refreshes, callback }
}

it('keeps tokens on the Host, serializes refresh, and sends a stateless official Responses request', async () => {
  const context = await boot()
  const mock = await authorize(context, { expired: true })
  expect(await Promise.all([context.chatGpt.accessToken(), context.chatGpt.accessToken()])).toEqual(['renewed', 'renewed'])
  expect(mock.refreshes()).toBe(1)
  const state = await context.chatGpt.getState()
  expect(JSON.stringify(state)).not.toContain('renewed')
  expect(state.accounts).toEqual([{ id: 'oaiapp_test', email: 'tester@example.com', signedIn: true }])
  const result = await assemble(context, { provider: 'starbridge-chatgpt', model: 'gpt-5.5', messages: [createUserMessage({
    source: { kind: 'user' }, content: [{ type: 'text', text: 'Hello' }],
  })] })
  expect(result.finish).toEqual({ kind: 'stop' })
  expect(mock.requests).toHaveLength(1)
  expect(mock.requests[0]).toMatchObject({ url: 'https://api.openai.com/v1/responses', authorization: 'Bearer renewed',
    body: { store: false, stream: true } })
  expect(mock.requests[0]?.body).not.toHaveProperty('max_output_tokens')
  expect(mock.requests[0]?.body).not.toHaveProperty('previous_response_id')
  await expect(JSON.stringify(mock.requests[0]?.body, null, 2) + '\n').toMatchFileSnapshot('./expected/chatgpt-request.json')
})

it('clears local tokens on failed revocation while retaining the registration and host identity', async () => {
  const context = await boot()
  await authorize(context, { revokeFailure: true })
  const before = await context.credentials.readRecord(credentialKey('chatgpt', 'accounts'))
  const state = await context.chatGpt.getState()
  expect(await context.chatGpt.signOut(state.accounts[0]!.id)).toBe(false)
  expect((await context.chatGpt.getState()).activeId).toBeNull()
  expect((await context.chatGpt.getState()).accounts[0]?.signedIn).toBe(false)
  const after = await context.credentials.readRecord(credentialKey('chatgpt', 'accounts'))
  expect(after).toMatchObject({ kind: 'grant', payload: { accounts: [{ clientId: 'oaiapp_test', subject: 'subject' }] } })
  expect(JSON.stringify(after)).not.toContain('refresh')
  expect(before?.kind).toBe('grant')
  expect(after?.kind).toBe('grant')
  if (before?.kind === 'grant' && after?.kind === 'grant') {
    expect(after.payload).toMatchObject({ hostId: (before.payload as { hostId: string }).hostId })
  }
  await expect(context.chatGpt.accessToken()).rejects.toThrow('sign-in-required')
})

it('cancels authorization and closes its loopback listener before returning', async () => {
  const context = await boot()
  const pending = await context.chatGpt.startSignIn(null)
  const callback = new URL(new URL(pending.attempt!.url!).searchParams.get('redirect_uri')!)
  const state = await context.chatGpt.cancelSignIn(pending.attempt!.id)
  expect(state.attempt?.status).toBe('cancelled')
  expect(state.accounts).toEqual([])
  await expect(realFetch(callback)).rejects.toThrow()
})

it('refuses alternate endpoints and API-key overrides on the ChatGPT route', () => {
  expect(() => resolveProfiles({ chatgpt: { baseURL: 'https://example.com/v1' } })).toThrow('official')
  expect(() => resolveProfiles({ chatgpt: { apiKeyEnv: 'OPENAI_API_KEY' } })).toThrow('authorization')
})

it.each(['fast', 'default'])('sends the requested ChatGPT %s tier without changing reasoning', async (tier) => {
  const context = await boot(tier)
  const mock = await authorize(context)
  const result = await assemble(context, { provider: 'starbridge-chatgpt', model: 'gpt-5.5', reasoningEffort: ReasoningEffortId('high'), messages: [createUserMessage({
    source: { kind: 'user' }, content: [{ type: 'text', text: 'Hello' }],
  })] })
  expect(result.finish).toEqual({ kind: 'stop' })
  expect(mock.requests[0]?.body).toMatchObject({ service_tier: tier, reasoning: { effort: 'high' }, store: false, stream: true })
  await expect(JSON.stringify(mock.requests[0]?.body, null, 2) + '\n')
    .toMatchFileSnapshot(`./expected/chatgpt-${tier}-request.json`)
})

it('rejects ChatGPT service tiers on unrelated provider routes', () => {
  expect(() => resolveProfiles({ anthropic: { serviceTier: 'fast' } })).toThrow('chatgpt route')
})

it('withdraws the model route and pending callback when its plugin is disposed', async () => {
  const context = await boot()
  const llm = context.llm
  expect(llm.listProviders()).toContainEqual({ id: 'starbridge-chatgpt', name: 'Starbridge · ChatGPT' })
  expect((await llm.listModels('starbridge-chatgpt')).length).toBeGreaterThan(0)
  const pending = await context.chatGpt.startSignIn(null)
  const callback = new URL(new URL(pending.attempt!.url!).searchParams.get('redirect_uri')!)
  const entry = [...context.loader.entries()].find(value => value.options.id === 'starbridge')
  expect(entry?.fiber).toBeDefined()
  await entry!.fiber!.dispose()
  expect(llm.listProviders()).toEqual([])
  expect(context.get('chatGpt')).toBeUndefined()
  await expect(realFetch(callback)).rejects.toThrow()
})
