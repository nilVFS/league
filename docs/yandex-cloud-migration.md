# Yandex Cloud Migration

## Что уже переписано

- Фронтенд больше не использует Firebase SDK.
- Админ-логин теперь идет через cookie-сессию и API `/api/admin/*`.
- Контент теперь идет через API `/api/content/*`.
- Крон импорта клипов больше не ходит в Firestore.
- API умеет работать с `YDB` через `YDB_ENDPOINT`, `YDB_DATABASE`, `YDB_SERVICE_ACCOUNT_KEY_JSON`.
- Если переменные YDB не заданы, локально включается fallback на `.data/content-store.json`.

## Что это дает

Теперь приложение отделено от Firebase по коду и может работать в схеме:

1. `Frontend + API` остаются на `Vercel`.
2. `YDB Serverless` живет в `Yandex Cloud`.
3. `Vercel env` хранит ключ сервисного аккаунта и параметры подключения к YDB.

## Текущая прод-схема

- `Vercel` для фронтенда и `/api/*`.
- `YDB Serverless` для контента и админских данных.
- `Yandex Cloud Service Account` с ролью `ydb.editor`.

## Что нужно в env

```env
YDB_ENDPOINT=
YDB_DATABASE=
YDB_SERVICE_ACCOUNT_KEY_JSON=
ADMIN_EMAIL=
ADMIN_PASSWORD=
ADMIN_SESSION_SECRET=
TWITCH_CLIENT_ID=
TWITCH_CLIENT_SECRET=
CRON_SECRET=
```

## Где точка интеграции

- [content-store.js](/Users/vladislavnizev/Documents/lg/api/_lib/content-store.js)

## Что еще осталось

- `uploadFile()` пока намеренно не подключен и должен уйти в `Object Storage`.
- Обновления данных теперь идут polling-раз в 15 секунд, а не realtime как в Firestore.
- Если когда-нибудь захочется убрать Vercel API, этот же backend можно будет посадить в `Serverless Containers`.
