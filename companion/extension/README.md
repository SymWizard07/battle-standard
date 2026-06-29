# Battle Standard Save Helper — source for Mozilla reviewers

This archive is the **human-readable source** for the Firefox add-on. The submitted
`.xpi` contains **bundled** JavaScript produced by the build script below.

## Requirements

| Item | Version |
|------|---------|
| **Operating system** | Ubuntu 24.04 LTS (reviewer default), or Windows / macOS / Linux |
| **Node.js** | 24.x recommended (AMO reviewers use **24.14.0**) — https://nodejs.org/ |
| **npm** | 11.x recommended (AMO reviewers use **11.9.0**) |

No other global tools are required. Dependencies install locally via `npm ci`.

Build tools used (installed by npm, open source):

- **esbuild** 0.25.x — bundles TypeScript (no minification)
- **TypeScript** 6.x — types only; esbuild transpiles

## Build (step-by-step)

Run from the **root of this archive** (where `manifest.json` and this README live):

```bash
npm ci
npm run build:firefox
```

## Verify output matches submitted add-on

After building:

```
dist-firefox/manifest.json
dist-firefox/background.js
dist-firefox/content.js
```

Zip **the contents** of `dist-firefox/` (not the folder itself) — that matches the
submitted `.xpi` layout. Use a ZIP tool with forward-slash paths (not PowerShell
`Compress-Archive`). This repo uses `tar -caf` via `scripts/zipDir.mjs`.

## Build script

`npm run build:firefox` → `node scripts/build.mjs --firefox`:

1. Bundles TypeScript from `src/` and `protocol/` with esbuild
2. Writes `dist-firefox/background.js` and `dist-firefox/content.js`
3. Injects Firefox fields into `dist-firefox/manifest.json`

## Source layout (archive root)

```
manifest.json
package.json
package-lock.json
README.md
src/                 Extension TypeScript (author-written)
scripts/             build.mjs, package-amo-source.mjs, zipDir.mjs
protocol/            Shared protocol TypeScript
site.config.ts       Optional; GitHub Pages URL for content matches
```

Submitted source is `.ts` only — not pre-bundled add-on JavaScript.

## Notes

- esbuild does not minify output.
- If `site.config.ts` is absent, build uses localhost dev URLs only.
