import { useState, useEffect, useCallback } from 'react'
import {
  Box, Card, CardContent, Typography, TextField, Button,
  Tab, Tabs, IconButton, Chip, MenuItem, Switch, FormControlLabel,
  Alert, Dialog, DialogTitle, DialogContent, DialogActions,
} from '@mui/material'
import Grid from '@mui/material/Grid2'
import { Add, Edit, Delete, Save, Store, Warehouse, CreditCard, Business, People, VpnKey } from '@mui/icons-material'
import api from '../api'
import { useAuth } from '../contexts/AuthContext'
import { useNotification } from '../contexts/NotificationContext'
import extractError from '../utils/extractError'
import DataTable from '../components/DataTable'
import EntityFormDialog from '../components/EntityFormDialog'
import ConfirmDialog from '../components/ConfirmDialog'

interface Organization { id: string; name: string; inn: string; phone: string; email: string }
interface TradingPoint { id: string; organization: string; name: string; address: string; phone: string; work_schedule: string; manager: string | null; is_active: boolean }
interface WarehouseT { id: string; organization: string; trading_point: string; trading_point_name?: string; name: string; warehouse_type: string; responsible: string | null; is_default_for_bouquets: boolean; is_default_for_receiving: boolean; notes: string; is_active: boolean }
interface PaymentMethod { id: string; organization: string; name: string; is_cash: boolean; commission_percent: string; is_active: boolean }
interface UserRow {
  id: string; username: string; email: string; first_name: string
  last_name: string; patronymic: string; phone: string; role: string
  organization: string | null; organization_name: string
  is_active: boolean; full_name: string
}

const WH_TYPES = [
  { value: 'main', label: 'Основной' },
  { value: 'showcase', label: 'Витрина' },
  { value: 'fridge', label: 'Холодильник' },
  { value: 'assembly', label: 'Сборка' },
  { value: 'reserve', label: 'Резерв' },
]

const ROLES = [
  { value: 'owner', label: 'Владелец' },
  { value: 'admin', label: 'Администратор' },
  { value: 'manager', label: 'Менеджер' },
  { value: 'seller', label: 'Продавец' },
  { value: 'courier', label: 'Курьер' },
  { value: 'accountant', label: 'Бухгалтер' },
]

