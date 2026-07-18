export type ModTarget = 'fivem' | 'gta' | 'both'
export type ModCategory = 'graphics' | 'audio' | 'bloodfx' | 'killfx'

export interface ModFile {
  source: string
  destination: string
}

export interface ModManifest {
  id: string
  name: string
  nameAr: string
  description: string
  descriptionAr: string
  category: ModCategory
  target: ModTarget
  files: ModFile[]
  preview?: string
  soundPreview?: string
  videoPreview?: string
  color?: string
  favorite?: boolean
  // حقول المصدر المركزي (المرحلة 2)
  folderName?: string
  downloadUrl?: string
  size?: number
  downloaded?: boolean
}

// عنصر في ملف القائمة المركزي catalog.json
export interface RemoteMod {
  id: string
  category: ModCategory
  folderName: string
  name?: string
  nameAr: string
  descriptionAr?: string
  downloadUrl: string
  size?: number
  preview?: string
  soundPreview?: string
  videoPreview?: string
}

export interface DownloadProgress {
  modId: string
  progress: number
}

export interface AppSettings {
  gtaPath: string
  fivemPath: string
  backupEnabled: boolean
}

export interface ActiveMods {
  graphics: string | null
  audio: string | null
  bloodfx: string | null
  killfx: string | null
}

export interface InstalledPaths {
  graphics: string[]
  audio: string[]
  bloodfx: string[]
  killfx: string[]
}

export interface AppStateData {
  settings: AppSettings
  activeMods: ActiveMods
  installedPaths: InstalledPaths
  customMods?: string
}

export interface ModStatus {
  id: string
  active: boolean
  installed: boolean
}
