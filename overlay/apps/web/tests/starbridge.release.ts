/** Local ChatGPT authorization through the shipped Host and generated Remote client. */
import { chromium, type Browser, type Page } from 'playwright'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { captureStableAria, compareOrRefreshGolden, launchWebScaffold, webSnapshotMode, type WebScaffold } from './scaffold.ts'
import { openSettings, ZH_BROWSER_LOCALE } from './support.ts'

let scaffold: WebScaffold
let browser: Browser
let page: Page
beforeAll(async () => {
  scaffold = await launchWebScaffold({ profile: { packages: [
    { dir: fileURLToPath(new URL('../../../.artifacts/starbridge/clean-install/node_modules/@kongpingan/dsh-starbridge', import.meta.url)), enabled: true },
  ] } })
  const channel = process.env['DSH_TEST_BROWSER_CHANNEL']
  browser = await chromium.launch(channel === undefined ? {} : { channel })
  page = await browser.newPage({ locale: ZH_BROWSER_LOCALE, viewport: { width: 1280, height: 900 } })
  // Exercise the persistent link used when the browser blocks an automatic popup.
  await page.addInitScript(() => { window.open = () => null })
  await page.goto(scaffold.authenticatedUrl)
  await openSettings(page, 'zh')
  await page.getByRole('button', { name: '模型', exact: true }).click()
})
afterAll(async () => {
  await browser?.close()
  await scaffold?.close()
})
it('exposes official browser sign-in and cancels the loopback listener through Remote', async () => {
  const card = page.getByRole('region', { name: '星桥 · ChatGPT', exact: true })
  await card.waitFor()
  const start = card.getByRole('button', { name: '使用 ChatGPT 继续' })
  await expect.poll(() => start.isEnabled()).toBe(true)
  await compareOrRefreshGolden(fileURLToPath(new URL('./expected/starbridge/ready.expected.md', import.meta.url)),
    await captureStableAria(page, 'section[aria-label="星桥 · ChatGPT"]', scaffold.workspaceCwd), webSnapshotMode())
  if (process.env['DSH_STARBRIDGE_SCREENSHOT'] === '1') {
    await page.screenshot({ path: fileURLToPath(new URL('../../../plugins/starbridge/settings.png', import.meta.url)) })
  }
  await start.click()
  const link = card.getByRole('link', { name: '打开登录页面' })
  await link.waitFor()
  const href = await link.getAttribute('href')
  expect(href).not.toBeNull()
  const authorize = new URL(href!)
  expect(authorize.origin).toBe('https://auth.openai.com')
  expect(authorize.searchParams.get('agent_name_hint')).toBe('Starbridge for DeepSeek Harness')
  expect(authorize.searchParams.get('client_id')).toBe('dynamic_agent_client')
  expect(authorize.searchParams.get('code_challenge_method')).toBe('S256')
  const callback = authorize.searchParams.get('redirect_uri')!
  expect(new URL(callback).hostname).toBe('127.0.0.1')
  await card.getByRole('button', { name: '取消', exact: true }).click()
  await expect.poll(() => start.isEnabled()).toBe(true)
  await expect(fetch(callback)).rejects.toThrow()
  expect(await link.count()).toBe(0)
})

it('saves Fast and Standard in the independently installed Starbridge card', async () => {
  const card = page.getByRole('region', { name: '星桥 · ChatGPT', exact: true })
  const speed = card.getByLabel('处理速度', { exact: true })
  for (const tier of ['fast', 'default']) {
    await speed.selectOption(tier)
    await expect.poll(() => speed.isEnabled()).toBe(true)
    expect(await speed.inputValue()).toBe(tier)
    if (tier === 'fast') {
      await compareOrRefreshGolden(fileURLToPath(new URL('./expected/starbridge/fast.expected.md', import.meta.url)),
        await captureStableAria(page, 'section[aria-label="星桥 · ChatGPT"]', scaffold.workspaceCwd), webSnapshotMode())
    }
    const settings = scaffold.ctx.settings.describe()
    expect(settings.find(value => value.ns === 'starbridge')?.value).toMatchObject({ serviceTier: tier })
  }
})
