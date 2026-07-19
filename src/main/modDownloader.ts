import { createWriteStream, existsSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { Readable, Transform } from 'stream'
import { pipeline } from 'stream/promises'
import { app } from 'electron'
import extract from 'extract-zip'
import { getModsDirectory } from './modCatalog'
import type { ModManifest } from '../shared/types'

type ProgressFn = (progress: number) => void

// ينزّل ملف المود المضغوط من GitHub ويفكّه في مجلد المودات القابل للكتابة.
// بعد الفكّ يلتقطه ماسح المودات تلقائياً ويصبح جاهزاً للتفعيل.
export async function downloadAndInstall(
  mod: ModManifest,
  onProgress: ProgressFn
): Promise<{ success: boolean; error?: string }> {
  if (!mod.downloadUrl || !mod.folderName) {
    return { success: false, error: 'بيانات التحميل ناقصة' }
  }

  const modsDir = getModsDirectory()
  const targetDir = join(modsDir, mod.category, mod.folderName)
  const tmpZip = join(app.getPath('temp'), `mod-${mod.id}-${Date.now()}.zip`)

  try {
    const res = await fetch(mod.downloadUrl)
    if (!res.ok || !res.body) {
      return { success: false, error: `فشل التحميل (${res.status})` }
    }

    const total = Number(res.headers.get('content-length')) || mod.size || 0
    let received = 0

    const nodeStream = Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0])
    // نحسب التقدّم داخل السلسلة (Transform) بدل مستمع 'data' — لأن مزج
    // مستمع 'data' مع pipeline يفقد أجزاء من الملف ويجعله تالفاً.
    const progress = new Transform({
      transform(chunk, _enc, cb) {
        received += chunk.length
        if (total > 0) onProgress(Math.min(0.99, received / total))
        cb(null, chunk)
      }
    })

    await pipeline(nodeStream, progress, createWriteStream(tmpZip))

    // استبدال أي نسخة سابقة من المود
    if (existsSync(targetDir)) rmSync(targetDir, { recursive: true, force: true })
    mkdirSync(targetDir, { recursive: true })

    await extract(tmpZip, { dir: targetDir })

    onProgress(1)
    return { success: true }
  } catch (err) {
    return { success: false, error: (err as Error)?.message || 'خطأ أثناء التحميل' }
  } finally {
    try {
      if (existsSync(tmpZip)) rmSync(tmpZip, { force: true })
    } catch {
      // ignore
    }
  }
}
