/** Run electron-builder's actual AppRun launcher with unavailable user namespaces. */

import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { generateAppRunScript } from 'app-builder-lib/out/targets/appimage/appImageUtil.js'
import { expect, it, onTestFinished } from 'vitest'

function appRunScript(): string {
  return generateAppRunScript({
    ExecutableName: 'deepseek-harness-linux',
    DesktopFileName: 'deepseek-harness-linux.desktop',
    ProductFilename: 'DeepSeek Harness Linux',
    ProductName: 'DeepSeek Harness Linux',
    ResourceName: 'appimagekit-deepseek-harness-linux',
  })
}

it('generates no automatic Chromium sandbox override', () => {
  expect(appRunScript()).not.toContain('--no-sandbox')
})

// Linux AppRun requires Bash and POSIX execution; other platform lanes retain the generated-script guard.
it.skipIf(process.platform !== 'linux').each([
  { name: 'no arguments', args: [] },
  { name: 'literal arguments', args: ['--profile', 'desktop', 'hello world', '中文 🚀', '$HOME', '`literal`', ''] },
  { name: 'explicit caller arguments', args: ['--no-sandbox', '--user-data-dir=space inside'] },
])('forwards $name unchanged when user namespaces are unavailable', ({ args }) => {
  const root = mkdtempSync(join(tmpdir(), 'desktop-appimage-'))
  onTestFinished(() => { rmSync(root, { recursive: true, force: true }) })
  const launcher = join(root, 'AppRun')
  const entry = join(root, 'arguments.cjs')
  writeFileSync(launcher, appRunScript(), { flag: 'wx', mode: 0o755 })
  writeFileSync(join(root, 'unshare'), '#!/bin/sh\nexit 1\n', { flag: 'wx', mode: 0o755 })
  writeFileSync(join(root, 'deepseek-harness-linux'), '#!/bin/sh\nexec "$FIXTURE_NODE" "$FIXTURE_ENTRY" "$@"\n', { flag: 'wx', mode: 0o755 })
  writeFileSync(entry, 'process.stdout.write(JSON.stringify(process.argv.slice(2))); process.exitCode = 23\n', { flag: 'wx' })
  const result = spawnSync('/bin/bash', [launcher, ...args], {
    encoding: 'utf8', timeout: 10_000,
    env: { APPDIR: root, PATH: `${root}:/usr/bin:/bin`, FIXTURE_NODE: process.execPath, FIXTURE_ENTRY: entry },
  })
  expect(result.error, result.stderr).toBeUndefined()
  expect(result.signal, result.stderr).toBeNull()
  expect(result.status, result.stderr).toBe(23)
  expect(JSON.parse(result.stdout)).toEqual(args)
})
