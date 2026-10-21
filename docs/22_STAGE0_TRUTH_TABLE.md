# 22 — Stage 0: правила классификации и маркированные примеры

**2026-10-21. Предложение для принятия владельцем.** Источники/HTTP: [04](04_EXTERNAL_APIS.md), [11](11_SOURCES.md). Ни одно правило не разрешает публикацию сейчас. Общие будущие gates: источник утверждён, полный baseline отдельно для provider, новая допустимая материальная transition, достаточное evidence, точные audience/precision, отсутствие stale/schema uncertainty, dry_run и отдельное разрешение публикации. Исторический baseline — **ноль Telegram-сообщений**, включая недавно датированные строки.

## Source → raw → normalized → eligibility

Порядок проверок важен: явный отзыв/исправление и неизвестная схема проверяются до обычного confirmed; banked не превращается в consumed reset из-за delivery timestamp. Истёкшее время не создаёт доказательство.

| Источник | Raw и необходимое evidence | Наше состояние | Будущая публичная eligibility после общих gates |
|---|---|---|---|
| Claude | usage_reset + confirmed; источник однозначно говорит о выполнении, provenance достаточна | confirmed_applied | История; push только новой transition. Exact announced_at остаётся временем поста; effective/delivered не выдумывать |
| Claude | announced, явный ещё актуальный будущий анонс с источником | announced_future | Отдельный анонс с оговоркой, не confirmed |
| Claude | announced, срок прошёл, evidence выполнения нет | needs_review | Нет автоматического push/confirmed metrics |
| Claude | credit/reset_offers, подтверждено предложение ручного redeem | banked_offer | Только предложение, audience и date-only expiry. Истёкший offer не показывать активным; expiry не является withdrawal/consumption |
| Claude | correction.kind=correction + содержательное проверяемое исправление | correction | Связать с прежним event/revision; для push нужно существенное изменение ранее опубликованного факта |
| Claude | cancelled/retracted или correction.kind=retraction с evidence | withdrawal | Сохранить историю; уточнить прежнюю публикацию, если была |
| Claude | limit_increase/policy_change/incident либо unknown kind/status/field | needs_review | Ручная оценка; не превращать любое confirmed в reset, не вводить новый enum без решения |
| CodexReset | regular, delivered_at и точный delivered_source_url; проверено явное подтверждение выполнения | confirmed_applied | Сохранять отдельно announced/delivered, область применения; это не проверка личного аккаунта |
| CodexReset | regular, delivered_at=null; нет отдельно проверенного доказательства | needs_review | Старый анонс не становится будущим или доставленным; delivery_reported_delay=false не подтверждает delivery |
| CodexReset | delivered_at заполнен, URL только главная/нет достаточного подтверждения | needs_review | Нет автоматической confirmation/push |
| CodexReset | banked независимо от delivered_at; evidence именно бонусного кредита | banked_offer | Начисление/предложение, не использование. Нет срока/механики — не придумывать |
| CodexReset | scheduled.certainty=announced, официальный актуальный будущий анонс проверен | announced_future | Date-only остаётся date-only, scheduled_for=null не заменяется полночью |
| CodexReset | scheduled.certainty=hinted, unknown certainty или просроченный анонс без confirmation | needs_review | Нет push и прогнозов как факта |
| CodexReset | edited/deleted row или scheduled исчез | Само по себе перехода нет | Хранить последнюю историю; только явное дополнительное evidence даёт correction/withdrawal |
| Codex Resets, альтернатива | regular + announced_at; source=observed или нет отдельного delivery evidence | needs_review | Не подключён; время наблюдения не delivery |
| Codex Resets, альтернатива | banked + достаточное evidence | banked_offer | Только после отдельного выбора источника/сопоставления, без fallback |
| Все | unknown fields/enums/schema_version, конфликт precision/evidence | needs_review либо отклонённый snapshot с сохранением кеша | Не принимать новые confirmed автоматически; записать безопасную диагностику |
| Все | 304/429/503/timeout, missing row/page | Не событие и не withdrawal | 304 сохраняет кеш, учитывает успешную проверку; ошибки не стирают историю. Для 304 нужен ранее валидный snapshot |

Для CodexReset correction/withdrawal — наши состояния, **не upstream enum**. Нужны проверяемое исправление/отзыв и связь с исходной записью. Строка не теряется при изменении feed. Известные schema fields допускаются с их проверенными значениями; неизвестное отправляется на review. Отказ одной upstream не должен останавливать другую.

