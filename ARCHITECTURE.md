# FLOW — Архитектура системы

## Назначение документа

Этот файл является актуальным архитектурным описанием системы FLOW и фиксирует:
- текущее устройство backend, frontend, БД и production-окружения;
- ключевые доменные инварианты цветочного бизнеса;
- границы ответственности между доменными модулями;
- приоритетные зоны роста без смешивания их с эксплуатационным шумом.

Документ описывает текущее состояние платформы. Исторические changelog-блоки ниже сохраняются как архитектурный журнал развития, но источником истины для текущего состояния являются разделы 1–11.

## Архитектурные принципы

- **DDD по бизнес-доменам**: core, nomenclature, inventory, sales, cashier, finance, delivery, marketing и смежные bounded contexts.
- **Shared-schema multi-tenancy**: изоляция данных строится вокруг `organization`, а операционный контекст торговой точки добавляется через `trading_point`.
- **Thin API, fat domain services**: критичная логика склада, кассы, резервов, оплат и сборки букетов должна жить в доменных сервисах и транзакциях БД, а не в UI.
- **Append-mostly для денег и движения товара**: продажи, движения, партии, резервы и финансовые транзакции должны быть аудируемыми и не разрушаться «удобным удалением».
- **Production-first**: система рассчитана на реальную работу магазина с фото букетов, пиковыми датами, резервами, фоновыми задачами и ограниченным VPS-ресурсом.

## 1. Общее описание

**FLOW** — SaaS-платформа для управления цветочным бизнесом. Система охватывает закупку, склад, сборку букетов, кассу, продажи, заказы, доставку, клиентов, персонал, финансы и аналитику в рамках одной мультитенантной платформы.

**Стек технологий:**
- **Backend:** Python 3.12 + Django 6.0 + Django REST Framework 3.16
- **Frontend:** React 19 + TypeScript 5.7 + Material UI 6.4
- **База данных:** PostgreSQL (база `FLOW`)
- **Аутентификация:** JWT (SimpleJWT) — access 2ч, refresh 3д
- **Сборка фронтенда:** Vite 6.1+
- **Графики:** Recharts 2.15
- **Фоновые задачи и кэш:** Celery + Redis
- **Production runtime:** Docker Compose + Gunicorn + Nginx

---

## 2. Структура проекта

```
FLOW/
├── backend/                        # Django-бэкенд
│   ├── config/                     # Конфигурация проекта
│   │   ├── settings.py             # Настройки Django (БД, JWT, CORS, приложения)
│   │   ├── urls.py                 # Корневой маршрутизатор (все API под /api/)
│   │   ├── wsgi.py / asgi.py       # Входные точки серверов
│   │
│   ├── apps/                       # Доменные приложения (12 штук)
│   │   ├── core/                   # Ядро: организация, пользователи, точки, склады
│   │   ├── nomenclature/           # Номенклатура: товары, букеты, шаблоны
│   │   ├── inventory/              # Склад: партии, остатки, движения, инвентаризация
│   │   ├── sales/                  # Продажи и заказы
│   │   ├── cashier/                # Касса (POS): каталог, корзина, checkout, резервы
│   │   ├── customers/              # Клиенты: группы, важные даты, адреса
│   │   ├── suppliers/              # Поставщики: заказы, рекламации
│   │   ├── staff/                  # Персонал: сотрудники, смены, зарплаты
│   │   ├── finance/                # Финансы: кошельки, транзакции, долги
│   │   ├── marketing/              # Маркетинг: каналы, промокоды, скидки, лояльность
│   │   ├── delivery/               # Доставка: зоны, курьеры, доставки
│   │   └── analytics/              # Аналитика: ежедневные сводки, дашборд
│   │
│   ├── media/                      # Загруженные файлы (фото, аватары)
│   └── static/                     # Статические файлы
│
├── frontend/                       # React-фронтенд
│   ├── src/
│   │   ├── main.tsx                # Входная точка (провайдеры, рендер)
│   │   ├── App.tsx                 # Private routing, lazy loading страниц и 404 fallback
│   │   ├── api.ts                  # Axios с JWT-интерцепторами
│   │   ├── theme.ts                # MUI-тема (розово-фиолетовая палитра)
│   │   ├── contexts/
│   │   │   ├── AuthContext.tsx      # Контекст аутентификации (login/logout/user/refreshUser)
│   │   │   └── NotificationContext.tsx # Toast-уведомления (notify)
│   │   ├── components/
│   │   │   ├── Layout.tsx           # Макет: боковая панель + AppBar
│   │   │   ├── DataTable.tsx        # Универсальная таблица с поиском и Skeleton
│   │   │   ├── EntityFormDialog.tsx  # Универсальный диалог формы (create/edit)
│   │   │   └── ConfirmDialog.tsx     # Диалог подтверждения удаления
│   │   └── pages/                   # Страницы (17 шт.)
│   │       ├── LoginPage.tsx        # Авторизация
│   │       ├── DashboardPage.tsx    # Дашборд со статистикой
│   │       ├── ProfilePage.tsx      # Профиль пользователя + смена пароля
│   │       ├── AdminPage.tsx        # Администрирование: организации + пользователи
│   │       ├── NomenclaturePage.tsx # Справочник номенклатуры (CRUD + accounting_type)
│   │       ├── InventoryPage.tsx    # Складской учёт + документы приёмки
│   │       ├── CashierPage.tsx      # Касса (POS): каталог, корзина, checkout
│   │       ├── SalesPage.tsx        # Продажи
│   │       ├── OrdersPage.tsx       # Заказы
│   │       ├── CustomersPage.tsx    # Клиенты (CRUD)
│   │       ├── SuppliersPage.tsx    # Поставщики
│   │       ├── StaffPage.tsx        # Персонал
│   │       ├── FinancePage.tsx      # Финансы (кошельки + транзакции)
│   │       ├── MarketingPage.tsx    # Маркетинг
│   │       ├── DeliveryPage.tsx     # Доставка
│   │       ├── AnalyticsPage.tsx    # Аналитика с графиками
│   │       └── SettingsPage.tsx     # Настройки организации
│   │
│   ├── utils/
│   │   └── extractError.ts      # Извлечение человекочитаемых ошибок DRF
│   │
│   ├── package.json
│   ├── vite.config.ts              # Vite + прокси на Django (:8000)
│   └── tsconfig.json
│
└── ARCHITECTURE.md                 # Этот файл
```

---

## 3. Модели данных (ER-диаграмма по модулям)

### 3.1 Ядро (core)

| Модель | Описание | Ключевые поля |
|--------|----------|---------------|
| **Organization** | Организация (мультитенант) | name, inn, phone, email, is_active, subscription_plan, monthly_price, paid_until, max_users |
| **User** | Пользователь + Сотрудник | organization → Organization, active_organization (SA), role (owner/admin/manager/seller/courier/accountant), phone, avatar, position → Position, trading_point (assigned), active_trading_point (session), hire_date, fire_date, notes |
| **TradingPoint** | Торговая точка | organization → Organization, name, address, manager → User, work_schedule |
| **Warehouse** | Склад | trading_point → TradingPoint, type (main/showcase/fridge/assembly/reserve), is_default_for_receiving, is_default_for_bouquets, is_default_for_sales |
| **PaymentMethod** | Способ оплаты | organization → Organization, name, is_cash, commission_percent, wallet → Wallet |
| **TenantContact** | Контактное лицо тенанта | organization → Organization, name, position, phone, email, is_primary |
| **TenantPayment** | Оплата SaaS-подписки | organization → Organization, amount, payment_date, period_from/to, payment_method, invoice_number, created_by → User |
| **TenantNote** | Журнал взаимодействий | organization → Organization, note_type (call/meeting/support/billing/internal/onboarding/other), subject, content, created_by → User |

**Связи:**
- Organization ← User (many-to-one)
- Organization ← TradingPoint (many-to-one)
- TradingPoint ← Warehouse (many-to-one)
- User → TradingPoint.manager (one-to-many)

### 3.2 Номенклатура (nomenclature)

| Модель | Описание | Ключевые поля |
|--------|----------|---------------|
| **NomenclatureGroup** | Группа/категория | parent → self (иерархия, CASCADE), name, `get_descendant_count()` |
| **MeasureUnit** | Единица измерения | name, short_name |
| **Nomenclature** | Товар | group → NomenclatureGroup, type (12 типов), **accounting_type** (stock_material/finished_bouquet/service), is_template_placeholder, sku, purchase_price, retail_price, min_price, color, country, season, shelf_life, min_stock, image |
| **PurchasePriceHistory** | История закупочных цен | nomenclature → Nomenclature, old_price, new_price, changed_by → User, created_at |
| **BouquetTemplate** | Шаблон букета | nomenclature → Nomenclature, bouquet_name, assembly_time, difficulty, **image** |
| **BouquetComponent** | Компонент букета | template → BouquetTemplate, nomenclature → Nomenclature, quantity, is_required, substitute → Nomenclature |

**Новое:**
- `accounting_type` определяет логику учёта: stock_material (обычный складской товар), finished_bouquet (готовый букет — FIFO по партиям), service (услуга без складского учёта)
- `PurchasePriceHistory` — аудит изменений закупочных цен
- `is_template_placeholder` — скрытая служебная номенклатура для шаблонов букетов; такие позиции не попадают в дерево и обычные селекты номенклатуры
- NomenclatureGroup.parent теперь CASCADE (каскадное удаление вложенных групп)

**Связи:**
- NomenclatureGroup → NomenclatureGroup.parent (рекурсивная иерархия, CASCADE)
- Nomenclature → NomenclatureGroup
- BouquetTemplate ↔ Nomenclature (1:1)
- BouquetComponent → BouquetTemplate + Nomenclature

### 3.3 Склад (inventory)

| Модель | Описание | Ключевые поля |
|--------|----------|---------------|
| **Batch** | Партия товара | nomenclature → Nomenclature, supplier → Supplier, warehouse → Warehouse, purchase_price, quantity, remaining, expiry_date, **receipt_document → ReceiptDocument**, **is_assembly**, **image** |
| **StockBalance** | Остатки (денормализовано) | warehouse → Warehouse, nomenclature → Nomenclature, quantity, avg_purchase_price (unique_together) |
| **StockMovement** | Движение товара | batch → Batch, sale → Sale, type (receipt/write_off/transfer/sale/return/adjustment/assembly), quantity, write_off_reason |
| **ReceiptDocument** | Документ приёмки | number, date, supplier → Supplier, comment, total_cost, created_by → User (unique: organization+number+date) |
| **ReceiptDocumentItem** | Позиция приёмки | document → ReceiptDocument, nomenclature, warehouse, quantity, purchase_price, retail_price, batch → Batch, total |
| **InventoryDocument** | Документ инвентаризации | warehouse → Warehouse, status (draft/in_progress/completed) |
| **InventoryItem** | Позиция инвентаризации | document → InventoryDocument, expected_quantity, actual_quantity, difference |
| **Reserve** | Резерв букета | **trading_point**, reserve_number, customer → Customer, customer_name_snapshot, phone, phone_last4 (индекс), bouquet_nomenclature → Nomenclature, batch → Batch, warehouse → Warehouse, quantity, **status** (active/sold/expired/cancelled), expires_at, sold_sale → Sale |
| **BouquetBatchComponentSnapshot** | Снимок состава букета | batch → Batch, nomenclature → Nomenclature, accounting_type, quantity_per_unit, price_per_unit, sort_order, source_mode |

**Логика:**
- Приёмка товара: ReceiptDocument + Items → `process_receipt_document()` → Batch + StockMovement (receipt) → StockBalance
- `ReceiptDocument.number` может назначаться сервером автоматически при создании документа
- Списание: StockMovement (write_off) с указанием причины → уменьшение StockBalance
- Перемещение: StockMovement (transfer) между складами → два обновления StockBalance
- Инвентаризация: InventoryDocument + InventoryItems → при завершении корректируются остатки
- Резервирование (переработано): привязка к конкретному батчу букета, поиск по phone_last4, автоматическая нумерация, статусная модель (active → sold/expired/cancelled)
- Сборка букета: `assemble_bouquet()` → BouquetBatchComponentSnapshot (фиксация состава для аудита), опциональное фото готового букета в `Batch.image`, обновление цены продажи и сохранение состава/фото в шаблон при `add_to_templates`

### 3.4 Продажи (sales)

| Модель | Описание | Ключевые поля |
|--------|----------|---------------|
| **Sale** | Чек продажи | trading_point → TradingPoint, seller → User, customer → Customer, cash_shift → CashShift, status (open/completed/cancelled), subtotal, discount_percent, discount_amount, total, payment_method → PaymentMethod, promo_code → PromoCode, used_bonuses, earned_bonuses |
| **SaleItem** | Позиция чека | sale → Sale, nomenclature → Nomenclature, batch → Batch, quantity, price, discount_percent, total, **source_mode** (catalog/ready_bouquet/reserve), **reserve → Reserve** |
| **SalesCategory** | Категория кассового каталога | name, icon, sort_order, is_visible_in_cashier, **source_type** (nomenclature/finished_bouquets/reserve), is_system, groups (M2M → NomenclatureGroup) |
| **Order** | Заказ | trading_point, customer, status (new → confirmed → in_assembly → assembled → on_delivery → delivered → completed | cancelled), source (7 типов), recipient_*, delivery_*, prepayment_amount, remaining_amount, florist → User, courier → Courier, promo_code → PromoCode |
| **OrderItem** | Позиция заказа | order → Order, nomenclature, quantity, price, is_custom_bouquet, custom_description |
| **OrderStatusHistory** | История статусов | order → Order, old_status, new_status, changed_by → User, comment |

