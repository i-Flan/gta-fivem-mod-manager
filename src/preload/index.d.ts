import { ElectronAPI } from '@electron-toolkit/preload'
import type { ModManifest, AppSettings, ActiveMods } from '../../shared/types'

interface PathValidation {
  gtaValid: boolean
  fivemValid: boolean
}

interface AppState {
  settings: AppSettings
  activeMods: ActiveMods
  paths: PathValidation
}

interface ActivateResult {
  success: boolean
  error?: string
  activeMods?: ActiveMods
}

interface API {
  getMods: () => Promise<ModManifest[]>
  getState: () => Promise<AppState>
  saveSettings: (settings: AppSettings) => Promise<{ success: boolean; paths: PathValidation }>
  activateMod: (modId: string) => Promise<ActivateResult>
  deactivateMod: (modId: string) => Promise<ActivateResult>
  browseFolder: (type: 'gta' | 'fivem') => Promise<string | null>
  getModsDir: () => Promise<string>
  openModsFolder: () => Promise<string>
  refreshMods: () => Promise<ModManifest[]>
  saveCustomMod: (
    modId: string,
    customData: { nameAr?: string; descriptionAr?: string }
  ) => Promise<{ success: boolean }>
  downloadMod: (modId: string) => Promise<{ success: boolean; error?: string }>
  onDownloadProgress: (
    callback: (data: { modId: string; progress: number }) => void
  ) => () => void
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: API
  }
}

export type { ModManifest, AppSettings, ActiveMods, AppState, API }
