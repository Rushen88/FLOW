/**
 * Константы приложения — статусы, роли, типы и другие справочники.
 */

// ─── User Roles ─────────────────────────────────────────────
export const USER_ROLES = [
  { value: 'owner', label: 'Владелец', color: 'error' as const },
  { value: 'admin', label: 'Администратор', color: 'warning' as const },
  { value: 'manager', label: 'Менеджер', color: 'info' as const },
  { value: 'seller', label: 'Продавец', color: 'success' as const },
  { value: 'courier', label: 'Курьер', color: 'secondary' as const },
  { value: 'accountant', label: 'Бухгалтер', color: 'primary' as const },
] as const

// ─── Sale Status ────────────────────────────────────────────
export const SALE_STATUSES = [
  { value: 'open', label: 'Открыта', color: 'warning' as const },
  { value: 'completed', label: 'Завершена', color: 'success' as const },
  { value: 'cancelled', label: 'Отменена', color: 'error' as const },
] as const

// ─── Order Status ───────────────────────────────────────────
export const ORDER_STATUSES = [
  { value: 'new', label: 'Новый', color: 'info' as const },
  { value: 'confirmed', label: 'Подтверждён', color: 'primary' as const },
  { value: 'in_assembly', label: 'В сборке', color: 'warning' as const },
  { value: 'assembled', label: 'Собран', color: 'success' as const },
  { value: 'on_delivery', label: 'На доставке', color: 'secondary' as const },
  { value: 'delivered', label: 'Доставлен', color: 'success' as const },
  { value: 'completed', label: 'Завершён', color: 'success' as const },
  { value: 'cancelled', label: 'Отменён', color: 'error' as const },
] as const

// ─── Delivery Status ────────────────────────────────────────
export const DELIVERY_STATUSES = [
  { value: 'pending', label: 'Ожидает', color: 'default' as const },
  { value: 'assigned', label: 'Назначен курьер', color: 'info' as const },
  { value: 'picked_up', label: 'Забран', color: 'primary' as const },
  { value: 'in_transit', label: 'В пути', color: 'warning' as const },
  { value: 'delivered', label: 'Доставлен', color: 'success' as const },
  { value: 'failed', label: 'Не доставлен', color: 'error' as const },
  { value: 'cancelled', label: 'Отменён', color: 'error' as const },
] as const

// ─── Movement Types ─────────────────────────────────────────
export const MOVEMENT_TYPES = [
  { value: 'receipt', label: 'Приход', color: 'success' as const },
  { value: 'write_off', label: 'Списание', color: 'error' as const },
  { value: 'transfer', label: 'Перемещение', color: 'info' as const },
  { value: 'sale', label: 'Продажа', color: 'primary' as const },
  { value: 'return', label: 'Возврат', color: 'warning' as const },
  { value: 'adjustment', label: 'Корректировка', color: 'secondary' as const },
  { value: 'assembly', label: 'Сборка', color: 'success' as const },
  { value: 'disassembly', label: 'Раскомплектовка', color: 'warning' as const },
  { value: 'correction', label: 'Коррекция', color: 'info' as const },
] as const

// ─── Nomenclature Types ─────────────────────────────────────
export const NOMENCLATURE_TYPES = [
  { value: 'single_flower', label: 'Штучный цветок' },
  { value: 'bouquet', label: 'Готовый букет' },
  { value: 'composition', label: 'Композиция' },
  { value: 'packaging', label: 'Упаковка' },
  { value: 'accessory', label: 'Аксессуар' },
  { value: 'ribbon', label: 'Лента' },
  { value: 'toy', label: 'Игрушка' },
  { value: 'postcard', label: 'Открытка' },
  { value: 'extra_good', label: 'Сопутствующий товар' },
  { value: 'balloon', label: 'Воздушный шар' },
  { value: 'pot_plant', label: 'Горшечное растение' },
  { value: 'service', label: 'Услуга' },
] as const

// ─── Warehouse Types ────────────────────────────────────────
export const WAREHOUSE_TYPES = [
  { value: 'main', label: 'Основной' },
  { value: 'showcase', label: 'Витрина' },
  { value: 'fridge', label: 'Холодильник' },
  { value: 'assembly', label: 'Сборка' },
  { value: 'reserve', label: 'Резерв' },
] as const

// ─── Wallet Types ───────────────────────────────────────────
export const WALLET_TYPES = [
  { value: 'cash', label: 'Наличные' },
  { value: 'bank_account', label: 'Расчётный счёт' },
  { value: 'card', label: 'Карта организации' },
  { value: 'electronic', label: 'Электронный кошелёк' },
  { value: 'personal_card', label: 'Личная карта сотрудника' },
  { value: 'other', label: 'Другое' },
] as const

// ─── Transaction Types ──────────────────────────────────────
export const TRANSACTION_TYPES = [
  { value: 'income', label: 'Приход', color: 'success' as const },
  { value: 'expense', label: 'Расход', color: 'error' as const },
  { value: 'transfer', label: 'Перемещение', color: 'info' as const },
  { value: 'supplier_payment', label: 'Оплата поставщику', color: 'warning' as const },
  { value: 'salary', label: 'Зарплата', color: 'primary' as const },
  { value: 'personal_expense', label: 'Личный расход', color: 'secondary' as const },
] as const

// ─── Write-off Reasons ──────────────────────────────────────
export const WRITEOFF_REASONS = [
  { value: 'spoilage', label: 'Испорчен / завял' },
  { value: 'damage', label: 'Повреждён' },
  { value: 'expired', label: 'Истёк срок годности' },
  { value: 'theft', label: 'Кража/недостача' },
  { value: 'other', label: 'Другое' },
] as const

// ─── Ad Channel Types ───────────────────────────────────────
export const AD_CHANNEL_TYPES = [
  { value: 'social', label: 'Социальные сети' },
  { value: 'search', label: 'Поисковая реклама' },
  { value: 'outdoor', label: 'Наружная реклама' },
  { value: 'print', label: 'Печатная реклама' },
  { value: 'radio', label: 'Радио' },
  { value: 'tv', label: 'ТВ' },
  { value: 'referral', label: 'Сарафанное радио' },
  { value: 'other', label: 'Другое' },
] as const
