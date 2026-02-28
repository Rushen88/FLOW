/**
 * Общие типы данных для всего приложения.
 * Используются во всех страницах и компонентах.
 */

// ─── Core ───────────────────────────────────────────────────
export interface Organization {
  id: string
  name: string
  inn: string
  phone: string
  email: string
  is_active: boolean
  subscription_plan: string
  monthly_price: string
  paid_until: string | null
  max_users: number
}

export interface TradingPoint {
  id: string
  organization: string
  name: string
  address: string
  manager: string | null
  manager_name: string
  work_schedule: string
  is_active: boolean
}

export interface Warehouse {
  id: string
  organization: string
  trading_point: string
  name: string
  warehouse_type: 'main' | 'showcase' | 'fridge' | 'assembly' | 'reserve'
  is_default: boolean
  is_default_for_sales: boolean
  is_active: boolean
}

export interface User {
  id: string
  organization: string | null
  organization_name: string
  username: string
  email: string
  first_name: string
  last_name: string
  patronymic: string
  phone: string
  role: UserRole
  is_active: boolean
  is_superuser: boolean
  position: string | null
  position_name: string
  trading_point: string | null
  trading_point_name: string
  active_trading_point: string | null
  active_trading_point_name: string
}

export type UserRole = 'owner' | 'admin' | 'manager' | 'seller' | 'courier' | 'accountant'

// ─── Nomenclature ───────────────────────────────────────────
export type NomenclatureType =
  | 'single_flower'
  | 'bouquet'
  | 'composition'
  | 'packaging'
  | 'accessory'
  | 'ribbon'
  | 'toy'
  | 'postcard'
  | 'extra_good'
  | 'balloon'
  | 'pot_plant'
  | 'service'

export interface Nomenclature {
  id: string
  organization: string
  group: string | null
  group_name: string
  name: string
  nomenclature_type: NomenclatureType
  sku: string
  barcode: string
  unit: string | null
  purchase_price: string
  retail_price: string
  min_price: string
  markup_percent: string
  color: string
  country: string
  shelf_life_days: number | null
  min_stock: string
  is_active: boolean
  notes: string
}

export interface NomenclatureGroup {
  id: string
  organization: string
  parent: string | null
  parent_name: string
  name: string
  children?: NomenclatureGroup[]
}

export interface BouquetTemplate {
  id: string
  nomenclature: string
  nomenclature_name: string
  bouquet_name: string
  assembly_time_minutes: number
  difficulty: number
  description: string
  components: BouquetComponent[]
}

export interface BouquetComponent {
  id: string
  nomenclature: string
  nomenclature_name: string
  quantity: string
  is_required: boolean
}

// ─── Inventory ──────────────────────────────────────────────
export interface Batch {
  id: string
  organization: string
  nomenclature: string
  nomenclature_name: string
  supplier: string | null
  warehouse: string
  warehouse_name: string
  purchase_price: string
  quantity: string
  remaining: string
  arrival_date: string
  expiry_date: string | null
  invoice_number: string
  notes: string
  created_at: string
}

export interface StockBalance {
  id: string
  organization: string
  warehouse: string
  warehouse_name: string
  nomenclature: string
  nomenclature_name: string
  quantity: string
  avg_purchase_price: string
  updated_at: string
}

export interface StockMovement {
  id: string
  organization: string
  nomenclature: string
  nomenclature_name: string
  movement_type: MovementType
  warehouse_from: string | null
  warehouse_to: string | null
  batch: string | null
  quantity: string
  price: string | null
  sale: string | null
  order: string | null
  write_off_reason: string
  notes: string
  created_by: string | null
  created_at: string
}

export type MovementType = 
  | 'receipt'
  | 'write_off'
  | 'transfer'
  | 'sale'
  | 'return'
  | 'adjustment'
  | 'assembly'
  | 'disassembly'
  | 'correction'

// ─── Sales ──────────────────────────────────────────────────
export type SaleStatus = 'open' | 'completed' | 'cancelled'

export interface Sale {
  id: string
  organization: string
  trading_point: string
  trading_point_name: string
  number: string
  seller: string | null
  seller_name: string
  customer: string | null
  customer_name: string
  status: SaleStatus
  subtotal: string
  discount_percent: string
  discount_amount: string
  total: string
  payment_method: string | null
  is_paid: boolean
  notes: string
  created_at: string
  items: SaleItem[]
}

export interface SaleItem {
  id: string
  sale: string
  nomenclature: string
  nomenclature_name: string
  nomenclature_type: NomenclatureType
  batch: string | null
  warehouse_name: string
  quantity: string
  price: string
  discount_percent: string
  total: string
  cost_price: string
  bouquet_components: { name: string; quantity: string }[]
}

// ─── Customers ──────────────────────────────────────────────
export interface Customer {
  id: string
  organization: string
  first_name: string
  last_name: string
  patronymic: string
  full_name: string
  phone: string
  email: string
  gender: 'male' | 'female' | 'unknown'
  birth_date: string | null
  groups: string[]
  discount_percent: string
  bonus_points: string
  total_purchases: string
  purchases_count: number
  source: string
  notes: string
  is_active: boolean
}

export interface CustomerGroup {
  id: string
  organization: string
  name: string
  discount_percent: string
  color: string
}

export interface ImportantDate {
  id: string
  customer: string
  name: string
  date: string
  remind_days_before: number
}

// ─── Finance ────────────────────────────────────────────────
export type WalletType = 'cash' | 'bank_account' | 'card' | 'electronic' | 'personal_card' | 'other'
export type TransactionType = 'income' | 'expense' | 'transfer' | 'supplier_payment' | 'salary' | 'personal_expense'

export interface Wallet {
  id: string
  organization: string
  trading_point: string | null
  name: string
  wallet_type: WalletType
  balance: string
  allow_negative: boolean
  owner: string | null
  is_active: boolean
}

export interface Transaction {
  id: string
  organization: string
  transaction_type: TransactionType
  wallet_from: string | null
  wallet_to: string | null
  amount: string
  category: string | null
  category_name: string
  sale: string | null
  order: string | null
  employee: string | null
  description: string
  created_at: string
}

// ─── Staff ──────────────────────────────────────────────────
export interface Position {
  id: string
  organization: string
  name: string
  base_salary: string
}

export interface Employee extends User {
  hire_date: string | null
  fire_date: string | null
}

// ─── Delivery ───────────────────────────────────────────────
export type DeliveryStatus = 'pending' | 'assigned' | 'picked_up' | 'in_transit' | 'delivered' | 'failed' | 'cancelled'

export interface DeliveryZone {
  id: string
  organization: string
  name: string
  price: string
  free_from: string
  estimated_minutes: number
}

export interface Courier {
  id: string
  organization: string
  name: string
  phone: string
  courier_type: 'internal' | 'external' | 'service'
  vehicle: string
  delivery_rate: string
  is_available: boolean
}

export interface Delivery {
  id: string
  organization: string
  order: string
  courier: string | null
  courier_name: string
  zone: string | null
  zone_name: string
  status: DeliveryStatus
  delivery_date: string
  time_from: string | null
  time_to: string | null
  address: string
  recipient_name: string
  recipient_phone: string
  notes: string
  photo_proof: string | null
  actual_delivered_at: string | null
}

export interface CashShift {
  id: string;
  trading_point: string;
  wallet: string;
  opened_by_name: string;
  closed_by_name: string;
  status: 'open' | 'closed';
  opened_at: string;
  closed_at: string | null;
  balance_at_open: string;
  expected_balance_at_close: string | null;
  actual_balance_at_close: string | null;
  discrepancy: string | null;
  notes: string;
}

