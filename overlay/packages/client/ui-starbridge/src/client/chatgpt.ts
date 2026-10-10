/** Reconnecting account observation and localized actions for the Models footer. */
import type { Context } from '@deepseek-ai/cordis'
import type { ChatGptView } from '@deepseek-ai/dsh-starbridge/types'
import { ChatGptCard, type ChatGptInjected, type ChatGptSnapshot } from './ChatGptCard.tsx'
import type { ModelsKey } from './locales.ts'

/**
 * Register the ChatGPT card against the existing Models footer.
 * @param ctx - Client context with Remote, locale and slot services.
 */
export function registerChatGpt(ctx: Context): void {
  let snapshot: ChatGptSnapshot = { busy: false }
  const listeners = new Set<() => void>()
  const publish = (next: ChatGptSnapshot): void => { snapshot = next; for (const listener of listeners) listener() }
  const account = { getSnapshot: () => snapshot, subscribe: (listener: () => void) => {
    listeners.add(listener); return () => { listeners.delete(listener) }
  } }
  const stream = ctx.remote.$stream<ChatGptView>({ name: 'chatgpt',
    open: signal => ctx.remote.starbridge.watch(signal), ended: () => new Error('ChatGPT account stream ended') })
  let disposed = false
  ctx.effect(() => () => { disposed = true; return stream.dispose() }, 'ChatGPT account subscription')
  void (async () => {
    for await (const frame of stream) {
      publish({ ...snapshot, view: frame.value })
      frame.accept()
    }
  })().catch(() => { if (!disposed) publish({ ...snapshot, error: 'chatGptUnavailable' }) })
  const run = async (action: () => Promise<ModelsKey | undefined>): Promise<void> => {
    publish({ ...snapshot, busy: true, error: undefined })
    try { const error = await action(); publish({ ...snapshot, busy: false, error }) }
    catch (_error) { publish({ ...snapshot, busy: false, error: 'chatGptFailed' }); ctx.logger.warn('ChatGPT account operation failed') }
  }
  const operations: ChatGptInjected = {
    hooks: { account },
    start: id => run(async () => {
      const result = await ctx.remote.starbridge.startSignIn(id)
      if (!result.ok) return 'chatGptFailed'
      publish({ ...snapshot, view: result.value })
      // A link remains available when popup policy refuses the asynchronous open.
      if (result.value.attempt?.url) window.open(result.value.attempt.url, '_blank', 'noopener,noreferrer')
      return undefined
    }),
    cancel: id => run(async () => {
      const result = await ctx.remote.starbridge.cancelSignIn(id)
      return result.ok ? undefined : 'chatGptFailed'
    }),
    select: id => run(async () => {
      const result = await ctx.remote.starbridge.selectAccount(id)
      return result.ok ? undefined : 'chatGptFailed'
    }),
    signOut: id => run(async () => {
      const result = await ctx.remote.starbridge.signOut(id)
      return !result.ok ? 'chatGptFailed' : result.value ? undefined : 'chatGptRevocationFailed'
    }),
    setTier: tier => run(async () => {
      const document = await ctx.remote.settings.describe()
      if (!document.ok) return 'chatGptSpeedFailed'
      const namespace = document.value.namespaces.find(value => value.ns === 'starbridge')
      if (!namespace || !document.value.writable) return 'chatGptSpeedFailed'
      const result = await ctx.remote.settings.mutate('starbridge', [{ op: 'set', path: ['serviceTier'], value: tier }], namespace.revision)
      if (!result.ok) return 'chatGptSpeedFailed'
      const state = await ctx.remote.starbridge.getState()
      if (!state.ok) return 'chatGptFailed'
      publish({ ...snapshot, view: state.value })
      return undefined
    }),
  }
  ctx.slots.inject('settings.models.footer', () => ctx.slots.register({
    name: 'settings.models.footer', id: 'starbridge', locale: 'starbridge', inject: () => operations,
  }, ChatGptCard))
}
