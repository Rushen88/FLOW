import { useState, useEffect, useCallback } from 'react'
import {
  Box, Card, CardContent, Typography, TextField, Button,
  Tab, Tabs, IconButton, Chip, MenuItem, Switch, FormControlLabel,
  Alert,
} from '@mui/material'
import Grid from '@mui/material/Grid2'
import { Add, Edit, Delete, Save, Store, Warehouse, CreditCard, Business } from '@mui/icons-material'
import api from '../api'
import { useAuth } from '../contexts/AuthContext'
import { useNotification } from '../contexts/NotificationContext'
import extractError from '../utils/extractError'
import DataTable from '../components/DataTable'
import EntityFormDialog from '../components/EntityFormDialog'
import ConfirmDialog from '../components/ConfirmDialog'

interface Organization { id: string; name: string; inn: string; phone: string; email: string }
interface TradingPoint { id: string; organization: string; name: string; address: string; phone: string; work_schedule: string; manager: string | null; is_active: boolean }
interface WarehouseT { id: string; organization: string; trading_point: string; trading_point_name?: string; name: string; warehouse_type: string; responsible: string | null; is_default_for_bouquets: boolean; is_default_for_receiving: boolean; is_default_for_sales: boolean; notes: string; is_active: boolean }
interface PaymentMethod { id: string; organization: string; name: string; is_cash: boolean; commission_percent: string; wallet: string | null; wallet_name: string; is_active: boolean }
interface CashierCategory { id: string; name: string; icon: string; sort_order: number; is_visible_in_cashier: boolean; source_type: string; is_system: boolean; group_ids: string[] }
interface NomenclatureGroupRef { id: string; name: string; parent: string | null }
const WH_TYPES = [
  { value: 'main', label: 'Основной' },
  { value: 'showcase', label: 'Витрина' },
  { value: 'fridge', label: 'Холодильник' },
  { value: 'assembly', label: 'Сборка' },
  { value: 'reserve', label: 'Резерв' },
]
const CASHIER_SOURCE_TYPES = [
  { value: 'nomenclature', label: 'Номенклатура' },
  { value: 'finished_bouquets', label: 'Готовые букеты' },
  { value: 'reserve', label: 'Резерв' },
]

