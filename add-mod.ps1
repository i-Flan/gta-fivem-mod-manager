# أداة المدير: ترفع موداً إلى GitHub وتحدّث القائمة المركزية catalog.json
# بحيث يظهر المود لكل المستخدمين تلقائياً.
# التشغيل عبر: اضف-مود.bat

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$Owner = 'i-Flan'
$Repo  = 'gta-fivem-mod-manager'
$Tag   = 'content'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$tokenFile = Join-Path $root 'github-token.txt'

if (-not (Test-Path $tokenFile)) {
  Write-Host "[خطأ] لم يوجد ملف github-token.txt بجوار الأداة." -ForegroundColor Red
  Write-Host "أنشئ الملف وضع فيه مفتاح GitHub (Personal Access Token) بصلاحية repo."
  Read-Host "اضغط Enter للخروج"; exit 1
}
$token = (Get-Content $tokenFile -Raw).Trim()
$headers = @{ Authorization = "Bearer $token"; 'User-Agent' = 'mod-admin'; Accept = 'application/vnd.github+json' }

Write-Host "=== إضافة مود جديد ===" -ForegroundColor Cyan

$modFolder = (Read-Host "مسار مجلد المود (اسحب المجلد هنا)").Trim('"').Trim()
if (-not (Test-Path $modFolder)) { Write-Host "[خطأ] المجلد غير موجود." -ForegroundColor Red; Read-Host "Enter للخروج"; exit 1 }

$category = (Read-Host "التصنيف (graphics / audio / bloodfx / killfx)").Trim().ToLower()
if ($category -notin @('graphics','audio','bloodfx','killfx')) { Write-Host "[خطأ] تصنيف غير صحيح." -ForegroundColor Red; Read-Host "Enter للخروج"; exit 1 }

$nameAr = (Read-Host "اسم المود بالعربي (مثل: جرافكس ناف)").Trim()
$folderRaw = (Read-Host "اسم مختصر بالإنجليزي slug (مثل: naff)").Trim()
$folderName = ($folderRaw.ToLower() -replace '[^a-z0-9]+','-').Trim('-')
if ([string]::IsNullOrWhiteSpace($folderName)) { Write-Host "[خطأ] الاسم المختصر لازم يكون إنجليزي." -ForegroundColor Red; Read-Host "Enter للخروج"; exit 1 }
$descAr = (Read-Host "وصف قصير (اختياري)").Trim()

$id = "$category-$folderName"
$assetName = "$folderName.zip"

# 1) ضغط المود
$tmpZip = Join-Path $env:TEMP "$id.zip"
if (Test-Path $tmpZip) { Remove-Item $tmpZip -Force }
Write-Host "جارٍ ضغط المود..." -ForegroundColor Yellow
Compress-Archive -Path (Join-Path $modFolder '*') -DestinationPath $tmpZip -Force
$size = (Get-Item $tmpZip).Length
Write-Host ("الحجم: {0:N1} MB" -f ($size/1MB))

# 2) التأكد من وجود إصدار المحتوى (أو إنشاؤه)
try {
  $release = Invoke-RestMethod -Headers $headers -Uri "https://api.github.com/repos/$Owner/$Repo/releases/tags/$Tag"
} catch {
  Write-Host "إنشاء إصدار المحتوى لأول مرة..." -ForegroundColor Yellow
  $body = @{ tag_name = $Tag; name = 'Mods Content'; prerelease = $true; body = 'مودات البرنامج — لا تحذف هذا الإصدار' } | ConvertTo-Json
  $release = Invoke-RestMethod -Headers $headers -Method Post -Uri "https://api.github.com/repos/$Owner/$Repo/releases" -Body $body -ContentType 'application/json'
}
$releaseId = $release.id

# 3) حذف نسخة سابقة من نفس المود إن وُجدت
$oldAsset = $release.assets | Where-Object { $_.name -eq $assetName }
if ($oldAsset) {
  Write-Host "استبدال نسخة سابقة من المود..." -ForegroundColor Yellow
  Invoke-RestMethod -Headers $headers -Method Delete -Uri "https://api.github.com/repos/$Owner/$Repo/releases/assets/$($oldAsset.id)" | Out-Null
}

# 4) رفع ملف المود (curl يدعم الملفات الكبيرة)
Write-Host "جارٍ رفع المود... (قد يأخذ وقتاً حسب الحجم)" -ForegroundColor Yellow
$uploadUrl = "https://uploads.github.com/repos/$Owner/$Repo/releases/$releaseId/assets?name=$assetName"
& curl.exe -s -X POST -H "Authorization: Bearer $token" -H "Content-Type: application/zip" --data-binary "@$tmpZip" $uploadUrl | Out-Null
$downloadUrl = "https://github.com/$Owner/$Repo/releases/download/$Tag/$assetName"

# 5) تحديث catalog.json
$catAsset = $release.assets | Where-Object { $_.name -eq 'catalog.json' }
$mods = @()
if ($catAsset) {
  try { $existing = Invoke-RestMethod -Uri $catAsset.browser_download_url; $mods = @($existing.mods) } catch { $mods = @() }
  Invoke-RestMethod -Headers $headers -Method Delete -Uri "https://api.github.com/repos/$Owner/$Repo/releases/assets/$($catAsset.id)" | Out-Null
}
# إزالة أي إدخال قديم لنفس المود ثم إضافة الجديد
$mods = @($mods | Where-Object { $_ -and $_.id -ne $id })

$entryJson = @{ id = $id; category = $category; folderName = $folderName; nameAr = $nameAr; descriptionAr = $descAr; downloadUrl = $downloadUrl; size = $size } | ConvertTo-Json -Compress
$items = @()
foreach ($m in $mods) { $items += ($m | ConvertTo-Json -Depth 6 -Compress) }
$items += $entryJson
$json = '{"version":1,"mods":[' + ($items -join ',') + ']}'

$catTmp = Join-Path $env:TEMP 'catalog.json'
[System.IO.File]::WriteAllText($catTmp, $json, (New-Object System.Text.UTF8Encoding($false)))

$catUploadUrl = "https://uploads.github.com/repos/$Owner/$Repo/releases/$releaseId/assets?name=catalog.json"
& curl.exe -s -X POST -H "Authorization: Bearer $token" -H "Content-Type: application/json" --data-binary "@$catTmp" $catUploadUrl | Out-Null

Remove-Item $tmpZip -Force -ErrorAction SilentlyContinue
Write-Host ""
Write-Host "✓ تم! المود '$nameAr' صار متاحاً لكل المستخدمين." -ForegroundColor Green
Write-Host "  يظهر لهم عند فتح البرنامج أو ضغط زر التحديث."
Read-Host "اضغط Enter للخروج"
