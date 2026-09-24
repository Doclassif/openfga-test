# 🛡️ OpenFGA — Сервис авторизации (ReBAC)

Полнофункциональная система авторизации на основе отношений (**ReBAC — Relationship-Based Access Control**, архитектура Google Zanzibar) для организационной структуры предприятия: подразделения, штатное расписание, сотрудники, цепочки замещений и роли доступа.

Проект работает на **Node.js** с нативным клиентом OpenFGA (без сторонних фреймворков и без внешних npm-зависимостей).

---

## ⚡ Архитектурный принцип: Прямое API OpenFGA (Zero Server Processing)

Ключевой принцип сервиса — **никаких промежуточных серверных расчетов, постобработок или эмуляций авторизации**:
- **Прямая трансляция в OpenFGA**: Node.js сервер является исключительно **тонким прозрачным шлюзом (Transparent Gateway)**. Все входящие запросы (`/check`, `/batch-check`, `/list-objects`, `/list-users`) передаются напрямую в официальное HTTP API ядра OpenFGA (`/stores/{store_id}/...`) 1-в-1.
- **Вся логика — внутри графового движка**:
  - Иерархический обход дерева подразделений (`descendant`, `ancestor`);
  - Разыменование цепочек замещений (`replaces`, `substitute`);
  - Разделение уровней глубины (`can_use_direct` строго 1-й уровень vs `can_use_chain` вся цепочка);
  - Наложение динамического контекста (`contextual_tuples`).
  Все эти вычисления производит **100% ядро OpenFGA** на основе скомпилированной модели `model.fga`.

---

## 🔄 Замещения (Replacing) в модели: почему это не отдельный узел

В реляционных базах данных замещения хранятся в таблице-связке (`replacings.csv`). Однако в графовой модели OpenFGA:
1. **Замещение встроено в модель `Employees` по дефолту**:
   В OpenFGA нет отдельного типа `type Replacings`. Замещение смоделировано как **внутреннее отношение сотрудника к сотруднику (`Employees ➔ Employees`)**:
   ```dsl
   type Employees
     relations
       define direct_replaces: [Employees]
       define replaces_chain: direct_replaces or replaces_chain from direct_replaces
       define replaces: replaces_chain

       define direct_substitute: [Employees]
       define substitute_chain: direct_substitute or substitute_chain from direct_substitute
       define substitute: substitute_chain
   ```
2. **Отсутствие лишних транзитивных прыжков**:
   Благодаря самозамыкающейся связи (`Employees ↺ replaces`) замещающий сотрудник напрямую наследует связанные отделы, штатки, профессии и роли замещаемого лица (`division_from_replaced`, `staff_from_replaced`, `role_from_replaced`).
3. **Отображение на графе**:
   На схеме модели замещение отображается как петля самозамыкания на узле `Employees (↺ Замещения)`. В режиме трассировки конкретного запроса («Цепочка решения / Data Path») граф разворачивает замещения в наглядную пошаговую цепочку:
   `[Employees:34491] ──(replaces)──> [Employees:42179] ──(direct_assignee)──> [Roles:c66452e0...]`.

---

## 🚫 Таблицы `grants` больше нет: переход на Contextual Tuples

В ранних версиях проекта использовалась статическая таблица ручных исключений `grants.csv`. **Она полностью удалена из проекта**:
- **Почему гранты не нужны в БД**: В архитектуре OpenFGA нет необходимости вести отдельную таблицу «ручных грантов». Постоянные кадровые привязки хранятся в основных кадровых реестрах (`roles.csv`, `employees.csv` и др.).
- **Нативное решение — Contextual Tuples**: Разовые исключения, временное замещение на период отпуска, дежурства и точечные права на лету передаются прямо в теле запроса к API (`contextual_tuples: [...]`). Они учитываются ядром OpenFGA только в рамках текущего вызова и не загрязняют постоянную базу данных.

---

## 🚀 Быстрый старт

### 1. Запуск OpenFGA в Docker
```bash
docker compose up -d
```
OpenFGA поднимется на портах `8088` (HTTP API) и `8081` (gRPC).

### 2. Загрузка модели и данных из CSV
```bash
npm run import
```
Скрипт создаст хранилище (Store), загрузит схему `model.fga` и сформирует кортежи связей из 6 CSV-таблиц директории `csv/`.

