# 28 — Отчёт Stage 3: локальный Codex adapter

Дата: **2026-10-21**. Владелец явно разрешил только локальный Stage 3 по
`prompts/START_STAGE3.md`, выбрал **codexreset.ai** и затем уточнил приоритет
достоверных ранних анонсов, включая неизвестную ожидаемую дату.
Ветка: `feat/stage3-codex-adapter`, база `0268056c98ec73b19c15202ddfb56666f8c6edd7`.
**Не развёрнуто / не опубликовано.**

## 1. Выполнено / не выполнено

Реализован отдельный адаптер одного непагинируемого feed: строгая runtime-схема,
source-specific mapping, изолированный транспорт и in-memory snapshot reader.
Сохранены ID, исходные поля/precision, scope, seeded и архивный credit.
Неизвестная схема/поля/enum отвергаются с внутренней review-диагностикой;
последний валидный snapshot сохраняется. Отсутствующие строки и scheduled
сохраняются с provenance, без автоматического withdrawal.

Поддержаны три сценария:

| Проверенное утверждение | Локальный результат |
|---|---|
| Будущий анонс с exact/date target | `announced_future`, `expectedTime=exact/date`, отдельный `verifiedFutureTarget` |
| Будущий анонс без известной даты | `announced_future`, `expectedTime=unknown`, `verifiedFutureTarget=null`; доставки нет |
| Фактическая доставка | `confirmed_applied` только с непустым прошедшим `delivered_at` и достаточным matching assessment |

Все promotions требуют явной отдельной семантической оценки primary evidence,
привязанной к текущему содержимому записи. Assessment явно называет
`primarySourceUrl`, содержит URL и rationale; они сохраняются в внутреннем
`reviewedEvidence`, а все проверенные ссылки — в provenance. Assessment не генерируется из
timestamp/URL. `hinted`, старый непроверенный regular, слабое evidence и
просроченный target остаются review. Banked остаётся offer, без утверждения
потребления или текущей доступности. `effective` всегда unknown; `ts`/`date`
сохранены в raw, announcement/delivery разделены. Date-only future сравнивается
строго с текущей UTC-датой; полночь/таймзона события не выдумываются.

Первое локальное обнаружение нового/изменённого содержимого сохраняется
отдельно от announcement и HTTP check time. Оно живёт только в переданном
in-memory state. Никакой durable baseline, revision/transition engine или
публикационный журнал не реализован.

`codex-resets.com` используется только как сохранённый архивный credit, когда
его указывает feed, и как исторически исследованная альтернатива. Вызовов его
API, fallback и union нет. Worker handlers, logger, конфигурация dry_run,
неактивный Cron, общие типы, зависимости и lockfile не менялись.

## 2. Изменённые файлы

- Implementation: `src/providers/codex/{schema,mapping,transport,adapter}.ts`.
- Tests: `tests/codex-{mapping,transport,adapter,simulation}.test.ts`,
  `tests/fixtures/codex.ts`.
- Local HTTP substitutes: `postman/mocks/codex/codex.js`,
  `postman/simulations/codex-local.sim.yaml` (переиспользует существующий Claude mock).
- Evidence metadata: `docs/evidence/stage3-codex-2026-10-21/{README.md,contract.json,observations.json}`.
- Documentation: README, docs 01/04/06/08/09/12/22, этот отчёт,
  `29_STAGE3_HANDOFF.md`, `manual/OWNER_CHECKLIST.md`.

На старте уже были изменены README, docs 08/27 и untracked
`prompts/START_STAGE3.md`; они сохранены. `docs/27_STAGE2_HANDOFF.md` и prompt
не редактировались этой реализацией. На завершении реализации index был пуст,
commit не создавался. После отчёта владелец отдельно разрешил локальный commit
этого результата, включая связанную подготовку документации. Фактический SHA
проверять по Git history; push и PR не разрешены.

## 3. Реальные команды и результаты

