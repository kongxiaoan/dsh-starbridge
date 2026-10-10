/** Official public-client ChatGPT OAuth; credentials never pass through the renderer. */
import { createHash, randomBytes } from 'node:crypto'
import { createServer } from 'node:http'
import { createLocalJWKSet, jwtVerify } from 'jose'
import { z } from 'zod'
import { AuthorizationError } from '@deepseek-ai/dsh-authorization'

const ISSUER = 'https://auth.openai.com'
const RESOURCE = 'https://api.openai.com/v1'
const TOKEN_ENDPOINT = `${ISSUER}/api/accounts/oauth/token`
const PLAN_SCOPE = 'chatgpt.tokens.use.direct'

/** Validated registration retained even after its renewable session is removed. */
export const ChatGptRegistrationSchema = z.object({
  clientId: z.string().min(1), subject: z.string().min(1), email: z.string(),
  access: z.string().optional(), refresh: z.string().optional(), idToken: z.string().optional(),
  expires: z.number().optional(), scopes: z.array(z.string()).optional(),
})
/** Account identity and optional renewable credentials, stored only on the Host. */
export type ChatGptRegistration = z.infer<typeof ChatGptRegistrationSchema>

/** Pending login inputs; the fetch override is for deterministic protocol tests. */
export interface ChatGptLoginOptions {
  hostId: string
  registration?: ChatGptRegistration
  signal: AbortSignal
  notify: (url: string) => void
  fetch?: typeof fetch
}

function rejected(message: string): AuthorizationError {
  return new AuthorizationError(message, 'CHATGPT_AUTH_FAILED')
}

async function jsonResponse(response: Response): Promise<unknown> {
  if (!response.ok) throw rejected(`ChatGPT authorization request failed (HTTP ${response.status})`)
  return response.json()
}

const TokenSchema = z.object({
  access_token: z.string().min(1), refresh_token: z.string().min(1),
  id_token: z.string().optional(), token_type: z.literal('Bearer'),
  expires_in: z.number().positive(), scope: z.string(),
})

async function tokens(body: URLSearchParams, signal: AbortSignal, request: typeof fetch) {
  const token = TokenSchema.parse(await jsonResponse(await request(TOKEN_ENDPOINT, {
    method: 'POST', redirect: 'error', signal, body,
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
  })))
  const scopes = token.scope.split(/\s+/)
  if (!scopes.includes(PLAN_SCOPE) || !scopes.includes('resource.invoke')) {
    throw rejected('ChatGPT plan permission was not granted')
  }
  return { access: token.access_token, refresh: token.refresh_token,
    expires: Date.now() + token.expires_in * 1000, scopes, idToken: token.id_token }
}

async function discovery(signal: AbortSignal, request: typeof fetch) {
  const value = z.object({ issuer: z.literal(ISSUER), jwks_uri: z.url(), revocation_endpoint: z.url() })
    .parse(await jsonResponse(await request(`${ISSUER}/.well-known/openid-configuration`, { signal, redirect: 'error' })))
  for (const endpoint of [value.jwks_uri, value.revocation_endpoint]) {
    const url = new URL(endpoint)
    if (url.origin !== ISSUER || url.username || url.password || url.hash) throw rejected('Invalid ChatGPT discovery endpoint')
  }
  return value
}

async function verifyIdentity(idToken: string, clientId: string, signal: AbortSignal, request: typeof fetch) {
  const metadata = await discovery(signal, request)
  const jwks = z.object({ keys: z.array(z.record(z.string(), z.unknown())) })
    .parse(await jsonResponse(await request(metadata.jwks_uri, { signal, redirect: 'error' })))
  const { payload } = await jwtVerify(idToken, createLocalJWKSet(jwks), {
    issuer: ISSUER, audience: clientId, requiredClaims: ['sub', 'exp', 'iat'], algorithms: ['RS256'],
  })
  if (!payload.sub || typeof payload.iat !== 'number' || payload.iat > Date.now() / 1000 + 60) {
    throw rejected('ChatGPT identity token has an invalid issue time or subject')
  }
  return { subject: payload.sub, email: typeof payload.email === 'string' ? payload.email : payload.sub, nonce: payload.nonce }
}

/**
 * Complete browser OAuth with a one-use IPv4 loopback callback and verified ID token.
 * @param options - installation identity, selected registration and cancellation owner.
 * @returns validated identity and credentials; the caller owns the atomic commit.
 */
