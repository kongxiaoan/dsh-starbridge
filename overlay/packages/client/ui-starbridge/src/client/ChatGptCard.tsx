/** Browser authorization and saved-account selection inside Models settings. */
import { useState, type ReactNode } from 'react'
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { ChatGptView, ChatGptAccountId, ChatGptAttemptId } from '@deepseek-ai/dsh-starbridge/types'
import type { ModelsKey } from './locales.ts'
import styles from './Starbridge.module.css'

/** Public account snapshot plus persistent, actionable operation failures. */
export interface ChatGptSnapshot { view?: ChatGptView; error?: ModelsKey | undefined; busy: boolean }
/** Framework-bound account observation and Host operations. */
export interface ChatGptInjected {
  hooks: { account: { getSnapshot(): ChatGptSnapshot; subscribe(listener: () => void): () => void } }
  start(id: ChatGptAccountId | null): Promise<void>
  cancel(id: ChatGptAttemptId): Promise<void>
  select(id: ChatGptAccountId): Promise<void>
  signOut(id: ChatGptAccountId): Promise<void>
  setTier(tier: 'default' | 'fast'): Promise<void>
}
/**
 * Render the ChatGPT account card without handling credentials in the renderer.
 * @param props - framework hook, account actions and Models dictionary.
 * @returns the account controls.
 */
export function ChatGptCard(props: InjectFace<ChatGptInjected> & PropsLocale<'starbridge'>): ReactNode {
  const { useAccount, t } = props
  const snapshot = useAccount(value => value)
  const [selected, setSelected] = useState<ChatGptAccountId | null>(null)
  const view = snapshot.view
  const selectedAccount = view?.accounts.find(account => account.id === (selected ?? view.activeId))
  const waiting = view?.attempt?.status === 'waiting'
  return <section aria-label={t('chatGptTitle')} className={styles['editor']}>
    <div className={styles['editorHeader']}><span className={styles['editorTitle']}>{t('chatGptTitle')}</span></div>
    <p className={styles['intro']}>{t('chatGptDescription')}</p>
    {view && view.accounts.length > 0 ? <div className={styles['field']}>
      <label className={styles['fieldLabel']} htmlFor="chatgpt-account">{t('chatGptAccount')}</label>
      <select id="chatgpt-account" className={`${styles['input']} ${styles['selectInput']}`} disabled={snapshot.busy || waiting}
        value={selectedAccount?.id ?? ''} onChange={(event) => {
          setSelected(view.accounts.find(account => account.id === event.target.value)?.id ?? null)
        }}>
        <option value="">{t('chatGptChoose')}</option>
        {view.accounts.map(account => <option key={account.id} value={account.id}>
          {`${account.email} · ${account.id}${view.activeId === account.id ? ` · ${t('chatGptActive')}` : ''}`}
        </option>)}
      </select>
    </div> : null}
    <div className={styles['chatGptActions']}>
      <button className={styles['primaryButton']} type="button" disabled={snapshot.busy || waiting || !view}
        onClick={() => { void props.start(selectedAccount?.id ?? null) }}>{t('chatGptContinue')}</button>
      {selectedAccount ? <>
        <button className={styles['secondaryButton']} type="button" disabled={snapshot.busy || waiting}
          onClick={() => { void props.start(null) }}>{t('chatGptAdd')}</button>
        <button className={styles['secondaryButton']} type="button" disabled={snapshot.busy || waiting || !selectedAccount.signedIn}
          onClick={() => { void props.select(selectedAccount.id) }}>{t('chatGptUse')}</button>
        <button className={styles['secondaryButton']} type="button" disabled={snapshot.busy || waiting || !selectedAccount.signedIn}
          onClick={() => { void props.signOut(selectedAccount.id) }}>{t('chatGptSignOut')}</button>
      </> : null}

    </div>
    {view ? <div className={styles['field']}>
      <label htmlFor="starbridge-tier">{t('chatGptSpeed')}</label>
      <select id="starbridge-tier" className={styles['input']} value={view.serviceTier} disabled={snapshot.busy}
        onChange={(event) => { if (event.target.value === 'fast' || event.target.value === 'default') void props.setTier(event.target.value) }}>
        <option value="default">{t('chatGptSpeedStandard')}</option>
        <option value="fast">{t('chatGptSpeedFast')}</option>
      </select>
      <p className={styles['advancedHint']}>{t('chatGptSpeedHint')}</p>
    </div> : null}
    {waiting && view.attempt ? <div role="status">
      <p>{t('chatGptWaiting')}</p>
      {view.attempt.url ? <a href={view.attempt.url} target="_blank" rel="noopener noreferrer">{t('chatGptOpenBrowser')}</a> : null}
      <button type="button" className={styles['secondaryButton']} onClick={() => { if (view.attempt) void props.cancel(view.attempt.id) }}>
        {t('cancel')}
      </button>
    </div> : null}
    {view?.attempt?.status === 'failed' ? <p className={styles['error']} role="alert">{t('chatGptFailed')}</p> : null}
    {snapshot.error ? <p className={styles['error']} role="alert">{t(snapshot.error)}</p> : null}
    <p className={styles['advancedHint']}><a href="https://chatgpt.com/settings/usage" target="_blank" rel="noopener noreferrer">
      {t('chatGptUsage')}
    </a></p>
  </section>
}
