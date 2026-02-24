import { useState, useEffect, useCallback } from 'react'
import {
  Box, Typography, TextField, Button, IconButton,
  Chip, MenuItem, Card, CardContent, Switch, FormControlLabel,
  Tab, Tabs, Dialog, DialogTitle, DialogContent, DialogActions,
  Paper, Divider, Alert,
} from '@mui/material'
import Grid from '@mui/material/Grid2'
import {
  Add, Edit, Delete, Business, Block, CheckCircle,
  ContactPhone, Payment, Notes, BarChart, SupervisorAccount,
  VpnKey, TrendingUp, People, AccountBalance,
} from '@mui/icons-material'
import api from '../api'
import { useAuth } from '../contexts/AuthContext'
import { useNotification } from '../contexts/NotificationContext'
import extractError from '../utils/extractError'
import DataTable from '../components/DataTable'
import EntityFormDialog from '../components/EntityFormDialog'
import ConfirmDialog from '../components/ConfirmDialog'

/* ── Types ── */
interface Organization {
  id: string; name: string; inn: string; phone: string; email: string
  is_active: boolean; subscription_plan: string; monthly_price: string
  paid_until: string | null; max_users: number; notes: string
  users_count: number; created_at: string
}
interface TenantContact {
  id: string; organization: string; organization_name: string
  name: string; position: string; phone: string; email: string
  is_primary: boolean; notes: string; created_at: string
}
interface TenantPaymentRow {
  id: string; organization: string; organization_name: string
  amount: string; payment_date: string; period_from: string; period_to: string
  payment_method: string; invoice_number: string; notes: string
  created_by_name: string; created_at: string
}
interface TenantNoteRow {
  id: string; organization: string; organization_name: string
  note_type: string; subject: string; content: string
  created_by_name: string; created_at: string
}
interface PlatformAdmin {
  id: string; username: string; email: string; first_name: string
  last_name: string; patronymic: string; phone: string
  is_superuser: boolean; is_active: boolean; full_name: string
  date_joined: string; last_login: string | null
}
interface MetricsSummary {
  total_tenants: number; active_tenants: number; total_users: number
  total_revenue: number; month_revenue: number; total_payments: number
}
interface TenantMetric {
  id: string; name: string; subscription_plan: string; is_active: boolean
  users_count: number; total_revenue: number; month_revenue: number
  total_sales: number; paid_until: string | null; monthly_price: number
}

const PLANS = [
  { value: 'free', label: 'Бесплатный' },
  { value: 'basic', label: 'Базовый' },
  { value: 'pro', label: 'Профессиональный' },
  { value: 'enterprise', label: 'Корпоративный' },
]
const planColor = (p: string): 'default' | 'info' | 'primary' | 'warning' => {
  switch (p) { case 'basic': return 'info'; case 'pro': return 'primary'; case 'enterprise': return 'warning'; default: return 'default' }
}
const PAY_METHODS = [
  { value: 'bank_transfer', label: 'Банковский перевод' },
  { value: 'card', label: 'Банковская карта' },
  { value: 'cash', label: 'Наличные' },
  { value: 'other', label: 'Другое' },
]
const NOTE_TYPES = [
  { value: 'call', label: 'Звонок' },
  { value: 'meeting', label: 'Встреча' },
  { value: 'support', label: 'Тех. поддержка' },
  { value: 'billing', label: 'Биллинг' },
  { value: 'internal', label: 'Внутренняя заметка' },
  { value: 'onboarding', label: 'Онбординг' },
  { value: 'other', label: 'Другое' },
]
const noteColor = (t: string): 'primary' | 'secondary' | 'warning' | 'error' | 'success' | 'info' | 'default' => {
  switch (t) { case 'call': return 'primary'; case 'meeting': return 'secondary'; case 'support': return 'error'; case 'billing': return 'warning'; case 'onboarding': return 'success'; default: return 'default' }
}
const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString('ru-RU') : '—'
const fmtMoney = (v: number | string) => `${Number(v).toLocaleString('ru-RU')} ₽`

