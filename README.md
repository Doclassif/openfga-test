# 🛡️ OpenFGA Enterprise Authorization Stand (PoC)

Тестовый стенд и исследовательский прототип (Proof of Concept) для проверки применимости модели авторизации на основе отношений (**ReBAC — Relationship-Based Access Control**, архитектура Google Zanzibar / OpenFGA) для корпоративной организационной структуры.

---

## 🎯 Назначение проекта

Проект создан для тестирования и демонстрации возможностей OpenFGA при решении типовых задач управления правами доступа на предприятии:

- **Иерархическая структура подразделений**: проверка доступа с учетом подчиненности отделов любой глубины (`parent`, `child`, `ancestor`, `descendant`).
- **Штатное расписание и профессии**: разграничение прав через штатные позиции и профессиональные классификаторы.
- **Цепочки замещений сотрудников**: транзитивное наследование полномочий замещаемого сотрудника (как на 1-м уровне, так и по всей цепочке).
- **Динамический контекст (Contextual Tuples)**: симуляция разовых и временных прав (отпуска, дежурства, проектные роли) на лету прямо в теле API-запроса без записи в постоянную базу данных.
- **Интерактивная визуализация**: веб-интерфейс с живым графом модели (`model.json`), цепочкой принятия решений (Data Path) и песочницей для выполнения Check, Lookup и Batch Check запросов.

---

## ⚡ Архитектурный принцип: Прямое API OpenFGA (Zero Server Processing)

Серверная часть проекта построена на принципе **прозрачного шлюза (Transparent Gateway)**:
- **Никаких промежуточных вычислений в бэкенде**: Node.js сервер не содержит собственной бизнес-логики авторизации. Все запросы проверки прав (`/check`, `/batch-check`, `/list-objects`, `/list-users`) транслируются напрямую в официальное HTTP API ядра OpenFGA (`/stores/{store_id}/...`) 1-в-1.
- **Все правила вычисляет графовый движок OpenFGA**: обход деревьев подразделений, разыменование замещений, фильтрация уровней доступа и применение контекстных кортежей вычисляются внутри ядра OpenFGA по DSL-схеме `model.fga`.

---

## 🧩 Модель предметной области (6 сущностей)

Модель авторизации включает 6 взаимосвязанных типов сущностей:

| Сущность | Назначение | Основные отношения |
|---|---|---|
| **`Employees`** | Сотрудники предприятия | `direct_division`, `direct_staff`, `direct_profession`, `direct_role`, `replaces`, `substitute` |
| **`Divisions`** | Иерархия подразделений | `parent`, `child`, `ancestor`, `descendant`, `direct_staff`, `direct_employee`, `can_use` |
| **`Staffs`** | Штатное расписание | `direct_division`, `profession`, `direct_employee`, `employee`, `can_use` |
| **`Professions`** | Классификатор профессий | `staff`, `direct_employee`, `employee`, `can_use` |
| **`Roles`** | Роли и права доступа | `direct_assignee`, `staff_assignee`, `division_assignee`, `substitute_assignee`, `can_use` |
| **`Replacings`** | Приказы о замещении | `replaced`, `replacing`, `staff`, `member`, `can_use` |

Схема скомпилирована в AST `model.json` через OpenFGA CLI (`npm run model:json`). Интерактивный граф в веб-интерфейсе динамически строится на основе этого файла.

---

## 🚀 Быстрый старт

### 1. Запуск OpenFGA в Docker
```bash
docker compose up -d
```
Сервис OpenFGA доступен по адресам:
- HTTP API: `http://localhost:8088`
- gRPC: `localhost:8081`

### 2. Инициализация модели и загрузка тестовых данных
```bash
npm run import
```
Скрипт автоматически:
1. Создает изолированное хранилище (Store) в OpenFGA;
2. Загружает и валидирует модель `model.fga`;
3. Генерирует официальное JSON AST `model.json`;
4. Загружает кадровые кортежи связей из директории `csv/`.

