# Register Battle Standard native messaging host on Windows (Chrome + Edge).
# Requires: npm run companion:tray:build (or pass -LauncherPath)
param(
  [Parameter(Mandatory = $true)]
  [string]$ExtensionId,
  [string]$LauncherPath = "",
  [switch]$DevLauncher,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$cli = Join-Path $root "install\register-cli.ts"

$args = @("tsx", $cli, "--extension-id", $ExtensionId, "--platform", "windows")
if ($LauncherPath) { $args += @("--launcher", $LauncherPath) }
if ($DevLauncher) { $args += "--dev-launcher" }
if ($DryRun) { $args += "--dry-run" }

& npx @args
exit $LASTEXITCODE
