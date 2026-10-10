/** ChatGPT account ownership, bounded browser login and atomic credential renewal. */
import type {} from '@deepseek-ai/cordis-plugin-loader'
import { randomUUID } from 'node:crypto'
import { Context } from '@deepseek-ai/cordis'
import { credentialKey, type CredentialRecord } from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-authorization'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { brandString } from '@deepseek-ai/dsh-brand'
import { z } from 'zod'
import { authorizeChatGpt, ChatGptRegistrationSchema, refreshChatGpt, revokeChatGpt } from './chatgpt-oauth.ts'
import type { ChatGptAccountId, ChatGptAttemptId, ChatGptView } from './chatgpt-types.ts'

const KEY = credentialKey('chatgpt', 'accounts')
const StoredSchema = z.object({ version: z.literal(1), hostId: z.uuid(),
  activeId: z.string().nullable(), accounts: z.array(ChatGptRegistrationSchema) })
type Stored = z.infer<typeof StoredSchema>

function stored(record: CredentialRecord | undefined): Stored {
  if (!record) return { version: 1, hostId: randomUUID(), activeId: null, accounts: [] }
  if (record.kind !== 'grant') throw new Error('Invalid ChatGPT credential record')
  return StoredSchema.parse(record.payload)
}
function record(value: Stored): CredentialRecord {
  return { kind: 'grant', payload: JSON.parse(JSON.stringify(value)) }
}

declare module '@deepseek-ai/cordis' {
  interface Context { chatGpt: ChatGptController }
}
declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    'chatgpt/rejected': { reason: 'busy' | 'missing-account' | 'sign-in-required' }
  }
}

/** Deployment-owned lifetimes for interactive login and individual OAuth requests. */
export interface ChatGptOptions {
  serviceTier?: () => 'default' | 'fast'
  signInTimeoutMs: number
  requestTimeoutMs: number
}

/** One installation's ChatGPT registrations; all token-bearing operations stay on the Host. */
export class ChatGptController extends TypertRemoteService {
  static inject = ['credentials', 'authorization']
  private attempt: { view: NonNullable<ChatGptView['attempt']>; abort: AbortController; done: Promise<void>; committing: boolean } | undefined
  private readonly listeners = new Set<() => void>()
  private readonly lifetime = new AbortController()
  /**
   * Mount account operations with the owning credential store.
   * @param ctx - Host credential and authorization services.
   * @param options - bounded operation lifetimes.
   */
  constructor(ctx: Context, private readonly options: ChatGptOptions) {
    super(ctx, 'chatGpt', { namespace: 'starbridge' })
    ctx.on('loader/volatile-update', () => { this.publish() })
    ctx.effect(() => async () => {
      this.lifetime.abort()
      if (!this.attempt?.committing) this.attempt?.abort.abort()
      await this.attempt?.done
    }, 'ChatGPT authorization lifetime')
  }

  /**
   * Observe safe account state until the subscriber disconnects.
   * @param signal - subscriber lifetime.
   * @returns initial state and committed changes.
   */
  @Remote({ mode: 'stream' })
  async *watch(signal: AbortSignal): AsyncIterable<ChatGptView> {
    let dirty = true
    let wake: (() => void) | undefined
    const update = (): void => { dirty = true; wake?.() }
    this.listeners.add(update)
    const stop = this.ctx.on('credentials/record-updated', (key) => { if (key === KEY) update() })
    signal.addEventListener('abort', update, { once: true })
    try {
      while (!signal.aborted) {
        if (dirty) { dirty = false; yield await this.getState(); continue }
        await new Promise<void>((resolve) => { wake = resolve })
      }
    } finally { stop(); this.listeners.delete(update); signal.removeEventListener('abort', update) }
  }

  private publish(): void { for (const listener of this.listeners) listener() }

  /**
   * Read account labels without exposing credential material.
   * @returns saved identities and pending login state without tokens.
   */
  @Remote
  async getState(): Promise<ChatGptView> {
    const value = stored(await this.ctx.credentials.readRecord(KEY))
    return { serviceTier: this.options.serviceTier?.() ?? 'default', activeId: value.activeId === null ? null : brandString<ChatGptAccountId>(value.activeId),
      accounts: value.accounts.map(account => ({ id: brandString<ChatGptAccountId>(account.clientId),
        email: account.email, signedIn: account.refresh !== undefined })),
      attempt: this.attempt ? { ...this.attempt.view } : null }
  }

