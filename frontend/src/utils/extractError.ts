import { AxiosError } from 'axios'

/**
 * Извлекает человекочитаемое сообщение об ошибке из ответа API (DRF).
 * Поддерживает форматы:
 *   - { field: ["error1", "error2"] }
 *   - { detail: "error" }
 *   - { non_field_errors: ["error"] }
 *   - "plain string"
 *   - ["list", "of", "errors"]
 */

const FIELD_LABELS: Record<string, string> = {
  first_name: 'Имя',
  last_name: 'Фамилия',
  patronymic: 'Отчество',
  phone: 'Телефон',
  email: 'Email',
  name: 'Название',
  organization: 'Организация',
  position: 'Должность',
  trading_point: 'Торговая точка',
  hire_date: 'Дата найма',
  fire_date: 'Дата увольнения',
  date: 'Дата',
  start_time: 'Начало',
  end_time: 'Окончание',
  employee: 'Сотрудник',
  customer: 'Клиент',
  supplier: 'Поставщик',
  nomenclature_type: 'Тип номенклатуры',
  purchase_price: 'Закупочная цена',
  retail_price: 'Розничная цена',
  min_price: 'Минимальная цена',
  markup_percent: 'Наценка',
  group: 'Группа',
  unit: 'Единица измерения',
  sku: 'Артикул',
  barcode: 'Штрих-код',
  address: 'Адрес',
  amount: 'Сумма',
  base_salary: 'Базовый оклад',
  base_amount: 'Базовая сумма',
  bonus: 'Бонус',
  penalty: 'Штраф',
  total: 'Итого',
  period_start: 'Начало периода',
  period_end: 'Конец периода',
  status: 'Статус',
  break_minutes: 'Перерыв',
  is_active: 'Активен',
  notes: 'Примечания',
  description: 'Описание',
  short_name: 'Сокращение',
  parent: 'Родительская группа',
  sort_order: 'Сортировка',
  color: 'Цвет',
  country: 'Страна',
  season_start: 'Начало сезона',
  season_end: 'Конец сезона',
  shelf_life_days: 'Срок годности',
  min_stock: 'Мин. остаток',
  warehouse: 'Склад',
  quantity: 'Количество',
  delivery_date: 'Дата доставки',
  delivery_time_from: 'Время доставки с',
  delivery_time_to: 'Время доставки до',
  order: 'Заказ',
  courier: 'Курьер',
  payment_method: 'Способ оплаты',
  category: 'Категория',
  wallet: 'Кошелёк',
  non_field_errors: 'Ошибка',
  detail: 'Ошибка',
  user: 'Пользователь',
}

function labelFor(field: string): string {
  return FIELD_LABELS[field] || field
}

function flattenValue(val: unknown): string {
  if (Array.isArray(val)) return val.map(v => String(v)).join(', ')
  if (typeof val === 'string') return val
  if (typeof val === 'object' && val !== null) {
    return Object.entries(val)
      .map(([k, v]) => `${labelFor(k)}: ${flattenValue(v)}`)
      .join('; ')
  }
  return String(val)
}

export default function extractError(err: unknown, fallback = 'Неизвестная ошибка'): string {
  if (!err) return fallback

  const axiosErr = err as AxiosError
  const data = axiosErr?.response?.data

  if (!data) {
    if (axiosErr?.message) return axiosErr.message
    return fallback
  }

  // String response
  if (typeof data === 'string') return data

  // Array response
  if (Array.isArray(data)) return data.map(v => String(v)).join(', ')

  // Object response — typical DRF validation errors
  if (typeof data === 'object') {
    const obj = data as Record<string, unknown>

    // Simple { detail: "..." }
    if (obj.detail && typeof obj.detail === 'string') return obj.detail

    // Field validation errors
    const parts: string[] = []
    for (const [key, val] of Object.entries(obj)) {
      const label = labelFor(key)
      const message = flattenValue(val)
      if (key === 'non_field_errors' || key === 'detail') {
        parts.push(message)
      } else {
        parts.push(`${label}: ${message}`)
      }
    }
    if (parts.length) return parts.join('\n')
  }

  return fallback
}
