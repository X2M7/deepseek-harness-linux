# Desktop Host

English | [中文](README.zh.md)

## Summary

The private Desktop Host runs the desktop profile and bundled CLI under bundled standard Node.js on Linux or Electron's Node mode on macOS and Windows. The desktop shell owns Host startup, authenticated Web access, account-session IPC, task inspection, and shutdown. Use the [desktop development and packaging commands](../desktop/README.md); this package does not provide an independent application launcher.

## Packaged native dependencies

Linux starts the Host and CLI with `resources/runtime/primary-runtime/dependencies/node/bin/node`. The [desktop packaging configuration](../desktop/scripts/electron-builder-config.mjs) places the complete production dependency tree in the physical `resources/dsh` directory. Sharp and other native addons run under standard Node.js; Office engines and the Landlock launcher retain executable filesystem paths. The existing sandbox providers retain their confinement checks and failure behavior.

The Host and bundled CLI call `installOfficeEngineResolution` from [office-engine.ts](src/office-engine.ts) before starting the profile or CLI. For macOS and Windows runtimes inside `app.asar`, this resolver loads platform-specific LibreOffice packages from their complete physical directories under `app.asar.unpacked/dsh/node_modules/@deepseek-ai`. Native child processes can then read and execute their files outside Electron's virtual archive. Linux and prepared directory runtimes need no redirection.

The Office resolver only redirects dependencies belonging to the packaged runtime. External plugin installations retain their own locations; an in-archive Office engine outside the runtime package directory is rejected, and a missing unpacked file fails resolution. Hooks apply to the installing thread; worker threads must install their own resolver when they load these packages.

## Verification

The [Office engine resolution tests](tests/office-engine.spec.ts) cover unpacked resolution, external packages, rejected archive locations, and absent unpacked files. The [CLI launcher tests](../desktop/tests/cli-launcher.spec.ts) cover shell arguments and exit behavior. Packaging additionally runs the [prepared-runtime smoke](../desktop/scripts/smoke-prepared-runtime.ts) and [packaged-runtime smoke](../desktop/scripts/smoke-packaged-runtime.ts); consult the [desktop guide](../desktop/README.md#linux-desktop) for the target commands. On Linux, the smoke verifies standard Node.js execution, Sharp PNG encoding and decoding, the packaged Landlock capability probe, and native flock locking.
