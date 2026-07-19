import { existsSync, readFileSync } from 'fs'
import { join, dirname } from 'path'
import { app, nativeImage } from 'electron'
import type { ModCategory } from '../shared/types'

// صورة افتراضية تُستخدم لو المود ما له صورة غلاف (ملف محلي على جهاز المدير)
const FALLBACK_IMAGE = 'C:\\Users\\yazee\\Downloads\\ChatGPT Image Jul 19, 2026, 12_46_24 AM (1).png'

// رابط تحميل البرنامج (يظهر كزر / رابط في الإعلان)
const RELEASES_URL = 'https://github.com/i-Flan/Fivey/releases/'

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

// مسار أيقونة Fivey (المصدر في التطوير، والمورد الخارجي في النسخة المثبّتة)
function iconPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'icon.png')
    : join(app.getAppPath(), 'build', 'icon.png')
}

// يجيب بيانات صورة المود: من رابط الإنترنت أو من ملف محلي أو الصورة الافتراضية
async function getSourceImage(preview?: string): Promise<Buffer | null> {
  try {
    if (preview && /^https?:\/\//i.test(preview)) {
      const res = await fetch(preview)
      if (res.ok) return Buffer.from(await res.arrayBuffer())
    }
  } catch {
    // نكمّل للملف المحلي
  }
  try {
    const local = preview && existsSync(preview) ? preview : existsSync(FALLBACK_IMAGE) ? FALLBACK_IMAGE : ''
    if (local) return readFileSync(local)
  } catch {
    // ignore
  }
  return null
}

// يحوّل أي صورة إلى بانر عريض أنيق (نسبة 16:9) عشان ما تطلع ضخمة في ديسكورد
function makeBanner(buf: Buffer): Buffer {
  try {
    let img = nativeImage.createFromBuffer(buf)
    const { width, height } = img.getSize()
    if (!width || !height) return buf

    const ratio = 16 / 9
    let cropW = width
    let cropH = Math.round(width / ratio)
    if (cropH > height) {
      cropH = height
      cropW = Math.round(height * ratio)
    }
    const x = Math.max(0, Math.round((width - cropW) / 2))
    const y = Math.max(0, Math.round((height - cropH) / 2))
    img = img.crop({ x, y, width: cropW, height: cropH })

    if (cropW > 1280) img = img.resize({ width: 1280, quality: 'best' })
    const png = img.toPNG()
    return png.length ? png : buf
  } catch {
    return buf
  }
}

// يرسل إعلاناً (Embed) أنيقاً عن المود إلى روم التصنيف عبر Webhook
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

  const catLabel = CAT_LABEL[mod.category]
  // وصف بسيط بثلاثة أسطر: اسم المود (من البرنامج) + الحصرية + رابط التحميل
  const description =
    `**→ Name ${catLabel} :** ${mod.nameAr}` +
    `\n\n**→ Exclusive on Fivey** 🔥` +
    `\n**[→ Download Now ✓](${RELEASES_URL})**`

  const embed: Record<string, unknown> = {
    author: { name: `Fivey  •  ${catLabel}`, icon_url: 'attachment://fivey.png' },
    description,
    color: 0xe01e2b,
    footer: { text: 'Fivey Mod Manager', icon_url: 'attachment://fivey.png' },
    timestamp: new Date().toISOString()
  }

  // أيقونة Fivey (تُستخدم في author + footer) — تُرفق مرة واحدة
  let hasIcon = false
  try {
    const ic = iconPath()
    if (existsSync(ic)) {
      form.append(`files[${fileIndex}]`, new Blob([readFileSync(ic)], { type: 'image/png' }), 'fivey.png')
      fileIndex++
      hasIcon = true
    }
  } catch {
    // نكمّل بدون أيقونة
  }
  if (!hasIcon) {
    ;(embed.author as { icon_url?: string }).icon_url = undefined
    ;(embed.footer as { icon_url?: string }).icon_url = undefined
  }

  // صورة المود ← بانر عريض أنيق (image كبير لكن بنسبة مرتّبة)
  const src = await getSourceImage(mod.preview)
  if (src) {
    const banner = makeBanner(src)
    form.append(`files[${fileIndex}]`, new Blob([banner], { type: 'image/png' }), 'banner.png')
    embed.image = { url: 'attachment://banner.png' }
    fileIndex++
  }

  // زر رابط حقيقي (لو الروم يدعمه). لو رفضه ديسكورد نعيد الإرسال بدون أزرار.
  const linkButton = {
    type: 1,
    components: [{ type: 2, style: 5, label: '⬇️ Download from App', url: RELEASES_URL }]
  }

  const send = async (withButton: boolean): Promise<Response> => {
    const body = new FormData()
    for (const [k, v] of form.entries()) body.append(k, v as string | Blob)
    body.append(
      'payload_json',
      JSON.stringify({ username: 'Fivey', embeds: [embed], components: withButton ? [linkButton] : [] })
    )
    return fetch(url, { method: 'POST', body })
  }

  try {
    let res = await send(true)
    if (!res.ok) res = await send(false) // fallback: بدون زر (الرابط في الوصف يكفي)
    if (!res.ok) return { success: false, error: `ديسكورد رفض الطلب (${res.status})` }
    return { success: true }
  } catch (err) {
    return { success: false, error: (err as Error)?.message || 'فشل إرسال الإعلان' }
  }
}
