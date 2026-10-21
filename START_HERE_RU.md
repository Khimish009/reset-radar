# 🚀 Reset Radar — начни здесь

Это **финальная спецификация v3** для Codex CLI: Claude Code + Codex; Telegram канал + бот-публикатор; Cloudflare Workers/D1; read-only API; сайт-дашборд на GitHub Pages.

**В архиве нет работающего бота и сайта — их напишет Codex.** На старте **не требуется** создавать Cloudflare и не требуется токен Telegram.

## 1. Создать папку

Распакуй архив. Внутри уже есть корневая папка `reset-radar/`. Размести её там, где хранишь свои проекты, например `~/projects/reset-radar`.

```bash
cd ~/projects/reset-radar
ls -la
```

Проверь наличие `AGENTS.md`, `README.md`, `docs/`, `prompts/`, `brand/`.

## 2. GitHub (по желанию сначала или после Stage 0)

Создай GitHub репозиторий с именем `reset-radar` и описанием из `manual/OWNER_CHECKLIST.md`; план — `Public`. Не создавай дублирующих README/.gitignore. В репозитории **уже есть MIT LICENSE**, copyright 2026 Salman, и `license: MIT` в package.json. Это существующее состояние, не новое решение владельца; LICENSE и copyright сохраняются. Вопрос отдельных условий для бренда и стороннего контента остаётся открытым в `docs/21_LEGAL_AND_LICENSE.md`. Для самого первого Stage 0 подключать GitHub и пушить необязательно.

## 3. Запустить Codex

```bash
cd ~/projects/reset-radar
codex
```

В Codex вставь **целиком** `prompts/START_CODEX.md` (либо дай ему указание прочитать файл и выполнить его). Начать только Stage 0. Codex исследует API Claude и Codex, запишет факты/неопределённости и **остановится**. Не разрешай разработку сайта или деплой в этом этапе.

## 4. Как работать дальше

После каждого этапа: тесты → отчёт → ревью изменений/PR → твоё отдельное разрешение на следующий этап. Для новых задач используй шаблон `prompts/NEXT_STAGE.md`. Отдельные разрешения нужны для GitHub push/PR, создания D1, Cloudflare деплоя, секрета токена, Telegram тестовой/боевой публикации и GitHub Pages.

## 5. Что будет реализовано

- **Stages 0–8:** оба источника → D1 → Telegram публикации (с безопасным bootstrap).
- **Stage 9:** наш публичный API `/api/v1/{events,status,stats}` из D1.
- **Stage 10:** GitHub Pages сайт RU/EN с событиями, фильтрами, карточками статуса, линками.
- **Stage 11:** анализ и графики с прозрачной методологией, релизная проверка.

Читать в первую очередь: `README.md`, `AGENTS.md`, `docs/08_DEVELOPMENT_PLAN.md`, `docs/09_DECISIONS.md`, `docs/16_PUBLIC_API.md`, `docs/17_WEBSITE_SPEC.md`.

**Важно:** сайт читает **наш** Cloudflare Worker API, а не напрямую сторонние сервисы; Telegram и сайт используют одну историю в D1. Публичных персональных лимитов аккаунтов здесь нет. Не выдаём прогнозы за фактические сбросы.
