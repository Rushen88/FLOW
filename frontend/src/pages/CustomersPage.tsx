import { useState, useEffect, useCallback } from 'react'
import {
  Box, Typography, TextField, Button, Tab, Tabs, IconButton, Chip, MenuItem,
  Switch, FormControlLabel, Card, CardContent, Dialog, DialogTitle, DialogContent,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Divider,
} from '@mui/material'
import Grid from '@mui/material/Grid2'
import { Add, Edit, Delete, Close, People, Group } from '@mui/icons-material'
import api from '../api'
import { useAuth } from '../contexts/AuthContext'
import { useNotification } from '../contexts/NotificationContext'
import extractError from '../utils/extractError'
import DataTable from '../components/DataTable'
import EntityFormDialog from '../components/EntityFormDialog'
import ConfirmDialog from '../components/ConfirmDialog'

// ─── Types ───
interface Customer {
  id: string; first_name: string; last_name: string; patronymic: string
  phone: string; email: string; gender: string; birth_date: string | null
  total_purchases: string; purchases_count: number; bonus_points: string
  discount_percent: string; full_name: string; is_active: boolean
  groups: string[]; groups_detail: CGroup[]; source: string; notes: string
  important_dates: ImportantDate[]; addresses: CAddress[]
}
interface CGroup { id: string; organization: string; name: string; discount_percent: string; color: string }
interface ImportantDate { id: string; customer: string; name: string; date: string; remind_days_before: number | null; notes: string }
interface CAddress { id: string; customer: string; label: string; address: string; is_default: boolean }

const GENDER_CHOICES = [
  { value: 'male', label: 'Мужской' },
  { value: 'female', label: 'Женский' },
  { value: 'unknown', label: 'Не указан' },
]
const genderLabel = (v: string) => GENDER_CHOICES.find(g => g.value === v)?.label || v

const defaultCustForm = () => ({
  first_name: '', last_name: '', patronymic: '', phone: '', email: '',
  gender: 'unknown', birth_date: '', groups: [] as string[],
  discount_percent: '', source: '', notes: '', is_active: true,
})
const defaultDateForm = () => ({ name: '', date: '', remind_days_before: '' as string | number, notes: '' })
const defaultAddrForm = () => ({ label: '', address: '', is_default: false })
const defaultGrpForm = () => ({ name: '', discount_percent: '', color: '#1976d2' })

