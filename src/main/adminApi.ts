import { createWriteStream, existsSync, readFileSync, writeFileSync, statSync, rmSync, readdirSync } from 'fs'
import { join, extname, dirname } from 'path'
import { app } from 'electron'
import archiver from 'archiver'
import { CONTENT_OWNER, CONTENT_REPO, CONTENT_TAG } from './remoteConfig'
import type { ModCategory } from '../shared/types'

const API = `https://api.github.com/repos/${CONTENT_OWNER}/${CONTENT_REPO}`
const UPLOADS = `https://uploads.github.com/repos/${CONTENT_OWNER}/${CONTENT_REPO}`

interface CatalogEntry {
  id: string
  category: ModCategory
  folderName: string
  nameAr: string
  descriptionAr?: string
  downloadUrl: string
  size?: number
  preview?: string
  soundPreview?: string
  videoPreview?: string
  booster?: boolean
}
interface Release { id: number; assets: { id: number; name: string; browser_download_url: string }[] }

// ── التوكن (مفتاح GitHub) ─────────────────────────────
// المدير أثناء التطوير: يُقرأ من github-token.txt بجوار المشروع.
// المدير في النسخة المثبّتة: يُحفظ في userData بعد إدخاله مرة واحدة.
export function getAdminToken(): string {
  try {
    const devFile = join(app.getAppPath(), 'github-token.txt')
    if (existsSync(devFile)) return readFileSync(devFile, 'utf8').trim()
  } catch {
    // ignore
  }
  try {
    const stored = join(app.getPath('userData'), 'admin-token.txt')
    if (existsSync(stored)) return readFileSync(stored, 'utf8').trim()
  } catch {
    // ignore
  }
  return ''
}

export function setAdminToken(token: string): void {
  writeFileSync(join(app.getPath('userData'), 'admin-token.txt'), (token || '').trim(), 'utf8')
}

export async function verifyToken(token: string): Promise<boolean> {
  if (!token) return false
  try {
    const res = await fetch(API, { headers: authHeaders(token) })
    return res.ok
  } catch {
    return false
  }
}

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, 'User-Agent': 'fivey-admin', Accept: 'application/vnd.github+json' }
}

async function getOrCreateRelease(token: string): Promise<Release> {
  const res = await fetch(`${API}/releases/tags/${CONTENT_TAG}`, { headers: authHeaders(token) })
  if (res.ok) return (await res.json()) as Release
  const cr = await fetch(`${API}/releases`, {
    method: 'POST',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ tag_name: CONTENT_TAG, name: 'Mods Content', prerelease: true, body: 'App mods - do not delete this release' })
  })
  if (!cr.ok) throw new Error(`failed to create content release (${cr.status})`)
  return (await cr.json()) as Release
}

async function getCatalogMods(release: Release): Promise<CatalogEntry[]> {
  const asset = release.assets.find((a) => a.name === 'catalog.json')
  if (!asset) return []
  try {
    const res = await fetch(`${asset.browser_download_url}?t=${Date.now()}`)
    if (!res.ok) return []
    const data = (await res.json()) as { mods?: CatalogEntry[] }
    return Array.isArray(data.mods) ? data.mods : []
  } catch {
    return []
  }
}

