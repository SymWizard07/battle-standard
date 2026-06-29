# Register Battle Standard native messaging host for Firefox on Windows.
# Requires: npm run companion:tray:build (or pass -LauncherPath)
param(
  [Parameter(Mandatory = $true)]
  [string]$FirefoxId,
  [string]$LauncherPath = "",
  [switch]$DevLauncher,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$cli = Join-Path $root "install\register-cli.ts"

$cliArgs = @("tsx", $cli, "--platform", "firefox", "--firefox-id", $FirefoxId)
if ($LauncherPath) { $cliArgs += @("--launcher", $LauncherPath) }
if ($DevLauncher) { $cliArgs += "--dev-launcher" }
if ($DryRun) { $cliArgs += "--dry-run" }

& npx @cliArgs
exit $LASTEXITCODE
