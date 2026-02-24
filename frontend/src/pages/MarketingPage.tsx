import { useState, useEffect, useCallback } from 'react'
import {
  Box, Typography, TextField, Button, Tab, Tabs, Chip, MenuItem,
  Switch, FormControlLabel, Link, IconButton,
} from '@mui/material'
import Grid from '@mui/material/Grid2'
import { Add, Edit, Delete } from '@mui/icons-material'
import api from '../api'
import { useNotification } from '../contexts/NotificationContext'
import extractError from '../utils/extractError'
import DataTable from '../components/DataTable'
import EntityFormDialog from '../components/EntityFormDialog'
import ConfirmDialog from '../components/ConfirmDialog'

// ─── Types ───
interface AdChannel {
  id: string; organization: string; name: string; channel_type: string; url: string; is_active: boolean
}
interface AdInvestment {
  id: string; organization: string; channel: string; amount: string; date: string; description: string; channel_name: string
}
interface Discount {
  id: string; organization: string; name: string; discount_type: string; value: string
  apply_to: string; min_purchase: string; start_date: string; end_date: string; is_active: boolean
}
interface PromoCode {
  id: string; organization: string; code: string; discount: string; max_uses: number
  used_count: number; start_date: string; end_date: string; is_active: boolean
}
interface LoyaltyProgram {
  id: string; organization: string; name: string; program_type: string
  accrual_percent: string; max_payment_percent: string; is_active: boolean
}

