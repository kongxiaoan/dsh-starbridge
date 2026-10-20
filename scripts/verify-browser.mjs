/** Verify the packed plugin in Chrome against an isolated, running release profile. */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'

const [logFile] = process.argv.slice(2)
if (!logFile) throw new Error('Usage: node scripts/verify-browser.mjs <web-startup-log>')
const require = createRequire(new URL('../.work/dsh/apps/web/package.json', import.meta.url))
const { chromium } = require('playwright')
const log = await readFile(logFile, 'utf8')
const match = log.match(/dsh web: (http:\/\/\S+)/)
assert.ok(match, 'Wait for the isolated profile to report readiness')
assert.equal(new URL(match[1]).hostname, '127.0.0.1')
const browser = await chromium.launch({ channel: 'chrome' })
try {
  const page = await browser.newPage({ locale: 'zh-CN', viewport: { width: 1280, height: 900 } })
  page.setDefaultTimeout(15000)
  await page.addInitScript(() => { window.open = () => null })
  await page.goto(match[1])
  await page.getByRole('dialog', { name: '预览版说明' }).getByRole('button', { name: '继续', exact: true }).click()
  const openCard = async () => {
    await page.getByRole('button', { name: '账号菜单', exact: true }).click()
    await page.getByRole('menuitem', { name: '设置', exact: true }).click()
    await page.getByRole('button', { name: '模型', exact: true }).click()
    const card = page.getByRole('region', { name: '星桥 · ChatGPT', exact: true })
    await card.getByRole('button', { name: '使用 ChatGPT 继续' }).waitFor()
    return card
  }
  let card = await openCard()
  const start = card.getByRole('button', { name: '使用 ChatGPT 继续' })
  await start.click()
  const link = card.getByRole('link', { name: '打开登录页面' })
  await link.waitFor()
  const authorize = new URL(await link.getAttribute('href'))
  assert.equal(authorize.origin, 'https://auth.openai.com')
  assert.equal(authorize.searchParams.get('client_id'), 'dynamic_agent_client')
  assert.equal(authorize.searchParams.get('code_challenge_method'), 'S256')
  await card.getByRole('button', { name: '取消', exact: true }).click()
  await link.waitFor({ state: 'detached' })
  await assert.rejects(fetch(authorize.searchParams.get('redirect_uri'), { signal: AbortSignal.timeout(10000) }))
  for (const tier of ['fast', 'default']) {
    const speed = card.getByLabel('处理速度', { exact: true })
    await speed.selectOption(tier)
    await page.waitForFunction(expected => {
      const input = document.querySelector('section[aria-label="星桥 · ChatGPT"] select')
      return input && !input.disabled && input.value === expected
    }, tier)
    await page.reload()
    card = await openCard()
    assert.equal(await card.getByLabel('处理速度', { exact: true }).inputValue(), tier)
  }
  console.log('PASS Chrome release profile: account stream, OAuth start/cancel, callback cleanup, persisted Fast/Standard')
} finally {
  await browser.close()
}