### 3. Запуск веб-интерфейса и API-сервера
```bash
PORT=8000 npm start
```
Откройте в браузере: **[http://localhost:8000](http://localhost:8000)** (или `http://localhost:3000`).

В веб-интерфейсе доступны:
- **Интерактивный тестер Check**: проверка прав доступа Any-to-Any с переключателем режимов глубины замещения;
- **Поиск зависимостей Lookup**: выборка всех связанных объектов заданного типа;
- **Пакетная проверка Batch Check**: выполнение типовых сценариев проверки с замером времени ответа;
- **Инспектор API**: предпросмотр входящих и исходящих JSON-пакетов и готовые команды cURL;
- **Интерактивный граф**: схема модели из 6 типов и визуализация пути решения (Data Path);
- **Таблицы данных**: инспектор строк 6 реляционных реестров.

### 4. Запуск автотестов
```bash
npm test
```
Запускает **84 комплексных теста** на нативном раннере `node:test` (18 групп проверок, 100% pass rate).

---

## 📡 Примеры API-запросов

### 1. Проверка целевого права (`POST /check`)
Проверка доступа сотрудника `34491` к подразделению `755` (доступ разрешен благодаря замещению сотрудника `42179`):
```bash
curl -X POST http://localhost:8000/check \
  -H "Content-Type: application/json" \
  -d '{
    "user": "Employees:34491",
    "relation": "can_use",
    "object": "Divisions:755"
  }'
```
**Ответ OpenFGA:**
```json
{
  "allowed": true,
  "durationMs": 5.2,
  "relation": "can_use"
}
```

### 2. Проверка с динамическим контекстом (`Contextual Tuples`)
Симуляция временного замещения сотрудника `68176` (доступ к чужому отделу `787` без изменения БД):
```bash
curl -X POST http://localhost:8000/check \
  -H "Content-Type: application/json" \
  -d '{
    "user": "Employees:34491",
    "relation": "can_use",
    "object": "Divisions:787",
    "contextual_tuples": [
      { "user": "Employees:34491", "relation": "direct_substitute", "object": "Employees:68176" },
      { "user": "Employees:68176", "relation": "direct_replaces", "object": "Employees:34491" }
    ]
  }'
```
**Ответ:**
```json
{
  "allowed": true,
  "durationMs": 7.4,
  "relation": "can_use"
}
```

### 3. Выборка доступных объектов (`POST /list-objects`)
Получение всех подразделений, доступных сотруднику (с учетом цепочки замещений):
```bash
curl -X POST http://localhost:8000/list-objects \
  -H "Content-Type: application/json" \
  -d '{
    "user": "Employees:34491",
    "relation": "all_divisions_chain",
    "type": "Divisions"
  }'
```

### 4. Пакетная проверка (`POST /batch-check`)
Параллельная проверка нескольких прав за 1 сетевой вызов:
```bash
curl -X POST http://localhost:8000/batch-check \
  -H "Content-Type: application/json" \
  -d '{
    "checks": [
      {
        "correlation_id": "check-1",
        "tuple_key": { "user": "Employees:34491", "relation": "can_use", "object": "Divisions:755" }
      },
      {
        "correlation_id": "check-2",
        "tuple_key": { "user": "Employees:34491", "relation": "direct_employee", "object": "Divisions:755" }
      }
    ]
  }'
```

### 5. Чтение кортежей (`POST /read`)
Чтение физических кортежей отношений с фильтрацией или постраничной пагинацией:
```bash
curl -X POST http://localhost:8000/read \
  -H "Content-Type: application/json" \
  -d '{
    "tuple_key": {
      "user": "Employees:34491",
      "object": "Divisions:"
    },
    "page_size": 50
  }'
```

### 6. Запись и удаление кортежей (`POST /write`)
Атомарная запись и отзыв кортежей в OpenFGA ReBAC. Именно этот API используется скриптом `src/import.js` для пакетной загрузки всех **1 466 кортежей** из CSV:
```bash
curl -X POST http://localhost:8000/write \
  -H "Content-Type: application/json" \
  -d '{
    "writes": [
      {
        "user": "Employees:34491",
        "relation": "direct_assignee",
        "object": "Roles:bd38f78f-7ad0-595e-81d6-06b970a7e9c3"
      }
    ]
  }'
```

---

## 🛠️ Скрипты проекта

| Команда | Описание |
|---|---|
| `npm start` | Запуск сервера приложений (HTTP API + веб-интерфейс) |
| `npm run dev` | Запуск сервера в режиме разработки с автоматическим перезапуском (`--watch`) |
| `npm test` | Запуск полного набора автотестов (`node:test`, 89 проверок) |
| `npm run import` | Инициализация хранилища OpenFGA, загрузка модели и импорт кортежей из CSV через Write API |
| `npm run model:json` | Компиляция `model.fga` в AST JSON `model.json` через OpenFGA CLI |

---

## 📂 Структура проекта

```text
├── model.fga               # Модель авторизации OpenFGA DSL (Schema 1.1)
├── model.json              # Скомпилированный JSON AST модели
├── docker-compose.yml      # Контейнер OpenFGA (образ openfga/openfga)
├── package.json            # Скрипты и метаданные проекта
├── csv/                    # Исходные кадровые реестры для импорта
│   ├── divisions.csv       # Подразделения (id, code, parent_id, name, full_code)
│   ├── employees.csv       # Сотрудники (username, division_id, staff_id, profession_code, ...)
│   ├── professions.csv     # Профессии (code, name)
│   ├── staffs.csv          # Штатные единицы (id, division_id, profession_code)
│   ├── roles.csv           # Назначения ролей сотрудникам (id, username, role_name)
│   └── replacings.csv      # Заказы замещений (id, replacing_username, replaced_username, ...)
├── public/                 # Веб-интерфейс
│   ├── index.html          # Разметка дашборда, тестера и инспектора API
│   ├── app.js              # Клиентская логика, предпросмотр API, отрисовка графа
│   └── style.css           # Стили интерфейса
├── src/                    # Серверная часть (прозрачный шлюз к OpenFGA)
│   ├── client.js           # SDK-клиент к OpenFGA HTTP API
│   ├── graph-tracer.js     # Построение трассировки графа и цепочки принятия решений
│   ├── import.js           # Загрузчик модели и CSV-данных в OpenFGA
│   └── server.js           # HTTP-сервер API и раздача статики UI
└── test/
    └── test.js             # 84 интеграционных и юнит-теста всех сценариев и инвариантов
```

---

## 🧪 Тестирование и инварианты (84 теста)

Тестовый набор `test/test.js` полностью покрывает логику системы:
1. **Базовый доступ сотрудников**: прямое назначение роли, прямое подразделение, прямая штатка.
2. **Отношения 1:1**: у каждого сотрудника строго одно первичное подразделение и одна профессия.
3. **Иерархия подразделений**: корректная склейка `full_code`, подчиненность `child` / `descendant`.
4. **Замещение 1-го уровня vs. цепочка**:
   - `can_use_direct` разрешает доступ только к ресурсам первого замещаемого.
   - `can_use_chain` успешно транзитивно разрешает доступ через 2+ уровня замещений.
5. **Сущность Replacings**: проверка прав `can_use` и `member` для участников замещения.
6. **Contextual Tuples**: динамическое вычисление прав на лету без изменения постоянного хранилища.
7. **Пакетная обработка**: параллельное выполнение проверок через BatchCheck API.

---

## 📄 Лицензия

MIT
