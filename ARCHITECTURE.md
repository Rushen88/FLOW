# FlowerBoss — Архитектура системы

## 1. Общее описание

**FlowerBoss** — SaaS-платформа для управления цветочным бизнесом. Система охватывает все аспекты деятельности: от закупки и складирования цветов до продажи, доставки, управления персоналом и финансовой аналитики.

**Стек технологий:**
- **Backend:** Django 5.2 + Django REST Framework 3.16
- **Frontend:** React 19 + TypeScript 5.7 + Material UI 6.5
- **База данных:** PostgreSQL (база `FLOW`)
- **Аутентификация:** JWT (SimpleJWT) — access 2ч, refresh 3д
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
| **User** | Пользователь + Сотрудник | organization → Organization, active_organization (SA), role (owner/admin/manager/seller/courier/accountant), phone, avatar, position → Position, trading_point (assigned), active_trading_point (session), hire_date, fire_date, notes |
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
2. `user.employee_profile.trading_point` — привязка сотрудника
3. `None` — нет фильтрации по TP (показываются все данные текущей организации)

Поддержка вложенных моделей через `org_field`: для SaleItem → `org_field='sale__organization'`, для OrderItem → `org_field='order__organization'` и т.д.

#### Авто-назначение организации и торговой точки: `OrgPerformCreateMixin`
- Автоматически устанавливает `organization` из `request.user.organization` при создании (POST) и обновлении (PATCH/PUT)
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
- `CORS_ALLOWED_ORIGINS` — из переменной окружения `CORS_ALLOWED_ORIGINS` (по умолчанию: localhost:3000, 5173, 8000)
- `DEFAULT_THROTTLE_RATES`: `anon: 30/min`, `user: 300/min`
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
- 🔲 PromoCode: атомарный инкремент used_count через F() при применении
- 🔲 Начисление бонусов клиенту при продаже (LoyaltyProgram)
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
- **LoginPage.tsx**: Убраны демо-креденшалы (`Демо: admin / admin123`) со страницы входа.

## Changelog (2026-02-28)

### Блок Продаж (Sales)
- **Фильтрация и Автокомплит**: Поле выбора номенклатуры переведено на Autocomplete с возможностью текстового поиска.
- **Многоуровневый фильтр остатков**: При добавлении позиций отображаются только товары, имеющиеся на складах текущей торговой точки пользователя. 
- **Удобство продавца**: По умолчанию подставляется текущая точка и текущий продавец-пользователь.
- **Отображение состава букета**: При выборе букета в списке продажи автоматически отображается его состав мелким шрифтом.
- **Багфикс позиций**: Исправлена проблема сохранения добавленных к продаже позиций (добавлена успешная автоматическая миграция колонки discount_percent, улучшена логика валидации). 

## Changelog (2026-02-27)

### Backend
- **Sales**: Полная переработка сериализаторов. `SaleSerializer` принимает `items_data` для позиций (вместо отдельных запросов). `SaleItemSerializer` возвращает `nomenclature_type`, `warehouse_name`, `bouquet_components` (состав букета). `_recalc_totals` учитывает `discount_percent` (глобальная скидка на чек).
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
- **shared/constants.ts**: Создан модуль констант: `USER_ROLES`, `SALE_STATUSES`, `ORDER_STATUSES`, `DELIVERY_STATUSES`, `MOVEMENT_TYPES`, `NOMENCLATURE_TYPES`, `WAREHOUSE_TYPES`, `WALLET_TYPES`, `TRANSACTION_TYPES`, `WRITEOFF_REASONS`, `AD_CHANNEL_TYPES`.
- **shared/index.ts**: Barrel-экспорт всех модулей через `@/shared`.