export async function authorizeChatGpt(options: ChatGptLoginOptions): Promise<ChatGptRegistration> {
  const request = options.fetch ?? fetch
  options.signal.throwIfAborted()
  const state = randomBytes(32).toString('base64url')
  const nonce = randomBytes(32).toString('base64url')
  const verifier = randomBytes(64).toString('base64url')
  const callback = Promise.withResolvers<{ code: string; clientId: string }>()
  // The listener may reject before the browser URL is published.
  void callback.promise.catch((_error: unknown) => { /* The awaited callback below reports this failure. */ })
  let consumed = false
  const server = createServer((req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Content-Security-Policy', "default-src 'none'")
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    if (req.method !== 'GET' || url.pathname !== '/auth/callback' || url.searchParams.get('state') !== state || consumed) {
      res.writeHead(400).end('Invalid authorization callback')
      return
    }
    consumed = true
    const code = url.searchParams.get('code')
    const clientId = url.searchParams.get('client_id') ?? options.registration?.clientId
    if (url.searchParams.has('error') || !code || !clientId || clientId === 'dynamic_agent_client'
      || (options.registration !== undefined && clientId !== options.registration.clientId)) {
      callback.reject(rejected('ChatGPT authorization was declined or incomplete'))
      res.writeHead(400).end('Authorization failed. Return to DeepSeek Harness.')
      return
    }
    callback.resolve({ code, clientId })
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' })
      .end('Return to DeepSeek Harness to finish signing in. 请返回 DeepSeek Harness 查看登录结果。')
  })
  const abort = (): void => { callback.reject(options.signal.reason) }
  options.signal.addEventListener('abort', abort, { once: true })
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => { server.removeListener('error', reject); resolve() })
    })
    options.signal.throwIfAborted()
    const address = server.address()
    if (address === null || typeof address === 'string') throw rejected('ChatGPT callback listener did not start')
    const redirectUri = `http://127.0.0.1:${address.port}/auth/callback`
    const url = new URL(`${ISSUER}/api/accounts/authorize`)
    url.search = new URLSearchParams({
      client_id: options.registration?.clientId ?? 'dynamic_agent_client',
      ...options.registration === undefined ? { agent_name_hint: 'Starbridge for DeepSeek Harness' } : {},
      ext_agent_host_id: options.hostId, response_type: 'code', redirect_uri: redirectUri,
      resource: RESOURCE, scope: `openid profile email offline_access resource.invoke ${PLAN_SCOPE}`,
      state, nonce, code_challenge_method: 'S256',
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    }).toString()
    options.notify(url.href)
    const result = await callback.promise
    const grant = await tokens(new URLSearchParams({
      grant_type: 'authorization_code', client_id: result.clientId, code: result.code,
      code_verifier: verifier, redirect_uri: redirectUri, resource: RESOURCE,
    }), options.signal, request)
    if (!grant.idToken) throw rejected('ChatGPT identity token is missing')
    const identity = await verifyIdentity(grant.idToken, result.clientId, options.signal, request)
    if (identity.nonce !== nonce || (options.registration && identity.subject !== options.registration.subject)) {
      throw rejected('ChatGPT identity did not match this authorization attempt')
    }
    options.signal.throwIfAborted()
    return { ...grant, clientId: result.clientId, subject: identity.subject, email: identity.email }
  } finally {
    options.signal.removeEventListener('abort', abort)
    await new Promise<void>((resolve) => { server.close(() =>{  resolve() }); server.closeAllConnections() })
  }
}

/**
 * Renew a registration while retaining verified identity; call under the credential-store lock.
 * @param account - registration with the latest rotating refresh token.
 * @param signal - request lifetime.
 * @param request - HTTP implementation.
 * @returns replacement credentials belonging to the same registration.
 */
export async function refreshChatGpt(
  account: ChatGptRegistration, signal: AbortSignal, request: typeof fetch = fetch,
): Promise<ChatGptRegistration> {
  if (!account.refresh) throw rejected('ChatGPT sign-in is required')
  const renewed = await tokens(new URLSearchParams({ grant_type: 'refresh_token', client_id: account.clientId,
    refresh_token: account.refresh, resource: RESOURCE }), signal, request)
  if (renewed.idToken) {
    const identity = await verifyIdentity(renewed.idToken, account.clientId, signal, request)
    if (identity.subject !== account.subject) throw rejected('ChatGPT refreshed identity changed accounts')
  }
  signal.throwIfAborted()
  return { ...account, ...renewed, idToken: renewed.idToken ?? account.idToken }
}

/**
 * End the renewable session; the caller clears local tokens even when revocation fails.
 * @param account - selected registration.
 * @param signal - bounded network lifetime.
 * @param request - HTTP implementation.
 * @returns after the issuer confirms revocation.
 */
export async function revokeChatGpt(account: ChatGptRegistration, signal: AbortSignal, request: typeof fetch = fetch): Promise<void> {
  if (!account.refresh) return
  const metadata = await discovery(signal, request)
  const response = await request(metadata.revocation_endpoint, { method: 'POST', signal, redirect: 'error',
    body: new URLSearchParams({ token: account.refresh, token_type_hint: 'refresh_token', client_id: account.clientId }),
    headers: { 'content-type': 'application/x-www-form-urlencoded' } })
  if (!response.ok) throw rejected('ChatGPT session revocation was not confirmed')
}
