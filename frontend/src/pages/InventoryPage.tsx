import { useState, useEffect, useCallback } from 'react'
import {
  Box, Typography, Tab, Tabs, Card, CardContent, Chip,
  TextField, MenuItem, IconButton, Button, Dialog, DialogTitle, DialogContent, DialogActions,
} from '@mui/material'
import Grid from '@mui/material/Grid2'
import { Add, Edit, Delete, Inventory2, LocalShipping, SwapHoriz, AutoAwesome, CallSplit } from '@mui/icons-material'
import api from '../api'
import { useNotification } from '../contexts/NotificationContext'
import extractError from '../utils/extractError'
import DataTable from '../components/DataTable'
import EntityFormDialog from '../components/EntityFormDialog'
import ConfirmDialog from '../components/ConfirmDialog'

// ─── Types ───
interface StockBalance {
  id: string; organization: string; warehouse: string; nomenclature: string
  quantity: string; avg_purchase_price: string; updated_at: string
  nomenclature_name: string; warehouse_name: string
}
interface Batch {
  id: string; organization: string; nomenclature: string; supplier: string
  warehouse: string; purchase_price: string; quantity: string; remaining: string
  arrival_date: string; expiry_date: string | null; invoice_number: string
  notes: string; created_at: string; nomenclature_name: string; warehouse_name: string
}
interface StockMovement {
  id: string; organization: string; nomenclature: string; movement_type: string
  warehouse_from: string | null; warehouse_to: string | null; batch: string | null
  quantity: string; price: string; write_off_reason: string; user: string
  notes: string; created_at: string; nomenclature_name: string
}
interface Ref { id: string; name: string }
interface NomRef { id: string; name: string; nomenclature_type: string; purchase_price: string }
interface BouquetComponent { nomenclature: string; quantity: string; nomenclature_name: string }
interface BouquetTemplateRef {
  id: string; nomenclature: string; components: BouquetComponent[]
}

// ─── Constants ───
const MOVEMENT_TYPES: { value: string; label: string; color: 'success' | 'error' | 'info' | 'warning' | 'primary' | 'secondary' | 'default' }[] = [
  { value: 'receipt', label: 'Поступление', color: 'success' },
  { value: 'write_off', label: 'Списание', color: 'error' },
  { value: 'transfer', label: 'Перемещение', color: 'info' },
  { value: 'sale', label: 'Продажа', color: 'primary' },
  { value: 'return', label: 'Возврат', color: 'warning' },
  { value: 'adjustment', label: 'Корректировка', color: 'secondary' },
  { value: 'assembly', label: 'Сборка', color: 'default' },
]

const WRITE_OFF_REASONS = [
  { value: 'expired', label: 'Истёк срок' },
  { value: 'damaged', label: 'Повреждение' },
  { value: 'lost', label: 'Потеря' },
  { value: 'defect', label: 'Дефект' },
  { value: 'other', label: 'Другое' },
]

const fmtDate = (v: string) => v ? new Date(v).toLocaleDateString('ru-RU') : '—'
const fmtDateTime = (v: string) => v ? new Date(v).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' }) : '—'
const fmtNum = (v: string | number) => v != null ? parseFloat(String(v)).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'

