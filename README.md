# Battle Standard

Scene-deck VTT tracker for D&D 5e.

## Local development

```bash
npm install
npm run dev
```

Open http://localhost:5173 (or use `npm run dev -- --host` for LAN access).

## Publish to GitHub Pages

This repo deploys automatically to GitHub Pages when you push to `main` or `master`.

**Live URL:** `https://<your-github-username>.github.io/Battle-Standard/`

### One-time setup

1. Create a GitHub repository named **`Battle-Standard`** (must match [`site.config.ts`](site.config.ts)).
2. Push this project to the repo:

   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/<your-github-username>/Battle-Standard.git
   git push -u origin main
   ```

3. On GitHub, open **Settings → Pages** and set **Build and deployment → Source** to **GitHub Actions**.

The [deploy workflow](.github/workflows/deploy.yml) builds with `VITE_BASE_PATH=/Battle-Standard/` and publishes the `dist` folder.

### Different repo name

If your GitHub repo slug is not `Battle-Standard`, update both:

- `SITE_SLUG` in [`site.config.ts`](site.config.ts)
- `VITE_BASE_PATH` in [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)

Then push again; the workflow will redeploy.