**Воронка заказа:**
```
new → confirmed → in_assembly → assembled → on_delivery → delivered → completed
                                                                    ↘ cancelled
```

### 3.5 Клиенты (customers)

| Модель | Описание | Ключевые поля |
|--------|----------|---------------|
| **CustomerGroup** | Группа клиентов | name, discount_percent, color |
| **Customer** | Клиент | first_name, last_name, patronymic, gender, birth_date, phone, email, groups (M2M), bonus_points, total_purchases, purchases_count |
| **ImportantDate** | Важная дата | customer → Customer, name, date, remind_days_before |
| **CustomerAddress** | Адрес доставки | customer → Customer, label, address, is_default |

**Связи:**
- Customer ↔ CustomerGroup (M2M — клиент может быть в нескольких группах)
- Customer ← ImportantDate (1:N)
- Customer ← CustomerAddress (1:N)

### 3.6 Поставщики (suppliers)

| Модель | Описание | Ключевые поля |
|--------|----------|---------------|
| **Supplier** | Поставщик | name, contact_person, phone, email, payment_terms, delivery_days, min_order_amount, rating |
| **SupplierNomenclature** | Товар поставщика | supplier + nomenclature (unique_together), supplier_sku, price, min_quantity |
| **SupplierOrder** | Заказ поставщику | supplier → Supplier, status (draft → sent → confirmed → shipped → received | cancelled), total_amount |
| **SupplierOrderItem** | Позиция заказа | order → SupplierOrder, nomenclature, quantity, price, received_quantity |
| **Claim** | Рекламация | supplier_order → SupplierOrder, reason, photos (JSON), status, resolved_amount |

### 3.7 Персонал (staff)

| Модель | Описание | Ключевые поля |
|--------|----------|---------------|
| **Position** | Должность | organization → Organization, name, base_salary |
| **User** | Сотрудник | См. Core (объединённая модель) |
| **PayrollScheme** | Схема оплаты | employee → User, type (fixed/hourly/shift/percent_sales/mixed), rate, percent |
| **Shift** | Смена | employee → User, trading_point, date, start_time, end_time, break_minutes |
| **SalaryAccrual** | Начисление зарплаты | employee → User, period_start/end, base_amount, bonus, penalty, sales_bonus, total, status (pending/approved/paid), paid_from_wallet → Wallet |

**Связи:**
- User содержит поля сотрудника (position, hire_date и т.д.)
- SalaryAccrual → Wallet (из какого кошелька выплачена)

### 3.8 Финансы (finance)

| Модель | Описание | Ключевые поля |
|--------|----------|---------------|
| **Wallet** | Кошелёк | organization → Organization, name, wallet_type (cash/bank_account/card/electronic/personal_card/other), balance, allow_negative, owner → User |
| **TransactionCategory** | Категория операции | name, direction (income/expense), parent → self |
| **Transaction** | Финансовая операция | organization, transaction_type (income/expense/transfer/supplier_payment/salary/personal_expense), amount, wallet_from → Wallet, wallet_to → Wallet, category → TransactionCategory, sale → Sale, order → Order, employee → User, description |
| **Debt** | Долг | organization, debt_type (supplier/employee/customer/other), direction (we_owe/owed_to_us), original_amount, paid_amount, remaining (вычислимое) |

**Ключевые особенности (из ТЗ):**
- Кошелёк `personal_card` — для личных карт сотрудников (закупки за свой счёт)
- `allow_negative` — кошелёк может уходить в минус (создаётся обязательство возврата)
- `personal_expense` — личные расходы сотрудника, требующие компенсации
- `salary` — выплата зарплаты напрямую через кошелёк

### 3.9 Маркетинг (marketing)

| Модель | Описание | Ключевые поля |
|--------|----------|---------------|
| **AdChannel** | Рекламный канал | name, channel_type, is_active |
| **AdInvestment** | Инвестиция в рекламу | channel → AdChannel, amount, date, conversions, revenue |
| **Discount** | Скидка | name, discount_type (percent/fixed), value, apply_to (all/group/nomenclature), target_group → NomenclatureGroup, target_nomenclature → Nomenclature, start_date, end_date |
| **PromoCode** | Промокод | code, discount → Discount, max_uses, used_count, is_active |
| **LoyaltyProgram** | Программа лояльности | program_type (bonus/discount/cashback), accrual_percent, max_payment_percent |

### 3.10 Доставка (delivery)

| Модель | Описание | Ключевые поля |
|--------|----------|---------------|
| **DeliveryZone** | Зона доставки | name, price, free_from, estimated_minutes |
| **Courier** | Курьер | name, phone, courier_type (internal/external/service), vehicle, delivery_rate, is_available |
| **Delivery** | Доставка | order → Order (1:1), courier → Courier, zone → DeliveryZone, status (pending → assigned → picked_up → in_transit → delivered | failed | cancelled), delivery_date, time_from/to, photo_proof, actual_delivered_at |

### 3.12 Касса (cashier)

Модуль POS (Point of Sale) для продажи через кассовый интерфейс. Модели `SalesCategory` и `Reserve` распределены по `sales` и `inventory`, сериализаторы и бизнес-логика в `cashier`.

**Ключевые сценарии:**
1. **Каталог (Feed)** — единый запрос `/feed/` возвращает карточки из 3 источников: номенклатура (stock_material), готовые букеты (finished_bouquet batches), активные резервы.
2. **Checkout** — атомарная транзакция: создание Sale + SaleItems + FIFO-списание + StockMovement + SaleItemComposition (для букетов, из snapshot) + финансовая транзакция.
3. **Резерв** — привязка готового букета к клиенту с телефоном. Поиск по 4 последним цифрам. Автонумерация.
4. **Категории** — настройка кассового каталога. Системные (Готовые букеты, Резерв) + пользовательские (привязка к группам номенклатуры).
   Для категорий с `source_type=nomenclature` в витрину попадают позиции из выбранных групп и всей их дочерней ветки.
5. **Снимки состава** — правая панель кассы и продажа готовых букетов/резервов используют `BouquetBatchComponentSnapshot`, поэтому состав продажи фиксируется по фактической партии, а не по текущему шаблону.
6. **Фото витрины** — POS показывает приоритетно `Batch.image`, затем `BouquetTemplate.image`, затем `Nomenclature.image`.

### 3.11 Аналитика (analytics)

| Модель | Описание | Ключевые поля |
|--------|----------|---------------|
| **DailySummary** | Ежедневная сводка | trading_point → TradingPoint, date, revenue, cost, profit, sales_count, orders_count, avg_check, new_customers, write_offs_amount |

**API дашборда** (`/api/analytics/daily-summary/dashboard/`) возвращает:
- today_revenue, today_sales_count
- month_revenue, active_orders
- total_customers

---

## 4. API (REST endpoints)

Все эндпоинты доступны под префиксом `/api/`. Аутентификация через JWT.

### Аутентификация
| Метод | URL | Описание |
|-------|-----|----------|
| POST | `/api/auth/token/` | Получить access + refresh токены |
| POST | `/api/auth/token/refresh/` | Обновить access токен |
| POST | `/api/auth/token/verify/` | Проверить валидность токена |

### CRUD-эндпоинты (ViewSets)

| Приложение | Префикс | Ресурсы |
|------------|---------|---------|
| core | `/api/core/` | organizations (/tenant-metrics), users (/me, /me/change-password, /me/set-active-org, /{id}/set-password), trading-points, warehouses, payment-methods, tenant-contacts, tenant-payments, tenant-notes, platform-admins (/set-password, /toggle-active) |
| nomenclature | `/api/nomenclature/` | groups (/tree, /delete-info), units, items (/options, /price-history, /update-price), bouquet-templates, bouquet-components |
| inventory | `/api/inventory/` | batches, stock (readonly, /summary, /low-stock, /negative-alerts), movements (**/transfer, /write-off, /assemble-bouquet, /disassemble-bouquet, /correct-bouquet**), inventory-documents, inventory-items, reserves, **receipt-documents** (/process) |
| sales | `/api/sales/` | sales (`/shift-report/` — сводка по кассовым сменам), sale-items, orders, order-items |
| **cashier** | `/api/cashier/` | **categories** (CRUD), **feed** (GET /feed/), **reserves** (CRUD + /cancel, /expire, /search), **checkout** (POST), **snapshots** (readonly) |
| customers | `/api/customers/` | groups, customers, important-dates, addresses |
| suppliers | `/api/suppliers/` | suppliers, supplier-nomenclature, orders, order-items, claims |
| staff | `/api/staff/` | positions, employees, payroll-schemes, shifts, salary-accruals |
| finance | `/api/finance/` | wallets (/summary), categories, transactions, debts |
| marketing | `/api/marketing/` | channels, investments, discounts, promo-codes, loyalty-programs |
| delivery | `/api/delivery/` | zones, couriers, deliveries |
| analytics | `/api/analytics/` | daily-summary (/dashboard) |

Все ViewSets поддерживают: фильтрацию (`DjangoFilterBackend`), поиск (`SearchFilter`), сортировку (`OrderingFilter`). Пагинация: 25 записей на страницу.

---

## 5. Фронтенд — Архитектура

### Маршрутизация (React Router v7)

```
/login           → LoginPage          (публичный)
/                → Layout (sidebar + AppBar)
  /              → DashboardPage       (дашборд со статистикой)
  /nomenclature  → NomenclaturePage    (CRUD-таблица товаров)
   /inventory     → InventoryPage       (остатки, движения, партии)
   /cashier       → CashierPage         (POS: витрина, корзина, checkout, резервы)
  /sales         → SalesPage           (вкладки: «Список продаж» | «Отчёты по сменам»)
  /orders        → OrdersPage          (список заказов)
  /customers     → CustomersPage       (CRUD клиентов)
  /suppliers     → SuppliersPage       (список поставщиков)
  /staff         → StaffPage           (сотрудники, смены, зарплаты)
  /finance       → FinancePage         (кошельки + транзакции)
  /marketing     → MarketingPage       (каналы, промокоды, скидки)
  /delivery      → DeliveryPage        (доставки + курьеры)
  /analytics     → AnalyticsPage       (графики: выручка, прибыль, ср. чек)
  /settings      → SettingsPage        (настройки организации)
  /admin         → AdminPage           (6 вкладок: организации, контакты, оплаты, журнал, обзор/метрики, администраторы)
  /profile       → ProfilePage         (профиль + смена пароля)
```

### AdminPage — Администрирование платформы (6 вкладок)

| Вкладка | Описание | API |
|---------|----------|-----|
| **Организации** | CRUD тенантов, биллинг, тарифы, блокировка | `/api/core/organizations/` |
| **Контакты** | Контактные лица тенантов (ФИО, должность, телефон, email, основной контакт) | `/api/core/tenant-contacts/` |
| **Оплаты** | История оплат SaaS-подписки (суммы, периоды, способ оплаты, счета) | `/api/core/tenant-payments/` |
| **Журнал** | Журнал взаимодействий с тенантом (звонки, встречи, тех. поддержка, биллинг, онбординг) | `/api/core/tenant-notes/` |
| **Обзор** | Агрегированные метрики: кол-во тенантов, пользователей, оборот, потенциальная выручка, оплаты | `/api/core/organizations/tenant-metrics/` |
| **Администраторы** | Управление суперадминами платформы: CRUD, смена пароля, блокировка | `/api/core/platform-admins/` |

### Компоненты

- **Layout.tsx** — тёмная боковая панель (260px, сворачиваемая до 72px) с навигацией, AppBar с пользовательским меню (Мой профиль, Сменить пароль, Выйти), онбординг-баннер для новых пользователей без организации
- **DataTable.tsx** — универсальный табличный компонент: поиск, колонки с рендер-функциями, действия (edit/delete), состояние загрузки (Skeleton), пустое состояние
- **EntityFormDialog.tsx** — универсальный MUI Dialog для создания/редактирования сущностей с кнопками Save/Cancel
- **ConfirmDialog.tsx** — диалог подтверждения удаления с кастомным текстом
- **AuthContext.tsx** — контекст аутентификации: login, logout, fetchUser, **refreshUser**, интерфейс User с `is_superuser`, хранение токенов в localStorage
- **NotificationContext.tsx** — глобальные toast-уведомления (notify(message, severity?)) через MUI Snackbar
- **api.ts** — Axios-экземпляр с интерцепторами: автоматическая подстановка Authorization заголовка, рефреш access-токена при 401, event-based logout (`auth:logout` CustomEvent) вместо жёсткого редиректа

### Тема (MUI)