## Stage 3 supplement — Codex early announcements (2026-10-21)

Эта отдельная таблица дополняет правила выбранного источника `codexreset.ai`. Она не меняет captured JSON, архивные evidence или снимки Stage 0. Приоритет владельца принят: сообщать о достоверном будущем анонсе сразу после обнаружения и проверки evidence, не ожидая фактической доставки лимитов. Production publication policy ниже остаётся предложением для отдельного решения.

| Сценарий | Данные и проверка Stage 3 | Наше состояние / время | Возможная публикация в будущем |
|---|---|---|---|
| Явный подтверждённый анонс с будущим точным временем или датой | `scheduled.certainty=announced` либо `regular` с null delivery и явно reviewed future target; точный URL записи и текущий `announced_at`; human review связывает assessment с точным raw содержимым и URL анонса. Для `scheduled` целевой день обязателен по upstream-схеме | `announced_future`; `announced_at` сохраняется отдельно; `expectedTime` сохраняет `exact` или `date`; `effective` остаётся unknown | Предложение: первый eligible notice после source review и будущих publication gates; дату не превращать в точный час/countdown |
| Подтверждённый анонс будущего сброса, но источник не сообщил дату/время | Upstream `scheduled` не может выразить отсутствие `day`, так как поле обязательно. Допустимый текущий путь — `regular` с `delivered_at=null`, явной проверенной ссылкой на анонс и matching human assessment, который подтверждает будущее обещание; `futureTarget` опущен/unknown | `announced_future`; `expectedTime=unknown`; `delivered=unknown`; `effective=unknown`. Не подставлять `date`, `ts` или полночь | Предложение: отдельная формулировка «дата и время источником не указаны»; не создавать countdown и не называть событие доставкой |
| Подтверждено фактическое предоставление лимитов | `kind=regular`; прошедший непустой `delivered_at`; точная непустая delivery URL не на главную страницу; matching human assessment assertion=`applied` | `confirmed_applied`; `announced_at` и `delivered_at` сохранены раздельно; `effective` остаётся unknown, поскольку время фактического применения конкретному аккаунту не установлено | Предложение: отдельная materially new transition, если Stage 4+ утвердит dedup/correction policy; не обещать exactly-once |
| Только `hinted`, forecast, rumor, несвязанный/просроченный или неподтверждённый источник | Включая `scheduled.certainty=hinted`, отсутствие assessment, homepage вместо первичного URL, stale assessment после изменения raw-полей или target не в будущем | `needs_review`; никаких confirmed-анонсов/доставки | Нет автоматической публикации |

Во всех случаях результат mapping отдельно несёт `detectedAt`, upstream/feed attribution, исходный source URL, evidence URLs, audience/scope и точность ожидаемого времени. Для scheduled audience остаётся unknown, если reviewer явно не указал проверенный scope; для regular сохраняется raw scope. Для seeded строк сохраняются `seeded` и `seed_archive` attribution. Assessment — ручная семантическая проверка: код привязывает её к точному содержимому строки и требует явный `primarySourceUrl`, evidence URLs и rationale, но сам не читает содержание страницы и не доказывает, что ссылка является первоисточником. Принятые URL и rationale сохраняются во внутреннем `reviewedEvidence`; stale/invalid assessments не переносят их в результат. Постоянной базы/журнала Stage 3 нет.

Подтверждённая владельцем цель раннего обнаружения не задаёт гарантию «мгновенно»: локальный adapter не подключён к Cron, D1 или Telegram. Предложение для будущей Telegram policy — первая публикация eligible future announcement после review независимо от delivery, с отдельным безопасным текстом для unknown time; baseline/seeded history не публиковать. Решения о конкретных eligibility gates, скорости, dedup, изменениях/отзывах и последующем сообщении `confirmed_applied` остаются на Stage 4+ и требуют отдельного утверждения.

## Captured fixtures — сокращённые проекции реального HTTP

JSON ниже — **captured**, поля только выбраны из оригиналов, значения не придуманы. Это постоянные примеры исследования, **не полные fixtures для schema/parser tests**: опущены editorial summary/title, excerpts и часть полей/массивов. Fixture metadata и check — наши пояснения. Полные raw временно под /tmp, hashes в журнале. Источник остаётся третьей стороной; присутствие URL не доказывает независимое прочтение первичного поста.

