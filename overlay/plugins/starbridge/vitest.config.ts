/** Release-only browser tests; requires build.mjs and a clean npm tarball install. */
import { defineConfig } from 'vitest/config'
import web from '../../vitest.web.config.ts'
export default defineConfig({ ...web, test: { ...web.test, include: ['apps/web/tests/starbridge.release.ts'] } })
