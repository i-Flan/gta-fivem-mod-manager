import { useState, useEffect, useCallback } from 'react'
import type { ModManifest, ModCategory, ActiveMods, AppSettings } from '../../../shared/types'
import { I18nContext, makeI18n, type Lang } from './i18n'
import Header from './components/Header'
import ModCard from './components/ModCard'
import SettingsPanel from './components/SettingsPanel'
import EditModal from './components/EditModal'
import AdminPanel from './components/AdminPanel'
import './App.css'

// أسماء التصنيفات دائماً بالإنجليزي (موحّدة)، وباقي الكلام يتبع اللغة المختارة
const CATS: { key: ModCategory; icon: string; name: string; label: string }[] = [
  { key: 'graphics', icon: '🎨', name: 'Graphics', label: 'FiveM Graphics' },
  { key: 'audio', icon: '🔊', name: 'Weapon Sounds', label: 'GTA V Weapon Sounds' },
  { key: 'bloodfx', icon: '🩸', name: 'BloodFX', label: 'Blood Effects' },
  { key: 'killfx', icon: '💥', name: 'KillFX', label: 'Kill Effects' }
]

export default function App(): React.JSX.Element {
  const [mods, setMods] = useState<ModManifest[]>([])
  const [activeCategory, setActiveCategory] = useState<ModCategory>('graphics')
  const [activeMods, setActiveMods] = useState<ActiveMods>({ graphics: null, audio: null, bloodfx: null, killfx: null })
  const [settings, setSettings] = useState<AppSettings>({ gtaPath: '', fivemPath: '', backupEnabled: true, language: 'ar' })
  const [gtaValid, setGtaValid] = useState(false)
  const [fivemValid, setFivemValid] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const [showFavorites, setShowFavorites] = useState(false)
  const [editingMod, setEditingMod] = useState<ModManifest | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [downloadProgress, setDownloadProgress] = useState<Record<string, number>>({})
  const [isAdmin, setIsAdmin] = useState(false)
  const [showAdmin, setShowAdmin] = useState(false)

  const i18n = makeI18n((settings.language as Lang) || 'ar')
  const { t, dir } = i18n

  const showToast = (key: string, type: 'success' | 'error'): void => {
    setToast({ msg: t(key), type })
    setTimeout(() => setToast(null), 3000)
  }

  const loadMods = useCallback(async () => {
    const list = await window.api.refreshMods()
    const savedFavorites = JSON.parse(localStorage.getItem('favorites') || '[]')
    const state = await window.api.getState()
    const customMods = JSON.parse(state.customMods || '{}')
    setMods(list.map((mod) => ({ ...mod, favorite: savedFavorites.includes(mod.id), ...(customMods[mod.id] || {}) })))
    return list
  }, [])

  useEffect(() => {
    async function start(): Promise<void> {
      const [, state] = await Promise.all([loadMods(), window.api.getState()])
      setActiveMods(state.activeMods)
      setSettings(state.settings)
      setGtaValid(state.paths.gtaValid)
      setFivemValid(state.paths.fivemValid)
    }
    start()
  }, [loadMods])

  useEffect(() => window.api.onDownloadProgress(({ modId, progress }) => setDownloadProgress((prev) => ({ ...prev, [modId]: progress }))), [])
  useEffect(() => { window.api.adminStatus().then((s) => setIsAdmin(s.isAdmin)) }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.ctrlKey && e.shiftKey && (e.key === 'A' || e.key === 'a')) { e.preventDefault(); setShowAdmin(true) } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const activate = async (id: string): Promise<void> => {
    setLoadingId(id)
    const result = await window.api.activateMod(id)
    setLoadingId(null)
    if (result.success) { if (result.activeMods) setActiveMods(result.activeMods); showToast('toastActivated', 'success') }
    else setToast({ msg: result.error || t('toastError'), type: 'error' })
  }
  const deactivate = async (id: string): Promise<void> => {
    setLoadingId(id)
    const result = await window.api.deactivateMod(id)
    setLoadingId(null)
    if (result.success) { if (result.activeMods) setActiveMods(result.activeMods); showToast('toastDeactivated', 'success') }
    else setToast({ msg: result.error || t('toastError'), type: 'error' })
  }
  const download = async (id: string): Promise<void> => {
    setDownloadingId(id)
    setDownloadProgress((prev) => ({ ...prev, [id]: 0 }))
    const result = await window.api.downloadMod(id)
    setDownloadingId(null)
    if (result.success) { await loadMods(); showToast('toastDownloaded', 'success') }
    else setToast({ msg: result.error || t('toastDownloadFail'), type: 'error' })
  }
  const refresh = async (): Promise<void> => {
    setRefreshing(true)
    await loadMods()
    setRefreshing(false)
    showToast('toastRefreshed', 'success')
  }
  const save = async (next: AppSettings): Promise<void> => {
    const result = await window.api.saveSettings(next)
    setSettings(next)
    setGtaValid(result.paths.gtaValid)
    setFivemValid(result.paths.fivemValid)
    showToast('toastSettingsSaved', 'success')
  }
  const toggleFavorite = (id: string): void => {
    setMods((prev) => prev.map((mod) => (mod.id === id ? { ...mod, favorite: !mod.favorite } : mod)))
    const favorites = mods.map((m) => (m.id === id ? { ...m, favorite: !m.favorite } : m)).filter((m) => m.favorite).map((m) => m.id)
    localStorage.setItem('favorites', JSON.stringify(favorites))
  }
  const handleEdit = (mod: ModManifest): void => setEditingMod(mod)
  const handleSaveEdit = async (updatedMod: ModManifest): Promise<void> => {
    setMods((prev) => prev.map((m) => (m.id === updatedMod.id ? updatedMod : m)))
    await window.api.saveCustomMod(updatedMod.id, { nameAr: updatedMod.nameAr, descriptionAr: updatedMod.descriptionAr })
    setEditingMod(null)
    showToast('toastEditSaved', 'success')
  }

  const cat = CATS.find((c) => c.key === activeCategory)!
  const list = showFavorites ? mods.filter((m) => m.favorite) : mods.filter((m) => m.category === activeCategory)

  return (
    <I18nContext.Provider value={i18n}>
      <div className="app" dir={dir}>
        <Header gtaValid={gtaValid} fivemValid={fivemValid} isAdmin={isAdmin} onOpenAdmin={() => setShowAdmin(true)} onOpenSettings={() => setShowSettings(true)} onRefresh={refresh} refreshing={refreshing} />
        <main className="main-content">
          <nav className="category-switcher">
            <div className="categories-left">
              {CATS.map((c) => (
                <button key={c.key} className={activeCategory === c.key && !showFavorites ? 'selected' : ''} onClick={() => { setActiveCategory(c.key); setShowFavorites(false) }}>
                  {c.icon} {c.name}<span>{mods.filter((m) => m.category === c.key).length}</span>
                </button>
              ))}
            </div>
            <button className={`favorites-btn ${showFavorites ? 'active' : ''}`} onClick={() => { setShowFavorites(!showFavorites); setActiveCategory('graphics') }}>
              ★ {t('favorites')}<span>{mods.filter((m) => m.favorite).length}</span>
            </button>
          </nav>
          <section className="content-heading" key={`${showFavorites ? 'fav' : activeCategory}-${i18n.lang}`}>
            <div>
              <p className="eyebrow">{showFavorites ? t('favEyebrow') : cat.label}</p>
              <h2>{showFavorites ? t('favorites') : cat.name}</h2>
              <p>{showFavorites ? t('emptyFavHint') : t(`cat_${activeCategory}_desc`)}</p>
            </div>
            <span className="mods-count">{list.length} {t('available')}</span>
          </section>
          {list.length ? (
            <div className="mods-grid">
              {list.map((mod) => (
                <ModCard key={mod.id} mod={mod} isActive={activeMods[mod.category] === mod.id} loading={loadingId === mod.id} downloading={downloadingId === mod.id} progress={downloadProgress[mod.id] || 0} onActivate={activate} onDeactivate={deactivate} onDownload={download} onToggleFavorite={toggleFavorite} onEdit={handleEdit} />
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <span className="icon">{showFavorites ? '★' : cat.icon}</span>
              <p>{showFavorites ? t('emptyFav') : t('emptyCategory')}</p>
              <p className="hint">{showFavorites ? t('emptyFavHint') : t('emptyHint')}</p>
            </div>
          )}
        </main>
        {showAdmin && <AdminPanel onClose={() => setShowAdmin(false)} onReload={loadMods} onAdminChange={setIsAdmin} />}
        {showSettings && <SettingsPanel settings={settings} onSave={save} onClose={() => setShowSettings(false)} />}
        {editingMod && <EditModal mod={editingMod} onClose={() => setEditingMod(null)} onSave={handleSaveEdit} />}
        {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}
      </div>
    </I18nContext.Provider>
  )
}
