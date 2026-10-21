# 14 — Brand, Telegram profiles and crosslinks

## Names and assets

- Public Telegram channel title: **Reset Radar | AI Limits**; proposed username `@resetradarai` (owner verification needed).
- Bot display title: **Reset Radar | Alerts**; proposed username `@resetradaraibot` (owner verification needed, bot username may be hard to change).
- GitHub repository: `reset-radar` (owner to provide actual URL).
- Public website: GitHub Pages `https://<GITHUB_USERNAME>.github.io/reset-radar/` **after** website publication; not a live link until verified.
- Avatars: `brand/channel-avatar.png` (neon radar) and `brand/bot-avatar.png` (radar + notification robot). Related but not identical, no vendor logos.

## Telegram channel About (short: owner must verify Telegram's exact character limit)

```text
⚡ Reset Radar — сбросы лимитов Claude Code, Codex и других AI-инструментов.

🔔 Бонусные квоты, анонсы и важные изменения. Ссылки на источники.

🤖 Бот: @resetradaraibot

Независимый проект, не связанный с Anthropic или OpenAI.
```

Do not insert website URL in this limited About field if it makes the text exceed the cap. Put the website link in a **pinned post** once the site is live, or replace some description copy after measuring characters. Channel→bot link is fine, but avoid promoting private messaging before `/start` works.

## BotFather About (short)

```text
🤖 Бот Reset Radar. Уведомления о сбросах Claude и Codex: @resetradarai
```

## BotFather Description (full; claims match MVP status)

```text
⚡ Reset Radar — публичные уведомления о сбросах лимитов Claude Code и Codex.

Это технический бот, который публикует анонсы и подтверждённые события в канале:

📢 @resetradarai

Независимый проект, не связанный с Anthropic или OpenAI.
```

## Pinned channel post (add website only after release)

```text
📡 Добро пожаловать в Reset Radar!

Следим за публичными сбросами лимитов Claude Code и Codex, бонусными предложениями и важными изменениями.

📣 Анонс = ещё не факт применения.
✅ Подтверждено = есть проверяемое свидетельство.
🎁 Бонус может требовать отдельной активации.

Мы НЕ видим лимиты вашего аккаунта и не можем гарантировать, что сброс пришёл каждому. Всегда указываем источники.

🌐 История и аналитика: {VERIFIED_WEBSITE_URL_WHEN_LIVE}
🤖 Бот проекта: @resetradaraibot
💻 Код: {VERIFIED_GITHUB_URL}

Reset Radar — независимый проект, не связанный с Anthropic или OpenAI.
```

## Link policy

- Channel: pinned post → site and code (once live); short About may link bot.
- Bot: About/Description → channel; if optional `/start` exists, return channel URL + working site URL.
- Website: primary CTA **Join Telegram Channel**; secondary **GitHub**; bot link only after `/start` is functional (can show “technical bot” label, not false CTA).
- GitHub README: Telegram + site links after live confirmation; PR/Issues links when enabled.

Brand palette: navy `#061226`, cyan `#19C9FF`, amber `#FFAC25`, blue `#0088FF`; accessibility contrast is mandatory.
