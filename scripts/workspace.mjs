/** Reproduce the plugin inside a pinned, repository-owned DSH build checkout. */
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const workspace = join(root, '.work/dsh')
const integration = JSON.parse(readFileSync(join(root, 'integration/dsh.json'), 'utf8'))
const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/KEY|SECRET|TOKEN|PASSWORD/i.test(key)))
const run = (command, args, cwd = workspace, capture = false) => {
  const result = spawnSync(command, args, { cwd, env: environment, stdio: capture ? 'pipe' : 'inherit', encoding: 'utf8' })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} failed (${result.status ?? result.signal})${capture ? `: ${result.stderr}` : ''}`)
  return result.stdout?.trim()
}
const verifyBase = () => {
  if (!existsSync(join(workspace, '.git'))) throw new Error('Run npm run prepare:dsh first')
  if (run('git', ['rev-parse', 'HEAD'], workspace, true) !== integration.commit) {
    throw new Error('Build checkout does not match integration/dsh.json; use a separate clone for another DSH revision')
  }
}
const sync = () => {
  verifyBase()
  cpSync(join(root, 'overlay'), workspace, { recursive: true })
}
const command = process.argv[2]
if (command === 'prepare') {
  if (existsSync(workspace)) throw new Error('.work/dsh already exists; use npm run sync:dsh to copy edited plugin sources')
  mkdirSync(workspace, { recursive: true })
  run('git', ['init'])
  run('git', ['remote', 'add', 'origin', integration.repository])
  run('git', ['fetch', '--depth=1', 'origin', integration.commit])
  run('git', ['checkout', '--detach', 'FETCH_HEAD'])
  run('git', ['apply', '--check', join(root, 'integration/dsh.patch')])
  run('git', ['apply', join(root, 'integration/dsh.patch')])
  sync()
} else if (command === 'sync') {
  sync()
} else if (command === 'build') {
  sync()
  run('pnpm', ['install', '--frozen-lockfile'])
  run('pnpm', ['run', 'build'])
  run(process.execPath, ['plugins/starbridge/build.mjs'])
  const distribution = join(root, 'dist')
  mkdirSync(distribution, { recursive: true })
  run('npm', ['pack', './.artifacts/starbridge/package', '--pack-destination', distribution])
} else if (command === 'test') {
  sync()
  run('pnpm', ['exec', 'vitest', 'run', 'packages/llm/starbridge/tests/chatgpt-oauth.spec.ts', 'packages/llm/starbridge/tests/chatgpt-composition.spec.ts', 'packages/client/ui-starbridge/tests/chatgpt.client.spec.tsx'])
} else if (command === 'browser') {
  sync()
  const manifest = JSON.parse(readFileSync(join(workspace, '.artifacts/starbridge/package/package.json'), 'utf8'))
  const runtimeVersion = JSON.parse(readFileSync(join(workspace, 'apps/cli/package.json'), 'utf8')).version
  const dependencies = Object.fromEntries(Object.keys(manifest.peerDependencies).map(name => [name,
    name.startsWith('@deepseek-ai/dsh') ? runtimeVersion
      : JSON.parse(readFileSync(join(workspace, 'vendor', name.split('/')[1], 'package.json'), 'utf8')).version,
  ]))
  dependencies[manifest.name] = `file:${join(root, 'dist', `${manifest.name.replace('@', '').replace('/', '-')}-${manifest.version}.tgz`)}`
  const prefix = join(workspace, '.artifacts/starbridge/clean-install')
  mkdirSync(prefix, { recursive: true })
  writeFileSync(join(prefix, 'package.json'), JSON.stringify({ private: true, type: 'module', dependencies }, null, 2) + '\n')
  run('npm', ['install', '--prefix', prefix, '--ignore-scripts', '--no-audit', '--no-fund'])
  environment.DSH_TEST_BROWSER_CHANNEL = 'chrome'
  environment.DSH_SNAPSHOT = 'replay'
  run('pnpm', ['exec', 'vitest', 'run', '--config', 'plugins/starbridge/vitest.config.ts'])
} else if (command === 'docs') {
  sync()
  run('pnpm', ['run', 'doc-sync'])
} else {
  throw new Error('Expected prepare, sync, build, test, browser, or docs')
}
console.log(`Starbridge ${command} complete`)
