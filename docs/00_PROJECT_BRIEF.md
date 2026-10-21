# 00 — Project brief: Reset Radar | AI Limits

## One-sentence mission

**Публичные события о сбросах и бонусных квотах AI-кодинг-инструментов, объяснённые точно и доступные как уведомления в Telegram и как проверяемая история на сайте.**

### Target audience & value

Разработчики, использующие Claude Code и OpenAI Codex, хотят не пропускать общие дополнительные сбросы, знать, что *анонсировано*, что *подтверждённо применилось*, какие бонусы/ограничения актуальны, и понимать историю изменений. Не хотят проверять несколько трекеров вручную.

## Three user-facing surfaces

1. **Telegram channel (`Reset Radar | AI Limits`)**: короткие уведомления о важных проверенных событиях, с оригинальным источником и ссылкой на сайт для контекста.
2. **Public website**: статическая оболочка на GitHub Pages; живые данные — **только** из нашего read-only Worker API. Landing, последние события, история с фильтрами, 2–3 фактические метрики и простые графики, методология и прозрачные предупреждения о свежести данных.
3. **GitHub `reset-radar`**: открытый код, архитектура, changelog/Issues/PR, ссылки на канал и сайт. Бот `Reset Radar | Alerts` сначала **только администратор-публикатор** канала; личный чат позже.

## Branding

- Предложенные handles: `@resetradarai` и `@resetradaraibot`; проверить владельцем. Название канала/бота можно менять без смены handle.
- Тёмный navy, cyan/orange radar identity. Парные, но различающиеся аватары `brand/`.
- Независимый проект, не связан с Anthropic/OpenAI и независимыми трекерами. Не использовать их официальные логотипы в качестве наших.
- Русский — канал и первичный текст; сайт — RU/EN с одинаковыми фактическими данными.

## MVP scope (two providers)

- Community public reset events for Claude Code and Codex, with separate validated adapters and recorded provenance.
- Event categories: evidence-backed applied reset, announced future reset, banked/redeemable offer, verified material policy change, correction/retraction, ambiguous/unverified **not public by default**.
- Ingestion every ~5 min; history stored in D1; truthful read-only API; channel posts; website dashboard.
- Historic seeded data may seed website history with transparent *coverage*; never flood Telegram at initial import.

## Not in MVP

Personal quotas, personal API tokens/cookies, forecasts as alerts, subscriber accounts, user preferences, DM push, payments, Cursor/Gemini/Copilot, social-media scraping, admin dashboard, complicated frameworks.

## Product quality before marketing

- No false claim of personal/reset delivery; no duplicate/flood on bootstrap.
- Tests and staging pass; production deploy and Telegram publication **separately approved**.
- Site shows last successful synchronization, upstream caveats and clear empty/stale/error states.
- User can filter sources and see why a card was categorized as it was.
- Availability/cost are monitored; initial architecture targets free tiers, no hard guarantee.

## Launch and distribution

After functional end-to-end testing: pinned introduction in channel, link in bot profile to channel, link on website to channel and GitHub, links from README to both. Community launch, partnerships with tracker authors and measured paid promotion **only** after real signal quality; no spam. See `docs/15_GROWTH_PLAN.md`.
