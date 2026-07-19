import { existsSync, readFileSync } from 'fs'
import { join, extname, dirname } from 'path'
import { app } from 'electron'
import type { ModCategory } from '../shared/types'

// صورة افتراضية تُستخدم لو المود ما له صورة غلاف (ملف محلي على جهاز المدير)
const FALLBACK_IMAGE = 'C:\\Users\\yazee\\Downloads\\ChatGPT Image Jul 19, 2026, 12_46_24 AM (1).png'

// أسماء التصنيفات كما تظهر في الإعلان
const CAT_LABEL: Record<ModCategory, string> = {
  graphics: 'Graphics',
  audio: 'Sound',
  bloodfx: 'BloodFX',
  killfx: 'KillFX'
}

export interface PublishMod {
  id: string
  category: ModCategory
  nameAr: string
  descriptionAr?: string
  preview?: string
}

// روابط الـWebhook تُقرأ من ملف محلي سرّي (غير مرفوع، غير موزّع مع البرنامج).
// نبحث في كل المسارات المحتملة: مجلد المشروع (تطوير)، مجلد التشغيل،
// userData، وبجوار ملف البرنامج (النسخة المثبّتة).
function webhookCandidates(): string[] {
  const list = [
    join(app.getAppPath(), 'webhooks.json'),
    join(process.cwd(), 'webhooks.json'),
    join(app.getPath('userData'), 'webhooks.json')
  ]
  try {
    list.push(join(dirname(app.getPath('exe')), 'webhooks.json'))
  } catch {
    // ignore
  }
  return list
}

function loadWebhooks(): { hooks: Partial<Record<ModCategory, string>>; found: boolean } {
  for (const f of webhookCandidates()) {
    try {
      if (existsSync(f)) return { hooks: JSON.parse(readFileSync(f, 'utf8')), found: true }
    } catch {
      // ملف تالف — نجرّب الموقع التالي
    }
  }
  return { hooks: {}, found: false }
}

// مسار أيقونة Fivey (maintains المصدر في التطوير، والمورد الخارجي في النسخة المثبّتة)
function iconPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'icon.png')
    : join(app.getAppPath(), 'build', 'icon.png')
}

function appendFile(form: FormData, index: number, filePath: string, fileName: string, mime: string): void {
  const buf = readFileSync(filePath)
  form.append(`files[${index}]`, new Blob([buf], { type: mime }), fileName)
}

// يرسل إعلاناً (Embed) عن المود إلى روم التصنيف عبر Webhook
export async function announceMod(mod: PublishMod): Promise<{ success: boolean; error?: string }> {
  const { hooks, found } = loadWebhooks()
  if (!found) {
    return { success: false, error: 'ملف webhooks.json غير موجود على هذا الجهاز' }
  }
  const url = hooks[mod.category]
  if (!url) {
    return { success: false, error: `ما فيه رابط لتصنيف "${mod.category}" داخل webhooks.json` }
  }

  const form = new FormData()
  let fileIndex = 0

  const embed: Record<string, unknown> = {
    title: mod.nameAr,
    description: mod.descriptionAr || undefined,
    color: 0xe01e2b,
    footer: { text: `Fivey • ${CAT_LABEL[mod.category]}` }
  }

  // أيقونة Fivey في الزاوية (thumbnail) — تُرفق كملف
  try {
    const ic = iconPath()
    if (existsSync(ic)) {
      appendFile(form, fileIndex, ic, 'fivey.png', 'image/png')
      embed.thumbnail = { url: 'attachment://fivey.png' }
      fileIndex++
    }
  } catch {
    // لو ما قدرنا نرفق الأيقونة نكمّل بدونها
  }

  // صورة خلفية المود (image): رابط مباشر، أو ملف محلي، أو الصورة الافتراضية
  try {
    const preview = mod.preview
    if (preview && /^https?:\/\//i.test(preview)) {
      embed.image = { url: preview }
    } else {
      const local = preview && existsSync(preview) ? preview : existsSync(FALLBACK_IMAGE) ? FALLBACK_IMAGE : ''
      if (local) {
        const ext = extname(local).toLowerCase()
        const isJpg = ext === '.jpg' || ext === '.jpeg'
        const fname = isJpg ? 'preview.jpg' : 'preview.png'
        appendFile(form, fileIndex, local, fname, isJpg ? 'image/jpeg' : 'image/png')
        embed.image = { url: `attachment://${fname}` }
        fileIndex++
      }
    }
  } catch {
    // نكمّل بدون صورة كبيرة لو تعذّر رفعها
  }

  form.append('payload_json', JSON.stringify({ username: 'Fivey', embeds: [embed] }))

  try {
    const res = await fetch(url, { method: 'POST', body: form })
    if (!res.ok) return { success: false, error: `ديسكورد رفض الطلب (${res.status})` }
    return { success: true }
  } catch (err) {
    return { success: false, error: (err as Error)?.message || 'فشل إرسال الإعلان' }
  }
}
