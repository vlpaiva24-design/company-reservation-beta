# Atlas — бронь компаний

Рабочее full-stack приложение для бронирования компаний командами **Таллин**, **Токио**, **Вавилон** и **Сеул**. Интерфейс построен на React, Vite, Tailwind CSS и компонентах shadcn/ui (Radix UI). Сервер и API — Node.js 24 + встроенный SQLite.

## Запуск

```bash
cd /Users/vladimir/.openclaw/workspace/company-reservation-beta
npm install
npm run build
npm start
```

Откройте <http://localhost:3000>. Сервер раздаёт production-сборку из `dist/`, а при первом запуске создаёт `data/companies.db`.

Для одновременной разработки клиента и API: `npm run dev`. Vite доступен на <http://localhost:5173> и проксирует `/api` на порт 3000.

### Демо-данные

```bash
npm run seed
```

Seed идемпотентен по ИНН.

## Проверки

```bash
npm test       # API и бизнес-правила
npm run build  # production frontend
npm run check  # API tests + build + syntax checks
```

## Возможности

- выбор текущей команды с сохранением в рамках вкладки;
- dashboard свободных, забронированных и принадлежащих команде компаний;
- быстрый глобальный поиск и компактные фильтры;
- адаптивная таблица на desktop и карточки на mobile;
- добавление и редактирование в доступном диалоге;
- подробная карточка с контактами и полной историей;
- атомарное бронирование и освобождение только командой-владельцем;
- понятные loading, empty, error и confirmation-состояния.

ИНН обязателен и уникален, но допускает международные идентификаторы: цифры, буквы и стандартные разделители.

## Настройки

- `PORT` — порт API/production сервера (по умолчанию `3000`)
- `DB_PATH` — путь к SQLite-файлу

## API

- `GET/POST /api/companies`
- `GET/PUT /api/companies/:id`
- `POST /api/companies/:id/reserve`
- `POST /api/companies/:id/release`
- `GET /api/companies/:id/history`

Для `reserve`/`release` команда передаётся как JSON: `{"team":"Таллин"}`.
