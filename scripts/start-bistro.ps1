$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$version = (Get-Content -LiteralPath (Join-Path $root 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json).version
$exe = Join-Path $root "release/$version/win-unpacked/Bug小餐馆.exe"
if (-not (Test-Path -LiteralPath $exe -PathType Leaf)) {
    Write-Host "当前版本尚未构建，请先运行 npm run pack。" -ForegroundColor Red
    exit 1
}
Start-Process -FilePath $exe -WorkingDirectory (Split-Path -Parent $exe) -WindowStyle Hidden
