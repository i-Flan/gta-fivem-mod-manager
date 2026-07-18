import { useState, useEffect, useRef } from 'react'
import type { ModManifest } from '../../../../shared/types'
import { useI18n } from '../i18n'
import './ModCard.css'

interface ModCardProps { mod: ModManifest; isActive: boolean; loading: boolean; downloading: boolean; progress: number; onActivate: (id: string) => void; onDeactivate: (id: string) => void; onDownload: (id: string) => void; onToggleFavorite: (id: string) => void; onEdit: (mod: ModManifest) => void }

function formatSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return ''
  const mb = bytes / (1024 * 1024)
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`
}

export default function ModCard({ mod, isActive, loading, downloading, progress, onActivate, onDeactivate, onDownload, onToggleFavorite, onEdit }: ModCardProps): React.JSX.Element {
  const { t } = useI18n()
  const bgColor = mod.color || '#1a2235'
  const [showMenu, setShowMenu] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [loadingSound, setLoadingSound] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const stopSound = () => {
    if (stopTimerRef.current) { clearTimeout(stopTimerRef.current); stopTimerRef.current = null }
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
    setPlaying(false)
    setLoadingSound(false)
  }

  const testSound = () => {
    if (playing || loadingSound) { stopSound(); return }
    const audio = new Audio(mod.soundPreview)
    audioRef.current = audio
    audio.onended = stopSound
    audio.onerror = stopSound
    setLoadingSound(true)
    audio.play().then(() => {
      // إذا أوقف المستخدم أثناء التحميل نتجاهل التشغيل
      if (audioRef.current !== audio) return
      setLoadingSound(false)
      setPlaying(true)
      // حد أقصى 5 ثواني للتشغيل
      stopTimerRef.current = setTimeout(stopSound, 5000)
    }).catch(stopSound)
  }

  useEffect(() => stopSound, [])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false)
      }
    }
    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showMenu])

  return <article className={`mod-card ${isActive ? 'active' : ''}`}>
    <div className="mod-preview" style={{ background: `linear-gradient(135deg, ${bgColor}, var(--bg-card))` }}>
      {isActive && <span className="active-badge">{t('activeBadge')}</span>}
      <span className="target-badge">{mod.category === 'audio' ? 'GTA V' : 'FiveM'}</span>
      {mod.videoPreview
        ? <video src={mod.videoPreview} className="mod-preview-video" autoPlay muted loop playsInline />
        : mod.category === 'audio' && mod.soundPreview
        ? <button type="button" className={`test-sound-btn ${playing ? 'playing' : ''} ${loadingSound ? 'loading' : ''}`} onClick={testSound}>{loadingSound ? t('soundLoading') : playing ? t('soundStop') : t('testSound')}</button>
        : mod.preview ? <img src={mod.preview} alt={mod.nameAr} className="mod-preview-image" /> : <span className="emoji">{mod.category === 'audio' ? '🔊' : mod.category === 'bloodfx' ? '🩸' : mod.category === 'killfx' ? '💥' : '🎨'}</span>}
    </div>
    <div className="mod-info"><h3>{mod.nameAr}</h3><p className="file-count">{mod.downloaded === false ? (mod.size ? formatSize(mod.size) : t('readyToDownload')) : `${mod.files.length} ${t('files')}`}</p><p className="description">{mod.descriptionAr}</p>
      <div className="mod-actions" ref={menuRef}>{mod.downloaded === false ? <button className="btn btn-download" onClick={() => onDownload(mod.id)} disabled={downloading}>{downloading ? `${t('downloading')} ${Math.round(progress * 100)}%` : t('download')}</button> : isActive ? <><button className="btn btn-active-label">{t('activeNow')}</button><button className="btn btn-deactivate" onClick={() => onDeactivate(mod.id)} disabled={loading}>{t('deactivate')}</button></> : <button className="btn btn-activate" onClick={() => onActivate(mod.id)} disabled={loading}>{loading ? t('activating') : t('activate')}</button>}<button className="btn btn-menu" onClick={() => setShowMenu(!showMenu)}>...</button>{showMenu && <div className="menu-dropdown"><button className={mod.favorite ? 'active' : ''} onClick={() => { onToggleFavorite(mod.id); setShowMenu(false) }}>{mod.favorite ? t('removeFavorite') : t('addFavorite')}</button><button onClick={() => { onEdit(mod); setShowMenu(false) }}>{t('edit')}</button></div>}</div>
    </div>
  </article>
}
