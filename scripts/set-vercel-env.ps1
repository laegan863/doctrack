# Saves DocTrack's production settings to the linked Vercel project.
# You type the password and the Upstash values yourself; SESSION_SECRET is generated here.
# Nothing is printed or written to disk. Run from the project folder:
#   powershell -ExecutionPolicy Bypass -File scripts\set-vercel-env.ps1

$ErrorActionPreference = "Stop"

function Read-Secret([string]$prompt) {
  $secure = Read-Host -Prompt $prompt -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

function Save([string]$name, [string]$value) {
  $value | vercel env add $name --environment production --type secret --force --yes | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Saving $name failed." }
  Write-Host "  saved $name" -ForegroundColor Green
}

Write-Host "`nDocTrack -> Vercel production settings`n"

do {
  $password = Read-Secret "Choose your DocTrack password (at least 8 characters, hidden)"
  $again = Read-Secret "Type it again"
  if ($password.Length -lt 8) { Write-Host "Too short, try again." -ForegroundColor Yellow }
  elseif ($password -ne $again) { Write-Host "They don't match, try again." -ForegroundColor Yellow }
} until ($password.Length -ge 8 -and $password -eq $again)

$bytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$sessionSecret = -join ($bytes | ForEach-Object { $_.ToString("x2") })

Write-Host "`nUpstash: open your database on console.upstash.com -> REST API section."
Write-Host "Press Enter on both to skip if you will connect Upstash under Vercel -> Storage instead.`n"
$redisUrl = (Read-Host "UPSTASH_REDIS_REST_URL (https://...upstash.io)").Trim()
$redisToken = if ($redisUrl) { (Read-Secret "UPSTASH_REDIS_REST_TOKEN (hidden)").Trim() } else { "" }

Write-Host ""
Save "APP_PASSWORD" $password
Save "SESSION_SECRET" $sessionSecret
if ($redisUrl -and $redisToken) {
  Save "UPSTASH_REDIS_REST_URL" $redisUrl
  Save "UPSTASH_REDIS_REST_TOKEN" $redisToken
} else {
  Write-Host "  skipped Upstash (connect it under Vercel -> Storage)" -ForegroundColor Yellow
}

Write-Host "`nDone. Tell Claude to redeploy.`n"
