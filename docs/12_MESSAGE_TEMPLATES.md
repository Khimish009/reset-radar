# 12 — Messages and truth-preserving templates

All texts here are **examples**, not live announcements. The posts are in Russian, compact, with `[CLAUDE]` or `[CODEX]` for instant recognition. Use real runtime values and quote only verified facts. Escape source data if HTML formatting is used.

## A — Applied reset only when supported by evidence

```text
✅ [CODEX] Подтверждена доставка сброса лимитов

Кому: {VERIFIED_SCOPE}
Подтверждено: {DELIVERED_AT_OR_SOURCE_DATE}
Примечание: применение могло происходить поэтапно.

Первоисточник: {ORIGINAL_URL}
Данные: https://codexreset.ai/
```

For Codex require explicitly verifiable delivery evidence (`delivered_at` + corroborating source). `kind=regular` alone is NOT sufficient.

```text
✅ [CLAUDE] Подтверждён сброс лимитов

Какие: {VERIFIED_WINDOW}
Кому: {VERIFIED_ELIGIBILITY}
Дата объявления: {ANNOUNCED_DATE_OR_TIME}

Проверьте актуальные лимиты в своём аккаунте.
Первоисточник: {ORIGINAL_URL}
Данные: https://clauderesets.com/
```

Use only Claude confirmed, applied `usage_reset` with evidence. Don't overstate audience.

## B — Future *announced* reset, not yet confirmed

```text
📣 [CODEX] Анонсирован предстоящий сброс

Когда: {EXACT_TIME_OR_DATE_OR_UNKNOWN}
Кому: {VERIFIED_SCOPE}

⚠️ Это анонс, а не подтверждение, что лимиты уже обновились.
Первоисточник: {ORIGINAL_URL}
Данные: https://codexreset.ai/
```

For Codex only `scheduled.certainty=announced` and reliable source evidence. `hinted` is NO public event.

## C — Banked / redeemable credit

```text
🎁 [CLAUDE] Дополнительный сброс лимитов

Кому: {VERIFIED_ELIGIBILITY}
Активировать до: {DATE_OR_NOT_SPECIFIED}
Нужно ли действие: {VERIFIED_INSTRUCTIONS_OR_UNCLEAR}

Это предложение, а не подтверждение автоматического сброса вашего аккаунта.
Первоисточник: {ORIGINAL_URL}
Данные: https://clauderesets.com/
```

For Codex adapt tag and data URL. Do not say “активировать” if mechanics are not verified; say “получателям может быть доступен дополнительный сброс — проверьте аккаунт”. No invented expiry time or timezone.

## D — Corrections

```text
⚠️ [CLAUDE] Уточнение к предыдущему сообщению

{SPECIFIC_VERIFIED_CORRECTION}
Предыдущий пост: {TELEGRAM_URL_IF_EXISTS}
Источник: {ORIGINAL_URL}
Данные: https://clauderesets.com/
```

No correction on mere disappearance of source from ordinary feed. Owner review if ambiguous.

## Editorial rules

- `announced_at` is time of announcement, not delivery; `delivered_at=null` means unknown.
- `time_precision=date` => date only, do not invent hour. Banked `expires_on` date does not imply time zone.
- `scope=all` requires source backing; if scope unknown say so or do not auto publish.
- Provide both primary announcement and aggregator/source credit in channel posts, plus disclaimer in bio.
- Don't use LLM to rewrite factual notices during MVP. No blind automatic posts on third-party social rumors.

## Website crosslinks (after live launch)

- Optional final line on an event post: `📊 История и источники: {VERIFIED_WEBSITE_URL}`; link only after live, owner-verified Pages deployment, and only when factually relevant.
- Never sacrifice **original source + tracker attribution** to make room for a link to our website.
- Channel pinned post must point to the live dashboard and GitHub after owner verification. Bot About/Description points back to channel even before private-chat code exists.
- Public website can show a permanent original announcement URL and upstream tracker link for every event, including historical ones without a Telegram post.
