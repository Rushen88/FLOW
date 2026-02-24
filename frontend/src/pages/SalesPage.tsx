import { useState, useEffect, useCallback } from 'react'
import {
  Box, Typography, Chip, TextField, MenuItem, Button,
  IconButton, Divider, FormControl, InputLabel, Select,
} from '@mui/material'
import Grid from '@mui/material/Grid2'
import { Add, Delete, ShoppingCart, AddCircleOutline } from '@mui/icons-material'
import api from '../api'
import { useNotification } from '../contexts/NotificationContext'
import extractError from '../utils/extractError'
import DataTable from '../components/DataTable'
import EntityFormDialog from '../components/EntityFormDialog'
import ConfirmDialog from '../components/ConfirmDialog'

// ─── Types ───
interface Sale {
  id: string; number: string; status: string; total: string
  customer_name: string; is_paid: boolean; created_at: string
  organization: string; trading_point: string; customer: string | null
  seller: string | null; order: string | null; subtotal: string
  discount_amount: string; payment_method: string | null; notes: string
  completed_at: string | null; items: SaleItem[]
}
interface SaleItem {
  id: string; sale: string; nomenclature: string; batch: string | null
  quantity: string; price: string; cost_price: string; discount_percent: string
  total: string; is_custom_bouquet: boolean; nomenclature_name: string
}
interface Ref { id: string; name: string }
interface NomRef { id: string; name: string; retail_price: string }
interface CustomerRef { id: string; full_name?: string; first_name?: string; last_name?: string }

// ─── Constants ───
const STATUS_CHOICES: { value: string; label: string; color: 'warning' | 'success' | 'error' }[] = [
  { value: 'open', label: 'Открыта', color: 'warning' },
  { value: 'completed', label: 'Завершена', color: 'success' },
  { value: 'cancelled', label: 'Отменена', color: 'error' },
]

const fmtDate = (v: string) => v ? new Date(v).toLocaleDateString('ru-RU') : '—'
const fmtCurrency = (v: string | number) =>
  v != null ? parseFloat(String(v)).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₽' : '—'

const emptyItemRow = () => ({ nomenclature: '', quantity: '1', price: '', discount_percent: '0' })

