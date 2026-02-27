# FlowerBoss — Архитектура системы

## 1. Общее описание

**FlowerBoss** — SaaS-платформа для управления цветочным бизнесом. Система охватывает все аспекты деятельности: от закупки и складирования цветов до продажи, доставки, управления персоналом и финансовой аналитики.

**Стек технологий:**
- **Backend:** Django 5.2 + Django REST Framework 3.16
- **Frontend:** React 19 + TypeScript 5.7 + Material UI 6.5
- **База данных:** PostgreSQL (база `FLOW`)
- **Аутентификация:** JWT (SimpleJWT) — access 12ч, refresh 7д
- **Сборка фронтенда:** Vite 6.4
- **Графики:** Recharts 2.15

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
│   ├── apps/                       # Доменные приложения (11 штук)
│   │   ├── core/                   # Ядро: организация, пользователи, точки, склады
│   │   ├── nomenclature/           # Номенклатура: товары, букеты, шаблоны
│   │   ├── inventory/              # Склад: партии, остатки, движения, инвентаризация
│   │   ├── sales/                  # Продажи и заказы
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
│   │   ├── App.tsx                 # Маршрутизация (13 маршрутов + PrivateRoute)
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
│   │   └── pages/                   # Страницы (15 шт.)
│   │       ├── LoginPage.tsx        # Авторизация
│   │       ├── DashboardPage.tsx    # Дашборд со статистикой
│   │       ├── ProfilePage.tsx      # Профиль пользователя + смена пароля
│   │       ├── AdminPage.tsx        # Администрирование: организации + пользователи
│   │       ├── NomenclaturePage.tsx # Справочник номенклатуры (CRUD)
│   │       ├── InventoryPage.tsx    # Складской учёт
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
| **User** | Пользователь (расш. AbstractUser) | organization → Organization, active_organization → Organization (суперадмин), role (owner/admin/manager/seller/courier/accountant), phone, avatar |
| **TradingPoint** | Торговая точка | organization → Organization, name, address, manager → User, work_schedule |
| **Warehouse** | Склад | trading_point → TradingPoint, type (main/showcase/fridge/assembly/reserve), is_default, is_default_for_sales |
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
| **NomenclatureGroup** | Группа/категория | parent → self (иерархия), name |
| **MeasureUnit** | Единица измерения | name, short_name |
| **Nomenclature** | Товар | group → NomenclatureGroup, type (12 типов: single_flower, bouquet, composition и др.), sku, purchase_price, retail_price, min_price, color, country, season, shelf_life, min_stock |
| **BouquetTemplate** | Шаблон букета | nomenclature → Nomenclature, bouquet_name, assembly_time, difficulty |
| **BouquetComponent** | Компонент букета | template → BouquetTemplate, nomenclature → Nomenclature, quantity, is_required, substitute → Nomenclature |

**Связи:**
- NomenclatureGroup → NomenclatureGroup.parent (рекурсивная иерархия)
- Nomenclature → NomenclatureGroup
- BouquetTemplate ↔ Nomenclature (1:1)
- BouquetComponent → BouquetTemplate + Nomenclature

### 3.3 Склад (inventory)

| Модель | Описание | Ключевые поля |
|--------|----------|---------------|
| **Batch** | Партия товара | nomenclature → Nomenclature, supplier → Supplier, warehouse → Warehouse, purchase_price, quantity, remaining, expiry_date |
| **StockBalance** | Остатки (денормализовано) | warehouse → Warehouse, nomenclature → Nomenclature, quantity, avg_purchase_price (unique_together) |
| **StockMovement** | Движение товара | batch → Batch, type (receipt/write_off/transfer/sale/return/adjustment/assembly), quantity, write_off_reason |
| **InventoryDocument** | Документ инвентаризации | warehouse → Warehouse, status (draft/in_progress/completed) |
| **InventoryItem** | Позиция инвентаризации | document → InventoryDocument, expected_quantity, actual_quantity, difference |
| **Reserve** | Резерв товара | batch → Batch, order → Order, quantity, reserved_until |

**Логика:**
- Приёмка товара: создаётся Batch → StockMovement (receipt) → обновляется StockBalance
- Списание: StockMovement (write_off) с указанием причины → уменьшение StockBalance
- Перемещение: StockMovement (transfer) между складами → два обновления StockBalance
- Инвентаризация: InventoryDocument + InventoryItems → при завершении корректируются остатки
- Резервирование: привязка к заказу, автоснятие при просрочке

### 3.4 Продажи (sales)