export default function CustomersPage() {
  const { notify } = useNotification()
  const { user } = useAuth()
  const [tab, setTab] = useState(0)

  // ─── Customers state ───
  const [customers, setCusts] = useState<Customer[]>([])
  const [custLoad, setCustLoad] = useState(false)
  const [custSearch, setCustSearch] = useState('')
  const [filterActive, setFilterActive] = useState('')
  const [custDlg, setCustDlg] = useState(false)
  const [editCust, setEditCust] = useState<Customer | null>(null)
  const [custForm, setCustForm] = useState(defaultCustForm())
  const [custSaving, setCustSaving] = useState(false)
  const [delCust, setDelCust] = useState<Customer | null>(null)
  const [detailCust, setDetailCust] = useState<Customer | null>(null)
  const [detailLoad, setDetailLoad] = useState(false)

  // ─── Important Dates inline ───
  const [dateDlg, setDateDlg] = useState(false)
  const [editDate, setEditDate] = useState<ImportantDate | null>(null)
  const [dateForm, setDateForm] = useState(defaultDateForm())
  const [dateSaving, setDateSaving] = useState(false)
  const [delDate, setDelDate] = useState<ImportantDate | null>(null)

  // ─── Addresses inline ───
  const [addrDlg, setAddrDlg] = useState(false)
  const [editAddr, setEditAddr] = useState<CAddress | null>(null)
  const [addrForm, setAddrForm] = useState(defaultAddrForm())
  const [addrSaving, setAddrSaving] = useState(false)
  const [delAddr, setDelAddr] = useState<CAddress | null>(null)

  // ─── Groups state ───
  const [groups, setGroups] = useState<CGroup[]>([])
  const [grpLoad, setGrpLoad] = useState(false)
  const [grpDlg, setGrpDlg] = useState(false)
  const [editGrp, setEditGrp] = useState<CGroup | null>(null)
  const [grpForm, setGrpForm] = useState(defaultGrpForm())
  const [grpSaving, setGrpSaving] = useState(false)
  const [delGrp, setDelGrp] = useState<CGroup | null>(null)

  // ─── Fetchers ───
  const fetchCustomers = useCallback(() => {
    setCustLoad(true)
    const params: Record<string, string> = {}
    if (custSearch) params.search = custSearch
    if (filterActive) params.is_active = filterActive
    api.get('/customers/customers/', { params })
      .then(res => setCusts(res.data.results || res.data || []))
      .catch(() => notify('Ошибка загрузки клиентов', 'error'))
      .finally(() => setCustLoad(false))
  }, [custSearch, filterActive, notify, user?.active_trading_point])

  const fetchGroups = useCallback(() => {
    setGrpLoad(true)
    api.get('/customers/groups/')
      .then(res => setGroups(res.data.results || res.data || []))
      .catch(() => notify('Ошибка загрузки групп', 'error'))
      .finally(() => setGrpLoad(false))
  }, [notify, user?.active_trading_point])

  useEffect(() => { fetchCustomers(); fetchGroups() }, [fetchCustomers, fetchGroups])

  // ─── Detail fetch ───
  const openDetail = async (cust: Customer) => {
    setDetailLoad(true)
    setDetailCust(cust)
    try {
      const res = await api.get(`/customers/customers/${cust.id}/`)
      setDetailCust(res.data)
    } catch (err) { notify(extractError(err, 'Ошибка загрузки данных клиента'), 'error') }
    setDetailLoad(false)
  }

  const refreshDetail = async () => {
    if (!detailCust) return
    try {
      const res = await api.get(`/customers/customers/${detailCust.id}/`)
      setDetailCust(res.data)
    } catch {}
  }

  // ─── Customer CRUD ───
  const openCustDlg = (c?: Customer) => {
    if (c) {
      setEditCust(c)
      setCustForm({
        first_name: c.first_name, last_name: c.last_name, patronymic: c.patronymic || '',
        phone: c.phone || '', email: c.email || '', gender: c.gender || 'unknown',
        birth_date: c.birth_date || '', groups: c.groups || [],
        discount_percent: c.discount_percent || '', source: c.source || '',
        notes: c.notes || '', is_active: c.is_active,
      })
    } else { setEditCust(null); setCustForm(defaultCustForm()) }
    setCustDlg(true)
  }

  const saveCust = async () => {
    setCustSaving(true)
    try {
      const d: Record<string, any> = { ...custForm }
      if (!d.birth_date) d.birth_date = null
      if (!d.discount_percent) d.discount_percent = '0.00'
      if (editCust) { await api.patch(`/customers/customers/${editCust.id}/`, d); notify('Клиент обновлён') }
      else { await api.post('/customers/customers/', d); notify('Клиент создан') }
      setCustDlg(false); fetchCustomers()
    } catch (err) { notify(extractError(err, 'Ошибка сохранения'), 'error') }
    setCustSaving(false)
  }

  const removeCust = async () => {
    if (!delCust) return
    try { await api.delete(`/customers/customers/${delCust.id}/`); notify('Клиент удалён'); setDelCust(null); fetchCustomers() }
    catch (err) { notify(extractError(err, 'Ошибка удаления'), 'error') }
  }

  // ─── Important Dates CRUD ───
  const openDateDlg = (d?: ImportantDate) => {
    if (d) { setEditDate(d); setDateForm({ name: d.name, date: d.date, remind_days_before: d.remind_days_before ?? '', notes: d.notes || '' }) }
    else { setEditDate(null); setDateForm(defaultDateForm()) }
    setDateDlg(true)
  }

  const saveDate = async () => {
    if (!detailCust) return
    setDateSaving(true)
    try {
      const d: Record<string, any> = { ...dateForm, customer: detailCust.id }
      if (d.remind_days_before === '') d.remind_days_before = null
      if (editDate) { await api.patch(`/customers/important-dates/${editDate.id}/`, d); notify('Дата обновлена') }
      else { await api.post('/customers/important-dates/', d); notify('Дата добавлена') }
      setDateDlg(false); refreshDetail()
    } catch (err) { notify(extractError(err, 'Ошибка сохранения даты'), 'error') }
    setDateSaving(false)
  }

  const removeDate = async () => {
    if (!delDate) return
    try { await api.delete(`/customers/important-dates/${delDate.id}/`); notify('Дата удалена'); setDelDate(null); refreshDetail() }
    catch (err) { notify(extractError(err, 'Ошибка удаления'), 'error') }
  }

  // ─── Addresses CRUD ───
  const openAddrDlg = (a?: CAddress) => {
    if (a) { setEditAddr(a); setAddrForm({ label: a.label, address: a.address, is_default: a.is_default }) }
    else { setEditAddr(null); setAddrForm(defaultAddrForm()) }
    setAddrDlg(true)
  }

  const saveAddr = async () => {
    if (!detailCust) return
    setAddrSaving(true)
    try {
      const d: Record<string, any> = { ...addrForm, customer: detailCust.id }
      if (editAddr) { await api.patch(`/customers/addresses/${editAddr.id}/`, d); notify('Адрес обновлён') }
      else { await api.post('/customers/addresses/', d); notify('Адрес добавлен') }
      setAddrDlg(false); refreshDetail()
    } catch (err) { notify(extractError(err, 'Ошибка сохранения адреса'), 'error') }
    setAddrSaving(false)
  }

  const removeAddr = async () => {
    if (!delAddr) return
    try { await api.delete(`/customers/addresses/${delAddr.id}/`); notify('Адрес удалён'); setDelAddr(null); refreshDetail() }
    catch (err) { notify(extractError(err, 'Ошибка удаления'), 'error') }
  }

  // ─── Group CRUD ───
  const openGrpDlg = (g?: CGroup) => {
    if (g) { setEditGrp(g); setGrpForm({ name: g.name, discount_percent: g.discount_percent || '', color: g.color || '#1976d2' }) }
    else { setEditGrp(null); setGrpForm(defaultGrpForm()) }
    setGrpDlg(true)
  }

  const saveGrp = async () => {
    setGrpSaving(true)
    try {
      const d: Record<string, any> = { ...grpForm }
      if (!d.discount_percent) d.discount_percent = '0.00'
      if (editGrp) { await api.patch(`/customers/groups/${editGrp.id}/`, d); notify('Группа обновлена') }
      else { await api.post('/customers/groups/', d); notify('Группа создана') }
      setGrpDlg(false); fetchGroups()
    } catch (err) { notify(extractError(err, 'Ошибка сохранения'), 'error') }
    setGrpSaving(false)
  }

  const removeGrp = async () => {
    if (!delGrp) return
    try { await api.delete(`/customers/groups/${delGrp.id}/`); notify('Группа удалена'); setDelGrp(null); fetchGroups() }
    catch (err) { notify(extractError(err, 'Ошибка удаления'), 'error') }
  }

  // ─── Render ───
  return (
    <Box>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 3 }}>Клиенты</Typography>
      <Card>
        <CardContent>
          <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}>
            <Tab icon={<People />} iconPosition="start" label="Клиенты" />
            <Tab icon={<Group />} iconPosition="start" label="Группы клиентов" />
          </Tabs>

          {/* ── Tab 0: Customers ── */}
          {tab === 0 && (
            <>
              <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
                <TextField size="small" select label="Статус" value={filterActive}
                  onChange={e => setFilterActive(e.target.value)} sx={{ minWidth: 160 }}>
                  <MenuItem value="">Все</MenuItem>
                  <MenuItem value="true">Активные</MenuItem>
                  <MenuItem value="false">Неактивные</MenuItem>
                </TextField>
              </Box>
              <DataTable
                columns={[
                  { key: 'full_name', label: 'Клиент', render: (v: string) => <Typography fontWeight={600}>{v}</Typography> },
                  { key: 'phone', label: 'Телефон' },
                  { key: 'email', label: 'Email' },
                  { key: 'discount_percent', label: 'Скидка %', align: 'right' },
                  { key: 'bonus_points', label: 'Бонусы', align: 'right' },
                  { key: 'total_purchases', label: 'Сумма покупок', align: 'right', render: (v: string) => v ? `${v} ₽` : '0 ₽' },
                  { key: 'purchases_count', label: 'Покупок', align: 'right' },
                  { key: 'is_active', label: 'Статус', render: (v: boolean) => <Chip label={v ? 'Активен' : 'Неактивен'} size="small" color={v ? 'success' : 'default'} /> },
                  { key: '_act', label: '', align: 'center', width: 100, render: (_: any, row: Customer) => (<>
                    <IconButton size="small" onClick={(e) => { e.stopPropagation(); openCustDlg(row) }}><Edit fontSize="small" /></IconButton>
                    <IconButton size="small" onClick={(e) => { e.stopPropagation(); setDelCust(row) }}><Delete fontSize="small" /></IconButton>
                  </>) },
                ]}
                rows={customers} loading={custLoad} emptyText="Нет клиентов"
                search={custSearch} onSearchChange={setCustSearch} searchPlaceholder="Поиск по имени, телефону, email..."
                headerActions={<Button variant="contained" startIcon={<Add />} onClick={() => openCustDlg()}>Добавить клиента</Button>}
                onRowClick={openDetail}
              />
            </>
          )}

          {/* ── Tab 1: Groups ── */}
          {tab === 1 && (
            <DataTable
              columns={[
                { key: 'color', label: '', width: 40, render: (v: string) => (
                  <Box sx={{ width: 16, height: 16, borderRadius: '50%', bgcolor: v || '#ccc', mx: 'auto' }} />
                ) },
                { key: 'name', label: 'Название', render: (v: string) => <Typography fontWeight={500}>{v}</Typography> },
                { key: 'discount_percent', label: 'Скидка %', align: 'right' },
                { key: '_act', label: '', align: 'center', width: 100, render: (_: any, row: CGroup) => (<>
                  <IconButton size="small" onClick={() => openGrpDlg(row)}><Edit fontSize="small" /></IconButton>
                  <IconButton size="small" onClick={() => setDelGrp(row)}><Delete fontSize="small" /></IconButton>
                </>) },
              ]}
              rows={groups} loading={grpLoad} emptyText="Нет групп клиентов"
              headerActions={<Button variant="contained" startIcon={<Add />} onClick={() => openGrpDlg()}>Добавить группу</Button>}
            />
          )}
        </CardContent>
      </Card>

      {/* ─── Customer Form Dialog ─── */}
      <EntityFormDialog open={custDlg} onClose={() => setCustDlg(false)} onSubmit={saveCust}
        title={editCust ? 'Редактировать клиента' : 'Новый клиент'} submitText={editCust ? 'Сохранить' : 'Создать'}
        loading={custSaving} disabled={!custForm.first_name || !custForm.last_name} maxWidth="md">
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField label="Фамилия" required fullWidth value={custForm.last_name}
              onChange={e => setCustForm({ ...custForm, last_name: e.target.value })} />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField label="Имя" required fullWidth value={custForm.first_name}
              onChange={e => setCustForm({ ...custForm, first_name: e.target.value })} />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField label="Отчество" fullWidth value={custForm.patronymic}
              onChange={e => setCustForm({ ...custForm, patronymic: e.target.value })} />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <TextField label="Телефон" fullWidth value={custForm.phone}
              onChange={e => setCustForm({ ...custForm, phone: e.target.value })} />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <TextField label="Email" fullWidth value={custForm.email}
              onChange={e => setCustForm({ ...custForm, email: e.target.value })} />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField label="Пол" select fullWidth value={custForm.gender}
              onChange={e => setCustForm({ ...custForm, gender: e.target.value })}>
              {GENDER_CHOICES.map(g => <MenuItem key={g.value} value={g.value}>{g.label}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField label="Дата рождения" type="date" fullWidth value={custForm.birth_date}
              onChange={e => setCustForm({ ...custForm, birth_date: e.target.value })}
              slotProps={{ inputLabel: { shrink: true } }} />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField label="Скидка %" type="number" fullWidth value={custForm.discount_percent}
              onChange={e => setCustForm({ ...custForm, discount_percent: e.target.value })} />
          </Grid>
          <Grid size={{ xs: 12 }}>
            <TextField label="Группы" select fullWidth value={custForm.groups}
              onChange={e => setCustForm({ ...custForm, groups: e.target.value as unknown as string[] })}
              slotProps={{ select: { multiple: true, renderValue: (sel) => (sel as string[]).map(id => groups.find(g => g.id === id)?.name || id).join(', ') } }}>
              {groups.map(g => <MenuItem key={g.id} value={g.id}>{g.name}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <TextField label="Источник" fullWidth value={custForm.source}
              onChange={e => setCustForm({ ...custForm, source: e.target.value })} />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <FormControlLabel
              control={<Switch checked={custForm.is_active} onChange={e => setCustForm({ ...custForm, is_active: e.target.checked })} />}
              label="Активен" sx={{ mt: 1 }}
            />
          </Grid>
          <Grid size={{ xs: 12 }}>
            <TextField label="Примечания" fullWidth multiline rows={2} value={custForm.notes}
              onChange={e => setCustForm({ ...custForm, notes: e.target.value })} />
          </Grid>
        </Grid>
      </EntityFormDialog>

      {/* ─── Customer Detail Dialog ─── */}
      <Dialog open={!!detailCust} onClose={() => setDetailCust(null)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {detailCust?.full_name || 'Клиент'}
          <IconButton onClick={() => setDetailCust(null)} size="small"><Close /></IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {detailCust && !detailLoad && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {/* Info */}
              <Grid container spacing={2}>
                <Grid size={{ xs: 6, md: 3 }}><Typography variant="caption" color="text.secondary">Телефон</Typography><Typography>{detailCust.phone || '—'}</Typography></Grid>
                <Grid size={{ xs: 6, md: 3 }}><Typography variant="caption" color="text.secondary">Email</Typography><Typography>{detailCust.email || '—'}</Typography></Grid>
                <Grid size={{ xs: 6, md: 3 }}><Typography variant="caption" color="text.secondary">Пол</Typography><Typography>{genderLabel(detailCust.gender)}</Typography></Grid>
                <Grid size={{ xs: 6, md: 3 }}><Typography variant="caption" color="text.secondary">Дата рождения</Typography><Typography>{detailCust.birth_date || '—'}</Typography></Grid>
                <Grid size={{ xs: 6, md: 3 }}><Typography variant="caption" color="text.secondary">Скидка</Typography><Typography>{detailCust.discount_percent}%</Typography></Grid>
                <Grid size={{ xs: 6, md: 3 }}><Typography variant="caption" color="text.secondary">Бонусы</Typography><Typography>{detailCust.bonus_points}</Typography></Grid>
                <Grid size={{ xs: 6, md: 3 }}><Typography variant="caption" color="text.secondary">Сумма покупок</Typography><Typography>{detailCust.total_purchases} ₽</Typography></Grid>
                <Grid size={{ xs: 6, md: 3 }}><Typography variant="caption" color="text.secondary">Покупок</Typography><Typography>{detailCust.purchases_count}</Typography></Grid>
                {detailCust.groups_detail?.length > 0 && (
                  <Grid size={{ xs: 12 }}>
                    <Typography variant="caption" color="text.secondary">Группы</Typography>
                    <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5 }}>
                      {detailCust.groups_detail.map(g => (
                        <Chip key={g.id} label={g.name} size="small" sx={{ bgcolor: g.color, color: '#fff' }} />
                      ))}
                    </Box>
                  </Grid>
                )}
                {detailCust.source && (
                  <Grid size={{ xs: 6, md: 3 }}><Typography variant="caption" color="text.secondary">Источник</Typography><Typography>{detailCust.source}</Typography></Grid>
                )}
                {detailCust.notes && (
                  <Grid size={{ xs: 12 }}><Typography variant="caption" color="text.secondary">Примечания</Typography><Typography>{detailCust.notes}</Typography></Grid>
                )}
              </Grid>

              <Divider />

              {/* Important Dates */}
              <Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                  <Typography variant="subtitle1" fontWeight={600}>Важные даты</Typography>
                  <Button size="small" startIcon={<Add />} onClick={() => openDateDlg()}>Добавить</Button>
                </Box>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Название</TableCell>
                        <TableCell>Дата</TableCell>
                        <TableCell>Напомнить за (дн.)</TableCell>
                        <TableCell>Примечание</TableCell>
                        <TableCell align="center" width={80}></TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {(detailCust.important_dates || []).length === 0 ? (
                        <TableRow><TableCell colSpan={5} align="center"><Typography variant="body2" color="text.secondary">Нет важных дат</Typography></TableCell></TableRow>
                      ) : detailCust.important_dates.map(d => (
                        <TableRow key={d.id} hover>
                          <TableCell>{d.name}</TableCell>
                          <TableCell>{d.date}</TableCell>
                          <TableCell>{d.remind_days_before ?? '—'}</TableCell>
                          <TableCell>{d.notes || '—'}</TableCell>
                          <TableCell align="center">
                            <IconButton size="small" onClick={() => openDateDlg(d)}><Edit fontSize="small" /></IconButton>
                            <IconButton size="small" onClick={() => setDelDate(d)}><Delete fontSize="small" /></IconButton>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>

              <Divider />

              {/* Addresses */}
              <Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                  <Typography variant="subtitle1" fontWeight={600}>Адреса</Typography>
                  <Button size="small" startIcon={<Add />} onClick={() => openAddrDlg()}>Добавить</Button>
                </Box>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Метка</TableCell>
                        <TableCell>Адрес</TableCell>
                        <TableCell>По умолчанию</TableCell>
                        <TableCell align="center" width={80}></TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {(detailCust.addresses || []).length === 0 ? (
                        <TableRow><TableCell colSpan={4} align="center"><Typography variant="body2" color="text.secondary">Нет адресов</Typography></TableCell></TableRow>
                      ) : detailCust.addresses.map(a => (
                        <TableRow key={a.id} hover>
                          <TableCell>{a.label || '—'}</TableCell>
                          <TableCell>{a.address}</TableCell>
                          <TableCell>{a.is_default ? <Chip label="Да" size="small" color="primary" /> : '—'}</TableCell>
                          <TableCell align="center">
                            <IconButton size="small" onClick={() => openAddrDlg(a)}><Edit fontSize="small" /></IconButton>
                            <IconButton size="small" onClick={() => setDelAddr(a)}><Delete fontSize="small" /></IconButton>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            </Box>
          )}
          {detailLoad && <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>Загрузка...</Typography>}
        </DialogContent>
      </Dialog>

      {/* ─── Important Date Dialog ─── */}
      <EntityFormDialog open={dateDlg} onClose={() => setDateDlg(false)} onSubmit={saveDate}
        title={editDate ? 'Редактировать дату' : 'Новая важная дата'} submitText={editDate ? 'Сохранить' : 'Добавить'}
        loading={dateSaving} disabled={!dateForm.name || !dateForm.date}>
        <TextField label="Название" required fullWidth value={dateForm.name}
          onChange={e => setDateForm({ ...dateForm, name: e.target.value })} placeholder="День рождения" />
        <TextField label="Дата" required type="date" fullWidth value={dateForm.date}
          onChange={e => setDateForm({ ...dateForm, date: e.target.value })}
          slotProps={{ inputLabel: { shrink: true } }} />
        <TextField label="Напомнить за (дней)" type="number" fullWidth value={dateForm.remind_days_before}
          onChange={e => setDateForm({ ...dateForm, remind_days_before: e.target.value ? Number(e.target.value) : '' })} />
        <TextField label="Примечание" fullWidth multiline rows={2} value={dateForm.notes}
          onChange={e => setDateForm({ ...dateForm, notes: e.target.value })} />
      </EntityFormDialog>

      {/* ─── Address Dialog ─── */}
      <EntityFormDialog open={addrDlg} onClose={() => setAddrDlg(false)} onSubmit={saveAddr}
        title={editAddr ? 'Редактировать адрес' : 'Новый адрес'} submitText={editAddr ? 'Сохранить' : 'Добавить'}
        loading={addrSaving} disabled={!addrForm.address}>
        <TextField label="Метка" fullWidth value={addrForm.label}
          onChange={e => setAddrForm({ ...addrForm, label: e.target.value })} placeholder="Дом, Офис..." />
        <TextField label="Адрес" required fullWidth value={addrForm.address}
          onChange={e => setAddrForm({ ...addrForm, address: e.target.value })} />
        <FormControlLabel
          control={<Switch checked={addrForm.is_default} onChange={e => setAddrForm({ ...addrForm, is_default: e.target.checked })} />}
          label="Адрес по умолчанию"
        />
      </EntityFormDialog>

      {/* ─── Group Dialog ─── */}
      <EntityFormDialog open={grpDlg} onClose={() => setGrpDlg(false)} onSubmit={saveGrp}
        title={editGrp ? 'Редактировать группу' : 'Новая группа'} submitText={editGrp ? 'Сохранить' : 'Создать'}
        loading={grpSaving} disabled={!grpForm.name}>
        <TextField label="Название" required fullWidth value={grpForm.name}
          onChange={e => setGrpForm({ ...grpForm, name: e.target.value })} />
        <TextField label="Скидка %" type="number" fullWidth value={grpForm.discount_percent}
          onChange={e => setGrpForm({ ...grpForm, discount_percent: e.target.value })} />
        <TextField label="Цвет" type="color" fullWidth value={grpForm.color}
          onChange={e => setGrpForm({ ...grpForm, color: e.target.value })} />
      </EntityFormDialog>

      {/* ─── Confirm Dialogs ─── */}
      <ConfirmDialog open={!!delCust} title="Удалить клиента?" message={`Удалить "${delCust?.full_name}"? Это действие нельзя отменить.`}
        onConfirm={removeCust} onCancel={() => setDelCust(null)} />
      <ConfirmDialog open={!!delGrp} title="Удалить группу?" message={`Удалить группу "${delGrp?.name}"?`}
        onConfirm={removeGrp} onCancel={() => setDelGrp(null)} />
      <ConfirmDialog open={!!delDate} title="Удалить дату?" message={`Удалить "${delDate?.name}"?`}
        onConfirm={removeDate} onCancel={() => setDelDate(null)} />
      <ConfirmDialog open={!!delAddr} title="Удалить адрес?" message={`Удалить адрес "${delAddr?.label || delAddr?.address}"?`}
        onConfirm={removeAddr} onCancel={() => setDelAddr(null)} />
    </Box>
  )
}