const roleColor = (r: string): 'error' | 'warning' | 'primary' | 'success' | 'info' | 'default' => {
  switch (r) {
    case 'owner': return 'error'
    case 'admin': return 'warning'
    case 'manager': return 'primary'
    case 'seller': return 'success'
    case 'courier': return 'info'
    default: return 'default'
  }
}

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

  useEffect(() => { if (tab === 1) fetchPoints() }, [tab, fetchPoints])

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
  const [whForm, setWhForm] = useState({ name: '', warehouse_type: 'main', trading_point: '', notes: '', is_default_for_bouquets: false, is_default_for_receiving: false })
  const [delWh, setDelWh] = useState<WarehouseT | null>(null)

  const fetchWhs = useCallback(() => {
    setWhLoad(true)
    api.get('/core/warehouses/').then(res => setWhs(res.data.results || res.data || [])).finally(() => setWhLoad(false))
  }, [])

  useEffect(() => { if (tab === 2) { fetchWhs(); fetchPoints() } }, [tab, fetchWhs, fetchPoints])

  const openWhDlg = (w?: WarehouseT) => {
    if (w) { setEditWh(w); setWhForm({ name: w.name, warehouse_type: w.warehouse_type, trading_point: w.trading_point, notes: w.notes || '', is_default_for_bouquets: w.is_default_for_bouquets, is_default_for_receiving: w.is_default_for_receiving }) }
    else { setEditWh(null); setWhForm({ name: '', warehouse_type: 'main', trading_point: points[0]?.id || '', notes: '', is_default_for_bouquets: false, is_default_for_receiving: false }) }
    setWhDlg(true)
  }

  const saveWh = async () => {
    try {
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
  const [pmForm, setPmForm] = useState({ name: '', is_cash: true, commission_percent: '0' })
  const [delPm, setDelPm] = useState<PaymentMethod | null>(null)

  const fetchPms = useCallback(() => {
    setPmLoad(true)
    api.get('/core/payment-methods/').then(res => setPms(res.data.results || res.data || [])).finally(() => setPmLoad(false))
  }, [])

  useEffect(() => { if (tab === 3) fetchPms() }, [tab, fetchPms])

  const openPmDlg = (pm?: PaymentMethod) => {
    if (pm) { setEditPm(pm); setPmForm({ name: pm.name, is_cash: pm.is_cash, commission_percent: pm.commission_percent }) }
    else { setEditPm(null); setPmForm({ name: '', is_cash: true, commission_percent: '0' }) }
    setPmDlg(true)
  }

  const savePm = async () => {
    try {
      if (editPm) { await api.patch(`/core/payment-methods/${editPm.id}/`, pmForm); notify('Способ оплаты обновлён') }
      else { await api.post('/core/payment-methods/', pmForm); notify('Способ оплаты создан') }
      setPmDlg(false); fetchPms()
    } catch (err) { notify(extractError(err, 'Ошибка сохранения'), 'error') }
  }

  const removePm = async () => {
    if (!delPm) return
    try { await api.delete(`/core/payment-methods/${delPm.id}/`); notify('Способ оплаты удалён'); setDelPm(null); fetchPms() }
    catch (err) { notify(extractError(err, 'Ошибка удаления'), 'error') }
  }

  // ─── Users ───
  const [users, setUsers] = useState<UserRow[]>([])
  const [usersLoad, setUsersLoad] = useState(false)
  const [userDlg, setUserDlg] = useState(false)
  const [editUser, setEditUser] = useState<UserRow | null>(null)
  const [userForm, setUserForm] = useState({
    username: '', email: '', password: '', first_name: '',
    last_name: '', patronymic: '', phone: '', role: 'seller',
  })
  const [delUser, setDelUser] = useState<UserRow | null>(null)
  const [pwdDlg, setPwdDlg] = useState(false)
  const [pwdUser, setPwdUser] = useState<UserRow | null>(null)
  const [newPwd, setNewPwd] = useState('')

  const fetchUsers = useCallback(() => {
    setUsersLoad(true)
    api.get('/core/users/')
      .then(res => setUsers(res.data.results || res.data || []))
      .finally(() => setUsersLoad(false))
  }, [])

  useEffect(() => { if (tab === 4) fetchUsers() }, [tab, fetchUsers])

  const openUserDlg = (u?: UserRow) => {
    if (u) {
      setEditUser(u)
      setUserForm({
        username: u.username, email: u.email || '', password: '',
        first_name: u.first_name || '', last_name: u.last_name || '',
        patronymic: u.patronymic || '', phone: u.phone || '', role: u.role,
      })
    } else {
      setEditUser(null)
      setUserForm({
        username: '', email: '', password: '', first_name: '',
        last_name: '', patronymic: '', phone: '', role: 'seller',
      })
    }
    setUserDlg(true)
  }

  const saveUser = async () => {
    try {
      if (editUser) {
        const { password, ...rest } = userForm
        await api.patch(`/core/users/${editUser.id}/`, rest)
        notify('Пользователь обновлён')
      } else {
        await api.post('/core/users/', userForm)
        notify('Пользователь создан')
      }
      setUserDlg(false)
      fetchUsers()
    } catch (err) { notify(extractError(err, 'Ошибка сохранения'), 'error') }
  }

  const removeUser = async () => {
    if (!delUser) return
    try {
      await api.delete(`/core/users/${delUser.id}/`)
      notify('Пользователь удалён')
      setDelUser(null)
      fetchUsers()
    } catch (err) { notify(extractError(err, 'Ошибка удаления'), 'error') }
  }

  const changePassword = async () => {
    if (!pwdUser) return
    try {
      await api.post(`/core/users/${pwdUser.id}/set-password/`, { password: newPwd })
      notify('Пароль изменён')
      setPwdDlg(false)
      setPwdUser(null)
      setNewPwd('')
    } catch (err) { notify(extractError(err, 'Ошибка смены пароля'), 'error') }
  }

  return (
    <Box>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 3 }}>Настройки</Typography>
      <Card>
        <CardContent>
          <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}>
            <Tab icon={<Business />} iconPosition="start" label="Организация" />
            <Tab icon={<Store />} iconPosition="start" label="Торговые точки" />
            <Tab icon={<Warehouse />} iconPosition="start" label="Склады" />
            <Tab icon={<CreditCard />} iconPosition="start" label="Способы оплаты" />
            {isOwnerOrAdmin && <Tab icon={<People />} iconPosition="start" label="Пользователи" />}
          </Tabs>

          {/* ═══ Organization Tab ═══ */}
          {tab === 0 && (
            <Box>
              <Typography variant="h6" gutterBottom>Информация об организации</Typography>
              {!org && <Alert severity="info" sx={{ mb: 2 }}>Создайте организацию для начала работы</Alert>}
              <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid size={{ xs: 12, md: 6 }}><TextField fullWidth label="Название организации" required value={orgForm.name} onChange={e => setOrgForm({ ...orgForm, name: e.target.value })} disabled={!isOwnerOrAdmin} /></Grid>
                <Grid size={{ xs: 12, md: 6 }}><TextField fullWidth label="ИНН" value={orgForm.inn} onChange={e => setOrgForm({ ...orgForm, inn: e.target.value })} disabled={!isOwnerOrAdmin} /></Grid>
                <Grid size={{ xs: 12, md: 6 }}><TextField fullWidth label="Телефон" value={orgForm.phone} onChange={e => setOrgForm({ ...orgForm, phone: e.target.value })} disabled={!isOwnerOrAdmin} /></Grid>
                <Grid size={{ xs: 12, md: 6 }}><TextField fullWidth label="Email" type="email" value={orgForm.email} onChange={e => setOrgForm({ ...orgForm, email: e.target.value })} disabled={!isOwnerOrAdmin} /></Grid>
              </Grid>
              {isOwnerOrAdmin && (
                <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <Button variant="contained" startIcon={<Save />} onClick={saveOrg} disabled={orgLoading || !orgForm.name}>
                    {org ? 'Сохранить' : 'Создать организацию'}
                  </Button>
                </Box>
              )}
            </Box>
          )}

          {/* ═══ Trading Points Tab ═══ */}
          {tab === 1 && (
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
          {tab === 2 && (
            <DataTable
              columns={[
                { key: 'name', label: 'Название', render: (v: string) => <Typography fontWeight={500}>{v}</Typography> },
                { key: 'trading_point_name', label: 'Торговая точка' },
                { key: 'warehouse_type', label: 'Тип', render: (v: string) => <Chip label={WH_TYPES.find(t => t.value === v)?.label || v} size="small" variant="outlined" /> },
                { key: '_def', label: 'По умолчанию', render: (_: any, row: WarehouseT) => (<Box sx={{ display: 'flex', gap: 0.5 }}>
                  {row.is_default_for_receiving && <Chip label="Приёмка" size="small" color="primary" />}
                  {row.is_default_for_bouquets && <Chip label="Букеты" size="small" color="secondary" />}
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
          {tab === 3 && (
            <DataTable
              columns={[
                { key: 'name', label: 'Название', render: (v: string) => <Typography fontWeight={500}>{v}</Typography> },
                { key: 'is_cash', label: 'Тип', render: (v: boolean) => <Chip label={v ? 'Наличные' : 'Безналичные'} size="small" variant="outlined" /> },
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

          {/* ═══ Users Tab ═══ */}
          {tab === 4 && isOwnerOrAdmin && (
            <DataTable
              columns={[
                { key: 'full_name', label: 'ФИО', render: (v: string, row: UserRow) => (
                  <Box>
                    <Typography fontWeight={500}>{v || row.username}</Typography>
                    <Typography variant="caption" color="textSecondary">{row.username}</Typography>
                  </Box>
                )},
                { key: 'email', label: 'Email' },
                { key: 'phone', label: 'Телефон' },
                { key: 'role', label: 'Роль', render: (v: string) => (
                  <Chip label={ROLES.find(r => r.value === v)?.label || v} size="small" color={roleColor(v)} />
                )},
                { key: 'is_active', label: 'Статус', render: (v: boolean) => (
                  <Chip label={v ? 'Активен' : 'Блокирован'} size="small" color={v ? 'success' : 'default'} />
                )},
                { key: '_act', label: '', align: 'center' as const, width: 140,
                  render: (_: any, row: UserRow) => (<>
                    <IconButton size="small" onClick={() => openUserDlg(row)} title="Редактировать"><Edit fontSize="small" /></IconButton>
                    <IconButton size="small" onClick={() => { setPwdUser(row); setNewPwd(''); setPwdDlg(true) }} title="Сменить пароль"><VpnKey fontSize="small" /></IconButton>
                    <IconButton size="small" onClick={() => setDelUser(row)} title="Удалить" disabled={row.id === user?.id}><Delete fontSize="small" /></IconButton>
                  </>) },
              ]}
              rows={users} loading={usersLoad} emptyText="Нет пользователей"
              headerActions={
                <Button variant="contained" startIcon={<Add />} onClick={() => openUserDlg()}>
                  Добавить пользователя
                </Button>
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
      </EntityFormDialog>

      {/* User Dialog */}
      <EntityFormDialog open={userDlg} onClose={() => setUserDlg(false)} onSubmit={saveUser}
        title={editUser ? 'Редактировать пользователя' : 'Новый пользователь'}
        submitText={editUser ? 'Сохранить' : 'Создать'}
        disabled={!userForm.username || (!editUser && userForm.password.length < 8)}>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 6 }}>
            <TextField label="Логин" required fullWidth value={userForm.username}
              onChange={e => setUserForm({ ...userForm, username: e.target.value })}
              disabled={!!editUser} />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <TextField label="Email" type="email" fullWidth value={userForm.email}
              onChange={e => setUserForm({ ...userForm, email: e.target.value })} />
          </Grid>
          {!editUser && (
            <Grid size={{ xs: 12 }}>
              <TextField label="Пароль" type="password" required fullWidth value={userForm.password}
                onChange={e => setUserForm({ ...userForm, password: e.target.value })}
                helperText="Минимум 8 символов" />
            </Grid>
          )}
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField label="Фамилия" fullWidth value={userForm.last_name}
              onChange={e => setUserForm({ ...userForm, last_name: e.target.value })} />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField label="Имя" fullWidth value={userForm.first_name}
              onChange={e => setUserForm({ ...userForm, first_name: e.target.value })} />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField label="Отчество" fullWidth value={userForm.patronymic}
              onChange={e => setUserForm({ ...userForm, patronymic: e.target.value })} />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <TextField label="Телефон" fullWidth value={userForm.phone}
              onChange={e => setUserForm({ ...userForm, phone: e.target.value })} />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <TextField label="Роль" select required fullWidth value={userForm.role}
              onChange={e => setUserForm({ ...userForm, role: e.target.value })}>
              {ROLES.map(r => <MenuItem key={r.value} value={r.value}>{r.label}</MenuItem>)}
            </TextField>
          </Grid>
        </Grid>
      </EntityFormDialog>

      {/* Password Dialog */}
      <Dialog open={pwdDlg} onClose={() => setPwdDlg(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Смена пароля — {pwdUser?.full_name || pwdUser?.username}</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <TextField label="Новый пароль" type="password" fullWidth value={newPwd}
            onChange={e => setNewPwd(e.target.value)} helperText="Минимум 8 символов"
            sx={{ mt: 1 }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPwdDlg(false)}>Отмена</Button>
          <Button variant="contained" onClick={changePassword} disabled={newPwd.length < 8}>
            Сменить пароль
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog open={!!delPt} title="Удалить точку?" message={`Удалить "${delPt?.name}"?`} onConfirm={removePt} onCancel={() => setDelPt(null)} />
      <ConfirmDialog open={!!delWh} title="Удалить склад?" message={`Удалить "${delWh?.name}"?`} onConfirm={removeWh} onCancel={() => setDelWh(null)} />
      <ConfirmDialog open={!!delPm} title="Удалить способ оплаты?" message={`Удалить "${delPm?.name}"?`} onConfirm={removePm} onCancel={() => setDelPm(null)} />
      <ConfirmDialog open={!!delUser} title="Удалить пользователя?"
        message={`Удалить "${delUser?.full_name || delUser?.username}"?`}
        onConfirm={removeUser} onCancel={() => setDelUser(null)} />
    </Box>
  )
}
