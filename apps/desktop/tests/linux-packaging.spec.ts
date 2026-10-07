import { createRequire } from 'node:module'
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { getFileMatchers } from 'app-builder-lib/out/fileMatcher.js'
import { describe, expect, it, onTestFinished } from 'vitest'
import { createElectronBuilderConfig } from '../scripts/electron-builder-config.mjs'
import { loadDesktopPackageEnvironment, validateDesktopPackageEnvironment } from '../scripts/desktop-package-environment.mjs'

const require = createRequire(import.meta.url)
const { validateConfiguration } = require('app-builder-lib/out/util/config/config.js') as {
  validateConfiguration: (config: object, logger: { isEnabled: false }) => Promise<void>
}
// electron-builder exposes the actual extraResources copier without declaring its internal API.
const { copyFiles } = require('app-builder-lib/out/fileMatcher.js') as {
  copyFiles: (matchers: ReturnType<typeof getFileMatchers>, transformer: null) => Promise<void>
}

describe('community Linux packaging', () => {
  it('needs no upstream release secrets and removes inherited signing and update settings', () => {
    const parent = {
      PATH: '/build/bin', DSH_DESKTOP_APP_ID: 'com.upstream.app',
      DSH_DESKTOP_MANDATORY_UPDATE_PROD_ORIGIN: 'https://policy.example.com',
      DSH_DESKTOP_AUTO_UPDATE_ENV: 'production', DOWNLOAD_PROD_COS_SECRET_KEY: 'private',
      CSC_LINK: 'private.p12', APPLE_ID: 'private@example.com',
      DSH_DESKTOP_WINDOWS_TOKEN_PIN: 'private', DSH_DESKTOP_NPM_REGISTRY: 'https://registry.npmjs.org',
    }
    const environment = loadDesktopPackageEnvironment('linux', parent, '/no-local-release-files')
    expect(environment).toEqual({ PATH: '/build/bin', DSH_DESKTOP_APP_ID: 'net.xumin.deepseek-harness-linux',
      DSH_DESKTOP_NPM_REGISTRY: 'https://registry.npmjs.org' })
    expect(() => { validateDesktopPackageEnvironment(environment, { platform: 'linux', arch: 'x64' }) }).not.toThrow()
    expect(parent.CSC_LINK).toBe('private.p12')
  })

  // electron-builder compiles its complete configuration schema on the first validation.
  it.each(['x64', 'arm64'])('emits installable %s artifacts without official update metadata', async (arch) => {
    const config = createElectronBuilderConfig({}, 'linux', arch)
    await validateConfiguration(config, { isEnabled: false })
    expect(config.appId).toBe('net.xumin.deepseek-harness-linux')
    expect(config.productName).toBe('DeepSeek Harness Linux')
    expect(config.publish).toBeNull()
    expect(config.extraMetadata).not.toHaveProperty('dshMandatoryUpdatePolicy')
    expect(config.linux).toMatchObject({ executableName: 'deepseek-harness-linux', target: ['AppImage', 'deb', 'rpm'] })
    expect(config.linux.executableArgs).toEqual([])
    expect(config.directories.output).toContain(`linux-${arch}`)
    expect(config.electronDist).toContain(`linux-${arch}`)
    expect(config.extraResources[0]?.from).toContain(`linux-${arch}`)
    const dshResource = config.extraResources.find(resource => resource.to === 'dsh')
    expect(dshResource?.from).toContain(`linux-${arch}/dsh`)
    expect(dshResource).toMatchObject({ to: 'dsh', filter: ['**/*'] })
    expect(config.files.every(entry => typeof entry === 'string')).toBe(true)
    expect(config.linux.desktop.entry.StartupWMClass).toBe(config.linux.executableName)
    expect(config.extraMetadata.desktopName).toBe(`${config.linux.desktop.entry.StartupWMClass}.desktop`)
    expect(config.linux.syncDesktopName).toBe(true)
    expect(config.deb.packageName).toBe(config.linux.executableName)
    expect(config.rpm.packageName).toBe(config.linux.executableName)
  }, 20_000)

  // Linux native launchers require POSIX executable permissions, which Windows cannot preserve.
  it.skipIf(process.platform === 'win32')('copies the complete Linux runtime with nested dependencies and executable native files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'desktop-linux-resources-'))
    onTestFinished(async () => { await rm(root, { recursive: true, force: true }) })
    const source = join(root, 'source')
    const resources = join(root, 'output', 'resources')
    const launcher = 'node_modules/@deepseek-ai/node-addon-system-linux-x64/bin/landlock-run'
    const files = new Map([
      ['package.json', Buffer.from('{"name":"desktop-runtime-fixture"}')],
      ['desktop-runtime.json', Buffer.from('{"schemaVersion":1}')],
      ['node_modules/@deepseek-ai/dsh-desktop-host/package.json', Buffer.from('{"name":"@deepseek-ai/dsh-desktop-host"}')],
      ['node_modules/@deepseek-ai/dsh-desktop-host/lib/index.js', Buffer.from('export {}')],
      ['node_modules/@deepseek-ai/dsh-desktop-host/node_modules/nested/index.js', Buffer.from('export const nested = true')],
      [launcher, Buffer.from('#!/bin/sh\nexit 0\n')],
      ['node_modules/@deepseek-ai/node-addon-system-linux-x64/lib/system.node', Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0, 1])],
    ])
    for (const [path, body] of files) {
      await mkdir(dirname(join(source, path)), { recursive: true })
      await writeFile(join(source, path), body, { mode: path === launcher ? 0o755 : 0o644 })
    }
    const config = createElectronBuilderConfig({}, 'linux', 'x64', source)
    const extraResources = config.extraResources
      .filter(resource => resource.to === 'dsh' || resource.to.startsWith('dsh/'))
      .map(resource => ({ from: resource.from, to: resource.to,
        ...('filter' in resource ? { filter: [...resource.filter] } : {}) }))
    const matchers = getFileMatchers({ extraResources }, 'extraResources', resources, {
      defaultSrc: root, globalOutDir: join(root, 'output'), customBuildOptions: {}, macroExpander: value => value,
    })
    await copyFiles(matchers, null)
    const destination = join(resources, 'dsh')
    const copied = (await readdir(destination, { recursive: true, withFileTypes: true }))
      .filter(entry => entry.isFile()).map(entry => relative(destination, join(entry.parentPath, entry.name)))
    expect(copied.sort()).toEqual([...files.keys()].sort())
    for (const [path, body] of files) expect(await readFile(join(destination, path))).toEqual(body)
    expect((await stat(join(destination, launcher))).mode & 0o111).toBe(0o111)
  })

  it('keeps upstream policy and feeds out even when the parent environment contains them', () => {
    const config = createElectronBuilderConfig({ DSH_DESKTOP_AUTO_UPDATE_ENV: 'production',
      DSH_DESKTOP_MANDATORY_UPDATE_PROD_ORIGIN: 'https://policy.example.com' }, 'linux', 'x64')
    expect(config.publish).toBeNull()
    expect(config.extraMetadata).not.toHaveProperty('dshMandatoryUpdatePolicy')
  })
})