export default function SettingsPage() {
  const { user, refreshUser } = useAuth()
  const { notify } = useNotification()
  const [tab, setTab] = useState(0)

  const isOwnerOrAdmin = user?.is_superuser || user?.role === 'owner' || user?.role === 'admin'

  // ─── Organization ───
  const [org, setOrg] = useState<Organization | null>(null)
  const [orgForm, setOrgForm] = useState({ name: '', inn: '', phone: '', email: '' })
  const [orgLoading, setOrgLoading] = useState(false)

  const fetchOrg = useCallback(() => {
    api.get('/core/organizations/').then(res => {
      const list = res.data.results || res.data || []
      if (list.length > 0) {
        setOrg(list[0])
        setOrgForm({ name: list[0].name, inn: list[0].inn || '', phone: list[0].phone || '', email: list[0].email || '' })
      }
    })
  }, [])

  useEffect(() => { fetchOrg() }, [fetchOrg])

  const saveOrg = async () => {
    setOrgLoading(true)
    try {
      if (org) {
        await api.patch(`/core/organizations/${org.id}/`, orgForm)
        notify('Организация обновлена')
      } else {
        await api.post('/core/organizations/', orgForm)
        notify('Организация создана')
        await refreshUser()
      }
      fetchOrg()
    } catch (err) { notify(extractError(err, 'Ошибка сохранения'), 'error') }
    setOrgLoading(false)
  }

  // ─── Trading Points ───
  const [points, setPoints] = useState<TradingPoint[]>([])
  const [ptLoad, setPtLoad] = useState(false)
  const [ptDlg, setPtDlg] = useState(false)
  const [editPt, setEditPt] = useState<TradingPoint | null>(null)
  const [ptForm, setPtForm] = useState({ name: '', address: '', phone: '', work_schedule: '' })
  const [delPt, setDelPt] = useState<TradingPoint | null>(null)

  const fetchPoints = useCallback(() => {
    setPtLoad(true)
    api.get('/core/trading-points/').then(res => setPoints(res.data.results || res.data || [])).finally(() => setPtLoad(false))
  }, [])

  useEffect(() => { if (tab === 0) fetchPoints() }, [tab, fetchPoints])

  const openPtDlg = (pt?: TradingPoint) => {
    if (pt) { setEditPt(pt); setPtForm({ name: pt.name, address: pt.address || '', phone: pt.phone || '', work_schedule: pt.work_schedule || '' }) }
    else { setEditPt(null); setPtForm({ name: '', address: '', phone: '', work_schedule: '' }) }
    setPtDlg(true)
  }

  const savePt = async () => {
    try {
      if (editPt) { await api.patch(`/core/trading-points/${editPt.id}/`, ptForm); notify('Точка обновлена') }
      else { await api.post('/core/trading-points/', ptForm); notify('Точка создана') }
      setPtDlg(false); fetchPoints()
    } catch (err) { notify(extractError(err, 'Ошибка сохранения'), 'error') }
  }

  const removePt = async () => {
    if (!delPt) return
    try { await api.delete(`/core/trading-points/${delPt.id}/`); notify('Точка удалена'); setDelPt(null); fetchPoints() }
    catch (err) { notify(extractError(err, 'Ошибка удаления'), 'error') }
  }

  // ─── Warehouses ───
  const [whs, setWhs] = useState<WarehouseT[]>([])
  const [whLoad, setWhLoad] = useState(false)
  const [whDlg, setWhDlg] = useState(false)
  const [editWh, setEditWh] = useState<WarehouseT | null>(null)
  const [whForm, setWhForm] = useState({ name: '', warehouse_type: 'main', trading_point: '', notes: '', is_default_for_bouquets: false, is_default_for_receiving: false, is_default_for_sales: false })
  const [delWh, setDelWh] = useState<WarehouseT | null>(null)

  const fetchWhs = useCallback(() => {
    setWhLoad(true)
    api.get('/core/warehouses/').then(res => setWhs(res.data.results || res.data || [])).finally(() => setWhLoad(false))
  }, [])

  useEffect(() => { if (tab === 1) { fetchWhs(); fetchPoints() } }, [tab, fetchWhs, fetchPoints])

  const openWhDlg = (w?: WarehouseT) => {
    if (w) { setEditWh(w); setWhForm({ name: w.name, warehouse_type: w.warehouse_type, trading_point: w.trading_point, notes: w.notes || '', is_default_for_bouquets: w.is_default_for_bouquets, is_default_for_receiving: w.is_default_for_receiving, is_default_for_sales: w.is_default_for_sales }) }
    else { setEditWh(null); setWhForm({ name: '', warehouse_type: 'main', trading_point: points[0]?.id || '', notes: '', is_default_for_bouquets: false, is_default_for_receiving: false, is_default_for_sales: false }) }
    setWhDlg(true)
  }

  const warehouseDefaultConflicts = whs.filter(w =>
    w.trading_point === whForm.trading_point &&
    w.id !== editWh?.id && (
      (whForm.is_default_for_receiving && w.is_default_for_receiving)
      || (whForm.is_default_for_bouquets && w.is_default_for_bouquets)
      || (whForm.is_default_for_sales && w.is_default_for_sales)
    )
  )

  const defaultConflictLabels = [
    whForm.is_default_for_receiving && warehouseDefaultConflicts.some(w => w.is_default_for_receiving) ? 'приёмки' : '',
    whForm.is_default_for_bouquets && warehouseDefaultConflicts.some(w => w.is_default_for_bouquets) ? 'букетов' : '',
    whForm.is_default_for_sales && warehouseDefaultConflicts.some(w => w.is_default_for_sales) ? 'продаж' : '',
  ].filter(Boolean)

  const saveWh = async () => {
    try {
      if (defaultConflictLabels.length) {
        const tpName = points.find(p => p.id === whForm.trading_point)?.name || 'выбранной точке'
        const confirmed = window.confirm(`Для ${defaultConflictLabels.join(', ')} будет заменён текущий склад по умолчанию в ${tpName}. Продолжить?`)
        if (!confirmed) return
      }
      if (editWh) { await api.patch(`/core/warehouses/${editWh.id}/`, whForm); notify('Склад обновлён') }
      else { await api.post('/core/warehouses/', whForm); notify('Склад создан') }
      setWhDlg(false); fetchWhs()
    } catch (err) { notify(extractError(err, 'Ошибка сохранения'), 'error') }
  }

  const removeWh = async () => {
    if (!delWh) return
    try { await api.delete(`/core/warehouses/${delWh.id}/`); notify('Склад удалён'); setDelWh(null); fetchWhs() }
    catch (err) { notify(extractError(err, 'Ошибка удаления'), 'error') }
  }

  // ─── Payment Methods ───
  const [pms, setPms] = useState<PaymentMethod[]>([])
  const [pmLoad, setPmLoad] = useState(false)
  const [pmDlg, setPmDlg] = useState(false)
  const [editPm, setEditPm] = useState<PaymentMethod | null>(null)
  const [pmForm, setPmForm] = useState({ name: '', is_cash: true, commission_percent: '0', wallet: '' })
  const [delPm, setDelPm] = useState<PaymentMethod | null>(null)
  const [wallets, setWallets] = useState<{id: string; name: string}[]>([])

  // ─── Cashier Categories ───
  const [cashierCats, setCashierCats] = useState<CashierCategory[]>([])
  const [cashierCatLoad, setCashierCatLoad] = useState(false)
  const [cashierCatDlg, setCashierCatDlg] = useState(false)
  const [editCashierCat, setEditCashierCat] = useState<CashierCategory | null>(null)
  const [cashierCatForm, setCashierCatForm] = useState({ name: '', icon: '', sort_order: '10', is_visible_in_cashier: true, source_type: 'nomenclature', group_ids: [] as string[] })
  const [delCashierCat, setDelCashierCat] = useState<CashierCategory | null>(null)
  const [nomGroups, setNomGroups] = useState<NomenclatureGroupRef[]>([])

  const fetchPms = useCallback(() => {
    setPmLoad(true)
    api.get('/core/payment-methods/').then(res => setPms(res.data.results || res.data || [])).finally(() => setPmLoad(false))
  }, [])

  useEffect(() => { if (tab === 2) { fetchPms(); api.get('/finance/wallets/').then(res => setWallets(res.data.results || res.data || [])) } }, [tab, fetchPms])

  const fetchCashierCats = useCallback(() => {
    setCashierCatLoad(true)
    api.get('/cashier/categories/').then(res => setCashierCats(res.data.results || res.data || [])).finally(() => setCashierCatLoad(false))
  }, [])

  const fetchNomGroups = useCallback(() => {
    api.get('/nomenclature/groups/').then(res => setNomGroups(res.data.results || res.data || []))
  }, [])

  useEffect(() => {
    if (tab === 3) {
      fetchCashierCats()
      fetchNomGroups()
    }
  }, [tab, fetchCashierCats, fetchNomGroups])

  const openPmDlg = (pm?: PaymentMethod) => {
    if (pm) { setEditPm(pm); setPmForm({ name: pm.name, is_cash: pm.is_cash, commission_percent: pm.commission_percent, wallet: pm.wallet || '' }) }
    else { setEditPm(null); setPmForm({ name: '', is_cash: true, commission_percent: '0', wallet: '' }) }
    setPmDlg(true)
  }

  const savePm = async () => {
    try {
      const pmData = { ...pmForm, wallet: pmForm.wallet || null }
      if (editPm) { await api.patch(`/core/payment-methods/${editPm.id}/`, pmData); notify('Способ оплаты обновлён') }
      else { await api.post('/core/payment-methods/', pmData); notify('Способ оплаты создан') }
      setPmDlg(false); fetchPms()
    } catch (err) { notify(extractError(err, 'Ошибка сохранения'), 'error') }
  }

  const removePm = async () => {
    if (!delPm) return
    try { await api.delete(`/core/payment-methods/${delPm.id}/`); notify('Способ оплаты удалён'); setDelPm(null); fetchPms() }
    catch (err) { notify(extractError(err, 'Ошибка удаления'), 'error') }
  }

  const openCashierCatDlg = (category?: CashierCategory) => {
    if (category) {
      setEditCashierCat(category)
      setCashierCatForm({
        name: category.name,
        icon: category.icon || '',
        sort_order: String(category.sort_order ?? 10),
        is_visible_in_cashier: category.is_visible_in_cashier,
        source_type: category.source_type,
        group_ids: category.group_ids || [],
      })
    } else {
      setEditCashierCat(null)
      setCashierCatForm({ name: '', icon: '', sort_order: '10', is_visible_in_cashier: true, source_type: 'nomenclature', group_ids: [] })
    }
    setCashierCatDlg(true)
  }

  const saveCashierCat = async () => {
    try {
      const payload = {
        ...cashierCatForm,
        sort_order: Number(cashierCatForm.sort_order) || 0,
        group_ids: cashierCatForm.source_type === 'nomenclature' ? cashierCatForm.group_ids : [],
      }
      if (editCashierCat) {
        await api.patch(`/cashier/categories/${editCashierCat.id}/`, payload)
        notify('Категория кассы обновлена')
      } else {
        await api.post('/cashier/categories/', payload)
        notify('Категория кассы создана')
      }
      setCashierCatDlg(false)
      fetchCashierCats()
    } catch (err) { notify(extractError(err, 'Ошибка сохранения категории кассы'), 'error') }
  }

  const removeCashierCat = async () => {
    if (!delCashierCat) return
    try {
      await api.delete(`/cashier/categories/${delCashierCat.id}/`)
      notify('Категория кассы удалена')
      setDelCashierCat(null)
      fetchCashierCats()
    } catch (err) { notify(extractError(err, 'Ошибка удаления категории кассы'), 'error') }
  }

  return (
    <Box>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 3 }}>Настройки</Typography>
      <Card>
        <CardContent>
          <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}>
            <Tab icon={<Store />} iconPosition="start" label="Торговые точки" />
            <Tab icon={<Warehouse />} iconPosition="start" label="Склады" />
            <Tab icon={<CreditCard />} iconPosition="start" label="Способы оплаты" />
            <Tab icon={<Business />} iconPosition="start" label="Категории кассы" />
          </Tabs>

          {/* ═══ Trading Points Tab ═══ */}
          {tab === 0 && (
            <DataTable
              columns={[
                { key: 'name', label: 'Название', render: (v: string) => <Typography fontWeight={500}>{v}</Typography> },
                { key: 'address', label: 'Адрес' },
                { key: 'phone', label: 'Телефон' },
                { key: 'work_schedule', label: 'Режим работы' },
                { key: 'is_active', label: 'Статус', render: (v: boolean) => <Chip label={v ? 'Активна' : 'Неактивна'} size="small" color={v ? 'success' : 'default'} /> },
                ...(isOwnerOrAdmin ? [{ key: '_act', label: '', align: 'center' as const, width: 100, render: (_: any, row: TradingPoint) => (<>
                  <IconButton size="small" onClick={() => openPtDlg(row)}><Edit fontSize="small" /></IconButton>
                  <IconButton size="small" onClick={() => setDelPt(row)}><Delete fontSize="small" /></IconButton>
                </>) }] : []),
              ]}
              rows={points} loading={ptLoad} emptyText="Добавьте торговую точку"
              headerActions={isOwnerOrAdmin ?
                <Button variant="contained" startIcon={<Add />} onClick={() => openPtDlg()}>Добавить точку</Button>
                : undefined
              }
            />
          )}

          {/* ═══ Warehouses Tab ═══ */}
          {tab === 1 && (
            <DataTable
              columns={[
                { key: 'name', label: 'Название', render: (v: string) => <Typography fontWeight={500}>{v}</Typography> },
                { key: 'trading_point_name', label: 'Торговая точка' },
                { key: 'warehouse_type', label: 'Тип', render: (v: string) => <Chip label={WH_TYPES.find(t => t.value === v)?.label || v} size="small" variant="outlined" /> },
                { key: '_def', label: 'По умолчанию', render: (_: any, row: WarehouseT) => (<Box sx={{ display: 'flex', gap: 0.5 }}>
                  {row.is_default_for_receiving && <Chip label="Приёмка" size="small" color="primary" />}
                  {row.is_default_for_bouquets && <Chip label="Букеты" size="small" color="secondary" />}
                  {row.is_default_for_sales && <Chip label="Продажи" size="small" color="info" />}
                </Box>) },
                { key: 'is_active', label: 'Статус', render: (v: boolean) => <Chip label={v ? 'Активен' : 'Неактивен'} size="small" color={v ? 'success' : 'default'} /> },
                ...(isOwnerOrAdmin ? [{ key: '_act', label: '', align: 'center' as const, width: 100, render: (_: any, row: WarehouseT) => (<>
                  <IconButton size="small" onClick={() => openWhDlg(row)}><Edit fontSize="small" /></IconButton>
                  <IconButton size="small" onClick={() => setDelWh(row)}><Delete fontSize="small" /></IconButton>
                </>) }] : []),
              ]}
              rows={whs} loading={whLoad} emptyText="Добавьте склад"
              headerActions={isOwnerOrAdmin ?
                <Button variant="contained" startIcon={<Add />} onClick={() => openWhDlg()} disabled={!points.length}>Добавить склад</Button>
                : undefined
              }
            />
          )}

          {/* ═══ Payment Methods Tab ═══ */}
          {tab === 2 && (
            <DataTable
              columns={[
                { key: 'name', label: 'Название', render: (v: string) => <Typography fontWeight={500}>{v}</Typography> },
                { key: 'is_cash', label: 'Тип', render: (v: boolean) => <Chip label={v ? 'Наличные' : 'Безналичные'} size="small" variant="outlined" /> },
                { key: 'wallet_name', label: 'Кошелёк', render: (v: string) => v || '—' },
                { key: 'commission_percent', label: 'Комиссия', align: 'right' as const, render: (v: string) => `${v}%` },
                { key: 'is_active', label: 'Статус', render: (v: boolean) => <Chip label={v ? 'Активен' : 'Неактивен'} size="small" color={v ? 'success' : 'default'} /> },
                ...(isOwnerOrAdmin ? [{ key: '_act', label: '', align: 'center' as const, width: 100, render: (_: any, row: PaymentMethod) => (<>
                  <IconButton size="small" onClick={() => openPmDlg(row)}><Edit fontSize="small" /></IconButton>
                  <IconButton size="small" onClick={() => setDelPm(row)}><Delete fontSize="small" /></IconButton>
                </>) }] : []),
              ]}
              rows={pms} loading={pmLoad} emptyText="Добавьте способ оплаты"
              headerActions={isOwnerOrAdmin ?
                <Button variant="contained" startIcon={<Add />} onClick={() => openPmDlg()}>Добавить способ оплаты</Button>
                : undefined
              }
            />
          )}

          {tab === 3 && (
            <DataTable
              columns={[
                { key: 'name', label: 'Название', render: (v: string) => <Typography fontWeight={500}>{v}</Typography> },
                { key: 'source_type', label: 'Источник', render: (v: string) => <Chip label={CASHIER_SOURCE_TYPES.find(t => t.value === v)?.label || v} size="small" variant="outlined" /> },
                { key: 'sort_order', label: 'Порядок', align: 'right' as const },
                { key: 'is_visible_in_cashier', label: 'Видимость', render: (v: boolean) => <Chip label={v ? 'Показывается' : 'Скрыта'} size="small" color={v ? 'success' : 'default'} /> },
                { key: 'is_system', label: 'Тип', render: (v: boolean) => <Chip label={v ? 'Системная' : 'Пользовательская'} size="small" color={v ? 'info' : 'default'} /> },
                ...(isOwnerOrAdmin ? [{ key: '_act', label: '', align: 'center' as const, width: 120, render: (_: any, row: CashierCategory) => (<>
                  <IconButton size="small" onClick={() => openCashierCatDlg(row)}><Edit fontSize="small" /></IconButton>
                  {!row.is_system && <IconButton size="small" onClick={() => setDelCashierCat(row)}><Delete fontSize="small" /></IconButton>}
                </>) }] : []),
              ]}
              rows={cashierCats} loading={cashierCatLoad} emptyText="Добавьте категории кассы"
              headerActions={isOwnerOrAdmin ?
                <Button variant="contained" startIcon={<Add />} onClick={() => openCashierCatDlg()}>Добавить категорию</Button>
                : undefined
              }
            />
          )}


        </CardContent>
      </Card>

      {/* Trading Point Dialog */}
      <EntityFormDialog open={ptDlg} onClose={() => setPtDlg(false)} onSubmit={savePt}
        title={editPt ? 'Редактировать точку' : 'Новая торговая точка'} submitText={editPt ? 'Сохранить' : 'Создать'} disabled={!ptForm.name}>
        <TextField label="Название" required fullWidth value={ptForm.name} onChange={e => setPtForm({ ...ptForm, name: e.target.value })} />
        <TextField label="Адрес" fullWidth value={ptForm.address} onChange={e => setPtForm({ ...ptForm, address: e.target.value })} />
        <TextField label="Телефон" fullWidth value={ptForm.phone} onChange={e => setPtForm({ ...ptForm, phone: e.target.value })} />
        <TextField label="Режим работы" fullWidth value={ptForm.work_schedule} onChange={e => setPtForm({ ...ptForm, work_schedule: e.target.value })} placeholder="Пн-Пт 9:00-18:00" />
      </EntityFormDialog>

      {/* Warehouse Dialog */}
      <EntityFormDialog open={whDlg} onClose={() => setWhDlg(false)} onSubmit={saveWh}
        title={editWh ? 'Редактировать склад' : 'Новый склад'} submitText={editWh ? 'Сохранить' : 'Создать'} disabled={!whForm.name || !whForm.trading_point}>
        {defaultConflictLabels.length > 0 && (
          <Alert severity="warning">
            При сохранении будет заменён текущий склад по умолчанию для: {defaultConflictLabels.join(', ')}.
          </Alert>
        )}
        <TextField label="Название" required fullWidth value={whForm.name} onChange={e => setWhForm({ ...whForm, name: e.target.value })} />
        <TextField label="Торговая точка" required select fullWidth value={whForm.trading_point} onChange={e => setWhForm({ ...whForm, trading_point: e.target.value })}>
          {points.map(p => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
        </TextField>
        <TextField label="Тип склада" select fullWidth value={whForm.warehouse_type} onChange={e => setWhForm({ ...whForm, warehouse_type: e.target.value })}>
          {WH_TYPES.map(t => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
        </TextField>
        <TextField label="Примечания" fullWidth multiline rows={2} value={whForm.notes} onChange={e => setWhForm({ ...whForm, notes: e.target.value })} />
        <FormControlLabel control={<Switch checked={whForm.is_default_for_receiving} onChange={e => setWhForm({ ...whForm, is_default_for_receiving: e.target.checked })} />} label="По умолчанию для приёмки" />
        <FormControlLabel control={<Switch checked={whForm.is_default_for_bouquets} onChange={e => setWhForm({ ...whForm, is_default_for_bouquets: e.target.checked })} />} label="По умолчанию для букетов" />
        <FormControlLabel control={<Switch checked={whForm.is_default_for_sales} onChange={e => setWhForm({ ...whForm, is_default_for_sales: e.target.checked })} />} label="По умолчанию для продаж" />
      </EntityFormDialog>

      {/* Payment Method Dialog */}
      <EntityFormDialog open={pmDlg} onClose={() => setPmDlg(false)} onSubmit={savePm}
        title={editPm ? 'Редактировать способ оплаты' : 'Новый способ оплаты'} submitText={editPm ? 'Сохранить' : 'Создать'} disabled={!pmForm.name}>
        <TextField label="Название" required fullWidth value={pmForm.name} onChange={e => setPmForm({ ...pmForm, name: e.target.value })} />
        <TextField label="Тип" select fullWidth value={pmForm.is_cash ? 'cash' : 'card'} onChange={e => setPmForm({ ...pmForm, is_cash: e.target.value === 'cash' })}>
          <MenuItem value="cash">Наличные</MenuItem>
          <MenuItem value="card">Безналичные</MenuItem>
        </TextField>
        <TextField label="Комиссия %" type="number" fullWidth value={pmForm.commission_percent}
          onChange={e => setPmForm({ ...pmForm, commission_percent: e.target.value })} />
        <TextField label="Кошелёк" select fullWidth value={pmForm.wallet}
          onChange={e => setPmForm({ ...pmForm, wallet: e.target.value })}>
          <MenuItem value="">— Не привязан —</MenuItem>
          {wallets.map(w => <MenuItem key={w.id} value={w.id}>{w.name}</MenuItem>)}
        </TextField>
      </EntityFormDialog>

      <EntityFormDialog open={cashierCatDlg} onClose={() => setCashierCatDlg(false)} onSubmit={saveCashierCat}
        title={editCashierCat ? 'Редактировать категорию кассы' : 'Новая категория кассы'} submitText={editCashierCat ? 'Сохранить' : 'Создать'}
        disabled={!cashierCatForm.name || (cashierCatForm.source_type === 'nomenclature' && cashierCatForm.group_ids.length === 0)}>
        <TextField label="Название" required fullWidth value={cashierCatForm.name}
          onChange={e => setCashierCatForm({ ...cashierCatForm, name: e.target.value })} />
        <TextField label="Источник" select fullWidth value={cashierCatForm.source_type}
          onChange={e => setCashierCatForm({ ...cashierCatForm, source_type: e.target.value, group_ids: e.target.value === 'nomenclature' ? cashierCatForm.group_ids : [] })}>
          {CASHIER_SOURCE_TYPES.map(t => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
        </TextField>
        <TextField label="Порядок" type="number" fullWidth value={cashierCatForm.sort_order}
          onChange={e => setCashierCatForm({ ...cashierCatForm, sort_order: e.target.value })} />
        <TextField label="Иконка" fullWidth value={cashierCatForm.icon}
          onChange={e => setCashierCatForm({ ...cashierCatForm, icon: e.target.value })} placeholder="Category" />
        {cashierCatForm.source_type === 'nomenclature' && (
          <TextField
            label="Группы номенклатуры" select fullWidth SelectProps={{ multiple: true }}
            value={cashierCatForm.group_ids}
            onChange={e => setCashierCatForm({ ...cashierCatForm, group_ids: typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value })}
            helperText="Для категории номенклатуры выберите минимум одну группу. В кассу попадут позиции из выбранных групп и всей их дочерней ветки."
          >
            {nomGroups.map(group => <MenuItem key={group.id} value={group.id}>{group.name}</MenuItem>)}
          </TextField>
        )}
        <FormControlLabel
          control={<Switch checked={cashierCatForm.is_visible_in_cashier} onChange={e => setCashierCatForm({ ...cashierCatForm, is_visible_in_cashier: e.target.checked })} />}
          label="Показывать в кассе"
        />
      </EntityFormDialog>

      <ConfirmDialog open={!!delPt} title="Удалить точку?" message={`Удалить "${delPt?.name}"?`} onConfirm={removePt} onCancel={() => setDelPt(null)} />
      <ConfirmDialog open={!!delWh} title="Удалить склад?" message={`Удалить "${delWh?.name}"?`} onConfirm={removeWh} onCancel={() => setDelWh(null)} />
      <ConfirmDialog open={!!delPm} title="Удалить способ оплаты?" message={`Удалить "${delPm?.name}"?`} onConfirm={removePm} onCancel={() => setDelPm(null)} />
      <ConfirmDialog open={!!delCashierCat} title="Удалить категорию кассы?" message={`Удалить "${delCashierCat?.name}"?`} onConfirm={removeCashierCat} onCancel={() => setDelCashierCat(null)} />
    </Box>
  )
}