async function deleteAssetById(id: number, token: string): Promise<void> {
  await fetch(`${API}/releases/assets/${id}`, { method: 'DELETE', headers: authHeaders(token) })
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

// رفع مرفق مع إعادة المحاولة — سيرفر GitHub أحياناً يرجّع 502/503 مؤقتاً.
// قبل كل إعادة نحذف أي بقايا مرفق بنفس الاسم عشان ما يتعارض.
async function uploadAsset(releaseId: number, name: string, filePath: string, contentType: string, token: string): Promise<void> {
  const body = readFileSync(filePath)
  const attempts = 4
  let lastStatus = 0

  for (let i = 0; i < attempts; i++) {
    if (i > 0) {
      await sleep(1500 * i)
      try {
        const rel = await getReleaseById(releaseId, token)
        const stale = rel?.assets.find((a) => a.name === name)
        if (stale) await deleteAssetById(stale.id, token)
      } catch {
        // نكمّل المحاولة حتى لو فشل التنظيف
      }
    }
    try {
      const res = await fetch(`${UPLOADS}/releases/${releaseId}/assets?name=${encodeURIComponent(name)}`, {
        method: 'POST',
        headers: { ...authHeaders(token), 'Content-Type': contentType, 'Content-Length': String(body.length) },
        body
      })
      if (res.ok) return
      lastStatus = res.status
      // أخطاء المستخدم (٤xx عدا 429) ما تنفع معها إعادة المحاولة
      if (res.status < 500 && res.status !== 429) break
    } catch {
      lastStatus = 0 // انقطاع شبكة — نعيد المحاولة
    }
  }
  throw new Error(`upload ${name} failed (${lastStatus || 'network'}) بعد ${attempts} محاولات`)
}

async function getReleaseById(id: number, token: string): Promise<Release | null> {
  try {
    const res = await fetch(`${API}/releases/${id}`, { headers: authHeaders(token) })
    if (!res.ok) return null
    return (await res.json()) as Release
  } catch {
    return null
  }
}

async function putCatalog(release: Release, mods: CatalogEntry[], token: string): Promise<void> {
  const old = release.assets.find((a) => a.name === 'catalog.json')
  if (old) await deleteAssetById(old.id, token)
  const tmp = join(app.getPath('temp'), `catalog-${Date.now()}.json`)
  writeFileSync(tmp, JSON.stringify({ version: 1, mods }), 'utf8')
  await uploadAsset(release.id, 'catalog.json', tmp, 'application/json', token)
  try {
    rmSync(tmp, { force: true })
  } catch {
    // ignore
  }
}

// حماية من خطأ شائع: المدير يختار مجلد "citizen" نفسه بدل المجلد الذي يحتويه.
// وقتها تضيع بادئة citizen/ من مسارات الملفات فتُركَّب في مكان خاطئ.
// نكتشفها ونضغط من المجلد الأب مع الإبقاء على citizen/ في المسارات.
function normalizeModFolder(folderPath: string): string {
  const clean = folderPath.replace(/[\\/]+$/, '')
  const leaf = clean.split(/[\\/]/).pop() || ''
  if (leaf.toLowerCase() !== 'citizen') return clean
  const parent = dirname(clean)
  // نضغط الأب فقط لو ما فيه إلا مجلد citizen، حتى لا نضيف ملفات غريبة
  try {
    const siblings = readdirSync(parent).filter((n) => !n.startsWith('.'))
    if (siblings.length === 1) return parent
  } catch {
    // ignore
  }
  return clean
}

function zipFolder(srcDir: string, outZip: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const output = createWriteStream(outZip)
    const archive = archiver('zip', { zlib: { level: 6 } })
    output.on('close', () => resolve())
    archive.on('error', reject)
    archive.pipe(output)
    archive.directory(srcDir, false)
    archive.finalize()
  })
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export interface AddModInput {
  folderPath: string
  category: ModCategory
  folderName: string
  nameAr: string
  descriptionAr?: string
}

export async function adminAddMod(input: AddModInput, token: string): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const folderName = slug(input.folderName)
    if (!folderName) return { success: false, error: 'الاسم المختصر لازم إنجليزي' }
    if (!existsSync(input.folderPath)) return { success: false, error: 'مجلد المود غير موجود' }

    const id = `${input.category}-${folderName}`
    const assetName = `${folderName}.zip`
    const tmpZip = join(app.getPath('temp'), `${id}-${Date.now()}.zip`)
    await zipFolder(normalizeModFolder(input.folderPath), tmpZip)
    const size = statSync(tmpZip).size

    let release = await getOrCreateRelease(token)
    const existing = release.assets.find((a) => a.name === assetName)
    if (existing) await deleteAssetById(existing.id, token)
    await uploadAsset(release.id, assetName, tmpZip, 'application/zip', token)
    try {
      rmSync(tmpZip, { force: true })
    } catch {
      // ignore
    }

    const downloadUrl = `https://github.com/${CONTENT_OWNER}/${CONTENT_REPO}/releases/download/${CONTENT_TAG}/${assetName}`
    release = await getOrCreateRelease(token)
    let mods = await getCatalogMods(release)
    // عند إعادة رفع مود موجود نحافظ على الصورة والصوت والفيديو،
    // وإلا انمسحت معاينته في كل مرة يُحدَّث فيها الملف.
    const previous = mods.find((m) => m.id === id)
    mods = mods.filter((m) => m.id !== id)
    mods.push({
      id,
      category: input.category,
      folderName,
      nameAr: input.nameAr,
      descriptionAr: input.descriptionAr || previous?.descriptionAr || '',
      downloadUrl,
      size,
      preview: previous?.preview,
      soundPreview: previous?.soundPreview,
      videoPreview: previous?.videoPreview
    })
    await putCatalog(release, mods, token)
    return { success: true, id }
  } catch (err) {
    return { success: false, error: (err as Error)?.message || 'فشل الرفع' }
  }
}

