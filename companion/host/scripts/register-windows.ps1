# Requires -ExecutionPolicy Bypass for unsigned scripts, or run from elevated shell once.
param(
  [string]$HostManifestPath = "",
  [string]$ExtensionId = "REPLACE_WITH_EXTENSION_ID"
)

$ErrorActionPreference = "Stop"

if (-not $HostManifestPath) {
  $HostManifestPath = Join-Path $PSScriptRoot "..\manifest\com.battlestandard.savehelper.json"
}

if (-not (Test-Path $HostManifestPath)) {
  Write-Error "Host manifest not found: $HostManifestPath. Generate from .template first."
}

$manifestJson = Get-Content $HostManifestPath -Raw | ConvertFrom-Json
$manifestJson.allowed_origins = @("chrome-extension://$ExtensionId/")

$launcherPath = Join-Path $PSScriptRoot "run-host.cmd"
$manifestJson.path = $launcherPath

$outManifest = Join-Path $PSScriptRoot "..\manifest\com.battlestandard.savehelper.json"
$manifestJson | ConvertTo-Json -Depth 5 | Set-Content $outManifest -Encoding UTF8

$hostName = "com.battlestandard.savehelper"
$regPath = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$hostName"
New-Item -Path $regPath -Force | Out-Null
Set-ItemProperty -Path $regPath -Name "(default)" -Value (Resolve-Path $outManifest)

Write-Host "Registered Chrome native messaging host:"
Write-Host "  Registry: $regPath"
Write-Host "  Manifest: $outManifest"
Write-Host "  Launcher: $launcherPath"
Write-Host ""
Write-Host "Edge uses: HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\$hostName"
