/** Renderer-safe ChatGPT account and authorization state. */
import type { Branded } from '@deepseek-ai/dsh-brand'
/** Issued OAuth registration identifier. */
export type ChatGptAccountId = Branded<'ChatGptAccountId'>
/** Ephemeral browser authorization attempt identifier. */
export type ChatGptAttemptId = Branded<'ChatGptAttemptId'>
/** Saved registration without any credential material. */
export interface ChatGptAccountView {
  id: ChatGptAccountId
  email: string
  signedIn: boolean
}
/** Reconnect-safe state; the browser URL contains only the pending PKCE challenge. */
export interface ChatGptView {
  serviceTier: 'default' | 'fast'
  accounts: ChatGptAccountView[]
  activeId: ChatGptAccountId | null
  attempt: { id: ChatGptAttemptId; url: string | null; status: 'waiting' | 'complete' | 'cancelled' | 'failed' } | null
}
