# Yandex Cloud Migration

## Что уже переписано

- Фронтенд больше не использует Firebase SDK.
- Админ-логин теперь идет через cookie-сессию и API `/api/admin/*`.
- Контент теперь идет через API `/api/content/*`.
- Крон импорта клипов больше не ходит в Firestore.
- Данные по умолчанию хранятся в локальном JSON-файле `.data/content-store.json`.

## Что это дает

Теперь приложение отделено от Firebase по коду. Следующий шаг до Yandex Cloud уже инфраструктурный:

1. Заменить файловый store на YDB.
2. Вынести загрузку файлов в Object Storage.
3. Развернуть API в Yandex Cloud Functions или Serverless Containers.

## Рекомендуемая схема в Yandex Cloud

- `Object Storage` для фронтенда и файлов.
- `API Gateway` как публичная точка входа.
- `Serverless Containers` для этого Node API.
- `YDB Serverless` вместо `.data/content-store.json`.
- `Cloud Functions` для простых cron/webhook задач при желании.

## Минимальная замена хранилища на YDB

В этом проекте точка замены одна:

- [content-store.js](/Users/vladislavnizev/Documents/lg/api/_lib/content-store.js)

Если переписать функции `listCollection`, `createDocument`, `updateDocument`, `deleteDocument` на YDB, остальная часть приложения продолжит работать без изменений.

## Что еще осталось

- `uploadFile()` пока намеренно не подключен и должен уйти в `Object Storage`.
- Обновления данных теперь идут polling-раз в 15 секунд, а не realtime как в Firestore.
- Для production на Yandex Cloud лучше держать API в `Serverless Containers`, потому что тут уже несколько маршрутов и cookie-сессии.
