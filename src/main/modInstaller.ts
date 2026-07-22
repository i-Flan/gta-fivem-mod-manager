import {
  existsSync,
  mkdirSync,
  copyFileSync,
  unlinkSync,
  readFileSync,
  writeFileSync,
  rmSync,
  chmodSync
} from 'fs'
import { join, dirname } from 'path'
import { app } from 'electron'
import type {
  ModManifest,
  AppSettings,
  ActiveMods,
  InstalledPaths,
  AppStateData,
  ModCategory
} from '../shared/types'
import { resolveDestination } from './pathResolver'
import { getModSourceDir } from './modCatalog'

const EMPTY_PATHS: InstalledPaths = {
  graphics: [], audio: [], bloodfx: [], killfx: []
}

// لا يوجد تعارض بين التصنيفات: كل تصنيف يركّب في مسار مختلف
// (BloodFX = effects/mods، KillFX = timecycle)، فيمكن تفعيلهم معاً.
const CONFLICTING_CATEGORIES: Partial<Record<ModCategory, ModCategory>> = {}

function getStatePath(): string {
  return join(app.getPath('userData'), 'state.json')
}

function getBackupDir(): string {
  return join(app.getPath('userData'), 'backups')
}

export function loadState(): AppStateData {
  const statePath = getStatePath()
  if (existsSync(statePath)) {
    try {
      const raw = JSON.parse(readFileSync(statePath, 'utf-8'))
      return {
        settings: raw.settings || { gtaPath: '', fivemPath: '', backupEnabled: true },
        activeMods: { graphics: raw.activeMods?.graphics || null, audio: raw.activeMods?.audio || null, bloodfx: raw.activeMods?.bloodfx || null, killfx: raw.activeMods?.killfx || null },
        installedPaths: { graphics: raw.installedPaths?.graphics || [], audio: raw.installedPaths?.audio || [], bloodfx: raw.installedPaths?.bloodfx || [], killfx: raw.installedPaths?.killfx || [] },
        customMods: raw.customMods || '{}'
      }
    } catch {
      // fall through
    }
  }
  return {
    settings: { gtaPath: '', fivemPath: '', backupEnabled: true },
    activeMods: { graphics: null, audio: null, bloodfx: null, killfx: null },
    installedPaths: { ...EMPTY_PATHS },
    customMods: '{}'
  }
}

