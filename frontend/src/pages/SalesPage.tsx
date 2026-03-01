import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Box, Typography, Chip, TextField, MenuItem, Button,
  IconButton, Divider, Autocomplete, Collapse,
} from '@mui/material'
import Grid from '@mui/material/Grid2'
import { Delete, ShoppingCart, AddCircleOutline, ExpandMore, ExpandLess } from '@mui/icons-material'
import { useLocation } from 'react-router-dom'
import api from '../api'
import { useAuth } from '../contexts/AuthContext'
import { useNotification } from '../contexts/NotificationContext'
import extractError from '../utils/extractError'
import DataTable from '../components/DataTable'
import EntityFormDialog from '../components/EntityFormDialog'
import ConfirmDialog from '../components/ConfirmDialog'

// ─── Types ───
interface Sale {
  id: string; number: string; status: string; total: string
  customer_name: string; seller_name: string; trading_point_name: string
  is_paid: boolean; created_at: string
  organization: string; trading_point: string; customer: string | null
  seller: string | null; order: string | null; subtotal: string
  discount_amount: string; discount_percent: string
  payment_method: string | null; notes: string
  completed_at: string | null; items: SaleItem[]
}
interface SaleItem {
  id: string; sale: string; nomenclature: string; batch: string | null
  quantity: string; price: string; cost_price: string; discount_percent: string
  total: string; is_custom_bouquet: boolean; nomenclature_name: string
  nomenclature_type: string; warehouse_name: string; warehouse: string
  bouquet_components: { name: string; quantity: string }[]
}
interface Ref { id: string; name: string }
interface NomRef { id: string; name: string; retail_price: string; nomenclature_type: string }
interface CustomerRef { id: string; full_name?: string; first_name?: string; last_name?: string }
interface UserRef { id: string; full_name: string; username: string }
interface StockWarehouse {
  warehouse: string
  warehouse_name: string
  trading_point: string
  is_default_for_sales: boolean
  qty: string
}
interface StockSummary {
  nomenclature: string
  nomenclature_name: string
  total_qty?: string
  total_quantity?: string
  warehouses: StockWarehouse[]
}
interface BouquetTemplateRef {
  id: string
  nomenclature: string
  components: { nomenclature_name: string; quantity: string }[]
}

// ─── Constants ───
const STATUS_CHOICES: { value: string; label: string; color: 'warning' | 'success' | 'error' }[] = [
  { value: 'open', label: 'Открыта', color: 'warning' },
  { value: 'completed', label: 'Завершена', color: 'success' },
  { value: 'cancelled', label: 'Отменена', color: 'error' },
]

const fmtDate = (v: string) => v ? new Date(v).toLocaleDateString('ru-RU') : '—'
const fmtCurrency = (v: string | number) =>
  v != null ? parseFloat(String(v)).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₽' : '—'

interface ItemRow {
  nomenclature: string
  warehouse: string
  quantity: string
  price: string
  discount_percent: string
  total: string
}
const emptyItemRow = (): ItemRow => ({ nomenclature: '', warehouse: '', quantity: '1', price: '', discount_percent: '0', total: '0' })

