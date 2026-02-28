import { useState, useEffect, useCallback } from 'react'
import {
  Box, Typography, Chip, TextField, MenuItem, Button,
  IconButton, Divider, Switch, FormControlLabel,
} from '@mui/material'
import Grid from '@mui/material/Grid2'
import {
  Add, Delete, AddCircleOutline, ShoppingBag,
  LocalShipping, CheckCircle, Cancel,
} from '@mui/icons-material'
import api from '../api'
import { useAuth } from '../contexts/AuthContext'
import { useNotification } from '../contexts/NotificationContext'
import extractError from '../utils/extractError'
import DataTable from '../components/DataTable'
import EntityFormDialog from '../components/EntityFormDialog'
import ConfirmDialog from '../components/ConfirmDialog'

// ─── Types ───
interface Order {
  id: string; number: string; status: string; source: string
  total: string; delivery_date: string; customer_name: string
  created_at: string; organization: string; trading_point: string
  customer: string | null; recipient_name: string; recipient_phone: string
  delivery_address: string; delivery_time_from: string | null
  delivery_time_to: string | null; is_anonymous: boolean; card_text: string
  subtotal: string; delivery_cost: string; discount_amount: string
  prepayment: string; remaining_payment: string; payment_method: string | null
  responsible: string | null; florist: string | null; courier: string | null
  promo_code: string; notes: string; internal_notes: string
  updated_at: string; items: OrderItem[]; status_history: StatusEntry[]
}
interface OrderItem {
  id: string; order: string; nomenclature: string; quantity: string
  price: string; discount_percent: string; total: string
  is_custom_bouquet: boolean; custom_description: string
  photo: string | null; nomenclature_name: string
}
interface StatusEntry { id: string; status: string; created_at: string; comment?: string }
interface Ref { id: string; name: string }
interface NomRef { id: string; name: string; retail_price: string }
interface CustomerRef { id: string; full_name?: string; first_name?: string; last_name?: string }

// ─── Constants ───
const STATUS_CHOICES: { value: string; label: string; color: 'info' | 'primary' | 'warning' | 'secondary' | 'success' | 'error' | 'default' }[] = [
  { value: 'new', label: 'Новый', color: 'info' },
  { value: 'confirmed', label: 'Подтверждён', color: 'primary' },
  { value: 'in_assembly', label: 'В сборке', color: 'warning' },
  { value: 'assembled', label: 'Собран', color: 'secondary' },
  { value: 'on_delivery', label: 'В доставке', color: 'info' },
  { value: 'delivered', label: 'Доставлен', color: 'success' },
  { value: 'completed', label: 'Завершён', color: 'success' },
  { value: 'cancelled', label: 'Отменён', color: 'error' },
]

const SOURCE_CHOICES: { value: string; label: string }[] = [
  { value: 'shop', label: 'Магазин' },
  { value: 'phone', label: 'Телефон' },
  { value: 'website', label: 'Сайт' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'telegram', label: 'Telegram' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'other', label: 'Другое' },
]

const fmtDate = (v: string) => v ? new Date(v).toLocaleDateString('ru-RU') : '—'
const fmtDateTime = (v: string) => v ? new Date(v).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'
const fmtCurrency = (v: string | number) =>
  v != null ? parseFloat(String(v)).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₽' : '—'

const emptyItemRow = () => ({ nomenclature: '', quantity: '1', price: '', discount_percent: '0' })

