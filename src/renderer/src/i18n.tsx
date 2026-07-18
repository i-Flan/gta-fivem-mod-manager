import { createContext, useContext } from 'react'

export type Lang = 'ar' | 'en'

// الترجمة: العربية عامّية مرتّبة، والإنجليزية واضحة. تُصان مع كل تحديث.
export const translations: Record<Lang, Record<string, string>> = {
  ar: {
    headerSubtitle: 'مدير المودات',
    fivemPath: 'مسار FiveM',
    refresh: 'تحديث',
    settings: 'الإعدادات',
    favorites: 'المفضلة',
    available: 'متاح',
    files: 'ملف',
    readyToDownload: 'جاهز للتحميل',

    cat_graphics_title: 'الجرافكس',
    cat_graphics_desc: 'اختر جرافكس وحده وفعّله.',
    cat_audio_title: 'أصوات الأسلحة',
    cat_audio_desc: 'اختر حزمة صوت وحده وفعّلها.',
    cat_bloodfx_title: 'دم BloodFX',
    cat_bloodfx_desc: 'كل حزمة فيها ملف DAT وملف RPF.',
    cat_killfx_title: 'قتلات KillFX',
    cat_killfx_desc: 'كل حزمة فيها ملف DAT وملف RPF.',

    activate: 'تفعيل',
    activating: 'يفعّل...',
    deactivate: 'إلغاء التفعيل',
    activeNow: '✓ مفعّل حالياً',
    activeBadge: 'مفعّل الآن',
    download: '⬇ تحميل',
    downloading: 'يحمّل',
    addFavorite: '☆ أضف للمفضلة',
    removeFavorite: '★ شيله من المفضلة',
    edit: '✏️ تعديل',
    testSound: '▶ جرّب الصوت',
    soundLoading: 'يحمّل...',
    soundStop: '■ وقّف',

    emptyCategory: 'ما فيه مودات في هذا التصنيف',
    emptyHint: 'ما فيه مودات متاحة حالياً — اضغط زر التحديث ↻',
    emptyFav: 'ما عندك مودات مفضلة',
    emptyFavHint: 'ضيف مودات للمفضلة من زر ⭐ في الكرت',
    favEyebrow: 'المفضلة',

    toastActivated: 'تم التفعيل ✅',
    toastDeactivated: 'تم إلغاء التفعيل',
    toastRefreshed: 'حدّثنا القائمة',
    toastDownloaded: 'تم تحميل المود ✅',
    toastDownloadFail: 'ما قدرنا نحمّل المود',
    toastError: 'صار خطأ',
    toastSettingsSaved: 'حفظنا الإعدادات',
    toastEditSaved: 'حفظنا التعديلات',

    settingsTitle: 'الإعدادات',
    language: 'اللغة',
    browse: 'استعراض',
    backupLabel: 'نسخة احتياطية قبل التبديل',
    saveSettings: 'حفظ الإعدادات',

    editModTitle: 'تعديل المود',
    nameLabel: 'الاسم',
    descLabel: 'الوصف',
    cancel: 'إلغاء',
    save: 'حفظ'
  },
  en: {
    headerSubtitle: 'Mod Manager',
    fivemPath: 'FiveM Path',
    refresh: 'Refresh',
    settings: 'Settings',
    favorites: 'Favorites',
    available: 'available',
    files: 'files',
    readyToDownload: 'Ready to download',

    cat_graphics_title: 'Graphics',
    cat_graphics_desc: 'Pick one graphics pack to enable.',
    cat_audio_title: 'Weapon Sounds',
    cat_audio_desc: 'Pick one sound pack to enable.',
    cat_bloodfx_title: 'BloodFX',
    cat_bloodfx_desc: 'Each pack has a DAT and an RPF file.',
    cat_killfx_title: 'KillFX',
    cat_killfx_desc: 'Each pack has a DAT and an RPF file.',

    activate: 'Activate',
    activating: 'Activating...',
    deactivate: 'Deactivate',
    activeNow: '✓ Active now',
    activeBadge: 'Active',
    download: '⬇ Download',
    downloading: 'Downloading',
    addFavorite: '☆ Add favorite',
    removeFavorite: '★ Remove favorite',
    edit: '✏️ Edit',
    testSound: '▶ Test Sound',
    soundLoading: 'Loading...',
    soundStop: '■ Stop',

    emptyCategory: 'No mods in this category',
    emptyHint: 'No mods available yet — press refresh ↻',
    emptyFav: 'No favorite mods',
    emptyFavHint: 'Add favorites using the ⭐ on a card',
    favEyebrow: 'FAVORITES',

    toastActivated: 'Activated ✅',
    toastDeactivated: 'Deactivated',
    toastRefreshed: 'List refreshed',
    toastDownloaded: 'Mod downloaded ✅',
    toastDownloadFail: 'Download failed',
    toastError: 'Something went wrong',
    toastSettingsSaved: 'Settings saved',
    toastEditSaved: 'Changes saved',

    settingsTitle: 'Settings',
    language: 'Language',
    browse: 'Browse',
    backupLabel: 'Backup before switching',
    saveSettings: 'Save Settings',

    editModTitle: 'Edit Mod',
    nameLabel: 'Name',
    descLabel: 'Description',
    cancel: 'Cancel',
    save: 'Save'
  }
}

interface I18n {
  lang: Lang
  dir: 'rtl' | 'ltr'
  t: (key: string) => string
}

export const I18nContext = createContext<I18n>({
  lang: 'ar',
  dir: 'rtl',
  t: (key) => translations.ar[key] ?? key
})

export function useI18n(): I18n {
  return useContext(I18nContext)
}

export function makeI18n(lang: Lang): I18n {
  return {
    lang,
    dir: lang === 'ar' ? 'rtl' : 'ltr',
    t: (key: string) => translations[lang][key] ?? translations.ar[key] ?? key
  }
}