| Команда / проверка | Фактический результат |
|---|---|
| `npm run typecheck` | PASS: Wrangler local runtime types + оба strict TypeScript проекта |
| `npm run lint` | PASS: ESLint, zero warnings |
| `npm test` | PASS: 162 passed, 2 skipped; opt-in simulation tests не входят в обычный offline прогон |
| `python3 docs/evidence/stage0-2026-10-21/verify.py` | PASS: 139 offline assertions; historical archive unchanged |
| `git diff --check` + whitespace scan untracked text | PASS; проверены также 17 новых текстовых файлов, index не менялся |
| `postman simulation run postman/simulations/codex-local.sim.yaml --port 4902 --output ndjson --no-history` | Локальный CLI 1.75.0; два synthetic mocks; реальный HTTP, без upstream/workspace/deploy; остановлен SIGINT, процесс exit 0 |
| `env CODEX_SIMULATION_URL=http://127.0.0.1:4902 npm test -- --run tests/codex-simulation.test.ts` | PASS: 1 test в каждом из двух успешных прогонов, включая финальный код; каждый делает 15 вызовов (9 Codex, 6 Claude), 14 response events и один intentional body timeout. Финальный log: 28 responses, 22 served / 6 failed, summary SIGINT |
| Targeted live GET: developers + resets.json | HTTP 200; фактический parser принял feed; metadata/hashes сохранены отдельно, полные чужие тела в репозиторий не перенесены |
| Independent review | Завершено `stage3_review` (reviewer, gpt-6.1-sol, reasoning high): оставшихся critical/high/medium findings нет. Исправлено одно medium finding — потеря дополнительных primary evidence URLs; регрессии applied, dated/undated future, scheduled и stale/invalid assessments. Reviewer независимо выполнил 124 targeted Codex/Claude tests PASS и diff check PASS |
| Website build / D1 / Telegram / deployment | Не применимо или не запускалось: это вне Stage 3 |

Первые simulation попытки не считаются успешными: CLI обнаружил одинаковые
имена `default` у двух mocks (новый Codex handler переименован), sandbox
запретил loopback listen/HTTP. После отдельного sandbox-разрешения simulation
и её test прошли. Автоматические tests не обращаются к live upstream.

## 4. Подтверждённые факты и допущения

GitHub read-only проверка подтвердила PR #2 merged, совпадение remote/local
main `0268056` и successful CI исправлений `ae89017`. Ветка Stage 3 создана
локально; remote не изменялся.

Текущий feed: schema v1, 62 строки (54 regular, 8 banked), 53 seeded,
56 с null delivery, scheduled=null; HTTP max-age=300. Это snapshot, не
доказательство полноты или неизменное требование parser. `generated_at` не
означает материальную revision. Транспорт использует TTL 300s по умолчанию,
valid max-age/Age и минимум 60s; s-maxage не подменяет max-age.

Не проверено содержимое первичных delivery posts. Ни одна live-запись не
получила локального подтверждающего assessment. Без него regular остаются
review; banked — offers. Ненулевой scheduled, undated announcement,
304/429/503 и failure ветви проверены synthetic/contract-based substitutes,
не заявлены как новые live captures.

Документированный upstream scheduled требует `day`. Неизвестное время
представлено через отдельно проверенный future announcement в regular row,
а не выдуманный nullable scheduled.day. Дополнительный target/scope из
primary evidence — ввод reviewer, не автоматически извлечённые данные.

## 5. Регрессии / риски

- Source-specific fail-closed parser требует обновления при расширении контракта;
  несовместимый feed оставляет cached snapshot и failure, а не пустую историю.
- In-memory detection/cache теряются после перезапуска; они не заменяют D1.
- Assessment означает доверенный ручной semantic review. Код проверяет binding,
  URL и precision, но не читает первичную страницу и не доказывает её достоверность.
- Неизвестное ожидаемое время не создаёт countdown, расписание или доказательство
  доставки. Время само по себе не повышает announcement до applied.
- Первая и последующая Telegram eligibility, связь announcement/delivery,
  durable detection, baseline и corrections требуют Stage 4+ проектирования.

## 6. Действия владельца / авторизация

Проверить результат и независимое review, принять либо запросить исправления.
Приоритет раннего информирования принят из явного требования владельца;
предложения будущей publication policy записаны в docs 01/12/22 и не являются
разрешением публикации. ADR-015/019/020 целиком не закрыты.

Локальный commit отдельно разрешён владельцем после этого отчёта. Push/PR и
Stage 4 требуют новых отдельных разрешений. Production truth,
два provider baseline, ресурсы/миграции/deployment и Telegram sends остаются
закрытыми gates.

## 7. PR

Stage 3 PR не создавался; push не выполнялся. Разрешение локального commit
не включает remote-операции.

## 8. Внешние действия

Только разрешённые read-only contract/GitHub проверки и локальная simulation.
Cloudflare login/resources/secrets/migrations/deploy и Telegram sends не
выполнялись. **Не развёрнуто / не опубликовано. Stage 4 не начат.**
