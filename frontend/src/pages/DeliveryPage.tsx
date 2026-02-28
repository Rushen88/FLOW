import { useState, useEffect, useCallback } from 'react'
import {
  Box, Typography, TextField, Button, Tab, Tabs, Chip, MenuItem,
  Switch, FormControlLabel, IconButton,
} from '@mui/material'
import Grid from '@mui/material/Grid2'
import { Add, Edit, Delete } from '@mui/icons-material'
import api from '../api'
import { useAuth } from '../contexts/AuthContext'
import { useNotification } from '../contexts/NotificationContext'
import extractError from '../utils/extractError'
import DataTable from '../components/DataTable'
import EntityFormDialog from '../components/EntityFormDialog'
import ConfirmDialog from '../components/ConfirmDialog'

// ─── Types ───
interface DeliveryZone {
  id: string; organization: string; name: string; price: string; free_from: string
  estimated_minutes: number; description: string; is_active: boolean
}
interface Courier {
  id: string; organization: string; employee: string; name: string; phone: string
  courier_type: string; vehicle: string; delivery_rate: string; is_available: boolean; is_active: boolean
}
interface Delivery {
  id: string; organization: string; order: string; courier: string; zone: string
  status: string; address: string; recipient_name: string; recipient_phone: string
  delivery_date: string; time_from: string; time_to: string; actual_delivery_time: string
  cost: string; courier_payment: string; photo_proof: string; notes: string
  created_at: string; updated_at: string; courier_name: string; zone_name: string
}

// ─── Constants ───
const COURIER_TYPES = [
  { value: 'internal', label: 'Штатный', color: 'primary' as const },
  { value: 'external', label: 'Внешний', color: 'warning' as const },
  { value: 'service', label: 'Сервис доставки', color: 'info' as const },
]
const STATUSES = [
  { value: 'pending', label: 'Ожидает', color: 'default' as const },
  { value: 'assigned', label: 'Назначена', color: 'info' as const },
  { value: 'picked_up', label: 'Забран', color: 'primary' as const },
  { value: 'in_transit', label: 'В пути', color: 'warning' as const },
  { value: 'delivered', label: 'Доставлен', color: 'success' as const },
  { value: 'failed', label: 'Неудача', color: 'error' as const },
  { value: 'cancelled', label: 'Отменена', color: 'default' as const },
]

const fmtDate = (v: string) => v ? new Date(v).toLocaleDateString('ru-RU') : '—'
const fmtCur = (v: string | number) =>
  v != null ? parseFloat(String(v)).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ₽' : '—'
const chipFromList = (list: { value: string; label: string; color: any }[], v: string) => {
  const t = list.find(x => x.value === v)
  return <Chip label={t?.label || v} size="small" color={t?.color || 'default'} />
}
const boolChip = (v: boolean) => <Chip label={v ? 'Да' : 'Нет'} size="small" color={v ? 'success' : 'default'} />

// ─── Default forms ───
const defaultDeliveryForm = () => ({
  order: '', courier: '', zone: '', status: 'pending', address: '', recipient_name: '',
  recipient_phone: '', delivery_date: '', time_from: '', time_to: '', cost: '', courier_payment: '', notes: '',
})
const defaultCourierForm = () => ({
  name: '', phone: '', courier_type: 'internal', vehicle: '', delivery_rate: '', is_available: true, is_active: true,
})
const defaultZoneForm = () => ({
  name: '', price: '', free_from: '', estimated_minutes: '', description: '', is_active: true,
})

