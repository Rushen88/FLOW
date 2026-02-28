import { useState, useEffect, useCallback } from 'react'
import {
  Box, Typography, Tab, Tabs, Card, CardContent, Chip,
  TextField, MenuItem, IconButton, Button, Dialog, DialogTitle, DialogContent, DialogActions,
  ToggleButtonGroup, ToggleButton,
} from '@mui/material'
import Grid from '@mui/material/Grid2'
import { Add, Edit, Delete, Inventory2, LocalShipping, SwapHoriz, RemoveCircleOutline, AutoAwesome, CallSplit, AutoFixHigh, ListAlt, Tune } from '@mui/icons-material'
import { useNavigate } from 'react-router-dom'
import api from '../api'
import { useAuth } from '../contexts/AuthContext'
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
interface WarehouseRef extends Ref { trading_point?: string | null; is_default_for_sales?: boolean }
interface NomRef { id: string; name: string; nomenclature_type: string; purchase_price: string }
interface BouquetComponent { nomenclature: string; quantity: string; nomenclature_name: string }
interface BouquetTemplateRef {
  id: string; nomenclature: string; components: BouquetComponent[]
}
interface UserRef { id: string; full_name?: string; username: string }

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
  const { user } = useAuth()
  const navigate = useNavigate()
  const { notify } = useNotification()
  const [tab, setTab] = useState(0)

  // ─── Helper data ───
  const [warehouses, setWarehouses] = useState<WarehouseRef[]>([])
  const [nomenclatures, setNomenclatures] = useState<Ref[]>([])
  const [suppliers, setSuppliers] = useState<Ref[]>([])
  const [allNom, setAllNom] = useState<NomRef[]>([])
  const [bouquetTemplates, setBouquetTemplates] = useState<BouquetTemplateRef[]>([])
  const [users, setUsers] = useState<UserRef[]>([])
  const [stockSummary, setStockSummary] = useState<any[]>([])

  const fetchHelpers = useCallback(async () => {
    try {
      const [whRes, nomRes, supRes, tplRes, usersRes] = await Promise.all([
        api.get('/core/warehouses/'),
        api.get('/nomenclature/items/'),
        api.get('/suppliers/suppliers/'),
        api.get('/nomenclature/bouquet-templates/'),
        api.get('/core/users/').catch(() => ({ data: [] })),
      ])

      setWarehouses(whRes.data.results || whRes.data || [])
      const nomList = nomRes.data.results || nomRes.data || []
      setNomenclatures(nomList)
      setAllNom(nomList)
      setSuppliers(supRes.data.results || supRes.data || [])
      setBouquetTemplates(tplRes.data.results || tplRes.data || [])
      setUsers(usersRes.data.results || usersRes.data || [])

      const effectiveTp = user?.active_trading_point || user?.trading_point || null
      const summaryRes = await api.get('/inventory/stock/summary/', {
        params: effectiveTp ? { trading_point: effectiveTp } : undefined,
      }).catch(() => ({ data: [] }))
      setStockSummary(summaryRes.data.results || summaryRes.data || [])
    } catch (err) { notify(extractError(err, 'Ошибка загрузки справочников'), 'error') }
  }, [notify, user?.id, user?.active_trading_point, user?.trading_point])

  useEffect(() => { fetchHelpers() }, [fetchHelpers])

  const scopedWarehouses = (user?.active_trading_point || user?.trading_point)
    ? warehouses.filter(w => w.trading_point === (user?.active_trading_point || user?.trading_point))
    : warehouses

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
  }, [stockWh, stockSearch, notify, user?.active_trading_point])

  useEffect(() => { if (tab === 0) fetchStock() }, [tab, fetchStock])

  // ═══════════════════════════════════════════
  // Tab 1 — Поступления (CRUD)
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
      .catch(() => { setBatches([]); notify('Ошибка загрузки поступлений', 'error') })
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
      if (editB) { await api.patch(`/inventory/batches/${editB.id}/`, d); notify('Поступления обновлена') }
      else { await api.post('/inventory/batches/', d); notify('Поступления создана') }
      setBDlg(false); fetchBatches()
    } catch (err) { notify(extractError(err, 'Ошибка сохранения'), 'error') }
  }

  const removeB = async () => {
    if (!delB) return
    try { await api.delete(`/inventory/batches/${delB.id}/`); notify('Поступления удалена'); setDelB(null); fetchBatches() }
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
  const [asmMode, setAsmMode] = useState<'template' | 'individual'>('template')
  const [asmForm, setAsmForm] = useState({ nomenclature_bouquet: '', warehouse_from: '', warehouse_to: '', quantity: '1', assembler: '', add_to_templates: false, bouquet_name: '' })
  const [asmComponents, setAsmComponents] = useState<(BouquetComponent & { warehouse?: string; is_required?: boolean; base_qty?: string })[]>([])
  const [asmCustom, setAsmCustom] = useState(false)
  const [asmSaving, setAsmSaving] = useState(false)

  const componentNoms = allNom.filter(n => n.nomenclature_type !== 'bouquet' && n.nomenclature_type !== 'composition')
  const receiptNomenclatures = nomenclatures.filter(n => {
    const nom = allNom.find(x => x.id === n.id)
    return nom?.nomenclature_type !== 'service'
  })

  const [dasmDlg, setDasmDlg] = useState(false)
  const [dasmForm, setDasmForm] = useState({ nomenclature_bouquet: '', warehouse: '', assembler: '' })
  const [dasmRows, setDasmRows] = useState<{ nomenclature: string; name: string; base_qty: string; return_qty: string; writeoff_qty: string; reason: string }[]>([])
  const [dasmSaving, setDasmSaving] = useState(false)

  const [corrDlg, setCorrDlg] = useState(false)
  const [corrForm, setCorrForm] = useState({ nomenclature_bouquet: '', warehouse: '' })
  const [corrRows, setCorrRows] = useState<{ nomenclature: string; name: string; base_qty: string; writeoff_qty: string; return_qty: string; add_qty: string; reason: string; return_warehouse: string; add_warehouse: string }[]>([])
  const [corrSaving, setCorrSaving] = useState(false)
  const [writeOffDlg, setWriteOffDlg] = useState(false)
  const [writeOffForm, setWriteOffForm] = useState({ warehouse: '', nomenclature: '', quantity: '1', reason: 'expired', notes: '' })
  const [writeOffSaving, setWriteOffSaving] = useState(false)


  const bouquetNoms = allNom.filter(n => n.nomenclature_type === 'bouquet' || n.nomenclature_type === 'composition')

  const getNomWarehouses = (nomId: string): { id: string; name: string; qty: number }[] => {
    const row = stockSummary.find(s => s.nomenclature === nomId)
    return (row?.warehouses || []).map((w: any): { id: string; name: string; qty: number } => ({
      id: w.warehouse,
      name: w.warehouse_name,
      qty: parseFloat(w.qty) || 0,
    }))
  }

  const getRecommendedWarehouse = (nomId: string, needQty: number) => {
    const options = getNomWarehouses(nomId)
      .filter((w: { id: string; name: string; qty: number }) => w.qty >= needQty)
      .sort((a: { id: string; name: string; qty: number }, b: { id: string; name: string; qty: number }) => a.qty - b.qty)
    return options[0]?.id || ''
  }

  const getAvailableQty = (nomId: string, warehouseId?: string) => {
    const options = getNomWarehouses(nomId)
    if (!warehouseId) return options.reduce((sum: number, o: { id: string; name: string; qty: number }) => sum + o.qty, 0)
    return options.find((o: { id: string; name: string; qty: number }) => o.id === warehouseId)?.qty || 0
  }

  const openAsmDlg = (mode: 'template' | 'individual' = 'template') => {
    const defaultWh = scopedWarehouses.length === 1 ? scopedWarehouses[0].id : ''
    setAsmMode(mode)
    if (mode === 'individual') {
      setAsmForm({ nomenclature_bouquet: '', warehouse_from: defaultWh, warehouse_to: defaultWh, quantity: '1', assembler: user?.id || '', add_to_templates: true, bouquet_name: '' })
      setAsmComponents([{ nomenclature: '', nomenclature_name: '', quantity: '1', base_qty: '1', warehouse: '' }])
      setAsmCustom(true)
    } else {
      setAsmForm({ nomenclature_bouquet: '', warehouse_from: defaultWh, warehouse_to: defaultWh, quantity: '1', assembler: user?.id || '', add_to_templates: false, bouquet_name: '' })
      setAsmComponents([])
      setAsmCustom(false)
    }
    setAsmDlg(true)
  }

  const handleAsmModeChange = (newMode: 'template' | 'individual') => {
    const defaultWh = scopedWarehouses.length === 1 ? scopedWarehouses[0].id : ''
    setAsmMode(newMode)
    if (newMode === 'individual') {
      setAsmForm(f => ({ ...f, nomenclature_bouquet: '', bouquet_name: '', add_to_templates: true }))
      setAsmComponents([{ nomenclature: '', nomenclature_name: '', quantity: '1', base_qty: '1', warehouse: defaultWh }])
      setAsmCustom(true)
    } else {
      setAsmForm(f => ({ ...f, nomenclature_bouquet: '', bouquet_name: '', add_to_templates: false }))
      setAsmComponents([])
      setAsmCustom(false)
    }
  }

  const handleAsmBouquetChange = (nomId: string) => {
    setAsmForm(f => ({ ...f, nomenclature_bouquet: nomId }))
    const tpl = bouquetTemplates.find(t => t.nomenclature === nomId)
    if (tpl && tpl.components?.length) {
      setAsmCustom(false)
      setAsmComponents(tpl.components.map(c => ({
        nomenclature: c.nomenclature,
        nomenclature_name: c.nomenclature_name || allNom.find(n => n.id === c.nomenclature)?.name || '?',
        quantity: c.quantity,
        base_qty: c.quantity,
        warehouse: getRecommendedWarehouse(c.nomenclature, parseFloat(c.quantity) * (Math.max(1, Math.round(Number(asmForm.quantity) || 1)) || 1)),
      })))
    } else {
      setAsmCustom(true)
      setAsmComponents([{ nomenclature: '', nomenclature_name: '', quantity: '1', base_qty: '1', warehouse: '' }])
    }
  }

  const submitAssembly = async () => {
    setAsmSaving(true)
    try {
      const isIndividual = asmMode === 'individual'
      if (!isIndividual) {
        const hasTemplateChanges = !asmCustom && asmComponents.some(c => String(c.quantity || '') !== String(c.base_qty || c.quantity || ''))
        if (hasTemplateChanges && !asmForm.bouquet_name) {
          const proceed = window.confirm('Вы изменили состав букета. Рекомендуется указать новое название букета. Продолжить сборку без нового названия?')
          if (!proceed) {
            setAsmSaving(false)
            return
          }
        }
      }

      const payload: Record<string, any> = {
        warehouse_from: asmForm.warehouse_from,
        warehouse_to: asmForm.warehouse_to,
        quantity: Math.max(1, Math.round(Number(asmForm.quantity) || 1)) || 1,
        assembler: asmForm.assembler || undefined,
        add_to_templates: asmForm.add_to_templates,
        bouquet_name: asmForm.bouquet_name,
      }
      if (!isIndividual) {
        payload.nomenclature_bouquet = asmForm.nomenclature_bouquet
      }
      payload.use_template = isIndividual ? false : !asmCustom
      payload.components = asmComponents
        .filter(c => c.nomenclature && parseFloat(c.quantity) > 0)
        .map(c => ({ nomenclature: c.nomenclature, quantity: c.quantity, warehouse: c.warehouse || asmForm.warehouse_from }))
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
    const defaultWh = scopedWarehouses.length === 1 ? scopedWarehouses[0].id : ''
    setDasmForm({ nomenclature_bouquet: '', warehouse: defaultWh, assembler: user?.id || '' })
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
        base_qty: c.quantity,
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
        assembler: dasmForm.assembler || undefined,
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

  
  const openWriteOffDlg = () => {
    setWriteOffForm({ warehouse: '', nomenclature: '', quantity: '1', reason: 'expired', notes: '' })
    setWriteOffDlg(true)
  }

  const submitWriteOff = async () => {
    try {
      setWriteOffSaving(true)
      await api.post('/inventory/movements/write-off/', writeOffForm)
      notify('Ручное списание успешно выполнено', 'success')
      setWriteOffDlg(false)
      fetchStock()
    } catch (e) {
      notify(extractError(e), 'error')
    } finally {
      setWriteOffSaving(false)
    }
  }

  const submitCorrection = async () => {
    setCorrSaving(true)
    try {
      const materialRows = corrRows.filter(r => allNom.find(n => n.id === r.nomenclature)?.nomenclature_type !== 'service')
      const payload = {
        nomenclature_bouquet: corrForm.nomenclature_bouquet,
        warehouse: corrForm.warehouse,
        rows: materialRows.map(r => ({
          nomenclature: r.nomenclature,
          writeoff_qty: r.writeoff_qty,
          return_qty: r.return_qty,
          add_qty: r.add_qty,
          reason: r.reason,
          return_warehouse: r.return_warehouse || corrForm.warehouse,
          add_warehouse: r.add_warehouse || undefined,
        })),
      }
      const res = await api.post('/inventory/movements/correct-bouquet/', payload)
      notify(res.data.message || 'Букет скорректирован')
      setCorrDlg(false)
      if (tab === 0) fetchStock()
      if (tab === 1) fetchBatches()
      if (tab === 2) fetchMoves()
    } catch (err) {
      notify(extractError(err, 'Ошибка коррекции букета'), 'error')
    }
    setCorrSaving(false)
  }

  // ═══════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════
  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <Typography variant="h5" fontWeight={700} sx={{ flex: 1 }}>Склад</Typography>
        <Button variant="outlined" startIcon={<AutoAwesome />} onClick={() => openAsmDlg()}>Собрать букет</Button>
        <Button variant="outlined" color="warning" startIcon={<CallSplit />} onClick={openDasmDlg}>Раскомплектовать</Button>
        <Button variant="outlined" color="error" startIcon={<RemoveCircleOutline />} onClick={openWriteOffDlg}>Списание</Button>
      </Box>
      <Card>
        <CardContent>
          <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}>
            <Tab icon={<Inventory2 />} iconPosition="start" label="Остатки" />
            <Tab icon={<LocalShipping />} iconPosition="start" label="Поступления" />
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
                    {scopedWarehouses.map(w => <MenuItem key={w.id} value={w.id}>{w.name}</MenuItem>)}
                  </TextField>
                </Grid>
              </Grid>
              <DataTable
                columns={[
                  {
                    key: 'nomenclature_name',
                    label: 'Номенклатура',
                    render: (v: string, row: StockBalance) => {
                      const qty = parseFloat(row.quantity)
                      const isNegative = qty < 0
                      return (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography fontWeight={500}>{v}</Typography>
                          {isNegative && <Chip size="small" color="error" label="Минус" />}
                        </Box>
                      )
                    }
                  },
                  { key: 'warehouse_name', label: 'Склад' },
                  {
                    key: 'quantity',
                    label: 'Кол-во',
                    align: 'right',
                    render: (v: string) => {
                      const qty = parseFloat(v)
                      const isNegative = qty < 0
                      return (
                        <Typography color={isNegative ? 'error.main' : 'inherit'} fontWeight={isNegative ? 700 : 400}>
                          {fmtNum(v)}
                        </Typography>
                      )
                    }
                  },
                  { key: 'avg_purchase_price', label: 'Ср. цена', align: 'right', render: (v: string) => `${fmtNum(v)} ₽` },
                  { key: '_total', label: 'Сумма', align: 'right', render: (_: any, row: StockBalance) => `${fmtNum(parseFloat(row.quantity) * parseFloat(row.avg_purchase_price))} ₽` },
                  { key: 'updated_at', label: 'Обновлено', render: (v: string) => fmtDateTime(v) },
                  {
                    key: '_act', label: '', align: 'center', width: 170, render: (_: any, row: StockBalance) => (
                      <Box sx={{ display: 'flex', gap: 0.5 }}>
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => navigate('/sales', { state: { prefillSaleItem: { nomenclature: row.nomenclature, quantity: '1' } } })}
                        >
                          Продать
                        </Button>
                        {(allNom.find(n => n.id === row.nomenclature)?.nomenclature_type === 'bouquet' || allNom.find(n => n.id === row.nomenclature)?.nomenclature_type === 'composition') && (
                          <Button
                            size="small"
                            variant="outlined"
                            color="warning"
                            startIcon={<Tune fontSize="small" />}
                            onClick={() => {
                              const tpl = bouquetTemplates.find(t => t.nomenclature === row.nomenclature)
                              setCorrForm({ nomenclature_bouquet: row.nomenclature, warehouse: row.warehouse })
                              setCorrRows((tpl?.components || [])
                                .filter(c => allNom.find(n => n.id === c.nomenclature)?.nomenclature_type !== 'service')
                                .map(c => ({
                                  nomenclature: c.nomenclature,
                                  name: c.nomenclature_name || allNom.find(n => n.id === c.nomenclature)?.name || '?',
                                  base_qty: c.quantity,
                                  writeoff_qty: '0',
                                  return_qty: c.quantity,
                                  add_qty: '0',
                                  reason: 'other',
                                  return_warehouse: row.warehouse,
                                  add_warehouse: '',
                                })))
                              setCorrDlg(true)
                            }}
                          >
                            Коррекция
                          </Button>
                        )}
                      </Box>
                    ),
                  },
                ]}
                rows={stock} loading={stockLoad} emptyText="Остатков нет"
                search={stockSearch} onSearchChange={setStockSearch} searchPlaceholder="Поиск по номенклатуре..."
                getRowSx={(row: StockBalance) => {
                  const qty = parseFloat(row.quantity)
                  if (qty < 0) {
                    return {
                      bgcolor: 'error.lighter',
                      '&:hover': { bgcolor: 'error.light' },
                    }
                  }
                  return undefined
                }}
              />
            </>
          )}

          {/* ── Tab 1: Поступления ── */}
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
              rows={batches} loading={bLoad} emptyText="Поступлений нет"
              headerActions={<Button variant="contained" startIcon={<Add />} onClick={() => openBDlg()}>Добавить поступление</Button>}
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
        title={editB ? 'Редактировать поступление' : 'Новая партия'} submitText={editB ? 'Сохранить' : 'Создать'}
        disabled={!bForm.nomenclature || !bForm.warehouse || !bForm.purchase_price || !bForm.quantity}>
        <TextField label="Номенклатура" required select fullWidth value={bForm.nomenclature}
          onChange={e => setBForm({ ...bForm, nomenclature: e.target.value })}>
          {receiptNomenclatures.map(n => <MenuItem key={n.id} value={n.id}>{n.name}</MenuItem>)}
        </TextField>
        <TextField label="Склад" required select fullWidth value={bForm.warehouse}
          onChange={e => setBForm({ ...bForm, warehouse: e.target.value })}>
          {scopedWarehouses.map(w => <MenuItem key={w.id} value={w.id}>{w.name}</MenuItem>)}
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
              {scopedWarehouses.map(w => <MenuItem key={w.id} value={w.id}>{w.name}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid size={{ xs: 6 }}>
            <TextField label="Склад-получатель" select fullWidth value={mForm.warehouse_to}
              onChange={e => setMForm({ ...mForm, warehouse_to: e.target.value })}>
              <MenuItem value="">— нет —</MenuItem>
              {scopedWarehouses.map(w => <MenuItem key={w.id} value={w.id}>{w.name}</MenuItem>)}
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
      <ConfirmDialog open={!!delB} title="Удалить поступление?" message={`Удалить поступление "${delB?.nomenclature_name}"?`} onConfirm={removeB} onCancel={() => setDelB(null)} />
      <ConfirmDialog open={!!delM} title="Удалить движение?" message={`Удалить движение "${delM?.nomenclature_name}"?`} onConfirm={removeM} onCancel={() => setDelM(null)} />

      {/* ── Assembly Dialog ── */}
      <Dialog open={asmDlg} onClose={() => setAsmDlg(false)} maxWidth="md" fullWidth>
        <DialogTitle>Сборка букета</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>

          {/* ── Mode selector ── */}
          <ToggleButtonGroup
            value={asmMode} exclusive size="small" fullWidth
            onChange={(_, v) => v && handleAsmModeChange(v)}
          >
            <ToggleButton value="template" sx={{ flex: 1, gap: 1 }}>
              <ListAlt fontSize="small" /> По шаблону
            </ToggleButton>
            <ToggleButton value="individual" sx={{ flex: 1, gap: 1, fontWeight: 600 }}>
              <AutoFixHigh fontSize="small" /> Индивидуальный букет
            </ToggleButton>
          </ToggleButtonGroup>

          {/* Template select — только в режиме «По шаблону» */}
          {asmMode === 'template' && (
            <TextField label="Букет" required select fullWidth value={asmForm.nomenclature_bouquet}
              onChange={e => handleAsmBouquetChange(e.target.value)}>
              {bouquetNoms.map(n => <MenuItem key={n.id} value={n.id}>{n.name}</MenuItem>)}
            </TextField>
          )}

          {/* Name input — только в индивидуальном режиме */}
          {asmMode === 'individual' && (
            <TextField
              label="Название нового букета" required fullWidth
              value={asmForm.bouquet_name}
              onChange={e => setAsmForm({ ...asmForm, bouquet_name: e.target.value })}
              helperText="Новый букет будет автоматически добавлен в номенклатуру"
              autoFocus
            />
          )}
          <Grid container spacing={2}>
            <Grid size={{ xs: 4 }}>
              <TextField label="Склад-источник" required select fullWidth value={asmForm.warehouse_from}
                onChange={e => setAsmForm({ ...asmForm, warehouse_from: e.target.value })}>
                {scopedWarehouses.map(w => <MenuItem key={w.id} value={w.id}>{w.name}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid size={{ xs: 4 }}>
              <TextField label="Склад-приёмник" required select fullWidth value={asmForm.warehouse_to}
                onChange={e => setAsmForm({ ...asmForm, warehouse_to: e.target.value })}>
                {scopedWarehouses.map(w => <MenuItem key={w.id} value={w.id}>{w.name}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid size={{ xs: 2 }}>
              <TextField label="Кол-во" type="number" fullWidth value={asmForm.quantity}
                onChange={e => setAsmForm({ ...asmForm, quantity: e.target.value })} />
            </Grid>
            <Grid size={{ xs: 2 }}>
              <TextField label="Сборщик" select fullWidth value={asmForm.assembler}
                onChange={e => setAsmForm({ ...asmForm, assembler: e.target.value })}>
                <MenuItem value="">—</MenuItem>
                {users.map(u => <MenuItem key={u.id} value={u.id}>{u.full_name || u.username}</MenuItem>)}
              </TextField>
            </Grid>
          </Grid>

          {(asmMode === 'individual' || asmForm.nomenclature_bouquet) && (
            <Box>
              <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 1 }}>
                {asmMode === 'individual' ? '✦ Состав индивидуального букета:' : asmCustom ? 'Компоненты (произвольно):' : 'Компоненты (редактируемые):'}
              </Typography>
              {asmComponents.map((c, i) => (
                <Grid
                  key={i}
                  container
                  spacing={1}
                  alignItems="center"
                  sx={{
                    mb: 0.5,
                    p: 0.5,
                    borderRadius: 1,
                    bgcolor: getAvailableQty(c.nomenclature, c.warehouse) < (parseFloat(c.quantity || '0') * (Math.max(1, Math.round(Number(asmForm.quantity) || 1)) || 1)) ? 'error.lighter' : 'transparent',
                  }}
                >
                  <Grid size={{ xs: 4 }}>
                    <TextField select size="small" fullWidth label="Компонент" value={c.nomenclature}
                      onChange={e => {
                        const nextNom = e.target.value
                        const need = parseFloat(c.quantity || '0') * (Math.max(1, Math.round(Number(asmForm.quantity) || 1)) || 1)
                        const wh = getRecommendedWarehouse(nextNom, need)
                        const upd = [...asmComponents]
                        upd[i] = { ...upd[i], nomenclature: nextNom, nomenclature_name: componentNoms.find(n => n.id === nextNom)?.name || '', warehouse: wh }
                        setAsmComponents(upd)
                      }}>
                      {componentNoms.map(n => <MenuItem key={n.id} value={n.id}>{n.name}</MenuItem>)}
                    </TextField>
                  </Grid>
                  <Grid size={{ xs: 2 }}>
                    <TextField size="small" fullWidth label="Кол-во" type="number" value={c.quantity}
                      onChange={e => {
                        const upd = [...asmComponents]
                        upd[i] = { ...upd[i], quantity: e.target.value }
                        setAsmComponents(upd)
                      }} />
                  </Grid>
                  <Grid size={{ xs: 3 }}>
                    <TextField select size="small" fullWidth label="Склад списания" value={c.warehouse || ''}
                      onChange={e => {
                        const upd = [...asmComponents]
                        upd[i] = { ...upd[i], warehouse: e.target.value }
                        setAsmComponents(upd)
                      }}>
                      {getNomWarehouses(c.nomenclature)
                        .filter(w => w.qty >= (parseFloat(c.quantity || '0') * (Math.max(1, Math.round(Number(asmForm.quantity) || 1)) || 1)))
                        .map(w => (
                        <MenuItem key={w.id} value={w.id}>{w.name} ({w.qty})</MenuItem>
                      ))}
                    </TextField>
                  </Grid>
                  <Grid size={{ xs: 2 }}>
                    <Typography variant="caption" color={getAvailableQty(c.nomenclature, c.warehouse) < (parseFloat(c.quantity || '0') * (Math.max(1, Math.round(Number(asmForm.quantity) || 1)) || 1)) ? 'error.main' : 'text.secondary'}>
                      Остаток: {getAvailableQty(c.nomenclature, c.warehouse)}
                    </Typography>
                  </Grid>
                  <Grid size={{ xs: 1 }}>
                    <IconButton size="small" color="error" onClick={() => setAsmComponents(prev => prev.filter((_, j) => j !== i))}>
                      <Delete fontSize="small" />
                    </IconButton>
                  </Grid>
                </Grid>
              ))}

              <Button size="small" startIcon={<Add />} onClick={() => setAsmComponents(prev => [...prev, { nomenclature: '', nomenclature_name: '', quantity: '1', warehouse: '' }])}>
                Добавить компонент
              </Button>

              <Typography variant="body2" sx={{ mt: 1, fontWeight: 500 }}>
                Расчётная себестоимость: {asmComponents.reduce((sum, c) => {
                  const nom = allNom.find(n => n.id === c.nomenclature)
                  return sum + (nom ? parseFloat(nom.purchase_price) * parseFloat(c.quantity) : 0)
                }, 0).toFixed(2)} р / шт.
              </Typography>

              {asmMode === 'template' && (
                <Grid container spacing={2} sx={{ mt: 1 }}>
                  <Grid size={{ xs: 6 }}>
                    <TextField label="Новое название букета (если меняли состав)" fullWidth value={asmForm.bouquet_name}
                      onChange={e => setAsmForm({ ...asmForm, bouquet_name: e.target.value })} />
                  </Grid>
                  <Grid size={{ xs: 6 }}>
                    <Button
                      variant={asmForm.add_to_templates ? 'contained' : 'outlined'}
                      onClick={() => setAsmForm(prev => ({ ...prev, add_to_templates: !prev.add_to_templates }))}
                    >
                      {asmForm.add_to_templates ? 'Добавится в шаблоны' : 'Добавить в шаблоны'}
                    </Button>
                  </Grid>
                </Grid>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAsmDlg(false)}>Отмена</Button>
          <Button variant="contained" onClick={submitAssembly}
            disabled={
              asmSaving ||
              !asmForm.warehouse_from || !asmForm.warehouse_to ||
              asmComponents.filter(c => c.nomenclature).length === 0 ||
              (asmMode === 'template' && !asmForm.nomenclature_bouquet) ||
              (asmMode === 'individual' && !asmForm.bouquet_name.trim())
            }>
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
            {scopedWarehouses.map(w => <MenuItem key={w.id} value={w.id}>{w.name}</MenuItem>)}
          </TextField>
          <TextField label="Сборщик" select fullWidth value={dasmForm.assembler}
            onChange={e => setDasmForm({ ...dasmForm, assembler: e.target.value })}>
            <MenuItem value="">—</MenuItem>
            {users.map(u => <MenuItem key={u.id} value={u.id}>{u.full_name || u.username}</MenuItem>)}
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
                      disabled />
                  </Grid>
                  <Grid size={{ xs: 2 }}>
                    <TextField label="Списание" type="number" size="small" fullWidth value={r.writeoff_qty}
                      onChange={e => {
                        const writeoff = Math.max(0, parseFloat(e.target.value || '0'))
                        const baseQty = parseFloat(r.base_qty || '0')
                        const returnQty = Math.max(0, baseQty - writeoff)
                        const rows = [...dasmRows]
                        rows[i] = { ...rows[i], writeoff_qty: String(writeoff), return_qty: String(returnQty) }
                        setDasmRows(rows)
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

      {/* ── Bouquet Correction Dialog ── */}
      <Dialog open={corrDlg} onClose={() => setCorrDlg(false)} maxWidth="lg" fullWidth>
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
            <Typography variant="h6" fontWeight={700}>Коррекция букета</Typography>
            <Chip size="small" color="info" label="Только физические компоненты" />
          </Box>
        </DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          <TextField label="Склад букета" select fullWidth value={corrForm.warehouse}
            onChange={e => setCorrForm({ ...corrForm, warehouse: e.target.value })}>
            {scopedWarehouses.map(w => <MenuItem key={w.id} value={w.id}>{w.name}</MenuItem>)}
          </TextField>
          {corrRows.length === 0 ? (
            <Box sx={{ py: 4, textAlign: 'center', bgcolor: 'background.default', borderRadius: 2, border: '1px dashed', borderColor: 'divider' }}>
              <Typography variant="body1" fontWeight={600}>Нет физических компонентов для коррекции</Typography>
              <Typography variant="body2" color="text.secondary">Услуги автоматически исключены из формы коррекции.</Typography>
            </Box>
          ) : (
            <>
              <Grid container spacing={1} sx={{ px: 1, py: 0.5, bgcolor: 'background.default', borderRadius: 1.5 }}>
                <Grid size={{ xs: 3 }}><Typography variant="caption" color="text.secondary">Компонент</Typography></Grid>
                <Grid size={{ xs: 2 }}><Typography variant="caption" color="text.secondary">Списание</Typography></Grid>
                <Grid size={{ xs: 2 }}><Typography variant="caption" color="text.secondary">Возврат</Typography></Grid>
                <Grid size={{ xs: 2 }}><Typography variant="caption" color="text.secondary">Добавление</Typography></Grid>
                <Grid size={{ xs: 3 }}><Typography variant="caption" color="text.secondary">Причина</Typography></Grid>
              </Grid>

              {corrRows.map((r, i) => {
                const writeoff = parseFloat(r.writeoff_qty || '0') || 0
                const returned = parseFloat(r.return_qty || '0') || 0
                const added = parseFloat(r.add_qty || '0') || 0
                const base = parseFloat(r.base_qty || '0') || 0
                const delta = Math.abs((writeoff + returned + added) - base)
                const isUnbalanced = delta > 0.0001

                return (
                <Card key={i} variant="outlined" sx={{ borderRadius: 2, borderColor: isUnbalanced ? 'warning.main' : 'divider' }}>
                  <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                    <Grid container spacing={1} alignItems="center">
                      <Grid size={{ xs: 3 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                          <Typography variant="body2" fontWeight={600}>{r.name}</Typography>
                          {isUnbalanced && <Chip size="small" color="warning" variant="outlined" label="Проверьте" />}
                        </Box>
                        <Typography variant="caption" color="text.secondary">База: {r.base_qty}</Typography>
                      </Grid>
                      <Grid size={{ xs: 2 }}>
                        <TextField label="Списание" size="small" type="number" fullWidth value={r.writeoff_qty}
                          onChange={e => {
                            const rows = [...corrRows]
                            rows[i] = { ...rows[i], writeoff_qty: e.target.value }
                            setCorrRows(rows)
                          }} />
                      </Grid>
                      <Grid size={{ xs: 2 }}>
                        <TextField label="Возврат" size="small" type="number" fullWidth value={r.return_qty}
                          onChange={e => {
                            const rows = [...corrRows]
                            rows[i] = { ...rows[i], return_qty: e.target.value }
                            setCorrRows(rows)
                          }} />
                      </Grid>
                      <Grid size={{ xs: 2 }}>
                        <TextField label="Добавление" size="small" type="number" fullWidth value={r.add_qty}
                          onChange={e => {
                            const rows = [...corrRows]
                            rows[i] = { ...rows[i], add_qty: e.target.value }
                            setCorrRows(rows)
                          }} />
                      </Grid>
                      <Grid size={{ xs: 3 }}>
                        <TextField label="Причина" size="small" select fullWidth value={r.reason}
                          onChange={e => {
                            const rows = [...corrRows]
                            rows[i] = { ...rows[i], reason: e.target.value }
                            setCorrRows(rows)
                          }}>
                          {WRITE_OFF_REASONS.map(wr => <MenuItem key={wr.value} value={wr.value}>{wr.label}</MenuItem>)}
                        </TextField>
                      </Grid>
                      <Grid size={{ xs: 6 }}>
                        <TextField label="Склад возврата" size="small" select fullWidth value={r.return_warehouse}
                          onChange={e => {
                            const rows = [...corrRows]
                            rows[i] = { ...rows[i], return_warehouse: e.target.value }
                            setCorrRows(rows)
                          }}>
                          {scopedWarehouses.map(w => <MenuItem key={w.id} value={w.id}>{w.name}</MenuItem>)}
                        </TextField>
                      </Grid>
                      <Grid size={{ xs: 6 }}>
                        <TextField label="Склад добавления" size="small" select fullWidth value={r.add_warehouse}
                          onChange={e => {
                            const rows = [...corrRows]
                            rows[i] = { ...rows[i], add_warehouse: e.target.value }
                            setCorrRows(rows)
                          }}>
                          <MenuItem value="">— не выбрано —</MenuItem>
                          {getNomWarehouses(r.nomenclature).map(w => <MenuItem key={w.id} value={w.id}>{w.name} ({w.qty})</MenuItem>)}
                        </TextField>
                      </Grid>
                    </Grid>
                  </CardContent>
                </Card>
              )})}
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCorrDlg(false)}>Отмена</Button>
          <Button variant="contained" color="warning" onClick={submitCorrection}
            disabled={corrSaving || !corrForm.nomenclature_bouquet || !corrForm.warehouse || corrRows.length === 0}>
            {corrSaving ? 'Сохранение...' : 'Применить коррекцию'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ═══ Write-Off Dialog ═══ */}
      <EntityFormDialog
        open={writeOffDlg}
        onClose={() => setWriteOffDlg(false)}
        onSubmit={submitWriteOff}
        title="Ручное списание"
        loading={writeOffSaving}
        submitText="Списать"
      >
        <TextField label="Склад" required select fullWidth value={writeOffForm.warehouse}
          onChange={e => setWriteOffForm({...writeOffForm, warehouse: e.target.value})}>
          {scopedWarehouses.map(w => <MenuItem key={w.id} value={w.id}>{w.name}</MenuItem>)}
        </TextField>
        <TextField label="Номенклатура" required select fullWidth value={writeOffForm.nomenclature}
          onChange={e => setWriteOffForm({...writeOffForm, nomenclature: e.target.value})}>
          {allNom.filter(n => n.nomenclature_type !== 'service').map(n => <MenuItem key={n.id} value={n.id}>{n.name}</MenuItem>)}
        </TextField>
        <TextField label="Количество" required type="number" fullWidth value={writeOffForm.quantity}
          inputProps={{ min: 1 }}
          onChange={e => setWriteOffForm({...writeOffForm, quantity: e.target.value})} />
        <TextField label="Причина" required select fullWidth value={writeOffForm.reason}
          onChange={e => setWriteOffForm({...writeOffForm, reason: e.target.value})}>
          {WRITE_OFF_REASONS.map(r => <MenuItem key={r.value} value={r.value}>{r.label}</MenuItem>)}
        </TextField>
        <TextField label="Примечания" fullWidth multiline rows={2} value={writeOffForm.notes}
          onChange={e => setWriteOffForm({...writeOffForm, notes: e.target.value})} />
      </EntityFormDialog>
    </Box>
  )
}
