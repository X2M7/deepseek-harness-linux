# Desktop Host

[English](README.md) | 中文

## 概述

私有 Desktop Host 在 Linux 上使用内置标准 Node.js，在 macOS 和 Windows 上使用 Electron Node 模式，运行桌面 profile 和内置 CLI。桌面壳负责 Host 启动、经过认证的 Web 访问、账户会话 IPC、任务检查及关闭。请使用[桌面开发与打包命令](../desktop/README.zh.md)；此包不提供独立的应用启动器。

## 打包后的原生依赖

Linux 使用 `resources/runtime/primary-runtime/dependencies/node/bin/node` 启动 Host 和 CLI。[桌面打包配置](../desktop/scripts/electron-builder-config.mjs)将完整生产依赖树放在物理目录 `resources/dsh`。Sharp 与其他原生 addon 使用标准 Node.js；Office 引擎与 Landlock 启动器保留可执行的文件系统路径。现有沙箱提供方仍保留其隔离检查与失败行为。

Host 和内置 CLI 会在启动 profile 或 CLI 前，调用 [office-engine.ts](src/office-engine.ts) 中的 `installOfficeEngineResolution`。对于 macOS 和 Windows 上位于 `app.asar` 内的运行时，该解析器从 `app.asar.unpacked/dsh/node_modules/@deepseek-ai` 下的完整物理目录加载平台专用 LibreOffice 包，使原生子进程能够在 Electron 虚拟归档之外读取和执行这些文件。Linux 与准备阶段的目录运行时无需重定向。

Office 解析器只重定向属于打包运行时的依赖。外部插件安装保留自己的位置；归档内位于运行时软件包目录之外的 Office 引擎会被拒绝，缺失的解包文件也会导致解析失败。Hook 只作用于安装它的线程；工作线程在加载这些软件包时必须安装自己的解析器。

## 验证

[Office 引擎解析测试](tests/office-engine.spec.ts)覆盖解包路径解析、外部软件包、被拒绝的归档位置和缺失解包文件。[CLI 启动器测试](../desktop/tests/cli-launcher.spec.ts)覆盖 shell 参数与退出行为。打包还会运行[准备阶段运行时冒烟检查](../desktop/scripts/smoke-prepared-runtime.ts)与[打包运行时冒烟检查](../desktop/scripts/smoke-packaged-runtime.ts)；目标命令见[桌面指南](../desktop/README.zh.md#linux-desktop)。在 Linux 上，冒烟检查会验证标准 Node.js 执行、Sharp PNG 编码与解码、打包后的 Landlock 能力探测以及原生 flock 加锁。