### 3. Запуск веб-интерфейса и API-сервера
```bash
# Порт по умолчанию — 3000 (или через переменную PORT)
PORT=8000 npm start
```
Откройте в браузере: **[http://localhost:8000](http://localhost:8000)** (или `http://localhost:3000`).

### 4. Запуск автотестов
```bash
npm test
```
Запускает **79 комплексных тестов** на нативном раннере `node:test` (17 групп проверок, 100% pass rate).

---

## 🧩 Структура данных (6 кадровых таблиц)

База данных проекта состоит из 6 согласованных реляционных таблиц в директории `csv/`:
- **`employees.csv` (Сотрудники)** — табельный номер, ФИО, первичное подразделение (1:1), основная штатка (1:1), основная профессия (1:1).
- **`divisions.csv` (Подразделения)** — иерархическое дерево подразделений (`id`, `parent_id`, `name`, `code`, `full_code`). Сквозной код `full_code` склеивается без разделителей по иерархии (например, `755215147`).
- **`staffs.csv` (Штатные единицы)** — привязка штатных должностей к подразделениям и профессиям.
- **`professions.csv` (Профессии)** — классификатор должностей и специальностей.
- **`roles.csv` (Роли)** — персональные назначения корпоративных ролей сотрудникам.
- **`replacings.csv` (Замещения)** — кадровые приказы о замещении (`replacing_username` ➔ `replaced_username`).

---

## 🛠️ Доступные скрипты `package.json`

| Команда | Описание |
|---|---|
| `npm start` | Запуск HTTP-сервера приложения |
| `npm run dev` | Запуск сервера в режиме разработки с флагом `--watch` |
| `npm test` | Запуск полного набора автотестов (`node:test`, 79 проверок) |
| `npm run import` | Инициализация хранилища OpenFGA, загрузка модели и импорт CSV |
| `npm run model:json` | Компиляция `model.fga` в AST JSON `model.json` через OpenFGA CLI |

---

## 📡 Примеры API-запросов (прямое обращение к OpenFGA)

### 1. Проверка целевого права (`POST /check`)
Проверка, может ли сотрудник `34491` использовать подразделение `755` (доступ разрешен, так как он замещает сотрудника `42179` из этого отдела):
```bash
curl -X POST http://localhost:8000/check \
  -H "Content-Type: application/json" \
  -d '{
    "user": "Employees:34491",
    "relation": "can_use",
    "object": "Divisions:755"
  }'
```
**Ответ ядра OpenFGA:**
```json
{
  "allowed": true,
  "durationMs": 5.2,
  "relation": "can_use"
}
```

### 2. Проверка с динамическим контекстом (`Contextual Tuples`)
Временное замещение сотрудника `68176` на лету (доступ к чужому отделу `787` без изменения БД):
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

### 3. Получение списка доступных объектов (`POST /list-objects`)
Выборка всех подразделений (личных и унаследованных по цепочке замещений), доступных сотруднику:
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
Выполнение нескольких проверок параллельно за 1 сетевой вызов к OpenFGA:
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

---

## 📂 Структура проекта

```text
├── model.fga               # Официальная модель OpenFGA DSL (Schema 1.1)
├── model.json              # Скомпилированный JSON AST модели
├── docker-compose.yml      # Запуск OpenFGA в Docker (образ openfga/openfga)
├── package.json            # Манифест проекта и скрипты
├── csv/                    # Исходные кадровые реестры (6 таблиц)
│   ├── divisions.csv       # Подразделения (id, code, parent_id, name, full_code)
│   ├── employees.csv       # Сотрудники (username, division_id, staff_id, profession_code, ...)
│   ├── professions.csv     # Профессии и квалификации (code, name)
│   ├── staffs.csv          # Штатные единицы (id, division_id, profession_code)
│   ├── roles.csv           # Назначения ролей сотрудникам (id, username, role_name)
│   └── replacings.csv      # Заказы замещений (id, replacing_username, replaced_username, ...)
├── public/                 # Веб-интерфейс (Single Page Application)
│   ├── index.html          # Разметка дашборда, тестера и инспектора API
│   ├── app.js              # Клиентская логика, предпросмотр API, отрисовка графа
│   └── style.css           # Современные адаптивные стили интерфейса
├── src/                    # Бэкенд на чистом Node.js (Transparent Gateway к OpenFGA)
│   ├── client.js           # SDK-клиент к OpenFGA HTTP API (Check, BatchCheck, ListObjects, ListUsers)
│   ├── graph-tracer.js     # Построение трассировки графа и путей принятия решений
│   ├── import.js           # Компилятор и загрузчик данных из CSV в OpenFGA
│   └── server.js           # Тонкий HTTP API сервер и раздача статики UI
└── test/
    └── test.js             # 79 интеграционных и юнит-тестов всех инвариантов
```

---

## 🧪 Тестирование и инварианты (79 тестов)

Тестовый набор `test/test.js` полностью покрывает логику системы:
1. **Базовый доступ сотрудников**: прямое назначение роли, прямое подразделение, прямая штатка.
2. **Отношения 1:1**: у каждого сотрудника строго одно первичное подразделение и одна профессия.
3. **Иерархия подразделений**: корректная склейка `full_code`, подчиненность `child` / `descendant`.
4. **Замещение 1-го уровня vs. цепочка**:
   - `can_use_direct` разрешает доступ только к ресурсам первого замещаемого.
   - `can_use_chain` успешно транзитивно разрешает доступ через 2+ уровня замещений.
5. **Contextual Tuples**: динамическое вычисление прав на лету без изменения постоянного хранилища.
6. **Пакетная обработка**: параллельное выполнение проверок через BatchCheck API.

---

## 📄 Лицензия

MIT