export default function AdminPage() {
  const { user } = useAuth()
  const { notify } = useNotification()
  const [tab, setTab] = useState(0)

  // ═══ Tab 0: Organizations ═══
  const [orgs, setOrgs] = useState<Organization[]>([])
  const [orgLoad, setOrgLoad] = useState(false)
  const [orgDlg, setOrgDlg] = useState(false)
  const [editOrg, setEditOrg] = useState<Organization | null>(null)
  const [orgForm, setOrgForm] = useState({
    name: '', inn: '', phone: '', email: '', is_active: true,
    subscription_plan: 'free', monthly_price: '0', paid_until: '',
    max_users: 5, notes: '',
  })
  const [delOrg, setDelOrg] = useState<Organization | null>(null)

  const fetchOrgs = useCallback(() => {
    setOrgLoad(true)
    api.get('/core/organizations/').then(r => setOrgs(r.data.results || r.data || [])).finally(() => setOrgLoad(false))
  }, [])

  useEffect(() => { fetchOrgs() }, [fetchOrgs])

  const openOrgDlg = (o?: Organization) => {
    if (o) {
      setEditOrg(o)
      setOrgForm({
        name: o.name, inn: o.inn || '', phone: o.phone || '', email: o.email || '',
        is_active: o.is_active, subscription_plan: o.subscription_plan || 'free',
        monthly_price: o.monthly_price || '0', paid_until: o.paid_until || '',
        max_users: o.max_users || 5, notes: o.notes || '',
      })
    } else {
      setEditOrg(null)
      setOrgForm({ name: '', inn: '', phone: '', email: '', is_active: true, subscription_plan: 'free', monthly_price: '0', paid_until: '', max_users: 5, notes: '' })
    }
    setOrgDlg(true)
  }

  const saveOrg = async () => {
    try {
      const payload = { ...orgForm, paid_until: orgForm.paid_until || null }
      if (editOrg) { await api.patch(`/core/organizations/${editOrg.id}/`, payload); notify('Организация обновлена') }
      else { await api.post('/core/organizations/', payload); notify('Организация создана') }
      setOrgDlg(false); fetchOrgs()
    } catch (err) { notify(extractError(err, 'Ошибка сохранения'), 'error') }
  }

  const toggleActive = async (org: Organization) => {
    try {
      await api.patch(`/core/organizations/${org.id}/`, { is_active: !org.is_active })
      notify(org.is_active ? 'Организация заблокирована' : 'Организация активирована')
      fetchOrgs()
    } catch (err) { notify(extractError(err, 'Ошибка'), 'error') }
  }

  const removeOrg = async () => {
    if (!delOrg) return
    try { await api.delete(`/core/organizations/${delOrg.id}/`); notify('Организация удалена'); setDelOrg(null); fetchOrgs() }
    catch (err) { notify(extractError(err, 'Ошибка удаления'), 'error') }
  }

  // ═══ Tab 1: Contacts ═══
  const [contacts, setContacts] = useState<TenantContact[]>([])
  const [ctLoad, setCtLoad] = useState(false)
  const [ctDlg, setCtDlg] = useState(false)
  const [editCt, setEditCt] = useState<TenantContact | null>(null)
  const [ctForm, setCtForm] = useState({ organization: '', name: '', position: '', phone: '', email: '', is_primary: false, notes: '' })
  const [delCt, setDelCt] = useState<TenantContact | null>(null)

  const fetchContacts = useCallback(() => {
    setCtLoad(true)
    api.get('/core/tenant-contacts/').then(r => setContacts(r.data.results || r.data || [])).finally(() => setCtLoad(false))
  }, [])

  useEffect(() => { if (tab === 1) fetchContacts() }, [tab, fetchContacts])

  const openCtDlg = (c?: TenantContact) => {
    if (c) { setEditCt(c); setCtForm({ organization: c.organization, name: c.name, position: c.position || '', phone: c.phone || '', email: c.email || '', is_primary: c.is_primary, notes: c.notes || '' }) }
    else { setEditCt(null); setCtForm({ organization: orgs[0]?.id || '', name: '', position: '', phone: '', email: '', is_primary: false, notes: '' }) }
    setCtDlg(true)
  }

  const saveCt = async () => {
    try {
      if (editCt) { await api.patch(`/core/tenant-contacts/${editCt.id}/`, ctForm); notify('Контакт обновлён') }
      else { await api.post('/core/tenant-contacts/', ctForm); notify('Контакт добавлен') }
      setCtDlg(false); fetchContacts()
    } catch (err) { notify(extractError(err, 'Ошибка'), 'error') }
  }

  const removeCt = async () => {
    if (!delCt) return
    try { await api.delete(`/core/tenant-contacts/${delCt.id}/`); notify('Контакт удалён'); setDelCt(null); fetchContacts() }
    catch (err) { notify(extractError(err, 'Ошибка'), 'error') }
  }

  // ═══ Tab 2: Payments ═══
  const [payments, setPayments] = useState<TenantPaymentRow[]>([])
  const [payLoad, setPayLoad] = useState(false)
  const [payDlg, setPayDlg] = useState(false)
  const [editPay, setEditPay] = useState<TenantPaymentRow | null>(null)
  const [payForm, setPayForm] = useState({ organization: '', amount: '', payment_date: '', period_from: '', period_to: '', payment_method: 'bank_transfer', invoice_number: '', notes: '' })
  const [delPay, setDelPay] = useState<TenantPaymentRow | null>(null)

  const fetchPayments = useCallback(() => {
    setPayLoad(true)
    api.get('/core/tenant-payments/').then(r => setPayments(r.data.results || r.data || [])).finally(() => setPayLoad(false))
  }, [])

  useEffect(() => { if (tab === 2) fetchPayments() }, [tab, fetchPayments])

  const openPayDlg = (p?: TenantPaymentRow) => {
    if (p) { setEditPay(p); setPayForm({ organization: p.organization, amount: p.amount, payment_date: p.payment_date, period_from: p.period_from, period_to: p.period_to, payment_method: p.payment_method, invoice_number: p.invoice_number || '', notes: p.notes || '' }) }
    else { setEditPay(null); setPayForm({ organization: orgs[0]?.id || '', amount: '', payment_date: new Date().toISOString().slice(0, 10), period_from: '', period_to: '', payment_method: 'bank_transfer', invoice_number: '', notes: '' }) }
    setPayDlg(true)
  }

  const savePay = async () => {
    try {
      if (editPay) { await api.patch(`/core/tenant-payments/${editPay.id}/`, payForm); notify('Оплата обновлена') }
      else { await api.post('/core/tenant-payments/', payForm); notify('Оплата записана') }
      setPayDlg(false); fetchPayments(); fetchOrgs()
    } catch (err) { notify(extractError(err, 'Ошибка'), 'error') }
  }

  const removePay = async () => {
    if (!delPay) return
    try { await api.delete(`/core/tenant-payments/${delPay.id}/`); notify('Оплата удалена'); setDelPay(null); fetchPayments() }
    catch (err) { notify(extractError(err, 'Ошибка'), 'error') }
  }

  // ═══ Tab 3: Notes / Journal ═══
  const [notes, setNotes] = useState<TenantNoteRow[]>([])
  const [ntLoad, setNtLoad] = useState(false)
  const [ntDlg, setNtDlg] = useState(false)
  const [editNt, setEditNt] = useState<TenantNoteRow | null>(null)
  const [ntForm, setNtForm] = useState({ organization: '', note_type: 'internal', subject: '', content: '' })
  const [delNt, setDelNt] = useState<TenantNoteRow | null>(null)

  const fetchNotes = useCallback(() => {
    setNtLoad(true)
    api.get('/core/tenant-notes/').then(r => setNotes(r.data.results || r.data || [])).finally(() => setNtLoad(false))
  }, [])

  useEffect(() => { if (tab === 3) fetchNotes() }, [tab, fetchNotes])

  const openNtDlg = (n?: TenantNoteRow) => {
    if (n) { setEditNt(n); setNtForm({ organization: n.organization, note_type: n.note_type, subject: n.subject, content: n.content }) }
    else { setEditNt(null); setNtForm({ organization: orgs[0]?.id || '', note_type: 'internal', subject: '', content: '' }) }
    setNtDlg(true)
  }

  const saveNt = async () => {
    try {
      if (editNt) { await api.patch(`/core/tenant-notes/${editNt.id}/`, ntForm); notify('Запись обновлена') }
      else { await api.post('/core/tenant-notes/', ntForm); notify('Запись добавлена') }
      setNtDlg(false); fetchNotes()
    } catch (err) { notify(extractError(err, 'Ошибка'), 'error') }
  }

  const removeNt = async () => {
    if (!delNt) return
    try { await api.delete(`/core/tenant-notes/${delNt.id}/`); notify('Запись удалена'); setDelNt(null); fetchNotes() }
    catch (err) { notify(extractError(err, 'Ошибка'), 'error') }
  }

  // ═══ Tab 4: Metrics ═══
  const [metrics, setMetrics] = useState<TenantMetric[]>([])
  const [summary, setSummary] = useState<MetricsSummary | null>(null)
  const [metrLoad, setMetrLoad] = useState(false)

  const fetchMetrics = useCallback(() => {
    setMetrLoad(true)
    api.get('/core/organizations/tenant-metrics/')
      .then(r => { setMetrics(r.data.tenants || []); setSummary(r.data.summary || null) })
      .finally(() => setMetrLoad(false))
  }, [])

  useEffect(() => { if (tab === 4) fetchMetrics() }, [tab, fetchMetrics])

  // ═══ Tab 5: Platform Admins ═══
  const [admins, setAdmins] = useState<PlatformAdmin[]>([])
  const [admLoad, setAdmLoad] = useState(false)
  const [admDlg, setAdmDlg] = useState(false)
  const [editAdm, setEditAdm] = useState<PlatformAdmin | null>(null)
  const [admForm, setAdmForm] = useState({ username: '', email: '', password: '', first_name: '', last_name: '', patronymic: '', phone: '' })
  const [delAdm, setDelAdm] = useState<PlatformAdmin | null>(null)
  const [pwdDlg, setPwdDlg] = useState(false)
  const [pwdAdm, setPwdAdm] = useState<PlatformAdmin | null>(null)
  const [newPwd, setNewPwd] = useState('')

  const fetchAdmins = useCallback(() => {
    setAdmLoad(true)
    api.get('/core/platform-admins/').then(r => setAdmins(r.data.results || r.data || [])).finally(() => setAdmLoad(false))
  }, [])

  useEffect(() => { if (tab === 5) fetchAdmins() }, [tab, fetchAdmins])

  const openAdmDlg = (a?: PlatformAdmin) => {
    if (a) { setEditAdm(a); setAdmForm({ username: a.username, email: a.email || '', password: '', first_name: a.first_name || '', last_name: a.last_name || '', patronymic: a.patronymic || '', phone: a.phone || '' }) }
    else { setEditAdm(null); setAdmForm({ username: '', email: '', password: '', first_name: '', last_name: '', patronymic: '', phone: '' }) }
    setAdmDlg(true)
  }

  const saveAdm = async () => {
    try {
      if (editAdm) {
        const { password, ...rest } = admForm
        await api.patch(`/core/platform-admins/${editAdm.id}/`, rest)
        notify('Администратор обновлён')
      } else {
        await api.post('/core/platform-admins/', admForm)
        notify('Администратор создан')
      }
      setAdmDlg(false); fetchAdmins()
    } catch (err) { notify(extractError(err, 'Ошибка'), 'error') }
  }

  const removeAdm = async () => {
    if (!delAdm) return
    try { await api.delete(`/core/platform-admins/${delAdm.id}/`); notify('Администратор удалён'); setDelAdm(null); fetchAdmins() }
    catch (err) { notify(extractError(err, 'Ошибка'), 'error') }
  }

  const changePwd = async () => {
    if (!pwdAdm) return
    try {
      await api.post(`/core/platform-admins/${pwdAdm.id}/set-password/`, { password: newPwd })
      notify('Пароль изменён'); setPwdDlg(false); setPwdAdm(null); setNewPwd('')
    } catch (err) { notify(extractError(err, 'Ошибка'), 'error') }
  }

  const toggleAdmActive = async (a: PlatformAdmin) => {
    try {
      await api.post(`/core/platform-admins/${a.id}/toggle-active/`)
      notify(a.is_active ? 'Администратор деактивирован' : 'Администратор активирован')
      fetchAdmins()
    } catch (err) { notify(extractError(err, 'Ошибка'), 'error') }
  }

  // ═══ Access guard ═══
  if (!user?.is_superuser) {
    return (
      <Box>
        <Typography variant="h5" fontWeight={700} sx={{ mb: 3 }}>Администрирование</Typography>
        <Typography color="text.secondary">Этот раздел доступен только суперадминистраторам платформы.</Typography>
      </Box>
    )
  }

  return (
    <Box>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 1 }}>Администрирование платформы</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Управление тенантами, биллингом, контактами, журналом и администраторами
      </Typography>

      <Card>
        <CardContent>
          <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto"
            sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}>
            <Tab icon={<Business />} iconPosition="start" label="Организации" />
            <Tab icon={<ContactPhone />} iconPosition="start" label="Контакты" />
            <Tab icon={<Payment />} iconPosition="start" label="Оплаты" />
            <Tab icon={<Notes />} iconPosition="start" label="Журнал" />
            <Tab icon={<BarChart />} iconPosition="start" label="Обзор" />
            <Tab icon={<SupervisorAccount />} iconPosition="start" label="Администраторы" />
          </Tabs>

          {/* ═══ Tab 0: Organizations ═══ */}
          {tab === 0 && (
            <DataTable
              columns={[
                { key: 'name', label: 'Организация', render: (v: string, row: Organization) => (
                  <Box><Typography fontWeight={500}>{v}</Typography>
                  {row.inn && <Typography variant="caption" color="textSecondary">ИНН: {row.inn}</Typography>}</Box>
                )},
                { key: 'subscription_plan', label: 'Тариф', render: (v: string) => (
                  <Chip label={PLANS.find(p => p.value === v)?.label || v} size="small" color={planColor(v)} variant="outlined" />
                )},
                { key: 'monthly_price', label: 'Плата/мес', align: 'right' as const, render: (v: string) => fmtMoney(v) },
                { key: 'paid_until', label: 'Оплачено до', render: (v: string | null) => fmtDate(v) },
                { key: 'users_count', label: 'Пользователи', align: 'center' as const,
                  render: (v: number, row: Organization) => <Typography variant="body2">{v} / {row.max_users}</Typography> },
                { key: 'is_active', label: 'Статус', render: (v: boolean) => (
                  <Chip icon={v ? <CheckCircle /> : <Block />} label={v ? 'Активна' : 'Заблокирована'}
                    size="small" color={v ? 'success' : 'error'} variant="outlined" />
                )},
                { key: '_act', label: '', align: 'center' as const, width: 140,
                  render: (_: any, row: Organization) => (<>
                    <IconButton size="small" onClick={() => openOrgDlg(row)} title="Редактировать"><Edit fontSize="small" /></IconButton>
                    <IconButton size="small" onClick={() => toggleActive(row)} title={row.is_active ? 'Заблокировать' : 'Активировать'}
                      color={row.is_active ? 'warning' : 'success'}>{row.is_active ? <Block fontSize="small" /> : <CheckCircle fontSize="small" />}</IconButton>
                    <IconButton size="small" onClick={() => setDelOrg(row)} title="Удалить"><Delete fontSize="small" /></IconButton>
                  </>) },
              ]}
              rows={orgs} loading={orgLoad} emptyText="Нет организаций"
              headerActions={<Button variant="contained" startIcon={<Add />} onClick={() => openOrgDlg()}>Создать организацию</Button>}
            />
          )}

          {/* ═══ Tab 1: Contacts ═══ */}
          {tab === 1 && (
            <DataTable
              columns={[
                { key: 'organization_name', label: 'Организация', render: (v: string) => <Typography fontWeight={500}>{v}</Typography> },
                { key: 'name', label: 'ФИО' },
                { key: 'position', label: 'Должность' },
                { key: 'phone', label: 'Телефон' },
                { key: 'email', label: 'Email' },
                { key: 'is_primary', label: 'Контакт', render: (v: boolean) => v ? <Chip label="Основной" size="small" color="primary" /> : null },
                { key: '_act', label: '', align: 'center' as const, width: 100,
                  render: (_: any, row: TenantContact) => (<>
                    <IconButton size="small" onClick={() => openCtDlg(row)}><Edit fontSize="small" /></IconButton>
                    <IconButton size="small" onClick={() => setDelCt(row)}><Delete fontSize="small" /></IconButton>
                  </>) },
              ]}
              rows={contacts} loading={ctLoad} emptyText="Нет контактов"
              headerActions={<Button variant="contained" startIcon={<Add />} onClick={() => openCtDlg()}>Добавить контакт</Button>}
            />
          )}

          {/* ═══ Tab 2: Payments ═══ */}
          {tab === 2 && (
            <DataTable
              columns={[
                { key: 'organization_name', label: 'Организация', render: (v: string) => <Typography fontWeight={500}>{v}</Typography> },
                { key: 'amount', label: 'Сумма', align: 'right' as const, render: (v: string) => fmtMoney(v) },
                { key: 'payment_date', label: 'Дата оплаты', render: (v: string) => fmtDate(v) },
                { key: 'period_from', label: 'Период', render: (_: string, row: TenantPaymentRow) => `${fmtDate(row.period_from)} — ${fmtDate(row.period_to)}` },
                { key: 'payment_method', label: 'Способ', render: (v: string) => PAY_METHODS.find(m => m.value === v)?.label || v },
                { key: 'invoice_number', label: 'Счёт №' },
                { key: 'created_by_name', label: 'Записал' },
                { key: '_act', label: '', align: 'center' as const, width: 100,
                  render: (_: any, row: TenantPaymentRow) => (<>
                    <IconButton size="small" onClick={() => openPayDlg(row)}><Edit fontSize="small" /></IconButton>
                    <IconButton size="small" onClick={() => setDelPay(row)}><Delete fontSize="small" /></IconButton>
                  </>) },
              ]}
              rows={payments} loading={payLoad} emptyText="Нет оплат"
              headerActions={<Button variant="contained" startIcon={<Add />} onClick={() => openPayDlg()}>Записать оплату</Button>}
            />
          )}

          {/* ═══ Tab 3: Journal ═══ */}
          {tab === 3 && (
            <DataTable
              columns={[
                { key: 'organization_name', label: 'Организация', render: (v: string) => <Typography fontWeight={500}>{v}</Typography> },
                { key: 'note_type', label: 'Тип', render: (v: string) => <Chip label={NOTE_TYPES.find(t => t.value === v)?.label || v} size="small" color={noteColor(v)} /> },
                { key: 'subject', label: 'Тема' },
                { key: 'content', label: 'Содержание', render: (v: string) => <Typography variant="body2" noWrap sx={{ maxWidth: 300 }}>{v}</Typography> },
                { key: 'created_by_name', label: 'Автор' },
                { key: 'created_at', label: 'Дата', render: (v: string) => fmtDate(v) },
                { key: '_act', label: '', align: 'center' as const, width: 100,
                  render: (_: any, row: TenantNoteRow) => (<>
                    <IconButton size="small" onClick={() => openNtDlg(row)}><Edit fontSize="small" /></IconButton>
                    <IconButton size="small" onClick={() => setDelNt(row)}><Delete fontSize="small" /></IconButton>
                  </>) },
              ]}
              rows={notes} loading={ntLoad} emptyText="Нет записей"
              headerActions={<Button variant="contained" startIcon={<Add />} onClick={() => openNtDlg()}>Добавить запись</Button>}
            />
          )}

          {/* ═══ Tab 4: Metrics ═══ */}
          {tab === 4 && (
            <Box>
              {summary && (
                <Grid container spacing={2} sx={{ mb: 3 }}>
                  {[
                    { icon: <Business />, label: 'Тенанты', value: `${summary.active_tenants} / ${summary.total_tenants}`, color: '#1976d2' },
                    { icon: <People />, label: 'Пользователи', value: summary.total_users, color: '#9c27b0' },
                    { icon: <TrendingUp />, label: 'Оборот (всего)', value: fmtMoney(summary.total_revenue), color: '#2e7d32' },
                    { icon: <TrendingUp />, label: 'Оборот (месяц)', value: fmtMoney(summary.month_revenue), color: '#ed6c02' },
                    { icon: <AccountBalance />, label: 'Оплаты тенантов', value: fmtMoney(summary.total_payments), color: '#0288d1' },
                  ].map((m, i) => (
                    <Grid key={i} size={{ xs: 12, sm: 6, md: 4, lg: 2.4 }}>
                      <Paper elevation={0} sx={{ p: 2, border: '1px solid #e0e0e0', borderRadius: 2 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                          <Box sx={{ color: m.color }}>{m.icon}</Box>
                          <Typography variant="caption" color="text.secondary">{m.label}</Typography>
                        </Box>
                        <Typography variant="h6" fontWeight={700}>{m.value}</Typography>
                      </Paper>
                    </Grid>
                  ))}
                </Grid>
              )}
              <Divider sx={{ mb: 2 }} />
              <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 2 }}>Показатели по организациям</Typography>
              <DataTable
                columns={[
                  { key: 'name', label: 'Организация', render: (v: string, row: TenantMetric) => (
                    <Box><Typography fontWeight={500}>{v}</Typography>
                    <Chip label={PLANS.find(p => p.value === row.subscription_plan)?.label || row.subscription_plan}
                      size="small" color={planColor(row.subscription_plan)} variant="outlined" sx={{ mt: 0.5 }} /></Box>
                  )},
                  { key: 'total_revenue', label: 'Оборот (всего)', align: 'right' as const, render: (v: number) => fmtMoney(v) },
                  { key: 'month_revenue', label: 'Оборот (месяц)', align: 'right' as const, render: (v: number) => fmtMoney(v) },
                  { key: 'total_sales', label: 'Продаж', align: 'center' as const },
                  { key: 'users_count', label: 'Пользователи', align: 'center' as const },
                  { key: 'monthly_price', label: 'Абонплата', align: 'right' as const, render: (v: number) => fmtMoney(v) },
                  { key: 'paid_until', label: 'Оплачено до', render: (v: string | null) => fmtDate(v) },
                  { key: 'is_active', label: 'Статус', render: (v: boolean) => (
                    <Chip label={v ? 'Активна' : 'Заблокирована'} size="small" color={v ? 'success' : 'error'} variant="outlined" />
                  )},
                ]}
                rows={metrics} loading={metrLoad} emptyText="Нет данных"
              />
            </Box>
          )}

          {/* ═══ Tab 5: Platform Admins ═══ */}
          {tab === 5 && (
            <DataTable
              columns={[
                { key: 'full_name', label: 'ФИО', render: (v: string, row: PlatformAdmin) => (
                  <Box><Typography fontWeight={500}>{v || row.username}</Typography>
                  <Typography variant="caption" color="textSecondary">{row.username}</Typography></Box>
                )},
                { key: 'email', label: 'Email' },
                { key: 'phone', label: 'Телефон' },
                { key: 'date_joined', label: 'Дата создания', render: (v: string) => fmtDate(v) },
                { key: 'last_login', label: 'Последний вход', render: (v: string | null) => fmtDate(v) },
                { key: 'is_active', label: 'Статус', render: (v: boolean) => (
                  <Chip label={v ? 'Активен' : 'Блокирован'} size="small" color={v ? 'success' : 'default'} />
                )},
                { key: '_act', label: '', align: 'center' as const, width: 160,
                  render: (_: any, row: PlatformAdmin) => (<>
                    <IconButton size="small" onClick={() => openAdmDlg(row)} title="Редактировать"><Edit fontSize="small" /></IconButton>
                    <IconButton size="small" onClick={() => { setPwdAdm(row); setNewPwd(''); setPwdDlg(true) }} title="Сменить пароль"><VpnKey fontSize="small" /></IconButton>
                    <IconButton size="small" onClick={() => toggleAdmActive(row)}
                      title={row.is_active ? 'Деактивировать' : 'Активировать'} disabled={row.id === user?.id}
                      color={row.is_active ? 'warning' : 'success'}>{row.is_active ? <Block fontSize="small" /> : <CheckCircle fontSize="small" />}</IconButton>
                    <IconButton size="small" onClick={() => setDelAdm(row)} title="Удалить" disabled={row.id === user?.id}><Delete fontSize="small" /></IconButton>
                  </>) },
              ]}
              rows={admins} loading={admLoad} emptyText="Нет администраторов"
              headerActions={<Button variant="contained" startIcon={<Add />} onClick={() => openAdmDlg()}>Добавить администратора</Button>}
            />
          )}
        </CardContent>
      </Card>

      {/* ═══ Dialogs ═══ */}

      {/* Organization Dialog */}
      <EntityFormDialog open={orgDlg} onClose={() => setOrgDlg(false)} onSubmit={saveOrg}
        title={editOrg ? 'Редактировать организацию' : 'Новая организация'} submitText={editOrg ? 'Сохранить' : 'Создать'} disabled={!orgForm.name}>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12 }}><Typography variant="subtitle2" color="text.secondary"><Business fontSize="small" sx={{ verticalAlign: 'middle', mr: 0.5 }} />Основные данные</Typography></Grid>
          <Grid size={{ xs: 12, md: 6 }}><TextField label="Название" required fullWidth value={orgForm.name} onChange={e => setOrgForm({ ...orgForm, name: e.target.value })} /></Grid>
          <Grid size={{ xs: 12, md: 6 }}><TextField label="ИНН" fullWidth value={orgForm.inn} onChange={e => setOrgForm({ ...orgForm, inn: e.target.value })} /></Grid>
          <Grid size={{ xs: 12, md: 6 }}><TextField label="Телефон" fullWidth value={orgForm.phone} onChange={e => setOrgForm({ ...orgForm, phone: e.target.value })} /></Grid>
          <Grid size={{ xs: 12, md: 6 }}><TextField label="Email" type="email" fullWidth value={orgForm.email} onChange={e => setOrgForm({ ...orgForm, email: e.target.value })} /></Grid>
          <Grid size={{ xs: 12 }}><Typography variant="subtitle2" color="text.secondary" sx={{ mt: 1 }}>Тарификация и биллинг</Typography></Grid>
          <Grid size={{ xs: 12, md: 4 }}><TextField label="Тарифный план" select fullWidth value={orgForm.subscription_plan} onChange={e => setOrgForm({ ...orgForm, subscription_plan: e.target.value })}>{PLANS.map(p => <MenuItem key={p.value} value={p.value}>{p.label}</MenuItem>)}</TextField></Grid>
          <Grid size={{ xs: 12, md: 4 }}><TextField label="Ежемесячная плата ₽" type="number" fullWidth value={orgForm.monthly_price} onChange={e => setOrgForm({ ...orgForm, monthly_price: e.target.value })} /></Grid>
          <Grid size={{ xs: 12, md: 4 }}><TextField label="Макс. пользователей" type="number" fullWidth value={orgForm.max_users} onChange={e => setOrgForm({ ...orgForm, max_users: Number(e.target.value) })} /></Grid>
          <Grid size={{ xs: 12, md: 6 }}><TextField label="Оплачено до" type="date" fullWidth value={orgForm.paid_until} onChange={e => setOrgForm({ ...orgForm, paid_until: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} /></Grid>
          <Grid size={{ xs: 12, md: 6 }}><FormControlLabel control={<Switch checked={orgForm.is_active} onChange={e => setOrgForm({ ...orgForm, is_active: e.target.checked })} />} label="Организация активна" sx={{ mt: 1 }} /></Grid>
          <Grid size={{ xs: 12 }}><TextField label="Заметки администратора" fullWidth multiline rows={2} value={orgForm.notes} onChange={e => setOrgForm({ ...orgForm, notes: e.target.value })} /></Grid>
        </Grid>
      </EntityFormDialog>

      {/* Contact Dialog */}
      <EntityFormDialog open={ctDlg} onClose={() => setCtDlg(false)} onSubmit={saveCt}
        title={editCt ? 'Редактировать контакт' : 'Новый контакт'} submitText={editCt ? 'Сохранить' : 'Создать'} disabled={!ctForm.name || !ctForm.organization}>
        <TextField label="Организация" select required fullWidth value={ctForm.organization} onChange={e => setCtForm({ ...ctForm, organization: e.target.value })}>
          {orgs.map(o => <MenuItem key={o.id} value={o.id}>{o.name}</MenuItem>)}
        </TextField>
        <TextField label="ФИО" required fullWidth value={ctForm.name} onChange={e => setCtForm({ ...ctForm, name: e.target.value })} />
        <TextField label="Должность" fullWidth value={ctForm.position} onChange={e => setCtForm({ ...ctForm, position: e.target.value })} />
        <TextField label="Телефон" fullWidth value={ctForm.phone} onChange={e => setCtForm({ ...ctForm, phone: e.target.value })} />
        <TextField label="Email" type="email" fullWidth value={ctForm.email} onChange={e => setCtForm({ ...ctForm, email: e.target.value })} />
        <FormControlLabel control={<Switch checked={ctForm.is_primary} onChange={e => setCtForm({ ...ctForm, is_primary: e.target.checked })} />} label="Основной контакт" />
        <TextField label="Примечания" fullWidth multiline rows={2} value={ctForm.notes} onChange={e => setCtForm({ ...ctForm, notes: e.target.value })} />
      </EntityFormDialog>

      {/* Payment Dialog */}
      <EntityFormDialog open={payDlg} onClose={() => setPayDlg(false)} onSubmit={savePay}
        title={editPay ? 'Редактировать оплату' : 'Записать оплату'} submitText={editPay ? 'Сохранить' : 'Записать'} disabled={!payForm.organization || !payForm.amount}>
        <TextField label="Организация" select required fullWidth value={payForm.organization} onChange={e => setPayForm({ ...payForm, organization: e.target.value })}>
          {orgs.map(o => <MenuItem key={o.id} value={o.id}>{o.name}</MenuItem>)}
        </TextField>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 6 }}><TextField label="Сумма ₽" type="number" required fullWidth value={payForm.amount} onChange={e => setPayForm({ ...payForm, amount: e.target.value })} /></Grid>
          <Grid size={{ xs: 12, md: 6 }}><TextField label="Дата оплаты" type="date" required fullWidth value={payForm.payment_date} onChange={e => setPayForm({ ...payForm, payment_date: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} /></Grid>
          <Grid size={{ xs: 12, md: 6 }}><TextField label="Период с" type="date" required fullWidth value={payForm.period_from} onChange={e => setPayForm({ ...payForm, period_from: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} /></Grid>
          <Grid size={{ xs: 12, md: 6 }}><TextField label="Период по" type="date" required fullWidth value={payForm.period_to} onChange={e => setPayForm({ ...payForm, period_to: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} /></Grid>
        </Grid>
        <TextField label="Способ оплаты" select fullWidth value={payForm.payment_method} onChange={e => setPayForm({ ...payForm, payment_method: e.target.value })}>
          {PAY_METHODS.map(m => <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>)}
        </TextField>
        <TextField label="Номер счёта" fullWidth value={payForm.invoice_number} onChange={e => setPayForm({ ...payForm, invoice_number: e.target.value })} />
        <TextField label="Примечания" fullWidth multiline rows={2} value={payForm.notes} onChange={e => setPayForm({ ...payForm, notes: e.target.value })} />
      </EntityFormDialog>

      {/* Note Dialog */}
      <EntityFormDialog open={ntDlg} onClose={() => setNtDlg(false)} onSubmit={saveNt}
        title={editNt ? 'Редактировать запись' : 'Новая запись'} submitText={editNt ? 'Сохранить' : 'Создать'} disabled={!ntForm.organization || !ntForm.subject}>
        <TextField label="Организация" select required fullWidth value={ntForm.organization} onChange={e => setNtForm({ ...ntForm, organization: e.target.value })}>
          {orgs.map(o => <MenuItem key={o.id} value={o.id}>{o.name}</MenuItem>)}
        </TextField>
        <TextField label="Тип" select fullWidth value={ntForm.note_type} onChange={e => setNtForm({ ...ntForm, note_type: e.target.value })}>
          {NOTE_TYPES.map(t => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
        </TextField>
        <TextField label="Тема" required fullWidth value={ntForm.subject} onChange={e => setNtForm({ ...ntForm, subject: e.target.value })} />
        <TextField label="Содержание" required fullWidth multiline rows={4} value={ntForm.content} onChange={e => setNtForm({ ...ntForm, content: e.target.value })} />
      </EntityFormDialog>

      {/* Admin Dialog */}
      <EntityFormDialog open={admDlg} onClose={() => setAdmDlg(false)} onSubmit={saveAdm}
        title={editAdm ? 'Редактировать администратора' : 'Новый администратор'}
        submitText={editAdm ? 'Сохранить' : 'Создать'}
        disabled={!admForm.username || (!editAdm && admForm.password.length < 8)}>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 6 }}><TextField label="Логин" required fullWidth value={admForm.username} onChange={e => setAdmForm({ ...admForm, username: e.target.value })} disabled={!!editAdm} /></Grid>
          <Grid size={{ xs: 12, md: 6 }}><TextField label="Email" type="email" fullWidth value={admForm.email} onChange={e => setAdmForm({ ...admForm, email: e.target.value })} /></Grid>
          {!editAdm && <Grid size={{ xs: 12 }}><TextField label="Пароль" type="password" required fullWidth value={admForm.password} onChange={e => setAdmForm({ ...admForm, password: e.target.value })} helperText="Минимум 8 символов" /></Grid>}
          <Grid size={{ xs: 12, md: 4 }}><TextField label="Фамилия" fullWidth value={admForm.last_name} onChange={e => setAdmForm({ ...admForm, last_name: e.target.value })} /></Grid>
          <Grid size={{ xs: 12, md: 4 }}><TextField label="Имя" fullWidth value={admForm.first_name} onChange={e => setAdmForm({ ...admForm, first_name: e.target.value })} /></Grid>
          <Grid size={{ xs: 12, md: 4 }}><TextField label="Отчество" fullWidth value={admForm.patronymic} onChange={e => setAdmForm({ ...admForm, patronymic: e.target.value })} /></Grid>
          <Grid size={{ xs: 12 }}><TextField label="Телефон" fullWidth value={admForm.phone} onChange={e => setAdmForm({ ...admForm, phone: e.target.value })} /></Grid>
        </Grid>
      </EntityFormDialog>

      {/* Password Dialog */}
      <Dialog open={pwdDlg} onClose={() => setPwdDlg(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Смена пароля — {pwdAdm?.full_name || pwdAdm?.username}</DialogTitle>
        <DialogContent>
          <TextField label="Новый пароль" type="password" fullWidth value={newPwd}
            onChange={e => setNewPwd(e.target.value)} helperText="Минимум 8 символов" sx={{ mt: 1 }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPwdDlg(false)}>Отмена</Button>
          <Button variant="contained" onClick={changePwd} disabled={newPwd.length < 8}>Сменить пароль</Button>
        </DialogActions>
      </Dialog>

      {/* Confirm Dialogs */}
      <ConfirmDialog open={!!delOrg} title="Удалить организацию?" message={`Удалить "${delOrg?.name}"? Все данные будут безвозвратно потеряны.`} onConfirm={removeOrg} onCancel={() => setDelOrg(null)} />
      <ConfirmDialog open={!!delCt} title="Удалить контакт?" message={`Удалить "${delCt?.name}"?`} onConfirm={removeCt} onCancel={() => setDelCt(null)} />
      <ConfirmDialog open={!!delPay} title="Удалить оплату?" message={`Удалить оплату на ${delPay ? fmtMoney(delPay.amount) : ''}?`} onConfirm={removePay} onCancel={() => setDelPay(null)} />
      <ConfirmDialog open={!!delNt} title="Удалить запись?" message={`Удалить "${delNt?.subject}"?`} onConfirm={removeNt} onCancel={() => setDelNt(null)} />
      <ConfirmDialog open={!!delAdm} title="Удалить администратора?" message={`Удалить "${delAdm?.full_name || delAdm?.username}"?`} onConfirm={removeAdm} onCancel={() => setDelAdm(null)} />
    </Box>
  )
}
