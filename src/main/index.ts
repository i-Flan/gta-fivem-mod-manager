import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { loadModCatalog, buildModCatalog, getModsDirectory, initModsDirectory } from './modCatalog'
import { downloadAndInstall } from './modDownloader'
import { getAdminToken, setAdminToken, verifyToken, adminAddMod, adminEditMod, adminDeleteMod, adminUploadSound, adminUploadMedia } from './adminApi'
import type { ModCategory } from '../shared/types'
import {
  loadState,
  saveState,
  activateMod,
  deactivateMod
} from './modInstaller'
import { getDefaultSettings, validatePaths } from './pathResolver'
import type { AppSettings } from '../shared/types'
import { startDiscordBot } from './discord_bot'
import { announceMod, getWebhooksConfig, setWebhooksConfig, type PublishMod } from './announce'
import { getBoosterState, verifyBooster, openBoostPage } from './boosterAuth'
import { addPersonalMod, updatePersonalMod, deletePersonalMod, listPersonalMods } from './personalMods'
import { autoUpdater } from 'electron-updater'

// التحديث التلقائي: عند تشغيل النسخة المثبّتة يفحص GitHub Releases،
// ينزّل أي إصدار أحدث في الخلفية. بدل رسالة ويندوز، نرسل إشعاراً داخل
// البرنامج فيه زرّين (حدّث الآن / لاحقاً). لو اختار لاحقاً يُثبّت عند الإغلاق.
function setupAutoUpdate(): void {
  if (!app.isPackaged) return
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true // لو ضغط "لاحقاً" يتثبّت عند إغلاق البرنامج
  autoUpdater.on('error', (err) => console.error('[AutoUpdate] error:', err?.message))
  autoUpdater.on('update-available', (info) =>
    console.log('[AutoUpdate] نسخة جديدة متوفرة:', info.version)
  )
  autoUpdater.on('update-downloaded', (info) => {
    console.log('[AutoUpdate] تم تنزيل النسخة:', info.version)
    // نبلّغ الواجهة عشان تعرض رسالة التحديث الأنيقة داخل البرنامج
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-ready', { version: info.version })
    }
  })
  autoUpdater.checkForUpdates().catch((err) =>
    console.error('[AutoUpdate] فشل الفحص:', err?.message)
  )
}

// شاشة بداية أنيقة تظهر أثناء تحميل البرنامج
const SPLASH_HTML = `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;height:100%;background:transparent;overflow:hidden;font-family:Arial,Helvetica,sans-serif}
.card{position:absolute;inset:10px;border-radius:24px;background:linear-gradient(160deg,#161619,#0b0b0d);border:1px solid #2a2a31;
display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;box-shadow:0 24px 70px #000b;animation:pop .45s cubic-bezier(.22,1,.36,1)}
.card::after{content:'';position:absolute;inset:0;border-radius:24px;background:radial-gradient(circle at 50% 30%,rgba(224,30,43,.18),transparent 60%);pointer-events:none}
@keyframes pop{from{opacity:0;transform:scale(.9)}to{opacity:1;transform:scale(1)}}
.wm{font-size:56px;font-weight:800;font-style:italic;letter-spacing:1px;filter:drop-shadow(0 3px 6px #000a);position:relative;z-index:1}
.five{background:linear-gradient(100deg,#9a9a9a,#ffffff 18%,#8f8f8f 38%,#ffffff 52%,#7d7d7d 72%,#e8e8e8);background-size:250% 100%;
-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;animation:shine 2.2s linear infinite}
@keyframes shine{0%{background-position:0}100%{background-position:250%}}
.y{color:#e01e2b;text-shadow:0 0 20px rgba(224,30,43,.6)}
.sub{color:#8a8f98;font-size:11px;letter-spacing:4px;text-transform:uppercase;position:relative;z-index:1}
.bar{width:160px;height:4px;border-radius:4px;background:#26262e;overflow:hidden;position:relative;z-index:1}
.bar>i{position:absolute;top:0;left:0;height:100%;width:40%;border-radius:4px;background:linear-gradient(90deg,#e01e2b,#f5313f);animation:load 1.3s ease-in-out infinite}
@keyframes load{0%{left:-40%}100%{left:160%}}
</style></head><body><div class="card"><div class="wm"><span class="five">Five</span><span class="y">y</span></div><div class="sub">Mod Manager</div><div class="bar"><i></i></div></div></body></html>`