export default function SalesPage() {
  const { notify } = useNotification()

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
  }, [notify])

  useEffect(() => { fetchHelpers() }, [fetchHelpers])

  const customerName = (c: CustomerRef) => c.full_name || `${c.first_name || ''} ${c.last_name || ''}`.trim()

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
  }, [page, search, filterStatus, filterPaid, notify])

  useEffect(() => { fetchSales() }, [fetchSales])

  // ─── Create / Edit sale dialog ───
  const [saleDlg, setSaleDlg] = useState(false)
  const [editSale, setEditSale] = useState<Sale | null>(null)
  const [saleForm, setSaleForm] = useState({ trading_point: '', customer: '', payment_method: '', notes: '', status: 'open', is_paid: false })
  const [saleItems, setSaleItems] = useState<{ nomenclature: string; quantity: string; price: string; discount_percent: string }[]>([emptyItemRow()])
  const [saving, setSaving] = useState(false)

  const openCreateDlg = () => {
    setEditSale(null)
    setSaleForm({ trading_point: '', customer: '', payment_method: '', notes: '', status: 'open', is_paid: false })
    setSaleItems([emptyItemRow()])
    setSaleDlg(true)
  }

  const openEditDlg = (sale: Sale) => {
    setEditSale(sale)
    setSaleForm({
      trading_point: sale.trading_point || '',
      customer: sale.customer || '',
      payment_method: sale.payment_method || '',
      notes: sale.notes || '',
      status: sale.status,
      is_paid: sale.is_paid,
    })
    // Load items
    api.get('/sales/sale-items/', { params: { sale: sale.id } })
      .then(res => {
        const items = res.data.results || res.data || []
        setSaleItems(items.length ? items.map((it: SaleItem) => ({
          nomenclature: it.nomenclature, quantity: it.quantity,
          price: it.price, discount_percent: it.discount_percent || '0',
        })) : [emptyItemRow()])
      })
      .catch((err) => { setSaleItems([emptyItemRow()]); notify(extractError(err, 'Ошибка загрузки позиций'), 'error') })
    setSaleDlg(true)
  }

  const handleItemChange = (idx: number, field: string, value: string) => {
    setSaleItems(prev => {
      const copy = [...prev]
      copy[idx] = { ...copy[idx], [field]: value }
      // Auto-fill price when nomenclature changes
      if (field === 'nomenclature') {
        const nom = nomenclatures.find(n => n.id === value)
        if (nom) copy[idx].price = nom.retail_price || ''
      }
      return copy
    })
  }

  const addItemRow = () => setSaleItems(prev => [...prev, emptyItemRow()])
  const removeItemRow = (idx: number) => setSaleItems(prev => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev)

  const calcItemTotal = (item: { quantity: string; price: string; discount_percent: string }) => {
    const qty = parseFloat(item.quantity) || 0
    const price = parseFloat(item.price) || 0
    const disc = parseFloat(item.discount_percent) || 0
    return qty * price * (1 - disc / 100)
  }

  const calcSubtotal = () => saleItems.reduce((s, it) => s + (parseFloat(it.quantity) || 0) * (parseFloat(it.price) || 0), 0)
  const calcTotal = () => saleItems.reduce((s, it) => s + calcItemTotal(it), 0)

  const saveSale = async () => {
    setSaving(true)
    try {
      const validItems = saleItems.filter(it => it.nomenclature && it.quantity && it.price)
      if (!editSale && validItems.length === 0) { notify('Добавьте хотя бы одну позицию', 'warning'); setSaving(false); return }

      const payload: Record<string, any> = {
        trading_point: saleForm.trading_point || null,
        customer: saleForm.customer || null,
        payment_method: saleForm.payment_method || null,
        notes: saleForm.notes,
        status: saleForm.status,
        is_paid: saleForm.is_paid,
      }

      if (editSale) {
        await api.patch(`/sales/sales/${editSale.id}/`, payload)
        notify('Продажа обновлена')
      } else {
        payload.items = validItems.map(it => ({
          nomenclature: it.nomenclature,
          quantity: it.quantity,
          price: it.price,
          discount_percent: it.discount_percent || '0',
        }))
        await api.post('/sales/sales/', payload)
        notify('Продажа создана')
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

  const openDetail = async (sale: Sale) => {
    setDetailLoading(true)
    setDetailDlg(true)
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
        disabled={!editSale && saleItems.every(it => !it.nomenclature)}
      >
        <Grid container spacing={2}>
          <Grid size={6}>
            <TextField
              select fullWidth label="Торговая точка" value={saleForm.trading_point}
              onChange={e => setSaleForm(f => ({ ...f, trading_point: e.target.value }))}
            >
              {tradingPoints.map(tp => <MenuItem key={tp.id} value={tp.id}>{tp.name}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid size={6}>
            <TextField
              select fullWidth label="Клиент" value={saleForm.customer}
              onChange={e => setSaleForm(f => ({ ...f, customer: e.target.value }))}
            >
              <MenuItem value="">— Без клиента —</MenuItem>
              {customers.map(c => <MenuItem key={c.id} value={c.id}>{customerName(c)}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid size={6}>
            <TextField
              select fullWidth label="Способ оплаты" value={saleForm.payment_method}
              onChange={e => setSaleForm(f => ({ ...f, payment_method: e.target.value }))}
            >
              <MenuItem value="">— Не указан —</MenuItem>
              {paymentMethods.map(pm => <MenuItem key={pm.id} value={pm.id}>{pm.name}</MenuItem>)}
            </TextField>
          </Grid>
          {editSale && (
            <Grid size={6}>
              <TextField
                select fullWidth label="Статус" value={saleForm.status}
                onChange={e => setSaleForm(f => ({ ...f, status: e.target.value }))}
              >
                {STATUS_CHOICES.map(s => <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>)}
              </TextField>
            </Grid>
          )}
          <Grid size={editSale ? 12 : 6}>
            <TextField
              fullWidth label="Примечания" multiline minRows={1} value={saleForm.notes}
              onChange={e => setSaleForm(f => ({ ...f, notes: e.target.value }))}
            />
          </Grid>
        </Grid>

        {/* ─── Sale items ─── */}
        {!editSale && (
          <>
            <Divider sx={{ my: 1 }} />
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="subtitle1" fontWeight={600}>Позиции</Typography>
              <Button size="small" startIcon={<AddCircleOutline />} onClick={addItemRow}>Добавить</Button>
            </Box>

            {saleItems.map((item, idx) => (
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
                  <IconButton size="small" onClick={() => removeItemRow(idx)} disabled={saleItems.length <= 1}>
                    <Delete fontSize="small" />
                  </IconButton>
                </Grid>
              </Grid>
            ))}

            <Divider sx={{ my: 1 }} />
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
              <Typography variant="body2" color="text.secondary">Подитог: <b>{fmtCurrency(calcSubtotal())}</b></Typography>
              <Typography variant="body1" fontWeight={700}>Итого: {fmtCurrency(calcTotal())}</Typography>
            </Box>
          </>
        )}
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
              <Grid size={4}>
                <Typography variant="caption" color="text.secondary">Статус</Typography>
                <Box>
                  <Chip
                    label={STATUS_CHOICES.find(s => s.value === detailSale.status)?.label || detailSale.status}
                    color={STATUS_CHOICES.find(s => s.value === detailSale.status)?.color || 'default'}
                    size="small"
                  />
                </Box>
              </Grid>
              <Grid size={4}>
                <Typography variant="caption" color="text.secondary">Клиент</Typography>
                <Typography>{detailSale.customer_name || '—'}</Typography>
              </Grid>
              <Grid size={4}>
                <Typography variant="caption" color="text.secondary">Дата</Typography>
                <Typography>{fmtDate(detailSale.created_at)}</Typography>
              </Grid>
              <Grid size={4}>
                <Typography variant="caption" color="text.secondary">Итого</Typography>
                <Typography fontWeight={700}>{fmtCurrency(detailSale.total)}</Typography>
              </Grid>
              <Grid size={4}>
                <Typography variant="caption" color="text.secondary">Оплата</Typography>
                <Box>
                  <Chip
                    label={detailSale.is_paid ? 'Оплачено' : 'Не оплачено'}
                    size="small"
                    color={detailSale.is_paid ? 'success' : 'default'}
                  />
                </Box>
              </Grid>
              <Grid size={4}>
                <Typography variant="caption" color="text.secondary">Примечания</Typography>
                <Typography>{detailSale.notes || '—'}</Typography>
              </Grid>
            </Grid>

            <Divider sx={{ my: 1 }} />
            <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>Позиции</Typography>

            {detailItems.length === 0 ? (
              <Typography color="text.secondary">Нет позиций</Typography>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                <Grid container spacing={1} sx={{ fontWeight: 600, fontSize: '0.8rem', color: 'text.secondary' }}>
                  <Grid size={4}>Наименование</Grid>
                  <Grid size={2} sx={{ textAlign: 'right' }}>Кол-во</Grid>
                  <Grid size={2} sx={{ textAlign: 'right' }}>Цена</Grid>
                  <Grid size={2} sx={{ textAlign: 'right' }}>Скидка</Grid>
                  <Grid size={2} sx={{ textAlign: 'right' }}>Сумма</Grid>
                </Grid>
                {detailItems.map(it => (
                  <Grid container spacing={1} key={it.id} sx={{ fontSize: '0.875rem' }}>
                    <Grid size={4}>{it.nomenclature_name}</Grid>
                    <Grid size={2} sx={{ textAlign: 'right' }}>{it.quantity}</Grid>
                    <Grid size={2} sx={{ textAlign: 'right' }}>{fmtCurrency(it.price)}</Grid>
                    <Grid size={2} sx={{ textAlign: 'right' }}>{it.discount_percent}%</Grid>
                    <Grid size={2} sx={{ textAlign: 'right', fontWeight: 600 }}>{fmtCurrency(it.total)}</Grid>
                  </Grid>
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
