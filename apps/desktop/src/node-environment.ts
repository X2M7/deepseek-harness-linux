/** Bundled Node startup, with private shell launchers scoped to package installation. */

import { delimiter } from 'node:path'

/**
 * Select the shell launcher used by package scripts. Electron requires its Node-mode flag;
 * the standalone Node used on Linux ignores that flag.
 * @param executable - Bundled Node or Electron executable used by the Host.
 * @param bin - Directory containing the node shell launcher.
 * @param environment - Caller environment preserved for plugin execution.
 * @returns Environment for a standalone Node or Electron Node-mode child process.
 */
export function desktopNodeEnvironment(executable: string, bin: string | undefined, environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return {
    ...environment,
    ELECTRON_RUN_AS_NODE: '1',
    ...(bin === undefined ? {} : { DSH_DESKTOP_NODE_EXECUTABLE: executable, PATH: `${bin}${delimiter}${environment.PATH ?? ''}` }),
  }
}