// ─── Constants ───
const DISCOUNT_TYPES = [
  { value: 'percent', label: 'Процент', color: 'info' as const },
  { value: 'fixed', label: 'Фиксированная', color: 'warning' as const },
]
const APPLY_TO = [
  { value: 'all', label: 'Все', color: 'success' as const },
  { value: 'group', label: 'Группа', color: 'primary' as const },
  { value: 'nomenclature', label: 'Номенклатура', color: 'secondary' as const },
]
const PROGRAM_TYPES = [
  { value: 'bonus', label: 'Бонусная', color: 'success' as const },
  { value: 'discount', label: 'Дисконтная', color: 'info' as const },
  { value: 'cashback', label: 'Кешбэк', color: 'warning' as const },
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
const defaultChannelForm = () => ({ name: '', channel_type: '', url: '', is_active: true })
const defaultInvestmentForm = () => ({ channel: '', amount: '', date: '', description: '' })
const defaultDiscountForm = () => ({ name: '', discount_type: 'percent', value: '', apply_to: 'all', min_purchase: '', start_date: '', end_date: '', is_active: true })
const defaultPromoForm = () => ({ code: '', discount: '', max_uses: '', start_date: '', end_date: '', is_active: true })
const defaultLoyaltyForm = () => ({ name: '', program_type: 'bonus', accrual_percent: '', max_payment_percent: '', is_active: true })

export default function MarketingPage() {
  const { notify } = useNotification()
  const [tab, setTab] = useState(0)


  // ══════════════════ Tab 0: Рекл. каналы ══════════════════
  const [channels, setChannels] = useState<AdChannel[]>([])
  const [chLoad, setChLoad] = useState(false)
  const [chDlg, setChDlg] = useState(false)
  const [editCh, setEditCh] = useState<AdChannel | null>(null)
  const [chForm, setChForm] = useState(defaultChannelForm())
  const [chSaving, setChSaving] = useState(false)
  const [delCh, setDelCh] = useState<AdChannel | null>(null)

  const fetchChannels = useCallback(() => {
    setChLoad(true)
    api.get('/marketing/channels/')
      .then(r => setChannels(r.data.results || r.data || []))
      .catch(() => notify('Ошибка загрузки каналов', 'error'))
      .finally(() => setChLoad(false))
  }, [notify])

  useEffect(() => { fetchChannels() }, [fetchChannels])

  const openChDlg = (c?: AdChannel) => {
    if (c) { setEditCh(c); setChForm({ name: c.name, channel_type: c.channel_type, url: c.url, is_active: c.is_active }) }
    else { setEditCh(null); setChForm(defaultChannelForm()) }
    setChDlg(true)
  }
  const saveCh = async () => {
    setChSaving(true)
    try {
      const d = { ...chForm }
      if (editCh) { await api.patch(`/marketing/channels/${editCh.id}/`, d); notify('Канал обновлён') }
      else { await api.post('/marketing/channels/', d); notify('Канал создан') }
      setChDlg(false); fetchChannels()
    } catch (err) { notify(extractError(err, 'Ошибка сохранения'), 'error') }
    setChSaving(false)
  }
  const removeCh = async () => {
    if (!delCh) return
    try { await api.delete(`/marketing/channels/${delCh.id}/`); notify('Канал удалён'); setDelCh(null); fetchChannels() }
    catch (err) { notify(extractError(err, 'Ошибка удаления'), 'error') }
  }

  // ══════════════════ Tab 1: Инвестиции ══════════════════
  const [investments, setInvestments] = useState<AdInvestment[]>([])
  const [invLoad, setInvLoad] = useState(false)
  const [invDlg, setInvDlg] = useState(false)
  const [editInv, setEditInv] = useState<AdInvestment | null>(null)
  const [invForm, setInvForm] = useState(defaultInvestmentForm())
  const [invSaving, setInvSaving] = useState(false)
  const [delInv, setDelInv] = useState<AdInvestment | null>(null)

  const fetchInvestments = useCallback(() => {
    setInvLoad(true)
    api.get('/marketing/investments/')
      .then(r => setInvestments(r.data.results || r.data || []))
      .catch(() => notify('Ошибка загрузки инвестиций', 'error'))
      .finally(() => setInvLoad(false))
  }, [notify])

  useEffect(() => { if (tab === 1) fetchInvestments() }, [tab, fetchInvestments])

  const openInvDlg = (inv?: AdInvestment) => {
    if (inv) { setEditInv(inv); setInvForm({ channel: inv.channel, amount: inv.amount, date: inv.date, description: inv.description }) }
    else { setEditInv(null); setInvForm(defaultInvestmentForm()) }
    setInvDlg(true)
  }
  const saveInv = async () => {
    setInvSaving(true)
    try {
      const d = { ...invForm }
      if (editInv) { await api.patch(`/marketing/investments/${editInv.id}/`, d); notify('Инвестиция обновлена') }
      else { await api.post('/marketing/investments/', d); notify('Инвестиция создана') }
      setInvDlg(false); fetchInvestments()
    } catch (err) { notify(extractError(err, 'Ошибка сохранения'), 'error') }
    setInvSaving(false)
  }
  const removeInv = async () => {
    if (!delInv) return
    try { await api.delete(`/marketing/investments/${delInv.id}/`); notify('Инвестиция удалена'); setDelInv(null); fetchInvestments() }
    catch (err) { notify(extractError(err, 'Ошибка удаления'), 'error') }
  }

  // ══════════════════ Tab 2: Скидки ══════════════════
  const [discounts, setDiscounts] = useState<Discount[]>([])
  const [discLoad, setDiscLoad] = useState(false)
  const [discDlg, setDiscDlg] = useState(false)
  const [editDisc, setEditDisc] = useState<Discount | null>(null)
  const [discForm, setDiscForm] = useState(defaultDiscountForm())
  const [discSaving, setDiscSaving] = useState(false)
  const [delDisc, setDelDisc] = useState<Discount | null>(null)

  const fetchDiscounts = useCallback(() => {
    setDiscLoad(true)
    api.get('/marketing/discounts/')
      .then(r => setDiscounts(r.data.results || r.data || []))
      .catch(() => notify('Ошибка загрузки скидок', 'error'))
      .finally(() => setDiscLoad(false))
  }, [notify])

  useEffect(() => { if (tab === 2) fetchDiscounts() }, [tab, fetchDiscounts])

  const openDiscDlg = (d?: Discount) => {
    if (d) {
      setEditDisc(d)
      setDiscForm({ name: d.name, discount_type: d.discount_type, value: d.value, apply_to: d.apply_to, min_purchase: d.min_purchase || '', start_date: d.start_date || '', end_date: d.end_date || '', is_active: d.is_active })
    } else { setEditDisc(null); setDiscForm(defaultDiscountForm()) }
    setDiscDlg(true)
  }
  const saveDisc = async () => {
    setDiscSaving(true)
    try {
      const d: Record<string, any> = { ...discForm }
      if (!d.min_purchase) d.min_purchase = null
      if (!d.start_date) d.start_date = null
      if (!d.end_date) d.end_date = null
      if (editDisc) { await api.patch(`/marketing/discounts/${editDisc.id}/`, d); notify('Скидка обновлена') }
      else { await api.post('/marketing/discounts/', d); notify('Скидка создана') }
      setDiscDlg(false); fetchDiscounts()
    } catch (err) { notify(extractError(err, 'Ошибка сохранения'), 'error') }
    setDiscSaving(false)
  }
  const removeDisc = async () => {
    if (!delDisc) return
    try { await api.delete(`/marketing/discounts/${delDisc.id}/`); notify('Скидка удалена'); setDelDisc(null); fetchDiscounts() }
    catch (err) { notify(extractError(err, 'Ошибка удаления'), 'error') }
  }

  // ══════════════════ Tab 3: Промокоды ══════════════════
  const [promos, setPromos] = useState<PromoCode[]>([])
  const [promoLoad, setPromoLoad] = useState(false)
  const [promoDlg, setPromoDlg] = useState(false)
  const [editPromo, setEditPromo] = useState<PromoCode | null>(null)
  const [promoForm, setPromoForm] = useState(defaultPromoForm())
  const [promoSaving, setPromoSaving] = useState(false)
  const [delPromo, setDelPromo] = useState<PromoCode | null>(null)

  const fetchPromos = useCallback(() => {
    setPromoLoad(true)
    api.get('/marketing/promo-codes/')
      .then(r => setPromos(r.data.results || r.data || []))
      .catch(() => notify('Ошибка загрузки промокодов', 'error'))
      .finally(() => setPromoLoad(false))
  }, [notify])

  useEffect(() => { if (tab === 3) fetchPromos() }, [tab, fetchPromos])

  const openPromoDlg = (p?: PromoCode) => {
    if (p) {
      setEditPromo(p)
      setPromoForm({ code: p.code, discount: p.discount || '', max_uses: String(p.max_uses || ''), start_date: p.start_date || '', end_date: p.end_date || '', is_active: p.is_active })
    } else { setEditPromo(null); setPromoForm(defaultPromoForm()) }
    setPromoDlg(true)
  }
  const savePromo = async () => {
    setPromoSaving(true)
    try {
      const d: Record<string, any> = { ...promoForm }
      if (!d.max_uses) d.max_uses = null
      if (!d.start_date) d.start_date = null
      if (!d.end_date) d.end_date = null
      if (editPromo) { await api.patch(`/marketing/promo-codes/${editPromo.id}/`, d); notify('Промокод обновлён') }
      else { await api.post('/marketing/promo-codes/', d); notify('Промокод создан') }
      setPromoDlg(false); fetchPromos()
    } catch (err) { notify(extractError(err, 'Ошибка сохранения'), 'error') }
    setPromoSaving(false)
  }
  const removePromo = async () => {
    if (!delPromo) return
    try { await api.delete(`/marketing/promo-codes/${delPromo.id}/`); notify('Промокод удалён'); setDelPromo(null); fetchPromos() }
    catch (err) { notify(extractError(err, 'Ошибка удаления'), 'error') }
  }

  // ══════════════════ Tab 4: Программы лояльности ══════════════════
  const [loyalties, setLoyalties] = useState<LoyaltyProgram[]>([])
  const [loyLoad, setLoyLoad] = useState(false)
  const [loyDlg, setLoyDlg] = useState(false)
  const [editLoy, setEditLoy] = useState<LoyaltyProgram | null>(null)
  const [loyForm, setLoyForm] = useState(defaultLoyaltyForm())
  const [loySaving, setLoySaving] = useState(false)
  const [delLoy, setDelLoy] = useState<LoyaltyProgram | null>(null)

  const fetchLoyalties = useCallback(() => {
    setLoyLoad(true)
    api.get('/marketing/loyalty/')
      .then(r => setLoyalties(r.data.results || r.data || []))
      .catch(() => notify('Ошибка загрузки программ лояльности', 'error'))
      .finally(() => setLoyLoad(false))
  }, [notify])

  useEffect(() => { if (tab === 4) fetchLoyalties() }, [tab, fetchLoyalties])

  const openLoyDlg = (l?: LoyaltyProgram) => {
    if (l) {
      setEditLoy(l)
      setLoyForm({ name: l.name, program_type: l.program_type, accrual_percent: l.accrual_percent, max_payment_percent: l.max_payment_percent, is_active: l.is_active })
    } else { setEditLoy(null); setLoyForm(defaultLoyaltyForm()) }
    setLoyDlg(true)
  }
  const saveLoy = async () => {
    setLoySaving(true)
    try {
      const d = { ...loyForm }
      if (editLoy) { await api.patch(`/marketing/loyalty/${editLoy.id}/`, d); notify('Программа обновлена') }
      else { await api.post('/marketing/loyalty/', d); notify('Программа создана') }
      setLoyDlg(false); fetchLoyalties()
    } catch (err) { notify(extractError(err, 'Ошибка сохранения'), 'error') }
    setLoySaving(false)
  }
  const removeLoy = async () => {
    if (!delLoy) return
    try { await api.delete(`/marketing/loyalty/${delLoy.id}/`); notify('Программа удалена'); setDelLoy(null); fetchLoyalties() }
    catch (err) { notify(extractError(err, 'Ошибка удаления'), 'error') }
  }

  // ─── Helpers for selects ───
  const discountName = (id: string) => discounts.find(d => d.id === id)?.name || id

  // ═══════════════════════ RENDER ═══════════════════════
  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 2, fontWeight: 700 }}>Маркетинг</Typography>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3 }}>
        <Tab label="Рекл. каналы" />
        <Tab label="Инвестиции" />
        <Tab label="Скидки" />
        <Tab label="Промокоды" />
        <Tab label="Программы лояльности" />
      </Tabs>

      {/* ── Tab 0: Рекл. каналы ── */}
      {tab === 0 && (
        <Box>
          <DataTable
            columns={[
              { key: 'name', label: 'Название' },
              { key: 'channel_type', label: 'Тип' },
              { key: 'url', label: 'URL', render: (v: string) => v ? <Link href={v} target="_blank" rel="noopener">{v}</Link> : '—' },
              { key: 'is_active', label: 'Активен', render: (v: boolean) => boolChip(v) },
              { key: '_actions', label: '', width: 100, render: (_: any, row: AdChannel) => (
                <Box sx={{ display: 'flex', gap: 0.5 }}>
                  <IconButton size="small" onClick={(e) => { e.stopPropagation(); openChDlg(row) }}><Edit fontSize="small" /></IconButton>
                  <IconButton size="small" color="error" onClick={(e) => { e.stopPropagation(); setDelCh(row) }}><Delete fontSize="small" /></IconButton>
                </Box>
              )},
            ]}
            rows={channels}
            loading={chLoad}
            headerActions={<Button variant="contained" startIcon={<Add />} onClick={() => openChDlg()}>Добавить канал</Button>}
          />
          <EntityFormDialog open={chDlg} onClose={() => setChDlg(false)} onSubmit={saveCh} title={editCh ? 'Редактировать канал' : 'Новый канал'} loading={chSaving}>
            <Grid container spacing={2}>
              <Grid size={12}><TextField fullWidth label="Название" value={chForm.name} onChange={e => setChForm({ ...chForm, name: e.target.value })} /></Grid>
              <Grid size={12}><TextField fullWidth label="Тип канала" value={chForm.channel_type} onChange={e => setChForm({ ...chForm, channel_type: e.target.value })} /></Grid>
              <Grid size={12}><TextField fullWidth label="URL" value={chForm.url} onChange={e => setChForm({ ...chForm, url: e.target.value })} /></Grid>
              <Grid size={12}><FormControlLabel control={<Switch checked={chForm.is_active} onChange={e => setChForm({ ...chForm, is_active: e.target.checked })} />} label="Активен" /></Grid>
            </Grid>
          </EntityFormDialog>
          <ConfirmDialog open={!!delCh} onCancel={() => setDelCh(null)} onConfirm={removeCh} title="Удалить канал?" message={`Удалить канал «${delCh?.name}»?`} />
        </Box>
      )}

      {/* ── Tab 1: Инвестиции ── */}
      {tab === 1 && (
        <Box>
          <DataTable
            columns={[
              { key: 'channel_name', label: 'Канал' },
              { key: 'amount', label: 'Сумма', align: 'right' as const, render: (v: string) => fmtCur(v) },
              { key: 'date', label: 'Дата', render: (v: string) => fmtDate(v) },
              { key: 'description', label: 'Описание' },
              { key: '_actions', label: '', width: 100, render: (_: any, row: AdInvestment) => (
                <Box sx={{ display: 'flex', gap: 0.5 }}>
                  <IconButton size="small" onClick={(e) => { e.stopPropagation(); openInvDlg(row) }}><Edit fontSize="small" /></IconButton>
                  <IconButton size="small" color="error" onClick={(e) => { e.stopPropagation(); setDelInv(row) }}><Delete fontSize="small" /></IconButton>
                </Box>
              )},
            ]}
            rows={investments}
            loading={invLoad}
            headerActions={<Button variant="contained" startIcon={<Add />} onClick={() => openInvDlg()}>Добавить инвестицию</Button>}
          />
          <EntityFormDialog open={invDlg} onClose={() => setInvDlg(false)} onSubmit={saveInv} title={editInv ? 'Редактировать инвестицию' : 'Новая инвестиция'} loading={invSaving}>
            <Grid container spacing={2}>
              <Grid size={12}>
                <TextField fullWidth select label="Канал" value={invForm.channel} onChange={e => setInvForm({ ...invForm, channel: e.target.value })}>
                  {channels.map(c => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
                </TextField>
              </Grid>
              <Grid size={6}><TextField fullWidth label="Сумма" type="number" value={invForm.amount} onChange={e => setInvForm({ ...invForm, amount: e.target.value })} /></Grid>
              <Grid size={6}><TextField fullWidth label="Дата" type="date" value={invForm.date} onChange={e => setInvForm({ ...invForm, date: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} /></Grid>
              <Grid size={12}><TextField fullWidth label="Описание" multiline rows={2} value={invForm.description} onChange={e => setInvForm({ ...invForm, description: e.target.value })} /></Grid>
            </Grid>
          </EntityFormDialog>
          <ConfirmDialog open={!!delInv} onCancel={() => setDelInv(null)} onConfirm={removeInv} title="Удалить инвестицию?" message={`Удалить инвестицию на сумму ${delInv ? fmtCur(delInv.amount) : ''}?`} />
        </Box>
      )}

      {/* ── Tab 2: Скидки ── */}
      {tab === 2 && (
        <Box>
          <DataTable
            columns={[
              { key: 'name', label: 'Название' },
              { key: 'discount_type', label: 'Тип', render: (v: string) => chipFromList(DISCOUNT_TYPES, v) },
              { key: 'value', label: 'Значение' },
              { key: 'apply_to', label: 'Применение', render: (v: string) => chipFromList(APPLY_TO, v) },
              { key: 'min_purchase', label: 'Мин. покупка', render: (v: string) => v ? fmtCur(v) : '—' },
              { key: 'is_active', label: 'Активна', render: (v: boolean) => boolChip(v) },
              { key: 'start_date', label: 'Период', render: (_: any, row: Discount) => `${fmtDate(row.start_date)} — ${fmtDate(row.end_date)}` },
              { key: '_actions', label: '', width: 100, render: (_: any, row: Discount) => (
                <Box sx={{ display: 'flex', gap: 0.5 }}>
                  <IconButton size="small" onClick={(e) => { e.stopPropagation(); openDiscDlg(row) }}><Edit fontSize="small" /></IconButton>
                  <IconButton size="small" color="error" onClick={(e) => { e.stopPropagation(); setDelDisc(row) }}><Delete fontSize="small" /></IconButton>
                </Box>
              )},
            ]}
            rows={discounts}
            loading={discLoad}
            headerActions={<Button variant="contained" startIcon={<Add />} onClick={() => openDiscDlg()}>Добавить скидку</Button>}
          />
          <EntityFormDialog open={discDlg} onClose={() => setDiscDlg(false)} onSubmit={saveDisc} title={editDisc ? 'Редактировать скидку' : 'Новая скидка'} loading={discSaving}>
            <Grid container spacing={2}>
              <Grid size={12}><TextField fullWidth label="Название" value={discForm.name} onChange={e => setDiscForm({ ...discForm, name: e.target.value })} /></Grid>
              <Grid size={6}>
                <TextField fullWidth select label="Тип скидки" value={discForm.discount_type} onChange={e => setDiscForm({ ...discForm, discount_type: e.target.value })}>
                  {DISCOUNT_TYPES.map(t => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
                </TextField>
              </Grid>
              <Grid size={6}><TextField fullWidth label="Значение" type="number" value={discForm.value} onChange={e => setDiscForm({ ...discForm, value: e.target.value })} /></Grid>
              <Grid size={6}>
                <TextField fullWidth select label="Применение" value={discForm.apply_to} onChange={e => setDiscForm({ ...discForm, apply_to: e.target.value })}>
                  {APPLY_TO.map(t => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
                </TextField>
              </Grid>
              <Grid size={6}><TextField fullWidth label="Мин. покупка" type="number" value={discForm.min_purchase} onChange={e => setDiscForm({ ...discForm, min_purchase: e.target.value })} /></Grid>
              <Grid size={6}><TextField fullWidth label="Начало" type="datetime-local" value={discForm.start_date} onChange={e => setDiscForm({ ...discForm, start_date: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} /></Grid>
              <Grid size={6}><TextField fullWidth label="Окончание" type="datetime-local" value={discForm.end_date} onChange={e => setDiscForm({ ...discForm, end_date: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} /></Grid>
              <Grid size={12}><FormControlLabel control={<Switch checked={discForm.is_active} onChange={e => setDiscForm({ ...discForm, is_active: e.target.checked })} />} label="Активна" /></Grid>
            </Grid>
          </EntityFormDialog>
          <ConfirmDialog open={!!delDisc} onCancel={() => setDelDisc(null)} onConfirm={removeDisc} title="Удалить скидку?" message={`Удалить скидку «${delDisc?.name}»?`} />
        </Box>
      )}

      {/* ── Tab 3: Промокоды ── */}
      {tab === 3 && (
        <Box>
          <DataTable
            columns={[
              { key: 'code', label: 'Код', render: (v: string) => <Typography sx={{ fontWeight: 700, fontFamily: 'monospace' }}>{v}</Typography> },
              { key: 'discount', label: 'Скидка', render: (v: string) => discountName(v) },
              { key: 'max_uses', label: 'Макс. исп.' },
              { key: 'used_count', label: 'Использовано' },
              { key: 'is_active', label: 'Активен', render: (v: boolean) => boolChip(v) },
              { key: 'start_date', label: 'Период', render: (_: any, row: PromoCode) => `${fmtDate(row.start_date)} — ${fmtDate(row.end_date)}` },
              { key: '_actions', label: '', width: 100, render: (_: any, row: PromoCode) => (
                <Box sx={{ display: 'flex', gap: 0.5 }}>
                  <IconButton size="small" onClick={(e) => { e.stopPropagation(); openPromoDlg(row) }}><Edit fontSize="small" /></IconButton>
                  <IconButton size="small" color="error" onClick={(e) => { e.stopPropagation(); setDelPromo(row) }}><Delete fontSize="small" /></IconButton>
                </Box>
              )},
            ]}
            rows={promos}
            loading={promoLoad}
            headerActions={<Button variant="contained" startIcon={<Add />} onClick={() => openPromoDlg()}>Добавить промокод</Button>}
          />
          <EntityFormDialog open={promoDlg} onClose={() => setPromoDlg(false)} onSubmit={savePromo} title={editPromo ? 'Редактировать промокод' : 'Новый промокод'} loading={promoSaving}>
            <Grid container spacing={2}>
              <Grid size={12}><TextField fullWidth label="Код" value={promoForm.code} onChange={e => setPromoForm({ ...promoForm, code: e.target.value })} /></Grid>
              <Grid size={6}>
                <TextField fullWidth select label="Скидка" value={promoForm.discount} onChange={e => setPromoForm({ ...promoForm, discount: e.target.value })}>
                  {discounts.map(d => <MenuItem key={d.id} value={d.id}>{d.name}</MenuItem>)}
                </TextField>
              </Grid>
              <Grid size={6}><TextField fullWidth label="Макс. использований" type="number" value={promoForm.max_uses} onChange={e => setPromoForm({ ...promoForm, max_uses: e.target.value })} /></Grid>
              <Grid size={6}><TextField fullWidth label="Начало" type="datetime-local" value={promoForm.start_date} onChange={e => setPromoForm({ ...promoForm, start_date: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} /></Grid>
              <Grid size={6}><TextField fullWidth label="Окончание" type="datetime-local" value={promoForm.end_date} onChange={e => setPromoForm({ ...promoForm, end_date: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} /></Grid>
              <Grid size={12}><FormControlLabel control={<Switch checked={promoForm.is_active} onChange={e => setPromoForm({ ...promoForm, is_active: e.target.checked })} />} label="Активен" /></Grid>
            </Grid>
          </EntityFormDialog>
          <ConfirmDialog open={!!delPromo} onCancel={() => setDelPromo(null)} onConfirm={removePromo} title="Удалить промокод?" message={`Удалить промокод «${delPromo?.code}»?`} />
        </Box>
      )}

      {/* ── Tab 4: Программы лояльности ── */}
      {tab === 4 && (
        <Box>
          <DataTable
            columns={[
              { key: 'name', label: 'Название' },
              { key: 'program_type', label: 'Тип', render: (v: string) => chipFromList(PROGRAM_TYPES, v) },
              { key: 'accrual_percent', label: 'Начисление %' },
              { key: 'max_payment_percent', label: 'Макс. оплата %' },
              { key: 'is_active', label: 'Активна', render: (v: boolean) => boolChip(v) },
              { key: '_actions', label: '', width: 100, render: (_: any, row: LoyaltyProgram) => (
                <Box sx={{ display: 'flex', gap: 0.5 }}>
                  <IconButton size="small" onClick={(e) => { e.stopPropagation(); openLoyDlg(row) }}><Edit fontSize="small" /></IconButton>
                  <IconButton size="small" color="error" onClick={(e) => { e.stopPropagation(); setDelLoy(row) }}><Delete fontSize="small" /></IconButton>
                </Box>
              )},
            ]}
            rows={loyalties}
            loading={loyLoad}
            headerActions={<Button variant="contained" startIcon={<Add />} onClick={() => openLoyDlg()}>Добавить программу</Button>}
          />
          <EntityFormDialog open={loyDlg} onClose={() => setLoyDlg(false)} onSubmit={saveLoy} title={editLoy ? 'Редактировать программу' : 'Новая программа'} loading={loySaving}>
            <Grid container spacing={2}>
              <Grid size={12}><TextField fullWidth label="Название" value={loyForm.name} onChange={e => setLoyForm({ ...loyForm, name: e.target.value })} /></Grid>
              <Grid size={12}>
                <TextField fullWidth select label="Тип программы" value={loyForm.program_type} onChange={e => setLoyForm({ ...loyForm, program_type: e.target.value })}>
                  {PROGRAM_TYPES.map(t => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
                </TextField>
              </Grid>
              <Grid size={6}><TextField fullWidth label="Начисление %" type="number" value={loyForm.accrual_percent} onChange={e => setLoyForm({ ...loyForm, accrual_percent: e.target.value })} /></Grid>
              <Grid size={6}><TextField fullWidth label="Макс. оплата %" type="number" value={loyForm.max_payment_percent} onChange={e => setLoyForm({ ...loyForm, max_payment_percent: e.target.value })} /></Grid>
              <Grid size={12}><FormControlLabel control={<Switch checked={loyForm.is_active} onChange={e => setLoyForm({ ...loyForm, is_active: e.target.checked })} />} label="Активна" /></Grid>
            </Grid>
          </EntityFormDialog>
          <ConfirmDialog open={!!delLoy} onCancel={() => setDelLoy(null)} onConfirm={removeLoy} title="Удалить программу?" message={`Удалить программу «${delLoy?.name}»?`} />
        </Box>
      )}
    </Box>
  )
}
