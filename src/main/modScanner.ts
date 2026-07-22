import { existsSync, readdirSync, readFileSync, mkdirSync, writeFileSync } from 'fs'
import { join, relative, sep } from 'path'
import type { ModCategory, ModFile, ModManifest } from '../shared/types'

interface ModInfo { name?: string; nameAr?: string; description?: string; descriptionAr?: string }
const CATEGORIES: ModCategory[] = ['graphics', 'audio', 'bloodfx', 'killfx']
const SKIP = new Set(['manifest.json', 'info.json', '.gitkeep', 'readme.txt', 'README.txt', 'README.md'])
const COLORS: Record<ModCategory, string> = { graphics: '#1e3a5f', audio: '#3e245b', bloodfx: '#7c2437', killfx: '#54317b' }

function slugify(value: string): string { return value.toLowerCase().replace(/[^\w\u0600-\u06FF]+/g, '-').replace(/^-|-$/g, '') }
function json<T>(path: string): T | null { try { return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) as T : null } catch { return null } }
function files(dir: string, base: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true }).flatMap((item) => {
    if (item.name.startsWith('.')) return []
    const path = join(dir, item.name)
    if (item.isDirectory()) return files(path, base)
    return item.isFile() && !SKIP.has(item.name) ? [relative(base, path).split(sep).join('/')] : []
  })
}
function getDestination(category: ModCategory, source: string): string {
  const name = source.split('/').pop() || source
  if (category === 'audio') return `audio/${source}`
  // KillFX = ملفات timecycle تروح لمجلد timecycle داخل FiveM
  if (category === 'killfx') return `fivem/citizen/common/data/timecycle/${name}`
  if (category === 'bloodfx') return source.toLowerCase().endsWith('.dat') ? `fivem-effects/${name}` : `fivem-mods/${name}`
  if (source.toLowerCase().startsWith('citizen/')) return `fivem/${source}`
  if (name.toLowerCase() === 'reshade.ini') return 'fivem/ReShade.ini'
  return `fivem/citizen/common/data/${name}`
}
function target(category: ModCategory): 'fivem' | 'gta' | 'both' { return category === 'audio' ? 'gta' : category === 'graphics' ? 'fivem' : 'both' }
function scan(category: ModCategory, parent: string, folder: string): ModManifest | null {
  const path = join(parent, folder); const actualFiles = files(path, path)
  const manifest = json<ModManifest>(join(path, 'manifest.json'))
  const list = category === 'audio' || !manifest ? actualFiles : manifest.files.map((file) => file.source)
  if (!list.length) return null
  const info = json<ModInfo>(join(path, 'info.json')); const name = folder.replace(/[-_]/g, ' ')
  return { id: slugify(`${category}-${folder}`), name: info?.name || manifest?.name || name, nameAr: info?.nameAr || manifest?.nameAr || name, description: info?.description || manifest?.description || `${list.length} files`, descriptionAr: info?.descriptionAr || manifest?.descriptionAr || `${list.length} ملف جاهز للتفعيل`, category, target: target(category), files: list.map((source): ModFile => ({ source, destination: getDestination(category, source) })), color: COLORS[category] }
}
function scanLooseAudio(parent: string): ModManifest | null {
  const list = readdirSync(parent, { withFileTypes: true }).filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.rpf')).map((entry): ModFile => ({ source: entry.name, destination: getDestination('audio', entry.name) }))
  return list.length ? { id: 'audio-direct-files', name: 'Direct weapon sounds', nameAr: 'أصوات الأسلحة المضافة', description: `${list.length} weapon sound files`, descriptionAr: `حزمة تحتوي على ${list.length} ملف صوت`, category: 'audio', target: 'gta', files: list, color: COLORS.audio } : null
}
export function scanAllMods(modsDir: string): ModManifest[] {
  return CATEGORIES.flatMap((category) => { const parent = join(modsDir, category); if (!existsSync(parent)) return []; const modFolders = readdirSync(parent, { withFileTypes: true }).filter((entry) => entry.isDirectory() && !entry.name.startsWith('.')).map((entry) => scan(category, parent, entry.name)).filter((mod): mod is ModManifest => mod !== null); const loose = category === 'audio' ? scanLooseAudio(parent) : null; return loose ? [loose, ...modFolders] : modFolders })
}
export function findModFolder(modsDir: string, modId: string): { category: string; folderPath: string } | null {
  for (const category of CATEGORIES) { const parent = join(modsDir, category); if (!existsSync(parent)) continue; if (category === 'audio' && modId === 'audio-direct-files' && scanLooseAudio(parent)) return { category, folderPath: parent }; for (const entry of readdirSync(parent, { withFileTypes: true })) if (entry.isDirectory() && scan(category, parent, entry.name)?.id === modId) return { category, folderPath: join(parent, entry.name) } }
  return null
}
export function ensureModsStructure(modsDir: string): void { for (const category of CATEGORIES) { const path = join(modsDir, category); if (!existsSync(path)) mkdirSync(path, { recursive: true }) }; const readme = join(modsDir, 'اقرأني.txt'); if (!existsSync(readme)) writeFileSync(readme, 'ضع كل حزمة داخل مجلد باسمها.\n', 'utf8') }
export function countFiles(mod: ModManifest): number { return mod.files.length }

function normalize(value: string): string {
  return value.trim().toLowerCase()
}

export function getModFolderName(mod: ModManifest): string {
  const prefix = `${mod.category}-`
  if (mod.id.startsWith(prefix)) return mod.id.slice(prefix.length)
  return mod.id
}

export function findModByQuery(mods: ModManifest[], query: string): ModManifest | undefined {
  const q = normalize(query)
  if (!q) return undefined

  const exact = mods.find(
    (mod) =>
      normalize(mod.id) === q ||
      normalize(getModFolderName(mod)) === q ||
      normalize(mod.name) === q ||
      normalize(mod.nameAr) === q ||
      slugify(mod.name) === q ||
      slugify(mod.nameAr) === q
  )
  if (exact) return exact

  const partial = mods.filter(
    (mod) =>
      normalize(mod.id).includes(q) ||
      normalize(getModFolderName(mod)).includes(q) ||
      normalize(mod.name).includes(q) ||
      normalize(mod.nameAr).includes(q)
  )

  if (partial.length === 1) return partial[0]
  return undefined
}