Дополнительные структурные проекции и заголовки сохранены в [архиве Stage 0](evidence/stage0-2026-10-21/README.md) для следующей сессии. Они также неполные; synthetic vectors ниже остаются искусственными примерами, не HTTP-наблюдениями.

```json
[
  {
    "fixture": "captured",
    "source": "https://clauderesets.com/api/v1/status",
    "capturedAt": "2026-10-21T17:12:27Z",
    "path": "data.latest_reset",
    "projection": {
      "id": "2026-09-04-max-weekly",
      "kind": "usage_reset",
      "event_status": "confirmed",
      "time_precision": "exact",
      "announced_at": "2026-09-04T20:08:45Z",
      "announced_on": null,
      "utc_day": "2026-09-04",
      "effective_at": null,
      "reset_offer": null,
      "audience": {
        "scope": "limited",
        "statement": "everyone on a Claude Max plan",
        "plans": [
          "max"
        ],
        "exclusions": null
      },
      "windows": [
        "weekly"
      ],
      "url": "https://clauderesets.com/resets/2026-09-04-max-weekly",
      "revision": 1,
      "correction": null,
      "sources": [
        {
          "url": "https://x.com/lydiahallie/status/2095967323412930677",
          "role": "original"
        }
      ]
    },
    "check": "confirmed record; announced_at is not exact application time"
  },
  {
    "fixture": "captured",
    "source": "https://clauderesets.com/api/v1/status",
    "capturedAt": "2026-10-21T17:12:27Z",
    "path": "data.reset_offers[0]",
    "projection": {
      "id": "2026-09-22-opus-5-5-reset",
      "kind": "credit",
      "event_status": "confirmed",
      "time_precision": "exact",
      "announced_at": "2026-09-22T16:44:06Z",
      "announced_on": null,
      "utc_day": "2026-09-22",
      "effective_at": null,
      "reset_offer": {
        "expires_on": "2026-10-22"
      },
      "audience": {
        "scope": "limited",
        "statement": "Pro, Max, and Team users",
        "plans": [
          "pro",
          "max",
          "team"
        ],
        "exclusions": null
      },
      "windows": [
        "unspecified"
      ],
      "url": "https://clauderesets.com/resets/2026-09-22-opus-5-5-reset",
      "revision": 2,
      "correction": null,
      "sources": [
        {
          "url": "https://x.com/ClaudeDevs/status/2102438800836489554",
          "role": "original"
        },
        {
          "url": "https://x.com/ClaudeDevs/status/2102438803013333469",
          "role": "original"
        },
        {
          "url": "https://www.anthropic.com/claude-opus-5-5",
          "role": "original"
        }
      ]
    },
    "check": "credit remains offer; date-only expiry; revision=2"
  },
  {
    "fixture": "captured",
    "source": "https://codexreset.ai/api/v1/resets.json",
    "capturedAt": "2026-10-21T17:12:50Z",
    "projection": {
      "id": "2111492673890824348",
      "date": "2026-10-17",
      "ts": "2026-10-17T16:20:57Z",
      "kind": "regular",
      "scope": "all",
      "url": "https://x.com/thsottiaux/status/2111492673890824348",
      "seeded": false,
      "announced_at": "2026-10-17T16:20:57Z",
      "delivered_at": null,
      "delivered_source_url": null,
      "delivery_reported_delay": false
    },
    "check": "null delivery -> needs_review"
  },
  {
    "fixture": "captured",
    "source": "https://codexreset.ai/api/v1/resets.json",
    "capturedAt": "2026-10-21T17:12:50Z",
    "projection": {
      "id": "2109812216212099456",
      "date": "2026-10-13",
      "ts": "2026-10-13T01:03:25Z",
      "kind": "regular",
      "scope": "all",
      "url": "https://x.com/thsottiaux/status/2109812216212099456",
      "seeded": false,
      "announced_at": "2026-10-13T01:03:25Z",
      "delivered_at": "2026-10-13T05:06:06Z",
      "delivered_source_url": "https://x.com/thsottiaux/status/2109873287853707513",
      "delivery_reported_delay": false
    },
    "check": "announcement and delivery differ; original evidence requires verification"
  },
  {
    "fixture": "captured",
    "source": "https://codexreset.ai/api/v1/resets.json",
    "capturedAt": "2026-10-21T17:12:50Z",
    "projection": {
      "id": "2107913674593644711",
      "date": "2026-10-07",
      "ts": "2026-10-07T19:19:17Z",
      "kind": "banked",
      "scope": "paid",
      "url": "https://x.com/thsottiaux/status/2107913674593644711",
      "seeded": false,
      "announced_at": "2026-10-07T19:19:17Z",
      "delivered_at": "2026-10-08T03:44:55Z",
      "delivered_source_url": "https://x.com/thsottiaux/status/2108040921044639779",
      "delivery_reported_delay": false
    },
    "check": "banked with delivery still does not prove consumption"
  },
  {
    "fixture": "captured",
    "source": "https://codexreset.ai/api/v1/resets.json",
    "capturedAt": "2026-10-21T17:12:50Z",
    "projection": {
      "id": "2097752790177370535",
      "date": "2026-09-09",
      "ts": "2026-09-09T18:23:34Z",
      "kind": "banked",
      "scope": "all",
      "url": "https://x.com/thsottiaux/status/2097752790177370535",
      "seeded": true,
      "announced_at": "2026-09-09T18:23:34Z",
      "delivered_at": null,
      "delivered_source_url": null,
      "delivery_reported_delay": false
    },
    "check": "seeded -> preserve archive credit; baseline never sends",
    "attribution": {
      "seed_archive": "https://codex-resets.com/"
    }
  },
  {
    "fixture": "captured",
    "source": "https://codex-resets.com/api/v1/resets?limit=100",
    "capturedAt": "2026-10-21T17:14:18Z",
    "projection": {
      "id": "2109873287853707513",
      "reset_type": "regular",
      "announced_at": "2026-10-13T05:06:06.000Z",
      "source": {
        "type": "x_post",
        "author": "thsottiaux",
        "url": "https://x.com/thsottiaux/status/2109873287853707513"
      }
    },
    "check": "delivery-post ID here differs from announcement ID in CodexReset; do not add counts"
  }
]
```