let splashWindow: BrowserWindow | null = null
let mainWindow: BrowserWindow | null = null
function createSplash(): void {
  splashWindow = new BrowserWindow({
    width: 460,
    height: 300,
    frame: false,
    transparent: true,
    resizable: false,
    center: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: true
  })
  splashWindow.loadURL('data:text/html;charset=UTF-8,' + encodeURIComponent(SPLASH_HTML))
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    // بدون شريط ويندوز — أزرار التحكم مدمجة داخل التطبيق (TitleBar)
    frame: false,
    backgroundColor: '#0b0b0d',
    title: 'Tik @le_o | Dis.gg/k71',
    icon: join(app.getAppPath(), 'build', 'icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })
  mainWindow = win

  win.on('ready-to-show', () => {
    // نبقي شاشة البداية ظاهرة مدة قصيرة ثم نفتح البرنامج
    setTimeout(() => {
      if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close()
      splashWindow = null
      win.show()
    }, 1600)
  })

  // نُعلم الواجهة بتغير حالة التكبير عشان تتغير أيقونة الزر
  win.on('maximize', () => win.webContents.send('window-maximized', true))
  win.on('unmaximize', () => win.webContents.send('window-maximized', false))

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
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

  // ── البوستر ─────────────────────────────────────────────
  ipcMain.handle('booster-status', () => getBoosterState())
  ipcMain.handle('booster-verify', async () => verifyBooster(mainWindow))
  ipcMain.handle('booster-open-boost-page', () => {
    openBoostPage()
    return { success: true }
  })

  // اختيار ملف/مجلد للمود الخاص
  ipcMain.handle('booster-pick-source', async (_event, kind: 'folder' | 'file') => {
    const result = await dialog.showOpenDialog(
      kind === 'folder'
        ? { properties: ['openDirectory'], title: 'اختر مجلد المود' }
        : { properties: ['openFile'], title: 'اختر ملف المود', filters: [{ name: 'Mod', extensions: ['zip', 'rpf', 'dat', 'oiv', 'awc'] }] }
    )
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('booster-pick-image', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      title: 'اختر صورة المود',
      filters: [{ name: 'Image', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }]
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('booster-list-mods', () => listPersonalMods())

  ipcMain.handle('booster-add-mod', async (_event, input: Parameters<typeof addPersonalMod>[0]) => {
    if (!getBoosterState().isBooster) return { success: false, error: 'هذي الميزة للبوسترز فقط' }
    return addPersonalMod(input)
  })

  ipcMain.handle('booster-update-mod', (_event, id: string, fields: { nameAr?: string; imagePath?: string }) => {
    if (!getBoosterState().isBooster) return { success: false, error: 'هذي الميزة للبوسترز فقط' }
    return updatePersonalMod(id, fields)
  })

  ipcMain.handle('booster-delete-mod', (_event, id: string) => {
    if (!getBoosterState().isBooster) return { success: false, error: 'هذي الميزة للبوسترز فقط' }
    return deletePersonalMod(id)
  })

  // أزرار التحكم بالنافذة (شريط العنوان المخصص داخل التطبيق)
  ipcMain.handle('window-minimize', () => mainWindow?.minimize())
  ipcMain.handle('window-close', () => mainWindow?.close())
  ipcMain.handle('window-maximize', () => {
    if (!mainWindow) return false
    if (mainWindow.isMaximized()) mainWindow.unmaximize()
    else mainWindow.maximize()
    return mainWindow.isMaximized()
  })

  // "حدّث الآن": يغلق البرنامج ويثبّت النسخة الجديدة فوراً ثم يعيد فتحه.
  // isSilent=false ليعرض المثبّت (هو من يعيد التشغيل)، و isForceRunAfter=false
  // حتى لا يُفتح البرنامج مرتين فيتصارعان ويعلّق.
  ipcMain.handle('install-update-now', () => {
    setImmediate(() => autoUpdater.quitAndInstall(false, false))
    return { success: true }
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

  // ── لوحة إدارة المودات (المدير فقط) ──────────────────
  ipcMain.handle('admin-status', () => {
    return { isAdmin: getAdminToken().length > 0 }
  })

  ipcMain.handle('admin-set-token', async (_event, token: string) => {
    const ok = await verifyToken(token)
    if (ok) setAdminToken(token)
    return { success: ok }
  })

  ipcMain.handle('admin-pick-folder', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'], title: 'اختر مجلد المود' })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  // اختيار مقطع صوت من جهاز المدير (لمعاينة الصوت داخل البرنامج)
  ipcMain.handle('admin-pick-audio', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      title: 'اختر مقطع الصوت',
      filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'm4a', 'aac'] }]
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('admin-upload-sound', async (_event, id: string, filePath: string) => {
    const token = getAdminToken()
    if (!token) return { success: false, error: 'لا يوجد مفتاح مدير' }
    return adminUploadSound(id, filePath, token)
  })

  // اختيار صورة أو فيديو معاينة (للجرافكس/البلود/الكيل)
  ipcMain.handle('admin-pick-media', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      title: 'اختر صورة أو فيديو المعاينة',
      filters: [
        { name: 'Image or Video', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'mp4', 'webm', 'mov'] }
      ]
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('admin-upload-media', async (_event, id: string, filePath: string) => {
    const token = getAdminToken()
    if (!token) return { success: false, error: 'لا يوجد مفتاح مدير' }
    return adminUploadMedia(id, filePath, token)
  })

  ipcMain.handle(
    'admin-add-mod',
    async (
      _event,
      input: { folderPath: string; category: ModCategory; folderName: string; nameAr: string; descriptionAr?: string }
    ) => {
      const token = getAdminToken()
      if (!token) return { success: false, error: 'لا يوجد مفتاح مدير' }
      return adminAddMod(input, token)
    }
  )

  ipcMain.handle(
    'admin-edit-mod',
    async (
      _event,
      id: string,
      fields: { nameAr?: string; descriptionAr?: string; preview?: string; soundPreview?: string; videoPreview?: string }
    ) => {
      const token = getAdminToken()
      if (!token) return { success: false, error: 'لا يوجد مفتاح مدير' }
      return adminEditMod(id, fields, token)
    }
  )

  ipcMain.handle('admin-delete-mod', async (_event, id: string) => {
    const token = getAdminToken()
    if (!token) return { success: false, error: 'لا يوجد مفتاح مدير' }
    return adminDeleteMod(id, token)
  })

  // روابط النشر (Webhooks) — تُضبط من داخل لوحة الإدارة
  ipcMain.handle('admin-get-webhooks', () => {
    if (!getAdminToken()) return {}
    return getWebhooksConfig()
  })

  ipcMain.handle('admin-set-webhooks', (_event, hooks: Record<string, string>) => {
    if (!getAdminToken()) return { success: false, error: 'لا يوجد مفتاح مدير' }
    return setWebhooksConfig(hooks)
  })

  // نشر إعلان المود في روم التصنيف عبر Webhook (زر "نشر" في لوحة الإدارة)
  ipcMain.handle('admin-publish-mod', async (_event, mod: PublishMod) => {
    const token = getAdminToken()
    if (!token) return { success: false, error: 'لا يوجد مفتاح مدير' }
    return announceMod(mod)
  })
}

// قفل النسخة الواحدة: بعد التحديث قد يُشغَّل البرنامج مرتين (المُحدِّث + خانة
// "Run Fivey" في المثبّت)، فتتصارع النسختان على نفس الملفات ويعلّق البرنامج.
// النسخة الثانية تُغلق فوراً وتُظهر النافذة الأصلية بدلاً منها.
const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  app.quit()
}

app.on('second-instance', () => {
  if (splashWindow && !splashWindow.isDestroyed()) splashWindow.focus()
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  }
})

app.whenReady().then(() => {
  if (!gotSingleInstanceLock) return
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

  createSplash()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