export default function InventoryPage() {
  const { notify } = useNotification()
  const [tab, setTab] = useState(0)

  // ─── Helper data ───
  const [warehouses, setWarehouses] = useState<Ref[]>([])
  const [nomenclatures, setNomenclatures] = useState<Ref[]>([])
  const [suppliers, setSuppliers] = useState<Ref[]>([])
  const [allNom, setAllNom] = useState<NomRef[]>([])
  const [bouquetTemplates, setBouquetTemplates] = useState<BouquetTemplateRef[]>([])

  const fetchHelpers = useCallback(async () => {
    try {
      const [whRes, nomRes, supRes, tplRes] = await Promise.all([
        api.get('/core/warehouses/'),
        api.get('/nomenclature/items/'),
        api.get('/suppliers/suppliers/'),
        api.get('/nomenclature/bouquet-templates/'),
      ])
      setWarehouses(whRes.data.results || whRes.data || [])
      const nomList = nomRes.data.results || nomRes.data || []
      setNomenclatures(nomList)
      setAllNom(nomList)
      setSuppliers(supRes.data.results || supRes.data || [])
      setBouquetTemplates(tplRes.data.results || tplRes.data || [])
    } catch (err) { notify(extractError(err, 'Ошибка загрузки справочников'), 'error') }
  }, [notify])

  useEffect(() => { fetchHelpers() }, [fetchHelpers])

  // ═══════════════════════════════════════════
  // Tab 0 — Остатки (read-only)
  // ═══════════════════════════════════════════
  const [stock, setStock] = useState<StockBalance[]>([])
  const [stockLoad, setStockLoad] = useState(false)
  const [stockWh, setStockWh] = useState('')
  const [stockSearch, setStockSearch] = useState('')

  const fetchStock = useCallback(() => {
    setStockLoad(true)
    const params: Record<string, string> = {}
    if (stockWh) params.warehouse = stockWh
    if (stockSearch) params.search = stockSearch
    api.get('/inventory/stock/', { params })
      .then(res => setStock(res.data.results || res.data || []))
      .catch(() => { setStock([]); notify('Ошибка загрузки остатков', 'error') })
      .finally(() => setStockLoad(false))
  }, [stockWh, stockSearch, notify])

  useEffect(() => { if (tab === 0) fetchStock() }, [tab, fetchStock])

  // ═══════════════════════════════════════════
  // Tab 1 — Партии (CRUD)
  // ═══════════════════════════════════════════
  const [batches, setBatches] = useState<Batch[]>([])
  const [bLoad, setBLoad] = useState(false)
  const [bDlg, setBDlg] = useState(false)
  const [editB, setEditB] = useState<Batch | null>(null)
  const [bForm, setBForm] = useState({ nomenclature: '', warehouse: '', supplier: '', purchase_price: '', quantity: '', remaining: '', arrival_date: '', expiry_date: '', invoice_number: '', notes: '' })
  const [delB, setDelB] = useState<Batch | null>(null)

  const fetchBatches = useCallback(() => {
    setBLoad(true)
    api.get('/inventory/batches/')
      .then(res => setBatches(res.data.results || res.data || []))
      .catch(() => { setBatches([]); notify('Ошибка загрузки партий', 'error') })
      .finally(() => setBLoad(false))
  }, [notify])

  useEffect(() => { if (tab === 1) fetchBatches() }, [tab, fetchBatches])

  const openBDlg = (b?: Batch) => {
    if (b) {
      setEditB(b)
      setBForm({
        nomenclature: b.nomenclature, warehouse: b.warehouse, supplier: b.supplier || '',
        purchase_price: b.purchase_price, quantity: b.quantity, remaining: b.remaining,
        arrival_date: b.arrival_date || '', expiry_date: b.expiry_date || '',
        invoice_number: b.invoice_number || '', notes: b.notes || '',
      })
    } else {
      setEditB(null)
      setBForm({ nomenclature: '', warehouse: '', supplier: '', purchase_price: '', quantity: '', remaining: '', arrival_date: '', expiry_date: '', invoice_number: '', notes: '' })
    }
    setBDlg(true)
  }

  const saveB = async () => {
    try {
      const d = { ...bForm, expiry_date: bForm.expiry_date || null }
      if (editB) { await api.patch(`/inventory/batches/${editB.id}/`, d); notify('Партия обновлена') }
      else { await api.post('/inventory/batches/', d); notify('Партия создана') }
      setBDlg(false); fetchBatches()
    } catch (err) { notify(extractError(err, 'Ошибка сохранения'), 'error') }
  }

  const removeB = async () => {
    if (!delB) return
    try { await api.delete(`/inventory/batches/${delB.id}/`); notify('Партия удалена'); setDelB(null); fetchBatches() }
    catch (err) { notify(extractError(err, 'Ошибка удаления'), 'error') }
  }

  // ═══════════════════════════════════════════
  // Tab 2 — Движения (CRUD)
  // ═══════════════════════════════════════════
  const [moves, setMoves] = useState<StockMovement[]>([])
  const [mLoad, setMLoad] = useState(false)
  const [mDlg, setMDlg] = useState(false)
  const [editM, setEditM] = useState<StockMovement | null>(null)
  const [mForm, setMForm] = useState({ nomenclature: '', movement_type: 'receipt', warehouse_from: '', warehouse_to: '', quantity: '', price: '', write_off_reason: '', notes: '' })
  const [delM, setDelM] = useState<StockMovement | null>(null)

  const fetchMoves = useCallback(() => {
    setMLoad(true)
    api.get('/inventory/movements/')
      .then(res => setMoves(res.data.results || res.data || []))
      .catch(() => { setMoves([]); notify('Ошибка загрузки движений', 'error') })
      .finally(() => setMLoad(false))
  }, [notify])

  useEffect(() => { if (tab === 2) fetchMoves() }, [tab, fetchMoves])

  const openMDlg = (m?: StockMovement) => {
    if (m) {
      setEditM(m)
      setMForm({
        nomenclature: m.nomenclature, movement_type: m.movement_type,
        warehouse_from: m.warehouse_from || '', warehouse_to: m.warehouse_to || '',
        quantity: m.quantity, price: m.price || '',
        write_off_reason: m.write_off_reason || '', notes: m.notes || '',
      })
    } else {
      setEditM(null)
      setMForm({ nomenclature: '', movement_type: 'receipt', warehouse_from: '', warehouse_to: '', quantity: '', price: '', write_off_reason: '', notes: '' })
    }
    setMDlg(true)
  }

  const saveM = async () => {
    try {
      const d = {
        ...mForm,
        warehouse_from: mForm.warehouse_from || null,
        warehouse_to: mForm.warehouse_to || null,
        write_off_reason: mForm.movement_type === 'write_off' ? mForm.write_off_reason : '',
      }
      if (editM) { await api.patch(`/inventory/movements/${editM.id}/`, d); notify('Движение обновлено') }
      else { await api.post('/inventory/movements/', d); notify('Движение создано') }
      setMDlg(false); fetchMoves()
    } catch (err) { notify(extractError(err, 'Ошибка сохранения'), 'error') }
  }

  const removeM = async () => {
    if (!delM) return
    try { await api.delete(`/inventory/movements/${delM.id}/`); notify('Движение удалено'); setDelM(null); fetchMoves() }
    catch (err) { notify(extractError(err, 'Ошибка удаления'), 'error') }
  }

  // ─── Helpers for display ───
  const whName = (id: string | null) => warehouses.find(w => w.id === id)?.name || '—'
  const mtChip = (v: string) => {
    const mt = MOVEMENT_TYPES.find(t => t.value === v)
    return <Chip label={mt?.label || v} size="small" color={mt?.color || 'default'} />
  }

  // ═══════════════════════════════════════════
  // Assembly / Disassembly
  // ═══════════════════════════════════════════
  const [asmDlg, setAsmDlg] = useState(false)
  const [asmForm, setAsmForm] = useState({ nomenclature_bouquet: '', warehouse_from: '', warehouse_to: '', quantity: '1' })
  const [asmComponents, setAsmComponents] = useState<BouquetComponent[]>([])
  const [asmSaving, setAsmSaving] = useState(false)

  const [dasmDlg, setDasmDlg] = useState(false)
  const [dasmForm, setDasmForm] = useState({ nomenclature_bouquet: '', warehouse: '' })
  const [dasmRows, setDasmRows] = useState<{ nomenclature: string; name: string; return_qty: string; writeoff_qty: string; reason: string }[]>([])
  const [dasmSaving, setDasmSaving] = useState(false)

  const bouquetNoms = allNom.filter(n => n.nomenclature_type === 'bouquet' || n.nomenclature_type === 'composition')

  const openAsmDlg = () => {
    setAsmForm({ nomenclature_bouquet: '', warehouse_from: '', warehouse_to: '', quantity: '1' })
    setAsmComponents([])
    setAsmDlg(true)
  }

  const handleAsmBouquetChange = (nomId: string) => {
    setAsmForm(f => ({ ...f, nomenclature_bouquet: nomId }))
    const tpl = bouquetTemplates.find(t => t.nomenclature === nomId)
    if (tpl && tpl.components?.length) {
      setAsmComponents(tpl.components.map(c => ({
        nomenclature: c.nomenclature,
        nomenclature_name: c.nomenclature_name || allNom.find(n => n.id === c.nomenclature)?.name || '?',
        quantity: c.quantity,
      })))
    } else {
      setAsmComponents([])
    }
  }

  const submitAssembly = async () => {
    setAsmSaving(true)
    try {
      const tpl = bouquetTemplates.find(t => t.nomenclature === asmForm.nomenclature_bouquet)
      const payload: Record<string, any> = {
        nomenclature_bouquet: asmForm.nomenclature_bouquet,
        warehouse_from: asmForm.warehouse_from,
        warehouse_to: asmForm.warehouse_to,
        quantity: parseInt(asmForm.quantity) || 1,
      }
      if (tpl) {
        payload.use_template = true
      } else {
        payload.use_template = false
        payload.components = asmComponents
          .filter(c => c.nomenclature && parseFloat(c.quantity) > 0)
          .map(c => ({ nomenclature: c.nomenclature, quantity: c.quantity }))
      }
      const res = await api.post('/inventory/movements/assemble-bouquet/', payload)
      notify(res.data.message || 'Букет собран!')
      setAsmDlg(false)
      if (tab === 0) fetchStock()
      if (tab === 1) fetchBatches()
      if (tab === 2) fetchMoves()
    } catch (err) { notify(extractError(err, 'Ошибка сборки букета'), 'error') }
    setAsmSaving(false)
  }

  const openDasmDlg = () => {
    setDasmForm({ nomenclature_bouquet: '', warehouse: '' })
    setDasmRows([])
    setDasmDlg(true)
  }

  const handleDasmBouquetChange = (nomId: string) => {
    setDasmForm(f => ({ ...f, nomenclature_bouquet: nomId }))
    const tpl = bouquetTemplates.find(t => t.nomenclature === nomId)
    if (tpl && tpl.components?.length) {
      setDasmRows(tpl.components.map(c => ({
        nomenclature: c.nomenclature,
        name: c.nomenclature_name || allNom.find(n => n.id === c.nomenclature)?.name || '?',
        return_qty: c.quantity,
        writeoff_qty: '0',
        reason: 'other',
      })))
    } else {
      setDasmRows([])
    }
  }

  const submitDisassembly = async () => {
    setDasmSaving(true)
    try {
      const return_items = dasmRows
        .filter(r => parseFloat(r.return_qty) > 0)
        .map(r => ({ nomenclature: r.nomenclature, quantity: r.return_qty }))
      const writeoff_items = dasmRows
        .filter(r => parseFloat(r.writeoff_qty) > 0)
        .map(r => ({ nomenclature: r.nomenclature, quantity: r.writeoff_qty, reason: r.reason }))
      const res = await api.post('/inventory/movements/disassemble-bouquet/', {
        nomenclature_bouquet: dasmForm.nomenclature_bouquet,
        warehouse: dasmForm.warehouse,
        return_items,
        writeoff_items,
      })
      notify(res.data.message || 'Букет раскомплектован!')
      setDasmDlg(false)
      if (tab === 0) fetchStock()
      if (tab === 1) fetchBatches()
      if (tab === 2) fetchMoves()
    } catch (err) { notify(extractError(err, 'Ошибка раскомплектовки'), 'error') }
    setDasmSaving(false)
  }

  // ═══════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════
  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <Typography variant="h5" fontWeight={700} sx={{ flex: 1 }}>Склад</Typography>
        <Button variant="outlined" startIcon={<AutoAwesome />} onClick={openAsmDlg}>Собрать букет</Button>
        <Button variant="outlined" color="warning" startIcon={<CallSplit />} onClick={openDasmDlg}>Раскомплектовать</Button>
      </Box>
      <Card>
        <CardContent>
          <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}>
            <Tab icon={<Inventory2 />} iconPosition="start" label="Остатки" />
            <Tab icon={<LocalShipping />} iconPosition="start" label="Партии" />
            <Tab icon={<SwapHoriz />} iconPosition="start" label="Движения" />
          </Tabs>

          {/* ── Tab 0: Остатки ── */}
          {tab === 0 && (
            <>
              <Grid container spacing={2} sx={{ mb: 2 }}>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <TextField select fullWidth size="small" label="Склад" value={stockWh}
                    onChange={e => setStockWh(e.target.value)}>
                    <MenuItem value="">Все склады</MenuItem>
                    {warehouses.map(w => <MenuItem key={w.id} value={w.id}>{w.name}</MenuItem>)}
                  </TextField>
                </Grid>
              </Grid>
              <DataTable
                columns={[
                  { key: 'nomenclature_name', label: 'Номенклатура', render: (v: string) => <Typography fontWeight={500}>{v}</Typography> },
                  { key: 'warehouse_name', label: 'Склад' },
                  { key: 'quantity', label: 'Кол-во', align: 'right', render: (v: string) => fmtNum(v) },
                  { key: 'avg_purchase_price', label: 'Ср. цена', align: 'right', render: (v: string) => `${fmtNum(v)} ₽` },
                  { key: '_total', label: 'Сумма', align: 'right', render: (_: any, row: StockBalance) => `${fmtNum(parseFloat(row.quantity) * parseFloat(row.avg_purchase_price))} ₽` },
                  { key: 'updated_at', label: 'Обновлено', render: (v: string) => fmtDateTime(v) },
                ]}
                rows={stock} loading={stockLoad} emptyText="Остатков нет"
                search={stockSearch} onSearchChange={setStockSearch} searchPlaceholder="Поиск по номенклатуре..."
              />
            </>
          )}

          {/* ── Tab 1: Партии ── */}
          {tab === 1 && (
            <DataTable
              columns={[
                { key: 'nomenclature_name', label: 'Номенклатура', render: (v: string) => <Typography fontWeight={500}>{v}</Typography> },
                { key: 'warehouse_name', label: 'Склад' },
                { key: 'purchase_price', label: 'Цена закупки', align: 'right', render: (v: string) => `${fmtNum(v)} ₽` },
                { key: 'quantity', label: 'Кол-во', align: 'right', render: (v: string) => fmtNum(v) },
                { key: 'remaining', label: 'Остаток', align: 'right', render: (v: string) => fmtNum(v) },
                { key: 'arrival_date', label: 'Поступление', render: (v: string) => fmtDate(v) },
                { key: 'expiry_date', label: 'Годен до', render: (v: string) => fmtDate(v) },
                { key: 'invoice_number', label: 'Накладная' },
                { key: '_act', label: '', align: 'center', width: 100, render: (_: any, row: Batch) => (<>
                  <IconButton size="small" onClick={() => openBDlg(row)}><Edit fontSize="small" /></IconButton>
                  <IconButton size="small" onClick={() => setDelB(row)}><Delete fontSize="small" /></IconButton>
                </>) },
              ]}
              rows={batches} loading={bLoad} emptyText="Партий нет"
              headerActions={<Button variant="contained" startIcon={<Add />} onClick={() => openBDlg()}>Добавить партию</Button>}
            />
          )}

          {/* ── Tab 2: Движения ── */}
          {tab === 2 && (
            <DataTable
              columns={[
                { key: 'created_at', label: 'Дата', render: (v: string) => fmtDateTime(v) },
                { key: 'movement_type', label: 'Тип', render: (v: string) => mtChip(v) },
                { key: 'nomenclature_name', label: 'Номенклатура', render: (v: string) => <Typography fontWeight={500}>{v}</Typography> },
                { key: 'quantity', label: 'Кол-во', align: 'right', render: (v: string) => fmtNum(v) },
                { key: 'price', label: 'Цена', align: 'right', render: (v: string) => v ? `${fmtNum(v)} ₽` : '—' },
                { key: 'warehouse_from', label: 'Откуда', render: (v: string | null) => whName(v) },
                { key: 'warehouse_to', label: 'Куда', render: (v: string | null) => whName(v) },
                { key: '_act', label: '', align: 'center', width: 100, render: (_: any, row: StockMovement) => (<>
                  <IconButton size="small" onClick={() => openMDlg(row)}><Edit fontSize="small" /></IconButton>
                  <IconButton size="small" onClick={() => setDelM(row)}><Delete fontSize="small" /></IconButton>
                </>) },
              ]}
              rows={moves} loading={mLoad} emptyText="Движений нет"
              headerActions={<Button variant="contained" startIcon={<Add />} onClick={() => openMDlg()}>Добавить движение</Button>}
            />
          )}
        </CardContent>
      </Card>

      {/* ── Batch Dialog ── */}
      <EntityFormDialog open={bDlg} onClose={() => setBDlg(false)} onSubmit={saveB}
        title={editB ? 'Редактировать партию' : 'Новая партия'} submitText={editB ? 'Сохранить' : 'Создать'}
        disabled={!bForm.nomenclature || !bForm.warehouse || !bForm.purchase_price || !bForm.quantity}>
        <TextField label="Номенклатура" required select fullWidth value={bForm.nomenclature}
          onChange={e => setBForm({ ...bForm, nomenclature: e.target.value })}>
          {nomenclatures.map(n => <MenuItem key={n.id} value={n.id}>{n.name}</MenuItem>)}
        </TextField>
        <TextField label="Склад" required select fullWidth value={bForm.warehouse}
          onChange={e => setBForm({ ...bForm, warehouse: e.target.value })}>
          {warehouses.map(w => <MenuItem key={w.id} value={w.id}>{w.name}</MenuItem>)}
        </TextField>
        <TextField label="Поставщик" select fullWidth value={bForm.supplier}
          onChange={e => setBForm({ ...bForm, supplier: e.target.value })}>
          <MenuItem value="">— не выбран —</MenuItem>
          {suppliers.map(s => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
        </TextField>
        <Grid container spacing={2}>
          <Grid size={{ xs: 6 }}>
            <TextField label="Цена закупки" required type="number" fullWidth value={bForm.purchase_price}
              onChange={e => setBForm({ ...bForm, purchase_price: e.target.value })} />
          </Grid>
          <Grid size={{ xs: 6 }}>
            <TextField label="Количество" required type="number" fullWidth value={bForm.quantity}
              onChange={e => setBForm({ ...bForm, quantity: e.target.value })} />
          </Grid>
        </Grid>
        <TextField label="Остаток" type="number" fullWidth value={bForm.remaining}
          onChange={e => setBForm({ ...bForm, remaining: e.target.value })} />
        <Grid container spacing={2}>
          <Grid size={{ xs: 6 }}>
            <TextField label="Дата поступления" type="date" fullWidth value={bForm.arrival_date}
              onChange={e => setBForm({ ...bForm, arrival_date: e.target.value })}
              slotProps={{ inputLabel: { shrink: true } }} />
          </Grid>
          <Grid size={{ xs: 6 }}>
            <TextField label="Годен до" type="date" fullWidth value={bForm.expiry_date}
              onChange={e => setBForm({ ...bForm, expiry_date: e.target.value })}
              slotProps={{ inputLabel: { shrink: true } }} />
          </Grid>
        </Grid>
        <TextField label="Номер накладной" fullWidth value={bForm.invoice_number}
          onChange={e => setBForm({ ...bForm, invoice_number: e.target.value })} />
        <TextField label="Примечания" fullWidth multiline rows={2} value={bForm.notes}
          onChange={e => setBForm({ ...bForm, notes: e.target.value })} />
      </EntityFormDialog>

      {/* ── Movement Dialog ── */}
      <EntityFormDialog open={mDlg} onClose={() => setMDlg(false)} onSubmit={saveM}
        title={editM ? 'Редактировать движение' : 'Новое движение'} submitText={editM ? 'Сохранить' : 'Создать'}
        disabled={!mForm.nomenclature || !mForm.quantity}>
        <TextField label="Номенклатура" required select fullWidth value={mForm.nomenclature}
          onChange={e => setMForm({ ...mForm, nomenclature: e.target.value })}>
          {nomenclatures.map(n => <MenuItem key={n.id} value={n.id}>{n.name}</MenuItem>)}
        </TextField>
        <TextField label="Тип движения" required select fullWidth value={mForm.movement_type}
          onChange={e => setMForm({ ...mForm, movement_type: e.target.value })}>
          {MOVEMENT_TYPES.map(t => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
        </TextField>
        <Grid container spacing={2}>
          <Grid size={{ xs: 6 }}>
            <TextField label="Склад-источник" select fullWidth value={mForm.warehouse_from}
              onChange={e => setMForm({ ...mForm, warehouse_from: e.target.value })}>
              <MenuItem value="">— нет —</MenuItem>
              {warehouses.map(w => <MenuItem key={w.id} value={w.id}>{w.name}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid size={{ xs: 6 }}>
            <TextField label="Склад-получатель" select fullWidth value={mForm.warehouse_to}
              onChange={e => setMForm({ ...mForm, warehouse_to: e.target.value })}>
              <MenuItem value="">— нет —</MenuItem>
              {warehouses.map(w => <MenuItem key={w.id} value={w.id}>{w.name}</MenuItem>)}
            </TextField>
          </Grid>
        </Grid>
        <Grid container spacing={2}>
          <Grid size={{ xs: 6 }}>
            <TextField label="Количество" required type="number" fullWidth value={mForm.quantity}
              onChange={e => setMForm({ ...mForm, quantity: e.target.value })} />
          </Grid>
          <Grid size={{ xs: 6 }}>
            <TextField label="Цена" type="number" fullWidth value={mForm.price}
              onChange={e => setMForm({ ...mForm, price: e.target.value })} />
          </Grid>
        </Grid>
        {mForm.movement_type === 'write_off' && (
          <TextField label="Причина списания" select fullWidth value={mForm.write_off_reason}
            onChange={e => setMForm({ ...mForm, write_off_reason: e.target.value })}>
            {WRITE_OFF_REASONS.map(r => <MenuItem key={r.value} value={r.value}>{r.label}</MenuItem>)}
          </TextField>
        )}
        <TextField label="Примечания" fullWidth multiline rows={2} value={mForm.notes}
          onChange={e => setMForm({ ...mForm, notes: e.target.value })} />
      </EntityFormDialog>

      {/* ── Confirm Dialogs ── */}
      <ConfirmDialog open={!!delB} title="Удалить партию?" message={`Удалить партию "${delB?.nomenclature_name}"?`} onConfirm={removeB} onCancel={() => setDelB(null)} />
      <ConfirmDialog open={!!delM} title="Удалить движение?" message={`Удалить движение "${delM?.nomenclature_name}"?`} onConfirm={removeM} onCancel={() => setDelM(null)} />

      {/* ── Assembly Dialog ── */}
      <Dialog open={asmDlg} onClose={() => setAsmDlg(false)} maxWidth="md" fullWidth>
        <DialogTitle>Сборка букета</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          <TextField label="Букет" required select fullWidth value={asmForm.nomenclature_bouquet}
            onChange={e => handleAsmBouquetChange(e.target.value)}>
            {bouquetNoms.map(n => <MenuItem key={n.id} value={n.id}>{n.name}</MenuItem>)}
          </TextField>
          <Grid container spacing={2}>
            <Grid size={{ xs: 5 }}>
              <TextField label="Склад-источник" required select fullWidth value={asmForm.warehouse_from}
                onChange={e => setAsmForm({ ...asmForm, warehouse_from: e.target.value })}>
                {warehouses.map(w => <MenuItem key={w.id} value={w.id}>{w.name}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid size={{ xs: 5 }}>
              <TextField label="Склад-приёмник" required select fullWidth value={asmForm.warehouse_to}
                onChange={e => setAsmForm({ ...asmForm, warehouse_to: e.target.value })}>
                {warehouses.map(w => <MenuItem key={w.id} value={w.id}>{w.name}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid size={{ xs: 2 }}>
              <TextField label="Кол-во" type="number" fullWidth value={asmForm.quantity}
                onChange={e => setAsmForm({ ...asmForm, quantity: e.target.value })} />
            </Grid>
          </Grid>
          {asmComponents.length > 0 && (
            <Box>
              <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>Компоненты (из шаблона):</Typography>
              {asmComponents.map((c, i) => (
                <Box key={i} sx={{ display: 'flex', gap: 1, mb: 0.5, alignItems: 'center' }}>
                  <Typography variant="body2" sx={{ flex: 1 }}>{c.nomenclature_name}</Typography>
                  <Typography variant="body2" fontWeight={500}>
                    x{parseFloat(c.quantity) * (parseInt(asmForm.quantity) || 1)} шт.
                  </Typography>
                </Box>
              ))}
              <Typography variant="body2" sx={{ mt: 1, fontWeight: 500 }}>
                Расчётная себестоимость: {asmComponents.reduce((sum, c) => {
                  const nom = allNom.find(n => n.id === c.nomenclature)
                  return sum + (nom ? parseFloat(nom.purchase_price) * parseFloat(c.quantity) : 0)
                }, 0).toFixed(2)} р / шт.
              </Typography>
            </Box>
          )}
          {asmForm.nomenclature_bouquet && asmComponents.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              Шаблон не найден. Создайте шаблон в Номенклатура — Шаблоны букетов.
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAsmDlg(false)}>Отмена</Button>
          <Button variant="contained" onClick={submitAssembly}
            disabled={asmSaving || !asmForm.nomenclature_bouquet || !asmForm.warehouse_from || !asmForm.warehouse_to || asmComponents.length === 0}>
            {asmSaving ? 'Сборка...' : 'Собрать'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Disassembly Dialog ── */}
      <Dialog open={dasmDlg} onClose={() => setDasmDlg(false)} maxWidth="md" fullWidth>
        <DialogTitle>Раскомплектовка букета</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          <TextField label="Букет" required select fullWidth value={dasmForm.nomenclature_bouquet}
            onChange={e => handleDasmBouquetChange(e.target.value)}>
            {bouquetNoms.map(n => <MenuItem key={n.id} value={n.id}>{n.name}</MenuItem>)}
          </TextField>
          <TextField label="Склад" required select fullWidth value={dasmForm.warehouse}
            onChange={e => setDasmForm({ ...dasmForm, warehouse: e.target.value })}>
            {warehouses.map(w => <MenuItem key={w.id} value={w.id}>{w.name}</MenuItem>)}
          </TextField>
          {dasmRows.length > 0 && (
            <Box>
              <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
                Распределение компонентов (возврат / списание):
              </Typography>
              {dasmRows.map((r, i) => (
                <Grid container spacing={1} key={i} alignItems="center" sx={{ mb: 1 }}>
                  <Grid size={{ xs: 4 }}>
                    <Typography variant="body2">{r.name}</Typography>
                  </Grid>
                  <Grid size={{ xs: 2 }}>
                    <TextField label="Возврат" type="number" size="small" fullWidth value={r.return_qty}
                      onChange={e => {
                        const rows = [...dasmRows]; rows[i] = { ...rows[i], return_qty: e.target.value }; setDasmRows(rows)
                      }} />
                  </Grid>
                  <Grid size={{ xs: 2 }}>
                    <TextField label="Списание" type="number" size="small" fullWidth value={r.writeoff_qty}
                      onChange={e => {
                        const rows = [...dasmRows]; rows[i] = { ...rows[i], writeoff_qty: e.target.value }; setDasmRows(rows)
                      }} />
                  </Grid>
                  <Grid size={{ xs: 4 }}>
                    {parseFloat(r.writeoff_qty) > 0 && (
                      <TextField label="Причина" select size="small" fullWidth value={r.reason}
                        onChange={e => {
                          const rows = [...dasmRows]; rows[i] = { ...rows[i], reason: e.target.value }; setDasmRows(rows)
                        }}>
                        {WRITE_OFF_REASONS.map(wr => <MenuItem key={wr.value} value={wr.value}>{wr.label}</MenuItem>)}
                      </TextField>
                    )}
                  </Grid>
                </Grid>
              ))}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDasmDlg(false)}>Отмена</Button>
          <Button variant="contained" color="warning" onClick={submitDisassembly}
            disabled={dasmSaving || !dasmForm.nomenclature_bouquet || !dasmForm.warehouse || dasmRows.length === 0}>
            {dasmSaving ? 'Раскомплектовка...' : 'Раскомплектовать'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