## Synthetic vectors — не реальные события

Будущие parser/integration tests создаются только на соответствующем этапе. Эти векторы фиксируют ожидаемые правила, не доказывают работоспособность отсутствующего адаптера. Все URL example.invalid и значения 2099 года — искусственные; не публиковать.

| Fixture | Искусственный вход / контекст | Ожидаемое правило |
|---|---|---|
| synthetic S1 | Claude announced, time_precision=date, announced_on=2099-01-02, announced_at=null, utc_day=null; проверен будущий анонс | announced_future; не создавать T00:00:00Z/UTC month |
| synthetic S2 | Claude retracted, correction.kind=retraction, explicit evidence и связь с прежним ID | withdrawal; история сохраняется |
| synthetic S3 | Claude revision увеличен, correction.kind=correction с evidence | correction только для существенного изменения; generated_at не повод для push |
| synthetic S4 | Claude kind=future_unknown или новый JSON field | needs_review/safe rejection; нет confirmed |
| synthetic S5 | Codex scheduled={certainty:hinted,day:2099-01-02,scheduled_for:null,url:https://example.invalid/hint} | needs_review; нет анонса/прогноза |
| synthetic S6 | Та же синтетическая date-only форма, certainty=announced; источник/будущий смысл проверены | announced_future; время не выдумывать |
| synthetic S7 | Codex schema_version=999 или неизвестный kind | отклонить/review, сохранить последний валидный snapshot |
| synthetic S8 | banked с delivered_at и достаточным подтверждением начисления | banked_offer, confirmed-applied count не растёт |
| synthetic S9 | Новая страница не содержит известной записи; scheduled стал null | нет withdrawal без evidence |
| synthetic S10 | HTTP 304, сохранённый snapshot/validator есть, ETag header отсутствует | сохранить snapshot и прежний ETag; отметить проверку, не создавать событие |
| synthetic S11 | HTTP 429 + Retry-After:120 либо HTTP 503/problem+json | backoff/health, не удалять историю, не затронуть второй provider |
| synthetic S12 | Последний запрос успешен, editorial review старый, известен более новый внешний event | показать разные freshness/coverage сигналы, не утверждать полноту/новизну из HTTP 200 |

Synthetic correction/retraction не выдаются за наблюдавшиеся HTTP-примеры. Реальный capture таких переходов и Claude 304 остаются ограничениями исследования.

## Acceptance

- [x] Announcement, applied evidence, offer, correction, withdrawal и unknown разделены.
- [x] Captured-проекции отделены от synthetic и от будущего принятого normalized event.
- [x] Provider-specific bootstrap и нулевая публикация baseline закреплены.
- [ ] Владелец принимает source/evidence policy. Автоматическая публикация сейчас не разрешена.
