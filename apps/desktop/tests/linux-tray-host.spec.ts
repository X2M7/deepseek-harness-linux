import { expect, it } from 'vitest'
import { linuxHasTrayHost } from '../src/linux-tray-host.ts'

it.each(['KDE', 'XFCE', 'X-Cinnamon', 'MATE', 'LXQt', 'Unity', 'KDE:GNOME'])(
  'allows close-to-tray in a session with a visible tray host (%s)', (desktop) => {
    expect(linuxHasTrayHost({ XDG_CURRENT_DESKTOP: desktop })).toBe(true)
  },
)

it.each(['GNOME', 'GNOME:KDE', 'ubuntu:GNOME', 'pop:GNOME', '', 'unknown'])(
  'keeps close-to-quit when a tray host is not known (%s)', (desktop) => {
    expect(linuxHasTrayHost({ XDG_CURRENT_DESKTOP: desktop })).toBe(false)
  },
)
