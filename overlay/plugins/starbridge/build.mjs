/** Build one standalone distribution from the maintained Host and Client workspace owners. */
import { build } from 'tsdown'
import { readFile, writeFile, mkdir, cp, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
const root = resolve(import.meta.dirname, '../..')
const dest = resolve(root, '.artifacts/starbridge/package')
const spec = JSON.parse(await readFile(resolve(import.meta.dirname, 'package.json'), 'utf8'))
await mkdir(resolve(dest, 'lib'), { recursive: true })
await build({ config: false, cwd: root, entry: { index: 'packages/llm/starbridge/lib/index.js' },
  outDir: resolve(dest, 'lib'), format: 'esm', platform: 'node', target: 'es2024', dts: false,
  clean: true, sourcemap: false, fixedExtension: false,
  deps: { alwaysBundle: [/^@deepseek-ai\/dsh-llm-pi-ai(?:\/|$)/],
    neverBundle: [/^@deepseek-ai\/(?!dsh-llm-pi-ai(?:\/|$))/, /^@earendil-works\//, 'jose', 'zod'], onlyBundle: false },
})
const owner = '@deepseek-ai/dsh-starbridge'
const uiOwner = '@deepseek-ai/dsh-client-ui-starbridge'
const rebrand = text => text.replaceAll(owner, spec.name).replaceAll(uiOwner, spec.name)
  .replace(/^\/\/# sourceMappingURL=.*$/gm, '').trimEnd() + '\n'
await writeFile(resolve(dest, 'lib/typert.host.js'), rebrand(await readFile(resolve(root, 'packages/llm/starbridge/lib/typert.host.js'), 'utf8')))
for (const file of await readdir(resolve(root, 'packages/client/ui-starbridge/lib'))) {
  if (file.endsWith('.js') && file.startsWith('client')) {
    await writeFile(resolve(dest, 'lib', file), rebrand(await readFile(resolve(root, 'packages/client/ui-starbridge/lib', file), 'utf8')))
  }
}
// Framework peers remain shared with the Host; the model SDK and OAuth libraries are ordinary dependencies.
const host = await readFile(resolve(dest, 'lib/index.js'), 'utf8')
const packages = new Set([...host.matchAll(/(?:from\s*|import\s*)["'](@deepseek-ai\/[^/"']+)/g)].map(match => match[1]))
for (const name of packages) {
  if (!spec.peerDependencies[name]) throw new Error(`Missing tested framework peer range for ${name}`)
}
for (const file of ['cordis.patch.yml', 'icon.svg', 'settings.png', 'locale', 'README.md', 'README.zh.md', 'LICENSE', 'NOTICE']) {
  await cp(resolve(import.meta.dirname, file), resolve(dest, file), { recursive: true })
}
await writeFile(resolve(dest, 'package.json'), JSON.stringify(spec, null, 2) + '\n')
// npm renders only README.md and resolves sibling links outside the package.
const assetBase = `https://cdn.jsdelivr.net/npm/${spec.name}@${spec.version}`
const renderReadme = text => text.replace(/\]\((icon\.svg|settings\.png)\)/g, `](${assetBase}/$1)`)
const english = renderReadme(await readFile(resolve(import.meta.dirname, 'README.md'), 'utf8'))
  .replace('English | [中文](README.zh.md)', '[English](#english) | [中文](#中文)')
const chinese = renderReadme(await readFile(resolve(import.meta.dirname, 'README.zh.md'), 'utf8'))
  .replace('[English](README.md) | 中文', '[English](#english) | [中文](#中文)')
await writeFile(resolve(dest, 'README.md'), `# English\n\n${english.trim()}\n\n---\n\n# 中文\n\n${chinese.trim()}\n`)
console.log(`Built ${spec.name}@${spec.version} at ${dest}`)
