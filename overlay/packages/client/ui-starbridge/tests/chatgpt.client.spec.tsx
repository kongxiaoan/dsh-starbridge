// @vitest-environment jsdom
/** Account controls expose authorization and preserve a retryable failure state. */
import type {} from '../src/client/index.ts'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { ChatGptAccountId, ChatGptAttemptId } from '@deepseek-ai/dsh-starbridge/types'
import { ChatGptCard, type ChatGptSnapshot } from '../src/client/ChatGptCard.tsx'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)
const accountId = brandString<ChatGptAccountId>('oaiapp_test')
const attemptId = brandString<ChatGptAttemptId>('attempt')
function show(snapshot: ChatGptSnapshot) {
  const actions = { start: vi.fn(), cancel: vi.fn(), select: vi.fn(), signOut: vi.fn(), setTier: vi.fn() }
  render(<ChatGptCard useAccount={selector => selector(snapshot)} t={key => en[key as keyof typeof en]} {...actions} />)
  return actions
}
it('starts browser registration without requesting an API key', () => {
  const actions = show({ busy: false, view: { serviceTier: 'default', accounts: [], activeId: null, attempt: null } })
  fireEvent.click(screen.getByText(en.chatGptContinue))
  expect(actions.start).toHaveBeenCalledWith(null)
  expect(document.querySelector('input[type=password]')).toBeNull()
})
it('provides a browser link and cancels only the displayed attempt', () => {
  const actions = show({ busy: false, view: { serviceTier: 'default', accounts: [], activeId: null,
    attempt: { id: attemptId, status: 'waiting', url: 'https://auth.openai.com/api/accounts/authorize' } } })
  expect(screen.getByText(en.chatGptOpenBrowser).getAttribute('rel')).toContain('noreferrer')
  fireEvent.click(screen.getByText(en.cancel))
  expect(actions.cancel).toHaveBeenCalledWith(attemptId)
})
it('shows the active registration, model activation and local-only sign-out warning', () => {
  const actions = show({ busy: false, error: 'chatGptRevocationFailed', view: { serviceTier: 'default', accounts: [
    { id: accountId, email: 'test@example.com', signedIn: true },
  ], activeId: accountId, attempt: null } })
  fireEvent.change(screen.getByLabelText(en.chatGptSpeed), { target: { value: 'fast' } })
  expect(actions.setTier).toHaveBeenCalledWith('fast')
  expect(screen.getByRole('alert').textContent).toBe(en.chatGptRevocationFailed)
  fireEvent.click(screen.getByText(en.chatGptSignOut))
  expect(actions.signOut).toHaveBeenCalledWith(accountId)
})
