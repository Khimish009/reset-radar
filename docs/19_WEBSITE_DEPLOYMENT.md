# 19 — GitHub Pages website deployment (implementation guide)

**Prerequisite:** Worker `/api/v1/{events,status,stats}` is actually accessible in approved staging/prod and CORS tested. Site must never contain credentials. Owner confirms GitHub repo URL and permission.

## Repository layout

```text
reset-radar/
  AGENTS.md
  docs/
  src/                    # Workers backend
  migrations/
  tests/
  website/
    package.json
    index.html
    vite.config.ts
    src/
    public/
  .github/workflows/
    ci.yml
    deploy-pages.yml
    # Worker deploy separate and approved later
```

## Vite config and Pages path

For repository `<GITHUB_USERNAME>/reset-radar`, default Pages URL is `https://<GITHUB_USERNAME>.github.io/reset-radar/`. Vite needs `base: '/reset-radar/'` so built assets load under the project path. If later deploying at a custom domain root, review base accordingly.

`VITE_PUBLIC_API_BASE_URL` contains **only** the nonsecret Worker public URL, e.g. `https://<REAL-WORKER>.workers.dev`; it is embedded into the browser bundle. **Do not put tokens in Vite env vars.** Use actual environment value only once owner has deployed Worker.

The site is a static app: fetch read-only API on browser load, with cache and a visible freshness indicator. Do not pull community feeds directly into browser, including client-side fallback. For unsupported Paths/refresh, prefer one-page layout with native anchors/query params or hash navigation rather than server-side history routing that GitHub Pages won't rewrite.

## Actions and permissions

- Add CI for frontend install/build/test on PR; PR CI must not deploy.
- Deploy site from approved `main` commit via GitHub Actions to Pages artifact. Workflow needs standard Pages permissions; configure repository **Settings → Pages → Build and deployment → GitHub Actions** manually.
- Protect production publishing: no Worker bot auto-deploy in Pages workflow. Site static deploy does not require bot token.
- First Pages deploy requires explicit owner approval; after stable site, optionally choose whether merging `website/**` should auto-deploy static assets (record ADR).

## CORS and API policy

Worker API must allow actual Pages origin `https://<GITHUB_USERNAME>.github.io` (origin excludes `/reset-radar/` path), and optional owner-approved custom domain. Handle OPTIONS and `Vary: Origin` appropriately. Never use `Access-Control-Allow-Origin:*` for a design assuming origin-based privacy; APIs are public either way. No public POST endpoint with private effect. Test from browser developer tools, not curl alone.

## Production checklist

- [ ] Repo publicly visible; static pages allowed by plan and policy.
- [ ] Real Pages URL and Telegram channel handle verified; all outward links valid.
- [ ] API accessible and public read-only, from D1; CORS verified.
- [ ] `vite build` output under correct `base` path, asset 200 responses and mobile load.
- [ ] Graph values match API responses; labels disclose incomplete coverage.
- [ ] RU and EN both readable, accessible states; no dead bot CTA.
- [ ] robots, static title/meta, OG image, sitemap with real URL, favicon.
- [ ] Page source bundle and repository have no secrets; third-party attribution and brand disclaimers present.
- [ ] 404 refresh addressed by no-history routing or tested fallback; API outage works gracefully.
- [ ] README and Telegram pinned message updated with **real** site URL only after live verification.

## Potential future migration

If GitHub Pages limitations conflict with future dynamic user accounts/commerce, static frontend could be moved to Cloudflare Pages or Workers. Not needed for MVP. Public API remains on Worker.
