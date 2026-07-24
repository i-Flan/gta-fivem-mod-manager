import { useEffect, useState } from 'react'
import type { ModManifest, ModCategory } from '../../../../shared/types'
import './AdminPanel.css'

const CATS: { key: ModCategory; name: string }[] = [
  { key: 'graphics', name: 'Graphics' },
  { key: 'audio', name: 'Sound' },
  { key: 'bloodfx', name: 'BloodFX' },
  { key: 'killfx', name: 'KillFX' }
]

// أمثلة عامة (بدون أسماء أشخاص) تتغيّر حسب التصنيف المختار
const SLUG_HINT: Record<ModCategory, string> = {
  graphics: 'graphics-01',
  audio: 'sound-01',
  bloodfx: 'blood-01',
  killfx: 'kill-01'
}
const NAME_HINT: Record<ModCategory, string> = {
  graphics: 'جرافكس ...',
  audio: 'ساوند ...',
  bloodfx: 'بلود ...',
  killfx: 'كيل افكس ...'
}

interface Props {
  onClose: () => void
  onReload: () => void
  onAdminChange: (v: boolean) => void
}

export default function AdminPanel({ onClose, onReload, onAdminChange }: Props): React.JSX.Element {
  const [isAdmin, setIsAdmin] = useState(false)
  const [checking, setChecking] = useState(true)
  const [tokenInput, setTokenInput] = useState('')
  const [list, setList] = useState<ModManifest[]>([])
  const [cat, setCat] = useState<ModCategory>('graphics')
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [mode, setMode] = useState<'list' | 'add' | 'edit' | 'hooks'>('list')
  const [published, setPublished] = useState<Set<string>>(new Set())
  const [hooks, setHooks] = useState<Record<string, string>>({})

  const [aFolder, setAFolder] = useState('')
  const [aCat, setACat] = useState<ModCategory>('graphics')
  const [aSlug, setASlug] = useState('')
  const [aName, setAName] = useState('')
  const [aDesc, setADesc] = useState('')
  const [aSound, setASound] = useState('')
  const [aMedia, setAMedia] = useState('') // صورة/فيديو للجرافكس والبلود والكيل

  const [eId, setEId] = useState('')
  const [eName, setEName] = useState('')
  const [eDesc, setEDesc] = useState('')
  const [ePreview, setEPreview] = useState('')
  const [eSound, setESound] = useState('')
  const [eVideo, setEVideo] = useState('')

  const reload = async (): Promise<void> => {
    // المودات الخاصة بالبوستر محلية فقط ومو في القائمة المركزية،
    // فلا تُعرض هنا (تعديلها/حذفها/نشرها عبر GitHub يفشل).
    setList((await window.api.refreshMods()).filter((m) => !m.personal))
    onReload()
  }

  useEffect(() => {
    ;(async () => {
      const st = await window.api.adminStatus()
      setIsAdmin(st.isAdmin)
      onAdminChange(st.isAdmin)
      if (st.isAdmin) await reload()
      setChecking(false)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const saveToken = async (): Promise<void> => {
    setBusy(true)
    setMsg('')
    const r = await window.api.adminSetToken(tokenInput.trim())
    setBusy(false)
    if (r.success) {
      setIsAdmin(true)
      onAdminChange(true)
      await reload()
    } else setMsg('المفتاح غير صحيح أو ما عنده صلاحية على المستودع')
  }

  const pickFolder = async (): Promise<void> => {
    const p = await window.api.adminPickFolder()
    if (p) setAFolder(p)
  }

  const submitAdd = async (): Promise<void> => {
    if (!aFolder || !aSlug || !aName) {
      setMsg('عبّي المجلد والاسم المختصر والاسم العربي')
      return
    }
    setBusy(true)
    setMsg('جارٍ الضغط والرفع... (قد يأخذ وقت حسب الحجم)')
    const r = await window.api.adminAddMod({ folderPath: aFolder, category: aCat, folderName: aSlug, nameAr: aName, descriptionAr: aDesc })
    if (r.success && r.id) {
      if (aCat === 'audio' && aSound) {
        setMsg('جارٍ رفع مقطع الصوت...')
        await window.api.adminUploadSound(r.id, aSound)
      } else if (aCat !== 'audio' && aMedia) {
        setMsg('جارٍ رفع المعاينة...')
        await window.api.adminUploadMedia(r.id, aMedia)
      }
    }
    setBusy(false)
    if (r.success) {
      setMode('list')
      setAFolder('')
      setASlug('')
      setAName('')
      setADesc('')
      setASound('')
      setAMedia('')
      setMsg('')
      await reload()
    } else setMsg(r.error || 'فشل الرفع')
  }

  const openEdit = (m: ModManifest): void => {
    setEId(m.id)
    setEName(m.nameAr)
    setEDesc(m.descriptionAr || '')
    setEPreview(m.preview || '')
    setESound(m.soundPreview || '')
    setEVideo(m.videoPreview || '')
    setMsg('')
    setMode('edit')
  }

  const submitEdit = async (): Promise<void> => {
    setBusy(true)
    setMsg('جارٍ الحفظ...')
    const r = await window.api.adminEditMod(eId, { nameAr: eName, descriptionAr: eDesc, preview: ePreview, soundPreview: eSound, videoPreview: eVideo })
    setBusy(false)
    if (r.success) {
      setMode('list')
      setMsg('')
      await reload()
    } else setMsg(r.error || 'فشل التعديل')
  }

  // رفع مقطع صوت من الجهاز للمود المفتوح في وضع التعديل
  const pickAndUploadSound = async (): Promise<void> => {
    const p = await window.api.adminPickAudio()
    if (!p) return
    setBusy(true)
    setMsg('جارٍ رفع مقطع الصوت...')
    const r = await window.api.adminUploadSound(eId, p)
    setBusy(false)
    if (r.success && r.url) {
      setESound(r.url)
      setMsg('')
      await reload()
    } else setMsg(r.error || 'فشل رفع الصوت')
  }

  // رفع صورة/فيديو من الجهاز للمود المفتوح في وضع التعديل
  const pickAndUploadMedia = async (): Promise<void> => {
    const p = await window.api.adminPickMedia()
    if (!p) return
    setBusy(true)
    setMsg('جارٍ رفع المعاينة...')
    const r = await window.api.adminUploadMedia(eId, p)
    setBusy(false)
    if (r.success && r.url) {
      if (r.kind === 'video') setEVideo(r.url)
      else setEPreview(r.url)
      setMsg('')
      await reload()
    } else setMsg(r.error || 'فشل الرفع')
  }

  const openHooks = async (): Promise<void> => {
    setMsg('')
    setHooks((await window.api.adminGetWebhooks()) || {})
    setMode('hooks')
  }

  const saveHooks = async (): Promise<void> => {
    setBusy(true)
    setMsg('جارٍ الحفظ...')
    const r = await window.api.adminSetWebhooks(hooks)
    setBusy(false)
    if (r.success) {
      setMode('list')
      setMsg('')
    } else setMsg(r.error || 'فشل حفظ الروابط')
  }

  const publish = async (m: ModManifest): Promise<void> => {
    setBusy(true)
    setMsg('جارٍ نشر الإعلان...')
    const r = await window.api.adminPublishMod({
      id: m.id,
      category: m.category,
      nameAr: m.nameAr,
      descriptionAr: m.descriptionAr,
      preview: m.preview
    })
    setBusy(false)
    if (r.success) {
      setPublished((p) => new Set(p).add(m.id))
      setMsg('')
    } else setMsg(r.error || 'فشل النشر')
  }

  const toggleBooster = async (m: ModManifest): Promise<void> => {
    setBusy(true)
    setMsg(m.booster ? 'جارٍ إلغاء البوستر...' : 'جارٍ التعليم كبوستر...')
    const r = await window.api.adminSetBooster(m.id, !m.booster)
    setBusy(false)
    if (r.success) {
      setMsg('')
      await reload()
    } else setMsg(r.error || 'فشل التعديل')
  }

  const del = async (m: ModManifest): Promise<void> => {
    if (!window.confirm(`حذف "${m.nameAr}" نهائياً من عند الجميع؟`)) return
    setBusy(true)
    setMsg('جارٍ الحذف...')
    const r = await window.api.adminDeleteMod(m.id)
    setBusy(false)
    if (r.success) {
      setMsg('')
      await reload()
    } else setMsg(r.error || 'فشل الحذف')
  }

  const filtered = list
    .filter((m) => m.category === cat && (m.nameAr.includes(q) || (m.folderName || '').toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => Number(!!b.booster) - Number(!!a.booster)) // مودات البوستر فوق

  return (
    <div className="admin-overlay" dir="rtl" onClick={onClose}>
      <div className="admin-panel" onClick={(e) => e.stopPropagation()}>
        <div className="admin-header">
          <h2>🛠️ لوحة الإدارة</h2>
          <button className="admin-close" onClick={onClose}>×</button>
        </div>

        {busy && <div className="admin-busy"><span className="admin-spin" />{msg || 'جارٍ...'}</div>}

        {checking ? (
          <div className="admin-body admin-center">جارٍ التحقق...</div>
        ) : !isAdmin ? (
          <div className="admin-body">
            <p className="admin-hint">أدخل مفتاح GitHub (Personal Access Token بصلاحية repo) لتفعيل وضع المدير. يُحفظ على جهازك فقط.</p>
            <input className="admin-input" type="password" placeholder="ghp_..." value={tokenInput} onChange={(e) => setTokenInput(e.target.value)} dir="ltr" />
            {msg && <p className="admin-msg">{msg}</p>}
            <button className="admin-btn primary" disabled={busy} onClick={saveToken}>تفعيل وضع المدير</button>
          </div>
        ) : mode === 'add' ? (
          <div className="admin-body">
            <label className="admin-label">مجلد المود</label>
            <div className="admin-row">
              <input className="admin-input" value={aFolder} readOnly placeholder="اختر مجلد المود" dir="ltr" />
              <button className="admin-btn" onClick={pickFolder}>استعراض</button>
            </div>
            {aCat === 'graphics' && (
              <p className="admin-hint">
                ⚠️ اختر المجلد اللي <b>يحتوي</b> على <code>citizen</code> — مو مجلد <code>citizen</code> نفسه.
              </p>
            )}
            <label className="admin-label">التصنيف</label>
            <select className="admin-input" value={aCat} onChange={(e) => setACat(e.target.value as ModCategory)}>
              {CATS.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}
            </select>
            <label className="admin-label">اسم مختصر إنجليزي (slug)</label>
            <input className="admin-input" value={aSlug} onChange={(e) => setASlug(e.target.value)} placeholder={SLUG_HINT[aCat]} dir="ltr" />
            <label className="admin-label">الاسم بالعربي</label>
            <input className="admin-input" value={aName} onChange={(e) => setAName(e.target.value)} placeholder={NAME_HINT[aCat]} />
            <label className="admin-label">الوصف (اختياري)</label>
            <input className="admin-input" value={aDesc} onChange={(e) => setADesc(e.target.value)} />
            {aCat === 'audio' ? (
              <>
                <label className="admin-label">مقطع صوت المعاينة (اختياري)</label>
                <div className="admin-row">
                  <input className="admin-input" value={aSound} readOnly dir="ltr" placeholder="اختر ملف صوت من جهازك" />
                  <button className="admin-btn" onClick={async () => { const p = await window.api.adminPickAudio(); if (p) setASound(p) }}>🎵 اختر</button>
                </div>
              </>
            ) : (
              <>
                <label className="admin-label">صورة أو فيديو المعاينة (اختياري)</label>
                <div className="admin-row">
                  <input className="admin-input" value={aMedia} readOnly dir="ltr" placeholder="اختر صورة أو فيديو من جهازك" />
                  <button className="admin-btn" onClick={async () => { const p = await window.api.adminPickMedia(); if (p) setAMedia(p) }}>🖼️ اختر</button>
                </div>
              </>
            )}
            {msg && <p className="admin-msg">{msg}</p>}
            <div className="admin-row admin-actions">
              <button className="admin-btn" onClick={() => { setMode('list'); setMsg('') }}>رجوع</button>
              <button className="admin-btn primary" disabled={busy} onClick={submitAdd}>رفع المود</button>
            </div>
          </div>
        ) : mode === 'hooks' ? (
          <div className="admin-body">
            <p className="admin-hint">
              روابط النشر لكل تصنيف (Discord Webhook). تُحفظ على جهازك فقط، ولازمة عشان يشتغل زر «نشر».
              <br />
              تطلعها من ديسكورد: إعدادات السيرفر ← Integrations ← Webhooks ← New Webhook ← Copy Webhook URL
            </p>
            {CATS.map((c) => (
              <div key={c.key}>
                <label className="admin-label">{c.name}</label>
                <input
                  className="admin-input"
                  dir="ltr"
                  placeholder="https://discord.com/api/webhooks/..."
                  value={hooks[c.key] || ''}
                  onChange={(e) => setHooks({ ...hooks, [c.key]: e.target.value })}
                />
              </div>
            ))}
            {msg && <p className="admin-msg">{msg}</p>}
            <div className="admin-row admin-actions">
              <button className="admin-btn" onClick={() => { setMode('list'); setMsg('') }}>رجوع</button>
              <button className="admin-btn primary" disabled={busy} onClick={saveHooks}>حفظ الروابط</button>
            </div>
          </div>
        ) : mode === 'edit' ? (
          <div className="admin-body">
            <label className="admin-label">الاسم بالعربي</label>
            <input className="admin-input" value={eName} onChange={(e) => setEName(e.target.value)} />
            <label className="admin-label">الوصف</label>
            <input className="admin-input" value={eDesc} onChange={(e) => setEDesc(e.target.value)} />
            <label className="admin-label">صورة الغلاف (اختياري)</label>
            <div className="admin-row">
              <input className="admin-input" value={ePreview} onChange={(e) => setEPreview(e.target.value)} dir="ltr" placeholder="https://... أو ارفع من جهازك" />
              <button className="admin-btn" disabled={busy} onClick={pickAndUploadMedia}>🖼️ رفع صورة/فيديو</button>
            </div>
            <label className="admin-label">مقطع صوت المعاينة (اختياري)</label>
            <div className="admin-row">
              <input className="admin-input" value={eSound} onChange={(e) => setESound(e.target.value)} dir="ltr" placeholder="https://... أو ارفع من جهازك" />
              <button className="admin-btn" disabled={busy} onClick={pickAndUploadSound}>🎵 رفع من جهازي</button>
            </div>
            <label className="admin-label">رابط فيديو معاينة (اختياري)</label>
            <input className="admin-input" value={eVideo} onChange={(e) => setEVideo(e.target.value)} dir="ltr" placeholder="https://..." />
            {msg && <p className="admin-msg">{msg}</p>}
            <div className="admin-row admin-actions">
              <button className="admin-btn" onClick={() => { setMode('list'); setMsg('') }}>رجوع</button>
              <button className="admin-btn primary" disabled={busy} onClick={submitEdit}>حفظ التعديلات</button>
            </div>
          </div>
        ) : (
          <div className="admin-body">
            <div className="admin-toolbar">
              <div className="admin-cats">
                {CATS.map((c) => (
                  <button key={c.key} className={cat === c.key ? 'active' : ''} onClick={() => setCat(c.key)}>
                    {c.name}<span>{list.filter((m) => m.category === c.key).length}</span>
                  </button>
                ))}
              </div>
              <input className="admin-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 بحث..." />
              <button className="admin-btn" onClick={openHooks} title="روابط النشر (Webhooks)">🔗</button>
              <button className="admin-btn primary" onClick={() => { setACat(cat); setMode('add'); setMsg('') }}>+ إضافة</button>
            </div>
            {msg && <p className="admin-msg">{msg}</p>}
            <div className="admin-list">
              {filtered.length ? filtered.map((m) => (
                <div className="admin-item" key={m.id}>
                  <div className="admin-item-info">
                    <span className="admin-item-name">{m.nameAr}</span>
                    <span className="admin-item-slug">{m.folderName}</span>
                  </div>
                  <div className="admin-item-actions">
                    <button className={`admin-btn small booster ${m.booster ? 'on' : ''}`} onClick={() => toggleBooster(m)} title="حصري للبوسترز">
                      {m.booster ? '💎 بوستر ✓' : '💎 Booster'}
                    </button>
                    <button className={`admin-btn small ${published.has(m.id) ? 'done' : 'publish'}`} onClick={() => publish(m)}>
                      {published.has(m.id) ? '✓ تم النشر' : '📢 نشر'}
                    </button>
                    <button className="admin-btn small" onClick={() => openEdit(m)}>✏️ تعديل</button>
                    <button className="admin-btn small danger" onClick={() => del(m)}>🗑️ حذف</button>
                  </div>
                </div>
              )) : <p className="admin-empty">ما فيه مودات في هذا التصنيف</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