// أنواع ملفات الصوت المدعومة لمعاينة الصوت
const AUDIO_MIME: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac'
}

// يرفع مقطع صوت من جهاز المدير كمرفق، ويضبطه كصوت معاينة للمود
export async function adminUploadSound(
  id: string,
  filePath: string,
  token: string
): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    if (!existsSync(filePath)) return { success: false, error: 'ملف الصوت غير موجود' }
    const ext = extname(filePath).toLowerCase()
    const mime = AUDIO_MIME[ext]
    if (!mime) return { success: false, error: 'صيغة الصوت غير مدعومة (mp3, wav, ogg, m4a, aac)' }

    let release = await getOrCreateRelease(token)
    const mods = await getCatalogMods(release)
    const m = mods.find((x) => x.id === id)
    if (!m) return { success: false, error: 'المود غير موجود' }

    const assetName = `${m.folderName}-preview${ext}`
    const old = release.assets.find((a) => a.name === assetName)
    if (old) await deleteAssetById(old.id, token)

    await uploadAsset(release.id, assetName, filePath, mime, token)

    const url = `https://github.com/${CONTENT_OWNER}/${CONTENT_REPO}/releases/download/${CONTENT_TAG}/${assetName}`
    release = await getOrCreateRelease(token)
    const fresh = await getCatalogMods(release)
    const target = fresh.find((x) => x.id === id)
    if (target) target.soundPreview = url
    await putCatalog(release, fresh, token)
    return { success: true, url }
  } catch (err) {
    return { success: false, error: (err as Error)?.message || 'فشل رفع الصوت' }
  }
}

// أنواع الصور/الفيديو المدعومة لمعاينة الجرافكس/البلود/الكيل
const IMAGE_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif'
}
const VIDEO_MIME: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime'
}

// يرفع صورة أو فيديو معاينة من جهاز المدير، ويضبطه في الحقل المناسب
export async function adminUploadMedia(
  id: string,
  filePath: string,
  token: string
): Promise<{ success: boolean; url?: string; kind?: 'image' | 'video'; error?: string }> {
  try {
    if (!existsSync(filePath)) return { success: false, error: 'الملف غير موجود' }
    const ext = extname(filePath).toLowerCase()
    const isImage = !!IMAGE_MIME[ext]
    const isVideo = !!VIDEO_MIME[ext]
    if (!isImage && !isVideo) {
      return { success: false, error: 'صيغة غير مدعومة (صورة: png/jpg/webp/gif — فيديو: mp4/webm/mov)' }
    }
    const mime = isImage ? IMAGE_MIME[ext] : VIDEO_MIME[ext]

    let release = await getOrCreateRelease(token)
    const mods = await getCatalogMods(release)
    const m = mods.find((x) => x.id === id)
    if (!m) return { success: false, error: 'المود غير موجود' }

    const assetName = `${m.folderName}-${isImage ? 'cover' : 'video'}${ext}`
    const old = release.assets.find((a) => a.name === assetName)
    if (old) await deleteAssetById(old.id, token)

    await uploadAsset(release.id, assetName, filePath, mime, token)

    const url = `https://github.com/${CONTENT_OWNER}/${CONTENT_REPO}/releases/download/${CONTENT_TAG}/${assetName}`
    release = await getOrCreateRelease(token)
    const fresh = await getCatalogMods(release)
    const target = fresh.find((x) => x.id === id)
    if (target) {
      if (isImage) target.preview = url
      else target.videoPreview = url
    }
    await putCatalog(release, fresh, token)
    return { success: true, url, kind: isImage ? 'image' : 'video' }
  } catch (err) {
    return { success: false, error: (err as Error)?.message || 'فشل رفع الملف' }
  }
}