export default function SalesPage() {
  const { user } = useAuth()
  const { notify } = useNotification()
  const location = useLocation()

  // ─── Helper data ───
  const [tradingPoints, setTradingPoints] = useState<Ref[]>([])
  const [paymentMethods, setPaymentMethods] = useState<Ref[]>([])
  const [customers, setCustomers] = useState<CustomerRef[]>([])
  const [nomenclatures, setNomenclatures] = useState<NomRef[]>([])
  const [users, setUsers] = useState<UserRef[]>([])
  const [bouquetTemplates, setBouquetTemplates] = useState<BouquetTemplateRef[]>([])
  const [stockSummary, setStockSummary] = useState<StockSummary[]>([])
  const [promoCodes, setPromoCodes] = useState<{id: string; code: string}[]>([])

  const fetchHelpers = useCallback(async () => {
    try {
      const [tpRes, pmRes, custRes, nomRes, usersRes, tplRes, promoRes] = await Promise.all([
        api.get('/core/trading-points/'),
        api.get('/core/payment-methods/'),
        api.get('/customers/customers/'),
        api.get('/nomenclature/items/'),
        api.get('/core/users/'),
        api.get('/nomenclature/bouquet-templates/').catch(() => ({ data: [] })),
        api.get('/marketing/promo-codes/').catch(() => ({ data: [] })),
      ])

      // Определяем торговую точку для фильтрации остатков:
      // 1) active_trading_point из профиля (SA / Owner)
      // 2) trading_point — закреплённая ТТ сотрудника
      const effectiveTp = user?.active_trading_point || user?.trading_point || null
      const stockRes = await api.get('/inventory/stock/summary/', {
        params: effectiveTp ? { trading_point: effectiveTp } : undefined,
      }).catch(() => ({ data: [] }))

      setTradingPoints(tpRes.data.results || tpRes.data || [])
      setPaymentMethods(pmRes.data.results || pmRes.data || [])
      setCustomers(custRes.data.results || custRes.data || [])
      setNomenclatures(nomRes.data.results || nomRes.data || [])
      setUsers(usersRes.data.results || usersRes.data || [])
      setBouquetTemplates(tplRes.data.results || tplRes.data || [])
      setStockSummary(stockRes.data.results || stockRes.data || [])
      setPromoCodes(promoRes.data.results || promoRes.data || [])
    } catch (err) { notify(extractError(err, 'Ошибка загрузки справочников'), 'error') }
  }, [notify, user?.id, user?.active_trading_point])

  useEffect(() => { fetchHelpers() }, [fetchHelpers])

  const customerName = (c: CustomerRef) => c.full_name || `${c.first_name || ''} ${c.last_name || ''}`.trim()

  // Stock info per nomenclature
  const stockByNom = useMemo(() => {
    const map: Record<string, { total: number; warehouses: { id: string; name: string; qty: number; isDefaultForSales: boolean }[]; preferredWarehouse?: string }> = {}
    stockSummary.forEach(s => {
      if (!map[s.nomenclature]) map[s.nomenclature] = { total: 0, warehouses: [] }
      const qty = parseFloat(s.total_quantity || s.total_qty || '0') || 0
      map[s.nomenclature].total += qty
      if (qty > 0) {
        for (const wh of s.warehouses || []) {
          const whQty = parseFloat(wh.qty) || 0
          if (whQty <= 0) continue
          map[s.nomenclature].warehouses.push({
            id: wh.warehouse,
            name: wh.warehouse_name,
            qty: whQty,
            isDefaultForSales: !!wh.is_default_for_sales,
          })
        }
      }
      if (!map[s.nomenclature].preferredWarehouse && map[s.nomenclature].warehouses.length) {
        const defaults = map[s.nomenclature].warehouses.filter(w => w.isDefaultForSales)
        const preferred = (defaults.length === 1 ? defaults : (defaults.length > 1 ? defaults : map[s.nomenclature].warehouses))
            .slice()
            .sort((a, b) => b.qty - a.qty)[0]
        map[s.nomenclature].preferredWarehouse = preferred?.id
      }
    })
    return map
  }, [stockSummary])

  // ─── Sales list ───
  const [sales, setSales] = useState<Sale[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterPaid, setFilterPaid] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)

  const fetchSales = useCallback(() => {
    setLoading(true)
    const params: Record<string, string | number> = { page }
    if (search) params.search = search
    if (filterStatus) params.status = filterStatus
    if (filterPaid) params.is_paid = filterPaid
    api.get('/sales/sales/', { params })
      .then(res => {
        const data = res.data.results || res.data || []
        setSales(Array.isArray(data) ? data : [])
        if (res.data.count) setTotalPages(Math.ceil(res.data.count / 25))
        else setTotalPages(1)
      })
      .catch((err) => { setSales([]); notify(extractError(err, 'Ошибка загрузки продаж'), 'error') })
      .finally(() => setLoading(false))
  }, [page, search, filterStatus, filterPaid, notify, user?.active_trading_point])

  useEffect(() => { fetchSales() }, [fetchSales])

  // ─── Create / Edit sale dialog ───
  const [saleDlg, setSaleDlg] = useState(false)
  const [editSale, setEditSale] = useState<Sale | null>(null)
  const [saleForm, setSaleForm] = useState({
    trading_point: '', customer: '', payment_method: '', notes: '',
    status: 'completed', seller: '', discount_percent: '0',
    promo_code: '', used_bonuses: '0',
  })
  const [saleItems, setSaleItems] = useState<ItemRow[]>([emptyItemRow()])
  const [saving, setSaving] = useState(false)

  const openCreateDlg = () => {
    setEditSale(null)
    const defaultTradingPoint = user?.active_trading_point || user?.trading_point || (tradingPoints.length === 1 ? tradingPoints[0].id : '')
    setSaleForm({
      trading_point: defaultTradingPoint,
      customer: '',
      payment_method: '',
      notes: '',
      status: 'completed',
      seller: user?.id || '',
      discount_percent: '0',
      promo_code: '',
      used_bonuses: '0',
    })
    setSaleItems([emptyItemRow()])
    setSaleDlg(true)
  }

  useEffect(() => {
    const state = location.state as { prefillSaleItem?: { nomenclature: string; quantity?: string } } | null
    const prefill = state?.prefillSaleItem
    if (!prefill?.nomenclature) return
    const nom = nomenclatures.find(n => n.id === prefill.nomenclature)
    const preferredWarehouse = stockByNom[prefill.nomenclature]?.preferredWarehouse || ''
    const defaultTradingPoint = user?.active_trading_point || user?.trading_point || (tradingPoints.length === 1 ? tradingPoints[0].id : '')
    setEditSale(null)
    setSaleForm({
      trading_point: defaultTradingPoint,
      customer: '',
      payment_method: '',
      notes: '',
      status: 'completed',
      seller: user?.id || '',
      discount_percent: '0',
      promo_code: '',
      used_bonuses: '0',
    })
    setSaleItems([{
      nomenclature: prefill.nomenclature,
      warehouse: preferredWarehouse,
      quantity: prefill.quantity || '1',
      price: nom?.retail_price || '',
      discount_percent: '0',
      total: '0',
    }])
    setSaleDlg(true)
    window.history.replaceState({}, document.title)
  }, [location.state, nomenclatures, stockByNom, user?.id, user?.trading_point, tradingPoints])

  const openEditDlg = (sale: Sale) => {
    setEditSale(sale)
    setSaleForm({
      trading_point: sale.trading_point || '',
      customer: sale.customer || '',
      payment_method: sale.payment_method || '',
      notes: sale.notes || '',
      status: sale.status,
      seller: sale.seller || '',
      discount_percent: sale.discount_percent || '0',
      promo_code: (sale as any).promo_code || '',
      used_bonuses: (sale as any).used_bonuses || '0',
    })
    if (sale.items?.length) {
      setSaleItems(sale.items.map(it => ({
        nomenclature: it.nomenclature,
        warehouse: it.warehouse || '',
        quantity: it.quantity,
        price: it.price,
        discount_percent: it.discount_percent || '0',
        total: it.total || '0',
      })))
    } else {
      api.get('/sales/sale-items/', { params: { sale: sale.id } })
        .then(res => {
          const items = res.data.results || res.data || []
          setSaleItems(items.length ? items.map((it: SaleItem) => ({
            nomenclature: it.nomenclature, warehouse: it.warehouse || '', quantity: it.quantity,
            price: it.price, discount_percent: it.discount_percent || '0',
            total: it.total || '0',
          })) : [emptyItemRow()])
        })
        .catch(() => setSaleItems([emptyItemRow()]))
    }
    setSaleDlg(true)
  }

  const handleItemChange = (idx: number, field: string, value: string) => {
    setSaleItems(prev => {
      const copy = [...prev]
      copy[idx] = { ...copy[idx], [field]: value }
      if (field === 'nomenclature') {
        const nom = nomenclatures.find(n => n.id === value)
        if (nom) copy[idx].price = nom.retail_price || ''
        copy[idx].warehouse = stockByNom[value]?.preferredWarehouse || ''
      }
      const qty = parseFloat(copy[idx].quantity) || 0
      const price = parseFloat(copy[idx].price) || 0
      const disc = parseFloat(copy[idx].discount_percent) || 0
      copy[idx].total = (qty * price * (1 - disc / 100)).toFixed(2)
      return copy
    })
  }

  const addItemRow = () => setSaleItems(prev => [...prev, emptyItemRow()])
  const removeItemRow = (idx: number) => setSaleItems(prev => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev)

  const calcItemTotal = (item: ItemRow) => {
    const qty = parseFloat(item.quantity) || 0
    const price = parseFloat(item.price) || 0
    const disc = parseFloat(item.discount_percent) || 0
    return qty * price * (1 - disc / 100)
  }

  const calcSubtotal = () => saleItems.reduce((s, it) => s + calcItemTotal(it), 0)
  const calcTotal = () => {
    const sub = calcSubtotal()
    const globalDisc = parseFloat(saleForm.discount_percent) || 0
    return sub * (1 - globalDisc / 100)
  }

  const saveSale = async () => {
    setSaving(true)
    try {
      if (!saleForm.trading_point) {
        notify('Выберите торговую точку', 'warning')
        setSaving(false)
        return
      }

      const validItems = saleItems.filter(it => it.nomenclature && parseFloat(it.quantity) > 0)
        if (validItems.length === 0) { notify('Добавьте хотя бы одну позицию с количеством больше нуля', 'warning'); setSaving(false); return }

      const payload: Record<string, any> = {
        trading_point: saleForm.trading_point,
        customer: saleForm.customer || null,
        payment_method: saleForm.payment_method || null,
        seller: saleForm.seller || null,
        notes: saleForm.notes,
        status: saleForm.status,
        discount_percent: saleForm.discount_percent || '0',
        promo_code: saleForm.promo_code || null,
        used_bonuses: saleForm.used_bonuses || '0',
        items_data: validItems.map(it => {
          const qty = parseFloat(it.quantity) || 0
          const price = parseFloat(it.price) || 0
          const disc = parseFloat(it.discount_percent) || 0
          return {
            nomenclature: it.nomenclature,
            warehouse: it.warehouse || null,
            quantity: it.quantity,
            price: it.price,
            discount_percent: it.discount_percent || '0',
            total: (qty * price * (1 - disc / 100)).toFixed(2),
          }
        }),
      }

      if (editSale) {
        const res = await api.patch(`/sales/sales/${editSale.id}/`, payload)
        const warnings = (res.data && (res.data._warnings as string[] | undefined)) || []
        notify('Продажа обновлена')
        if (warnings.length) {
          notify(`Внимание:\n${warnings.join('\n')}`, 'warning')
        }
      } else {
        const res = await api.post('/sales/sales/', payload)
        const warnings = (res.data && (res.data._warnings as string[] | undefined)) || []
        notify('Продажа создана')
        if (warnings.length) {
          notify(`Внимание:\n${warnings.join('\n')}`, 'warning')
        }
      }
      setSaleDlg(false)
      fetchSales()
    } catch (err) {
      notify(extractError(err, 'Ошибка сохранения'), 'error')
    }
    setSaving(false)
  }

  // ─── Detail dialog ───
  const [detailDlg, setDetailDlg] = useState(false)
  const [detailSale, setDetailSale] = useState<Sale | null>(null)
  const [detailItems, setDetailItems] = useState<SaleItem[]>([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [expandedBouquets, setExpandedBouquets] = useState<Record<string, boolean>>({})

  const openDetail = async (sale: Sale) => {
    setDetailLoading(true)
    setDetailDlg(true)
    setExpandedBouquets({})
    try {
      const [saleRes, itemsRes] = await Promise.all([
        api.get(`/sales/sales/${sale.id}/`),
        api.get('/sales/sale-items/', { params: { sale: sale.id } }),
      ])
      setDetailSale(saleRes.data)
      setDetailItems(itemsRes.data.results || itemsRes.data || [])
    } catch (err) { notify(extractError(err, 'Ошибка загрузки продажи'), 'error') }
    setDetailLoading(false)
  }

  const toggleBouquet = (id: string) => setExpandedBouquets(prev => ({ ...prev, [id]: !prev[id] }))

  // ─── Delete ───
  const [delSale, setDelSale] = useState<Sale | null>(null)

  const removeSale = async () => {
    if (!delSale) return
    try {
      await api.delete(`/sales/sales/${delSale.id}/`)
      notify('Продажа удалена')
      setDelSale(null)
      setDetailDlg(false)
      fetchSales()
    } catch (err) { notify(extractError(err, 'Ошибка удаления'), 'error') }
  }

  // Nom options for Autocomplete
  const nomOptions = useMemo(() =>
    nomenclatures
      .filter(n => (stockByNom[n.id]?.total || 0) > 0)
      .map(n => {
      const stock = stockByNom[n.id]
      return {
        ...n,
        stockTotal: stock?.total || 0,
        stockLabel: stock ? `(${stock.total.toFixed(1)} шт.)` : '',
      }
    }),
  [nomenclatures, stockByNom])

  // ─── Table columns ───
  const columns = [
    { key: 'number', label: '№', width: 90, render: (v: string) => `#${v}` },
    {
      key: 'status', label: 'Статус', width: 130,
      render: (v: string) => {
        const s = STATUS_CHOICES.find(c => c.value === v)
        return <Chip label={s?.label || v} size="small" color={s?.color || 'default'} />
      },
    },
    { key: 'customer_name', label: 'Клиент', render: (v: string) => v || '—' },
    { key: 'seller_name', label: 'Продавец', render: (v: string) => v || '—' },
    { key: 'trading_point_name', label: 'Точка', render: (v: string) => v || '—' },
    { key: 'total', label: 'Сумма', align: 'right' as const, render: (v: string) => fmtCurrency(v) },
    {
      key: 'is_paid', label: 'Оплата', width: 110,
      render: (v: boolean) => <Chip label={v ? 'Оплачено' : 'Не оплачено'} size="small" color={v ? 'success' : 'default'} variant={v ? 'filled' : 'outlined'} />,
    },
    { key: 'created_at', label: 'Дата', width: 110, render: (v: string) => fmtDate(v) },
  ]

  // ─── Render ───
  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" fontWeight={700}>Продажи</Typography>
        <Button variant="contained" startIcon={<ShoppingCart />} onClick={openCreateDlg}>
          Новая продажа
        </Button>
      </Box>

      {/* Filters */}
      <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        <TextField
          select size="small" label="Статус" value={filterStatus}
          onChange={e => { setFilterStatus(e.target.value); setPage(1) }}
          sx={{ minWidth: 160 }}
        >
          <MenuItem value="">Все</MenuItem>
          {STATUS_CHOICES.map(s => <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>)}
        </TextField>
        <TextField
          select size="small" label="Оплата" value={filterPaid}
          onChange={e => { setFilterPaid(e.target.value); setPage(1) }}
          sx={{ minWidth: 160 }}
        >
          <MenuItem value="">Все</MenuItem>
          <MenuItem value="true">Оплачено</MenuItem>
          <MenuItem value="false">Не оплачено</MenuItem>
        </TextField>
      </Box>

      {/* Sales table */}
      <DataTable
        columns={columns}
        rows={sales}
        loading={loading}
        search={search}
        onSearchChange={v => { setSearch(v); setPage(1) }}
        searchPlaceholder="Поиск по номеру, клиенту..."
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        emptyText="Продаж пока нет"
        onRowClick={openDetail}
      />

      {/* ═══ Create / Edit Sale Dialog ═══ */}
      <EntityFormDialog
        open={saleDlg}
        onClose={() => setSaleDlg(false)}
        onSubmit={saveSale}
        title={editSale ? `Продажа #${editSale.number}` : 'Новая продажа'}
        loading={saving}
        submitText={editSale ? 'Сохранить' : 'Создать продажу'}
        maxWidth="md"
        disabled={saleItems.every(it => !it.nomenclature)}
      >
        <Grid container spacing={2}>
          <Grid size={4}>
            <TextField
              select fullWidth label="Торговая точка" value={saleForm.trading_point}
              onChange={e => setSaleForm(f => ({ ...f, trading_point: e.target.value }))}
            >
              {tradingPoints.map(tp => <MenuItem key={tp.id} value={tp.id}>{tp.name}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid size={4}>
            <TextField
              select fullWidth label="Продавец" value={saleForm.seller}
              onChange={e => setSaleForm(f => ({ ...f, seller: e.target.value }))}
            >
              <MenuItem value="">— Не указан —</MenuItem>
              {users.map(u => <MenuItem key={u.id} value={u.id}>{u.full_name || u.username}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid size={4}>
            <TextField
              select fullWidth label="Клиент" value={saleForm.customer}
              onChange={e => setSaleForm(f => ({ ...f, customer: e.target.value }))}
            >
              <MenuItem value="">— Без клиента —</MenuItem>
              {customers.map(c => <MenuItem key={c.id} value={c.id}>{customerName(c)}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid size={4}>
            <TextField
              select fullWidth label="Способ оплаты" value={saleForm.payment_method}
              onChange={e => setSaleForm(f => ({ ...f, payment_method: e.target.value }))}
            >
              <MenuItem value="">— Не указан —</MenuItem>
              {paymentMethods.map(pm => <MenuItem key={pm.id} value={pm.id}>{pm.name}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid size={4}>
            <TextField
              select fullWidth label="Статус" value={saleForm.status}
              onChange={e => setSaleForm(f => ({ ...f, status: e.target.value }))}
            >
              {STATUS_CHOICES.map(s => <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid size={2}>
            <TextField
              fullWidth label="Скидка %" type="number" value={saleForm.discount_percent}
              onChange={e => setSaleForm(f => ({ ...f, discount_percent: e.target.value }))}
              slotProps={{ htmlInput: { min: 0, max: 100, step: 1 } }}
            />
          </Grid>
          <Grid size={4}>
            <TextField
              select fullWidth label="Промокод" value={saleForm.promo_code}
              onChange={e => setSaleForm(f => ({ ...f, promo_code: e.target.value }))}
            >
              <MenuItem value="">— Без промокода —</MenuItem>
              {promoCodes.map(pc => <MenuItem key={pc.id} value={pc.id}>{pc.code}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid size={2}>
            <TextField
              fullWidth label="Бонусы к списанию" type="number" value={saleForm.used_bonuses}
              onChange={e => setSaleForm(f => ({ ...f, used_bonuses: e.target.value }))}
              slotProps={{ htmlInput: { min: 0, step: 1 } }}
            />
          </Grid>
          <Grid size={12}>
            <TextField
              fullWidth label="Примечания" multiline minRows={1} value={saleForm.notes}
              onChange={e => setSaleForm(f => ({ ...f, notes: e.target.value }))}
            />
          </Grid>
        </Grid>

        {/* ─── Sale items ─── */}
        <Divider sx={{ my: 1.5 }} />
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="subtitle1" fontWeight={600}>Позиции</Typography>
          <Button size="small" startIcon={<AddCircleOutline />} onClick={addItemRow}>Добавить</Button>
        </Box>

        {saleItems.map((item, idx) => {
          const stock = stockByNom[item.nomenclature]
          const itemNom = nomenclatures.find(n => n.id === item.nomenclature)
          const currentWarehouse = stock?.warehouses.find(w => w.id === item.warehouse)
          const composition = (itemNom?.nomenclature_type === 'bouquet' || itemNom?.nomenclature_type === 'composition')
            ? (bouquetTemplates.find(t => t.nomenclature === item.nomenclature)?.components || []).map(c => ({ name: c.nomenclature_name, quantity: c.quantity }))
            : []
          return (
            <Box key={idx} sx={{ mb: 1 }}>
              <Grid container spacing={1.5} alignItems="center">
                <Grid size={3}>
                  <Autocomplete
                    size="small"
                    options={nomOptions}
                    getOptionLabel={opt => typeof opt === 'string' ? opt : `${opt.name} ${opt.stockLabel}`}
                    value={nomOptions.find(o => o.id === item.nomenclature) || null}
                    onChange={(_, val) => handleItemChange(idx, 'nomenclature', val?.id || '')}
                    isOptionEqualToValue={(opt, val) => opt.id === val.id}
                    renderOption={(props, opt) => (
                      <li {...props} key={opt.id}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                          <Typography variant="body2">{opt.name}</Typography>
                          <Typography variant="body2" color={opt.stockTotal > 0 ? 'success.main' : 'text.secondary'} sx={{ ml: 1, whiteSpace: 'nowrap' }}>
                            {opt.stockTotal > 0 ? `${opt.stockTotal} шт.` : 'нет'}
                          </Typography>
                        </Box>
                      </li>
                    )}
                    renderInput={params => <TextField {...params} label="Номенклатура" />}
                    noOptionsText="Не найдено"
                  />
                </Grid>
                <Grid size={2}>
                  <TextField
                    select fullWidth size="small" label="Склад" value={item.warehouse}
                    onChange={e => handleItemChange(idx, 'warehouse', e.target.value)}
                    disabled={!item.nomenclature}
                  >
                    {(stock?.warehouses || []).map(w => (
                      <MenuItem key={w.id} value={w.id}>
                        {w.name} ({w.qty}){w.isDefaultForSales ? ' • продажи' : ''}
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>
                <Grid size={1.5}>
                  <TextField
                    fullWidth size="small" label="Кол-во" type="number" value={item.quantity}
                    onChange={e => handleItemChange(idx, 'quantity', e.target.value)}
                    slotProps={{ htmlInput: { min: 0.01, step: 1 } }}
                  />
                </Grid>
                <Grid size={1.5}>
                  <TextField
                    fullWidth size="small" label="Цена" type="number" value={item.price}
                    onChange={e => handleItemChange(idx, 'price', e.target.value)}
                    slotProps={{ htmlInput: { min: 0, step: 0.01 } }}
                  />
                </Grid>
                <Grid size={1.5}>
                  <TextField
                    fullWidth size="small" label="Скидка %" type="number" value={item.discount_percent}
                    onChange={e => handleItemChange(idx, 'discount_percent', e.target.value)}
                    slotProps={{ htmlInput: { min: 0, max: 100 } }}
                  />
                </Grid>
                <Grid size={1.5}>
                  <Typography variant="body2" fontWeight={600} textAlign="right">
                    {fmtCurrency(calcItemTotal(item))}
                  </Typography>
                </Grid>
                <Grid size={1}>
                  <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <IconButton size="small" onClick={() => removeItemRow(idx)} disabled={saleItems.length <= 1}>
                      <Delete fontSize="small" />
                    </IconButton>
                  </Box>
                </Grid>
              </Grid>
              {!!composition?.length && (
                <Typography variant="caption" color="text.secondary" sx={{ ml: 1, display: 'block' }}>
                  Состав: {composition.map(c => `${c.name} × ${c.quantity}`).join(', ')}
                </Typography>
              )}
            </Box>
          )
        })}

        <Divider sx={{ my: 1 }} />
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 4, alignItems: 'baseline' }}>
          <Typography variant="body2" color="text.secondary">Подитог: <b>{fmtCurrency(calcSubtotal())}</b></Typography>
          {parseFloat(saleForm.discount_percent) > 0 && (
            <Typography variant="body2" color="error">Скидка {saleForm.discount_percent}%</Typography>
          )}
          <Typography variant="body1" fontWeight={700}>Итого: {fmtCurrency(calcTotal())}</Typography>
        </Box>
      </EntityFormDialog>

      {/* ═══ Detail Dialog ═══ */}
      <EntityFormDialog
        open={detailDlg}
        onClose={() => { setDetailDlg(false); setDetailSale(null) }}
        onSubmit={() => detailSale && openEditDlg(detailSale)}
        title={detailSale ? `Продажа #${detailSale.number}` : 'Продажа'}
        loading={detailLoading}
        submitText="Редактировать"
        maxWidth="md"
      >
        {detailSale && (
          <>
            <Grid container spacing={2}>
              <Grid size={3}>
                <Typography variant="caption" color="text.secondary">Статус</Typography>
                <Box>
                  <Chip
                    label={STATUS_CHOICES.find(s => s.value === detailSale.status)?.label || detailSale.status}
                    color={STATUS_CHOICES.find(s => s.value === detailSale.status)?.color || 'default'}
                    size="small"
                  />
                </Box>
              </Grid>
              <Grid size={3}>
                <Typography variant="caption" color="text.secondary">Продавец</Typography>
                <Typography>{detailSale.seller_name || '—'}</Typography>
              </Grid>
              <Grid size={3}>
                <Typography variant="caption" color="text.secondary">Клиент</Typography>
                <Typography>{detailSale.customer_name || '—'}</Typography>
              </Grid>
              <Grid size={3}>
                <Typography variant="caption" color="text.secondary">Дата</Typography>
                <Typography>{fmtDate(detailSale.created_at)}</Typography>
              </Grid>
              <Grid size={3}>
                <Typography variant="caption" color="text.secondary">Точка</Typography>
                <Typography>{detailSale.trading_point_name || '—'}</Typography>
              </Grid>
              <Grid size={3}>
                <Typography variant="caption" color="text.secondary">Итого</Typography>
                <Typography fontWeight={700}>{fmtCurrency(detailSale.total)}</Typography>
              </Grid>
              {parseFloat(detailSale.discount_percent || '0') > 0 && (
                <Grid size={3}>
                  <Typography variant="caption" color="text.secondary">Скидка</Typography>
                  <Typography color="error">{detailSale.discount_percent}% ({fmtCurrency(detailSale.discount_amount)})</Typography>
                </Grid>
              )}
              <Grid size={3}>
                <Typography variant="caption" color="text.secondary">Оплата</Typography>
                <Box>
                  <Chip
                    label={detailSale.is_paid ? 'Оплачено' : 'Не оплачено'}
                    size="small"
                    color={detailSale.is_paid ? 'success' : 'default'}
                  />
                </Box>
              </Grid>
              {detailSale.notes && (
                <Grid size={12}>
                  <Typography variant="caption" color="text.secondary">Примечания</Typography>
                  <Typography>{detailSale.notes}</Typography>
                </Grid>
              )}
            </Grid>

            <Divider sx={{ my: 1 }} />
            <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>Позиции</Typography>

            {detailItems.length === 0 ? (
              <Typography color="text.secondary">Нет позиций</Typography>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                <Grid container spacing={1} sx={{ fontWeight: 600, fontSize: '0.8rem', color: 'text.secondary' }}>
                  <Grid size={3}>Наименование</Grid>
                  <Grid size={2}>Склад</Grid>
                  <Grid size={1.5} sx={{ textAlign: 'right' }}>Кол-во</Grid>
                  <Grid size={2} sx={{ textAlign: 'right' }}>Цена</Grid>
                  <Grid size={1.5} sx={{ textAlign: 'right' }}>Скидка</Grid>
                  <Grid size={2} sx={{ textAlign: 'right' }}>Сумма</Grid>
                </Grid>
                {detailItems.map(it => (
                  <Box key={it.id}>
                    <Grid container spacing={1} sx={{ fontSize: '0.875rem' }}>
                      <Grid size={3}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          {it.nomenclature_name}
                          {it.bouquet_components?.length > 0 && (
                            <IconButton size="small" onClick={() => toggleBouquet(it.id)} sx={{ p: 0 }}>
                              {expandedBouquets[it.id] ? <ExpandLess sx={{ fontSize: 16 }} /> : <ExpandMore sx={{ fontSize: 16 }} />}
                            </IconButton>
                          )}
                        </Box>
                      </Grid>
                      <Grid size={2}>
                        <Typography variant="body2" color="text.secondary">{it.warehouse_name || '—'}</Typography>
                      </Grid>
                      <Grid size={1.5} sx={{ textAlign: 'right' }}>{it.quantity}</Grid>
                      <Grid size={2} sx={{ textAlign: 'right' }}>{fmtCurrency(it.price)}</Grid>
                      <Grid size={1.5} sx={{ textAlign: 'right' }}>{it.discount_percent}%</Grid>
                      <Grid size={2} sx={{ textAlign: 'right', fontWeight: 600 }}>{fmtCurrency(it.total)}</Grid>
                    </Grid>
                    {it.bouquet_components?.length > 0 && (
                      <Collapse in={expandedBouquets[it.id]}>
                        <Box sx={{ ml: 3, mt: 0.5, mb: 0.5, p: 1, bgcolor: 'action.hover', borderRadius: 1 }}>
                          <Typography variant="caption" fontWeight={600} color="text.secondary">Состав букета:</Typography>
                          {it.bouquet_components.map((comp, ci) => (
                            <Typography key={ci} variant="caption" display="block" sx={{ ml: 1 }}>
                              • {comp.name} — {comp.quantity} шт.
                            </Typography>
                          ))}
                        </Box>
                      </Collapse>
                    )}
                  </Box>
                ))}
              </Box>
            )}

            <Box sx={{ display: 'flex', justifyContent: 'flex-start', mt: 2 }}>
              <Button
                color="error" variant="outlined" startIcon={<Delete />}
                onClick={() => { setDelSale(detailSale); setDetailDlg(false) }}
              >
                Удалить продажу
              </Button>
            </Box>
          </>
        )}
      </EntityFormDialog>

      {/* ═══ Delete Confirm ═══ */}
      <ConfirmDialog
        open={!!delSale}
        title="Удаление продажи"
        message={delSale ? `Удалить продажу #${delSale.number}? Это действие необратимо.` : ''}
        onConfirm={removeSale}
        onCancel={() => setDelSale(null)}
      />
    </Box>
  )
}
