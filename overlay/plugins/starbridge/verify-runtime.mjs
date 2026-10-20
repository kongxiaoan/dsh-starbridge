/** Probe an isolated dsh web profile's release compatibility, settings and OAuth lifecycle. */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const [installation, logFile] = process.argv.slice(2)
if (!installation || !logFile) throw new Error('Usage: node verify-runtime.mjs <runtime-installation> <web-startup-log>')
const requireRuntime = createRequire(resolve(installation, 'package.json'))
const { evaluatePluginCompatibility } = requireRuntime('@deepseek-ai/dsh-app-boot')
const manifest = JSON.parse(await readFile(new URL('../../.artifacts/starbridge/package/package.json', import.meta.url), 'utf8'))
for (const version of ['0.2.0-rc.2', '0.2.1-alpha.2', '0.2.1-rc.2']) {
  assert.equal(evaluatePluginCompatibility(manifest, {}, version), undefined)
}
for (const version of ['0.2.0-rc.1', '0.2.1-alpha.3', '0.2.1-rc.1', '0.2.1-rc.3', '0.3.0']) {
  assert.ok(evaluatePluginCompatibility(manifest, {}, version))
}
const log = await readFile(logFile, 'utf8')
const match = log.match(/dsh web: (http:\/\/\S+)/)
assert.ok(match, 'Wait for the isolated profile to report readiness')
const url = new URL(match[1])
assert.equal(url.hostname, '127.0.0.1')
const auth = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(10000) })
const cookie = auth.headers.get('set-cookie')?.split(';')[0]
assert.ok(cookie)
const rpc = async (method, args = {}) => {
  const response = await fetch(new URL(`/api/${method}`, url), {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ type: 'client-request', rpcId: 'starbridge-release', method, payload: { args } }),
    signal: AbortSignal.timeout(10000),
  })
  assert.equal(response.status, 200)
  const { result } = await response.json()
  assert.equal(result.ok, true, `${method} failed`)
  return result.value
}
const before = await rpc('starbridge/getState')
assert.equal(before.accounts.length, 0, 'Use an isolated test home without real accounts')
try {
  for (const tier of ['default', 'fast', 'default']) {
    const settings = await rpc('settings/describe')
    const namespace = settings.namespaces.find(value => value.ns === 'starbridge')
    assert.ok(namespace)
    await rpc('settings/mutate', { ns: 'starbridge', ops: [{ op: 'set', path: ['serviceTier'], value: tier }], expectedRevision: namespace.revision })
    assert.equal((await rpc('starbridge/getState')).serviceTier, tier)
  }
  const started = await rpc('starbridge/startSignIn', { accountId: null })
  assert.ok(started.attempt)
  try {
    const authorize = new URL(started.attempt.url)
    assert.equal(authorize.origin, 'https://auth.openai.com')
    assert.equal(authorize.searchParams.get('client_id'), 'dynamic_agent_client')
    assert.equal(authorize.searchParams.get('code_challenge_method'), 'S256')
  } finally { await rpc('starbridge/cancelSignIn', { attemptId: started.attempt.id }) }
  const callback = new URL(started.attempt.url).searchParams.get('redirect_uri')
  await assert.rejects(fetch(callback, { signal: AbortSignal.timeout(10000) }))
  const cancelled = (await rpc('starbridge/getState')).attempt
  assert.equal(cancelled.status, 'cancelled')
  assert.equal(cancelled.url, null)
} finally {
  const settings = await rpc('settings/describe')
  const namespace = settings.namespaces.find(value => value.ns === 'starbridge')
  await rpc('settings/mutate', { ns: 'starbridge', ops: [{ op: 'set', path: ['serviceTier'], value: before.serviceTier }], expectedRevision: namespace.revision })
}
console.log(`PASS ${requireRuntime('@deepseek-ai/dsh/package.json').version}: compatible peers, unsupported-version rejection, tier writes, OAuth start/cancel and callback cleanup`)
