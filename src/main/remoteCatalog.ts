import { catalogUrl } from './remoteConfig'
import type { RemoteMod } from '../shared/types'

// يجلب قائمة المودات المركزية من GitHub. إن فشل الاتصال (أوفلاين مثلاً)
// يُرجع قائمة فارغة، والبرنامج يكمل بالمودات المحمّلة محلياً فقط.
export async function fetchRemoteCatalog(): Promise<RemoteMod[]> {
  try {
    const res = await fetch(catalogUrl(), { headers: { 'Cache-Control': 'no-cache' } })
    if (!res.ok) {
      console.warn('[Catalog] تعذّر جلب القائمة، الحالة:', res.status)
      return []
    }
    const data = (await res.json()) as { mods?: RemoteMod[] }
    if (!data || !Array.isArray(data.mods)) return []
    return data.mods.filter((m) => m && m.id && m.category && m.folderName && m.downloadUrl)
  } catch (err) {
    console.warn('[Catalog] خطأ في جلب القائمة:', (err as Error)?.message)
    return []
  }
}
