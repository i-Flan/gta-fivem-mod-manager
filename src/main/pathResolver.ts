import { existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type { AppSettings } from '../shared/types'

const COMMON_GTA_PATHS = [
  'C:\\Program Files\\Rockstar Games\\Grand Theft Auto V Legacy',
  'C:\\Program Files\\Rockstar Games\\Grand Theft Auto V',
  'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Grand Theft Auto V',
  'D:\\SteamLibrary\\steamapps\\common\\Grand Theft Auto V',
  'C:\\Program Files\\Epic Games\\GTAV',
  'D:\\Games\\Grand Theft Auto V',
  'E:\\Games\\Grand Theft Auto V'
]

export function detectFivemPath(): string {
  const defaultPath = join(
    process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'),
    'FiveM',
    'FiveM.app'
  )
  return existsSync(defaultPath) ? defaultPath : defaultPath
}

export function detectGtaPath(): string {
  for (const p of COMMON_GTA_PATHS) {
    if (existsSync(join(p, 'GTA5.exe'))) return p
  }
  return ''
}

export function getDefaultSettings(): AppSettings {
  return {
    gtaPath: detectGtaPath(),
    fivemPath: detectFivemPath(),
    backupEnabled: true,
    language: 'ar'
  }
}

export function resolveDestination(
  destination: string,
  settings: AppSettings
): string {
  if (destination.startsWith('audio/')) {
    return join('C:\\Program Files\\Rockstar Games\\Grand Theft Auto V Legacy\\x64\\audio\\sfx', destination.slice(6))
  }
  if (destination.startsWith('fivem-effects/')) return join(settings.fivemPath, 'citizen', 'common', 'data', 'effects', destination.slice(14))
  if (destination.startsWith('fivem-mods/')) return join(settings.fivemPath, 'mods', destination.slice(12))
  if (destination.startsWith('fivem/')) {
    return join(settings.fivemPath, destination.slice(6))
  }
  if (destination.startsWith('gta/')) {
    return join(settings.gtaPath, destination.slice(4))
  }
  return destination
}

export function validatePaths(settings: AppSettings): {
  gtaValid: boolean
  fivemValid: boolean
} {
  return {
    gtaValid: settings.gtaPath !== '' && existsSync(join(settings.gtaPath, 'GTA5.exe')),
    fivemValid: settings.fivemPath !== '' && existsSync(settings.fivemPath)
  }
}
