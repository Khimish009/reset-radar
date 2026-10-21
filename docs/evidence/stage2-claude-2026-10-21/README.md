# Evidence Stage 2 — Claude contract, 2026-10-21

Этот каталог дополняет, но не изменяет архив Stage 0. Данные здесь фиксируют проверку контракта для локального Claude adapter; они не утверждают полноту истории и не принимают production truth policy.

- [contract.json](contract.json) — структурная проекция OpenAPI 3.1.0 с удалёнными описаниями и examples; inline schemas вынесены в именованные определения. В файле сохранены URL, дата проверки и SHA-256 исходного OpenAPI. Это не сохранённый полный OpenAPI document и не fixture ответа API.
- [observations.json](observations.json) — метаданные отдельной read-only live validation: URL, HTTP status, parser acceptance, content revision, counts и SHA-256 исходных тел. Сами тела ответов не сохранялись.

21 октября 2026 года status, `resets?limit=100` и sources вернули HTTP 200 и были приняты текущим parser; resets содержал 12 строк, sources — 7, content revision совпадал (`371643df80cca0ae`). Среди фактических source metadata встретился `last_reviewed_at` в date-only форме. Этот факт обосновывает сохранение даты без искусственного времени. Результат не доказывает, что текущая upstream схема останется неизменной.

Synthetic contract-shaped fixtures для обязательных полей, enum и непроверенных ветвей нельзя называть captured live responses. В частности, Claude 304, live 429/503, correction/withdrawal и будущие объявления не проверялись реальным API. Для их контролируемых локальных тестов используется loopback Postman mock. Автоматические тесты не обращаются к upstream.

Права/fair use и известные ограничения описаны в [docs/04_EXTERNAL_APIS.md](../../04_EXTERNAL_APIS.md); сценарии classification — в [docs/22_STAGE0_TRUTH_TABLE.md](../../22_STAGE0_TRUTH_TABLE.md); результаты проверок Stage 2 — в [отчёте](../../26_STAGE2_REPORT.md).