### Cleanup
- Удалены устаревшие файлы: `AUDIT_REPORT.md`, `AUDIT_REPORT_DETAILED.md`, `FRONTEND_AUDIT.md`, `FRONTEND_AUDIT_DEEP.md`, `BACKEND_AUDIT_REPORT.md`, `FRONTEND_ARCHITECTURE_AUDIT.md`.
- Удалены мусорные файлы: `update.tar.gz`, `~$FLOW.docx`, `deployment_patch.py`, `deploy_full.py`, `ssh_cmd.py`, `SalesPage.tsx.bak`.

---

## Tech Debt / Known Issues

Результаты архитектурного аудита (оценка готовности к production: ~75%).

### Критические проблемы (требуют решения)

| # | Проблема | Локация | Приоритет |
|---|----------|---------|-----------|
| 1 | ~~Customer.total_purchases не обновлялся~~ | sales/serializers.py | ✅ FIXED |
| 2 | ~~Race condition в FIFO write-off~~ | inventory/services.py | ✅ FIXED |
| 3 | ~~Order status переходы без валидации~~ | sales/models.py | ✅ FIXED |
| 4 | ~~Нет Code Splitting~~ | frontend/App.tsx | ✅ FIXED |
| 5 | ~~Нет Error Boundary~~ | frontend/App.tsx | ✅ FIXED |
| 6 | ~~UniqueConstraints отсутствуют~~ | core, inventory, customers, marketing | ✅ FIXED |
| 7 | ~~Возможные race conditions при генерации номеров (sale/order)~~ | sales/serializers.py + sales/models.py | ✅ FIXED |
| 8 | Бизнес-логика в сериализаторах вместо services | sales, inventory | MEDIUM |
| 9 | Нет audit-лога изменений (кто, что, когда) | Все приложения | MEDIUM |
| 10 | Нет системы уведомлений (email/push) | Проект | MEDIUM |

### Архитектурные улучшения (roadmap)

| Область | Текущее состояние | Рекомендация |
|---------|-------------------|--------------|
| **Frontend — типы** | Дублирование интерфейсов | ~~Создать shared/types.ts~~ ✅ |
| **Frontend — форматтеры** | Дублирование функций | ~~Создать shared/formatters.ts~~ ✅ |
| **Frontend — константы** | Хардкод в компонентах | ~~Создать shared/constants.ts~~ ✅ |
| **Frontend — God Components** | SalesPage ~1000+ строк | Разбить на hooks + sub-components |
| **Frontend — Code Splitting** | ~~Всё в одном bundle~~ | ~~React.lazy() + Suspense~~ ✅ |
| **Frontend — Error Boundary** | ~~Отсутствует~~ | ~~ErrorBoundary class component~~ ✅ |
| **Backend — services layer** | Логика в serializers | Выделить business logic в services/ |
| **Backend — audit log** | Отсутствует | django-auditlog или custom middleware |
| **Backend — notifications** | Отсутствует | Celery + email/telegram |
| **Testing** | Нет тестов | pytest + coverage target 70% |

### API Endpoints — потенциальные N+1

- `GET /api/sales/` — items с nomenclature требуют prefetch_related
- `GET /api/inventory/batches/` — movements count per batch

### Безопасность

- ✅ SECRET_KEY использует `os.getenv()` (проверено)
- ✅ JWT с ротацией токенов
- ⚠️ Rate limiting рекомендуется (django-ratelimit)
- ⚠️ CORS origins в production должны быть ограничены

---

## Changelog

### 2026-03-01 — Архитектурный аудит и исправления

#### Backend

**inventory/services.py**
- ✅ Добавлен `@transaction.atomic` для `fifo_write_off()` — критическое исправление race condition при использовании `select_for_update()`

**sales/models.py**
- ✅ Добавлен `ALLOWED_TRANSITIONS` — конечный автомат допустимых переходов статусов заказа
- ✅ Добавлен метод `can_transition_to(new_status)` — проверка допустимости перехода
- ✅ Добавлен метод `transition_to(new_status, user, comment)` — безопасный переход с логированием в OrderStatusHistory

