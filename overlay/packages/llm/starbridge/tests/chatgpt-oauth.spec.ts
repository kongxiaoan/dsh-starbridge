/** Official OAuth accepts only a matching callback and verified, plan-authorized identity. */
import { generateKeyPair, exportJWK, SignJWT } from 'jose'
import { describe, expect, it } from 'vitest'
import { authorizeChatGpt } from '../src/chatgpt-oauth.ts'

async function login(overrides: {
  nonce?: string
  scope?: string
  state?: string
  issuer?: string
  audience?: string
  expiration?: string
  clientId?: string
  subject?: string
} = {}) {
  const { privateKey, publicKey } = await generateKeyPair('RS256')
  const jwk = await exportJWK(publicKey)
  let authorization: URL | undefined
  let exchange: URLSearchParams | undefined
  const controller = new AbortController()
  const mockFetch: typeof fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : input.toString()
    if (url.endsWith('/.well-known/openid-configuration')) return Response.json({
      issuer: 'https://auth.openai.com', jwks_uri: 'https://auth.openai.com/.well-known/jwks.json',
      revocation_endpoint: 'https://auth.openai.com/oauth/revoke',
    })
    if (url.endsWith('/.well-known/jwks.json')) return Response.json({ keys: [{ ...jwk, kid: 'test', alg: 'RS256' }] })
    exchange = new URLSearchParams(init?.body instanceof URLSearchParams ? init.body : '')
    const token = await new SignJWT({ nonce: overrides.nonce ?? authorization?.searchParams.get('nonce'), email: 'test@example.com' })
      .setProtectedHeader({ alg: 'RS256', kid: 'test' }).setIssuer(overrides.issuer ?? 'https://auth.openai.com')
      .setAudience(overrides.audience ?? 'oaiapp_test').setSubject(overrides.subject ?? 'subject').setIssuedAt().setExpirationTime(overrides.expiration ?? '5m').sign(privateKey)
    return Response.json({ access_token: 'access', refresh_token: 'refresh', id_token: token,
      token_type: 'Bearer', expires_in: 3600, scope: overrides.scope ?? 'openid chatgpt.tokens.use.direct resource.invoke offline_access' })
  }
  const pending = authorizeChatGpt({ hostId: 'urn:uuid:ebf24b24-6d0c-4b5e-9aba-f7aca7df1d3a', signal: controller.signal, fetch: mockFetch,
    notify: (url) => {
      authorization = new URL(url)
      const callback = new URL(authorization.searchParams.get('redirect_uri')!)
      callback.searchParams.set('state', overrides.state ?? authorization.searchParams.get('state')!)
      callback.searchParams.set('code', 'code')
      callback.searchParams.set('client_id', overrides.clientId ?? 'oaiapp_test')
      void fetch(callback).then(() => { if (overrides.state) controller.abort() }).catch((error: unknown) => { controller.abort(error) })
    },
  })
  return { pending, getAuthorization: () => authorization!, getExchange: () => exchange }
}

describe('ChatGPT OAuth', () => {
  it('registers Harness with PKCE and validates the identity before returning a grant', async () => {
    const attempt = await login()
    const result = await attempt.pending
    expect(result).toMatchObject({ clientId: 'oaiapp_test', subject: 'subject', email: 'test@example.com', access: 'access' })
    const url = attempt.getAuthorization()
    expect(url.searchParams.get('agent_name_hint')).toBe('Starbridge for DeepSeek Harness')
    expect(url.searchParams.get('client_id')).toBe('dynamic_agent_client')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(new URL(url.searchParams.get('redirect_uri')!).hostname).toBe('127.0.0.1')
    expect(attempt.getExchange()?.get('redirect_uri')).toBe(url.searchParams.get('redirect_uri'))
    expect(attempt.getExchange()?.get('client_id')).toBe('oaiapp_test')
  })
  it('rejects an identity with a different nonce', async () => {
    const attempt = await login({ nonce: 'wrong' })
    await expect(attempt.pending).rejects.toThrow('identity')
  })
  it('rejects a grant without plan permission', async () => {
    const attempt = await login({ scope: 'openid profile email' })
    await expect(attempt.pending).rejects.toThrow('permission')
  })
  it('does not exchange a callback with a different state', async () => {
    const attempt = await login({ state: 'wrong' })
    await expect(attempt.pending).rejects.toThrow()
    expect(attempt.getExchange()).toBeUndefined()
  })
  it.each([
    { issuer: 'https://example.com' },
    { audience: 'oaiapp_other' },
    { expiration: '-1m' },
    { clientId: 'dynamic_agent_client' },
  ])('rejects an untrusted or expired identity: %j', async (overrides) => {
    const attempt = await login(overrides)
    await expect(attempt.pending).rejects.toThrow()
  })

})
