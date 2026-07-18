import { useState } from 'react'
import type { AppSettings } from '../../../../shared/types'
import { useI18n } from '../i18n'
import './SettingsPanel.css'

interface SettingsPanelProps { settings: AppSettings; onSave: (settings: AppSettings) => void; onClose: () => void }

export default function SettingsPanel({ settings, onSave, onClose }: SettingsPanelProps): React.JSX.Element {
  const { t, dir, lang } = useI18n()
  const [fivemPath, setFivemPath] = useState(settings.fivemPath)
  const [backupEnabled, setBackupEnabled] = useState(settings.backupEnabled)
  const handleBrowse = async (): Promise<void> => { const path = await window.api.browseFolder('fivem'); if (path) setFivemPath(path) }
  const changeLang = (language: 'ar' | 'en'): void => { onSave({ ...settings, fivemPath, backupEnabled, language }) }
  const handleSave = (): void => { onSave({ ...settings, fivemPath, backupEnabled, language: lang }); onClose() }
  return <div className="settings-overlay" onClick={onClose} dir={dir}><div className="settings-panel" onClick={(e) => e.stopPropagation()}>
    <div className="settings-header"><h2>⚙ {t('settingsTitle')}</h2><button className="close-btn" onClick={onClose}>×</button></div>
    <div className="settings-body">
      <div className="dev-credit">
        <span className="dev-label">DEVELOPED BY</span>
        <a className="dev-link" href="https://guns.lol/le_o" target="_blank" rel="noreferrer">Tik&nbsp;·&nbsp;@le_o<span className="dev-arrow">↗</span></a>
      </div>
      <div className="setting-group"><label>{t('language')}</label><div className="lang-switch" data-active={lang} dir="ltr"><span className="lang-thumb" /><button className={lang === 'ar' ? 'active' : ''} onClick={() => changeLang('ar')}>العربية</button><button className={lang === 'en' ? 'active' : ''} onClick={() => changeLang('en')}>English</button></div></div>
      <div className="setting-group"><label>{t('fivemPath')}</label><div className="path-input-row"><input className="path-input" value={fivemPath} onChange={(e) => setFivemPath(e.target.value)} placeholder="C:\\Users\\...\\FiveM\\FiveM.app" dir="ltr" /><button className="browse-btn" onClick={handleBrowse}>{t('browse')}</button></div></div>
      <div className="setting-group"><div className="toggle-row"><label>{t('backupLabel')}</label><button className={`toggle ${backupEnabled ? 'on' : ''}`} onClick={() => setBackupEnabled(!backupEnabled)} /></div></div>
      <button className="save-btn" onClick={handleSave}>{t('saveSettings')}</button>
    </div></div></div>
}