| Модель | Описание | Ключевые поля |
|--------|----------|---------------|
| **Sale** | Чек продажи | trading_point → TradingPoint, seller → User, customer → Customer, status (open/completed/cancelled), subtotal, discount_percent, discount_amount, total, payment_method → PaymentMethod |
| **SaleItem** | Позиция чека | sale → Sale, nomenclature → Nomenclature, batch → Batch, quantity, price, discount_percent, total |
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
| **Employee** | Сотрудник | user → User (1:1), position → Position, trading_point → TradingPoint, hire_date, fire_date |
| **PayrollScheme** | Схема оплаты | employee → Employee, type (fixed/hourly/shift/percent_sales/mixed), rate, percent |
| **Shift** | Смена | employee → Employee, trading_point, date, start_time, end_time, break_minutes |
| **SalaryAccrual** | Начисление зарплаты | employee → Employee, period_start/end, base_amount, bonus, penalty, sales_bonus, total, status (pending/approved/paid), paid_from_wallet → Wallet |

**Связи:**
- User ↔ Employee (1:1)
- Employee → Position → Organization
- SalaryAccrual → Wallet (из какого кошелька выплачена)

### 3.8 Финансы (finance)

| Модель | Описание | Ключевые поля |
|--------|----------|---------------|
| **Wallet** | Кошелёк | organization → Organization, name, wallet_type (cash/bank_account/card/electronic/personal_card/other), balance, allow_negative, owner → User |
| **TransactionCategory** | Категория операции | name, direction (income/expense), parent → self |
| **Transaction** | Финансовая операция | organization, transaction_type (income/expense/transfer/supplier_payment/salary/personal_expense), amount, wallet_from → Wallet, wallet_to → Wallet, category → TransactionCategory, sale → Sale, order → Order, employee → Employee, description |
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
| **Discount** | Скидка | name, discount_type (percent/fixed), value, apply_to (all/group/nomenclature), start_date, end_date |
| **PromoCode** | Промокод | code, discount → Discount, max_uses, used_count, is_active |
| **LoyaltyProgram** | Программа лояльности | program_type (bonus/discount/cashback), accrual_percent, max_payment_percent |

### 3.10 Доставка (delivery)

| Модель | Описание | Ключевые поля |
|--------|----------|---------------|
| **DeliveryZone** | Зона доставки | name, price, free_from, estimated_minutes |
| **Courier** | Курьер | name, phone, courier_type (internal/external/service), vehicle, delivery_rate, is_available |
| **Delivery** | Доставка | order → Order (1:1), courier → Courier, zone → DeliveryZone, status (pending → assigned → picked_up → in_transit → delivered | failed | cancelled), delivery_date, time_from/to, photo_proof, actual_delivered_at |

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
| POST | `/api/token/` | Получить access + refresh токены |
| POST | `/api/token/refresh/` | Обновить access токен |
| POST | `/api/token/verify/` | Проверить валидность токена |

### CRUD-эндпоинты (ViewSets)

| Приложение | Префикс | Ресурсы |
|------------|---------|---------|
| core | `/api/core/` | organizations (/tenant-metrics), users (/me, /me/change-password, /me/set-active-org, /{id}/set-password), trading-points, warehouses, payment-methods, tenant-contacts, tenant-payments, tenant-notes, platform-admins (/set-password, /toggle-active) |
| nomenclature | `/api/nomenclature/` | groups, measure-units, nomenclature, bouquet-templates, bouquet-components |
| inventory | `/api/inventory/` | batches, stock (readonly), movements, inventory-documents, inventory-items, reserves |
| sales | `/api/sales/` | sales, sale-items, orders, order-items |
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
  /sales         → SalesPage           (список продаж)
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
- **api.ts** — Axios-экземпляр с интерцепторами: автоматическая подстановка Authorization заголовка, рефреш access-токена при 401

### Тема (MUI)

