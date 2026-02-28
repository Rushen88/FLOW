import { useState, useEffect, useCallback } from 'react'
import {
  Box, Typography, TextField, Button, Tab, Tabs, Chip, MenuItem,
  Switch, FormControlLabel, Card, CardContent, IconButton,
} from '@mui/material'
import Grid from '@mui/material/Grid2'
import {
  Add, Edit, Delete, AccountBalanceWallet, SwapHoriz, Category, Receipt,
} from '@mui/icons-material'
import api from '../api'
import { useAuth } from '../contexts/AuthContext'
import { useNotification } from '../contexts/NotificationContext'
import extractError from '../utils/extractError'
import DataTable from '../components/DataTable'
import EntityFormDialog from '../components/EntityFormDialog'
import ConfirmDialog from '../components/ConfirmDialog'

// ─── Types ───
interface Wallet {
  id: string; organization: string; trading_point: string | null; name: string
  wallet_type: string; balance: string; allow_negative: boolean; owner: string | null
  is_active: boolean; notes: string
}
interface Transaction {
  id: string; organization: string; transaction_type: string; category: string | null
  wallet_from: string | null; wallet_to: string | null; amount: string
  sale: string | null; order: string | null; employee: string | null
  description: string; user: string | null; created_at: string
  category_name: string; wallet_from_name: string; wallet_to_name: string
}
interface TransactionCategory {
  id: string; organization: string; name: string; direction: string; parent: string | null; is_system: boolean
}
interface Debt {
  id: string; organization: string; debt_type: string; direction: string
  counterparty_name: string; amount: string; paid_amount: string; due_date: string
  is_closed: boolean; notes: string; created_at: string; remaining: string
}
interface TradingPoint { id: string; name: string }
interface WalletSummary { total_balance: number; wallets_count: number }

// ─── Constants ───
const WALLET_TYPES = [
  { value: 'cash', label: 'Касса' }, { value: 'bank_account', label: 'Расчётный счёт' },
  { value: 'card', label: 'Банковская карта' }, { value: 'personal_card', label: 'Личная карта' },
  { value: 'online', label: 'Онлайн-кошелёк' }, { value: 'other', label: 'Прочее' },
]
const TRANSACTION_TYPES = [
  { value: 'income', label: 'Доход', color: 'success' as const },
  { value: 'expense', label: 'Расход', color: 'error' as const },
  { value: 'transfer', label: 'Перевод', color: 'info' as const },
  { value: 'salary', label: 'Зарплата', color: 'warning' as const },
  { value: 'personal_expense', label: 'Личные расходы', color: 'secondary' as const },
  { value: 'supplier_payment', label: 'Оплата поставщику', color: 'default' as const },
]
const DIRECTIONS = [
  { value: 'income', label: 'Доход', color: 'success' as const },
  { value: 'expense', label: 'Расход', color: 'error' as const },
]
const DEBT_TYPES = [
  { value: 'supplier', label: 'Поставщик' }, { value: 'employee', label: 'Сотрудник' },
  { value: 'customer', label: 'Клиент' }, { value: 'other', label: 'Прочее' },
]
const DEBT_DIRECTIONS = [
  { value: 'we_owe', label: 'Мы должны', color: 'error' as const },
  { value: 'owed_to_us', label: 'Нам должны', color: 'success' as const },
]

const fmtDate = (v: string) => v ? new Date(v).toLocaleDateString('ru-RU') : '—'
const fmtDateTime = (v: string) => v ? new Date(v).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' }) : '—'
const fmtCur = (v: string | number) =>
  v != null ? parseFloat(String(v)).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₽' : '—'
const walletLabel = (v: string) => WALLET_TYPES.find(t => t.value === v)?.label || v
const txnChip = (v: string) => { const t = TRANSACTION_TYPES.find(x => x.value === v); return <Chip label={t?.label || v} size="small" color={t?.color || 'default'} /> }
const dirChip = (v: string) => { const d = DIRECTIONS.find(x => x.value === v); return <Chip label={d?.label || v} size="small" color={d?.color || 'default'} /> }
const debtTypeChip = (v: string) => <Chip label={DEBT_TYPES.find(x => x.value === v)?.label || v} size="small" color="primary" variant="outlined" />
const debtDirChip = (v: string) => { const d = DEBT_DIRECTIONS.find(x => x.value === v); return <Chip label={d?.label || v} size="small" color={d?.color || 'default'} /> }