export default function OrdersPage() {
  const { notify } = useNotification()
  const { user } = useAuth()

  // ─── Helper data ───
  const [tradingPoints, setTradingPoints] = useState<Ref[]>([])
  const [paymentMethods, setPaymentMethods] = useState<Ref[]>([])
  const [customers, setCustomers] = useState<CustomerRef[]>([])
  const [nomenclatures, setNomenclatures] = useState<NomRef[]>([])

  const fetchHelpers = useCallback(async () => {
    try {
      const [tpRes, pmRes, custRes, nomRes] = await Promise.all([
        api.get('/core/trading-points/'),
        api.get('/core/payment-methods/'),
        api.get('/customers/customers/'),
        api.get('/nomenclature/items/'),
      ])
      setTradingPoints(tpRes.data.results || tpRes.data || [])
      setPaymentMethods(pmRes.data.results || pmRes.data || [])
      setCustomers(custRes.data.results || custRes.data || [])
      setNomenclatures(nomRes.data.results || nomRes.data || [])
    } catch (err) { notify(extractError(err, 'Ошибка загрузки справочников'), 'error') }
  }, [notify, user?.active_trading_point])

  useEffect(() => { fetchHelpers() }, [fetchHelpers])

  const customerName = (c: CustomerRef) => c.full_name || `${c.first_name || ''} ${c.last_name || ''}`.trim()

  // ─── Orders list ───
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterSource, setFilterSource] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)

  const fetchOrders = useCallback(() => {
    setLoading(true)
    const params: Record<string, string | number> = { page, ordering: '-created_at' }
    if (search) params.search = search
    if (filterStatus) params.status = filterStatus
    if (filterSource) params.source = filterSource
    api.get('/sales/orders/', { params })
      .then(res => {
        const data = res.data.results || res.data || []
        setOrders(Array.isArray(data) ? data : [])
        if (res.data.count) setTotalPages(Math.ceil(res.data.count / 25))
        else setTotalPages(1)
      })
      .catch((err) => { setOrders([]); notify(extractError(err, 'Ошибка загрузки заказов'), 'error') })
      .finally(() => setLoading(false))
  }, [page, search, filterStatus, filterSource, notify, user?.active_trading_point])

  useEffect(() => { fetchOrders() }, [fetchOrders])

  // ─── Create order dialog ───
  const [createDlg, setCreateDlg] = useState(false)
  const [orderForm, setOrderForm] = useState({
    trading_point: '', source: 'shop', customer: '',
    recipient_name: '', recipient_phone: '', delivery_address: '',
    delivery_date: '', delivery_time_from: '', delivery_time_to: '',
    is_anonymous: false, card_text: '',
    payment_method: '', prepayment: '0', delivery_cost: '0',
    notes: '', internal_notes: '',
  })
  const [orderItems, setOrderItems] = useState<{ nomenclature: string; quantity: string; price: string; discount_percent: string }[]>([emptyItemRow()])
  const [saving, setSaving] = useState(false)

  const openCreateDlg = () => {
    setOrderForm({
      trading_point: '', source: 'shop', customer: '',
      recipient_name: '', recipient_phone: '', delivery_address: '',
      delivery_date: '', delivery_time_from: '', delivery_time_to: '',
      is_anonymous: false, card_text: '',
      payment_method: '', prepayment: '0', delivery_cost: '0',
      notes: '', internal_notes: '',
    })
    setOrderItems([emptyItemRow()])
    setCreateDlg(true)
  }

  const handleItemChange = (idx: number, field: string, value: string) => {
    setOrderItems(prev => {
      const copy = [...prev]
      copy[idx] = { ...copy[idx], [field]: value }
      if (field === 'nomenclature') {
        const nom = nomenclatures.find(n => n.id === value)
        if (nom) copy[idx].price = nom.retail_price || ''
      }
      return copy
    })
  }

  const addItemRow = () => setOrderItems(prev => [...prev, emptyItemRow()])
  const removeItemRow = (idx: number) => setOrderItems(prev => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev)

  const calcItemTotal = (item: { quantity: string; price: string; discount_percent: string }) => {
    const qty = parseFloat(item.quantity) || 0
    const price = parseFloat(item.price) || 0
    const disc = parseFloat(item.discount_percent) || 0
    return qty * price * (1 - disc / 100)
  }

  const calcSubtotal = () => orderItems.reduce((s, it) => s + (parseFloat(it.quantity) || 0) * (parseFloat(it.price) || 0), 0)
  const calcDiscount = () => calcSubtotal() - orderItems.reduce((s, it) => s + calcItemTotal(it), 0)
  const calcTotal = () => orderItems.reduce((s, it) => s + calcItemTotal(it), 0) + (parseFloat(orderForm.delivery_cost) || 0)

  const saveOrder = async () => {
    setSaving(true)
    try {
      const validItems = orderItems.filter(it => it.nomenclature && it.quantity && it.price)
      if (validItems.length === 0) { notify('Добавьте хотя бы одну позицию', 'warning'); setSaving(false); return }

      const payload: Record<string, any> = {
        trading_point: orderForm.trading_point || null,
        source: orderForm.source,
        customer: orderForm.customer || null,
        recipient_name: orderForm.recipient_name,
        recipient_phone: orderForm.recipient_phone,
        delivery_address: orderForm.delivery_address,
        delivery_date: orderForm.delivery_date || null,
        delivery_time_from: orderForm.delivery_time_from || null,
        delivery_time_to: orderForm.delivery_time_to || null,
        is_anonymous: orderForm.is_anonymous,
        card_text: orderForm.is_anonymous ? '' : orderForm.card_text,
        payment_method: orderForm.payment_method || null,
        prepayment: orderForm.prepayment || '0',
        delivery_cost: orderForm.delivery_cost || '0',
        notes: orderForm.notes,
        internal_notes: orderForm.internal_notes,
        items: validItems.map(it => ({
          nomenclature: it.nomenclature,
          quantity: it.quantity,
          price: it.price,
          discount_percent: it.discount_percent || '0',
        })),
      }

      await api.post('/sales/orders/', payload)
      notify('Заказ создан')
      setCreateDlg(false)
      fetchOrders()
    } catch (err) {
      notify(extractError(err, 'Ошибка создания заказа'), 'error')
    }
    setSaving(false)
  }

  // ─── Detail dialog ───
  const [detailDlg, setDetailDlg] = useState(false)
  const [detailOrder, setDetailOrder] = useState<Order | null>(null)
  const [detailItems, setDetailItems] = useState<OrderItem[]>([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [statusChanging, setStatusChanging] = useState(false)

  const openDetail = async (order: Order) => {
    setDetailLoading(true)
    setDetailDlg(true)
    setDetailOrder(null)
    setDetailItems([])
    try {
      const [orderRes, itemsRes] = await Promise.all([
        api.get(`/sales/orders/${order.id}/`),
        api.get('/sales/order-items/', { params: { order: order.id } }),
      ])
      setDetailOrder(orderRes.data)
      setDetailItems(itemsRes.data.results || itemsRes.data || [])
    } catch (err) { notify(extractError(err, 'Ошибка загрузки заказа'), 'error') }
    setDetailLoading(false)
  }

  const changeStatus = async (newStatus: string) => {
    if (!detailOrder) return
    setStatusChanging(true)
    try {
      const res = await api.patch(`/sales/orders/${detailOrder.id}/`, { status: newStatus })
      setDetailOrder(res.data)
      notify('Статус обновлён')
      fetchOrders()
    } catch (err) {
      notify(extractError(err, 'Ошибка смены статуса'), 'error')
    }
    setStatusChanging(false)
  }

  // ─── Delete ───
  
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const handleCheckout = async () => {
    if (!detailOrder) return
    setCheckoutLoading(true)
    try {
      const res = await api.post(`/sales/orders/${detailOrder.id}/checkout/`)
      notify('Разделили: чек успешно создан и товары списаны со склада (смена обновлена)')
      setDetailDlg(false)
      fetchOrders()
    } catch (err) {
      notify(extractError(err, 'Ошибка при пробитии чека (нет открытой смены?)'), 'error')
    }
    setCheckoutLoading(false)
  }

  const [delOrder, setDelOrder] = useState<Order | null>(null)

  const removeOrder = async () => {
    if (!delOrder) return
    try {
      await api.delete(`/sales/orders/${delOrder.id}/`)
      notify('Заказ удалён')
      setDelOrder(null)
      setDetailDlg(false)
      fetchOrders()
    } catch (err) { notify(extractError(err, 'Ошибка удаления'), 'error') }
  }

  // ─── Helpers ───
  const statusChip = (v: string) => {
    const s = STATUS_CHOICES.find(c => c.value === v)
    return <Chip label={s?.label || v} size="small" color={s?.color || 'default'} />
  }

  const sourceLabel = (v: string) => {
    const s = SOURCE_CHOICES.find(c => c.value === v)
    return s?.label || v
  }

  const statusIcon = (v: string) => {
    switch (v) {
      case 'delivered': case 'completed': return <CheckCircle fontSize="small" />
      case 'cancelled': return <Cancel fontSize="small" />
      case 'on_delivery': return <LocalShipping fontSize="small" />
      default: return <ShoppingBag fontSize="small" />
    }
  }

  // ─── Table columns ───
  const columns = [
    { key: 'number', label: '№', width: 90, render: (v: string) => `#${v}` },
    { key: 'status', label: 'Статус', width: 140, render: (v: string) => statusChip(v) },
    {
      key: 'source', label: 'Источник', width: 120,
      render: (v: string) => <Chip label={sourceLabel(v)} size="small" variant="outlined" />,
    },
    { key: 'customer_name', label: 'Клиент', render: (v: string) => v || '—' },
    { key: 'delivery_date', label: 'Доставка', width: 110, render: (v: string) => fmtDate(v) },
    { key: 'total', label: 'Сумма', align: 'right' as const, render: (v: string) => fmtCurrency(v) },
    { key: 'created_at', label: 'Создан', width: 110, render: (v: string) => fmtDate(v) },
  ]

  // ─── Render ───
  return (
    <Box>
      <Box sx={{ display: "flex", justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" fontWeight={700}>Заказы</Typography>
        <Button variant="contained" startIcon={<Add />} onClick={openCreateDlg}>
          Новый заказ
        </Button>
      </Box>

      {/* Filters */}
      <Box sx={{ display: "flex", gap: 2, mb: 2, flexWrap: 'wrap' }}>
        <TextField
          select size="small" label="Статус" value={filterStatus}
          onChange={e => { setFilterStatus(e.target.value); setPage(1) }}
          sx={{ minWidth: 160 }}
        >
          <MenuItem value="">Все</MenuItem>
          {STATUS_CHOICES.map(s => <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>)}
        </TextField>
        <TextField
          select size="small" label="Источник" value={filterSource}
          onChange={e => { setFilterSource(e.target.value); setPage(1) }}
          sx={{ minWidth: 160 }}
        >
          <MenuItem value="">Все</MenuItem>
          {SOURCE_CHOICES.map(s => <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>)}
        </TextField>
      </Box>

      {/* Orders table */}
      <DataTable
        columns={columns}
        rows={orders}
        loading={loading}
        search={search}
        onSearchChange={v => { setSearch(v); setPage(1) }}
        searchPlaceholder="Поиск по номеру, получателю, телефону..."
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        emptyText="Заказов пока нет"
        onRowClick={openDetail}
      />

      {/* ═══ Create Order Dialog ═══ */}
      <EntityFormDialog
        open={createDlg}
        onClose={() => setCreateDlg(false)}
        onSubmit={saveOrder}
        title="Новый заказ"
        loading={saving}
        submitText="Создать заказ"
        maxWidth="lg"
        disabled={orderItems.every(it => !it.nomenclature)}
      >
        <Grid container spacing={2}>
          {/* Row 1 */}
          <Grid size={4}>
            <TextField
              select fullWidth label="Торговая точка" value={orderForm.trading_point}
              onChange={e => setOrderForm(f => ({ ...f, trading_point: e.target.value }))}
            >
              {tradingPoints.map(tp => <MenuItem key={tp.id} value={tp.id}>{tp.name}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid size={4}>
            <TextField
              select fullWidth label="Источник" value={orderForm.source}
              onChange={e => setOrderForm(f => ({ ...f, source: e.target.value }))}
            >
              {SOURCE_CHOICES.map(s => <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid size={4}>
            <TextField
              select fullWidth label="Клиент" value={orderForm.customer}
              onChange={e => setOrderForm(f => ({ ...f, customer: e.target.value }))}
            >
              <MenuItem value="">— Без клиента —</MenuItem>
              {customers.map(c => <MenuItem key={c.id} value={c.id}>{customerName(c)}</MenuItem>)}
            </TextField>
          </Grid>

          {/* Row 2 */}
          <Grid size={6}>
            <TextField
              fullWidth label="Имя получателя" value={orderForm.recipient_name}
              onChange={e => setOrderForm(f => ({ ...f, recipient_name: e.target.value }))}
            />
          </Grid>
          <Grid size={6}>
            <TextField
              fullWidth label="Телефон получателя" value={orderForm.recipient_phone}
              onChange={e => setOrderForm(f => ({ ...f, recipient_phone: e.target.value }))}
            />
          </Grid>

          {/* Row 3 */}
          <Grid size={12}>
            <TextField
              fullWidth label="Адрес доставки" value={orderForm.delivery_address}
              onChange={e => setOrderForm(f => ({ ...f, delivery_address: e.target.value }))}
            />
          </Grid>

          {/* Row 4 */}
          <Grid size={4}>
            <TextField
              fullWidth label="Дата доставки" type="date" value={orderForm.delivery_date}
              onChange={e => setOrderForm(f => ({ ...f, delivery_date: e.target.value }))}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Grid>
          <Grid size={4}>
            <TextField
              fullWidth label="Время с" type="time" value={orderForm.delivery_time_from}
              onChange={e => setOrderForm(f => ({ ...f, delivery_time_from: e.target.value }))}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Grid>
          <Grid size={4}>
            <TextField
              fullWidth label="Время до" type="time" value={orderForm.delivery_time_to}
              onChange={e => setOrderForm(f => ({ ...f, delivery_time_to: e.target.value }))}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Grid>

          {/* Row 5 */}
          <Grid size={4}>
            <FormControlLabel
              control={
                <Switch checked={orderForm.is_anonymous}
                  onChange={e => setOrderForm(f => ({ ...f, is_anonymous: e.target.checked }))}
                />
              }
              label="Анонимная доставка"
            />
          </Grid>
          {!orderForm.is_anonymous && (
            <Grid size={8}>
              <TextField
                fullWidth label="Текст открытки" multiline minRows={1} value={orderForm.card_text}
                onChange={e => setOrderForm(f => ({ ...f, card_text: e.target.value }))}
              />
            </Grid>
          )}

          {/* Row 6 */}
          <Grid size={4}>
            <TextField
              select fullWidth label="Способ оплаты" value={orderForm.payment_method}
              onChange={e => setOrderForm(f => ({ ...f, payment_method: e.target.value }))}
            >
              <MenuItem value="">— Не указан —</MenuItem>
              {paymentMethods.map(pm => <MenuItem key={pm.id} value={pm.id}>{pm.name}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid size={4}>
            <TextField
              fullWidth label="Предоплата" type="number" value={orderForm.prepayment}
              onChange={e => setOrderForm(f => ({ ...f, prepayment: e.target.value }))}
              slotProps={{ htmlInput: { min: 0, step: 0.01 } }}
            />
          </Grid>
          <Grid size={4}>
            <TextField
              fullWidth label="Стоимость доставки" type="number" value={orderForm.delivery_cost}
              onChange={e => setOrderForm(f => ({ ...f, delivery_cost: e.target.value }))}
              slotProps={{ htmlInput: { min: 0, step: 0.01 } }}
            />
          </Grid>

          {/* Row 7 */}
          <Grid size={6}>
            <TextField
              fullWidth label="Примечания" multiline minRows={1} value={orderForm.notes}
              onChange={e => setOrderForm(f => ({ ...f, notes: e.target.value }))}
            />
          </Grid>
          <Grid size={6}>
            <TextField
              fullWidth label="Внутренние заметки" multiline minRows={1} value={orderForm.internal_notes}
              onChange={e => setOrderForm(f => ({ ...f, internal_notes: e.target.value }))}
            />
          </Grid>
        </Grid>

        {/* ─── Order items ─── */}
        <Divider sx={{ my: 1 }} />
        <Box sx={{ display: "flex", justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="subtitle1" fontWeight={600}>Позиции заказа</Typography>
          <Button size="small" startIcon={<AddCircleOutline />} onClick={addItemRow}>Добавить</Button>
        </Box>

        {orderItems.map((item, idx) => (
          <Grid container spacing={1.5} key={idx} alignItems="center">
            <Grid size={4}>
              <TextField
                select fullWidth size="small" label="Номенклатура" value={item.nomenclature}
                onChange={e => handleItemChange(idx, 'nomenclature', e.target.value)}
              >
                {nomenclatures.map(n => <MenuItem key={n.id} value={n.id}>{n.name}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid size={2}>
              <TextField
                fullWidth size="small" label="Кол-во" type="number" value={item.quantity}
                onChange={e => handleItemChange(idx, 'quantity', e.target.value)}
                slotProps={{ htmlInput: { min: 1 } }}
              />
            </Grid>
            <Grid size={2}>
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
              <IconButton size="small" onClick={() => removeItemRow(idx)} disabled={orderItems.length <= 1}>
                <Delete fontSize="small" />
              </IconButton>
            </Grid>
          </Grid>
        ))}

        <Divider sx={{ my: 1 }} />
        <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 4, flexWrap: 'wrap' }}>
          <Typography variant="body2" color="text.secondary">Подитог: <b>{fmtCurrency(calcSubtotal())}</b></Typography>
          <Typography variant="body2" color="text.secondary">Скидка: <b>{fmtCurrency(calcDiscount())}</b></Typography>
          <Typography variant="body2" color="text.secondary">Доставка: <b>{fmtCurrency(parseFloat(orderForm.delivery_cost) || 0)}</b></Typography>
          <Typography variant="body1" fontWeight={700}>Итого: {fmtCurrency(calcTotal())}</Typography>
        </Box>
      </EntityFormDialog>

      {/* ═══ Detail Dialog ═══ */}
      <EntityFormDialog
        open={detailDlg}
        onClose={() => { setDetailDlg(false); setDetailOrder(null) }}
        onSubmit={() => setDetailDlg(false)}
        title={detailOrder ? `Заказ #${detailOrder.number}` : 'Заказ'}
        loading={detailLoading}
        submitText="Закрыть"
        maxWidth="lg"
      >
        {detailOrder && (
          <>
            {/* Status change */}
            <Box sx={{ display: "flex", gap: 2, alignItems: 'center', mb: 1 }}>
              <Typography variant="subtitle2" color="text.secondary">Текущий статус:</Typography>
              {statusChip(detailOrder.status)}
              <TextField
                select size="small" label="Сменить статус" value=""
                onChange={e => changeStatus(e.target.value)}
                disabled={statusChanging}
                sx={{ minWidth: 180, ml: 'auto' }}
              >
                {STATUS_CHOICES.filter(s => s.value !== detailOrder.status).map(s => (
                  <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>
                ))}
              </TextField>
            </Box>
            <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 2 }}>
              <Button 
                variant="contained" 
                color="success" 
                disabled={statusChanging || checkoutLoading || detailOrder.status === 'completed' || detailOrder.status === 'cancelled'} 
                onClick={handleCheckout}
                startIcon={<ShoppingBag />}
                size="medium"
              >
                {detailOrder.status === 'completed' ? 'Чек создан' : 'Пробить Чек / Выдать'}
              </Button>
            </Box>

            <Divider />

            {/* Order info */}
            <Grid container spacing={2}>
              <Grid size={3}>
                <Typography variant="caption" color="text.secondary">Источник</Typography>
                <Box><Chip label={sourceLabel(detailOrder.source)} size="small" variant="outlined" /></Box>
              </Grid>
              <Grid size={3}>
                <Typography variant="caption" color="text.secondary">Клиент</Typography>
                <Typography>{detailOrder.customer_name || '—'}</Typography>
              </Grid>
              <Grid size={3}>
                <Typography variant="caption" color="text.secondary">Получатель</Typography>
                <Typography>{detailOrder.recipient_name || '—'}</Typography>
              </Grid>
              <Grid size={3}>
                <Typography variant="caption" color="text.secondary">Телефон получателя</Typography>
                <Typography>{detailOrder.recipient_phone || '—'}</Typography>
              </Grid>

              <Grid size={6}>
                <Typography variant="caption" color="text.secondary">Адрес доставки</Typography>
                <Typography>{detailOrder.delivery_address || '—'}</Typography>
              </Grid>
              <Grid size={2}>
                <Typography variant="caption" color="text.secondary">Дата доставки</Typography>
                <Typography>{fmtDate(detailOrder.delivery_date)}</Typography>
              </Grid>
              <Grid size={2}>
                <Typography variant="caption" color="text.secondary">Время</Typography>
                <Typography>
                  {detailOrder.delivery_time_from || '—'} — {detailOrder.delivery_time_to || '—'}
                </Typography>
              </Grid>
              <Grid size={2}>
                <Typography variant="caption" color="text.secondary">Анонимная</Typography>
                <Typography>{detailOrder.is_anonymous ? 'Да' : 'Нет'}</Typography>
              </Grid>

              {detailOrder.card_text && (
                <Grid size={12}>
                  <Typography variant="caption" color="text.secondary">Текст открытки</Typography>
                  <Typography sx={{ fontStyle: 'italic' }}>{detailOrder.card_text}</Typography>
                </Grid>
              )}

              <Grid size={3}>
                <Typography variant="caption" color="text.secondary">Подитог</Typography>
                <Typography>{fmtCurrency(detailOrder.subtotal)}</Typography>
              </Grid>
              <Grid size={3}>
                <Typography variant="caption" color="text.secondary">Скидка</Typography>
                <Typography>{fmtCurrency(detailOrder.discount_amount)}</Typography>
              </Grid>
              <Grid size={3}>
                <Typography variant="caption" color="text.secondary">Доставка</Typography>
                <Typography>{fmtCurrency(detailOrder.delivery_cost)}</Typography>
              </Grid>
              <Grid size={3}>
                <Typography variant="caption" color="text.secondary">Итого</Typography>
                <Typography fontWeight={700} fontSize="1.1rem">{fmtCurrency(detailOrder.total)}</Typography>
              </Grid>

              <Grid size={3}>
                <Typography variant="caption" color="text.secondary">Предоплата</Typography>
                <Typography>{fmtCurrency(detailOrder.prepayment)}</Typography>
              </Grid>
              <Grid size={3}>
                <Typography variant="caption" color="text.secondary">Остаток</Typography>
                <Typography>{fmtCurrency(detailOrder.remaining_payment)}</Typography>
              </Grid>
              <Grid size={3}>
                <Typography variant="caption" color="text.secondary">Промокод</Typography>
                <Typography>{detailOrder.promo_code || '—'}</Typography>
              </Grid>
              <Grid size={3}>
                <Typography variant="caption" color="text.secondary">Создан</Typography>
                <Typography>{fmtDateTime(detailOrder.created_at)}</Typography>
              </Grid>

              {(detailOrder.notes || detailOrder.internal_notes) && (
                <>
                  {detailOrder.notes && (
                    <Grid size={6}>
                      <Typography variant="caption" color="text.secondary">Примечания</Typography>
                      <Typography>{detailOrder.notes}</Typography>
                    </Grid>
                  )}
                  {detailOrder.internal_notes && (
                    <Grid size={6}>
                      <Typography variant="caption" color="text.secondary">Внутренние заметки</Typography>
                      <Typography>{detailOrder.internal_notes}</Typography>
                    </Grid>
                  )}
                </>
              )}
            </Grid>

            {/* ─── Items table ─── */}
            <Divider sx={{ my: 1 }} />
            <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>Позиции</Typography>

            {detailItems.length === 0 ? (
              <Typography color="text.secondary">Нет позиций</Typography>
            ) : (
              <Box sx={{ display: "flex", flexDirection: 'column', gap: 0.5 }}>
                <Grid container spacing={1} sx={{ fontWeight: 600, fontSize: '0.8rem', color: 'text.secondary' }}>
                  <Grid size={4}>Наименование</Grid>
                  <Grid size={2} sx={{ textAlign: 'right' }}>Кол-во</Grid>
                  <Grid size={2} sx={{ textAlign: 'right' }}>Цена</Grid>
                  <Grid size={2} sx={{ textAlign: 'right' }}>Скидка</Grid>
                  <Grid size={2} sx={{ textAlign: 'right' }}>Сумма</Grid>
                </Grid>
                {detailItems.map(it => (
                  <Grid container spacing={1} key={it.id} sx={{ fontSize: '0.875rem' }}>
                    <Grid size={4}>{it.nomenclature_name}{it.is_custom_bouquet ? ' (авторский)' : ''}</Grid>
                    <Grid size={2} sx={{ textAlign: 'right' }}>{it.quantity}</Grid>
                    <Grid size={2} sx={{ textAlign: 'right' }}>{fmtCurrency(it.price)}</Grid>
                    <Grid size={2} sx={{ textAlign: 'right' }}>{it.discount_percent}%</Grid>
                    <Grid size={2} sx={{ textAlign: 'right', fontWeight: 600 }}>{fmtCurrency(it.total)}</Grid>
                  </Grid>
                ))}
              </Box>
            )}

            {/* ─── Status history timeline ─── */}
            {detailOrder.status_history && detailOrder.status_history.length > 0 && (
              <>
                <Divider sx={{ my: 1 }} />
                <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>История статусов</Typography>
                <Box sx={{ display: "flex", flexDirection: 'column', gap: 1 }}>
                  {detailOrder.status_history.map((entry, idx) => {
                    const st = STATUS_CHOICES.find(s => s.value === entry.status)
                    return (
                      <Box key={entry.id || idx} sx={{ display: "flex", alignItems: 'flex-start', gap: 1.5 }}>
                        <Chip
                          label={st?.label || entry.status}
                          size="small"
                          color={st?.color || 'default'}
                          icon={statusIcon(entry.status)}
                        />
                        <Box>
                          <Typography variant="caption" color="text.secondary">{fmtDateTime(entry.created_at)}</Typography>
                          {entry.comment && <Typography variant="body2">{entry.comment}</Typography>}
                        </Box>
                      </Box>
                    )
                  })}
                </Box>
              </>
            )}

            <Divider sx={{ my: 1 }} />
            <Box sx={{ display: "flex", justifyContent: 'flex-start' }}>
              <Button
                color="error" variant="outlined" startIcon={<Delete />}
                onClick={() => { setDelOrder(detailOrder); setDetailDlg(false) }}
              >
                Удалить заказ
              </Button>
            </Box>
          </>
        )}
      </EntityFormDialog>

      {/* ═══ Delete Confirm ═══ */}
      <ConfirmDialog
        open={!!delOrder}
        title="Удаление заказа"
        message={delOrder ? `Удалить заказ #${delOrder.number}? Это действие необратимо.` : ''}
        onConfirm={removeOrder}
        onCancel={() => setDelOrder(null)}
      />
    </Box>
  )
}
