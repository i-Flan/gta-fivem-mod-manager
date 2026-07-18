// إعدادات المصدر المركزي للمودات على GitHub.
// المودات تُرفع كـ Release assets في إصدار مخصص بوسم "content"
// (مُعلَّم كـ pre-release حتى لا يخلط مع تحديثات البرنامج).

export const CONTENT_OWNER = 'i-Flan'
export const CONTENT_REPO = 'gta-fivem-mod-manager'
export const CONTENT_TAG = 'content'

// رابط ملف القائمة الذي يقرأه البرنامج ليعرف المودات المتاحة.
export function catalogUrl(): string {
  // نضيف طابعاً زمنياً لتجنّب التخزين المؤقت (cache) وضمان أحدث نسخة.
  return `https://github.com/${CONTENT_OWNER}/${CONTENT_REPO}/releases/download/${CONTENT_TAG}/catalog.json?t=${Date.now()}`
}
