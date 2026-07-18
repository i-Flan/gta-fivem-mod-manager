import { useI18n } from '../i18n'
import './Header.css'

interface HeaderProps {
  gtaValid: boolean
  fivemValid: boolean
  onOpenSettings: () => void
  onRefresh: () => void
  refreshing: boolean
}

export default function Header({ fivemValid, onOpenSettings, onRefresh, refreshing }: HeaderProps): React.JSX.Element {
  const { t } = useI18n()
  return (
    <header className="header">
      <div className="logo"><div className="wordmark"><span className="wm-five">Five</span><span className="wm-y">y</span></div><span className="wm-sub">{t('headerSubtitle')}</span></div>
      <div className="header-right">
        <div className={`path-badge ${fivemValid ? 'valid' : 'invalid'}`}><span className="path-dot" />{t('fivemPath')}</div>
        <button className="action-btn" onClick={onRefresh} title={t('refresh')} disabled={refreshing}>{refreshing ? '⌛' : '↻'}</button>
        <button className="settings-btn" onClick={onOpenSettings} title={t('settings')}>⚙</button>
      </div>
    </header>
  )
}