**core/models.py**
- ✅ TradingPoint: добавлен `UniqueConstraint(fields=['organization', 'name'])`
- ✅ Warehouse: добавлен `UniqueConstraint(fields=['organization', 'trading_point', 'name'])`

**inventory/models.py**
- ✅ Batch: добавлен `CheckConstraint(remaining >= 0)` — защита от отрицательных остатков
- ✅ StockBalance: заменён `unique_together` на `UniqueConstraint(fields=['organization', 'warehouse', 'nomenclature'])`

**customers/models.py**
- ✅ Customer: добавлен `UniqueConstraint(fields=['organization', 'phone'], condition=Q(phone__gt=''))` — уникальность телефона в рамках организации

**marketing/models.py**
- ✅ PromoCode: добавлен `UniqueConstraint(fields=['organization', 'code'])` — уникальность промокода в рамках организации

#### Frontend

**App.tsx**
- ✅ Code Splitting: все страницы загружаются через `React.lazy()` (~15 компонентов)
- ✅ Error Boundary: добавлен class component с fallback UI и кнопкой "Обновить страницу"
- ✅ PageLoader: добавлен компонент загрузки для Suspense fallback
- ✅ Каждый Route обёрнут в `<Suspense fallback={<PageLoader />}>`

#### Infrastructure / Deploy

- ✅ Устранён дрейф схемы БД: миграции constraints добавлены в репозиторий (`core.0007`, `customers.0002`, `inventory.0003`, `marketing.0002`)
- ✅ Подтверждена синхронизация моделей и миграций: `manage.py makemigrations` → `No changes detected`
- ✅ Продакшен-деплой выполнен на сервер `130.49.146.199`, контейнеры `backend/frontend/db` в статусе `Up`

#### Sales hardening (2026-03-01)

- ✅ Добавлена сериализация генерации номеров через lock строки `Organization` (`select_for_update`) для исключения гонок даже при пустых таблицах
- ✅ Реализована автогенерация номера заказа в `OrderSerializer.create()`
- ✅ Добавлена валидация допустимых переходов статуса заказа в `OrderSerializer.update()`
- ✅ Добавлено журналирование переходов статусов через `OrderStatusHistory` при create/update
- ✅ Добавлены DB-инварианты уникальности номера в пределах организации: `unique_sale_number_per_org`, `unique_order_number_per_org`
- ✅ Выполнен DDD-рефакторинг: бизнес-логика продаж/заказов вынесена из `sales/serializers.py` в `sales/services.py` (нумерация, синхронизация транзакций, FIFO-списание, валидация переходов статусов, история статусов)

#### Inventory hardening (2026-03-01)

- ✅ Выполнен service-layer рефакторинг для `inventory`: агрегация остатков (`stock/summary`) и коррекция букетов (`correct-bouquet`) вынесены из `inventory/views.py` в `inventory/services.py`
- ✅ Усилена tenant-изоляция в сценариях сборки/раскомплектовки/коррекции: добавлены проверки принадлежности компонентов и складов организации пользователя
- ✅ Снижен архитектурный риск «fat views»: `inventory/views.py` оставлен как orchestration/API слой, доменные операции перенесены в сервисы

#### Finance hardening (2026-03-01)

- ✅ Выполнен service-layer рефакторинг для `finance`: доменная логика балансов вынесена из `finance/views.py` в `finance/services.py`
- ✅ Усилена tenant-безопасность при `TransactionViewSet.perform_update`: добавлена обязательная повторная проверка принадлежности кошельков организации
- ✅ Усилена конкурентная безопасность на update/destroy транзакций: добавлены блокировки `select_for_update` на изменяемую транзакцию перед откатом/применением баланса
- ✅ Добавлены базовые инварианты для переводов: `transfer` требует `wallet_from + wallet_to`, кошельки перевода не могут совпадать

#### Runtime stability (2026-03-01)

- ✅ Устранён `UnorderedObjectListWarning` для `TradingPoint` (нестабильная пагинация): в `core/views.py` добавлена явная сортировка queryset `order_by('name', 'id')`