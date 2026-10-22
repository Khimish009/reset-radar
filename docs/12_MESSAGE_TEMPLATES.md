# 12 — Messages and truth-preserving templates

The renderer in `src/telegram/templates.ts` produces unformatted Russian plain text for local previews/simulation. It emits no message for `needs_review`, hinted, seeded or evidence-incomplete records. The examples below describe that local renderer and are **not live announcements**. Each accepted message includes the original evidence URL, provider tracker attribution and an independence disclaimer. Input URLs/text are validated; the renderer rejects unsafe or overlong output instead of truncating facts.

## A — Applied reset only when supported by evidence

```text
✅ [CODEX] Подтверждено применение сброса лимитов

Кому: {VERIFIED_SCOPE}
Время доставки/подтверждения по данным источника: {VERIFIED_SOURCE_REPORTED_DELIVERY_TIME_UTC}
Проверьте актуальные лимиты в своём аккаунте.

Первоисточник: {ORIGINAL_URL}
Данные трекера: https://codexreset.ai/
Независимая сводка Reset Radar; проект не связан с провайдером.
```

Codex requires reviewed corroborating delivery evidence matching the raw `delivered_at`; `kind=regular` alone is not sufficient. The same verified evidence gate applies to other provider actions.

```text
✅ [CLAUDE] Подтверждено применение сброса лимитов

Кому: {VERIFIED_SCOPE_OR_SOURCE_UNSPECIFIED}
Какие лимиты: {VERIFIED_WINDOW_IF_PRESENT}
Время доставки/подтверждения по данным источника: {SOURCE_REPORTED_TIME_OR_EXPLICITLY_UNKNOWN}

Проверьте актуальные лимиты в своём аккаунте.
Первоисточник: {ORIGINAL_URL}
Данные трекера: https://clauderesets.com/
Независимая сводка Reset Radar; проект не связан с провайдером.
```

For Claude the renderer accepts only evidence-backed confirmed `usage_reset` with subscription usage allocation. The timestamp line is explicitly source-reported delivery/confirmation time; it does not claim the precise moment each account's quota changed. If that time is unknown, the template says so explicitly. Announcement, source-reported delivery/confirmation, effective time, and local detection time remain separate; announcement or detection time is never substituted for delivery or effective time. A window line appears only when the accepted record contains a supported window.

## B — Future *announced* reset, not yet confirmed

```text
📣 [CODEX] Анонсирован предстоящий сброс

Когда: {EXACT_TIME_OR_DATE_OR_UNKNOWN}
Кому: {VERIFIED_SCOPE}

Это анонс, а не подтверждение применения; фактическое обновление может отличаться.
Первоисточник: {ORIGINAL_URL}
Данные трекера: https://codexreset.ai/
Независимая сводка Reset Radar; проект не связан с провайдером.
```

For Codex, require a current, explicit announcement and reviewed source evidence. `scheduled.certainty=hinted` is never a confirmed announcement. If the source gives no target time, render `Когда: дата и время источником не указаны.`; if it gives only a date, show only that date. The current `scheduled` contract requires a day, so an unknown-time announcement can only be represented from a separately reviewed `regular` row with `delivered_at=null`; do not invent a nullable scheduled day.

The local renderer supports a reviewed early announcement before delivery, including unknown expected time. Local publisher eligibility additionally checks current immutable transition and freshness inputs. Whether production should publish this or any other action, and which freshness thresholds apply, remain pending production policy decisions.

## C — Banked / redeemable credit

```text
🎁 [CLAUDE] Предложение дополнительного сброса

Кому: {VERIFIED_SCOPE_OR_SOURCE_UNSPECIFIED}
Срок предложения: {DATE_OR_SOURCE_UNSPECIFIED}.

Это предложение, а не подтверждение сброса или текущей доступности. Условия и необходимость действия проверьте в аккаунте.
Первоисточник: {ORIGINAL_URL}
Данные трекера: https://clauderesets.com/
Независимая сводка Reset Radar; проект не связан с провайдером.
```

For Codex adapt the tag and tracker URL. The expiry is date-only when that is all the source supplies; no expiry time, timezone, activation step or current availability is inferred. The local publisher suppresses a date-only offer on its expiry UTC date.

## D — Corrections

```text
⚠️ [CLAUDE] Исправление сведений о событии

{VERIFIED_CHANGED_FACTS_OR_CURRENT_FACTS}
Кому: {VERIFIED_SCOPE_OR_SOURCE_UNSPECIFIED}
Первоисточник: {ORIGINAL_URL}
Данные трекера: https://clauderesets.com/
Независимая сводка Reset Radar; проект не связан с провайдером.
```

The local renderer requires an evidenced correction and the prior immutable version of the same upstream event. A missing source row does not create a correction. It does not invent a link to a previous Telegram post.

Changed supported expiry dates and canonical effective times are shown explicitly,
with their original precision. An effective time reported in a correction is
labelled as source-reported, not verified delivery. Unsupported changes or invalid
public facts are rejected rather than reduced to a generic correction. The current
normalizer conservatively leaves Claude credit/offer corrections in `needs_review`;
expiry-correction renderer fixtures do not override that guard.

```text
⚠️ [CODEX] Источник отозвал сведения о событии

Это сообщение подтверждает отзыв сведений источником; оно не утверждает, что прежняя публикация была в Telegram.
Кому: {VERIFIED_SCOPE_OR_SOURCE_UNSPECIFIED}
Первоисточник: {ORIGINAL_URL}
Данные трекера: https://codexreset.ai/
Независимая сводка Reset Radar; проект не связан с провайдером.
```

Withdrawal also requires an evidence-backed transition with its prior immutable version; disappearance from a feed is insufficient.

## Editorial rules

- `announced_at` is time of announcement, not delivery; `delivered_at=null` means unknown. A verified delivery/confirmation timestamp is source-reported and does not establish the exact time every account's quota became effective.
- Keep detection time, announcement time, source-reported delivery time, and effective time separate. `announced_future` never says limits have already arrived; `confirmed_applied` requires reviewed delivery evidence, and its timestamp label does not promise per-account application timing.
- `time_precision=date` => date only, do not invent hour. Banked `expires_on` date does not imply time zone.
- Unknown target time gets explicit unknown-time wording; never add a guessed date, timezone, countdown, or delivery statement.
- Audience comes from the accepted current record; when source did not specify it, the renderer says so. Rejected/stale review data cannot supply audience or URLs.
- Provide both primary announcement and aggregator/source credit in channel posts, plus disclaimer in bio.
- Don't use LLM to rewrite factual notices during MVP. No blind automatic posts on third-party social rumors.
- Corrections/withdrawals can refer to the same event's prior version, but no prior Telegram URL is shown because no real-delivery journal exists.
- Stage 5 previews and simulated outcomes are local artifacts. They do not establish that a real post was sent or authorize a production message.

## Website crosslinks (after live launch)

- Optional final line on an event post: `📊 История и источники: {VERIFIED_WEBSITE_URL}`; link only after live, owner-verified Pages deployment, and only when factually relevant.
- Never sacrifice **original source + tracker attribution** to make room for a link to our website.
- Channel pinned post must point to the live dashboard and GitHub after owner verification. Bot About/Description points back to channel even before private-chat code exists.
- Public website can show a permanent original announcement URL and upstream tracker link for every event, including historical ones without a Telegram post.