  /**
   * Start registration or reauthorize a saved account. Existing active credentials survive failure.
   * @param accountId - saved registration, or null to add an account.
   * @returns state once the browser URL is available or the attempt has failed.
   */
  @Remote
  async startSignIn(accountId: ChatGptAccountId | null): Promise<ChatGptView> {
    this.assertIdle()
    const abort = new AbortController()
    const ready = Promise.withResolvers<void>()
    const attempt: NonNullable<ChatGptController['attempt']> = { view: { id: brandString<ChatGptAttemptId>(randomUUID()), url: null,
      status: 'waiting' }, abort, done: Promise.resolve(), committing: false }
    this.attempt = attempt
    const timer = setTimeout(() => { if (!attempt.committing) abort.abort(new Error('ChatGPT authorization expired')) }, this.options.signInTimeoutMs)
    const signal = abort.signal
    attempt.done = (async () => {
      const initialized = await this.ctx.credentials.modifyRecord(KEY, current => Promise.resolve(record(stored(current))))
      const value = stored(initialized)
      const registration = accountId === null ? undefined : value.accounts.find(account => account.clientId === accountId)
      if (accountId !== null && !registration) throw this.refused('missing-account')
      let flowDone: Promise<void> | undefined
      const dispose = this.ctx.authorization.registerFlow({ key: KEY, label: 'ChatGPT',
        methods: [{ id: 'oauth', label: 'Continue with ChatGPT' }],
        run: (session) => {
          flowDone = (async () => {
            const grant = await authorizeChatGpt({ hostId: `urn:uuid:${value.hostId}`,
              ...registration === undefined ? {} : { registration }, signal: session.signal,
              notify: (url) =>{  session.notify({ message: 'Continue with ChatGPT', url }) } })
            session.signal.throwIfAborted()
            // Once admitted, cancellation waits for the atomic write instead of reporting a false cancellation.
            attempt.committing = true
            await this.ctx.credentials.modifyRecord(KEY, (current) => {
              const next = stored(current)
              next.accounts = [...next.accounts.filter(account => account.clientId !== grant.clientId), grant]
              next.activeId = grant.clientId
              return Promise.resolve(record(next))
            })
          })()
          return flowDone
        },
      })
      try {
        const result = await this.ctx.authorization.begin({ key: KEY, signal,
          interaction: { notify: (notice) => { attempt.view.url = notice.url ?? null; this.publish(); ready.resolve() },
            prompt: () => Promise.reject(new Error('ChatGPT login does not request renderer secrets')) } })
        attempt.view.status = result.status === 'authorized' ? 'complete' : 'cancelled'
      } finally {
        dispose()
        try { await flowDone }
        catch (_error) { /* begin() owns the terminal outcome; still await callback cleanup. */ }
      }
    })().catch((error: unknown) => {
      attempt.view.status = abort.signal.aborted ? 'cancelled' : 'failed'
      // The protocol may contain credential material in upstream diagnostics; publish only the outcome.
      this.ctx.logger.warn('ChatGPT sign-in did not complete (%s)', error instanceof RemoteError ? error.code : 'authorization')
    }).finally(() => { clearTimeout(timer); attempt.view.url = null; this.publish(); ready.resolve() })
    await ready.promise
    return this.getState()
  }

  /**
   * Cancel the matching browser attempt and await its cleanup.
   * @param attemptId - attempt owned by this UI.
   * @returns state after callback cleanup and any admitted commit.
   */
  @Remote
  async cancelSignIn(attemptId: ChatGptAttemptId): Promise<ChatGptView> {
    const attempt = this.attempt
    if (attempt?.view.id === attemptId) {
      if (!attempt.committing) attempt.abort.abort()
      await attempt.done
    }
    return this.getState()
  }

  /**
   * Select a saved session for subsequent model requests.
   * @param accountId - signed-in registration to use for subsequent requests.
   * @returns committed state.
   */
  @Remote
  async selectAccount(accountId: ChatGptAccountId): Promise<ChatGptView> {
    this.assertIdle()
    await this.ctx.credentials.modifyRecord(KEY, (current) => {
      const value = stored(current)
      if (!value.accounts.some(account => account.clientId === accountId && account.refresh)) throw this.refused('sign-in-required')
      value.activeId = accountId
      return Promise.resolve(record(value))
    })
    return this.getState()
  }

  /**
   * Clear the selected account's tokens and attempt remote revocation; retain its registration.
   * @param accountId - registration to sign out.
   * @returns whether the issuer confirmed revocation; false requires the user to disconnect in ChatGPT Settings.
   */
  @Remote
  async signOut(accountId: ChatGptAccountId): Promise<boolean> {
    this.assertIdle()
    let revoked = true
    await this.ctx.credentials.modifyRecord(KEY, async (current) => {
      const value = stored(current)
      const account = value.accounts.find(candidate => candidate.clientId === accountId)
      if (!account) throw this.refused('missing-account')
      try { await revokeChatGpt(account, this.requestSignal()) }
      catch (_error) { revoked = false; this.ctx.logger.warn('ChatGPT remote revocation was not confirmed; local tokens will be removed') }
      delete account.access; delete account.refresh; delete account.idToken; delete account.expires; delete account.scopes
      if (value.activeId === accountId) value.activeId = null
      return record(value)
    })
    return revoked
  }

  /**
   * Read or refresh the active account under the shared cross-process credential lock.
   * @param signal - model request lifetime.
   * @returns access token for the fixed official Responses endpoint only.
   */
  async accessToken(signal?: AbortSignal): Promise<string> {
    let token: string | undefined
    await this.ctx.credentials.modifyRecord(KEY, async (current) => {
      const value = stored(current)
      const index = value.accounts.findIndex(account => account.clientId === value.activeId)
      const account = value.accounts[index]
      if (!account?.refresh) throw this.refused('sign-in-required')
      const requestSignal = this.requestSignal(signal)
      requestSignal.throwIfAborted()
      const updated = account.access && account.expires !== undefined && account.expires > Date.now() + this.options.requestTimeoutMs
        ? account : await refreshChatGpt(account, requestSignal)
      value.accounts[index] = updated
      token = updated.access
      return record(value)
    })
    if (!token) throw this.refused('sign-in-required')
    return token
  }

  private requestSignal(signal?: AbortSignal): AbortSignal {
    return AbortSignal.any([this.lifetime.signal, AbortSignal.timeout(this.options.requestTimeoutMs), ...signal ? [signal] : []])
  }
  private assertIdle(): void {
    this.lifetime.signal.throwIfAborted()
    if (this.attempt?.view.status === 'waiting') throw this.refused('busy')
  }
  private refused(reason: 'busy' | 'missing-account' | 'sign-in-required'): RemoteError<'chatgpt/rejected'> {
    return new RemoteError('chatgpt/rejected', `ChatGPT authorization: ${reason}`, { reason })
  }
}
