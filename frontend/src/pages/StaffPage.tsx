import { useState, useEffect, useCallback } from 'react'
import {
  Box, Typography, TextField, Button, Tab, Tabs, IconButton, Chip, MenuItem,
  Switch, FormControlLabel, Divider,
} from '@mui/material'
import Grid from '@mui/material/Grid2'
import { Add, Edit, Delete, People, Work, Schedule, Payments, VpnKey } from '@mui/icons-material'
import api from '../api'
import { useAuth } from '../contexts/AuthContext'
import { useNotification } from '../contexts/NotificationContext'
import extractError from '../utils/extractError'
import DataTable from '../components/DataTable'
import EntityFormDialog from '../components/EntityFormDialog'
import ConfirmDialog from '../components/ConfirmDialog'

// ─── Types ───
interface Position { id: string; organization: string; name: string; base_salary: string; description: string }
interface Employee {
  id: string; organization: string; first_name: string; last_name: string
  patronymic: string; phone: string; email: string; position: string; trading_point: string | null
  hire_date: string; fire_date: string | null; is_active: boolean; notes: string
  full_name: string; position_name: string; trading_point_name: string
  has_account: boolean; username: string; role: string
}
interface Shift {
  id: string; organization: string; employee: string; trading_point: string
  date: string; start_time: string; end_time: string; break_minutes: number
  is_confirmed: boolean; notes: string; employee_name: string
}
interface SalaryAccrual {
  id: string; organization: string; employee: string; period_start: string; period_end: string
  base_amount: string; bonus: string; penalty: string; sales_bonus: string; total: string
  status: string; paid_from_wallet: string | null; paid_at: string | null; notes: string
  created_at: string; employee_name: string
}
interface TradingPoint { id: string; name: string }

const SALARY_STATUSES = [
  { value: 'pending', label: 'Ожидает', color: 'warning' as const },
  { value: 'approved', label: 'Одобрена', color: 'info' as const },
  { value: 'paid', label: 'Выплачена', color: 'success' as const },
]
const statusChip = (val: string) => {
  const s = SALARY_STATUSES.find(x => x.value === val)
  return <Chip label={s?.label || val} size="small" color={s?.color || 'default'} />
}

const ROLES = [
  { value: 'owner', label: 'Владелец' },
  { value: 'admin', label: 'Администратор' },
  { value: 'manager', label: 'Менеджер' },
  { value: 'seller', label: 'Продавец' },
  { value: 'courier', label: 'Курьер' },
  { value: 'accountant', label: 'Бухгалтер' },
]

const defaultEmpForm = () => ({
  first_name: '', last_name: '', patronymic: '', phone: '', email: '',
  position: '', trading_point: '', hire_date: '', fire_date: '', is_active: true, notes: '',
  username: '', password: '', role: 'seller',
})
const defaultPosForm = () => ({ name: '', base_salary: '', description: '' })
const defaultShiftForm = () => ({
  employee: '', trading_point: '', date: '', start_time: '', end_time: '',
  break_minutes: '' as string | number, is_confirmed: false, notes: '',
})
const defaultAccrualForm = () => ({
  employee: '', period_start: '', period_end: '', base_amount: '', bonus: '',
  penalty: '', sales_bonus: '', total: '', status: 'pending', notes: '',
})

