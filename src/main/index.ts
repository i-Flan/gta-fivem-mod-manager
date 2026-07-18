import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { loadModCatalog, buildModCatalog, getModsDirectory, initModsDirectory } from './modCatalog'
import { downloadAndInstall } from './modDownloader'
import {
  loadState,
  saveState,
  activateMod,
  deactivateMod
} from './modInstaller'
import { getDefaultSettings, validatePaths } from './pathResolver'
import type { AppSettings } from '../shared/types'
import { startDiscordBot } from './discord_bot'
import { autoUpdater } from 'electron-updater'

// التحديث التلقائي: عند تشغيل النسخة المثبّتة يفحص GitHub Releases،
// ينزّل أي إصدار أحدث في الخلفية، ويثبّته عند إغلاق البرنامج.
function setupAutoUpdate(): void {
  if (!app.isPackaged) return
  autoUpdater.autoDownload = true
  autoUpdater.on('error', (err) => console.error('[AutoUpdate] error:', err?.message))
  autoUpdater.on('update-available', (info) =>
    console.log('[AutoUpdate] نسخة جديدة متوفرة:', info.version)
  )
  autoUpdater.on('update-downloaded', (info) =>
    console.log('[AutoUpdate] تم تنزيل النسخة:', info.version, '— ستُثبّت عند الإغلاق')
  )
  autoUpdater.checkForUpdatesAndNotify().catch((err) =>
    console.error('[AutoUpdate] فشل الفحص:', err?.message)
  )
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    title: 'GTA / FiveM Mod Manager',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function initState(): void {
  const state = loadState()
  if (!state.settings.gtaPath && !state.settings.fivemPath) {
    const defaults = getDefaultSettings()
    saveState(defaults, state.activeMods, state.installedPaths)
  }
}

function setupIpc(): void {
  ipcMain.handle('get-mods', async () => {
    return buildModCatalog()
  })

  // تحميل مود من المصدر المركزي (GitHub) وتركيبه محلياً
  ipcMain.handle('download-mod', async (event, modId: string) => {
    const catalog = await buildModCatalog()
    const mod = catalog.find((m) => m.id === modId)
    if (!mod || !mod.downloadUrl) {
      return { success: false, error: 'المود غير متوفر للتحميل' }
    }
    const sender = event.sender
    const result = await downloadAndInstall(mod, (progress) => {
      if (!sender.isDestroyed()) sender.send('download-progress', { modId, progress })
    })
    return result
  })

  ipcMain.handle('get-state', () => {
    const state = loadState()
    if (!state.settings.gtaPath) {
      state.settings = { ...getDefaultSettings(), ...state.settings }
    }
    const paths = validatePaths(state.settings)
    return { ...state, paths }
  })

  ipcMain.handle('save-settings', (_event, settings: AppSettings) => {
    const state = loadState()
    saveState(settings, state.activeMods, state.installedPaths)
    const paths = validatePaths(settings)
    return { success: true, paths }
  })

  ipcMain.handle('activate-mod', (_event, modId: string) => {
    const mods = loadModCatalog()
    const mod = mods.find((m) => m.id === modId)
    if (!mod) return { success: false, error: 'المود غير موجود' }

    const state = loadState()
    const settings = state.settings.gtaPath
      ? state.settings
      : { ...getDefaultSettings(), ...state.settings }

    const result = activateMod(mod, mods, settings, state)
    return result
  })

  ipcMain.handle('deactivate-mod', (_event, modId: string) => {
    const mods = loadModCatalog()
    const mod = mods.find((m) => m.id === modId)
    if (!mod) return { success: false, error: 'المود غير موجود' }

    const state = loadState()
    const result = deactivateMod(mod, state.settings, state)
    return result
  })

  ipcMain.handle('browse-folder', async (_event, type: 'gta' | 'fivem') => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: type === 'gta' ? 'اختر مجلد GTA V' : 'اختر مجلد FiveM'
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('get-mods-dir', () => {
    return getModsDirectory()
  })

  ipcMain.handle('open-mods-folder', () => {
    initModsDirectory()
    shell.openPath(getModsDirectory())
    return getModsDirectory()
  })

  ipcMain.handle('refresh-mods', async () => {
    const mods = await buildModCatalog()
    // إرسال قائمة المودات للبوت
    ipcMain.emit('mods-updated', null, mods)
    return mods
  })

  // Handler لطلب تحديث المودات من البوت
  ipcMain.on('refresh-mods-request', async () => {
    const mods = await buildModCatalog()
    ipcMain.emit('mods-updated', null, mods)
  })

  // IPC handler لتغيير صورة المود من البوت
  ipcMain.on('update-mod-image', (_event, modId: string, imageUrl: string) => {
    const state = loadState()
    const customMods = JSON.parse(state.customMods || '{}')
    if (!customMods[modId]) {
      customMods[modId] = {}
    }
    customMods[modId].preview = imageUrl
    saveState(state.settings, state.activeMods, state.installedPaths, JSON.stringify(customMods))
  })

  // IPC handler لربط مقطع صوتي (تجربة الصوت) بالمود من البوت
  ipcMain.on('update-mod-sound', (_event, modId: string, soundUrl: string) => {
    const state = loadState()
    const customMods = JSON.parse(state.customMods || '{}')
    if (!customMods[modId]) {
      customMods[modId] = {}
    }
    customMods[modId].soundPreview = soundUrl
    saveState(state.settings, state.activeMods, state.installedPaths, JSON.stringify(customMods))
  })

  // IPC handler لربط مقطع فيديو معاينة (5 ثواني) بالمود من البوت
  ipcMain.on('update-mod-video', (_event, modId: string, videoUrl: string) => {
    const state = loadState()
    const customMods = JSON.parse(state.customMods || '{}')
    if (!customMods[modId]) {
      customMods[modId] = {}
    }
    customMods[modId].videoPreview = videoUrl
    saveState(state.settings, state.activeMods, state.installedPaths, JSON.stringify(customMods))
  })

  // IPC handler لحفظ التعديلات من التطبيق
  ipcMain.handle('save-custom-mod', (_event, modId: string, customData: { nameAr?: string; descriptionAr?: string }) => {
    const state = loadState()
    const customMods = JSON.parse(state.customMods || '{}')
    if (!customMods[modId]) {
      customMods[modId] = {}
    }
    if (customData.nameAr) customMods[modId].nameAr = customData.nameAr
    if (customData.descriptionAr) customMods[modId].descriptionAr = customData.descriptionAr
    saveState(state.settings, state.activeMods, state.installedPaths, JSON.stringify(customMods))
    return { success: true }
  })
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.gtafivem.modmanager')
  initModsDirectory()
  initState()
  setupIpc()
  setupAutoUpdate()

  // بوت ديسكورد يعمل فقط عند المدير أثناء التطوير ومع وجود توكن في متغيرات البيئة.
  // لا يُشغّل أبداً في النسخة المثبّتة الموزّعة على المستخدمين (حماية للتوكن).
  if (!app.isPackaged && process.env.DISCORD_BOT_TOKEN) {
    startDiscordBot()
  }

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
