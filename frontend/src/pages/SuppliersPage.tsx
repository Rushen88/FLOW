import { useState, useEffect, useCallback } from 'react'
import {
  Box, Typography, TextField, Button, Tab, Tabs, IconButton, Chip, MenuItem,
  Switch, FormControlLabel, Divider, Rating,
} from '@mui/material'
import Grid from '@mui/material/Grid2'
import {
  Add, Edit, Delete, LocalShipping, ShoppingCart,
  Inventory2, ReportProblem, Star, Archive,
} from '@mui/icons-material'
import api from '../api'
import { useNotification } from '../contexts/NotificationContext'
import extractError from '../utils/extractError'
import DataTable from '../components/DataTable'
import EntityFormDialog from '../components/EntityFormDialog'
import ConfirmDialog from '../components/ConfirmDialog'

// ─── Types ───
interface Supplier {
  id: string; organization: string; name: string; contact_person: string
  phone: string; email: string; address: string; inn: string
  payment_terms: string; delivery_days: number | null; min_order_amount: string
  rating: number | null; notes: string; is_active: boolean; created_at: string
}
interface OrderItem { id?: string; order?: string; nomenclature: string; quantity: number | string; price: number | string; received_quantity?: number; nomenclature_name?: string }
interface SupplierOrder {
  id: string; organization: string; supplier: string; number: string; status: string
  total: string; expected_date: string | null; notes: string; created_by: string
  created_at: string; updated_at: string; items: OrderItem[]; supplier_name: string
}
interface SupplierNomenclature {
  id: string; supplier: string; nomenclature: string; supplier_sku: string
  price: string; min_quantity: number; is_available: boolean; nomenclature_name: string
}
interface Claim {
  id: string; organization: string; supplier: string; batch: string | null
  status: string; description: string; amount: string; resolved_amount: string
  photos: any; created_at: string; resolved_at: string | null; supplier_name: string
}
interface NomItem { id: string; name: string }
interface WarehouseRef { id: string; name: string }

const ORDER_STATUSES = [
  { value: 'draft', label: 'Черновик', color: 'default' as const },
  { value: 'sent', label: 'Отправлен', color: 'info' as const },
  { value: 'confirmed', label: 'Подтверждён', color: 'primary' as const },
  { value: 'shipped', label: 'Отгружен', color: 'warning' as const },
  { value: 'received', label: 'Получен', color: 'success' as const },
  { value: 'cancelled', label: 'Отменён', color: 'error' as const },
]
const CLAIM_STATUSES = [
  { value: 'open', label: 'Открыта', color: 'error' as const },
  { value: 'in_progress', label: 'В работе', color: 'warning' as const },
  { value: 'resolved', label: 'Решена', color: 'success' as const },
  { value: 'rejected', label: 'Отклонена', color: 'default' as const },
]
const statusChip = (val: string, list: typeof ORDER_STATUSES) => {
  const s = list.find(x => x.value === val)
  return <Chip label={s?.label || val} size="small" color={s?.color || 'default'} />
}

const defaultSupForm = () => ({
  name: '', contact_person: '', phone: '', email: '', address: '', inn: '',
  payment_terms: '', delivery_days: '' as string | number, min_order_amount: '',
  rating: 5, notes: '', is_active: true,
})
const defaultOrderForm = () => ({
  supplier: '', expected_date: '', notes: '', status: 'draft',
})
const emptyItem = (): OrderItem => ({ nomenclature: '', quantity: '', price: '' })
const defaultNomForm = () => ({
  nomenclature: '', supplier_sku: '', price: '', min_quantity: '' as string | number, is_available: true,
})
const defaultClaimForm = () => ({
  supplier: '', description: '', amount: '', status: 'open',
})