- **Primary:** розовый (#E91E63) — основные кнопки и акценты
- **Secondary:** фиолетовый (#7C4DFF) — вторичные элементы
- **Шрифт:** Inter
- **Стиль:** скруглённые компоненты, современный дизайн

---

## 6. Аутентификация и авторизация

### JWT (SimpleJWT)
- Access-токен: время жизни 12 часов
- Refresh-токен: время жизни 7 дней
- Ротация refresh-токенов включена
- Токены хранятся в localStorage

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
Все данные изолированы по `Organization`. Каждый пользователь привязан к одной организации. API автоматически фильтрует данные по организации текущего пользователя.

**Защита данных (core/mixins.py):**

#### Тенант-фильтрация: `_tenant_filter(qs, user, org_field='organization')`
Центральная функция изоляции данных, применённая во **всех 30+ ViewSet-ах**:
- Если пользователь привязан к организации → `qs.filter(**{org_field: user.organization})`
- Если суперпользователь (is_superuser=True) → `qs.all()` (видит все организации)
- Иначе (не суперпользователь без организации) → `qs.none()` (данные не утекут)

Поддержка вложенных моделей через `org_field`: для SaleItem → `org_field='sale__organization'`, для OrderItem → `org_field='order__organization'` и т.д.

#### Авто-назначение организации: `OrgPerformCreateMixin`
- Автоматически устанавливает `organization` из `request.user.organization` при создании (POST) и обновлении (PATCH/PUT)
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
- `CORS_ALLOW_ALL_ORIGINS = True` — для разработки
- `TIME_ZONE = 'Europe/Moscow'`
- `LANGUAGE_CODE = 'ru-ru'`

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
python manage.py createsuperuser  # admin / admin123
python manage.py runserver        # → http://127.0.0.1:8000
```

### Фронтенд
```bash
cd frontend
npm install
npm run dev                       # → http://localhost:3000
```

### Учётные данные
- **Суперпользователь:** admin / admin123
- **Админ-панель Django:** http://127.0.0.1:8000/admin/
- **API:** http://127.0.0.1:8000/api/
- **Фронтенд:** http://localhost:3000

---

## 10. Масштабирование и развитие

### Что реализовано
- ✅ Полная схема БД (30+ таблиц, 44+ моделей)
- ✅ REST API со всеми CRUD-операциями
- ✅ JWT-аутентификация с рефрешем
- ✅ Фронтенд с 15 страницами и навигацией
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

### Рекомендации по развитию
- ✅ ~~Расширить RBAC на все ViewSet-ы~~ — **Исправлено**: ReadOnlyOrManager на sales, finance (transactions, debts), IsOwnerOrAdmin на wallets
- ✅ ~~Бизнес-логика Transaction → автоматическое обновление Wallet.balance~~ — **Исправлено**: TransactionViewSet.perform_create() обновляет balance через F()
- ✅ ~~Автонумерация продаж~~ — **Исправлено**: SaleSerializer.create() генерирует номер чека
- ✅ ~~SaleSerializer items read_only~~ — **Исправлено**: добавлен items_data (writable) для вложенного создания/обновления позиций
- ✅ ~~Analytics dashboard request.user.organization~~ — **Исправлено**: используется _resolve_org()
- ✅ ~~max_users не проверяется~~ — **Исправлено**: UserViewSet.perform_create() проверяет лимит
- 🔲 Бизнес-логика Sale.complete() → FIFO-списание, начисление бонусов клиенту
- 🔲 Бизнес-логика Order: валидация переходов статусов, автоматический OrderStatusHistory
- 🔲 BatchViewSet.create(): проверка cross-tenant владения объектами (warehouse, nomenclature, supplier)
- 🔲 NomenclatureGroupSerializer: ограничение глубины рекурсии
- 🔲 Пагинация на фронтенде (серверная пагинация вместо загрузки всех записей)
- 🔲 N+1 query оптимизация (select_related/prefetch_related во всех ViewSet-ах)
- 🔲 Code-splitting (dynamic import) для уменьшения размера бандла (~1.2MB)
- 🔲 Вынести SECRET_KEY, DB-пароль и другие secrets в переменные окружения (django-environ)
- 🔲 DEBUG=False + настроить ALLOWED_HOSTS + CORS для продакшена
- 🔲 Автонумерация заказов/продаж (4-значная нумерация)
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

## Changelog (2026-02-27)

### Backend
- **Sales**: Полная переработка сериализаторов. `SaleSerializer` принимает `items_data` для позиций (вместо отдельных запросов). `SaleItemSerializer` возвращает `nomenclature_type`, `warehouse_name`, `bouquet_components` (состав букета). `_recalc_totals` учитывает `discount_percent` (глобальная скидка на чек).
- **Sale model**: Добавлено поле `discount_percent` (DecimalField, 5,2) — процент глобальной скидки.
- **BouquetTemplate model**: Добавлено поле `bouquet_name` (CharField, 500) — пользовательское название букета.
- **NomenclatureGroupViewSet**: Добавлен `.distinct()` для устранения дублирования дочерних групп.
- **Staff serializers**: `EmployeeSerializer` поддерживает `create_username`, `create_password`, `create_role` для создания учётной записи пользователя при создании сотрудника.
- **Миграция**: `0002_bouquettemplate_bouquet_name` — добавление поля `bouquet_name`.

### Frontend
- **SalesPage**: Полностью переписана. Autocomplete для номенклатуры с отображением остатков. Поле продавца (по умолчанию — текущий пользователь). Глобальная скидка %. Статус по умолчанию «Завершена». Switch «Оплачено». Состав букета в деталях с Collapse. Ключ `items_data` для API.
- **SettingsPage**: Удалена вкладка «Пользователи» (перенесена в Персонал). Добавлен выбор кошелька для способа оплаты. Добавлен переключатель `is_default_for_sales` для складов.
- **StaffPage**: Добавлены поля учётной записи (логин/пароль/роль) при создании сотрудника. Отображение логина и роли в таблице.
- **NomenclaturePage**: Поле `bouquet_name` в форме шаблона букета. Удалены поля `season_start`/`season_end` из формы номенклатуры.
- **InventoryPage**: Вкладка «Партии» переименована в «Поступления». Индивидуальная сборка букета (ручной выбор компонентов при отсутствии шаблона).