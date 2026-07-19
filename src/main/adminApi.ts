import { createWriteStream, existsSync, readFileSync, writeFileSync, statSync, rmSync } from 'fs'
import { join } from 'path'
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

async function uploadAsset(releaseId: number, name: string, filePath: string, contentType: string, token: string): Promise<void> {
  const body = readFileSync(filePath)
  const res = await fetch(`${UPLOADS}/releases/${releaseId}/assets?name=${encodeURIComponent(name)}`, {
    method: 'POST',
    headers: { ...authHeaders(token), 'Content-Type': contentType },
    body
  })
  if (!res.ok) throw new Error(`upload ${name} failed (${res.status})`)
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

export async function adminAddMod(input: AddModInput, token: string): Promise<{ success: boolean; error?: string }> {
  try {
    const folderName = slug(input.folderName)
    if (!folderName) return { success: false, error: 'الاسم المختصر لازم إنجليزي' }
    if (!existsSync(input.folderPath)) return { success: false, error: 'مجلد المود غير موجود' }

    const id = `${input.category}-${folderName}`
    const assetName = `${folderName}.zip`
    const tmpZip = join(app.getPath('temp'), `${id}-${Date.now()}.zip`)
    await zipFolder(input.folderPath, tmpZip)
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
    mods = mods.filter((m) => m.id !== id)
    mods.push({ id, category: input.category, folderName, nameAr: input.nameAr, descriptionAr: input.descriptionAr || '', downloadUrl, size })
    await putCatalog(release, mods, token)
    return { success: true }
  } catch (err) {
    return { success: false, error: (err as Error)?.message || 'فشل الرفع' }
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
    if (fields.preview !== undefined) m.preview = fields.preview || undefined
    if (fields.soundPreview !== undefined) m.soundPreview = fields.soundPreview || undefined
    if (fields.videoPreview !== undefined) m.videoPreview = fields.videoPreview || undefined
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
      const asset = release.assets.find((a) => a.name === `${target.folderName}.zip`)
      if (asset) await deleteAssetById(asset.id, token)
    }
    await putCatalog(release, remaining, token)
    return { success: true }
  } catch (err) {
    return { success: false, error: (err as Error)?.message || 'فشل الحذف' }
  }
}
