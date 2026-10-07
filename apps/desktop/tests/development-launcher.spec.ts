/** Exercise the source launcher from the Desktop cwd without Vitest's workspace source aliases. */

import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, it, onTestFinished } from 'vitest'

const repository = resolve(import.meta.dirname, '../../..')
const tsx = pathToFileURL(createRequire(import.meta.url).resolve('tsx/esm')).href

function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'dsh-desktop-launcher-')))
  onTestFinished(() => rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }))
  const app = join(root, 'apps', 'desktop')
  for (const path of [
    'apps/desktop/scripts/dev.ts',
    'apps/desktop/scripts/development-app.ts',
    'apps/desktop/scripts/desktop-build-paths.mjs',
    'apps/desktop/src/host-protocol.ts',
    'apps/desktop/tsconfig.json',
  ]) {
    const destination = join(root, path)
    mkdirSync(dirname(destination), { recursive: true })
    copyFileSync(join(repository, path), destination)
  }
  writeFileSync(join(root, 'package.json'), '{"type":"module"}\n')
  for (const [file, name] of [
    ['development-project.ts', 'prepareDevelopmentProject'],
    ['prepare-primary-runtime.ts', 'preparePrimaryRuntime'],
  ] as const) {
    writeFileSync(join(app, 'scripts', file), [
      `export function ${name}() { throw new Error('preparation must not run') }`,
      "throw new Error('preparation imported before build artifacts exist')",
      '',
    ].join('\n'))
  }
  const calls = join(root, 'package-manager-calls.jsonl')
  const packageManager = join(root, 'package-manager.mjs')
  writeFileSync(packageManager, [
    "import { appendFileSync } from 'node:fs'",
    `appendFileSync(${JSON.stringify(calls)}, JSON.stringify({ args: process.argv.slice(2), cwd: process.cwd() }) + '\\n')`,
    'process.exitCode = 17',
    '',
  ].join('\n'))
  function run(args: string[], timeout: number, options: { env?: NodeJS.ProcessEnv; status?: number } = {}) {
    const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/KEY|SECRET|TOKEN|PASSWORD/iu.test(name)))
    // The subject is source-launch ordering; a direct ESM hook keeps the launcher as the owned child.
    const result = spawnSync(process.execPath, ['--import', tsx, join(app, 'scripts', 'dev.ts'), ...args], {
      cwd: app, env: { ...env, npm_execpath: packageManager, ...options.env }, encoding: 'utf8',
      // Process startup uses the runner's platform budget; forced termination is never a passing exit.
      timeout, killSignal: 'SIGKILL',
    })
    const output = result.stdout + result.stderr
    expect(result.error, output).toBeUndefined()
    expect(result.signal, output).toBeNull()
    expect(result.status, output).toBe(options.status ?? 1)
    expect(output).not.toContain('preparation imported before build artifacts exist')
    expect(output).not.toContain('preparation must not run')
    if (options.status !== 0) expect(output).not.toContain('desktop development: inspectors')
    return output
  }
  return { root, app, calls, run }
}

it('builds a fresh checkout before importing preparation modules and stops after a failed build', ({ task }) => {
  const f = fixture()
  const output = f.run([], task.timeout)
  expect(output).toContain(`desktop development: ${join(f.root, 'package-manager.mjs')} run build exited with 17`)
  expect(JSON.parse(readFileSync(f.calls, 'utf8'))).toEqual({ args: ['run', 'build'], cwd: f.root })
})

it('reports missing artifacts without building or importing preparation modules when build is skipped', ({ task }) => {
  const f = fixture()
  const output = f.run(['--skip-build'], task.timeout)
  expect(output).toContain(`desktop development: missing built artifact ${join(f.app, 'lib', 'main.js')}`)
  expect(existsSync(f.calls)).toBe(false)
})

// This fixture uses Linux's standalone Node layout and a POSIX executable in place of Electron.
it.skipIf(process.platform !== 'linux')('starts Electron without an inherited IDE Node-mode flag', ({ task }) => {
  const f = fixture()
  for (const [file, name] of [
    ['development-project.ts', 'prepareDevelopmentProject'],
    ['prepare-primary-runtime.ts', 'preparePrimaryRuntime'],
  ] as const) {
    writeFileSync(join(f.app, 'scripts', file), `export function ${name}() {}\n`)
  }
  const primaryRuntime = join(f.root, 'primary-runtime')
  for (const path of [
    join(f.app, 'lib', 'main.js'),
    join(f.root, 'apps', 'desktop-host', 'lib', 'index.js'),
    join(f.root, 'native', 'system', 'packages', `linux-${process.arch}`, 'bin', 'landlock-run'),
  ]) {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, '')
  }
  const node = join(primaryRuntime, 'dependencies', 'node', 'bin', 'node')
  mkdirSync(dirname(node), { recursive: true })
  symlinkSync(process.execPath, node)
  writeFileSync(join(f.app, 'package.json'), '{"version":"1.2.3","type":"module"}\n')
  mkdirSync(join(f.app, 'node_modules', 'pnpm'), { recursive: true })
  writeFileSync(join(f.app, 'node_modules', 'pnpm', 'package.json'), '{"version":"11.7.0"}\n')
  const electronPackage = join(f.app, 'node_modules', 'electron')
  mkdirSync(electronPackage)
  const executable = join(electronPackage, 'electron')
  writeFileSync(join(electronPackage, 'package.json'), '{"main":"index.cjs"}\n')
  writeFileSync(join(electronPackage, 'index.cjs'), `module.exports = ${JSON.stringify(executable)}\n`)
  writeFileSync(executable, [
    '#!/bin/sh',
    'umask 077',
    'set -C',
    'printf \'%s\' "${ELECTRON_RUN_AS_NODE-}" > "$DSH_DESKTOP_TEST_ELECTRON_ENV"',
    '',
  ].join('\n'), { mode: 0o700 })
  const capturedEnvironment = join(f.root, 'electron-node-mode')
  f.run(['--skip-build'], task.timeout, {
    status: 0,
    env: {
      ELECTRON_RUN_AS_NODE: '1',
      DSH_DESKTOP_PRIMARY_RUNTIME_DIR: primaryRuntime,
      DSH_DESKTOP_TEST_ELECTRON_ENV: capturedEnvironment,
    },
  })
  expect(readFileSync(capturedEnvironment, 'utf8')).toBe('')
  expect(existsSync(f.calls)).toBe(false)
})
