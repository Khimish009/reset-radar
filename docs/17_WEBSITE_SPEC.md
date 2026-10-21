# 17 — Website: UI, content, design and UX contract

## Purpose and technology

One **public** site within the existing repo, hosted on GitHub Pages. Build only after Worker read-only API is ready. **Vite + TypeScript + vanilla CSS**, static files only, no SSR/server required and no React unless specifically approved. The browser fetches our API; never third-party tracker APIs. Backend/DB/Telegram remain on Cloudflare.

## Information architecture (one-page dashboard MVP)

```text
Reset Radar
├── Hero: "Never miss an AI limit reset" / RU translation
│   ├── Primary CTA → verified Telegram channel
│   └── Secondary CTA → GitHub repository
├── Provider status: Claude Code, Codex (latest event + source freshness)
├── Latest observed events with filters (provider/type/date)
│   └── Read more: original announcement + upstream tracker
├── Analytics (observed count + monthly chart + coverage caveat)
├── What is tracked: announced != confirmed != bonus offer
├── Methodology / upstream links / independent disclaimer
└── Footer: Telegram, GitHub, optional bot when functional
```

### Main capabilities

1. **Overview cards** per provider: latest verified event (or “No verified event”), last successful sync timestamp, badge/status `current` or `data outdated`. Stale threshold from API, not browser guesses.
2. **Event feed** newest-first with clear status/type label (announcement, confirmed application, offer, correction), timestamps with **precision-aware** display, applicable plans, evidence URLs. Source attribution always reachable.
3. **Interactive filters**: all/Claude/Codex, event type, period (e.g. 30d/90d/all within known coverage) and “load more” using Worker API pagination. URL search params optional; no external routing requirement.
4. **Analytics**: observed confirmed count, last observed event, monthly breakdown and one accessible chart (SVG/Canvas or a small package only if proven necessary). Counts are sourced from `/stats`, not computed from truncated first page of events.
5. **Language toggle**: RU and EN strings; avoid machine-translating unverified claims. Choose initial language via navigator or RU default by owner; persist optional non-sensitive preference.
6. **Transparency**: visible last success per provider, historical data coverage/caveats, method definitions, no false “live current personal quota”. Site must remain readable on outage.
7. **Links**: confirmed working Telegram channel CTA, GitHub repo, sources. Bot private chat link not primary until `/start` works.

## User experience states

- First load: lightweight skeleton with real pending state, no invented number 0 until API confirms.
- No events after filter: explain why list is empty and reset filters.
- One source stale: indicate exactly which source, retain previously verified history; other source keeps working.
- Network error: show error and retry button. If in-memory previous successful fetch exists, show it with timestamp and stale warning; no unsourced fabricated records.
- No backend yet during local design: explicitly marked **demo/mock** data only in local dev; never ship synthetic live stats to production.
- Time: UTC API timestamps rendered local plus UTC tooltip/title. Date-only expiry displayed as date, without countdown to invented hour.

## Brand & accessibility

- Palette from `docs/14_BRAND_AND_TELEGRAM_PROFILES.md`: navy `#061226`, cyan `#19C9FF`, amber `#FFAC25`; independently branded radar motif and supplied avatars.
- Typography: system UI for body; no font downloads necessary. Simple readable sizing; whitespace; mobile-first down to ~320px; high contrast and not relying on color alone for event states.
- Use semantic HTML/ARIA only when needed; keyboard-focus visible; buttons and filters reachable; chart has accessible textual summary/table; respect `prefers-reduced-motion`.
- Avoid massive animation, excessive glows, 3D dependencies, external trackers and blocking libraries.

## SEO and indexing

- Static `title`, `description`, canonical URL **after actual deployment**, OG/Twitter metadata, branded static OG image, favicon, robots and sitemap, `lang`/language navigation hints.
- GitHub Pages serves a static HTML shell; JS-fetched timeline **may not be indexed reliably**. Initial SEO targets introductory/educational static copy and verified links, not guaranteed indexing of dynamic event details.
- Future improvement: approved static prebuild of public event summary (through own API, no sensitive credentials) if crawler indexing of event pages becomes a priority. Not MVP.

## Example top-level labels

RU: «Claude Code и Codex: публичные сбросы лимитов», «Анонсировано», «Подтверждено», «Дополнительный сброс», «Последняя успешная проверка», «По зафиксированным событиям», «Данные могут обновляться с задержкой».

EN: “Public reset alerts for Claude Code and Codex”, “Announced”, “Confirmed delivered”, “Bonus reset offer”, “Last successful sync”, “Observed events”, “Source data may be delayed”.

See `docs/21_LEGAL_AND_LICENSE.md` for copyright/vendor mentions and privacy.
