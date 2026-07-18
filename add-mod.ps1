# Admin tool: uploads a mod to GitHub and updates the central catalog.json
# so the mod appears for ALL users automatically.
# Run via: add-mod.bat

$ErrorActionPreference = 'Stop'

$Owner = 'i-Flan'
$Repo  = 'gta-fivem-mod-manager'
$Tag   = 'content'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$tokenFile = Join-Path $root 'github-token.txt'

if (-not (Test-Path $tokenFile)) {
  Write-Host "[ERROR] github-token.txt not found next to this tool." -ForegroundColor Red
  Write-Host "Create it and paste your GitHub Personal Access Token (repo scope)."
  Read-Host "Press Enter to exit"; exit 1
}
$token = (Get-Content $tokenFile -Raw).Trim()
$headers = @{ Authorization = "Bearer $token"; 'User-Agent' = 'mod-admin'; Accept = 'application/vnd.github+json' }

function Upload-Asset($releaseId, $assetName, $filePath, $contentType) {
  $url = "https://uploads.github.com/repos/$Owner/$Repo/releases/$releaseId/assets?name=$assetName"
  $out = & curl.exe -s -w "|HTTP%{http_code}" -X POST -H "Authorization: Bearer $token" -H "Content-Type: $contentType" --data-binary "@$filePath" $url
  $code = ($out -split '\|HTTP')[-1]
  if ($code -notin @('200','201')) {
    Write-Host "[ERROR] Upload of $assetName failed (HTTP $code)." -ForegroundColor Red
    Write-Host $out
    Read-Host "Press Enter to exit"; exit 1
  }
}

Write-Host "=== Add a new mod ===" -ForegroundColor Cyan

$modFolder = (Read-Host "1) Mod folder path (drag the folder here)").Trim('"').Trim()
if (-not (Test-Path $modFolder)) { Write-Host "[ERROR] Folder not found." -ForegroundColor Red; Read-Host "Press Enter to exit"; exit 1 }

Write-Host ""
Write-Host "2) Choose category:" -ForegroundColor Cyan
Write-Host "   1) graphics"
Write-Host "   2) audio"
Write-Host "   3) bloodfx"
Write-Host "   4) killfx"
$catChoice = (Read-Host "Type a number (1-4)").Trim()
$catMap = @{ '1' = 'graphics'; '2' = 'audio'; '3' = 'bloodfx'; '4' = 'killfx' }
$category = $catMap[$catChoice]
if (-not $category) { Write-Host "[ERROR] Invalid choice." -ForegroundColor Red; Read-Host "Press Enter to exit"; exit 1 }
Write-Host "   -> $category" -ForegroundColor Green

$nameAr = (Read-Host "3) Arabic display name (e.g. Naff Graphics)").Trim()
$folderRaw = (Read-Host "4) Short English name / slug (e.g. naff)").Trim()
$folderName = ($folderRaw.ToLower() -replace '[^a-z0-9]+','-').Trim('-')
if ([string]::IsNullOrWhiteSpace($folderName)) { Write-Host "[ERROR] The short name must be English letters/numbers." -ForegroundColor Red; Read-Host "Press Enter to exit"; exit 1 }
$descAr = (Read-Host "5) Short description (optional, press Enter to skip)").Trim()

$id = "$category-$folderName"
$assetName = "$folderName.zip"

# 1) Zip the mod folder
$tmpZip = Join-Path $env:TEMP "$id.zip"
if (Test-Path $tmpZip) { Remove-Item $tmpZip -Force }
Write-Host "Zipping the mod..." -ForegroundColor Yellow
Compress-Archive -Path (Join-Path $modFolder '*') -DestinationPath $tmpZip -Force
$size = (Get-Item $tmpZip).Length
Write-Host ("Size: {0:N1} MB" -f ($size/1MB))

# 2) Ensure the content release exists (create if missing)
try {
  $release = Invoke-RestMethod -Headers $headers -Uri "https://api.github.com/repos/$Owner/$Repo/releases/tags/$Tag"
  Write-Host "Content release found." -ForegroundColor Green
} catch {
  Write-Host "Creating the content release for the first time..." -ForegroundColor Yellow
  $body = @{ tag_name = $Tag; name = 'Mods Content'; prerelease = $true; body = 'App mods - do not delete this release' } | ConvertTo-Json
  $release = Invoke-RestMethod -Headers $headers -Method Post -Uri "https://api.github.com/repos/$Owner/$Repo/releases" -Body $body -ContentType 'application/json'
}
$releaseId = $release.id

# 3) Delete a previous version of this same mod if present
$oldAsset = $release.assets | Where-Object { $_.name -eq $assetName }
if ($oldAsset) {
  Write-Host "Replacing a previous version of this mod..." -ForegroundColor Yellow
  Invoke-RestMethod -Headers $headers -Method Delete -Uri "https://api.github.com/repos/$Owner/$Repo/releases/assets/$($oldAsset.id)" | Out-Null
}

# 4) Upload the mod zip
Write-Host "Uploading the mod... (may take a while depending on size)" -ForegroundColor Yellow
Upload-Asset $releaseId $assetName $tmpZip 'application/zip'
$downloadUrl = "https://github.com/$Owner/$Repo/releases/download/$Tag/$assetName"

# 5) Update catalog.json
$catAsset = $release.assets | Where-Object { $_.name -eq 'catalog.json' }
$mods = @()
if ($catAsset) {
  try { $existing = Invoke-RestMethod -Uri $catAsset.browser_download_url; $mods = @($existing.mods) } catch { $mods = @() }
  Invoke-RestMethod -Headers $headers -Method Delete -Uri "https://api.github.com/repos/$Owner/$Repo/releases/assets/$($catAsset.id)" | Out-Null
}
# Remove any old entry for this mod, then add the new one
$mods = @($mods | Where-Object { $_ -and $_.id -ne $id })

$entryJson = @{ id = $id; category = $category; folderName = $folderName; nameAr = $nameAr; descriptionAr = $descAr; downloadUrl = $downloadUrl; size = $size } | ConvertTo-Json -Compress
$items = @()
foreach ($m in $mods) { $items += ($m | ConvertTo-Json -Depth 6 -Compress) }
$items += $entryJson
$json = '{"version":1,"mods":[' + ($items -join ',') + ']}'

$catTmp = Join-Path $env:TEMP 'catalog.json'
[System.IO.File]::WriteAllText($catTmp, $json, (New-Object System.Text.UTF8Encoding($false)))
Write-Host "Updating catalog..." -ForegroundColor Yellow
Upload-Asset $releaseId 'catalog.json' $catTmp 'application/json'

Remove-Item $tmpZip -Force -ErrorAction SilentlyContinue
Write-Host ""
Write-Host "[DONE] The mod '$nameAr' is now available to all users." -ForegroundColor Green
Write-Host "Total mods in catalog now: $($items.Count)"
Write-Host "They will see it after opening the app or pressing refresh."
Read-Host "Press Enter to exit"
