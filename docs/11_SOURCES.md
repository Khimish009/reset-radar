# 11 — Журнал источников и доказательств Stage 0

Проверено **2026-10-21**. Время ниже — **UTC по HTTP Date**, не время события. [Выводы](04_EXTERNAL_APIS.md), [правила и fixtures](22_STAGE0_TRUTH_TABLE.md).

## Прямые HTTP-наблюдения

Публичные запросы без ключей, User-Agent ResetRadar-Stage0/0.1 (главный агент дополнил назначением исследования). Sandbox первоначально не разрешал DNS: curl exit 6 / urllib URLError, HTTP 000 — **транспортная ошибка, не ответ upstream**. После разрешённого выхода за sandbox прямой HTTP заработал.

| ID | URL | UTC | HTTP / Content-Type | Cache-Control; ETag |
|---|---|---|---|---|
| C1 | https://clauderesets.com/api/docs | 17:12:26 | 200 text/html | public, max-age=300, stale-while-revalidate=600; `W/"960c56c6c91580db"` |
| C2 | https://clauderesets.com/api/openapi.json | 17:12:26 | 200 application/json | public, max-age=3600, stale-while-revalidate=7200; `W/"4e3b880cc8668581"` |
| C3 | https://clauderesets.com/api/v1/status | 17:12:27 | 200 application/json | public, max-age=60, stale-while-revalidate=120; `W/"d74fd335f90b7688"` |
| C4 | https://clauderesets.com/api/v1/resets | 17:12:27 | 200 application/json | public, max-age=60, stale-while-revalidate=120; `W/"5a74920c6aefbc53"` |
| C5 | https://clauderesets.com/api/v1/sources | 17:12:27 | 200 application/json | public, max-age=300, stale-while-revalidate=600; `W/"4bb466f6afe1057f"` |
| C6 | https://clauderesets.com/api/v1/status + If-None-Match C3 | 17:14:07 | **200**, не 304 | новый ETag `W/"d14fc9c3ff0b7ffa"`; повторное тело не сохранено |
| C7 | https://clauderesets.com/api/v1/resets?limit=2 | 17:16:28 | 200 application/json | public, max-age=60, stale-while-revalidate=120; has_more=true |
| C8 | https://clauderesets.com/api/v1/resets?limit=2&cursor=eyJkIjoiMjAyNi0wOS0wMSIsImkiOjE3ODgyODc3MjcwMDAsImlkIjoiMjAyNi0wOS0wMS1hbGwtdXNlcnMiLCJyIjoiMzcxNjQzZGY4MGNjYTBhZSJ9 | 17:20:00 | 200 application/json | public, max-age=60, stale-while-revalidate=120; has_more=true |
| X1 | https://codexreset.ai/developers/ | 17:12:23 | 200 text/html | public, max-age=0, must-revalidate; ETag отсутствует |
| X2 | https://codexreset.ai/api/v1/resets.json | 17:12:50 | 200 application/json | public, max-age=300; `"811a700fd9a6acc18e737b6e3cec7b81"` |
| X3 | https://codexreset.ai/api/v1/resets.json + If-None-Match X2 | 17:14:18 | **304**, тело пустое | public, max-age=300; ETag в 304 отсутствует |
| A1 | https://codex-resets.com/ | 17:12:52 | 200 text/html | private, no-store |
| A2 | https://codex-resets.com/api/docs | 17:13:28 | 200 text/html | public, max-age=300, s-maxage=3600 |
| A3 | https://codex-resets.com/api/openapi.json | 17:14:00 | 200 application/json | public, max-age=300, s-maxage=3600, stale-while-revalidate=86400; `"b64bbd2e9f7230b86ea8e18b2158acfb07c399b4b78dda48657563adcdf1c056"` |
| A4 | https://codex-resets.com/api/v1/status | 17:14:19 | 200 application/json | public, max-age=30, s-maxage=60, stale-while-revalidate=300; `"83846850e95e8e6dfbc16c4570e493c7b6ce1dcfc06cf38315db20d03c163184"` |
| A5 | https://codex-resets.com/api/v1/resets?limit=100 | 17:14:18 | 200 application/json | public, max-age=60, s-maxage=300, stale-while-revalidate=300; `"d621edc68612c4d664854eedd7968f343dd4cbb12b394946cc634c2758b52a53"` |
| A6 | https://codex-resets.com/api/v1/resets?limit=100 + If-None-Match A5 | 17:16:06 | **304**, тело пустое | public, max-age=14400, s-maxage=300, stale-while-revalidate=300; ETag как A5 |