export function saveState(
  settings: AppSettings,
  activeMods: ActiveMods,
  installedPaths: InstalledPaths,
  customMods?: string
): void {
  const statePath = getStatePath()
  // إذا لم يُمرَّر customMods نحافظ على القيمة المحفوظة سابقاً حتى لا تُمسح
  // التعديلات (الصور، مقاطع الصوت، الأسماء) عند التفعيل/الإعدادات/بدء التشغيل
  const preservedCustomMods = customMods ?? loadState().customMods
  writeFileSync(
    statePath,
    JSON.stringify(
      { settings, activeMods, installedPaths, customMods: preservedCustomMods },
      null,
      2
    )
  )
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

function backupFile(filePath: string, modId: string): void {
  if (!existsSync(filePath)) return
  const backupDir = join(getBackupDir(), modId)
  ensureDir(backupDir)
  const fileName = filePath.split('\\').pop() || 'file'
  copyFileSync(filePath, join(backupDir, fileName))
}

function deletePath(filePath: string): void {
  if (!existsSync(filePath)) return
  // ملفات اللعبة غالباً "للقراءة فقط" — نشيل الخاصية قبل الحذف
  try {
    chmodSync(filePath, 0o666)
  } catch {
    // ignore
  }
  try {
    unlinkSync(filePath)
  } catch {
    try {
      rmSync(filePath, { recursive: true, force: true })
    } catch {
      // file may be locked
    }
  }
}

function clearInstalledPaths(
  category: ModCategory,
  paths: string[]
): void {
  for (const filePath of paths) {
    deletePath(filePath)
  }
}

function installModFiles(
  mod: ModManifest,
  settings: AppSettings
): { success: boolean; error?: string; installed: string[] } {
  const sourceDir = getModSourceDir(mod.id, mod.category)
  if (!sourceDir) return { success: false, error: 'مجلد المود غير موجود', installed: [] }

  const installed: string[] = []

  for (const file of mod.files) {
    const src = join(sourceDir, file.source)
    const dest = resolveDestination(file.destination, settings)

    if (!existsSync(src)) {
      return { success: false, error: `ملف المصدر غير موجود: ${file.source}`, installed }
    }

    ensureDir(dirname(dest))

    if (existsSync(dest)) {
      if (settings.backupEnabled) backupFile(dest, mod.id)
      deletePath(dest)
    }

    try {
      copyFileSync(src, dest)
    } catch (err) {
      const e = err as NodeJS.ErrnoException
      // خطأ صلاحيات/ملف مقفول — رسالة واضحة بدل الانهيار
      if (e.code === 'EPERM' || e.code === 'EACCES' || e.code === 'EBUSY') {
        return {
          success: false,
          error:
            'ما قدرنا نكتب في مجلد اللعبة. سكّر GTA و Rockstar Launcher تماماً، وشغّل البرنامج كمسؤول (كليك يمين ← Run as administrator).',
          installed
        }
      }
      throw err
    }
    installed.push(dest)
  }

  return { success: true, installed }
}

function removeModFiles(mod: ModManifest, settings: AppSettings): void {
  for (const file of mod.files) {
    deletePath(resolveDestination(file.destination, settings))
  }
}

export function activateMod(
  mod: ModManifest,
  allMods: ModManifest[],
  settings: AppSettings,
  state: AppStateData
): { success: boolean; error?: string; activeMods: ActiveMods; installedPaths: InstalledPaths } {
  const { activeMods, installedPaths } = state
  const currentActiveId = activeMods[mod.category]

  if (currentActiveId === mod.id) {
    return { success: true, activeMods, installedPaths }
  }

  // نبدأ من نسخ قابلة للتعديل حتى نلغي التصنيف المتعارض أيضاً إن وُجد
  const nextActiveMods: ActiveMods = { ...activeMods }
  const nextInstalledPaths: InstalledPaths = { ...installedPaths }

  // إزالة المود الحالي من نفس التصنيف
  clearInstalledPaths(mod.category, installedPaths[mod.category])
  if (currentActiveId) {
    const oldMod = allMods.find((m) => m.id === currentActiveId)
    if (oldMod) removeModFiles(oldMod, settings)
  }

  // إزالة المود المفعّل في التصنيف المتعارض (bloodfx <-> killfx) قبل التثبيت
  const conflicting = CONFLICTING_CATEGORIES[mod.category]
  if (conflicting) {
    const conflictingActiveId = activeMods[conflicting]
    clearInstalledPaths(conflicting, installedPaths[conflicting])
    if (conflictingActiveId) {
      const conflictingMod = allMods.find((m) => m.id === conflictingActiveId)
      if (conflictingMod) removeModFiles(conflictingMod, settings)
    }
    nextActiveMods[conflicting] = null
    nextInstalledPaths[conflicting] = []
  }

  const result = installModFiles(mod, settings)
  if (!result.success) {
    return { success: false, error: result.error, activeMods, installedPaths }
  }

  const newActiveMods: ActiveMods = { ...nextActiveMods, [mod.category]: mod.id }
  const newInstalledPaths: InstalledPaths = {
    ...nextInstalledPaths,
    [mod.category]: result.installed
  }

  saveState(settings, newActiveMods, newInstalledPaths)

  return {
    success: true,
    activeMods: newActiveMods,
    installedPaths: newInstalledPaths
  }
}

export function deactivateMod(
  mod: ModManifest,
  settings: AppSettings,
  state: AppStateData
): { success: boolean; activeMods: ActiveMods; installedPaths: InstalledPaths } {
  const { activeMods, installedPaths } = state

  clearInstalledPaths(mod.category, installedPaths[mod.category])
  removeModFiles(mod, settings)

  const newActiveMods = { ...activeMods, [mod.category]: null }
  const newInstalledPaths = { ...installedPaths, [mod.category]: [] }

  saveState(settings, newActiveMods, newInstalledPaths)

  return { success: true, activeMods: newActiveMods, installedPaths: newInstalledPaths }
}

export function clearAllMods(
  allMods: ModManifest[],
  settings: AppSettings,
  state: AppStateData
): ActiveMods {
  for (const mod of allMods) {
    if (state.activeMods[mod.category] === mod.id) {
      removeModFiles(mod, settings)
    }
  }

  for (const category of ['graphics', 'audio', 'bloodfx', 'killfx'] as ModCategory[]) {
    clearInstalledPaths(category, state.installedPaths[category])
  }

  const cleared: ActiveMods = { graphics: null, audio: null, bloodfx: null, killfx: null }
  const clearedPaths: InstalledPaths = { graphics: [], audio: [], bloodfx: [], killfx: [] }
  saveState(settings, cleared, clearedPaths)
  return cleared
}
