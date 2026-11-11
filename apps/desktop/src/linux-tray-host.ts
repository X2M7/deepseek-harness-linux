/** Desktop environments with a built-in, visible Linux status-icon area. */

const trayHosts = new Set(['kde', 'plasma', 'xfce', 'x-cinnamon', 'cinnamon', 'mate', 'lxqt', 'lxde', 'unity'])

/**
 * Keep close-to-tray discoverable on Linux; unknown shells keep close-to-quit.
 * @param environment - graphical session variables from the launching process.
 * @returns Whether the shell normally displays status icons without an extension.
 */
export function linuxHasTrayHost(environment: NodeJS.ProcessEnv): boolean {
  const desktop = (environment.XDG_CURRENT_DESKTOP || environment.DESKTOP_SESSION || '').split(':')[0] ?? ''
  return trayHosts.has(desktop.toLowerCase())
}