export default function StaffPage() {
  const { notify } = useNotification()
  const { user } = useAuth()
  const [tab, setTab] = useState(0)
  const [positions, setPositions] = useState<Position[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [tradingPoints, setTradingPoints] = useState<TradingPoint[]>([])

  useEffect(() => {
    api.get('/core/trading-points/').then(r => setTradingPoints(r.data.results || r.data || []))
  }, [])

  // ══════════════════ Tab 0: Employees ══════════════════
  const [empLoad, setEmpLoad] = useState(false)
  const [empSearch, setEmpSearch] = useState('')
  const [empDlg, setEmpDlg] = useState(false)
  const [editEmp, setEditEmp] = useState<Employee | null>(null)
  const [empForm, setEmpForm] = useState(defaultEmpForm())
  const [empSaving, setEmpSaving] = useState(false)
  const [delEmp, setDelEmp] = useState<Employee | null>(null)

  const fetchEmployees = useCallback(() => {
    setEmpLoad(true)
    const p: Record<string, string> = {}
    if (empSearch) p.search = empSearch
    api.get('/staff/employees/', { params: p })
      .then(r => setEmployees(r.data.results || r.data || []))
      .catch(() => notify('Ошибка загрузки сотрудников', 'error'))
      .finally(() => setEmpLoad(false))
  }, [empSearch, notify, user?.active_trading_point])

  useEffect(() => { fetchEmployees() }, [fetchEmployees])

  const fetchPositions = useCallback(() => {
    api.get('/staff/positions/')
      .then(r => setPositions(r.data.results || r.data || []))
      .catch(() => notify('Ошибка загрузки должностей', 'error'))
  }, [notify])

  useEffect(() => { fetchPositions() }, [fetchPositions])

  const openEmpDlg = (e?: Employee) => {
    if (e) {
      setEditEmp(e)
      setEmpForm({
        first_name: e.first_name, last_name: e.last_name, patronymic: e.patronymic || '',
        phone: e.phone || '', email: e.email || '', position: e.position || '',
        trading_point: e.trading_point || '', hire_date: e.hire_date || '',
        fire_date: e.fire_date || '', is_active: e.is_active, notes: e.notes || '',
        username: e.username || '', password: '',
        role: e.role || 'seller',
      })
    } else { setEditEmp(null); setEmpForm(defaultEmpForm()) }
    setEmpDlg(true)
  }

  const saveEmp = async () => {
    setEmpSaving(true)
    try {
      const d: Record<string, any> = { ...empForm }
      if (!d.trading_point) d.trading_point = null
      if (!d.position) d.position = null
      if (!d.fire_date) d.fire_date = null
      if (!d.hire_date) d.hire_date = null
      // Don't send empty password on edit
      if (!d.password) delete d.password
      if (editEmp) { await api.patch(`/staff/employees/${editEmp.id}/`, d); notify('Сотрудник обновлён') }
      else { await api.post('/staff/employees/', d); notify('Сотрудник создан') }
      setEmpDlg(false); fetchEmployees()
    } catch (err) { notify(extractError(err, 'Ошибка сохранения'), 'error') }
    setEmpSaving(false)
  }

  const removeEmp = async () => {
    if (!delEmp) return
    try { await api.delete(`/staff/employees/${delEmp.id}/`); notify('Сотрудник удалён'); setDelEmp(null); fetchEmployees() }
    catch (err) { notify(extractError(err, 'Ошибка удаления сотрудника'), 'error') }
  }

  // ══════════════════ Tab 1: Positions ══════════════════
  const [posLoad, setPosLoad] = useState(false)
  const [posDlg, setPosDlg] = useState(false)
  const [editPos, setEditPos] = useState<Position | null>(null)
  const [posForm, setPosForm] = useState(defaultPosForm())
  const [posSaving, setPosSaving] = useState(false)
  const [delPos, setDelPos] = useState<Position | null>(null)

  const fetchPositionsFull = useCallback(() => {
    setPosLoad(true)
    api.get('/staff/positions/')
      .then(r => setPositions(r.data.results || r.data || []))
      .catch(() => notify('Ошибка загрузки должностей', 'error'))
      .finally(() => setPosLoad(false))
  }, [notify])

  useEffect(() => { if (tab === 1) fetchPositionsFull() }, [tab, fetchPositionsFull])

  const openPosDlg = (p?: Position) => {
    if (p) {
      setEditPos(p)
      setPosForm({ name: p.name, base_salary: p.base_salary || '', description: p.description || '' })
    } else { setEditPos(null); setPosForm(defaultPosForm()) }
    setPosDlg(true)
  }

  const savePos = async () => {
    setPosSaving(true)
    try {
      const d: Record<string, any> = { ...posForm }
      if (!d.base_salary) d.base_salary = '0.00'
      if (editPos) { await api.patch(`/staff/positions/${editPos.id}/`, d); notify('Должность обновлена') }
      else { await api.post('/staff/positions/', d); notify('Должность создана') }
      setPosDlg(false); fetchPositionsFull(); fetchPositions()
    } catch (err) { notify(extractError(err, 'Ошибка сохранения должности'), 'error') }
    setPosSaving(false)
  }

  const removePos = async () => {
    if (!delPos) return
    try { await api.delete(`/staff/positions/${delPos.id}/`); notify('Должность удалена'); setDelPos(null); fetchPositionsFull(); fetchPositions() }
    catch (err) { notify(extractError(err, 'Ошибка удаления должности'), 'error') }
  }

  // ══════════════════ Tab 2: Shifts ══════════════════
  const [shifts, setShifts] = useState<Shift[]>([])
  const [shiftLoad, setShiftLoad] = useState(false)
  const [shiftEmpFilter, setShiftEmpFilter] = useState('')
  const [shiftTpFilter, setShiftTpFilter] = useState('')
  const [shiftDlg, setShiftDlg] = useState(false)
  const [editShift, setEditShift] = useState<Shift | null>(null)
  const [shiftForm, setShiftForm] = useState(defaultShiftForm())
  const [shiftSaving, setShiftSaving] = useState(false)
  const [delShift, setDelShift] = useState<Shift | null>(null)

  const fetchShifts = useCallback(() => {
    setShiftLoad(true)
    const p: Record<string, string> = {}
    if (shiftEmpFilter) p.employee = shiftEmpFilter
    if (shiftTpFilter) p.trading_point = shiftTpFilter
    api.get('/staff/shifts/', { params: p })
      .then(r => setShifts(r.data.results || r.data || []))
      .catch(() => notify('Ошибка загрузки смен', 'error'))
      .finally(() => setShiftLoad(false))
  }, [shiftEmpFilter, shiftTpFilter, notify])

  useEffect(() => { if (tab === 2) fetchShifts() }, [tab, fetchShifts])

  const openShiftDlg = (s?: Shift) => {
    if (s) {
      setEditShift(s)
      setShiftForm({
        employee: s.employee, trading_point: s.trading_point || '',
        date: s.date || '', start_time: s.start_time || '', end_time: s.end_time || '',
        break_minutes: s.break_minutes ?? '', is_confirmed: s.is_confirmed, notes: s.notes || '',
      })
    } else {
      setEditShift(null)
      setShiftForm(defaultShiftForm())
    }
    setShiftDlg(true)
  }

  // Автозаполнение торговой точки при выборе сотрудника в смене
  const handleShiftEmployeeChange = (empId: string) => {
    const emp = employees.find(e => e.id === empId)
    setShiftForm(prev => ({
      ...prev,
      employee: empId,
      trading_point: (!prev.trading_point && emp?.trading_point) ? emp.trading_point : prev.trading_point,
      start_time: (!prev.start_time && emp?.trading_point) ? '09:00' : prev.start_time,
      end_time: (!prev.end_time && emp?.trading_point) ? '21:00' : prev.end_time,
    }))
  }

  const saveShift = async () => {
    setShiftSaving(true)
    try {
      const d: Record<string, any> = { ...shiftForm }
      if (d.break_minutes === '') d.break_minutes = 0
      if (!d.trading_point) d.trading_point = null
      if (editShift) { await api.patch(`/staff/shifts/${editShift.id}/`, d); notify('Смена обновлена') }
      else { await api.post('/staff/shifts/', d); notify('Смена создана') }
      setShiftDlg(false); fetchShifts()
    } catch (err) { notify(extractError(err, 'Ошибка сохранения смены'), 'error') }
    setShiftSaving(false)
  }

  const removeShift = async () => {
    if (!delShift) return
    try { await api.delete(`/staff/shifts/${delShift.id}/`); notify('Смена удалена'); setDelShift(null); fetchShifts() }
    catch (err) { notify(extractError(err, 'Ошибка удаления смены'), 'error') }
  }

  // ══════════════════ Tab 3: Salary Accruals ══════════════════
  const [accruals, setAccruals] = useState<SalaryAccrual[]>([])
  const [accLoad, setAccLoad] = useState(false)
  const [accStatusFilter, setAccStatusFilter] = useState('')
  const [accEmpFilter, setAccEmpFilter] = useState('')
  const [accDlg, setAccDlg] = useState(false)
  const [editAcc, setEditAcc] = useState<SalaryAccrual | null>(null)
  const [accForm, setAccForm] = useState(defaultAccrualForm())
  const [accSaving, setAccSaving] = useState(false)
  const [delAcc, setDelAcc] = useState<SalaryAccrual | null>(null)

  const fetchAccruals = useCallback(() => {
    setAccLoad(true)
    const p: Record<string, string> = {}
    if (accStatusFilter) p.status = accStatusFilter
    if (accEmpFilter) p.employee = accEmpFilter
    api.get('/staff/salary-accruals/', { params: p })
      .then(r => setAccruals(r.data.results || r.data || []))
      .catch(() => notify('Ошибка загрузки начислений', 'error'))
      .finally(() => setAccLoad(false))
  }, [accStatusFilter, accEmpFilter, notify])

  useEffect(() => { if (tab === 3) fetchAccruals() }, [tab, fetchAccruals])

  const openAccDlg = (a?: SalaryAccrual) => {
    if (a) {
      setEditAcc(a)
      setAccForm({
        employee: a.employee, period_start: a.period_start || '', period_end: a.period_end || '',
        base_amount: a.base_amount || '', bonus: a.bonus || '', penalty: a.penalty || '',
        sales_bonus: a.sales_bonus || '', total: a.total || '', status: a.status || 'pending',
        notes: a.notes || '',
      })
    } else { setEditAcc(null); setAccForm(defaultAccrualForm()) }
    setAccDlg(true)
  }

  const saveAcc = async () => {
    setAccSaving(true)
    try {
      const d: Record<string, any> = { ...accForm }
      if (!d.base_amount) d.base_amount = '0.00'
      if (!d.bonus) d.bonus = '0.00'
      if (!d.penalty) d.penalty = '0.00'
      if (!d.sales_bonus) d.sales_bonus = '0.00'
      if (!d.total) d.total = '0.00'
      if (editAcc) { await api.patch(`/staff/salary-accruals/${editAcc.id}/`, d); notify('Начисление обновлено') }
      else { await api.post('/staff/salary-accruals/', d); notify('Начисление создано') }
      setAccDlg(false); fetchAccruals()
    } catch (err) { notify(extractError(err, 'Ошибка сохранения начисления'), 'error') }
    setAccSaving(false)
  }

  const removeAcc = async () => {
    if (!delAcc) return
    try { await api.delete(`/staff/salary-accruals/${delAcc.id}/`); notify('Начисление удалено'); setDelAcc(null); fetchAccruals() }
    catch (err) { notify(extractError(err, 'Ошибка удаления начисления'), 'error') }
  }

  // ─── Columns ───
  const empCols = [
    { key: 'full_name', label: 'ФИО', render: (v: string) => <Typography fontWeight={600} variant="body2">{v}</Typography> },
    { key: 'position_name', label: 'Должность' },
    { key: 'trading_point_name', label: 'Торговая точка' },
    { key: 'phone', label: 'Телефон' },
    { key: 'username', label: 'Логин', render: (v: string, r: Employee) =>
      v ? <Chip label={v} size="small" variant="outlined" color={r.is_active ? 'primary' : 'default'} />
        : <Typography variant="body2" color="text.secondary">—</Typography>
    },
    { key: 'role', label: 'Роль', render: (v: string) => {
      const r = ROLES.find(x => x.value === v)
      return r ? <Chip label={r.label} size="small" variant="outlined" /> : <Typography variant="body2" color="text.secondary">—</Typography>
    }},
    { key: 'is_active', label: 'Статус', render: (v: boolean) => <Chip label={v ? 'Активен' : 'Уволен'} size="small" color={v ? 'success' : 'default'} /> },
    { key: '_actions', label: '', width: 100, render: (_: any, r: Employee) => (
      <>
        <IconButton size="small" onClick={(e) => { e.stopPropagation(); openEmpDlg(r) }}><Edit fontSize="small" /></IconButton>
        <IconButton size="small" onClick={(e) => { e.stopPropagation(); setDelEmp(r) }}><Delete fontSize="small" /></IconButton>
      </>
    )},
  ]

  const posCols = [
    { key: 'name', label: 'Название' },
    { key: 'base_salary', label: 'Базовый оклад', render: (v: string) => `${Number(v || 0).toLocaleString('ru-RU')} ₽` },
    { key: 'description', label: 'Описание' },
    { key: '_actions', label: '', width: 100, render: (_: any, r: Position) => (
      <>
        <IconButton size="small" onClick={(e) => { e.stopPropagation(); openPosDlg(r) }}><Edit fontSize="small" /></IconButton>
        <IconButton size="small" onClick={(e) => { e.stopPropagation(); setDelPos(r) }}><Delete fontSize="small" /></IconButton>
      </>
    )},
  ]

  const tpName = (id: string) => tradingPoints.find(t => t.id === id)?.name || '—'

  const shiftCols = [
    { key: 'employee_name', label: 'Сотрудник' },
    { key: 'trading_point', label: 'Торговая точка', render: (v: string) => tpName(v) },
    { key: 'date', label: 'Дата' },
    { key: 'start_time', label: 'Начало' },
    { key: 'end_time', label: 'Конец' },
    { key: 'break_minutes', label: 'Перерыв (мин)' },
    { key: 'is_confirmed', label: 'Подтверждена', render: (v: boolean) => <Chip label={v ? 'Да' : 'Нет'} size="small" color={v ? 'success' : 'default'} /> },
    { key: '_actions', label: '', width: 100, render: (_: any, r: Shift) => (
      <>
        <IconButton size="small" onClick={(e) => { e.stopPropagation(); openShiftDlg(r) }}><Edit fontSize="small" /></IconButton>
        <IconButton size="small" onClick={(e) => { e.stopPropagation(); setDelShift(r) }}><Delete fontSize="small" /></IconButton>
      </>
    )},
  ]

  const accCols = [
    { key: 'employee_name', label: 'Сотрудник' },
    { key: 'period_start', label: 'Начало периода' },
    { key: 'period_end', label: 'Конец периода' },
    { key: 'base_amount', label: 'Оклад', render: (v: string) => `${Number(v || 0).toLocaleString('ru-RU')} ₽` },
    { key: 'bonus', label: 'Бонус', render: (v: string) => `${Number(v || 0).toLocaleString('ru-RU')} ₽` },
    { key: 'penalty', label: 'Штраф', render: (v: string) => `${Number(v || 0).toLocaleString('ru-RU')} ₽` },
    { key: 'total', label: 'Итого', render: (v: string) => <Typography fontWeight={600} variant="body2">{Number(v || 0).toLocaleString('ru-RU')} ₽</Typography> },
    { key: 'status', label: 'Статус', render: (v: string) => statusChip(v) },
    { key: '_actions', label: '', width: 100, render: (_: any, r: SalaryAccrual) => (
      <>
        <IconButton size="small" onClick={(e) => { e.stopPropagation(); openAccDlg(r) }}><Edit fontSize="small" /></IconButton>
        <IconButton size="small" onClick={(e) => { e.stopPropagation(); setDelAcc(r) }}><Delete fontSize="small" /></IconButton>
      </>
    )},
  ]

  // ─── Render ───
  return (
    <Box>
      <Typography variant="h4" fontWeight={700} sx={{ mb: 3 }}>Персонал</Typography>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3 }}>
        <Tab icon={<People />} iconPosition="start" label="Сотрудники" />
        <Tab icon={<Work />} iconPosition="start" label="Должности" />
        <Tab icon={<Schedule />} iconPosition="start" label="Смены" />
        <Tab icon={<Payments />} iconPosition="start" label="Начисления зарплат" />
      </Tabs>

      {/* ═══ Tab 0: Employees ═══ */}
      {tab === 0 && (
        <>
          <DataTable
            columns={empCols} rows={employees} loading={empLoad}
            search={empSearch} onSearchChange={setEmpSearch}
            searchPlaceholder="Поиск по имени, фамилии, телефону, логину..."
            headerActions={
              <Button variant="contained" startIcon={<Add />} onClick={() => openEmpDlg()}>Добавить</Button>
            }
          />
          <EntityFormDialog
            open={empDlg} onClose={() => setEmpDlg(false)} onSubmit={saveEmp}
            title={editEmp ? 'Редактировать сотрудника' : 'Новый сотрудник'} loading={empSaving}
          >
            <Grid container spacing={2}>
              {/* ── Личные данные ── */}
              <Grid size={4}>
                <TextField fullWidth label="Фамилия" required value={empForm.last_name}
                  onChange={e => setEmpForm({ ...empForm, last_name: e.target.value })} />
              </Grid>
              <Grid size={4}>
                <TextField fullWidth label="Имя" required value={empForm.first_name}
                  onChange={e => setEmpForm({ ...empForm, first_name: e.target.value })} />
              </Grid>
              <Grid size={4}>
                <TextField fullWidth label="Отчество" value={empForm.patronymic}
                  onChange={e => setEmpForm({ ...empForm, patronymic: e.target.value })} />
              </Grid>
              <Grid size={6}>
                <TextField fullWidth label="Телефон" value={empForm.phone}
                  onChange={e => setEmpForm({ ...empForm, phone: e.target.value })} />
              </Grid>
              <Grid size={6}>
                <TextField fullWidth label="Email" value={empForm.email}
                  onChange={e => setEmpForm({ ...empForm, email: e.target.value })} />
              </Grid>

              {/* ── Работа ── */}
              <Grid size={12}>
                <Divider sx={{ my: 0.5 }} />
              </Grid>
              <Grid size={4}>
                <TextField fullWidth label="Должность" select value={empForm.position}
                  onChange={e => setEmpForm({ ...empForm, position: e.target.value })}>
                  <MenuItem value="">— Не выбрана —</MenuItem>
                  {positions.map(p => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
                </TextField>
              </Grid>
              <Grid size={4}>
                <TextField fullWidth label="Торговая точка" select value={empForm.trading_point}
                  onChange={e => setEmpForm({ ...empForm, trading_point: e.target.value })}>
                  <MenuItem value="">— Не выбрана —</MenuItem>
                  {tradingPoints.map(tp => <MenuItem key={tp.id} value={tp.id}>{tp.name}</MenuItem>)}
                </TextField>
              </Grid>
              <Grid size={4}>
                <TextField fullWidth label="Дата найма" type="date"
                  value={empForm.hire_date} onChange={e => setEmpForm({ ...empForm, hire_date: e.target.value })}
                  slotProps={{ inputLabel: { shrink: true } }} />
              </Grid>
              <Grid size={4}>
                <TextField fullWidth label="Дата увольнения" type="date"
                  value={empForm.fire_date} onChange={e => setEmpForm({ ...empForm, fire_date: e.target.value })}
                  slotProps={{ inputLabel: { shrink: true } }} />
              </Grid>
              <Grid size={4}>
                <FormControlLabel sx={{ mt: 1 }}
                  control={<Switch checked={empForm.is_active} onChange={e => setEmpForm({ ...empForm, is_active: e.target.checked })} />}
                  label="Активен"
                />
              </Grid>

              {/* ── Доступ в систему ── */}
              <Grid size={12}>
                <Divider sx={{ my: 0.5 }} />
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
                  <VpnKey fontSize="small" color="action" />
                  <Typography variant="subtitle2" fontWeight={600}>
                    Доступ в систему
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    — заполните логин и пароль, чтобы сотрудник мог входить самостоятельно
                  </Typography>
                </Box>
              </Grid>
              <Grid size={4}>
                <TextField fullWidth label="Логин" value={empForm.username}
                  onChange={e => setEmpForm({ ...empForm, username: e.target.value })}
                  placeholder={editEmp ? undefined : 'Придумайте логин'}
                  helperText={editEmp?.has_account ? 'Текущий логин для входа' : 'Необязательно'} />
              </Grid>
              <Grid size={4}>
                <TextField fullWidth label={editEmp?.has_account ? 'Новый пароль' : 'Пароль'}
                  type="password" value={empForm.password}
                  onChange={e => setEmpForm({ ...empForm, password: e.target.value })}
                  placeholder={editEmp?.has_account ? '••••••' : 'Мин. 8 символов'}
                  helperText={editEmp?.has_account ? 'Оставьте пустым, если не меняете' : 'Необязательно'} />
              </Grid>
              <Grid size={4}>
                <TextField fullWidth label="Роль" select required value={empForm.role}
                  onChange={e => setEmpForm({ ...empForm, role: e.target.value })}>
                  {ROLES.map(r => <MenuItem key={r.value} value={r.value}>{r.label}</MenuItem>)}
                </TextField>
              </Grid>

              {/* ── Дополнительно ── */}
              <Grid size={12}>
                <TextField fullWidth label="Заметки" multiline rows={2} value={empForm.notes}
                  onChange={e => setEmpForm({ ...empForm, notes: e.target.value })} />
              </Grid>
            </Grid>
          </EntityFormDialog>
          <ConfirmDialog open={!!delEmp} title="Удалить сотрудника?"
            message={`Вы уверены, что хотите удалить сотрудника «${delEmp?.full_name}»?`}
            onConfirm={removeEmp} onCancel={() => setDelEmp(null)} />
        </>
      )}

      {/* ═══ Tab 1: Positions ═══ */}
      {tab === 1 && (
        <>
          <DataTable
            columns={posCols} rows={positions} loading={posLoad}
            headerActions={
              <Button variant="contained" startIcon={<Add />} onClick={() => openPosDlg()}>Добавить</Button>
            }
          />
          <EntityFormDialog
            open={posDlg} onClose={() => setPosDlg(false)} onSubmit={savePos}
            title={editPos ? 'Редактировать должность' : 'Новая должность'} loading={posSaving}
          >
            <TextField fullWidth label="Название" required value={posForm.name}
              onChange={e => setPosForm({ ...posForm, name: e.target.value })} />
            <TextField fullWidth label="Базовый оклад (₽)" type="number" value={posForm.base_salary}
              onChange={e => setPosForm({ ...posForm, base_salary: e.target.value })} />
            <TextField fullWidth label="Описание" multiline rows={3} value={posForm.description}
              onChange={e => setPosForm({ ...posForm, description: e.target.value })} />
          </EntityFormDialog>
          <ConfirmDialog open={!!delPos} title="Удалить должность?"
            message={`Вы уверены, что хотите удалить должность «${delPos?.name}»?`}
            onConfirm={removePos} onCancel={() => setDelPos(null)} />
        </>
      )}

      {/* ═══ Tab 2: Shifts ═══ */}
      {tab === 2 && (
        <>
          <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
            <TextField select size="small" label="Сотрудник" value={shiftEmpFilter}
              onChange={e => setShiftEmpFilter(e.target.value)} sx={{ minWidth: 220 }}>
              <MenuItem value="">Все сотрудники</MenuItem>
              {employees.map(emp => <MenuItem key={emp.id} value={emp.id}>{emp.full_name}</MenuItem>)}
            </TextField>
            <TextField select size="small" label="Торговая точка" value={shiftTpFilter}
              onChange={e => setShiftTpFilter(e.target.value)} sx={{ minWidth: 220 }}>
              <MenuItem value="">Все точки</MenuItem>
              {tradingPoints.map(tp => <MenuItem key={tp.id} value={tp.id}>{tp.name}</MenuItem>)}
            </TextField>
          </Box>
          <DataTable
            columns={shiftCols} rows={shifts} loading={shiftLoad}
            headerActions={
              <Button variant="contained" startIcon={<Add />} onClick={() => openShiftDlg()}>Добавить</Button>
            }
          />
          <EntityFormDialog
            open={shiftDlg} onClose={() => setShiftDlg(false)} onSubmit={saveShift}
            title={editShift ? 'Редактировать смену' : 'Новая смена'} loading={shiftSaving}
          >
            <Grid container spacing={2}>
              <Grid size={12}>
                <TextField fullWidth select label="Сотрудник" required value={shiftForm.employee}
                  onChange={e => handleShiftEmployeeChange(e.target.value)}>
                  <MenuItem value="">— Выберите —</MenuItem>
                  {employees.map(emp => <MenuItem key={emp.id} value={emp.id}>{emp.full_name}</MenuItem>)}
                </TextField>
              </Grid>
              <Grid size={12}>
                <TextField fullWidth select label="Торговая точка" value={shiftForm.trading_point}
                  onChange={e => setShiftForm({ ...shiftForm, trading_point: e.target.value })}>
                  <MenuItem value="">— Не выбрана —</MenuItem>
                  {tradingPoints.map(tp => <MenuItem key={tp.id} value={tp.id}>{tp.name}</MenuItem>)}
                </TextField>
              </Grid>
              <Grid size={4}>
                <TextField fullWidth label="Дата" type="date" required value={shiftForm.date}
                  onChange={e => setShiftForm({ ...shiftForm, date: e.target.value })}
                  slotProps={{ inputLabel: { shrink: true } }} />
              </Grid>
              <Grid size={4}>
                <TextField fullWidth label="Начало" type="time" required value={shiftForm.start_time}
                  onChange={e => setShiftForm({ ...shiftForm, start_time: e.target.value })}
                  slotProps={{ inputLabel: { shrink: true } }} />
              </Grid>
              <Grid size={4}>
                <TextField fullWidth label="Конец" type="time" required value={shiftForm.end_time}
                  onChange={e => setShiftForm({ ...shiftForm, end_time: e.target.value })}
                  slotProps={{ inputLabel: { shrink: true } }} />
              </Grid>
              <Grid size={6}>
                <TextField fullWidth label="Перерыв (мин)" type="number" value={shiftForm.break_minutes}
                  onChange={e => setShiftForm({ ...shiftForm, break_minutes: e.target.value })} />
              </Grid>
              <Grid size={6}>
                <FormControlLabel
                  control={<Switch checked={shiftForm.is_confirmed} onChange={e => setShiftForm({ ...shiftForm, is_confirmed: e.target.checked })} />}
                  label="Подтверждена" sx={{ mt: 1 }}
                />
              </Grid>
              <Grid size={12}>
                <TextField fullWidth label="Заметки" multiline rows={2} value={shiftForm.notes}
                  onChange={e => setShiftForm({ ...shiftForm, notes: e.target.value })} />
              </Grid>
            </Grid>
          </EntityFormDialog>
          <ConfirmDialog open={!!delShift} title="Удалить смену?"
            message={`Удалить смену сотрудника «${delShift?.employee_name}» за ${delShift?.date}?`}
            onConfirm={removeShift} onCancel={() => setDelShift(null)} />
        </>
      )}

      {/* ═══ Tab 3: Salary Accruals ═══ */}
      {tab === 3 && (
        <>
          <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
            <TextField select size="small" label="Статус" value={accStatusFilter}
              onChange={e => setAccStatusFilter(e.target.value)} sx={{ minWidth: 180 }}>
              <MenuItem value="">Все статусы</MenuItem>
              {SALARY_STATUSES.map(s => <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>)}
            </TextField>
            <TextField select size="small" label="Сотрудник" value={accEmpFilter}
              onChange={e => setAccEmpFilter(e.target.value)} sx={{ minWidth: 220 }}>
              <MenuItem value="">Все сотрудники</MenuItem>
              {employees.map(emp => <MenuItem key={emp.id} value={emp.id}>{emp.full_name}</MenuItem>)}
            </TextField>
          </Box>
          <DataTable
            columns={accCols} rows={accruals} loading={accLoad}
            headerActions={
              <Button variant="contained" startIcon={<Add />} onClick={() => openAccDlg()}>Добавить</Button>
            }
          />
          <EntityFormDialog
            open={accDlg} onClose={() => setAccDlg(false)} onSubmit={saveAcc}
            title={editAcc ? 'Редактировать начисление' : 'Новое начисление'} loading={accSaving} maxWidth="md"
          >
            <Grid container spacing={2}>
              <Grid size={12}>
                <TextField fullWidth select label="Сотрудник" required value={accForm.employee}
                  onChange={e => setAccForm({ ...accForm, employee: e.target.value })}>
                  <MenuItem value="">— Выберите —</MenuItem>
                  {employees.map(emp => <MenuItem key={emp.id} value={emp.id}>{emp.full_name}</MenuItem>)}
                </TextField>
              </Grid>
              <Grid size={6}>
                <TextField fullWidth label="Начало периода" type="date" required value={accForm.period_start}
                  onChange={e => setAccForm({ ...accForm, period_start: e.target.value })}
                  slotProps={{ inputLabel: { shrink: true } }} />
              </Grid>
              <Grid size={6}>
                <TextField fullWidth label="Конец периода" type="date" required value={accForm.period_end}
                  onChange={e => setAccForm({ ...accForm, period_end: e.target.value })}
                  slotProps={{ inputLabel: { shrink: true } }} />
              </Grid>
              <Grid size={4}>
                <TextField fullWidth label="Оклад (₽)" type="number" value={accForm.base_amount}
                  onChange={e => setAccForm({ ...accForm, base_amount: e.target.value })} />
              </Grid>
              <Grid size={4}>
                <TextField fullWidth label="Бонус (₽)" type="number" value={accForm.bonus}
                  onChange={e => setAccForm({ ...accForm, bonus: e.target.value })} />
              </Grid>
              <Grid size={4}>
                <TextField fullWidth label="Штраф (₽)" type="number" value={accForm.penalty}
                  onChange={e => setAccForm({ ...accForm, penalty: e.target.value })} />
              </Grid>
              <Grid size={4}>
                <TextField fullWidth label="Бонус от продаж (₽)" type="number" value={accForm.sales_bonus}
                  onChange={e => setAccForm({ ...accForm, sales_bonus: e.target.value })} />
              </Grid>
              <Grid size={4}>
                <TextField fullWidth label="Итого (₽)" type="number" value={accForm.total}
                  onChange={e => setAccForm({ ...accForm, total: e.target.value })} />
              </Grid>
              <Grid size={4}>
                <TextField fullWidth select label="Статус" value={accForm.status}
                  onChange={e => setAccForm({ ...accForm, status: e.target.value })}>
                  {SALARY_STATUSES.map(s => <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>)}
                </TextField>
              </Grid>
              <Grid size={12}>
                <TextField fullWidth label="Заметки" multiline rows={2} value={accForm.notes}
                  onChange={e => setAccForm({ ...accForm, notes: e.target.value })} />
              </Grid>
            </Grid>
          </EntityFormDialog>
          <ConfirmDialog open={!!delAcc} title="Удалить начисление?"
            message={`Удалить начисление для «${delAcc?.employee_name}» за период ${delAcc?.period_start} — ${delAcc?.period_end}?`}
            onConfirm={removeAcc} onCancel={() => setDelAcc(null)} />
        </>
      )}
    </Box>
  )
}