export default function DeliveryPage() {
  const { notify } = useNotification()
  const { user } = useAuth()
  const [tab, setTab] = useState(0)


  // ══════════════════ Tab 0: Доставки ══════════════════
  const [deliveries, setDeliveries] = useState<Delivery[]>([])
  const [delLoad, setDelLoad] = useState(false)
  const [delDlg, setDelDlg] = useState(false)
  const [editDel, setEditDel] = useState<Delivery | null>(null)
  const [delForm, setDelForm] = useState(defaultDeliveryForm())
  const [delSaving, setDelSaving] = useState(false)
  const [rmDel, setRmDel] = useState<Delivery | null>(null)
  const [fStatus, setFStatus] = useState('')
  const [fCourier, setFCourier] = useState('')

  const fetchDeliveries = useCallback(() => {
    setDelLoad(true)
    const params: Record<string, string> = {}
    if (fStatus) params.status = fStatus
    if (fCourier) params.courier = fCourier
    api.get('/delivery/deliveries/', { params })
      .then(r => setDeliveries(r.data.results || r.data || []))
      .catch((err) => notify(extractError(err, 'Ошибка загрузки доставок'), 'error'))
      .finally(() => setDelLoad(false))
  }, [notify, fStatus, fCourier, user?.active_trading_point])

  useEffect(() => { fetchDeliveries() }, [fetchDeliveries])

  const openDelDlg = (d?: Delivery) => {
    if (d) {
      setEditDel(d)
      setDelForm({
        order: d.order || '', courier: d.courier || '', zone: d.zone || '', status: d.status,
        address: d.address, recipient_name: d.recipient_name, recipient_phone: d.recipient_phone,
        delivery_date: d.delivery_date || '', time_from: d.time_from || '', time_to: d.time_to || '',
        cost: d.cost || '', courier_payment: d.courier_payment || '', notes: d.notes || '',
      })
    } else { setEditDel(null); setDelForm(defaultDeliveryForm()) }
    setDelDlg(true)
  }
  const saveDel = async () => {
    setDelSaving(true)
    try {
      const d: Record<string, any> = { ...delForm }
      if (!d.order) d.order = null
      if (!d.courier) d.courier = null
      if (!d.zone) d.zone = null
      if (!d.time_from) d.time_from = null
      if (!d.time_to) d.time_to = null
      if (editDel) { await api.patch(`/delivery/deliveries/${editDel.id}/`, d); notify('Доставка обновлена') }
      else { await api.post('/delivery/deliveries/', d); notify('Доставка создана') }
      setDelDlg(false); fetchDeliveries()
    } catch (err) { notify(extractError(err, 'Ошибка сохранения'), 'error') }
    setDelSaving(false)
  }
  const removeDel = async () => {
    if (!rmDel) return
    try { await api.delete(`/delivery/deliveries/${rmDel.id}/`); notify('Доставка удалена'); setRmDel(null); fetchDeliveries() }
    catch (err) { notify(extractError(err, 'Ошибка удаления'), 'error') }
  }

  // ══════════════════ Tab 1: Курьеры ══════════════════
  const [couriers, setCouriers] = useState<Courier[]>([])
  const [crLoad, setCrLoad] = useState(false)
  const [crDlg, setCrDlg] = useState(false)
  const [editCr, setEditCr] = useState<Courier | null>(null)
  const [crForm, setCrForm] = useState(defaultCourierForm())
  const [crSaving, setCrSaving] = useState(false)
  const [rmCr, setRmCr] = useState<Courier | null>(null)

  const fetchCouriers = useCallback(() => {
    setCrLoad(true)
    api.get('/delivery/couriers/')
      .then(r => setCouriers(r.data.results || r.data || []))
      .catch((err) => notify(extractError(err, 'Ошибка загрузки курьеров'), 'error'))
      .finally(() => setCrLoad(false))
  }, [notify])

  useEffect(() => { if (tab === 1) fetchCouriers() }, [tab, fetchCouriers])
  // also fetch couriers for delivery dialog selectors
  useEffect(() => { if (couriers.length === 0) fetchCouriers() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const openCrDlg = (c?: Courier) => {
    if (c) {
      setEditCr(c)
      setCrForm({
        name: c.name, phone: c.phone, courier_type: c.courier_type, vehicle: c.vehicle || '',
        delivery_rate: c.delivery_rate || '', is_available: c.is_available, is_active: c.is_active,
      })
    } else { setEditCr(null); setCrForm(defaultCourierForm()) }
    setCrDlg(true)
  }
  const saveCr = async () => {
    setCrSaving(true)
    try {
      const d: Record<string, any> = { ...crForm }
      if (!d.delivery_rate) d.delivery_rate = null
      if (editCr) { await api.patch(`/delivery/couriers/${editCr.id}/`, d); notify('Курьер обновлён') }
      else { await api.post('/delivery/couriers/', d); notify('Курьер создан') }
      setCrDlg(false); fetchCouriers()
    } catch (err) { notify(extractError(err, 'Ошибка сохранения'), 'error') }
    setCrSaving(false)
  }
  const removeCr = async () => {
    if (!rmCr) return
    try { await api.delete(`/delivery/couriers/${rmCr.id}/`); notify('Курьер удалён'); setRmCr(null); fetchCouriers() }
    catch (err) { notify(extractError(err, 'Ошибка удаления'), 'error') }
  }

  // ══════════════════ Tab 2: Зоны доставки ══════════════════
  const [zones, setZones] = useState<DeliveryZone[]>([])
  const [znLoad, setZnLoad] = useState(false)
  const [znDlg, setZnDlg] = useState(false)
  const [editZn, setEditZn] = useState<DeliveryZone | null>(null)
  const [znForm, setZnForm] = useState(defaultZoneForm())
  const [znSaving, setZnSaving] = useState(false)
  const [rmZn, setRmZn] = useState<DeliveryZone | null>(null)

  const fetchZones = useCallback(() => {
    setZnLoad(true)
    api.get('/delivery/zones/')
      .then(r => setZones(r.data.results || r.data || []))
      .catch((err) => notify(extractError(err, 'Ошибка загрузки зон'), 'error'))
      .finally(() => setZnLoad(false))
  }, [notify])

  useEffect(() => { if (tab === 2) fetchZones() }, [tab, fetchZones])
  useEffect(() => { if (zones.length === 0) fetchZones() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const openZnDlg = (z?: DeliveryZone) => {
    if (z) {
      setEditZn(z)
      setZnForm({
        name: z.name, price: z.price || '', free_from: z.free_from || '',
        estimated_minutes: z.estimated_minutes != null ? String(z.estimated_minutes) : '',
        description: z.description || '', is_active: z.is_active,
      })
    } else { setEditZn(null); setZnForm(defaultZoneForm()) }
    setZnDlg(true)
  }
  const saveZn = async () => {
    setZnSaving(true)
    try {
      const d: Record<string, any> = { ...znForm }
      if (!d.free_from) d.free_from = null
      if (!d.estimated_minutes) d.estimated_minutes = null
      if (editZn) { await api.patch(`/delivery/zones/${editZn.id}/`, d); notify('Зона обновлена') }
      else { await api.post('/delivery/zones/', d); notify('Зона создана') }
      setZnDlg(false); fetchZones()
    } catch (err) { notify(extractError(err, 'Ошибка сохранения'), 'error') }
    setZnSaving(false)
  }
  const removeZn = async () => {
    if (!rmZn) return
    try { await api.delete(`/delivery/zones/${rmZn.id}/`); notify('Зона удалена'); setRmZn(null); fetchZones() }
    catch (err) { notify(extractError(err, 'Ошибка удаления'), 'error') }
  }

  // ═══════════════════ RENDER ═══════════════════
  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 3 }}>Доставка</Typography>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3 }}>
        <Tab label="Доставки" />
        <Tab label="Курьеры" />
        <Tab label="Зоны доставки" />
      </Tabs>

      {/* ──────── Tab 0: Доставки ──────── */}
      {tab === 0 && (
        <>
          <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
            <TextField select label="Статус" size="small" sx={{ minWidth: 160 }}
              value={fStatus} onChange={e => setFStatus(e.target.value)}>
              <MenuItem value="">Все</MenuItem>
              {STATUSES.map(s => <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>)}
            </TextField>
            <TextField select label="Курьер" size="small" sx={{ minWidth: 180 }}
              value={fCourier} onChange={e => setFCourier(e.target.value)}>
              <MenuItem value="">Все</MenuItem>
              {couriers.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
            </TextField>
          </Box>
          <DataTable
            columns={[
              { key: 'delivery_date', label: 'Дата', render: (v: string) => fmtDate(v) },
              { key: 'status', label: 'Статус', render: (v: string) => chipFromList(STATUSES, v) },
              { key: 'courier_name', label: 'Курьер' },
              { key: 'zone_name', label: 'Зона' },
              { key: 'address', label: 'Адрес', render: (v: string) => v && v.length > 30 ? v.slice(0, 30) + '…' : (v || '—') },
              { key: 'recipient_name', label: 'Получатель' },
              { key: 'recipient_phone', label: 'Телефон' },
              { key: 'cost', label: 'Стоимость', align: 'right', render: (v: string) => fmtCur(v) },
              { key: 'time_from', label: 'Время', render: (_: any, r: Delivery) =>
                r.time_from && r.time_to ? `${r.time_from.slice(0, 5)}–${r.time_to.slice(0, 5)}` : '—' },
              { key: '_actions', label: '', align: 'right', render: (_: any, r: Delivery) => (
                <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                  <IconButton size="small" onClick={() => openDelDlg(r)}><Edit fontSize="small" /></IconButton>
                  <IconButton size="small" onClick={() => setRmDel(r)}><Delete fontSize="small" /></IconButton>
                </Box>
              )},
            ]}
            rows={deliveries} loading={delLoad}
            headerActions={<Button startIcon={<Add />} variant="contained" onClick={() => openDelDlg()}>Добавить</Button>}
          />
          <EntityFormDialog open={delDlg} onClose={() => setDelDlg(false)} onSubmit={saveDel}
            title={editDel ? 'Редактировать доставку' : 'Новая доставка'} loading={delSaving} maxWidth="md">
            <Grid container spacing={2}>
              <Grid size={6}>
                <TextField fullWidth label="Заказ" size="small" value={delForm.order}
                  onChange={e => setDelForm({ ...delForm, order: e.target.value })} />
              </Grid>
              <Grid size={6}>
                <TextField fullWidth select label="Курьер" size="small" value={delForm.courier}
                  onChange={e => setDelForm({ ...delForm, courier: e.target.value })}>
                  <MenuItem value="">— Не выбран —</MenuItem>
                  {couriers.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
                </TextField>
              </Grid>
              <Grid size={6}>
                <TextField fullWidth select label="Зона" size="small" value={delForm.zone}
                  onChange={e => setDelForm({ ...delForm, zone: e.target.value })}>
                  <MenuItem value="">— Не выбрана —</MenuItem>
                  {zones.map(z => <MenuItem key={z.id} value={z.id}>{z.name}</MenuItem>)}
                </TextField>
              </Grid>
              <Grid size={6}>
                <TextField fullWidth select label="Статус" size="small" value={delForm.status}
                  onChange={e => setDelForm({ ...delForm, status: e.target.value })}>
                  {STATUSES.map(s => <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>)}
                </TextField>
              </Grid>
              <Grid size={12}>
                <TextField fullWidth label="Адрес" size="small" value={delForm.address}
                  onChange={e => setDelForm({ ...delForm, address: e.target.value })} />
              </Grid>
              <Grid size={6}>
                <TextField fullWidth label="Имя получателя" size="small" value={delForm.recipient_name}
                  onChange={e => setDelForm({ ...delForm, recipient_name: e.target.value })} />
              </Grid>
              <Grid size={6}>
                <TextField fullWidth label="Телефон получателя" size="small" value={delForm.recipient_phone}
                  onChange={e => setDelForm({ ...delForm, recipient_phone: e.target.value })} />
              </Grid>
              <Grid size={4}>
                <TextField fullWidth label="Дата доставки" size="small" type="date" slotProps={{ inputLabel: { shrink: true } }}
                  value={delForm.delivery_date} onChange={e => setDelForm({ ...delForm, delivery_date: e.target.value })} />
              </Grid>
              <Grid size={4}>
                <TextField fullWidth label="Время с" size="small" type="time" slotProps={{ inputLabel: { shrink: true } }}
                  value={delForm.time_from} onChange={e => setDelForm({ ...delForm, time_from: e.target.value })} />
              </Grid>
              <Grid size={4}>
                <TextField fullWidth label="Время до" size="small" type="time" slotProps={{ inputLabel: { shrink: true } }}
                  value={delForm.time_to} onChange={e => setDelForm({ ...delForm, time_to: e.target.value })} />
              </Grid>
              <Grid size={6}>
                <TextField fullWidth label="Стоимость" size="small" type="number" value={delForm.cost}
                  onChange={e => setDelForm({ ...delForm, cost: e.target.value })} />
              </Grid>
              <Grid size={6}>
                <TextField fullWidth label="Оплата курьеру" size="small" type="number" value={delForm.courier_payment}
                  onChange={e => setDelForm({ ...delForm, courier_payment: e.target.value })} />
              </Grid>
              <Grid size={12}>
                <TextField fullWidth label="Примечания" size="small" multiline rows={2} value={delForm.notes}
                  onChange={e => setDelForm({ ...delForm, notes: e.target.value })} />
              </Grid>
            </Grid>
          </EntityFormDialog>
          <ConfirmDialog open={!!rmDel} title="Удалить доставку?" message="Запись будет удалена без возможности восстановления."
            onConfirm={removeDel} onCancel={() => setRmDel(null)} />
        </>
      )}

      {/* ──────── Tab 1: Курьеры ──────── */}
      {tab === 1 && (
        <>
          <DataTable
            columns={[
              { key: 'name', label: 'Имя', render: (v: string) => <Typography fontWeight={600}>{v}</Typography> },
              { key: 'phone', label: 'Телефон' },
              { key: 'courier_type', label: 'Тип', render: (v: string) => chipFromList(COURIER_TYPES, v) },
              { key: 'vehicle', label: 'Транспорт' },
              { key: 'delivery_rate', label: 'Ставка', align: 'right', render: (v: string) => fmtCur(v) },
              { key: 'is_available', label: 'Доступен', render: (v: boolean) => boolChip(v) },
              { key: 'is_active', label: 'Активен', render: (v: boolean) => boolChip(v) },
              { key: '_actions', label: '', align: 'right', render: (_: any, r: Courier) => (
                <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                  <IconButton size="small" onClick={() => openCrDlg(r)}><Edit fontSize="small" /></IconButton>
                  <IconButton size="small" onClick={() => setRmCr(r)}><Delete fontSize="small" /></IconButton>
                </Box>
              )},
            ]}
            rows={couriers} loading={crLoad}
            headerActions={<Button startIcon={<Add />} variant="contained" onClick={() => openCrDlg()}>Добавить</Button>}
          />
          <EntityFormDialog open={crDlg} onClose={() => setCrDlg(false)} onSubmit={saveCr}
            title={editCr ? 'Редактировать курьера' : 'Новый курьер'} loading={crSaving}>
            <Grid container spacing={2}>
              <Grid size={6}>
                <TextField fullWidth label="Имя" size="small" value={crForm.name}
                  onChange={e => setCrForm({ ...crForm, name: e.target.value })} />
              </Grid>
              <Grid size={6}>
                <TextField fullWidth label="Телефон" size="small" value={crForm.phone}
                  onChange={e => setCrForm({ ...crForm, phone: e.target.value })} />
              </Grid>
              <Grid size={6}>
                <TextField fullWidth select label="Тип курьера" size="small" value={crForm.courier_type}
                  onChange={e => setCrForm({ ...crForm, courier_type: e.target.value })}>
                  {COURIER_TYPES.map(t => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
                </TextField>
              </Grid>
              <Grid size={6}>
                <TextField fullWidth label="Транспорт" size="small" value={crForm.vehicle}
                  onChange={e => setCrForm({ ...crForm, vehicle: e.target.value })} />
              </Grid>
              <Grid size={12}>
                <TextField fullWidth label="Ставка доставки" size="small" type="number" value={crForm.delivery_rate}
                  onChange={e => setCrForm({ ...crForm, delivery_rate: e.target.value })} />
              </Grid>
              <Grid size={6}>
                <FormControlLabel label="Доступен" control={
                  <Switch checked={crForm.is_available} onChange={e => setCrForm({ ...crForm, is_available: e.target.checked })} />
                } />
              </Grid>
              <Grid size={6}>
                <FormControlLabel label="Активен" control={
                  <Switch checked={crForm.is_active} onChange={e => setCrForm({ ...crForm, is_active: e.target.checked })} />
                } />
              </Grid>
            </Grid>
          </EntityFormDialog>
          <ConfirmDialog open={!!rmCr} title="Удалить курьера?" message="Запись будет удалена без возможности восстановления."
            onConfirm={removeCr} onCancel={() => setRmCr(null)} />
        </>
      )}

      {/* ──────── Tab 2: Зоны доставки ──────── */}
      {tab === 2 && (
        <>
          <DataTable
            columns={[
              { key: 'name', label: 'Название' },
              { key: 'price', label: 'Цена', align: 'right', render: (v: string) => fmtCur(v) },
              { key: 'free_from', label: 'Бесплатно от', align: 'right', render: (v: string) => v ? fmtCur(v) : '—' },
              { key: 'estimated_minutes', label: 'Время (мин)', align: 'right', render: (v: number) => v != null ? `${v} мин` : '—' },
              { key: 'is_active', label: 'Активна', render: (v: boolean) => boolChip(v) },
              { key: '_actions', label: '', align: 'right', render: (_: any, r: DeliveryZone) => (
                <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                  <IconButton size="small" onClick={() => openZnDlg(r)}><Edit fontSize="small" /></IconButton>
                  <IconButton size="small" onClick={() => setRmZn(r)}><Delete fontSize="small" /></IconButton>
                </Box>
              )},
            ]}
            rows={zones} loading={znLoad}
            headerActions={<Button startIcon={<Add />} variant="contained" onClick={() => openZnDlg()}>Добавить</Button>}
          />
          <EntityFormDialog open={znDlg} onClose={() => setZnDlg(false)} onSubmit={saveZn}
            title={editZn ? 'Редактировать зону' : 'Новая зона'} loading={znSaving}>
            <Grid container spacing={2}>
              <Grid size={12}>
                <TextField fullWidth label="Название" size="small" value={znForm.name}
                  onChange={e => setZnForm({ ...znForm, name: e.target.value })} />
              </Grid>
              <Grid size={6}>
                <TextField fullWidth label="Цена" size="small" type="number" value={znForm.price}
                  onChange={e => setZnForm({ ...znForm, price: e.target.value })} />
              </Grid>
              <Grid size={6}>
                <TextField fullWidth label="Бесплатно от" size="small" type="number" value={znForm.free_from}
                  onChange={e => setZnForm({ ...znForm, free_from: e.target.value })} />
              </Grid>
              <Grid size={12}>
                <TextField fullWidth label="Время доставки (мин)" size="small" type="number" value={znForm.estimated_minutes}
                  onChange={e => setZnForm({ ...znForm, estimated_minutes: e.target.value })} />
              </Grid>
              <Grid size={12}>
                <TextField fullWidth label="Описание" size="small" multiline rows={2} value={znForm.description}
                  onChange={e => setZnForm({ ...znForm, description: e.target.value })} />
              </Grid>
              <Grid size={12}>
                <FormControlLabel label="Активна" control={
                  <Switch checked={znForm.is_active} onChange={e => setZnForm({ ...znForm, is_active: e.target.checked })} />
                } />
              </Grid>
            </Grid>
          </EntityFormDialog>
          <ConfirmDialog open={!!rmZn} title="Удалить зону?" message="Запись будет удалена без возможности восстановления."
            onConfirm={removeZn} onCancel={() => setRmZn(null)} />
        </>
      )}
    </Box>
  )
}