// روابط ديسكورد (cdn/media) تنتهي صلاحيتها خلال ساعات — نعيد استضافتها على
// GitHub لتصير دائمة. يرجّع الرابط الجديد، أو الأصلي لو فشل التحميل.
async function rehostIfExpiring(url: string, folderName: string, token: string): Promise<string> {
  if (!/(cdn|media)\.discordapp\.(com|net)/i.test(url)) return url
  try {
    const res = await fetch(url)
    if (!res.ok) return url
    const buf = Buffer.from(await res.arrayBuffer())
    const ct = res.headers.get('content-type') || 'image/png'
    const ext = ct.includes('jpeg') ? '.jpg' : ct.includes('gif') ? '.gif' : ct.includes('webp') ? '.webp' : '.png'
    const assetName = `${folderName}-cover${ext}`
    const tmp = join(app.getPath('temp'), `${assetName}-${Date.now()}`)
    writeFileSync(tmp, buf)
    const release = await getOrCreateRelease(token)
    const old = release.assets.find((a) => a.name === assetName)
    if (old) await deleteAssetById(old.id, token)
    await uploadAsset(release.id, assetName, tmp, ct, token)
    try {
      rmSync(tmp, { force: true })
    } catch {
      // ignore
    }
    return `https://github.com/${CONTENT_OWNER}/${CONTENT_REPO}/releases/download/${CONTENT_TAG}/${assetName}`
  } catch {
    return url
  }
}

export async function adminEditMod(id: string, fields: Partial<CatalogEntry>, token: string): Promise<{ success: boolean; error?: string }> {
  try {
    const release = await getOrCreateRelease(token)
    const mods = await getCatalogMods(release)
    const m = mods.find((x) => x.id === id)
    if (!m) return { success: false, error: 'المود غير موجود' }
    if (fields.nameAr !== undefined) m.nameAr = fields.nameAr
    if (fields.descriptionAr !== undefined) m.descriptionAr = fields.descriptionAr
    if (fields.preview !== undefined) {
      m.preview = fields.preview ? await rehostIfExpiring(fields.preview, m.folderName, token) : undefined
    }
    if (fields.soundPreview !== undefined) m.soundPreview = fields.soundPreview || undefined
    if (fields.videoPreview !== undefined) m.videoPreview = fields.videoPreview || undefined
    await putCatalog(release, mods, token)
    return { success: true }
  } catch (err) {
    return { success: false, error: (err as Error)?.message || 'فشل التعديل' }
  }
}

// يعلّم/يلغي مود كحصري للبوسترز في القائمة المركزية
export async function adminSetBooster(id: string, value: boolean, token: string): Promise<{ success: boolean; error?: string }> {
  try {
    const release = await getOrCreateRelease(token)
    const mods = await getCatalogMods(release)
    const m = mods.find((x) => x.id === id)
    if (!m) return { success: false, error: 'المود غير موجود' }
    m.booster = value || undefined
    await putCatalog(release, mods, token)
    return { success: true }
  } catch (err) {
    return { success: false, error: (err as Error)?.message || 'فشل التعديل' }
  }
}

export async function adminDeleteMod(id: string, token: string): Promise<{ success: boolean; error?: string }> {
  try {
    const release = await getOrCreateRelease(token)
    const mods = await getCatalogMods(release)
    const target = mods.find((x) => x.id === id)
    const remaining = mods.filter((x) => x.id !== id)
    if (target) {
      // نحذف ملف المود ومعه مرفقات المعاينة (صورة/فيديو/صوت) حتى لا تتراكم
      const prefix = `${target.folderName}-`
      for (const asset of release.assets) {
        const isMod = asset.name === `${target.folderName}.zip`
        const isPreview =
          asset.name.startsWith(`${prefix}cover.`) ||
          asset.name.startsWith(`${prefix}video.`) ||
          asset.name.startsWith(`${prefix}preview.`)
        if (isMod || isPreview) await deleteAssetById(asset.id, token)
      }
    }
    await putCatalog(release, remaining, token)
    return { success: true }
  } catch (err) {
    return { success: false, error: (err as Error)?.message || 'فشل الحذف' }
  }
}