export default function SuppliersPage() {
  const { notify } = useNotification()
  const [tab, setTab] = useState(0)
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [nomItems, setNomItems] = useState<NomItem[]>([])
  const [warehouses, setWarehouses] = useState<WarehouseRef[]>([])

  useEffect(() => {
    api.get('/nomenclature/items/').then(r => setNomItems(r.data.results || r.data || []))
    api.get('/core/warehouses/').then(r => setWarehouses(r.data.results || r.data || []))
  }, [])

  // ══════════════════ Tab 0: Suppliers ══════════════════
  const [supLoad, setSupLoad] = useState(false)
  const [supSearch, setSupSearch] = useState('')
  const [supDlg, setSupDlg] = useState(false)
  const [editSup, setEditSup] = useState<Supplier | null>(null)
  const [supForm, setSupForm] = useState(defaultSupForm())
  const [supSaving, setSupSaving] = useState(false)
  const [delSup, setDelSup] = useState<Supplier | null>(null)

  const fetchSuppliers = useCallback(() => {
    setSupLoad(true)
    const p: Record<string, string> = {}
    if (supSearch) p.search = supSearch
    api.get('/suppliers/suppliers/', { params: p })
      .then(r => setSuppliers(r.data.results || r.data || []))
      .catch((err) => notify(extractError(err, 'Ошибка загрузки поставщиков'), 'error'))
      .finally(() => setSupLoad(false))
  }, [supSearch, notify])

  useEffect(() => { fetchSuppliers() }, [fetchSuppliers])

  const openSupDlg = (s?: Supplier) => {
    if (s) {
      setEditSup(s)
      setSupForm({
        name: s.name, contact_person: s.contact_person || '', phone: s.phone || '',
        email: s.email || '', address: s.address || '', inn: s.inn || '',
        payment_terms: s.payment_terms || '', delivery_days: s.delivery_days ?? '',
        min_order_amount: s.min_order_amount || '', rating: s.rating ?? 5,
        notes: s.notes || '', is_active: s.is_active,
      })
    } else { setEditSup(null); setSupForm(defaultSupForm()) }
    setSupDlg(true)
  }

  const saveSup = async () => {
    setSupSaving(true)
    try {
      const d: Record<string, any> = { ...supForm }
      if (d.delivery_days === '') d.delivery_days = null
      if (!d.min_order_amount) d.min_order_amount = '0.00'
      if (editSup) { await api.patch(`/suppliers/suppliers/${editSup.id}/`, d); notify('Поставщик обновлён') }
      else { await api.post('/suppliers/suppliers/', d); notify('Поставщик создан') }
      setSupDlg(false); fetchSuppliers()
    } catch (err) { notify(extractError(err, 'Ошибка сохранения'), 'error') }
    setSupSaving(false)
  }

  const removeSup = async () => {
    if (!delSup) return
    try { await api.delete(`/suppliers/suppliers/${delSup.id}/`); notify('Поставщик удалён'); setDelSup(null); fetchSuppliers() }
    catch (err) { notify(extractError(err, 'Ошибка удаления'), 'error') }
  }

  // ══════════════════ Tab 1: Orders ══════════════════
  const [orders, setOrders] = useState<SupplierOrder[]>([])
  const [ordLoad, setOrdLoad] = useState(false)
  const [ordStatusFilter, setOrdStatusFilter] = useState('')
  const [ordSupFilter, setOrdSupFilter] = useState('')
  const [ordDlg, setOrdDlg] = useState(false)
  const [editOrd, setEditOrd] = useState<SupplierOrder | null>(null)
  const [ordForm, setOrdForm] = useState(defaultOrderForm())
  const [ordItems, setOrdItems] = useState<OrderItem[]>([emptyItem()])
  const [ordSaving, setOrdSaving] = useState(false)
  const [delOrd, setDelOrd] = useState<SupplierOrder | null>(null)

  const fetchOrders = useCallback(() => {
    setOrdLoad(true)
    const p: Record<string, string> = {}
    if (ordStatusFilter) p.status = ordStatusFilter
    if (ordSupFilter) p.supplier = ordSupFilter
    api.get('/suppliers/orders/', { params: p })
      .then(r => setOrders(r.data.results || r.data || []))
      .catch((err) => notify(extractError(err, 'Ошибка загрузки заказов'), 'error'))
      .finally(() => setOrdLoad(false))
  }, [ordStatusFilter, ordSupFilter, notify])

  useEffect(() => { if (tab === 1) fetchOrders() }, [tab, fetchOrders])

  const orderTotal = () => ordItems.reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.price) || 0), 0)

  const openOrdDlg = (o?: SupplierOrder) => {
    if (o) {
      setEditOrd(o)
      setOrdForm({ supplier: o.supplier, expected_date: o.expected_date || '', notes: o.notes || '', status: o.status })
      setOrdItems(o.items.length ? o.items.map(i => ({ ...i })) : [emptyItem()])
    } else { setEditOrd(null); setOrdForm(defaultOrderForm()); setOrdItems([emptyItem()]) }
    setOrdDlg(true)
  }

  const saveOrd = async () => {
    setOrdSaving(true)
    try {
      const items = ordItems.filter(i => i.nomenclature && Number(i.quantity) > 0).map(i => ({
        nomenclature: i.nomenclature, quantity: Number(i.quantity), price: Number(i.price) || 0,
      }))
      const d: Record<string, any> = { ...ordForm, items }
      if (!d.expected_date) d.expected_date = null
      if (editOrd) {
        await api.patch(`/suppliers/orders/${editOrd.id}/`, d); notify('Заказ обновлён')
      } else {
        await api.post('/suppliers/orders/', d); notify('Заказ создан')
      }
      setOrdDlg(false); fetchOrders()
    } catch (err) { notify(extractError(err, 'Ошибка сохранения заказа'), 'error') }
    setOrdSaving(false)
  }

  const removeOrd = async () => {
    if (!delOrd) return
    try { await api.delete(`/suppliers/orders/${delOrd.id}/`); notify('Заказ удалён'); setDelOrd(null); fetchOrders() }
    catch (err) { notify(extractError(err, 'Ошибка удаления'), 'error') }
  }

  // ── Receive shipment ──
  const [receiveDlg, setReceiveDlg] = useState(false)
  const [receiveOrd, setReceiveOrd] = useState<SupplierOrder | null>(null)
  const [receiveWh, setReceiveWh] = useState('')
  const [receiveDebt, setReceiveDebt] = useState(true)
  const [receiving, setReceiving] = useState(false)

  const openReceiveDlg = (ord: SupplierOrder) => {
    setReceiveOrd(ord)
    setReceiveWh(warehouses.length === 1 ? warehouses[0].id : '')
    setReceiveDebt(true)
    setReceiveDlg(true)
  }

  const receiveOrder = async () => {
    if (!receiveOrd || !receiveWh) { notify('Выберите склад', 'warning'); return }
    setReceiving(true)
    try {
      await api.post(`/suppliers/orders/${receiveOrd.id}/receive/`, { warehouse: receiveWh, create_debt: receiveDebt })
      notify('Поставка принята на склад')
      setReceiveDlg(false)
      fetchOrders()
    } catch (err) { notify(extractError(err, 'Ошибка приёмки'), 'error') }
    setReceiving(false)
  }

  // ══════════════════ Tab 2: Supplier Nomenclature ══════════════════
  const [selSupNom, setSelSupNom] = useState('')
  const [supNoms, setSupNoms] = useState<SupplierNomenclature[]>([])
  const [snLoad, setSnLoad] = useState(false)
  const [snDlg, setSnDlg] = useState(false)
  const [editSn, setEditSn] = useState<SupplierNomenclature | null>(null)
  const [snForm, setSnForm] = useState(defaultNomForm())
  const [snSaving, setSnSaving] = useState(false)
  const [delSn, setDelSn] = useState<SupplierNomenclature | null>(null)

  const fetchSupNoms = useCallback(() => {
    if (!selSupNom) { setSupNoms([]); return }
    setSnLoad(true)
    api.get('/suppliers/nomenclatures/', { params: { supplier: selSupNom } })
      .then(r => setSupNoms(r.data.results || r.data || []))
      .catch((err) => notify(extractError(err, 'Ошибка загрузки номенклатуры'), 'error'))
      .finally(() => setSnLoad(false))
  }, [selSupNom, notify])

  useEffect(() => { if (tab === 2) fetchSupNoms() }, [tab, fetchSupNoms])

  const openSnDlg = (sn?: SupplierNomenclature) => {
    if (sn) {
      setEditSn(sn)
      setSnForm({
        nomenclature: sn.nomenclature, supplier_sku: sn.supplier_sku || '',
        price: sn.price || '', min_quantity: sn.min_quantity ?? '', is_available: sn.is_available,
      })
    } else { setEditSn(null); setSnForm(defaultNomForm()) }
    setSnDlg(true)
  }

  const saveSn = async () => {
    setSnSaving(true)
    try {
      const d: Record<string, any> = { ...snForm, supplier: selSupNom }
      if (d.min_quantity === '') d.min_quantity = 0
      if (!d.price) d.price = '0.00'
      if (editSn) { await api.patch(`/suppliers/nomenclatures/${editSn.id}/`, d); notify('Номенклатура обновлена') }
      else { await api.post('/suppliers/nomenclatures/', d); notify('Номенклатура добавлена') }
      setSnDlg(false); fetchSupNoms()
    } catch (err) { notify(extractError(err, 'Ошибка сохранения'), 'error') }
    setSnSaving(false)
  }

  const removeSn = async () => {
    if (!delSn) return
    try { await api.delete(`/suppliers/nomenclatures/${delSn.id}/`); notify('Номенклатура удалена'); setDelSn(null); fetchSupNoms() }
    catch (err) { notify(extractError(err, 'Ошибка удаления'), 'error') }
  }

  // ══════════════════ Tab 3: Claims ══════════════════
  const [claims, setClaims] = useState<Claim[]>([])
  const [clLoad, setClLoad] = useState(false)
  const [clStatusFilter, setClStatusFilter] = useState('')
  const [clSupFilter, setClSupFilter] = useState('')
  const [clDlg, setClDlg] = useState(false)
  const [editCl, setEditCl] = useState<Claim | null>(null)
  const [clForm, setClForm] = useState(defaultClaimForm())
  const [clSaving, setClSaving] = useState(false)
  const [delCl, setDelCl] = useState<Claim | null>(null)

  const fetchClaims = useCallback(() => {
    setClLoad(true)
    const p: Record<string, string> = {}
    if (clStatusFilter) p.status = clStatusFilter
    if (clSupFilter) p.supplier = clSupFilter
    api.get('/suppliers/claims/', { params: p })
      .then(r => setClaims(r.data.results || r.data || []))
      .catch((err) => notify(extractError(err, 'Ошибка загрузки претензий'), 'error'))
      .finally(() => setClLoad(false))
  }, [clStatusFilter, clSupFilter, notify])

  useEffect(() => { if (tab === 3) fetchClaims() }, [tab, fetchClaims])

  const openClDlg = (c?: Claim) => {
    if (c) {
      setEditCl(c)
      setClForm({ supplier: c.supplier, description: c.description || '', amount: c.amount || '', status: c.status })
    } else { setEditCl(null); setClForm(defaultClaimForm()) }
    setClDlg(true)
  }

  const saveCl = async () => {
    setClSaving(true)
    try {
      const d: Record<string, any> = { ...clForm }
      if (!d.amount) d.amount = '0.00'
      if (editCl) { await api.patch(`/suppliers/claims/${editCl.id}/`, d); notify('Претензия обновлена') }
      else { await api.post('/suppliers/claims/', d); notify('Претензия создана') }
      setClDlg(false); fetchClaims()
    } catch (err) { notify(extractError(err, 'Ошибка сохранения'), 'error') }
    setClSaving(false)
  }

  const removeCl = async () => {
    if (!delCl) return
    try { await api.delete(`/suppliers/claims/${delCl.id}/`); notify('Претензия удалена'); setDelCl(null); fetchClaims() }
    catch (err) { notify(extractError(err, 'Ошибка удаления'), 'error') }
  }

  // ══════════════════ Render ══════════════════
  return (
    <Box>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 3 }}>Поставщики</Typography>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}>
        <Tab icon={<LocalShipping />} iconPosition="start" label="Поставщики" />
        <Tab icon={<ShoppingCart />} iconPosition="start" label="Заказы поставщикам" />
        <Tab icon={<Inventory2 />} iconPosition="start" label="Номенклатура поставщиков" />
        <Tab icon={<ReportProblem />} iconPosition="start" label="Претензии" />
      </Tabs>

      {/* ── Tab 0: Suppliers ── */}
      {tab === 0 && (
        <DataTable
          columns={[
            { key: 'name', label: 'Название', render: (v: string) => <Typography fontWeight={600}>{v}</Typography> },
            { key: 'contact_person', label: 'Контактное лицо' },
            { key: 'phone', label: 'Телефон' },
            { key: 'email', label: 'Email' },
            { key: 'rating', label: 'Рейтинг', align: 'center', render: (v: number | null) => v != null ? <Rating value={v} readOnly size="small" /> : '—' },
            { key: 'is_active', label: 'Статус', render: (v: boolean) => <Chip label={v ? 'Активен' : 'Неактивен'} size="small" color={v ? 'success' : 'default'} /> },
            { key: '_act', label: '', align: 'center', width: 100, render: (_: any, row: Supplier) => (<>
              <IconButton size="small" onClick={() => openSupDlg(row)}><Edit fontSize="small" /></IconButton>
              <IconButton size="small" onClick={() => setDelSup(row)}><Delete fontSize="small" /></IconButton>
            </>) },
          ]}
          rows={suppliers} loading={supLoad} emptyText="Нет поставщиков"
          search={supSearch} onSearchChange={setSupSearch} searchPlaceholder="Поиск по имени, контакту, телефону..."
          headerActions={<Button variant="contained" startIcon={<Add />} onClick={() => openSupDlg()}>Добавить поставщика</Button>}
        />
      )}

      {/* ── Tab 1: Orders ── */}
      {tab === 1 && (
        <>
          <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
            <TextField size="small" select label="Статус" value={ordStatusFilter}
              onChange={e => setOrdStatusFilter(e.target.value)} sx={{ minWidth: 160 }}>
              <MenuItem value="">Все</MenuItem>
              {ORDER_STATUSES.map(s => <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>)}
            </TextField>
            <TextField size="small" select label="Поставщик" value={ordSupFilter}
              onChange={e => setOrdSupFilter(e.target.value)} sx={{ minWidth: 200 }}>
              <MenuItem value="">Все</MenuItem>
              {suppliers.map(s => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
            </TextField>
          </Box>
          <DataTable
            columns={[
              { key: 'number', label: '№', render: (v: string) => <Typography fontWeight={600}>{v}</Typography> },
              { key: 'supplier_name', label: 'Поставщик' },
              { key: 'status', label: 'Статус', render: (v: string) => statusChip(v, ORDER_STATUSES) },
              { key: 'total', label: 'Сумма', align: 'right', render: (v: string) => `${Number(v).toLocaleString('ru-RU')} ₽` },
              { key: 'expected_date', label: 'Ожидаемая дата', render: (v: string | null) => v ? new Date(v).toLocaleDateString('ru-RU') : '—' },
              { key: 'created_at', label: 'Создан', render: (v: string) => new Date(v).toLocaleDateString('ru-RU') },
              { key: '_act', label: '', align: 'center', width: 140, render: (_: any, row: SupplierOrder) => (<>
                {['confirmed', 'shipped'].includes(row.status) && (
                  <IconButton size="small" color="success" title="Принять поставку" onClick={() => openReceiveDlg(row)}><Archive fontSize="small" /></IconButton>
                )}
                <IconButton size="small" onClick={() => openOrdDlg(row)}><Edit fontSize="small" /></IconButton>
                <IconButton size="small" onClick={() => setDelOrd(row)}><Delete fontSize="small" /></IconButton>
              </>) },
            ]}
            rows={orders} loading={ordLoad} emptyText="Нет заказов"
            headerActions={<Button variant="contained" startIcon={<Add />} onClick={() => openOrdDlg()}>Создать заказ</Button>}
          />
        </>
      )}

      {/* ── Tab 2: Supplier Nomenclature ── */}
      {tab === 2 && (
        <>
          <Box sx={{ mb: 2 }}>
            <TextField size="small" select label="Поставщик" value={selSupNom}
              onChange={e => setSelSupNom(e.target.value)} sx={{ minWidth: 300 }}>
              <MenuItem value="">— Выберите поставщика —</MenuItem>
              {suppliers.map(s => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
            </TextField>
          </Box>
          {selSupNom ? (
            <DataTable
              columns={[
                { key: 'nomenclature_name', label: 'Номенклатура', render: (v: string) => <Typography fontWeight={500}>{v}</Typography> },
                { key: 'supplier_sku', label: 'Артикул поставщика' },
                { key: 'price', label: 'Цена', align: 'right', render: (v: string) => `${Number(v).toLocaleString('ru-RU')} ₽` },
                { key: 'min_quantity', label: 'Мин. кол-во', align: 'right' },
                { key: 'is_available', label: 'Доступно', render: (v: boolean) => <Chip label={v ? 'Да' : 'Нет'} size="small" color={v ? 'success' : 'default'} /> },
                { key: '_act', label: '', align: 'center', width: 100, render: (_: any, row: SupplierNomenclature) => (<>
                  <IconButton size="small" onClick={() => openSnDlg(row)}><Edit fontSize="small" /></IconButton>
                  <IconButton size="small" onClick={() => setDelSn(row)}><Delete fontSize="small" /></IconButton>
                </>) },
              ]}
              rows={supNoms} loading={snLoad} emptyText="Нет номенклатуры"
              headerActions={<Button variant="contained" startIcon={<Add />} onClick={() => openSnDlg()}>Добавить</Button>}
            />
          ) : (
            <Typography color="text.secondary" sx={{ mt: 4, textAlign: 'center' }}>Выберите поставщика для просмотра номенклатуры</Typography>
          )}
        </>
      )}

      {/* ── Tab 3: Claims ── */}
      {tab === 3 && (
        <>
          <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
            <TextField size="small" select label="Статус" value={clStatusFilter}
              onChange={e => setClStatusFilter(e.target.value)} sx={{ minWidth: 160 }}>
              <MenuItem value="">Все</MenuItem>
              {CLAIM_STATUSES.map(s => <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>)}
            </TextField>
            <TextField size="small" select label="Поставщик" value={clSupFilter}
              onChange={e => setClSupFilter(e.target.value)} sx={{ minWidth: 200 }}>
              <MenuItem value="">Все</MenuItem>
              {suppliers.map(s => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
            </TextField>
          </Box>
          <DataTable
            columns={[
              { key: 'supplier_name', label: 'Поставщик', render: (v: string) => <Typography fontWeight={500}>{v}</Typography> },
              { key: 'status', label: 'Статус', render: (v: string) => statusChip(v, CLAIM_STATUSES) },
              { key: 'description', label: 'Описание', render: (v: string) => v?.length > 60 ? v.slice(0, 60) + '…' : v },
              { key: 'amount', label: 'Сумма', align: 'right', render: (v: string) => `${Number(v).toLocaleString('ru-RU')} ₽` },
              { key: 'created_at', label: 'Дата', render: (v: string) => new Date(v).toLocaleDateString('ru-RU') },
              { key: '_act', label: '', align: 'center', width: 100, render: (_: any, row: Claim) => (<>
                <IconButton size="small" onClick={() => openClDlg(row)}><Edit fontSize="small" /></IconButton>
                <IconButton size="small" onClick={() => setDelCl(row)}><Delete fontSize="small" /></IconButton>
              </>) },
            ]}
            rows={claims} loading={clLoad} emptyText="Нет претензий"
            headerActions={<Button variant="contained" startIcon={<Add />} onClick={() => openClDlg()}>Создать претензию</Button>}
          />
        </>
      )}

      {/* ══════ Dialogs ══════ */}

      {/* Supplier form */}
      <EntityFormDialog open={supDlg} onClose={() => setSupDlg(false)} onSubmit={saveSup}
        title={editSup ? 'Редактировать поставщика' : 'Новый поставщик'} loading={supSaving}>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField fullWidth label="Название *" value={supForm.name} onChange={e => setSupForm({ ...supForm, name: e.target.value })} />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField fullWidth label="Контактное лицо" value={supForm.contact_person} onChange={e => setSupForm({ ...supForm, contact_person: e.target.value })} />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField fullWidth label="Телефон" value={supForm.phone} onChange={e => setSupForm({ ...supForm, phone: e.target.value })} />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField fullWidth label="Email" value={supForm.email} onChange={e => setSupForm({ ...supForm, email: e.target.value })} />
          </Grid>
          <Grid size={{ xs: 12 }}>
            <TextField fullWidth label="Адрес" value={supForm.address} onChange={e => setSupForm({ ...supForm, address: e.target.value })} />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField fullWidth label="ИНН" value={supForm.inn} onChange={e => setSupForm({ ...supForm, inn: e.target.value })} />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField fullWidth label="Условия оплаты" value={supForm.payment_terms} onChange={e => setSupForm({ ...supForm, payment_terms: e.target.value })} />
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField fullWidth label="Срок поставки (дни)" type="number" value={supForm.delivery_days} onChange={e => setSupForm({ ...supForm, delivery_days: e.target.value })} />
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField fullWidth label="Мин. сумма заказа" type="number" value={supForm.min_order_amount} onChange={e => setSupForm({ ...supForm, min_order_amount: e.target.value })} />
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField fullWidth select label="Рейтинг" value={supForm.rating} onChange={e => setSupForm({ ...supForm, rating: Number(e.target.value) })}>
              {[1, 2, 3, 4, 5].map(v => <MenuItem key={v} value={v}>{'★'.repeat(v)} ({v})</MenuItem>)}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12 }}>
            <TextField fullWidth label="Заметки" multiline rows={2} value={supForm.notes} onChange={e => setSupForm({ ...supForm, notes: e.target.value })} />
          </Grid>
          <Grid size={{ xs: 12 }}>
            <FormControlLabel control={<Switch checked={supForm.is_active} onChange={e => setSupForm({ ...supForm, is_active: e.target.checked })} />} label="Активен" />
          </Grid>
        </Grid>
      </EntityFormDialog>

      {/* Order form */}
      <EntityFormDialog open={ordDlg} onClose={() => setOrdDlg(false)} onSubmit={saveOrd}
        title={editOrd ? 'Редактировать заказ' : 'Новый заказ'} loading={ordSaving} maxWidth="md">
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField fullWidth select label="Поставщик *" value={ordForm.supplier}
              onChange={e => setOrdForm({ ...ordForm, supplier: e.target.value })}>
              <MenuItem value="">— Выберите —</MenuItem>
              {suppliers.map(s => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, sm: 3 }}>
            <TextField fullWidth type="date" label="Ожидаемая дата" value={ordForm.expected_date}
              onChange={e => setOrdForm({ ...ordForm, expected_date: e.target.value })}
              slotProps={{ inputLabel: { shrink: true } }} />
          </Grid>
          {editOrd && (
            <Grid size={{ xs: 12, sm: 3 }}>
              <TextField fullWidth select label="Статус" value={ordForm.status}
                onChange={e => setOrdForm({ ...ordForm, status: e.target.value })}>
                {ORDER_STATUSES.map(s => <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>)}
              </TextField>
            </Grid>
          )}
          <Grid size={{ xs: 12 }}>
            <TextField fullWidth label="Заметки" multiline rows={2} value={ordForm.notes}
              onChange={e => setOrdForm({ ...ordForm, notes: e.target.value })} />
          </Grid>
        </Grid>

        <Divider sx={{ my: 2 }} />
        <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>Позиции заказа</Typography>

        {ordItems.map((item, idx) => (
          <Grid container spacing={1} key={idx} sx={{ mb: 1, alignItems: 'center' }}>
            <Grid size={{ xs: 12, sm: 5 }}>
              <TextField fullWidth select size="small" label="Номенклатура" value={item.nomenclature}
                onChange={e => { const a = [...ordItems]; a[idx] = { ...a[idx], nomenclature: e.target.value }; setOrdItems(a) }}>
                <MenuItem value="">—</MenuItem>
                {nomItems.map(n => <MenuItem key={n.id} value={n.id}>{n.name}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid size={{ xs: 5, sm: 3 }}>
              <TextField fullWidth size="small" label="Кол-во" type="number" value={item.quantity}
                onChange={e => { const a = [...ordItems]; a[idx] = { ...a[idx], quantity: e.target.value }; setOrdItems(a) }} />
            </Grid>
            <Grid size={{ xs: 5, sm: 3 }}>
              <TextField fullWidth size="small" label="Цена" type="number" value={item.price}
                onChange={e => { const a = [...ordItems]; a[idx] = { ...a[idx], price: e.target.value }; setOrdItems(a) }} />
            </Grid>
            <Grid size={{ xs: 2, sm: 1 }}>
              <IconButton size="small" color="error" onClick={() => { const a = ordItems.filter((_, i) => i !== idx); setOrdItems(a.length ? a : [emptyItem()]) }}>
                <Delete fontSize="small" />
              </IconButton>
            </Grid>
          </Grid>
        ))}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1 }}>
          <Button size="small" startIcon={<Add />} onClick={() => setOrdItems([...ordItems, emptyItem()])}>Добавить позицию</Button>
          <Typography fontWeight={600}>Итого: {orderTotal().toLocaleString('ru-RU')} ₽</Typography>
        </Box>
      </EntityFormDialog>

      {/* Supplier Nomenclature form */}
      <EntityFormDialog open={snDlg} onClose={() => setSnDlg(false)} onSubmit={saveSn}
        title={editSn ? 'Редактировать номенклатуру' : 'Добавить номенклатуру'} loading={snSaving}>
        <TextField fullWidth select label="Номенклатура *" value={snForm.nomenclature}
          onChange={e => setSnForm({ ...snForm, nomenclature: e.target.value })}>
          <MenuItem value="">— Выберите —</MenuItem>
          {nomItems.map(n => <MenuItem key={n.id} value={n.id}>{n.name}</MenuItem>)}
        </TextField>
        <TextField fullWidth label="Артикул поставщика" value={snForm.supplier_sku}
          onChange={e => setSnForm({ ...snForm, supplier_sku: e.target.value })} />
        <TextField fullWidth label="Цена" type="number" value={snForm.price}
          onChange={e => setSnForm({ ...snForm, price: e.target.value })} />
        <TextField fullWidth label="Мин. количество" type="number" value={snForm.min_quantity}
          onChange={e => setSnForm({ ...snForm, min_quantity: e.target.value })} />
        <FormControlLabel control={<Switch checked={snForm.is_available} onChange={e => setSnForm({ ...snForm, is_available: e.target.checked })} />} label="Доступно" />
      </EntityFormDialog>

      {/* Claim form */}
      <EntityFormDialog open={clDlg} onClose={() => setClDlg(false)} onSubmit={saveCl}
        title={editCl ? 'Редактировать претензию' : 'Новая претензия'} loading={clSaving}>
        <TextField fullWidth select label="Поставщик *" value={clForm.supplier}
          onChange={e => setClForm({ ...clForm, supplier: e.target.value })}>
          <MenuItem value="">— Выберите —</MenuItem>
          {suppliers.map(s => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
        </TextField>
        <TextField fullWidth label="Описание" multiline rows={3} value={clForm.description}
          onChange={e => setClForm({ ...clForm, description: e.target.value })} />
        <TextField fullWidth label="Сумма" type="number" value={clForm.amount}
          onChange={e => setClForm({ ...clForm, amount: e.target.value })} />
        <TextField fullWidth select label="Статус" value={clForm.status}
          onChange={e => setClForm({ ...clForm, status: e.target.value })}>
          {CLAIM_STATUSES.map(s => <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>)}
        </TextField>
      </EntityFormDialog>

      {/* ══════ Confirm Dialogs ══════ */}
      <ConfirmDialog open={!!delSup} title="Удалить поставщика" message={`Удалить «${delSup?.name}»?`}
        onConfirm={removeSup} onCancel={() => setDelSup(null)} />
      <ConfirmDialog open={!!delOrd} title="Удалить заказ" message={`Удалить заказ №${delOrd?.number}?`}
        onConfirm={removeOrd} onCancel={() => setDelOrd(null)} />
      <ConfirmDialog open={!!delSn} title="Удалить номенклатуру" message={`Удалить «${delSn?.nomenclature_name}»?`}
        onConfirm={removeSn} onCancel={() => setDelSn(null)} />
      <ConfirmDialog open={!!delCl} title="Удалить претензию" message="Удалить эту претензию?"
        onConfirm={removeCl} onCancel={() => setDelCl(null)} />

      {/* ══════ Receive Shipment Dialog ══════ */}
      <EntityFormDialog
        open={receiveDlg}
        title={`Принять поставку №${receiveOrd?.number || ''}`}
        onClose={() => setReceiveDlg(false)}
        onSubmit={receiveOrder}
        loading={receiving}
        submitText="Принять на склад"
      >
        <Grid container spacing={2}>
          <Grid size={12}>
            <TextField
              select fullWidth label="Склад приёмки" value={receiveWh}
              onChange={e => setReceiveWh(e.target.value)}
            >
              {warehouses.map(w => <MenuItem key={w.id} value={w.id}>{w.name}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid size={12}>
            <FormControlLabel
              control={<Switch checked={receiveDebt} onChange={e => setReceiveDebt(e.target.checked)} />}
              label="Создать долг поставщику"
            />
          </Grid>
          {receiveOrd?.items && receiveOrd.items.length > 0 && (
            <Grid size={12}>
              <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Позиции:</Typography>
              {receiveOrd.items.map((it, i) => (
                <Typography key={i} variant="body2" color="text.secondary">
                  {it.nomenclature_name || nomItems.find(n => n.id === it.nomenclature)?.name || it.nomenclature} — {it.quantity} шт. × {Number(it.price).toLocaleString('ru-RU')} ₽
                </Typography>
              ))}
            </Grid>
          )}
        </Grid>
      </EntityFormDialog>
    </Box>
  )
}
