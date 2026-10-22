# Stage 5 Telegram template previews

**All examples below are SYNTHETIC.** They use reserved `example.invalid` evidence
links and do not describe real provider events. They are render previews only;
no Telegram request or send was made.

Each positive render includes the reviewed primary evidence, fixed tracker
attribution, and the independent-project disclaimer. Internal IDs, assessment
rationale, raw feed text, and previous Telegram post links are omitted.

## Announced future reset

### Claude — exact target

```text
📣 [CLAUDE] Анонсирован предстоящий сброс

Когда: 2026-10-25T14:30:00Z (UTC)
Кому: synthetic subscribers
Какие лимиты: пятичасовое окно, недельный лимит

Это анонс, а не подтверждение применения; фактическое обновление может отличаться.

Первоисточник: https://example.invalid/source/synthetic-primary
Данные трекера: https://clauderesets.com/
Независимая сводка Reset Radar; проект не связан с провайдером.
```

### Codex — date-only target

```text
📣 [CODEX] Анонсирован предстоящий сброс

Когда: 2026-10-25
Кому: synthetic subscribers

Это анонс, а не подтверждение применения; фактическое обновление может отличаться.

Первоисточник: https://example.invalid/source/synthetic-primary
Данные трекера: https://codexreset.ai/
Независимая сводка Reset Radar; проект не связан с провайдером.
```

### Codex — unknown target

```text
📣 [CODEX] Анонсирован предстоящий сброс

Когда: дата и время источником не указаны
Кому: synthetic subscribers

Это анонс, а не подтверждение применения; фактическое обновление может отличаться.

Первоисточник: https://example.invalid/source/synthetic-primary
Данные трекера: https://codexreset.ai/
Независимая сводка Reset Radar; проект не связан с провайдером.
```

## Confirmed applied

### Claude — source-reported delivery/confirmation time unknown

```text
✅ [CLAUDE] Подтверждено применение сброса лимитов

Кому: synthetic subscribers
Какие лимиты: пятичасовое окно, недельный лимит
Время доставки/подтверждения по данным источника: дата и время источником не указаны.

Проверьте актуальные лимиты в своём аккаунте.

Первоисточник: https://example.invalid/source/synthetic-primary
Данные трекера: https://clauderesets.com/
Независимая сводка Reset Radar; проект не связан с провайдером.
```

### Codex — verified exact time

```text
✅ [CODEX] Подтверждено применение сброса лимитов

Кому: synthetic subscribers
Время доставки/подтверждения по данным источника: 2026-10-20T12:00:00Z (UTC).

Проверьте актуальные лимиты в своём аккаунте.

Первоисточник: https://example.invalid/source/synthetic-primary
Данные трекера: https://codexreset.ai/
Независимая сводка Reset Radar; проект не связан с провайдером.
```

## Banked offer

### Claude — date-only expiry

```text
🎁 [CLAUDE] Предложение дополнительного сброса

Кому: synthetic subscribers
Какие лимиты: пятичасовое окно, недельный лимит
Срок предложения: 2026-11-02.
Это предложение, а не подтверждение сброса или текущей доступности. Условия и необходимость действия проверьте в аккаунте.

Первоисточник: https://example.invalid/source/synthetic-primary
Данные трекера: https://clauderesets.com/
Независимая сводка Reset Radar; проект не связан с провайдером.
```

### Codex — expiry not stated

```text
🎁 [CODEX] Предложение дополнительного сброса

Кому: synthetic subscribers
Срок предложения: источником не указан.
Это предложение, а не подтверждение сброса или текущей доступности. Условия и необходимость действия проверьте в аккаунте.

Первоисточник: https://example.invalid/source/synthetic-primary
Данные трекера: https://codexreset.ai/
Независимая сводка Reset Radar; проект не связан с провайдером.
```

## Correction and withdrawal

These lineage cases are synthetic renderer fixtures. The current Codex upstream
normalizer does not accept correction or withdrawal assessments; any future
publisher must still enforce its own source and transition eligibility gates.

The expiry correction below is renderer-only synthetic evidence. Stage 4's
Claude normalizer currently changes a reviewed `credit` correction with a
non-null `reset_offer` to `needs_review`, so the publisher must reject that
current normalized payload. If normalization later accepts such a transition,
the renderer reports only the validated date:

```text
Срок предложения: 2026-11-03.
```

The renderer never adds an hour, timezone, activation instruction, or claim of
current availability to this correction.

### Claude — correction with changed expected date

```text
⚠️ [CLAUDE] Исправление сведений о событии

Ожидаемое время: 2026-10-25.
Кому: synthetic subscribers
Какие лимиты: пятичасовое окно, недельный лимит

Первоисточник: https://example.invalid/source/synthetic-primary
Данные трекера: https://clauderesets.com/
Независимая сводка Reset Radar; проект не связан с провайдером.
```

### Codex — correction with changed expected date

```text
⚠️ [CODEX] Исправление сведений о событии

Ожидаемое время: 2026-10-25.
Кому: synthetic subscribers

Первоисточник: https://example.invalid/source/synthetic-primary
Данные трекера: https://codexreset.ai/
Независимая сводка Reset Radar; проект не связан с провайдером.
```

### Claude — withdrawal

```text
⚠️ [CLAUDE] Источник отозвал сведения о событии

Это сообщение подтверждает отзыв сведений источником; оно не утверждает, что прежняя публикация была в Telegram.
Кому: synthetic subscribers
Какие лимиты: пятичасовое окно, недельный лимит

Первоисточник: https://example.invalid/source/synthetic-primary
Данные трекера: https://clauderesets.com/
Независимая сводка Reset Radar; проект не связан с провайдером.
```

### Codex — withdrawal

```text
⚠️ [CODEX] Источник отозвал сведения о событии

Это сообщение подтверждает отзыв сведений источником; оно не утверждает, что прежняя публикация была в Telegram.
Кому: synthetic subscribers

Первоисточник: https://example.invalid/source/synthetic-primary
Данные трекера: https://codexreset.ai/
Независимая сводка Reset Radar; проект не связан с провайдером.
```

## Eligibility examples rejected by renderer

The renderer returns a safe rejection for `needs_review`, a seeded event, a
stale/missing raw-key match, a non-empty review reason, action/assertion mismatch,
missing correction/withdrawal lineage, unsafe URL/text, malformed Unicode, or a
message over Telegram's 4096 UTF-16 code-unit limit. It never truncates a fact.