- **Primary:** розовый (#E91E63) — основные кнопки и акценты
- **Secondary:** фиолетовый (#7C4DFF) — вторичные элементы
- **Шрифт:** Inter
- **Стиль:** скруглённые компоненты, современный дизайн

---

## 6. Аутентификация и авторизация

### JWT (SimpleJWT)
- Access-токен: время жизни 2 часа
- Refresh-токен: время жизни 3 дня
- Ротация refresh-токенов включена
- Токены хранятся в localStorage
- Throttling: 30 req/min (анонимные), 300 req/min (авторизованные)

### Роли пользователей
| Роль | Код | Описание |
|------|-----|----------|
| Владелец | `owner` | Полный доступ ко всей организации |
| Администратор | `admin` | Управление системой и настройками |
| Менеджер | `manager` | Управление точкой, заказами, персоналом |
| Продавец | `seller` | Работа с продажами и клиентами |
| Курьер | `courier` | Просмотр и выполнение доставок |
| Бухгалтер | `accountant` | Финансовые операции и отчёты |

### Мультитенантность
Все данные изолированы по `Organization` и опционально по `TradingPoint`. Каждый пользователь привязан к одной организации. API автоматически фильтрует данные по организации и торговой точке текущего пользователя.

**Двухуровневая система контекста:**
1. **Организация** — базовая изоляция, всегда активна
2. **Торговая точка** — дополнительная фильтрация, активируется выбором в UI

**Защита данных (core/mixins.py):**

#### Тенант-фильтрация: `_tenant_filter(qs, user, org_field='organization', tp_field=None)`
Центральная функция изоляции данных, применённая во **всех 30+ ViewSet-ах**:
- Если пользователь привязан к организации → `qs.filter(**{org_field: user.organization})`
- Если суперпользователь (is_superuser=True) с active_organization → фильтрация по выбранной организации
- Если суперпользователь без выбора → `qs.all()` (видит все организации)
- Если указан `tp_field` и активна торговая точка (`_resolve_tp()`) → дополнительный фильтр `qs.filter(**{tp_field: active_tp})`
- Иначе (не суперпользователь без организации) → `qs.none()` (данные не утекут)

#### Резолвер торговой точки: `_resolve_tp(user)`
Определяет «рабочую» торговую точку пользователя по приоритету:
1. `user.active_trading_point` — явно выбранная через UI (SA, owner, admin)
2. `user.trading_point` — закреплённая торговая точка сотрудника
3. `None` — нет фильтрации по TP (показываются все данные текущей организации)

Поддержка вложенных моделей через `org_field`: для SaleItem → `org_field='sale__organization'`, для OrderItem → `org_field='order__organization'` и т.д.

#### Авто-назначение организации и торговой точки: `OrgPerformCreateMixin`
- Автоматически устанавливает `organization` из `request.user.organization` при создании (POST)
- При обновлении (PATCH/PUT) **не переопределяет** `organization` — сохраняет оригинальное значение и валидирует, что запись принадлежит текущей организации (cross-tenant protection)
- Автоматически устанавливает `trading_point` из `_resolve_tp(request.user)` если модель имеет такое поле
- Внутренний хелпер `_resolve_org(request)` — для суперпользователя берёт org из тела запроса (если передана), иначе из user
- Применён ко всем ViewSet-ам, чья модель имеет поле `organization` (26+ ViewSet-ов)
- Все сериализаторы с полем `organization` имеют `read_only_fields = ['organization']` — невозможно подменить организацию через API

#### RBAC-пермишены:
| Класс | Описание | Применение |
|-------|----------|------------|
| `IsOwnerOrAdmin` | Только owner/admin или superuser | UserViewSet (CRUD пользователей) |
| `IsManager` | owner/admin/manager или superuser | Для управления ресурсами |
| `ReadOnlyOrManager` | Чтение — все; запись — owner/admin/manager | Для справочников |

#### Авто-привязка организации при первом создании:
`OrganizationViewSet.perform_create` — при создании организации автоматически:
1. Привязывает текущего пользователя к созданной организации
2. Устанавливает роль `owner`
3. Фронтенд вызывает `refreshUser()` → токен и UI обновляются без перелогина

#### Дочерние модели
Фильтруются через FK родителя: `sale__organization`, `order__organization`, `customer__organization`, `template__nomenclature__organization` и т.д.

---

## 7. Ключевые бизнес-процессы

### 7.1 Продажа

```
1. Продавец создаёт Sale (статус: open)
2. Добавляет SaleItem (привязка к Nomenclature + Batch)
3. Указывает PaymentMethod и клиента (Customer)
4. Завершает продажу (статус: completed)
   → Списание со склада (StockMovement.type = sale)
   → Обновление StockBalance
   → Начисление бонусов клиенту (если LoyaltyProgram)
   → Создание Transaction (income)
```

### 7.2 Заказ с доставкой

```
1. Менеджер создаёт Order (source: phone/website/instagram и др.)
2. Добавляет OrderItem (возможен custom_bouquet)
3. Принимает предоплату (prepayment_amount)
4. Order проходит статусы: new → confirmed → in_assembly
5. Флорист собирает букет → assembled
6. Создаётся Delivery, назначается Courier → on_delivery
7. Курьер доставляет, загружает photo_proof → delivered
8. Получение остатка оплаты → completed
   → Создание Sale, Transaction
   → Обновление склада
```

### 7.3 Закупка у поставщика

```
1. Менеджер создаёт SupplierOrder (статус: draft)
2. Добавляет SupplierOrderItem
3. Отправляет заказ → sent → confirmed → shipped
4. Получение товара → received
   → Создание Batch для каждой позиции
   → StockMovement (type: receipt)
   → Обновление StockBalance
   → Transaction (expense: supplier_payment)
   → Возможно создание Debt (если не полная оплата)
```

### 7.4 Начисление зарплаты

```
1. Бухгалтер создаёт SalaryAccrual за период
2. Система считает: base + bonus - penalty + sales_bonus = total
3. Утверждение (status: approved)
4. Выплата из Wallet → status: paid
   → Transaction (type: salary)
   → Указание paid_from_wallet
```

### 7.5 Учёт личных расходов (особенность из ТЗ)

```
1. Сотрудник покупает товар на личную карту
2. Создаётся Transaction (type: personal_expense)
   → wallet_from = личный кошелёк (personal_card, allow_negative=true)
   → Баланс кошелька уходит в минус (долг организации)
3. Организация компенсирует расход
   → Transaction (transfer) из кошелька организации на personal_card
   → Баланс возвращается к 0
```

---

## 8. Конфигурация

### Django (config/settings.py)
- `AUTH_USER_MODEL = 'core.User'` — кастомная модель пользователя
- `DEFAULT_PAGINATION_CLASS` — 25 записей на страницу
- `DATETIME_FORMAT = 'iso-8601'` — ISO-формат дат в API (совместимость с HTML5 date-input)
- `DATE_FORMAT = 'iso-8601'` — ISO-формат дат
- `DATE_INPUT_FORMATS` — принимает ISO-8601 и `dd.mm.yyyy`
- `CORS_ALLOWED_ORIGINS` — из переменной окружения `CORS_ALLOWED_ORIGINS` (по умолчанию: `http://localhost:3000`, `http://localhost:5173`, `http://127.0.0.1:5173`)
- `DEFAULT_THROTTLE_RATES`: `anon: 30/min`, `user: 300/min`
- `TIME_ZONE = 'Europe/Moscow'`
- `LANGUAGE_CODE = 'ru'`

### Vite (vite.config.ts)
- Dev-сервер на порту `3000`
- Прокси `/api` → `http://127.0.0.1:8000` (Django)

### PostgreSQL
- Имя БД: `FLOW`
- Хост: `127.0.0.1:5432`
- Пользователь: `postgres`

---

## 9. Запуск системы

### Бэкенд
```bash
cd backend
pip install django djangorestframework django-cors-headers django-filter psycopg2-binary Pillow djangorestframework-simplejwt
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver        # → http://127.0.0.1:8000
```

### Фронтенд
```bash
cd frontend
npm install
npm run dev                       # → http://localhost:3000
```

### Учётные данные
- **Суперпользователь:** создаётся отдельно через `python manage.py createsuperuser`
- **Админ-панель Django:** http://127.0.0.1:8000/admin/
- **API:** http://127.0.0.1:8000/api/
- **Фронтенд:** http://localhost:3000

---

## 10. Масштабирование и развитие

### Что реализовано
- ✅ Полная схема БД (30+ таблиц, 44+ моделей)
- ✅ REST API со всеми CRUD-операциями
- ✅ JWT-аутентификация с рефрешем
- ✅ Фронтенд с 17 страницами и role-aware навигацией
- ✅ Дашборд со статистикой и графиками
- ✅ CRUD для всех сущностей (номенклатура, клиенты, поставщики, персонал и др.)
- ✅ Мультитенантная архитектура с полной изоляцией данных (`_tenant_filter`)
- ✅ RBAC-пермишены (IsOwnerOrAdmin, IsManager, ReadOnlyOrManager)
- ✅ Защита organization: read_only в сериализаторах + auto-set через OrgPerformCreateMixin
- ✅ Мультитенантная фильтрация дочерних моделей через FK родителя
- ✅ FIFO-движок (inventory/services.py): приёмка партий, сборка/раскомплектовка букетов, списание, перемещение
- ✅ ISO-8601 формат дат в API (корректная работа с HTML5 date input)
- ✅ Аналитический дашборд (revenue, sales count, active orders, customers)
- ✅ Страница администрирования (AdminPage): управление организациями + пользователями (CRUD, роли, смена пароля)
- ✅ Страница профиля (ProfilePage): редактирование личных данных + смена собственного пароля
- ✅ Пользовательское меню в AppBar: Мой профиль, Сменить пароль, Выйти
- ✅ Онбординг-баннер в Layout для новых пользователей без организации
- ✅ API: `GET/PATCH /users/me/` — просмотр и обновление профиля
- ✅ API: `POST /users/me/change-password/` — смена собственного пароля (с проверкой старого)
- ✅ `is_superuser` передаётся на фронтенд — суперпользователь имеет доступ к Администрированию
- ✅ Авто-привязка пользователя к организации при создании (perform_create + refreshUser)
- ✅ Общие компоненты (DataTable, EntityFormDialog, ConfirmDialog, NotificationContext)
- ✅ Фронтенд не передаёт organization в POST/PATCH — бэкенд назначает автоматически
- ✅ FIFO-списание при продажах (Sale → FIFO write-off при completed + is_paid)
- ✅ Безопасная генерация номеров чеков (Max + select_for_update вместо count)
- ✅ Финансовые транзакции с select_for_update и проверкой allow_negative
- ✅ Откат баланса кошельков при обновлении/удалении транзакций
- ✅ Cross-tenant валидация FK в inventory (BatchViewSet, write-off, transfer, assemble, disassemble, correct)
- ✅ @transaction.atomic на correct-bouquet endpoint
- ✅ Tenant isolation для ImportantDateViewSet, CustomerAddressViewSet (perform_create)
- ✅ Tenant isolation для PayrollSchemeViewSet (perform_create)
- ✅ Atomic Employee+User creation (transaction.atomic в EmployeeSerializer.create)
- ✅ EmployeeSerializer: auto-generate username (`emp_XXXXXXXX`) если не указан
- ✅ EmployeeSerializer: валидация уникальности username
- ✅ MeasureUnitViewSet — добавлен IsAuthenticated
- ✅ Role-based навигация в Layout (allowedRoles per nav item)
- ✅ Убраны демо-креденшалы со страницы логина

- ✅ Двухуровневый контекст: Organization + TradingPoint (фильтрация + авто-назначение)
- ✅ `_resolve_tp(user)` — резолвер торговой точки с приоритетами (active_tp → employee.tp → None)
- ✅ Все ViewSet-ы поддерживают `tp_field` для фильтрации по торговой точке
- ✅ Все фронтенд-страницы автоматически обновляют данные при смене торговой точки
- ✅ `api.ts` — event-based logout (CustomEvent) вместо `window.location.href`
- ✅ BouquetTemplate.organization FK + data migration
- ✅ MeasureUnit — запись ограничена IsPlatformAdmin
- ✅ BouquetComponent, SupplierNomenclature — cross-tenant валидация FK при записи
- ✅ Throttling: 30/min (анонимные), 300/min (авторизованные)
- ✅ JWT: access 2ч (было 12ч), refresh 3д (было 7д)
- ✅ CORS: `CORS_ALLOWED_ORIGINS` из env var (было `CORS_ALLOW_ALL = True`)
- ✅ Пароли: добавлены CommonPasswordValidator + NumericPasswordValidator
- ✅ EmployeeSerializer: проверка max_users перед созданием User
- ✅ correct_bouquet: FIFO-списание вместо прямого StockMovement
- ✅ Sale number: Cast to Integer + Max (исправлен баг строковой сортировки)

### Аудит (2026-02-28) — Критические исправления
- ✅ StockMovement.sale FK — прямая связь движений со сделкой (вместо notes__contains partial match)
- ✅ Идемпотентный FIFO-write-off (do_sale_fifo_write_off проверяет наличие движений перед повторным применением)
- ✅ Откат продажи по FK sale= вместо notes__contains (исключена порча данных при совпадении номеров #1 / #10 / #11)
- ✅ SaleSerializer.update() вызывает rollback FIFO перед заменой позиций completed-продажи
- ✅ disassemble_bouquet списание через FIFO + _update_stock_balance (вместо orphan StockMovement)
- ✅ _update_stock_balance через DB aggregate (Sum/F) вместо Python-цикла O(N)
- ✅ OrgPerformCreateMixin.perform_update() больше не переносит записи между организациями
- ✅ Cross-tenant валидация при обновлении записей (instance.organization_id == current org)
- ✅ Composite indexes: idx_batch_fifo, idx_movement_org_type_sale, idx_movement_org_nom_date
- ✅ NomenclatureGroup.parent: CASCADE → SET_NULL (предотвращение каскадного удаления дерева)
- ✅ Discount: target_group и target_nomenclature FK (для apply_to=group/nomenclature)
- ✅ InventoryItem.save() автоматически вычисляет difference = actual_quantity - expected_quantity
- ✅ config/settings.py: DEBUG=False по умолчанию, HSTS, secure cookies, CSRF secure в production
- ✅ config/urls.py: /api/health/ endpoint (проверка БД + JSON статус)
- ✅ core/serializers.py: validate_password через Django validators (UserCreateSerializer)
- ✅ staff/views.py: permission_classes на EmployeeViewSet, PositionViewSet, PayrollSchemeViewSet
- ✅ staff/serializers.py: validate_role — запрет self-escalation до owner
- ✅ sales/views.py: ReadOnlyOrManager на OrderViewSet, SaleItemViewSet, OrderItemViewSet
- ✅ api.ts (frontend): JWT refresh queue (isRefreshing + failedQueue — устранена гонка параллельных 401)
- ✅ InventoryPage.tsx: корректный парсинг float-количества (Number() вместо parseInt())
- ✅ FinancePage.tsx: устранена двойная загрузка категорий
- ✅ Admin: зарегистрированы TenantContact, TenantPayment, TenantNote, CashShift, OrderStatusHistory

### Рекомендации по развитию
- ✅ ~~Расширить RBAC на все ViewSet-ы~~ — **Исправлено**: ReadOnlyOrManager на sales, finance (transactions, debts), IsOwnerOrAdmin на wallets
- ✅ ~~Бизнес-логика Transaction → автоматическое обновление Wallet.balance~~ — **Исправлено**: TransactionViewSet.perform_create/update/destroy обновляет balance через F() + select_for_update
- ✅ ~~Автонумерация продаж~~ — **Исправлено**: SaleSerializer.create() генерирует номер чека через Max + select_for_update
- ✅ ~~SaleSerializer items read_only~~ — **Исправлено**: добавлен items_data (writable) для вложенного создания/обновления позиций
- ✅ ~~Analytics dashboard request.user.organization~~ — **Исправлено**: используется _resolve_org()
- ✅ ~~max_users не проверяется~~ — **Исправлено**: UserViewSet.perform_create() проверяет лимит
- ✅ ~~Бизнес-логика Sale.complete() → FIFO-списание~~ — **Исправлено**: FIFO-списание при status=completed + is_paid
- ✅ ~~BatchViewSet.create(): проверка cross-tenant владения объектами~~ — **Исправлено**: _validate_org_fk() во всех inventory actions
- 🔲 Бизнес-логика Order: валидация переходов статусов, автоматический OrderStatusHistory
- 🔲 NomenclatureGroupSerializer: ограничение глубины рекурсии
- ✅ ~~PromoCode: атомарный инкремент used_count через F() при применении~~ — **Исправлено** (Audit Pass 5): `update_customer_stats` инкрементирует `used_count` через F(), `rollback_sale_effects_before_delete` декрементирует
- ✅ ~~Начисление бонусов клиенту при продаже (LoyaltyProgram)~~ — **Исправлено** (Audit Pass 1): `update_customer_stats` начисляет `earned_bonuses` по LoyaltyProgram
- 🔲 N+1 query оптимизация (select_related/prefetch_related во всех ViewSet-ах)
- 🔲 Code-splitting (dynamic import) для уменьшения размера бандла (~1.2MB)
- 🔲 Вынести SECRET_KEY, DB-пароль и другие secrets в переменные окружения (django-environ)
- ✅ ~~DEBUG=False + настроить ALLOWED_HOSTS + CORS для продакшена~~ — **Исправлено**: DEBUG=False default, HSTS, secure cookies в production
- ✅ ~~Автонумерация заказов/продаж (4-значная нумерация)~~ — **Исправлено**: Max + select_for_update
- 🔲 Коды резерва (6-значные)
- 🔲 Программа лояльности: уровни Bronze/Silver/Gold
- 🔲 Прогрессивные шкалы оплаты труда
- 🔲 P&L отчёт, ABC-анализ номенклатуры
- 🔲 WebSocket-уведомления (Django Channels)
- 🔲 Telegram-бот для приёма заказов
- 🔲 Интеграция с 1С (экспорт/импорт)
- 🔲 Печать чеков / этикеток
- 🔲 Мобильное приложение (React Native / PWA)
- 🔲 Redis для кеширования и Celery для фоновых задач
- 🔲 Автоматические отчёты и email-рассылки

---

## Changelog (2026-03-26) — История цен, поиск компонентов букета, исправление шаблонов, nginx cache

### Backend
- ✅ Модель `PurchasePriceHistory` расширена полем `retail_price` (nullable) для хранения розничной цены наряду с закупочной
- ✅ `NomenclatureViewSet.perform_update()` — при ручном изменении `purchase_price` или `retail_price` автоматически создаётся запись в `PurchasePriceHistory` (source: «Ручное изменение»)
- ✅ `NomenclatureViewSet.update_price()` — быстрое изменение цены также создаёт запись в истории (source: «Быстрое изменение цены»)
- ✅ Исправлен `NomenclatureViewSet.get_queryset()` — фильтр `is_template_placeholder=False` теперь применяется только для action `list`, что позволяет редактировать шаблоны букетов (ранее возвращал 404 «No Nomenclature matches the given query»)
- ✅ Миграция `0014_purchasepricehistory_retail_price` — добавление nullable `retail_price` в `PurchasePriceHistory`

### Frontend
- ✅ Таблица «История цен» теперь отображает оба столбца: «Закупочная» и «Розничная»
- ✅ Поиск компонентов букета: `<TextField select>` заменён на `<Autocomplete>` с текстовым поиском (аналогично сборке в модуле «Склад»)
- ✅ В строке компонента букета отображается розничная цена выбранной позиции
- ✅ Под компонентами показывается расчётная розничная стоимость букета (сумма retail_price × quantity)

### DevOps / nginx
- ✅ `nginx.conf`: добавлен `Cache-Control: no-cache` для корневого location `/` — браузер всегда запрашивает свежий `index.html`, что устраняет ошибку «Failed to fetch dynamically imported module» после редеплоя (Vite меняет хэши чанков при каждой сборке)

---

## Changelog (2026-03-13) — Номенклатура: hotfix ошибок создания и ускорение загрузки

### Исправления backend
- ✅ Исправлена причина `500 Internal Server Error` при создании и чтении групп номенклатуры: `NomenclatureGroupSerializer` снова содержит поле `children` в `Meta.fields`, из-за чего DRF больше не падает на сериализации ответа
- ✅ Добавлена валидация `parent` в `NomenclatureGroupSerializer`: нельзя привязать группу к другой организации и нельзя сделать цикл через саму себя/своих потомков
- ✅ Эндпоинт `GET /api/nomenclature/groups/tree/` переписан без рекурсивного N+1-сериализатора: дерево собирается из двух плоских запросов (`groups` + `items`) и возвращается уже в готовой иерархии
- ✅ Добавлен лёгкий эндпоинт `GET /api/nomenclature/items/options/` для селектов и шаблонов букетов: отдаёт все позиции без тяжёлого detail payload и без пагинационной отсечки в 25 записей
- ✅ Добавлен лёгкий эндпоинт `GET /api/inventory/stock/low-stock/` для дашборда: сервер сам выбирает top-N позиций с низким остатком вместо выгрузки всего склада

### Исправления frontend
- ✅ В `NomenclaturePage.tsx` исправлен payload создания/редактирования товара: пустые `stem_length`, `diameter`, `default_shelf_life_days` теперь отправляются как `null`, а не как пустая строка
- ✅ Исправлено имя поля срока годности: frontend использует `default_shelf_life_days`, полностью синхронно с моделью Django
- ✅ В форму номенклатуры возвращены управляемые поля `Ростовка / длина`, `Диаметр`, `Срок годности по умолчанию`
- ✅ Убрана вкладка **«Группы»** из блока «Номенклатура»; управление группами осталось в дереве через кнопки и диалоги
- ✅ Страница «Номенклатура» больше не делает лишний запрос к `GET /api/nomenclature/groups/` при открытии; список групп для селектов строится прямо из уже загруженного дерева
- ✅ Полные списки `units` и `items` загружаются лениво: только при открытии соответствующего диалога или вкладки шаблонов
- ✅ В `api.ts` retry-логика для GET-запросов ограничена сетевыми и gateway-ошибками (`408/429/502/503/504`); `500` больше не ретраится по кругу и не замедляет открытие страниц при серверной ошибке
- ✅ `DashboardPage.tsx` переведён на `Promise.allSettled()` и новый endpoint `/inventory/stock/low-stock/`, поэтому частичный сбой одного виджета больше не блокирует весь дашборд
- ✅ `extractError.ts` получил человекочитаемые подписи для `stem_length`, `diameter`, `default_shelf_life_days`

### Production verification
- ✅ После деплоя подтверждена работоспособность: `/api/health/` отвечает `200 OK`, `/api/nomenclature/groups/tree/` отвечает корректным деревом, frontend собран и отдает новый bundle

### Runtime hardening for 2 GB VPS
- ✅ Backend-контейнер переведён на облегчённый профиль запуска: `gunicorn --workers 1 --threads 4 --worker-class gthread --timeout 180`
- ✅ `collectstatic` и `migrate` вынесены из `CMD` контейнера в `deploy.py`, чтобы рестарты backend больше не тратили память и CPU на лишние стартовые операции
- ✅ Celery worker переведён в более лёгкий режим: `--pool=solo --concurrency=1 --without-gossip --without-mingle --without-heartbeat`
- ✅ Уровень логирования Celery/Celery Beat снижен до `warning` для уменьшения шума и накладных расходов на слабом VPS

---

## Changelog (2026-03-12) — Переработка блока «Номенклатура»: дерево, группы, UX

### Backend
- ✅ **Удалено поле `sort_order`** из модели `NomenclatureGroup` — миграция `0009_remove_nomenclaturegroup_sort_order`
- ✅ Сортировка групп переведена на **алфавитную** (`ordering = ['name']`) на всех уровнях вложенности
- ✅ Новый эндпоинт `GET /api/nomenclature/groups/tree/` — возвращает полное дерево номенклатуры:
  - Поле `groups` — рекурсивный массив групп с вложенными `children` и `items`
  - Поле `root_items` — позиции без группы (корневой уровень)
- ✅ Новые сериализаторы: `NomenclatureGroupTreeSerializer`, `NomenclatureTreeItemSerializer`
- ✅ Убрано поле `sort_order` из `NomenclatureGroupSerializer`, `admin.py`

### Frontend (NomenclaturePage)
- ✅ **Вкладка «Номенклатура»** полностью переработана на **древовидное отображение**:
  - Группы показываются как раскрывающиеся папки с иконками 📁/📂
  - Внутри каждой группы: сначала дочерние группы, затем номенклатурные позиции
  - Компактные строки (32–36px высоты) для максимального количества на экране
  - Поиск с автораскрытием найденных ветвей
  - Кнопки «Развернуть все» / «Свернуть все»
  - Счётчик позиций в каждой группе и общий
- ✅ **Кнопка «Добавить позицию»**: без выбора — в корень; с выделенной группой — в эту группу
- ✅ **Кнопка «Добавить группу»**: без выбора — в корень; с выделенной группой — как дочерняя
- ✅ Выбранная группа выделяется визуально + информационный баннер с подсказкой
- ✅ **Убран столбец «Группа»** из отображения позиций (теперь ясен из дерева)
- ✅ **Убрано поле «Сортировка»** из формы создания/редактирования группы
- ✅ Вкладка «Группы» (tab 1) также очищена от колонки sort_order

---

## Changelog (2026-03-12) — Hotfix: восстановление Celery worker и beat

### Продакшен-инцидент
- ✅ Выявлена причина постоянного рестарта `flow-celery-1` и `flow-celery-beat-1`: синтаксическая ошибка в [backend/apps/inventory/tasks.py](backend/apps/inventory/tasks.py)
- ✅ Корневая причина: в docstring функции `check_expiring_batches()` были закоммичены экранированные кавычки `\"\"\"`, из-за чего Python падал на импорте модуля с `SyntaxError`

### Исправление
- ✅ Исправлен docstring в `check_expiring_batches()` на корректный Python-синтаксис
- ✅ Удалены неиспользуемые импорты `Warehouse` и `Sum`
- ✅ После hotfix Celery worker и Celery Beat должны запускаться штатно и снова выполнять фоновые задачи по контролю скоропортящихся партий

---

## Changelog (2026-03-09) — Enterprise-аудит: 43 бэкенд + 30 фронтенд проблем

### P0 — Критические Runtime-ошибки

**inventory/views.py — NameError: `_validate_org_fk` не определён**
- ✅ Функция `_validate_org_fk(instance, org, label)` использовалась 20+ раз во всех actions (create, write-off, transfer, assemble, disassemble, correct), но тело функции отсутствовало → каждый вызов падал с `NameError`
- ✅ Добавлено определение: проверяет `instance.organization_id != org.id`, поднимает DRF `ValidationError`

**finance/views.py — CashShift.close() не закрывала смену**
- ✅ Метод `close()` рассчитывал `discrepancy`, но **не устанавливал** `status=CLOSED`, `closed_by`, `closed_at`, `notes`
- ✅ Исправлено: полный цикл закрытия с сохранением всех полей

### P1 — Логические и Бизнес-ошибки

**analytics/tasks.py — Полная переработка `calculate_daily_summary`**
- ✅ Старая версия не передавала `organization` → `IntegrityError` (NOT NULL нарушение)
- ✅ Не считала `cost`, `profit`, `avg_check`, `orders_count`, `new_customers`, `write_offs`
- ✅ Переписана с `select_related('organization')` и полным расчётом всех 9 метрик DailySummary

**sales/serializers.py — Удаление дублированного кода**
- ✅ Удалён второй экземпляр `_CompositionWriteSerializer` (полный дубль класса)
- ✅ Удалены дублированные поля `bouquet_components` в `SaleItemWriteSerializer` и `OrderItemWriteSerializer`

**nomenclature/models.py — Дублирование индексов**
- ✅ Удалён второй блок `indexes` в `Nomenclature.Meta` (полный дубль 4 индексов)

**suppliers/views.py — Неверный fallback склада при приёмке**
- ✅ `receive()` искал `is_default_for_sales=True` вместо `is_default_for_receiving=True`

**sales/models.py — Каскадное удаление номенклатуры удаляло продажи**
- ✅ `SaleItem.nomenclature`: `CASCADE` → `PROTECT`
- ✅ `OrderItem.nomenclature`: `CASCADE` → `PROTECT`

**finance/models.py — Каскадное удаление родительской категории**
- ✅ `TransactionCategory.parent`: `CASCADE` → `SET_NULL` (предотвращение каскадного удаления дерева категорий)

### P2 — Meta Ordering для стабильной пагинации

Добавлен `ordering` во все Django-модели для устранения `UnorderedObjectListWarning` и обеспечения детерминированной пагинации:

| Приложение | Модели | Ordering |
|------------|--------|----------|
| core | Organization, TradingPoint, Warehouse, PaymentMethod | `['name']` |
| core | User | `['last_name', 'first_name']` |
| finance | Wallet, TransactionCategory | `['name']` |
| finance | Debt | `['-created_at']` |
| customers | CustomerGroup | `['name']` |
| customers | CustomerAddress | `['-is_default', 'label']` |
| suppliers | Supplier | `['name']` |
| suppliers | SupplierNomenclature | `['supplier', 'nomenclature']` |
| suppliers | SupplierOrderItem | `['order']` |
| delivery | DeliveryZone, Courier | `['name']` |
| marketing | AdChannel, Discount, LoyaltyProgram | `['name']` |
| marketing | PromoCode | `['code']` |
| staff | Position | `['name']` |
| staff | PayrollScheme | `['-started_at']` |
| inventory | StockBalance | `['warehouse', 'nomenclature']` |
| inventory | InventoryDocument, Reserve | `['-created_at']` |

### P1 — Frontend

**NomenclaturePage.tsx — Дублированные поля**
- ✅ Удалены дублированные `stem_length` и `diameter` в интерфейсе `NomItem`, `defaultItemForm`, и `openItemDlg`

**api.ts — Timeout и Retry**
- ✅ Добавлен `timeout: 30000` (было без ограничения)
- ✅ Retry-логика исключает 401 из кандидатов на повторную попытку

**App.tsx — 404 Catch-all**
- ✅ Добавлен `<Route path="*">` → страница «Страница не найдена» с навигацией на дашборд

**Итого:** 2 P0, 9 P1, 24 P2 = **35 проблем исправлено**

---

## Changelog — Глубокий 5-проходный аудит (Passes 1–5)

### Audit Pass 1 — Инфраструктурные и бизнес-критические баги
- ✅ **C1**: FIFO-списание потеряно при обновлении позиций completed-продажи (rollback + re-apply)
- ✅ **C2**: TOCTOU race condition при открытии кассовой смены (`select_for_update` + `UniqueConstraint`)
- ✅ **C3**: `sale.total = order.remaining` вместо `order.total` — нарушение инварианта суммы
- ✅ **C4**: Checkout коммитил Sale ДО transition_to — невалидный переход оставлял мусорную продажу
- ✅ **C5**: `InsufficientStockError` не обрабатывалась → 500 error при нехватке на складе
- ✅ **H3**: Промокод/бонус validation (достаточность бонусов, max_payment_percent, активность промокода)
- ✅ **H4**: Промокод: проверка срока действия, лимита использований
- ✅ **H6**: Sale items — добавлен write-only `items_data` поле для SaleSerializer
- ✅ **H7**: Авто-привязка кассовой смены к продаже при создании
- ✅ **H8**: Auto `completed_at` при переходе в completed
- ✅ **M1**: `sale.number` генерация через `generate_sale_number()` — Cast to Integer + Max safe
- ✅ **M4**: `ReadOnlyOrManager` permission на finance viewsets (debt, transaction)
- ✅ **M5**: Expected balance calculation при закрытии кассовой смены
- ✅ **F1**: SalesPage — promo_code select + used_bonuses input
- ✅ **F2**: OrdersPage — responsible/florist/courier selects
- ✅ **F3**: SuppliersPage — receive shipment dialog (warehouse, create_debt)
- ✅ **F4**: DataTable — debounce 350ms на поиске

### Audit Pass 2 — Логические ошибки в бизнес-потоках
- ✅ **CRITICAL**: Checkout — ранняя проверка `can_transition_to('completed')` ПЕРЕД созданием Sale
- ✅ **HIGH**: Edit sale — FIFO re-apply после rollback + замена позиций
- ✅ **HIGH**: Rollback — корректный откат `bonus_points` (earned/used через `earned_bonuses`/`used_bonuses`)
- ✅ **HIGH**: PATCH transaction — fallback к existing wallet_from/wallet_to при частичном обновлении
- ✅ **MEDIUM**: `SaleSerializer.validate()` — получение organization из `request.user` при создании
- ✅ **MEDIUM**: `sale.total = order.total` (не `remaining`) — инвариант суммы
- ✅ **LOW**: `create_debt` parsing — корректная проверка falsy values (`False, 'false', '0', 0`)

### Audit Pass 3 — Безопасность, race conditions, API-целостность
- ✅ **CRITICAL**: FIFO при update items — проверка ТЕКУЩЕГО статуса (`now_still_completed_paid`), а не старого
- ✅ **CRITICAL**: OrderSerializer — добавлены `OrderItemWriteSerializer` + `items_data` + `_create_order_items()`/`_recalc_order_totals()`
- ✅ **HIGH**: SalesPage — промокоды рендерят `pc.code` вместо `pc.name` (PromoCode не имеет `name`)
- ✅ **MEDIUM**: delivery/views.py — добавлен `permission_classes = [ReadOnlyOrManager]` на все 3 viewset-а
- ✅ **MEDIUM**: suppliers receive — whitelist допустимых статусов (`CONFIRMED`, `SHIPPED`)
- ✅ **MEDIUM**: `_update_stock_balance` — обработка `IntegrityError` при параллельном создании StockBalance
- ✅ **MEDIUM**: Суперадмин org — `_resolve_org(request.user)` вместо `request.user.organization`
- ✅ **LOW**: DataTable — cleanup debounce timer при unmount (`useEffect(() => () => clearTimeout(...)`)

### Audit Pass 4 — Дублирование данных, совместимость моделей
- ✅ **CRITICAL**: Двойной `update_customer_stats` при items_data + open→completed → P4 fix: only re-apply stats when `was_completed_paid`
- ✅ **HIGH**: `_recalc_order_totals` — Order имеет `discount_amount` (не `discount_percent`), добавлен `delivery_cost`
- ✅ **MEDIUM**: OrdersPage `StatusEntry` — поле `new_status` (не `status`) для корректного отображения timeline

### Audit Pass 5 — Защита данных, обход валидации, промокоды
- ✅ **CRITICAL**: Откат FIFO при reversal completed→open/cancelled БЕЗ замены items (`_rollback_sale_fifo`)
- ✅ **HIGH**: Bypass `max_payment_percent` бонусов через forged `subtotal` → добавлены в `read_only_fields`
- ✅ **MEDIUM**: `promo_code.used_count` inflate при каждом edit → `rollback_sale_effects_before_delete` декрементирует
- ✅ **MEDIUM**: Промокод без customer — `update_customer_stats` вызывается всегда (promo-часть не зависит от customer)

**Итого за 5 проходов:** 7 CRITICAL, 8 HIGH, 14 MEDIUM, 3 LOW = **32 бага исправлено**

---

## Changelog (2026-02-28) — Глубокий аудит: критические исправления данных, безопасность, производительность

### Критические исправления целостности данных

**sales/services.py — Откат продажи по FK вместо partial match**
- ✅ `rollback_sale_effects_before_delete()` переведён на `StockMovement.objects.filter(sale=sale)` вместо `notes__contains=f'#{sale_number}'`
- **Причина**: `notes__contains='#1'` захватывал движения от продаж #10, #11, #100 и т.д. — разрушая данные складского учёта
- ✅ `do_sale_fifo_write_off()` стал идемпотентным: проверяет `StockMovement.objects.filter(sale=sale, movement_type='sale').exists()` перед повторным применением
- ✅ Все `StockMovement.objects.create()` в FIFO-движке теперь передают `sale=sale` FK

**inventory/services.py — Orphan movements + DB aggregate**
- ✅ `disassemble_bouquet()` — секция списания компонентов теперь использует FIFO (`fifo_write_off`) + `_update_stock_balance()` вместо одиночного `StockMovement.create()` без обновления баланса
- ✅ `_update_stock_balance()` переведён на DB aggregate: `Batch.objects.filter(...).aggregate(total_remaining=Sum('remaining'), total_cost=Sum(F('remaining') * F('purchase_price')))` вместо Python-цикла O(N) по всем партиям
- ✅ `process_sale_items()` — StockMovement теперь включает `sale=sale` FK

**sales/serializers.py — Double FIFO prevention**
- ✅ `SaleSerializer.update()` теперь вызывает `rollback_sale_effects_before_delete(sale)` перед заменой позиций completed-продажи — предотвращает двойное FIFO-списание

**inventory/models.py — Новые поля и индексы**
- ✅ `StockMovement.sale` — FK к `sales.Sale` (SET_NULL, nullable) — прямая связь движения с продажей
- ✅ `idx_batch_fifo` — составной индекс: (organization, warehouse, nomenclature, remaining)
- ✅ `idx_movement_org_type_sale` — составной индекс: (organization, movement_type, sale)
- ✅ `idx_movement_org_nom_date` — составной индекс: (organization, nomenclature, created_at)
- ✅ `InventoryItem.save()` — автоматически вычисляет `difference = actual_quantity - expected_quantity`

### Безопасность

**core/mixins.py — Cross-tenant protection**
- ✅ `perform_update()` больше НЕ переопределяет `organization` через `serializer.save(organization=org)` — это позволяло переносить записи между организациями
- ✅ Новая валидация: `instance.organization_id == org.id` после сохранения — 403 при попытке cross-tenant editing

**config/settings.py — Production hardening**
- ✅ `DEBUG = os.getenv('DJANGO_DEBUG', 'False') == 'True'` (было `True` по умолчанию)
- ✅ Production-only: `SECURE_HSTS_SECONDS=31536000`, `SESSION_COOKIE_SECURE`, `CSRF_COOKIE_SECURE`, `SECURE_BROWSER_XSS_FILTER`
- ✅ `ALLOWED_HOSTS` default: `['localhost', '127.0.0.1']` вместо `['*']`

**core/serializers.py — Password validation**
- ✅ `UserCreateSerializer.validate_password()` подключает Django password validators (MinLength, Common, Numeric)

**staff — Permission hardening**
- ✅ `EmployeeViewSet`: `permission_classes=[IsOwnerOrAdmin]`
- ✅ `PositionViewSet`: `permission_classes=[IsManager]`
- ✅ `PayrollSchemeViewSet`: extends `OrgPerformCreateMixin`, `permission_classes=[IsManager]`
- ✅ `EmployeeSerializer.validate_role()` — запрет назначения role='owner' для non-owner пользователей

**sales/views.py — Permission hardening**
- ✅ `OrderViewSet`, `SaleItemViewSet`, `OrderItemViewSet`: `permission_classes=[ReadOnlyOrManager]`

### Модели данных

**nomenclature/models.py**
- ✅ `NomenclatureGroup.parent`: `on_delete=CASCADE` → `on_delete=SET_NULL` — удаление родительской группы больше не каскадно удаляет всё дерево

**marketing/models.py & serializers.py**
- ✅ Discount: добавлены `target_group` (FK → NomenclatureGroup) и `target_nomenclature` (FK → Nomenclature) — для apply_to=group/nomenclature
- ✅ DiscountSerializer: валидация что target FK заполнен при соответствующем apply_to
- ✅ PromoCodeSerializer: `used_count` → read_only; `discount_name` → read_only

### Django Admin

- ✅ Зарегистрированы: `TenantContact`, `TenantPayment`, `TenantNote` (core), `CashShift` (finance), `OrderStatusHistory` (sales)
- ✅ Добавлены `list_filter = ('organization',)` и `readonly_fields` для balance-полей CashShift
- ✅ Inventory admin: добавлены organization filters
- ✅ Staff admin: добавлен organization filter к Position

### Frontend

**api.ts — JWT refresh race condition fix**
- ✅ Добавлен механизм очереди: `isRefreshing` flag + `failedQueue` — при параллельных 401 только первый запрос обновляет токен, остальные ждут в очереди

**InventoryPage.tsx**
- ✅ `parseInt(asmForm.quantity)` → `Math.max(1, Math.round(Number(asmForm.quantity) || 1))` — корректный парсинг дробных количеств

**FinancePage.tsx**
- ✅ Устранена двойная загрузка категорий (дублирующийся useEffect)

### Health endpoint
- ✅ `GET /api/health/` — проверяет подключение к БД, возвращает JSON `{status: 'ok', database: 'ok'}` или `{status: 'error'}`

### Миграции (применены на production)
- `nomenclature.0006_alter_nomenclaturegroup_parent`
- `inventory.0004_stockmovement_sale_batch_idx_batch_fifo_and_more`
- `marketing.0003_discount_target_group_discount_target_nomenclature`

---

## Changelog (2026-03-08) — Аудит архитектуры: обеспечение финансовой и складской консистентности

### Устранение критических уязвимостей
Произведён глубокий технический аудит системы выявивший ряд проблем уровня Enterprise, препятствовавших использованию платформы на больших нагрузках.

1. **Атомарность транзакций в продажах и складских операциях**:
   - `SaleViewSet.create` и `SaleViewSet.update` обёрнуты в `@db_transaction.atomic`. Ранее это могло приводить к частичной записи (разъезду финансов и остатков).
   - Сборочные механизмы `InventoryViewSet.assemble_bouquet_action` и `disassemble_bouquet_action` обёрнуты в `atomic`. Теперь `select_for_update` работает корректно на уровне БД.

2. **Безопасность кошельков и финансовая консистентность**:
   - Устранено слепое использование `F('balance')` для инкремента и декремента баланса. Теперь баланс читается через `select_for_update()`, вычисляется, проверяется на возможность ухода в минус (`allow_negative`) и только потом сохраняется с помощью `save(update_fields=['balance'])`.
   - В БД добавлено ограничение `CheckConstraint` для модели `Wallet`, гарантирующее что `balance >= 0`, если не включён флаг `allow_negative`.
   - В `sales/services.py` в функции `sync_sale_transaction` реализован строгий контроль баланса при удалении или изменении чеков продаж.

### Commit `fa75f41`

## Changelog (2026-03-08) — UX-оверхол букетных форм, цена продажи, парные поля, сортировка номенклатуры

### Commit `fa75f41`

### Сборка букета — новый дизайн
- Удалены `Card variant="outlined"` — компоненты отображаются плоскими `Box`-строками с hover-подсветкой (`action.hover`).
- Добавлена шапка-заголовок колонок: Компонент, Кол-во, Склад списания, Остаток.
- Убрана аннотация цены под именем компонента.
- Добавлено поле **«Цена продажи»** (₽) в header-grid — автозаполняется из `retail_price` номенклатуры.
- Для услуг: вместо `Chip` теперь стилизованный `TextField disabled value="не требуется" label="Склад списания"` — визуально единообразно.
- Добавлен блок **Себестоимость / Маржа** внизу формы.

### Раскомплектовка букета — flat-row стиль
- Удалены `Card variant="outlined"` → плоские `Box`-строки с hover.
- Header-поля (Букет, Склад, Сборщик) объединены в одну `Grid`-строку.
- Удалена аннотация цены покупки — оставлена только «База: X».
- Визуально единообразно с формой сборки.

### Коррекция букета — парные поля + цена продажи
- Удалены `Card variant="outlined"` → плоские `Box`-строки с hover и warning-подсветкой при дисбалансе.
- **Парная вертикальная компоновка**: каждый столбец содержит два stacked-поля:
  - Списание / Причина
  - Возврат / Склад возврата
  - Добавление / Склад добавления
- Нижнее поле пары стилизовано `borderTopLeftRadius: 0, borderTopRightRadius: 0` для визуального слияния.
- Добавлено поле **«Цена продажи»** (₽) в header.
- Шапка колонок: Компонент, Списание/Причина, Возврат/Склад, Добавление/Склад.
- Диалог расширен до `maxWidth="lg"`.

### Номенклатура — сортировка по алфавиту
- `backend/apps/nomenclature/views.py`: добавлено `ordering = ['name']` — все позиции возвращаются отсортированными по имени по умолчанию.

---

## Changelog (2026-03-07) — Удаление продаж по ролям, улучшение форм букетов

### Удаление продаж для суперадмин/владелец
- **sales/views.py**: удалён `perform_destroy` (блокировал DELETE безусловно). Метод `destroy` проверяет `is_superuser` или `role == 'owner'`; остальным — `PermissionDenied`. `rollback_sale_effects_before_delete` вызывается перед удалением.
- **SalesPage.tsx**: кнопка «Удалить продажу» отображается только для суперадминов и владельцев.

### Раскомплектовка: per-item склад возврата
- **inventory/views.py** (`disassemble_bouquet_action`): для каждого return_item принимается опциональный `warehouse` с валидацией через `_validate_org_fk`.
- **inventory/services.py** (`disassemble_bouquet`): `ret_wh = item.get('warehouse') or warehouse` — каждый компонент может возвращаться на свой склад.

### Сборка букета: убран «Склад-источник»
- **InventoryPage.tsx**: поле «Склад-источник» удалено из формы сборки; осталось одно поле «Склад» (= `warehouse_to`). Каждый компонент имеет свой «Склад списания».
- Компоненты обёрнуты в `Card variant="outlined"` с отображением цены.
- Для компонентов-услуг скрыт выбор склада и отображается чип «Услуга — склад не требуется».

### Раскомплектовка букета: карточки + склад возврата
- Компоненты обёрнуты в `Card variant="outlined"` с ценой и базовым количеством.
- Добавлен per-item выпадающий список «Склад возврата» для каждого компонента.
- Заголовочная строка-шапка с подписями колонок (как в коррекции).
- Услуги автоматически исключены из формы раскомплектовки.

### Коррекция букета: цена компонента
- Аннотация «База: X» заменена на «Цена: X р · База: X» для каждого компонента.

### Визуальная консистентность трёх форм
- Все три диалога (Сборка, Раскомплектовка, Коррекция) используют `Typography variant="h6" fontWeight={700}` в заголовке.
- Раскомплектовка и Коррекция отображают информационный `Chip` (услуги исключены).
- Все компоненты оформлены карточками `Card variant="outlined"` с закруглением и единым паддингом.

---

## Changelog (2026-03-06) — Реальный отрицательный остаток, удаление продажи с откатом

### Исправление: отрицательный остаток отображался как 0
- **inventory/services.py** (`_update_stock_balance`): удалён «clamp» `if sb.quantity < 0: sb.quantity = Decimal('0')`. Теперь `StockBalance.quantity` может хранить реальное отрицательное значение после продажи в дефицит.
- Commit: `674cea6`

### Исправление: 500 при удалении продажи
- **sales/services.py** (`rollback_sale_effects_before_delete`): убран `select_for_update()` из запроса `sale_movements` (из-за ошибки `FOR UPDATE cannot be applied to the nullable side of an outer join`, так как присутствовал `select_related('batch')`, где `batch` — nullable ForeignKey).
- **sales/services.py**: откат статистики клиента переведён на `Greatest(F(...) - value, Value(0))` (через `django.db.models.functions.Greatest`), чтобы `PositiveIntegerField purchases_count` не уходил в минус и не вызывал `IntegrityError`.
- Commit: `c641add`

### Полный откат продажи при удалении
- **sales/services.py**: добавлена функция `rollback_sale_effects_before_delete(sale)`:
   - по `StockMovement(type=SALE, notes__contains='#<number>')` восстанавливает `Batch.remaining` и пересчитывает `StockBalance`;
   - удаляет финансовые транзакции, привязанные к продаже (`Transaction.sale=sale`), и возвращает баланс кошельков;
   - безопасно откатывает `Customer.total_purchases` и `purchases_count`.
- **sales/views.py**: `SaleViewSet.destroy()` вызывает `rollback_sale_effects_before_delete()` перед `super().destroy()`.
- Commit: `fac56f8`

### Визуализация отрицательных остатков в инвентаре
- **inventory/views.py** (`StockBalanceViewSet.get_queryset()`): убран фильтр `quantity__gt=0`, добавлено исключение нулевых остатков букетов/kompoziций — чтобы не захламлять список.
- **InventoryPage.tsx**: строки с отрицательным остатком выделяются красным фоном; чип «Минус» на имени; количество выводится жирным красным шрифтом.
- **DataTable.tsx**: добавлен проп `getRowSx` для стилизации строк по условию.
- Commit: `3f0ed88`, `2eb1211`

---

## Changelog (2026-03-05) — Продажи в минус, предупреждения и напоминания

### Политика остатков при продаже
- **sales/services.py**: `do_sale_fifo_write_off(sale)` переведён на режим **разрешённого дефицита**. Если полного остатка по FIFO не хватает, система:
   - списывает доступное количество по FIFO из партий,
   - фиксирует дефицит отдельным движением `StockMovement(type='sale')` без `batch`,
   - уменьшает `StockBalance` на полный объём продажи (допуская отрицательное значение остатка).
- При продаже в дефицит формируется предупреждение уровня бизнес-логики (список `warnings`) для пользователя.

### API-предупреждения для продаж
- **sales/serializers.py**: при `create/update` продажи предупреждения из `do_sale_fifo_write_off()` сохраняются в контексте сериализатора.
- **sales/views.py**: `SaleViewSet.create()` и `SaleViewSet.update()` добавляют в ответ поле `_warnings` (если продажа прошла с уходом в минус).

### Мониторинг минусовых остатков
- **inventory/views.py**: в `StockBalanceViewSet` добавлен endpoint `GET /api/inventory/stock/negative-alerts/`.
- Endpoint возвращает агрегат по отрицательным остаткам в торговой точке: количество позиций и список проблемных остатков.

### Frontend UX
- **SalesPage.tsx**: после сохранения продажи отображается `warning`-уведомление, если backend вернул `_warnings`.
- **Layout.tsx**: добавлены периодические напоминания (polling каждые 5 минут) по `negative-alerts` для активной торговой точки пользователя.

---

## Changelog (2026-03-04) — Исправление создания сотрудников, форма редактирования

### Критическое исправление: создание сотрудников
- **Корневая причина**: `AbstractUser.username` — обязательное поле в Django. DRF автоматически делало его `required=True` в EmployeeSerializer. Если фронтенд не передавал username при создании сотрудника, API возвращало `{"username":["Обязательное поле."]}` и сотрудник НЕ создавался.
- **staff/serializers.py**: `EmployeeSerializer` — `username` теперь `required=False, allow_blank=True`. Если при создании username не указан, автоматически генерируется формата `emp_XXXXXXXX` (8 символов hex). Добавлена валидация уникальности username. При обновлении пустой username игнорируется (сохраняется текущий). Пароль хешируется через `set_password()`.
- **staff/views.py**: `EmployeeViewSet.get_queryset()` — убран фильтр `is_superuser=False`, чтобы не скрывать суперпользователей-сотрудников.

### Форма редактирования сотрудника (Frontend)
- **StaffPage.tsx**: Форма разделена на 3 секции с `<Divider>`:
  1. **Личные данные**: Фамилия, Имя, Отчество, Телефон, Email
  2. **Работа**: Должность, Торговая точка, Дата найма, Дата увольнения, Активен
  3. **Доступ в систему** (VpnKey icon): Логин (необязательно, автогенерация), Пароль (необязательно), Роль
- Поле «Роль» вынесено в секцию «Доступ в систему» (было дублировано в двух секциях)
- Подсказки: для нового сотрудника — «Необязательно», для существующего с аккаунтом — «Текущий логин для входа» / «Оставьте пустым, если не меняете»
- `hire_date` больше не помечено как `required` (модель допускает null)

---

## Changelog (2026-03-03) — Системный аудит: TP-контекст, безопасность, целостность данных

### Двухуровневый контекст фильтрации (Organization + Trading Point)

**Backend (core/mixins.py):**
- Добавлена функция `_resolve_tp(user)` — резолвер «рабочей» ТТ пользователя (приоритет: active_trading_point → employee.trading_point → None)
- `_tenant_filter()` расширена параметром `tp_field` — опциональная фильтрация по торговой точке поверх организации
- `OrgPerformCreateMixin.perform_create()` — автоматически заполняет `trading_point` из `_resolve_tp()` если модель имеет такое FK-поле

**Применение tp_field во ViewSet-ах:**
| ViewSet | tp_field |
|---------|----------|
| SaleViewSet | `trading_point` |
| OrderViewSet | `trading_point` |
| WalletViewSet | `trading_point` |
| DeliveryViewSet | `order__trading_point` |
| ShiftViewSet | `trading_point` |
| WarehouseViewSet | `trading_point` |
| BatchViewSet | `warehouse__trading_point` |
| StockBalanceViewSet | `warehouse__trading_point` |
| DailySummaryViewSet | `trading_point` |
| Dashboard endpoint | Динамические фильтры по Sale/Order trading_point |

**Frontend — автообновление при смене TP:**
- Все страницы (Dashboard, Sales, Orders, Inventory, Finance, Delivery, Staff, Customers, Analytics) добавляют `user?.active_trading_point` в зависимости `useCallback` для fetch-функций → данные автоматически перезагружаются при переключении ТТ
- `AuthContext.tsx`: добавлен try/catch в `switchOrganization` и `switchTradingPoint`; слушатель `auth:logout` CustomEvent
- `api.ts`: заменён `window.location.href = '/login'` на `window.dispatchEvent(new CustomEvent('auth:logout'))` для совместимости с React
- `Layout.tsx`: обработка ошибок в handleOrgSwitch/handleTpSwitch
- `InventoryPage.tsx`: `scopedWarehouses` теперь учитывает `active_trading_point` (не только employee.trading_point)

### Исправления критических багов

- **sales/serializers.py**: `_generate_sale_number()` — исправлен баг строкового сравнения номеров чеков: `Cast('number', IntegerField())` + `Max` вместо `Max('number')` по CharField
- **staff/serializers.py**: `EmployeeSerializer.create()` — проверка `max_users` перед созданием User (ранее лимит не проверялся)
- **inventory/views.py**: `correct_bouquet_action` — списание теперь через FIFO (`fifo_write_off` + `_update_stock_balance`) с обработкой `InsufficientStockError`
- **nomenclature/models.py**: `BouquetTemplate` — добавлено поле `organization` (FK, nullable) + миграции 0004+0005 (data migration из nomenclature.organization)
- **sales/serializers.py**: `_sync_transaction()` — добавлен `select_for_update()` на существующую транзакцию

### Безопасность

- **config/settings.py**: Throttling — `DEFAULT_THROTTLE_CLASSES` (AnonRateThrottle, UserRateThrottle), 30/min и 300/min
- **config/settings.py**: JWT — ACCESS_TOKEN_LIFETIME: 12ч → 2ч, REFRESH_TOKEN_LIFETIME: 7д → 3д
- **config/settings.py**: CORS — `CORS_ALLOWED_ORIGINS` из env var (ранее `CORS_ALLOW_ALL_ORIGINS = True`)
- **config/settings.py**: Пароли — добавлены `CommonPasswordValidator` и `NumericPasswordValidator`
- **nomenclature/views.py**: `MeasureUnitViewSet` — запись ограничена `IsPlatformAdmin` (ранее любой авторизованный)
- **nomenclature/views.py**: `BouquetComponentViewSet` — добавлен `ReadOnlyOrManager` + cross-tenant валидация template
- **suppliers/views.py**: `SupplierNomenclatureViewSet` — добавлены `perform_create/perform_update` с проверкой принадлежности supplier и nomenclature к организации

---

## Changelog (2026-03-02) — Исправления доступа и улучшения UX продаж

### Hotfix (2026-03-01) — Ошибка 500 при создании продажи/заказа
- **sales/serializers.py**: устранена причина `Server Error 500` в `SaleSerializer.create()` и `OrderSerializer.create()` — ранее использовался `validated_data['organization_id']`, которого нет при `perform_create(serializer.save(organization=org))`.
- Добавлена безопасная обработка через объект `organization` + явная `ValidationError`, если организация отсутствует.
- **sales/serializers.py**: добавлена явная валидация `trading_point` в `SaleSerializer.create/update`, чтобы исключить `IntegrityError` (NOT NULL) и переводить проблему в контролируемый 400 ответ.
- **frontend/SalesPage.tsx**: добавлена pre-submit валидация торговой точки (без выбранной точки сохранение не отправляется на backend).
- **sales/services.py**: исправлена критичная логика проведения продажи при нехватке склада — `InsufficientStockError` больше не подавляется, а переводится в `ValidationError` (400). Продажа не проводится, если количество позиции больше остатка.
- **sales/services.py**: добавлен запрет проведения продажи без склада списания (если не указан склад в позиции и не настроен `is_default_for_sales`).

### Критические исправления
- **core/views.py**: `TradingPointViewSet`, `WarehouseViewSet`, `PaymentMethodViewSet` — READ-доступ открыт для всех аутентифицированных (раньше только owner/admin). Запись остаётся за owner/admin. Это исправляло: «Ошибка загрузки данных дашборда», «Ошибка загрузки остатков», «Server Error 500» на странице Продажи.
- **finance/views.py**: `WalletViewSet` — summary и list доступны всем аутентифицированным (раньше только owner/admin), запись — owner/admin.
- **DashboardPage.tsx**: Promise.all с `.catch(() => null)` на каждый запрос — дашборд загружается частично, если один из 5 API недоступен.

### Торговая точка — user context
- **core/models.py**: Добавлено поле `User.active_trading_point` (FK → TradingPoint, nullable) — «рабочая» торговая точка пользователя.
- **core/views.py**: Новый endpoint `POST /api/core/users/me/set-active-tp/` — переключение торговой точки для SA и owner/admin.
- **core/serializers.py**: `UserSerializer` дополнен полями `active_trading_point`, `active_trading_point_name`.
- **AuthContext.tsx**: Добавлен `switchTradingPoint()`, интерфейс `User` расширен полями `active_trading_point`, `active_trading_point_name`.
- **Layout.tsx**: Селектор торговой точки в AppBar для суперадмина и владельца/администратора. Переключение фильтрует данные по точке.

### Продажи — улучшения
- **SalesPage.tsx**: Остатки (`stock/summary/`) фильтруются по `active_trading_point` или торговой точке сотрудника.
- **SalesPage.tsx**: Торговая точка по умолчанию: `active_trading_point` → `employee.trading_point` → единственная точка.
- Скидка на всю продажу (поле `discount_percent` в Sale) — уже реализовано в модели и frontend, работает корректно.
- Остаток и склад по каждой позиции — уже отображаются в форме под каждой строкой.

---

## Changelog (2026-03-01) — Системный аудит и исправления

### Критические исправления безопасности
- **finance/views.py**: `TransactionViewSet` — добавлены `perform_update` и `perform_destroy` с откатом баланса кошельков. `perform_create` теперь использует `select_for_update()` на кошельках и проверяет `allow_negative` перед списанием. Вынесена утилита `_apply_wallet_balance()`.
- **sales/serializers.py**: Интегрировано FIFO-списание со склада при продаже (`_do_fifo_write_off`). Теперь при `status=completed` + `is_paid=True` — автоматически вызывается `fifo_write_off()` для каждой позиции с записью `cost_price`, `StockMovement`, обновлением `StockBalance`.
- **sales/serializers.py**: Исправлена гонка номеров чеков — вместо `Sale.objects.count()` используется `Max('number')` + `select_for_update()`.
- **inventory/views.py**: `correct_bouquet_action` обёрнут в `@db_transaction.atomic` (раньше `select_for_update` вызывался без транзакции).
- **inventory/views.py**: Добавлена cross-tenant валидация (`_validate_org_fk`) во все actions: BatchViewSet.create, write-off, transfer, assemble-bouquet, disassemble-bouquet, correct-bouquet.

### Исправления тенантной изоляции
- **customers/views.py**: `ImportantDateViewSet` и `CustomerAddressViewSet` — добавлен `perform_create` с проверкой принадлежности клиента организации.
- **staff/views.py**: `PayrollSchemeViewSet` — добавлен `perform_create` с проверкой принадлежности сотрудника организации.
- **nomenclature/views.py**: `MeasureUnitViewSet` — добавлен `permission_classes = [IsAuthenticated]` (раньше был полностью открытый).
- **finance/views.py**: `WalletViewSet.get_queryset` — добавлен `select_related` для оптимизации.

### Исправления целостности данных
- **staff/serializers.py**: `EmployeeSerializer.create()` обёрнут в `@db_transaction.atomic` — создание Employee + User теперь атомарно.
- **sales/serializers.py**: `_sync_transaction()` — все обновления `Wallet.balance` теперь через `select_for_update()`.
- **finance/views.py**: `TransactionViewSet.perform_create` — валидация принадлежности `wallet_from` и `wallet_to` организации пользователя.

### Frontend
- **Layout.tsx**: Добавлена role-based фильтрация навигации (`allowedRoles` per nav item). Продавцы не видят Финансы/Персонал/Маркетинг; курьеры видят только Дашборд/Продажи/Заказы/Доставка.
- **LoginPage.tsx**: Убраны демо-креденшалы со страницы входа.

## Changelog (2026-02-28)

### Блок Продаж (Sales)
- **Фильтрация и Автокомплит**: Поле выбора номенклатуры переведено на Autocomplete с возможностью текстового поиска.
- **Многоуровневый фильтр остатков**: При добавлении позиций отображаются только товары, имеющиеся на складах текущей торговой точки пользователя. 
- **Удобство продавца**: По умолчанию подставляется текущая точка и текущий продавец-пользователь.
- **Отображение состава букета**: При выборе букета в списке продажи автоматически отображается его состав мелким шрифтом.
- **Багфикс позиций**: Исправлена проблема сохранения добавленных к продаже позиций (добавлена успешная автоматическая миграция колонки discount_percent, улучшена логика валидации). 

## Changelog (2026-02-27)

### Backend
- **Sales**: Полная переработка сериализаторов. `SaleSerializer` принимает `items_data` для позиций (вместо отдельных запросов). `SaleItemSerializer` возвращает `accounting_type`, `warehouse_name`, `bouquet_components` (состав букета). `_recalc_totals` учитывает `discount_percent` (глобальная скидка на чек).
- **Sale model**: Добавлено поле `discount_percent` (DecimalField, 5,2) — процент глобальной скидки.
- **BouquetTemplate model**: Добавлено поле `bouquet_name` (CharField, 500) — пользовательское название букета.
- **NomenclatureGroupViewSet**: Добавлен `.distinct()` для устранения дублирования дочерних групп.
- **Staff serializers**: `EmployeeSerializer` поддерживает `create_username`, `create_password`, `create_role` для создания учётной записи пользователя при создании сотрудника.
- **Миграция**: `0002_bouquettemplate_bouquet_name` — добавление поля `bouquet_name`.

### Frontend
- **SalesPage**: Полностью переписана. Autocomplete для номенклатуры с отображением остатков и фильтрацией только по позициям с фактическим остатком в торговой точке сотрудника. Добавлен выбор склада по позиции с автоподбором (приоритет склада «по умолчанию для продаж», иначе склад с меньшим остатком). Поле продавца и торговой точки по умолчанию заполняются из профиля текущего пользователя. Глобальная скидка %. Статус по умолчанию «Завершена». Switch «Оплачено». Ключ `items_data` для API.
- **SettingsPage**: Удалена вкладка «Пользователи» (перенесена в Персонал). Добавлен выбор кошелька для способа оплаты. Добавлен переключатель `is_default_for_sales` для складов.
- **StaffPage**: Добавлены поля учётной записи (логин/пароль/роль) при создании сотрудника. Отображение логина и роли в таблице.
- **NomenclaturePage**: Поле `bouquet_name` в форме шаблона букета. Удалены поля `season_start`/`season_end` из формы номенклатуры.
- **InventoryPage**: Вкладка «Партии» переименована в «Поступления». Сборка букета расширена: индивидуальная сборка, редактируемый состав шаблона в момент сборки, выбор склада списания по каждому компоненту, подсветка нехватки, поле сборщика, флаг «добавить в шаблоны». Раскомплектовка обновлена: поле «Возврат» автоматически рассчитывается от значения «Списание». Из остатков добавлены быстрые действия: «Продать» и «Коррекция букета».

- **Inventory API**: `/inventory/stock/summary/` теперь учитывает торговую точку сотрудника по умолчанию и возвращает расширенный состав складов по позиции (`is_default_for_sales`, `trading_point`, `total_quantity`). `assemble-bouquet` поддерживает сборщика, компонентные склады и сохранение состава в шаблон. Добавлен endpoint `correct-bouquet` для коррекции состава букета в остатках.
- **Finance / Sales API**: В SaleSerializer добавлена автогенерируемая транзакция: при оплате чека (is_paid=True и status=completed), автоматически зачисляются средства на кошелёк, привязанный к выбранному PaymentMethod. При отмене чека транзакция откатывается.

---

## Changelog (2025-01-15) — Архитектурный Аудит

### Backend
- **sales/serializers.py**: Добавлен метод `_update_customer_stats(sale, delta_total, delta_count)` — обновляет поля `Customer.total_purchases` и `purchases_count` при завершении/отмене продажи через атомарные F()-выражения.
- **sales/serializers.py**: `create()` и `update()` вызывают `_update_customer_stats` при переходах статуса (completed ↔ не-completed).

### Frontend
- **shared/types.ts**: Создан модуль общих TypeScript-типов (~280 строк): `Organization`, `User`, `Nomenclature`, `Sale`, `SaleItem`, `Customer`, `Wallet`, `Transaction`, `Delivery`, `Batch`, `Movement` и др.
- **shared/formatters.ts**: Создан модуль форматирования: `fmtNum`, `fmtCurrency`, `fmtPercent`, `fmtDate`, `fmtDateTime`, `fmtTime`, `fmtPhone`, `truncate`, `pluralize`.
- **shared/constants.ts**: Создан модуль констант: `USER_ROLES`, `SALE_STATUSES`, `ORDER_STATUSES`, `DELIVERY_STATUSES`, `MOVEMENT_TYPES`, `ACCOUNTING_TYPES`, `WAREHOUSE_TYPES`, `WALLET_TYPES`, `TRANSACTION_TYPES`, `WRITEOFF_REASONS`, `AD_CHANNEL_TYPES`.
- **shared/index.ts**: Barrel-экспорт всех модулей через `@/shared`.

### Cleanup
- Удалены устаревшие файлы: `AUDIT_REPORT.md`, `AUDIT_REPORT_DETAILED.md`, `FRONTEND_AUDIT.md`, `FRONTEND_AUDIT_DEEP.md`, `BACKEND_AUDIT_REPORT.md`, `FRONTEND_ARCHITECTURE_AUDIT.md`.
- Удалены мусорные файлы: `update.tar.gz`, `~$FLOW.docx`, `deployment_patch.py`, `deploy_full.py`, `ssh_cmd.py`, `SalesPage.tsx.bak`.

---

## 11. Архитектурная ревизия и зоны роста

### Что уже является правильным фундаментом

- bounded contexts по доменам цветочного бизнеса вместо монолитной «таблицы на всё»;
- shared-schema multi-tenancy с tenant-фильтрацией на backend и контекстом торговой точки;
- партии, FIFO, сроки годности, резервы и snapshot-составы для готовых букетов;
- отдельные default-склады для приёмки, букетов и продаж;
- единый POS feed для номенклатуры, готовых букетов и резервов;
- production-профиль под небольшой VPS: Gunicorn, Celery, Redis, Docker Compose.

### Что действительно нужно платформе следующим этапом

| Приоритет | Область | Что нужно сделать | Почему это важно для flower SaaS |
|-----------|---------|-------------------|----------------------------------|
| P1 | Audit trail | Ввести полноценный журнал изменений по критичным сущностям: sale, reserve, batch, order, wallet, warehouse defaults | Для спорных продаж, разборов пересорта, обучения персонала и юридической прозрачности |
| P1 | Observability | Бэкапы БД по расписанию, мониторинг контейнеров, алерты по health/logs, регламент rollback | Без эксплуатационной дисциплины SaaS не масштабируется даже при хорошем коде |
| P1 | Testing | Добавить интеграционные тесты для checkout, reserve, receipt, transfer, assemble/disassemble, wallet flows | Ключевые потоки сейчас достаточно сложны и требуют регрессионной страховки |
| P1 | Procurement & planning | Прогноз закупок по сезонности, праздникам, прошлым продажам и срокам поставки | Это напрямую влияет на списания, out-of-stock и валовую маржу магазина |
| P2 | Flower substitutions | Поддержать заменяемость компонентов в шаблонах и заказах по правилам доступности и ценового диапазона | Для флористики это реальный ежедневный сценарий, а не nice-to-have |
| P2 | Customer lifecycle | Напоминания по важным датам, сегментация клиентов, автоматизация повторных продаж | Повторные продажи и удержание в цветочном бизнесе критичнее «широкого каталога функций» |
| P2 | Media strategy | Вынести медиа на объектное хранилище/CDN при росте базы фото | Фото букетов быстро превращаются в операционный bottleneck локального диска |
| P2 | Read models | Локально оптимизировать N+1 и тяжёлые отчёты через materialized/read-model подход | Отчёты и дашборды не должны конкурировать с кассой за latency |
| P3 | SaaS billing | Автоматизировать подписки, grace-period, отключение/ограничение по тарифу, tenant health-score | Это нужно для зрелой SaaS-модели, но после стабилизации core ERP-контуров |
| P3 | PWA for store floor | PWA-режим для мобильной работы в магазине: фото, сканирование, быстрые остатки, приёмка | Даст прикладную ценность быстрее и дешевле, чем сразу native mobile |

### Что не нужно форсировать сейчас

- **Тотальный WebSocket-first UI**: real-time нужен точечно для кассы и оповещений, а не как универсальная архитектурная догма.
- **Нативные мобильные приложения**: до появления стабильного PWA и выверенного mobile workflow это преждевременное удорожание.
- **1С/внешние интеграции любой ценой**: их стоит начинать после стабилизации мастер-данных, учётных инвариантов и API-контрактов.
- **Шардирование и cluster-first инфраструктура**: оправдано только при фактическом росте tenant count и нагрузки, а не «на будущее».
- **Telegram-бот как ключевой канал**: может быть полезным расширением, но не должен конкурировать с кассой, заказами и складом за приоритет продукта.

### Технический долг, который остаётся актуальным

- довынос бизнес-логики из отдельных serializer/update-путей в service layer там, где orchestration ещё смешан с правилами предметной области;
- покрытие тяжёлых list endpoints `select_related/prefetch_related` и профилирование SQL для inventory/sales/cashier;
- нормализация эксплуатационной документации: отдельно архитектура, отдельно changelog, отдельно deployment/runbook.

---

## 12. Архив изменений

Ниже сохраняется только последний консолидированный changelog. Более старые технические проходы аудита и промежуточные hotfix-и целесообразно отслеживать через git history и отдельный changelog-файл, а не смешивать с основной архитектурой.

Ключевые вехи, уже вошедшие в текущую архитектуру:
- 2025-01-15 — базовый архитектурный аудит, cleanup и типизация frontend;
- 2026-02-27..2026-03-13 — серия hardening-изменений по продажам, складу, tenant-изоляции, кассовым сменам и UX основных страниц;
- 2026-03-21 — консолидация номенклатуры, склада, кассы, шаблонов букетов и архитектурной документации.

## 13. Последние изменения (2026-03-21) — Номенклатура / Склад / Касса: скрытые шаблоны, фото витрины, default-склады

### Backend
- ✅ `nomenclature.models.Nomenclature` получил флаг `is_template_placeholder`: шаблонные служебные позиции скрываются из обычной номенклатуры, но продолжают обслуживать шаблоны, сборку и продажу букетов.
- ✅ `nomenclature.views.NomenclatureViewSet` и дерево групп исключают placeholder-позиции по умолчанию; `include_templates=1` оставлен как явный opt-in для внутренних сценариев.
- ✅ `nomenclature.views.NomenclatureGroupViewSet.delete_info()` теперь возвращает структурированный объект `{child_groups, items}`, синхронный с frontend-подтверждением удаления группы.
- ✅ `inventory.models.Batch` получил поле `image` для отдельного фото готового букета/витрины; файл удаляется при удалении партии и при полном выбывании букета из кассы.
- ✅ `inventory.serializers.ReceiptDocumentSerializer` автогенерирует `number`, если номер не передан с frontend.
- ✅ `inventory.views.assemble_bouquet_action` поддерживает `selling_price`, `image`, `add_to_templates`, `snapshot_source_mode` и multipart payload с JSON-компонентами и строковыми boolean-флагами.
- ✅ `core.views.WarehouseViewSet` принудительно оставляет только один default-склад на торговую точку для приёмки, букетов и продаж.
- ✅ `cashier.views.CheckoutView` переведён на безопасную генерацию номера продажи, корректный расчёт total с header discount_percent + discount_amount и расширенную валидацию строк checkout.
- ✅ `cashier.views.CashierFeedView` использует fallback изображений `Batch.image → BouquetTemplate.image → Nomenclature.image`; глобальный поиск работает без category_id.
- ✅ `cashier.views.CashierFeedView` расширяет группы пользовательской кассовой категории по всей дочерней ветке, поэтому витрина работает по полной иерархии номенклатуры, а не только по выбранным корням.

### Frontend
- ✅ `NomenclaturePage.tsx`: главным полем карточки стал `Тип учёта`; `nomenclature_type` полностью удалён из модели и всех файлов.
- ✅ `NomenclaturePage.tsx`: создание и редактирование шаблонов букета поддерживает фото шаблона, цену продажи и скрытый placeholder вместо видимого дубля в дереве номенклатуры.
- ✅ `InventoryPage.tsx`: вкладка поступлений стала документно-ориентированной (`ReceiptDocument`), а список сырых партий вынесен в отдельную вкладку `Партии`.
- ✅ `InventoryPage.tsx`: вкладка `Перемещения` использует специализированный transfer flow вместо универсального CRUD движений; таблицы переведены на компактные строки, а поиск по остаткам стал мгновенным.
- ✅ `InventoryPage.tsx`: сборка букета по умолчанию открывается в режиме `Индивидуальный букет`, использует default bouquet warehouse, умеет прикладывать фото, показывает autocomplete по шаблонам/компонентам и считает себестоимость/маржу по партии.
- ✅ `SettingsPage.tsx`: добавлена вкладка управления категориями кассы, предупреждение перед заменой default-склада на торговой точке и явная подсказка, что кассовая категория включает дочерние группы выбранной ветки.
- ✅ `CashierPage.tsx`: добавлена вкладка `Все`, ручное редактирование цены строки и вывод состава готовых букетов/резервов по `BouquetBatchComponentSnapshot` прямо в правой панели корзины.

### Миграции
- ✅ `inventory/migrations/0009_batch_image.py`
- ✅ `nomenclature/migrations/0012_nomenclature_is_template_placeholder.py`

### Документация и cleanup
- ✅ Удалён дублирующий вступительный блок и исправлены устаревшие сведения: auth URLs, наименование продукта, количество страниц frontend и инструкции по созданию суперпользователя.
- ✅ Roadmap приведён к прикладной форме: зафиксированы приоритетные зоны роста для flower SaaS и отдельно обозначено, что не нужно форсировать на текущем этапе.
- ✅ Из корня проекта удалены временные диагностические скрипты, не относящиеся к постоянной архитектуре продукта.

---

## 14. Последние изменения (2026-03-25) — Удаление nomenclature_type, drag-and-drop в дереве номенклатуры, компактные таблицы

### Backend
- ✅ **Удалено поле `nomenclature_type`** из модели `Nomenclature`. Вся бизнес-логика полностью мигрирована на `accounting_type` (3 значения: `stock_material`, `finished_bouquet`, `service`). Удалён enum-класс `NomenclatureType` (12 значений), индекс `['organization', 'nomenclature_type']`, все ссылки в serializers/views/admin/services.
- ✅ **Миграция данных** (`0013_remove_nomenclature_type`): перед удалением поля запускается `RunPython`, который маппит `bouquet`/`composition` → `finished_bouquet`, `service` → `service`; остальные остаются `stock_material`.
- ✅ **inventory/services.py, inventory/views.py, inventory/serializers.py**: все проверки `nomenclature_type == 'service'` заменены на `accounting_type == 'service'`, определение букета (`nomenclature_type__in=['bouquet','composition']`) на `accounting_type='finished_bouquet'`.
- ✅ **sales/services.py, sales/serializers.py**: аналогичная миграция проверок — теперь единственный источник истины для типа товара это `accounting_type`.
- ✅ **Новые endpoints для drag-and-drop**: `PATCH /api/nomenclature/items/{id}/move/` (меняет `group`) и `PATCH /api/nomenclature/groups/{id}/move/` (меняет `parent`).

### Frontend
- ✅ **NomenclaturePage**: полностью удалены `NOM_TYPES`, `nomTypeLabel()`, `inferNomenclatureType()`. В дереве отображаются колонки «Тип учёта», «Закупочная», «Розничная» (через компонент `TreeHeader`). Заголовки цен показываются только на уровне items, не на папках.
- ✅ **Drag-and-drop в дереве номенклатуры**: реализован через нативный HTML5 Draggable API. Позиции и группы перетаскиваются между группами с подсветкой зоны сброса. Автораскрытие группы при наведении (800ms таймер). Зона «Перетащите в корень» для перемещения без группы. API-запросы `/move/` отправляются на drop.
- ✅ **Компактные строки** во вкладках «Единицы измерения» и «Шаблоны букетов»: добавлен проп `dense` на `DataTable`.
- ✅ **Удалено поле «Тип»** из карточки номенклатуры — теперь показывается только «Тип учёта».
- ✅ **InventoryPage**: 12 ссылок на `nomenclature_type` заменены на `accounting_type` (интерфейс `NomRef`, фильтры компонентов, услуг, букетов).
- ✅ **SalesPage**: интерфейсы `SaleItem`, `NomRef` и определение букета мигрированы на `accounting_type`.
- ✅ **shared/types.ts**: удалён тип `NomenclatureType`, добавлен `AccountingType`. Поле `nomenclature_type` удалено из интерфейсов `Nomenclature` и `SaleItem`.
- ✅ **shared/constants.ts**: `NOMENCLATURE_TYPES` заменён на `ACCOUNTING_TYPES` (3 значения).
- ✅ **extractError.ts**: удалён маппинг `nomenclature_type`.

### Миграции
- ✅ `nomenclature/migrations/0013_remove_nomenclature_type.py` — RunPython + RemoveIndex + RemoveField