const incomeTypes = new Set(['income'])
const expenseTypes = new Set(['expense', 'salary', 'personal_expense', 'supplier_payment'])

const defaultWalletForm = () => ({ name: '', wallet_type: 'cash', trading_point: '', balance: '', allow_negative: false, notes: '', is_active: true })
const defaultTxnForm = () => ({ transaction_type: 'income', category: '', wallet_from: '', wallet_to: '', amount: '', description: '' })
const defaultCatForm = () => ({ name: '', direction: 'expense', parent: '' })
const defaultDebtForm = () => ({ debt_type: 'supplier', direction: 'we_owe', counterparty_name: '', amount: '', paid_amount: '0', due_date: '', notes: '', is_closed: false })

export default function FinancePage() {
  const { notify } = useNotification()
  const { user } = useAuth()
  const [tab, setTab] = useState(0)
  const [tradingPoints, setTradingPoints] = useState<TradingPoint[]>([])

  useEffect(() => {
    api.get('/core/trading-points/').then(r => setTradingPoints(r.data.results || r.data || []))
  }, [])

  // ══════════════════ Tab 0: Wallets ══════════════════
  const [wallets, setWallets] = useState<Wallet[]>([])
  const [walletLoad, setWalletLoad] = useState(false)
  const [walletSearch, setWalletSearch] = useState('')
  const [summary, setSummary] = useState<WalletSummary>({ total_balance: 0, wallets_count: 0 })
  const [walletDlg, setWalletDlg] = useState(false)
  const [editWallet, setEditWallet] = useState<Wallet | null>(null)
  const [walletForm, setWalletForm] = useState(defaultWalletForm())
  const [walletSaving, setWalletSaving] = useState(false)
  const [delWallet, setDelWallet] = useState<Wallet | null>(null)

  const fetchWallets = useCallback(() => {
    setWalletLoad(true)
    const p: Record<string, string> = {}
    if (walletSearch) p.search = walletSearch
    api.get('/finance/wallets/', { params: p })
      .then(r => setWallets(r.data.results || r.data || []))
      .catch((err) => notify(extractError(err, 'Ошибка загрузки кошельков'), 'error'))
      .finally(() => setWalletLoad(false))
  }, [walletSearch, notify, user?.active_trading_point])

  const fetchSummary = useCallback(() => {
    api.get('/finance/wallets/summary/')
      .then(r => setSummary(r.data))
      .catch(() => {})
  }, [user?.active_trading_point])

  useEffect(() => { fetchWallets(); fetchSummary() }, [fetchWallets, fetchSummary])

  const openWalletDlg = (w?: Wallet) => {
    if (w) {
      setEditWallet(w)
      setWalletForm({ name: w.name, wallet_type: w.wallet_type, trading_point: w.trading_point || '', balance: w.balance, allow_negative: w.allow_negative, notes: w.notes || '', is_active: w.is_active })
    } else { setEditWallet(null); setWalletForm(defaultWalletForm()) }
    setWalletDlg(true)
  }

  const saveWallet = async () => {
    setWalletSaving(true)
    try {
      const d: Record<string, any> = { ...walletForm }
      if (!d.trading_point) d.trading_point = null
      if (!d.balance) d.balance = '0.00'
      if (editWallet) { await api.patch(`/finance/wallets/${editWallet.id}/`, d); notify('Кошелёк обновлён') }
      else { await api.post('/finance/wallets/', d); notify('Кошелёк создан') }
      setWalletDlg(false); fetchWallets(); fetchSummary()
    } catch (err) { notify(extractError(err, 'Ошибка сохранения'), 'error') }
    setWalletSaving(false)
  }

  const removeWallet = async () => {
    if (!delWallet) return
    try { await api.delete(`/finance/wallets/${delWallet.id}/`); notify('Кошелёк удалён'); setDelWallet(null); fetchWallets(); fetchSummary() }
    catch (err) { notify(extractError(err, 'Ошибка удаления'), 'error') }
  }

  // ══════════════════ Tab 1: Transactions ══════════════════
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [txnLoad, setTxnLoad] = useState(false)
  const [txnTypeFilter, setTxnTypeFilter] = useState('')
  const [txnDlg, setTxnDlg] = useState(false)
  const [txnForm, setTxnForm] = useState(defaultTxnForm())
  const [txnSaving, setTxnSaving] = useState(false)
  const [delTxn, setDelTxn] = useState<Transaction | null>(null)

  const fetchTransactions = useCallback(() => {
    setTxnLoad(true)
    const p: Record<string, string> = { ordering: '-created_at' }
    if (txnTypeFilter) p.transaction_type = txnTypeFilter
    api.get('/finance/transactions/', { params: p })
      .then(r => setTransactions(r.data.results || r.data || []))
      .catch((err) => notify(extractError(err, 'Ошибка загрузки операций'), 'error'))
      .finally(() => setTxnLoad(false))
  }, [txnTypeFilter, notify])

  useEffect(() => { if (tab === 1) fetchTransactions() }, [tab, fetchTransactions])

  const openTxnDlg = () => { setTxnForm(defaultTxnForm()); setTxnDlg(true) }

  const saveTxn = async () => {
    setTxnSaving(true)
    try {
      const d: Record<string, any> = { ...txnForm }
      if (!d.category) d.category = null
      if (!d.wallet_from) d.wallet_from = null
      if (!d.wallet_to) d.wallet_to = null
      await api.post('/finance/transactions/', d)
      notify('Операция создана'); setTxnDlg(false); fetchTransactions(); fetchWallets(); fetchSummary()
    } catch (err) { notify(extractError(err, 'Ошибка сохранения'), 'error') }
    setTxnSaving(false)
  }

  const removeTxn = async () => {
    if (!delTxn) return
    try { await api.delete(`/finance/transactions/${delTxn.id}/`); notify('Операция удалена'); setDelTxn(null); fetchTransactions(); fetchWallets(); fetchSummary() }
    catch (err) { notify(extractError(err, 'Ошибка удаления'), 'error') }
  }

  // ══════════════════ Tab 2: Categories ══════════════════
  const [categories, setCategories] = useState<TransactionCategory[]>([])
  const [catLoad, setCatLoad] = useState(false)
  const [catDlg, setCatDlg] = useState(false)
  const [editCat, setEditCat] = useState<TransactionCategory | null>(null)
  const [catForm, setCatForm] = useState(defaultCatForm())
  const [catSaving, setCatSaving] = useState(false)
  const [delCat, setDelCat] = useState<TransactionCategory | null>(null)

  const fetchCategories = useCallback(() => {
    setCatLoad(true)
    api.get('/finance/categories/')
      .then(r => setCategories(r.data.results || r.data || []))
      .catch((err) => notify(extractError(err, 'Ошибка загрузки категорий'), 'error'))
      .finally(() => setCatLoad(false))
  }, [notify])

  useEffect(() => { if (tab === 2) fetchCategories() }, [tab, fetchCategories])
  // Also load categories for transactions dialog
  useEffect(() => { fetchCategories() }, [fetchCategories])

  const openCatDlg = (c?: TransactionCategory) => {
    if (c) {
      setEditCat(c)
      setCatForm({ name: c.name, direction: c.direction, parent: c.parent || '' })
    } else { setEditCat(null); setCatForm(defaultCatForm()) }
    setCatDlg(true)
  }

  const saveCat = async () => {
    setCatSaving(true)
    try {
      const d: Record<string, any> = { ...catForm }
      if (!d.parent) d.parent = null
      if (editCat) { await api.patch(`/finance/categories/${editCat.id}/`, d); notify('Категория обновлена') }
      else { await api.post('/finance/categories/', d); notify('Категория создана') }
      setCatDlg(false); fetchCategories()
    } catch (err) { notify(extractError(err, 'Ошибка сохранения'), 'error') }
    setCatSaving(false)
  }

  const removeCat = async () => {
    if (!delCat) return
    try { await api.delete(`/finance/categories/${delCat.id}/`); notify('Категория удалена'); setDelCat(null); fetchCategories() }
    catch (err) { notify(extractError(err, 'Ошибка удаления'), 'error') }
  }

  // ══════════════════ Tab 3: Debts ══════════════════
  const [debts, setDebts] = useState<Debt[]>([])
  const [debtLoad, setDebtLoad] = useState(false)
  const [debtTypeFilter, setDebtTypeFilter] = useState('')
  const [debtDirFilter, setDebtDirFilter] = useState('')
  const [debtClosedFilter, setDebtClosedFilter] = useState('')
  const [debtDlg, setDebtDlg] = useState(false)
  const [editDebt, setEditDebt] = useState<Debt | null>(null)
  const [debtForm, setDebtForm] = useState(defaultDebtForm())
  const [debtSaving, setDebtSaving] = useState(false)
  const [delDebt, setDelDebt] = useState<Debt | null>(null)

  const fetchDebts = useCallback(() => {
    setDebtLoad(true)
    const p: Record<string, string> = {}
    if (debtTypeFilter) p.debt_type = debtTypeFilter
    if (debtDirFilter) p.direction = debtDirFilter
    if (debtClosedFilter) p.is_closed = debtClosedFilter
    api.get('/finance/debts/', { params: p })
      .then(r => setDebts(r.data.results || r.data || []))
      .catch((err) => notify(extractError(err, 'Ошибка загрузки долгов'), 'error'))
      .finally(() => setDebtLoad(false))
  }, [debtTypeFilter, debtDirFilter, debtClosedFilter, notify])

  useEffect(() => { if (tab === 3) fetchDebts() }, [tab, fetchDebts])

  const openDebtDlg = (d?: Debt) => {
    if (d) {
      setEditDebt(d)
      setDebtForm({ debt_type: d.debt_type, direction: d.direction, counterparty_name: d.counterparty_name, amount: d.amount, paid_amount: d.paid_amount, due_date: d.due_date || '', notes: d.notes || '', is_closed: d.is_closed })
    } else { setEditDebt(null); setDebtForm(defaultDebtForm()) }
    setDebtDlg(true)
  }

  const saveDebt = async () => {
    setDebtSaving(true)
    try {
      const d: Record<string, any> = { ...debtForm }
      if (!d.due_date) d.due_date = null
      if (editDebt) { await api.patch(`/finance/debts/${editDebt.id}/`, d); notify('Долг обновлён') }
      else { await api.post('/finance/debts/', d); notify('Долг создан') }
      setDebtDlg(false); fetchDebts()
    } catch (err) { notify(extractError(err, 'Ошибка сохранения'), 'error') }
    setDebtSaving(false)
  }

  const removeDebt = async () => {
    if (!delDebt) return
    try { await api.delete(`/finance/debts/${delDebt.id}/`); notify('Долг удалён'); setDelDebt(null); fetchDebts() }
    catch (err) { notify(extractError(err, 'Ошибка удаления'), 'error') }
  }

  // ─── Helpers for transaction form ───
  const txnDir = (type: string) => {
    if (incomeTypes.has(type)) return 'income'
    if (expenseTypes.has(type)) return 'expense'
    return 'transfer'
  }
  const filteredCategories = categories.filter(c => {
    const dir = txnDir(txnForm.transaction_type)
    if (dir === 'transfer') return true
    return c.direction === dir
  })
  const showWalletFrom = !incomeTypes.has(txnForm.transaction_type)
  const showWalletTo = !expenseTypes.has(txnForm.transaction_type)

  // ─── Render ───
  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 3, fontWeight: 700 }}>Финансы</Typography>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3 }}>
        <Tab icon={<AccountBalanceWallet />} label="Кошельки" iconPosition="start" />
        <Tab icon={<SwapHoriz />} label="Операции" iconPosition="start" />
        <Tab icon={<Category />} label="Категории" iconPosition="start" />
        <Tab icon={<Receipt />} label="Долги" iconPosition="start" />
      </Tabs>

      {/* ── Tab 0: Wallets ── */}
      {tab === 0 && (
        <Box>
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Card><CardContent>
                <Typography color="text.secondary" variant="body2">Общий баланс</Typography>
                <Typography variant="h5" sx={{ fontWeight: 700, color: summary.total_balance >= 0 ? 'success.main' : 'error.main' }}>
                  {fmtCur(summary.total_balance)}
                </Typography>
              </CardContent></Card>
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Card><CardContent>
                <Typography color="text.secondary" variant="body2">Кошельков</Typography>
                <Typography variant="h5" sx={{ fontWeight: 700 }}>{summary.wallets_count}</Typography>
              </CardContent></Card>
            </Grid>
          </Grid>

          <DataTable
            columns={[
              { key: 'name', label: 'Название', render: (v: string) => <Typography fontWeight={600}>{v}</Typography> },
              { key: 'wallet_type', label: 'Тип', render: (v: string) => <Chip label={walletLabel(v)} size="small" /> },
              { key: 'balance', label: 'Баланс', align: 'right', render: (v: string) => <Typography sx={{ color: parseFloat(v) >= 0 ? 'success.main' : 'error.main', fontWeight: 600 }}>{fmtCur(v)}</Typography> },
              { key: 'trading_point', label: 'Точка', render: (_: any, row: Wallet) => tradingPoints.find(tp => tp.id === row.trading_point)?.name || '—' },
              { key: 'is_active', label: 'Статус', render: (v: boolean) => <Chip label={v ? 'Активен' : 'Неактивен'} size="small" color={v ? 'success' : 'default'} /> },
              { key: '_actions', label: '', width: 100, render: (_: any, row: Wallet) => (
                <Box sx={{ display: 'flex', gap: 0.5 }}>
                  <IconButton size="small" onClick={(e) => { e.stopPropagation(); openWalletDlg(row) }}><Edit fontSize="small" /></IconButton>
                  <IconButton size="small" color="error" onClick={(e) => { e.stopPropagation(); setDelWallet(row) }}><Delete fontSize="small" /></IconButton>
                </Box>
              )},
            ]}
            rows={wallets}
            loading={walletLoad}
            search={walletSearch}
            onSearchChange={setWalletSearch}
            searchPlaceholder="Поиск кошельков..."
            headerActions={<Button variant="contained" startIcon={<Add />} onClick={() => openWalletDlg()}>Добавить</Button>}
          />

          <EntityFormDialog open={walletDlg} onClose={() => setWalletDlg(false)} onSubmit={saveWallet} title={editWallet ? 'Редактировать кошелёк' : 'Новый кошелёк'} loading={walletSaving}>
            <TextField label="Название" value={walletForm.name} onChange={e => setWalletForm({ ...walletForm, name: e.target.value })} required />
            <TextField label="Тип" select value={walletForm.wallet_type} onChange={e => setWalletForm({ ...walletForm, wallet_type: e.target.value })}>
              {WALLET_TYPES.map(t => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
            </TextField>
            <TextField label="Торговая точка" select value={walletForm.trading_point} onChange={e => setWalletForm({ ...walletForm, trading_point: e.target.value })}>
              <MenuItem value="">— Не выбрана —</MenuItem>
              {tradingPoints.map(tp => <MenuItem key={tp.id} value={tp.id}>{tp.name}</MenuItem>)}
            </TextField>
            <TextField label="Баланс" type="number" value={walletForm.balance} onChange={e => setWalletForm({ ...walletForm, balance: e.target.value })} />
            <FormControlLabel control={<Switch checked={walletForm.allow_negative} onChange={e => setWalletForm({ ...walletForm, allow_negative: e.target.checked })} />} label="Разрешить отрицательный баланс" />
            <TextField label="Заметки" value={walletForm.notes} onChange={e => setWalletForm({ ...walletForm, notes: e.target.value })} multiline rows={2} />
            <FormControlLabel control={<Switch checked={walletForm.is_active} onChange={e => setWalletForm({ ...walletForm, is_active: e.target.checked })} />} label="Активен" />
          </EntityFormDialog>

          <ConfirmDialog open={!!delWallet} onCancel={() => setDelWallet(null)} onConfirm={removeWallet} title="Удалить кошелёк?" message={`Вы уверены, что хотите удалить кошелёк «${delWallet?.name}»?`} />
        </Box>
      )}

      {/* ── Tab 1: Transactions ── */}
      {tab === 1 && (
        <Box>
          <DataTable
            columns={[
              { key: 'created_at', label: 'Дата', render: (v: string) => fmtDateTime(v) },
              { key: 'transaction_type', label: 'Тип', render: (v: string) => txnChip(v) },
              { key: 'category_name', label: 'Категория', render: (v: string) => v || '—' },
              { key: 'wallet_from_name', label: 'Откуда', render: (v: string) => v || '—' },
              { key: 'wallet_to_name', label: 'Куда', render: (v: string) => v || '—' },
              { key: 'amount', label: 'Сумма', align: 'right', render: (v: string, row: Transaction) => {
                const color = incomeTypes.has(row.transaction_type) ? 'success.main' : expenseTypes.has(row.transaction_type) ? 'error.main' : 'info.main'
                return <Typography sx={{ color, fontWeight: 600 }}>{fmtCur(v)}</Typography>
              }},
              { key: 'description', label: 'Описание', render: (v: string) => v || '—' },
              { key: '_actions', label: '', width: 60, render: (_: any, row: Transaction) => (
                <IconButton size="small" color="error" onClick={(e) => { e.stopPropagation(); setDelTxn(row) }}><Delete fontSize="small" /></IconButton>
              )},
            ]}
            rows={transactions}
            loading={txnLoad}
            headerActions={
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <TextField label="Тип" select size="small" value={txnTypeFilter} onChange={e => setTxnTypeFilter(e.target.value)} sx={{ minWidth: 180 }}>
                  <MenuItem value="">Все</MenuItem>
                  {TRANSACTION_TYPES.map(t => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
                </TextField>
                <Button variant="contained" startIcon={<Add />} onClick={openTxnDlg}>Добавить</Button>
              </Box>
            }
          />

          <EntityFormDialog open={txnDlg} onClose={() => setTxnDlg(false)} onSubmit={saveTxn} title="Новая операция" loading={txnSaving}>
            <TextField label="Тип операции" select value={txnForm.transaction_type} onChange={e => setTxnForm({ ...txnForm, transaction_type: e.target.value, category: '' })}>
              {TRANSACTION_TYPES.map(t => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
            </TextField>
            <TextField label="Категория" select value={txnForm.category} onChange={e => setTxnForm({ ...txnForm, category: e.target.value })}>
              <MenuItem value="">— Без категории —</MenuItem>
              {filteredCategories.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
            </TextField>
            {showWalletFrom && (
              <TextField label="Кошелёк-источник" select value={txnForm.wallet_from} onChange={e => setTxnForm({ ...txnForm, wallet_from: e.target.value })}>
                <MenuItem value="">— Не выбран —</MenuItem>
                {wallets.filter(w => w.is_active).map(w => <MenuItem key={w.id} value={w.id}>{w.name}</MenuItem>)}
              </TextField>
            )}
            {showWalletTo && (
              <TextField label="Кошелёк-получатель" select value={txnForm.wallet_to} onChange={e => setTxnForm({ ...txnForm, wallet_to: e.target.value })}>
                <MenuItem value="">— Не выбран —</MenuItem>
                {wallets.filter(w => w.is_active).map(w => <MenuItem key={w.id} value={w.id}>{w.name}</MenuItem>)}
              </TextField>
            )}
            <TextField label="Сумма" type="number" value={txnForm.amount} onChange={e => setTxnForm({ ...txnForm, amount: e.target.value })} required />
            <TextField label="Описание" value={txnForm.description} onChange={e => setTxnForm({ ...txnForm, description: e.target.value })} multiline rows={2} />
          </EntityFormDialog>

          <ConfirmDialog open={!!delTxn} onCancel={() => setDelTxn(null)} onConfirm={removeTxn} title="Удалить операцию?" message={`Удалить операцию на сумму ${delTxn ? fmtCur(delTxn.amount) : ''}?`} />
        </Box>
      )}

      {/* ── Tab 2: Categories ── */}
      {tab === 2 && (
        <Box>
          <DataTable
            columns={[
              { key: 'name', label: 'Название', render: (v: string) => <Typography fontWeight={600}>{v}</Typography> },
              { key: 'direction', label: 'Направление', render: (v: string) => dirChip(v) },
              { key: 'parent', label: 'Родитель', render: (v: string | null) => { const p = categories.find(c => c.id === v); return p?.name || '—' } },
              { key: 'is_system', label: 'Системная', render: (v: boolean) => v ? <Chip label="Да" size="small" color="info" /> : null },
              { key: '_actions', label: '', width: 100, render: (_: any, row: TransactionCategory) => (
                <Box sx={{ display: 'flex', gap: 0.5 }}>
                  <IconButton size="small" onClick={(e) => { e.stopPropagation(); openCatDlg(row) }}><Edit fontSize="small" /></IconButton>
                  <IconButton size="small" color="error" onClick={(e) => { e.stopPropagation(); setDelCat(row) }}><Delete fontSize="small" /></IconButton>
                </Box>
              )},
            ]}
            rows={categories}
            loading={catLoad}
            headerActions={<Button variant="contained" startIcon={<Add />} onClick={() => openCatDlg()}>Добавить</Button>}
          />

          <EntityFormDialog open={catDlg} onClose={() => setCatDlg(false)} onSubmit={saveCat} title={editCat ? 'Редактировать категорию' : 'Новая категория'} loading={catSaving}>
            <TextField label="Название" value={catForm.name} onChange={e => setCatForm({ ...catForm, name: e.target.value })} required />
            <TextField label="Направление" select value={catForm.direction} onChange={e => setCatForm({ ...catForm, direction: e.target.value })}>
              {DIRECTIONS.map(d => <MenuItem key={d.value} value={d.value}>{d.label}</MenuItem>)}
            </TextField>
            <TextField label="Родительская категория" select value={catForm.parent} onChange={e => setCatForm({ ...catForm, parent: e.target.value })}>
              <MenuItem value="">— Нет —</MenuItem>
              {categories.filter(c => c.id !== editCat?.id).map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
            </TextField>
          </EntityFormDialog>

          <ConfirmDialog open={!!delCat} onCancel={() => setDelCat(null)} onConfirm={removeCat} title="Удалить категорию?" message={`Вы уверены, что хотите удалить категорию «${delCat?.name}»?`} />
        </Box>
      )}

      {/* ── Tab 3: Debts ── */}
      {tab === 3 && (
        <Box>
          <DataTable
            columns={[
              { key: 'counterparty_name', label: 'Контрагент', render: (v: string) => <Typography fontWeight={600}>{v}</Typography> },
              { key: 'debt_type', label: 'Тип', render: (v: string) => debtTypeChip(v) },
              { key: 'direction', label: 'Направление', render: (v: string) => debtDirChip(v) },
              { key: 'amount', label: 'Сумма', align: 'right', render: (v: string) => fmtCur(v) },
              { key: 'paid_amount', label: 'Оплачено', align: 'right', render: (v: string) => fmtCur(v) },
              { key: 'remaining', label: 'Остаток', align: 'right', render: (v: string) => <Typography sx={{ fontWeight: 600, color: parseFloat(v) > 0 ? 'error.main' : 'success.main' }}>{fmtCur(v)}</Typography> },
              { key: 'due_date', label: 'Срок', render: (v: string) => fmtDate(v) },
              { key: 'is_closed', label: 'Статус', render: (v: boolean) => <Chip label={v ? 'Закрыт' : 'Открыт'} size="small" color={v ? 'success' : 'warning'} /> },
              { key: '_actions', label: '', width: 100, render: (_: any, row: Debt) => (
                <Box sx={{ display: 'flex', gap: 0.5 }}>
                  <IconButton size="small" onClick={(e) => { e.stopPropagation(); openDebtDlg(row) }}><Edit fontSize="small" /></IconButton>
                  <IconButton size="small" color="error" onClick={(e) => { e.stopPropagation(); setDelDebt(row) }}><Delete fontSize="small" /></IconButton>
                </Box>
              )},
            ]}
            rows={debts}
            loading={debtLoad}
            headerActions={
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <TextField label="Тип" select size="small" value={debtTypeFilter} onChange={e => setDebtTypeFilter(e.target.value)} sx={{ minWidth: 150 }}>
                  <MenuItem value="">Все</MenuItem>
                  {DEBT_TYPES.map(t => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
                </TextField>
                <TextField label="Направление" select size="small" value={debtDirFilter} onChange={e => setDebtDirFilter(e.target.value)} sx={{ minWidth: 160 }}>
                  <MenuItem value="">Все</MenuItem>
                  {DEBT_DIRECTIONS.map(d => <MenuItem key={d.value} value={d.value}>{d.label}</MenuItem>)}
                </TextField>
                <TextField label="Статус" select size="small" value={debtClosedFilter} onChange={e => setDebtClosedFilter(e.target.value)} sx={{ minWidth: 140 }}>
                  <MenuItem value="">Все</MenuItem>
                  <MenuItem value="true">Закрытые</MenuItem>
                  <MenuItem value="false">Открытые</MenuItem>
                </TextField>
                <Button variant="contained" startIcon={<Add />} onClick={() => openDebtDlg()}>Добавить</Button>
              </Box>
            }
          />

          <EntityFormDialog open={debtDlg} onClose={() => setDebtDlg(false)} onSubmit={saveDebt} title={editDebt ? 'Редактировать долг' : 'Новый долг'} loading={debtSaving}>
            <TextField label="Тип долга" select value={debtForm.debt_type} onChange={e => setDebtForm({ ...debtForm, debt_type: e.target.value })}>
              {DEBT_TYPES.map(t => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
            </TextField>
            <TextField label="Направление" select value={debtForm.direction} onChange={e => setDebtForm({ ...debtForm, direction: e.target.value })}>
              {DEBT_DIRECTIONS.map(d => <MenuItem key={d.value} value={d.value}>{d.label}</MenuItem>)}
            </TextField>
            <TextField label="Контрагент" value={debtForm.counterparty_name} onChange={e => setDebtForm({ ...debtForm, counterparty_name: e.target.value })} required />
            <TextField label="Сумма" type="number" value={debtForm.amount} onChange={e => setDebtForm({ ...debtForm, amount: e.target.value })} required />
            <TextField label="Оплачено" type="number" value={debtForm.paid_amount} onChange={e => setDebtForm({ ...debtForm, paid_amount: e.target.value })} />
            <TextField label="Срок оплаты" type="date" value={debtForm.due_date} onChange={e => setDebtForm({ ...debtForm, due_date: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
            <TextField label="Заметки" value={debtForm.notes} onChange={e => setDebtForm({ ...debtForm, notes: e.target.value })} multiline rows={2} />
            <FormControlLabel control={<Switch checked={debtForm.is_closed} onChange={e => setDebtForm({ ...debtForm, is_closed: e.target.checked })} />} label="Закрыт" />
          </EntityFormDialog>

          <ConfirmDialog open={!!delDebt} onCancel={() => setDelDebt(null)} onConfirm={removeDebt} title="Удалить долг?" message={`Вы уверены, что хотите удалить долг «${delDebt?.counterparty_name}»?`} />
        </Box>
      )}
    </Box>
  )
}
