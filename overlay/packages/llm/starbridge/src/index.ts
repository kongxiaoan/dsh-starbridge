/** Starbridge owns ChatGPT authorization and one independent model route. */
import type { Context, Volatile } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { PiAiAdapter } from '@deepseek-ai/dsh-llm-pi-ai'
import { resolveProfiles } from '@deepseek-ai/dsh-llm-pi-ai/src/config.ts'
import type { ResolvedPiAiProviderProfile } from '@deepseek-ai/dsh-llm-pi-ai'
import { authContextFrom, credentialStoreFrom } from '@deepseek-ai/dsh-llm-pi-ai/src/auth.ts'
import { resolveImageAttachmentAccess } from '@deepseek-ai/dsh-llm'
import type {} from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-fs'
import { ChatGptController } from './chatgpt.ts'
export { ChatGptController } from './chatgpt.ts'

/** Plugin identity used by profile configuration. */
export const name = 'starbridge'
/** Existing Host services reused by Starbridge. */
export const inject = ['llm', 'credentials', 'authorization', 'settings']
/** Live processing tier and bounded authorization lifetimes. */
export const Config = z.object({
  serviceTier: z.union(['default', 'fast']).default('default').volatile(),
  signInTimeoutMs: z.number().step(1).min(1).max(2147483647).default(600000),
  requestTimeoutMs: z.number().step(1).min(1).max(2147483647).default(30000),
})
/** Resolved Starbridge configuration. */
export interface Config {
  /** Processing tier used by subsequent Responses requests. */
  serviceTier: Volatile<'default' | 'fast'>
  /** Maximum browser authorization lifetime in milliseconds. */
  signInTimeoutMs: number
  /** Maximum refresh or revocation request lifetime in milliseconds. */
  requestTimeoutMs: number
}

/**
 * Mount the account service and independently named model route.
 * @param ctx - Host services supplied by the desktop or Web profile.
 * @param config - validated plugin options.
 */
export function apply(ctx: Context, config: Config): void {
  ctx.effect(() => ctx.settings.configure({ auto: false }, ctx.fiber))
  ctx.plugin(ChatGptController, {
    signInTimeoutMs: config.signInTimeoutMs,
    requestTimeoutMs: config.requestTimeoutMs,
    serviceTier: () => config.serviceTier.get(),
  })
  let tier: 'default' | 'fast' | undefined
  let profiles: ReadonlyMap<string, ResolvedPiAiProviderProfile>
  const current = (): ReadonlyMap<string, ResolvedPiAiProviderProfile> => {
    const selected = config.serviceTier.get()
    if (tier === selected) return profiles
    const profile = resolveProfiles({ chatgpt: { serviceTier: selected } }).get('chatgpt')
    if (!profile?.piProvider) throw new Error('ChatGPT model catalog is unavailable')
    const provider = profile.piProvider
    profiles = new Map([['starbridge-chatgpt', {
      ...profile, provider: 'starbridge-chatgpt', displayName: 'Starbridge · ChatGPT',
      piProvider: { ...provider, id: 'starbridge-chatgpt',
        getModels: () => provider.getModels().map(model => ({ ...model, provider: 'starbridge-chatgpt' })),
      },
    }]])
    tier = selected
    return profiles
  }
  const adapter = new PiAiAdapter({ profiles: current,
    resolveApiKey: (_provider, _profile, signal) => {
      const account = ctx.get('chatGpt')
      if (!account) throw new Error('Starbridge authorization is not ready')
      return account.accessToken(signal)
    },
    auth: { credentials: credentialStoreFrom(ctx), authContext: authContextFrom(ctx) },
    resolveAttachments: () => ctx.get('attachments'),
    resolveImageAccess: (attachments, ref) => resolveImageAttachmentAccess(attachments,
      path => ctx.get('fs')?.processPathFromHostPath(path), ref),
  })
  ctx.effect(() => ctx.llm.registerAdapter(['starbridge-chatgpt'], adapter))
}
