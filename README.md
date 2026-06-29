# Battle Standard

Scene-deck VTT tracker for D&D 5e — grid, tokens, fog, ruler, and optional **Save Helper** for disk backups.

## Local development

```bash
npm install
npm run dev
```

Open http://localhost:5173 (or `npm run dev:host` for LAN access).

## Save Helper (optional)

Save campaigns to a folder on your computer via extension + native host + tray app. See **[companion/README.md](companion/README.md)** for install steps, troubleshooting, and E2E checklist.

Quick start:

```bash
npm run companion:tray:build
npm run companion:extension:build
npm run companion:tray:start
```

Run all companion tests:

```bash
npm run test:companion
```

## Publish to GitHub Pages

This repo deploys automatically to GitHub Pages when you push to `main` or `master`.

**Live URL:** `https://<your-github-username>.github.io/battle-standard/`

### One-time setup

1. Create a GitHub repository named **`battle-standard`** (must match [`site.config.ts`](site.config.ts) exactly, including case).
2. Push this project to the repo:

   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/<your-github-username>/battle-standard.git
   git push -u origin main
   ```

3. On GitHub, open **Settings → Pages** and set **Build and deployment → Source** to **GitHub Actions**.

The [deploy workflow](.github/workflows/deploy.yml) builds with `VITE_BASE_PATH=/battle-standard/` and publishes the `dist` folder.

### Different repo name

If your GitHub repo slug is not `battle-standard`, update both:

- `SITE_SLUG` in [`site.config.ts`](site.config.ts)
- `VITE_BASE_PATH` in [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)

Then push again; the workflow will redeploy.
