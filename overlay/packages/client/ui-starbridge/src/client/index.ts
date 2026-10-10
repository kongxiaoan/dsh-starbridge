/** Starbridge mounts its own generated Remote client and Models settings card. */
import type {} from '@deepseek-ai/dsh-client-ui-settings-models/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import remote from '@deepseek-ai/dsh-starbridge/remote'
export type {} from '@deepseek-ai/dsh-starbridge/remote'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import { en, zh, type ModelsKey } from './locales.ts'
import { registerChatGpt } from './chatgpt.ts'
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { starbridge: ModelsKey }
}
/** Required browser services. */
export const inject = ['slots', 'locale', 'remote', 'remote.settings']
/**
 * Register Starbridge controls and release them with the plugin.
 * @param ctx - injected browser services.
 * @returns disposer that removes the UI before its Remote namespace.
 */
export async function apply(ctx: Context): Promise<() => Promise<void>> {
  ctx.effect(() => ctx.locale.register('starbridge', { en, zh }))
  const dispose = await ctx.remote.$mount(remote)
  const ui = ctx.inject(['remote.starbridge', ...inject], registerChatGpt)
  try { await ui }
  catch (error) { await ui.dispose(); await dispose(); throw error }
  return async () => { await ui.dispose(); await dispose() }
}