C3–C5, C7–C8, X2 и A3–A5 имеют CORS `*`; X2/X3 — X-Robots-Tag=noindex. Это не проверка CORS будущего Worker, которому нужен собственный allowlist.

У альтернативы TTL различался: A5 HTTP 200 имел max-age=60, A6 HTTP 304 — max-age=14400. Это реальное расхождение headers; не предполагать одинаковый TTL для 200/304 или гарантированную минутную свежесть. s-maxage в обоих ответах 300.

[Claude robots](https://clauderesets.com/robots.txt), [CodexReset robots](https://codexreset.ai/robots.txt), [альтернатива robots](https://codex-resets.com/robots.txt) реально вернули 200 и разрешают публичные пути; Claude запрещает /admin/. Robots не даёт контентную лицензию. Fair-use условия взяты из C1, X1, A2; отдельная лицензия полного зеркала текстов не установлена.

### Что подтверждено и что осталось непроверенным

- C4: 12 строк, has_more=false. C7/C8: по 2 строки, первая пара ID 2026-09-04-max-weekly / 2026-09-01-all-users, вторая 2026-07-16-all-users / 2026-07-09-all-users. Пересечений нет, content_revision одинакова, revision_changed=false. Все последующие малые страницы не обходились: полный текущий counted snapshot уже получен C4.
- X2: 62 строки без pagination, 53 seeded, 6 delivered_at не null. A5: 64 строки, has_more=false. Пересечение ID — 52; разные ID могут обозначать один reset.
- У C3 announced_reset=null, у X2 scheduled=null, у A4 scheduled_reset=null. Ненулевые варианты, date-only, отмены/отзывы — только контракт и synthetic примеры. Offer revision=2 реально есть, предыдущая версия не получена.
- Claude 304 не наблюдался. 429/Retry-After/503 и upstream timeout не провоцировались. Claude/альтернативная OpenAPI описывают ошибки; точный error-контракт CodexReset не установлен.
- Web-чтение https://x.com/thsottiaux/status/2109873287853707513 и https://x.com/thsottiaux/status/2111492673890824348 сообщило 403. Прямой curl к X не запускался. Полный текст оригинала независимо не подтверждён.
- [Anthropic Opus 5.5](https://www.anthropic.com/claude-opus-5-5) прочитана web-инструментом: подтверждает семантику сохранённого сброса; HTTP headers не измерялись.

## Снимки и команды

Raw headers/bodies временно сохранены под /tmp/reset-radar-stage0-claude/, /tmp/reset-radar-stage0-codex-*, /tmp/reset-radar-stage0-archive-*, /tmp/reset-radar-stage0-claude-page*. Они могут исчезнуть после сеанса. Постоянные минимальные captured-проекции без summaries находятся в [truth table](22_STAGE0_TRUTH_TABLE.md); это не полные parser fixtures.

Для новой сессии также сохранён [постоянный архив](evidence/stage0-2026-10-21/README.md): 36 артефактов и manifest с hashes, structural JSON/OpenAPI projections, выбранные headers, robots и baseline/review diff. Он не зависит от /tmp; полные чужие редакционные тексты в него не переносились. Проверка: `python3 docs/evidence/stage0-2026-10-21/verify.py` из корня. Контекст продолжения: [23_SESSION_HANDOFF.md](23_SESSION_HANDOFF.md).

| Снимок | SHA-256 исходных bytes |
|---|---|
| C3 status.body | e7b6a9d58567d496f6be5136b6e703a2d04f25f99d4e08d671e1face0eeb0445 |
| C4 resets.body | b0379b28aa7f7b65dd8eb5cc3e404b6ba19a237b6c3411802af1ef751d43825f |
| X2 codex-resets.json | 3071942d524168e816366fcf60508d629e91b7592ab344edd62acf68bdcb42ed |
| A5 archive-resets.json | d621edc68612c4d664854eedd7968f343dd4cbb12b394946cc634c2758b52a53 |

C1–C6 получены субагентом через Python urllib.request, timeout 20s. Остальные прямые проверки — curl, timeout 30s (X1 — 25s). Главный агент перечитал сохранённые Claude JSON/headers/docs/OpenAPI. C6 известен по выводу команды агента, повторное тело не архивировано.

Фактически выполненная форма GET (URL/output менялись по строкам таблицы):

```sh
curl --silent --show-error --connect-timeout 10 --max-time 30 \
  --user-agent 'ResetRadar-Stage0/0.1 (public API feasibility research)' \
  --dump-header /tmp/reset-radar-stage0-codex-resets.headers \
  --output /tmp/reset-radar-stage0-codex-resets.json \
  --write-out 'HTTP %{http_code}\nURL %{url_effective}\n' \
  https://codexreset.ai/api/v1/resets.json
```

Для X3 добавлен `--header 'If-None-Match: "811a700fd9a6acc18e737b6e3cec7b81"'`, output codex-conditional.headers/body. Для A6 аналогично использован точный A5 ETag. Интервалы >60 секунд выдержаны.

Для повторной проверки Claude владельцем (рекомендация, **не выполненная команда**):

```sh
curl --silent --show-error --max-time 30 --user-agent 'ResetRadar-Stage0/0.1' \
  --dump-header /tmp/claude-status.headers --output /tmp/claude-status.json \
  https://clauderesets.com/api/v1/status
# Подождать >=60 секунд, взять ТОЧНЫЙ ETag с кавычками из headers.
curl --silent --show-error --max-time 30 --user-agent 'ResetRadar-Stage0/0.1' \
  --header 'If-None-Match: REPLACE_WITH_EXACT_ETAG_INCLUDING_QUOTES' \
  --dump-header /tmp/claude-conditional.headers --output /tmp/claude-conditional.body \
  https://clauderesets.com/api/v1/status
```

200 допустим: сравнивать content_revision/материальные поля отдельно от generated_at. Не провоцировать 429/503; будущие тесты используют synthetic responses.

## Дополнительное обнаружение API

Навык Postman API Discovery: read-only Orbit POST https://api.buildwithorbit.ai/v1/search?limit=5, HTTP 200. Отправлены только задача и публичные домены. В пяти результатах нет подходящего ресурса выбранных доменов; предложены другие сервисы, включая **codex-reset.com** (другое написание). Это ограничение конкретного результата поиска, не отсутствие API вообще. /integrate не вызывался, workspace/зависимости/аккаунты не создавались. Четвёртый источник не добавлен. Контракты получены из первичных URL выше.

## Другие проектные ссылки — не перепроверялись в Stage 0

| URL | Назначение |
|---|---|
| https://core.telegram.org/bots/api | будущий publisher |
| https://developers.cloudflare.com/workers/configuration/cron-triggers/ | Cron |
| https://developers.cloudflare.com/workers/platform/limits/ | квоты Workers перед настройкой |
| https://developers.cloudflare.com/d1/platform/pricing/ | квоты/цены D1 перед настройкой |
| https://developers.cloudflare.com/d1/platform/limits/ | ограничения D1 |
| https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site | hosting |
| https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages | reviewed Pages workflow |
| https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository | справка о лицензии |

Stage 0 не проверял тарифы/квоты, Telegram, Cloudflare, Pages или будущий Worker API. Старую общую пометку checked на них не переносить.

## Локальная проверка результатов

Выполнено `python3 /tmp/verify_reset_radar_stage0.py`: **55 assertions PASS** — envelopes/counts/IDs, offers, различие announcement/delivery, порядок двух cursor-страниц, labels и значения 7 captured-проекций против raw, 12 synthetic vectors, SHA-256 и локальные ссылки. Это разовая проверка снимков/документов, **не полный JSON Schema validator и не тесты будущего приложения**. Новые зависимости не устанавливались.

`git diff --check HEAD` — exit 0, но проверяет только tracked files и не охватывает ignored docs. Для каждого из трёх исходных документов дополнительно выполнен `git diff --no-index --check /tmp/reset-radar-stage0-baseline/<name> docs/<name>`, для нового — сравнение с /dev/null: exit 1 из-за различий, сообщений об ошибках whitespace нет. Читаемый diff сохранён в /tmp/reset-radar-stage0-review.diff. Typecheck, lint, Vitest, integration tests и website build **не запускались**: реализации/package.json нет; Stage 1 не начат.
