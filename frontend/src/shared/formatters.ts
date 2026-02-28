/**
 * Утилиты форматирования данных.
 * Используются во всех страницах и компонентах.
 */

/**
 * Форматирование числа с разделителями разрядов.
 * @example fmtNum('1234567.89') → '1 234 567,89'
 */
export function fmtNum(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—'
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return '—'
  return num.toLocaleString('ru-RU', { maximumFractionDigits: 2 })
}

/**
 * Форматирование валюты (рубли).
 * @example fmtCurrency(1234.5) → '1 234,50 ₽'
 */
export function fmtCurrency(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—'
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return '—'
  return num.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₽'
}

/**
 * Форматирование процентов.
 * @example fmtPercent(15.5) → '15,5%'
 */
export function fmtPercent(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—'
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return '—'
  return num.toLocaleString('ru-RU', { maximumFractionDigits: 1 }) + '%'
}

/**
 * Форматирование даты (только дата).
 * @example fmtDate('2026-03-01') → '01.03.2026'
 */
export function fmtDate(value: string | null | undefined): string {
  if (!value) return '—'
  const d = new Date(value)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('ru-RU')
}

/**
 * Форматирование даты и времени.
 * @example fmtDateTime('2026-03-01T14:30:00') → '01.03.2026 14:30'
 */
export function fmtDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const d = new Date(value)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('ru-RU') + ' ' + d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

/**
 * Форматирование времени.
 * @example fmtTime('14:30:00') → '14:30'
 */
export function fmtTime(value: string | null | undefined): string {
  if (!value) return '—'
  // Может быть полная дата или только время
  if (value.includes('T')) {
    const d = new Date(value)
    if (isNaN(d.getTime())) return '—'
    return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  }
  // Только время HH:MM:SS
  const parts = value.split(':')
  return parts.slice(0, 2).join(':')
}

/**
 * Форматирование телефона.
 * @example fmtPhone('+79001234567') → '+7 (900) 123-45-67'
 */
export function fmtPhone(value: string | null | undefined): string {
  if (!value) return '—'
  const digits = value.replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('7')) {
    return `+7 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9, 11)}`
  }
  if (digits.length === 10) {
    return `+7 (${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 8)}-${digits.slice(8, 10)}`
  }
  return value
}

/**
 * Сокращение длинного текста с многоточием.
 * @example truncate('Очень длинный текст', 10) → 'Очень дл...'
 */
export function truncate(value: string | null | undefined, maxLength: number): string {
  if (!value) return ''
  if (value.length <= maxLength) return value
  return value.slice(0, maxLength - 3) + '...'
}

/**
 * Склонение слов (1 товар, 2 товара, 5 товаров).
 * @example pluralize(5, 'товар', 'товара', 'товаров') → '5 товаров'
 */
export function pluralize(count: number, one: string, few: string, many: string): string {
  const n = Math.abs(count) % 100
  const n1 = n % 10
  if (n > 10 && n < 20) return `${count} ${many}`
  if (n1 > 1 && n1 < 5) return `${count} ${few}`
  if (n1 === 1) return `${count} ${one}`
  return `${count} ${many}`
}
