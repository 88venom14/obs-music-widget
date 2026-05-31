# Deployment Map

Этот файл объясняет, что куда пушится и как сайт публикуется. Он написан как справка для следующих AI-сессий.

## Репозиторий

Remote:

```text
origin https://github.com/88venom14/obs-music-widget.git
```

Основная рабочая ветка:

```text
main
```

В `main` пушится исходный код проекта:

- `docs/` - статический сайт для GitHub Pages.
- `src/` - локальный Node/TypeScript backend.
- `public/` - локальная версия OBS-виджета для backend-режима.
- `tests/` - тесты.
- `.github/workflows/` - GitHub Actions.
- документация и ассеты.

## Публикация сайта

Сайт публикуется из содержимого папки:

```text
docs/
```

Публикацию выполняет GitHub Actions workflow:

```text
.github/workflows/pages.yml
```

Workflow называется:

```text
Publish GitHub Pages
```

Он запускается автоматически при push в `main`:

```yaml
on:
  push:
    branches:
      - main
```

Также его можно запустить вручную через `workflow_dispatch` в GitHub Actions.

## Что делает workflow

Workflow:

1. Берет актуальный код из `main`.
2. Копирует содержимое `docs/` во временную папку.
3. Создает из этой временной папки отдельную ветку `gh-pages`.
4. Делает commit `Publish GitHub Pages`.
5. Пушит ветку `gh-pages` с `--force`.

Итог:

- `main` хранит исходники проекта.
- `gh-pages` хранит только собранное содержимое `docs/`.
- GitHub Pages должен быть настроен на публикацию из ветки `gh-pages`.

## Что не нужно пушить вручную

Обычно не нужно вручную пушить в:

```text
gh-pages
```

Эту ветку перезаписывает workflow. Ручные изменения в `gh-pages` будут потеряны при следующем deploy.

Правильный путь:

1. Внести изменения в исходники, обычно в `docs/`.
2. Проверить локально.
3. Commit в `main`.
4. Push в `origin main`.
5. Дождаться workflow `Publish GitHub Pages`.

## Команды

Проверки перед push:

```bash
npm test
npm run lint
```

Минимальная проверка статического сайта:

```bash
npm run site:check
```

Commit и push:

```bash
git add .
git commit -m "Update static widget dashboard"
git push origin main
```

Если push отклонен из-за новых коммитов на GitHub:

```bash
git pull --rebase origin main
npm test
git push origin main
```

## Как понять, что deploy прошел

Проверять нужно:

1. GitHub Actions в репозитории.
2. Workflow `Publish GitHub Pages`.
3. Ветку `gh-pages`.
4. Опубликованный GitHub Pages URL.

Команда для проверки remote-ветки:

```bash
git ls-remote origin refs/heads/gh-pages
```

Если сеть недоступна из локальной среды, это не означает, что deploy сломан. Нужно проверить Actions/Pages в браузере или повторить проверку позже.

## Важные правила

- Не класть секреты в репозиторий.
- Не коммитить `.env`.
- Не добавлять Spotify Client Secret во frontend.
- OBS URL может содержать токены/API-ключи во фрагменте `#data`, поэтому такие ссылки нельзя публиковать.
- Все изменения сайта должны идти через `docs/` и `main`, а не прямым редактированием `gh-pages`.
