# Battle Standard Companion

Optional **Save Helper** for writing campaigns to a real folder on disk — via browser extension + native host + one-time setup app. Works alongside (or instead of) the browser File System Access save folder.

## Quick install (production)

**End users:**

1. Install the [Firefox extension](https://addons.mozilla.org/firefox/addon/battle-standard-save-helper/) from Mozilla Add-ons (v0.1.1+ required for choosing a save folder on the site).
2. Download and run the **Setup** app for your platform from [GitHub Releases](https://github.com/SymWizard07/battle-standard/releases) (tag `save-helper-v*`).
3. Open Battle Standard → choose a save folder when prompted (opens your OS folder dialog).

**Developers** (from repo):

1. **Build components**

   ```bash
   npm run companion:tray:build
   npm run companion:extension:build:firefox
   ```

2. **Run setup once** (deploys host + registers Firefox)

   ```bash
   npm run companion:tray:start
   ```

3. **Load extension** — signed AMO build, or temporary:
   `about:debugging` → Load Temporary Add-on → `companion/extension/dist-firefox/manifest.json`

4. **Register native host** (if not using setup app) — see [register scripts](#register-scripts) below.

5. **Open website** → Home → Save Helper → **Choose save folder…**

## Firefox signing

Firefox requires Mozilla-signed add-ons unless you use a temporary add-on from `about:debugging`.

### Option A — Temporary add-on (fastest for dev)

1. `npm run companion:extension:build:firefox`
2. `about:debugging` → **This Firefox** → **Load Temporary Add-on** → `companion/extension/dist-firefox/manifest.json`
3. Extension id is fixed at **`battle-standard-save@dev`** (matches native host registration). Requires **Firefox 140+** (AMO data collection consent).
4. **Reload the add-on after every Firefox restart** (temporary add-ons are removed on quit)

### Option B — Signed add-on (persists across restarts)

1. `npm run companion:extension:build:firefox` → creates `companion/extension/dist-firefox.zip`
2. Create a [Mozilla Add-on Developer](https://addons.mozilla.org/developers/) account
3. **Submit a New Add-on** → upload the zip → choose **On your own** (self-distribution) or listed
4. When asked **“Do you need to submit source code?”** → **Yes** (the build uses **esbuild** to bundle TypeScript). Upload `companion/extension/dist-firefox-source.zip` from `npm run package:amo-source --prefix companion/extension`. Reviewer notes can point to `README.md` in the source archive.
5. After review, download the **signed `.xpi`** from the developer hub, or install the published build: [Firefox extension v0.1.0](https://addons.mozilla.org/firefox/downloads/file/4873162/c499cfaf782b48d1996b-0.1.0.xpi)
6. `about:addons` → gear → **Install Add-on From File…** → pick the signed `.xpi` (skip if installed from the link above)
7. Native host is already registered for `battle-standard-save@dev` — no re-register needed

### Option C — Use Chrome or Edge for local dev

Unsigned unpacked extensions work without signing:

```bash
npm run companion:extension:build
# chrome://extensions → Load unpacked → companion/extension/dist
.\companion\install\register-windows.ps1 -ExtensionId YOUR_32_CHAR_ID
```

## Dev vs production paths

| Component | Dev | Production (tray) |
|-----------|-----|-------------------|
| Native host | `companion/host/dist/main.js` via `npm run companion:host` | `companion/tray/resources/host/main.js` |
| Host launcher | `companion/host/scripts/run-host.cmd` + `--dev-launcher` | `companion/tray/resources/host/run-host.cmd` |
| Save folder config | `%AppData%/BattleStandard/config.json` (same) | same |
| Extension | `companion/extension/dist` (unpacked) | same until Web Store |

Register with dev host:

```powershell
.\companion\install\register-windows.ps1 -ExtensionId YOUR_ID -DevLauncher
```

Dry-run (validate manifest, no registry writes):

```bash
npx tsx companion/install/register-cli.ts --dry-run --extension-id YOUR_ID
```

## Architecture

```text
Website (src/lib/companion/)
    │  postMessage { source: 'battle-standard-companion' }
    ▼
Extension (companion/extension/)
    │  chrome.runtime.connectNative
    ▼
Native host (tray-bundled resources/host/ or dev companion/host/)
    │  fs — same layout as src/lib/stableStorage/
    ▼
User save folder
```

Tray app writes config and bundles the host. GM multiplayer edits debounce to disk (~1.5s) via `scheduleStableMirror` → companion when ready.

## Layout

| Path | Purpose |
|------|---------|
| [`shared/`](shared/) | Config, disk layout, asset naming |
| [`protocol/`](protocol/) | v2 chunked native messaging |
| [`extension/`](extension/) | MV3 bridge |
| [`host/`](host/) | Native host (Node stdio) |
| [`tray/`](tray/) | Electron systray + bundled host |
| [`install/`](install/) | Cross-platform register scripts |
| [`../src/lib/companion/`](../src/lib/companion/) | Website bridge + storage router |

## On-disk format

```text
{saveFolder}/
  battle-map-storage.json
  global/token-library.json + global/assets/
  campaigns/{id}/campaign.json + campaigns/{id}/assets/
```

## npm scripts

| Script | Purpose |
|--------|---------|
| `npm run test:companion` | All companion automated tests |
| `npm run companion:tray:build` | Build host + tray |
| `npm run companion:tray:start` | Launch systray |
| `npm run companion:extension:build` | Build extension |
| `npm run test:companion-install` | Validate register scripts |

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Extension detected, host not connected | Re-run register script; reload page. Firefox: reload temp add-on at `about:debugging` after restart |
| Firefox “add-on could not be verified” | Release Firefox requires signed add-ons — use temp add-on, AMO signing, or Chrome/Edge for dev |
| Unpacked extension ID changed | Re-register with new ID (dev only) |
| Save folder not shown on website | Tray → Choose save folder; check `%AppData%/BattleStandard/config.json` |
| `Native host timeout` | Host not running — Chrome spawns launcher on each message; verify `run-host.cmd` path in manifest |
| Node not found (host) | Install Node.js or set `BATTLE_STANDARD_ELECTRON_NODE` to Electron.exe in launcher |
| FS Access + Save Helper different folders | Home → divergent folder warning → Match browser folder |
| Large map save fails | Protocol v2 chunks assets; update extension + host together |

## Manual E2E sign-off matrix

Check off when validated on your machine:

### Browser × scenario

| Scenario | Chrome | Firefox | Edge |
|----------|:------:|:-------:|:----:|
| Tray pick folder → save campaign → reload | ☐ | ☐ | ☐ |
| Clear site data → Sync from folder | ☐ | ☐ | ☐ |
| Large map image (>1MB) chunked save | ☐ | ☐ | ☐ |
| GM session → player token → disk after debounce | ☐ | ☐ | ☐ |
| GM disconnect flush | ☐ | ☐ | ☐ |
| FS Access + companion divergent warning | ☐ | ☐ | ☐ |

### Platform × tray

| OS | Tray folder picker | Host registered | Save/load |
|----|:------------------:|:-------------:|:---------:|
| Windows | ☐ | ☐ | ☐ |
| macOS | ☐ | ☐ | ☐ |
| Linux | ☐ | ☐ | ☐ |

## Security

- Messages require `source: 'battle-standard-companion'`
- Extension `matches` / `externally_connectable` limited to deployed origins
- Native host `allowed_origins` / `allowed_extensions` must list only your extension ID
- Host only reads/writes the configured save folder layout — not arbitrary paths from the page

## Out of scope (v1)

Chrome Web Store listing, signed installers, auto-update, macOS notarization, incremental load for 100+ assets.
