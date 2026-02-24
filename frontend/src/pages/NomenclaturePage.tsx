import { useState, useEffect, useCallback } from 'react'
import {
  Box, Typography, TextField, Button, Tab, Tabs, IconButton,
  Chip, MenuItem, Switch, FormControlLabel, Card, CardContent,
} from '@mui/material'
import Grid from '@mui/material/Grid2'
import { Add, Edit, Delete, Inventory, Category, Straighten, AutoAwesome, AddCircleOutline, RemoveCircleOutline } from '@mui/icons-material'
import api from '../api'
import { useNotification } from '../contexts/NotificationContext'
import extractError from '../utils/extractError'
import DataTable from '../components/DataTable'
import EntityFormDialog from '../components/EntityFormDialog'
import ConfirmDialog from '../components/ConfirmDialog'

// ─── Types ───
interface NomItem {
  id: string; organization: string; group: string | null; name: string; nomenclature_type: string
  sku: string; barcode: string; unit: string | null; purchase_price: string; retail_price: string
  min_price: string; markup_percent: string; image: string | null; color: string; country: string
  season_start: number | null; season_end: number | null; shelf_life_days: number | null
  min_stock: number | null; is_active: boolean; notes: string; group_name: string; unit_name: string
}
interface NomGroup { id: string; organization: string; name: string; parent: string | null; sort_order: number; children?: NomGroup[] }
interface MeasureUnit { id: string; name: string; short_name: string }
interface BouquetComponent {
  id: string; template: string; nomenclature: string; quantity: string
  is_required: boolean; substitute: string | null; nomenclature_name: string
}
interface BouquetTemplate {
  id: string; nomenclature: string; assembly_time_minutes: number
  difficulty: number; description: string; components: BouquetComponent[]
}

const NOM_TYPES = [
  { value: 'single_flower', label: 'Цветок' },
  { value: 'bouquet', label: 'Букет' },
  { value: 'composition', label: 'Композиция' },
  { value: 'packaging', label: 'Упаковка' },
  { value: 'accessory', label: 'Аксессуар' },
  { value: 'ribbon', label: 'Лента' },
  { value: 'toy', label: 'Игрушка' },
  { value: 'postcard', label: 'Открытка' },
  { value: 'extra_good', label: 'Сопутствующий товар' },
  { value: 'balloon', label: 'Шар' },
  { value: 'pot_plant', label: 'Горшечное растение' },
  { value: 'service', label: 'Услуга' },
]

const MONTHS = [
  { value: 1, label: 'Январь' }, { value: 2, label: 'Февраль' }, { value: 3, label: 'Март' },
  { value: 4, label: 'Апрель' }, { value: 5, label: 'Май' }, { value: 6, label: 'Июнь' },
  { value: 7, label: 'Июль' }, { value: 8, label: 'Август' }, { value: 9, label: 'Сентябрь' },
  { value: 10, label: 'Октябрь' }, { value: 11, label: 'Ноябрь' }, { value: 12, label: 'Декабрь' },
]

const nomTypeLabel = (v: string) => NOM_TYPES.find(t => t.value === v)?.label || v

const defaultItemForm = () => ({
  name: '', nomenclature_type: 'single_flower', group: '' as string, sku: '', barcode: '',
  unit: '' as string, purchase_price: '', retail_price: '', min_price: '', markup_percent: '',
  color: '', country: '', season_start: '' as string | number, season_end: '' as string | number,
  shelf_life_days: '' as string | number, min_stock: '' as string | number, is_active: true, notes: '',
})

export default function NomenclaturePage() {
  const { notify } = useNotification()
  const [tab, setTab] = useState(0)

  // ─── Nomenclature Items ───
  const [items, setItems] = useState<NomItem[]>([])
  const [itemLoad, setItemLoad] = useState(false)
  const [itemSearch, setItemSearch] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterGroup, setFilterGroup] = useState('')
  const [itemDlg, setItemDlg] = useState(false)
  const [editItem, setEditItem] = useState<NomItem | null>(null)
  const [itemForm, setItemForm] = useState(defaultItemForm())
  const [itemSaving, setItemSaving] = useState(false)
  const [delItem, setDelItem] = useState<NomItem | null>(null)

  // ─── Groups ───
  const [groups, setGroups] = useState<NomGroup[]>([])
  const [grpLoad, setGrpLoad] = useState(false)
  const [grpDlg, setGrpDlg] = useState(false)
  const [editGrp, setEditGrp] = useState<NomGroup | null>(null)
  const [grpForm, setGrpForm] = useState({ name: '', parent: '' as string, sort_order: 0 })
  const [grpSaving, setGrpSaving] = useState(false)
  const [delGrp, setDelGrp] = useState<NomGroup | null>(null)

  // ─── Units ───
  const [units, setUnits] = useState<MeasureUnit[]>([])
  const [unitLoad, setUnitLoad] = useState(false)
  const [unitDlg, setUnitDlg] = useState(false)
  const [editUnit, setEditUnit] = useState<MeasureUnit | null>(null)
  const [unitForm, setUnitForm] = useState({ name: '', short_name: '' })
  const [unitSaving, setUnitSaving] = useState(false)
  const [delUnit, setDelUnit] = useState<MeasureUnit | null>(null)

  // ─── Bouquet Templates ───
  const [templates, setTemplates] = useState<BouquetTemplate[]>([])
  const [tplLoad, setTplLoad] = useState(false)
  const [tplDlg, setTplDlg] = useState(false)
  const [editTpl, setEditTpl] = useState<BouquetTemplate | null>(null)
  const [tplForm, setTplForm] = useState({ nomenclature: '', assembly_time_minutes: 15, difficulty: 3, description: '' })
  const [tplComponents, setTplComponents] = useState<{ nomenclature: string; quantity: string; is_required: boolean }[]>([])
  const [tplSaving, setTplSaving] = useState(false)
  const [delTpl, setDelTpl] = useState<BouquetTemplate | null>(null)

  // ─── Fetchers ───
  const fetchItems = useCallback(() => {
    setItemLoad(true)
    const params: Record<string, string> = {}
    if (itemSearch) params.search = itemSearch
    if (filterType) params.nomenclature_type = filterType
    if (filterGroup) params.group = filterGroup
    api.get('/nomenclature/items/', { params })
      .then(res => setItems(res.data.results || res.data || []))
      .catch(() => notify('Ошибка загрузки номенклатуры', 'error'))
      .finally(() => setItemLoad(false))
  }, [itemSearch, filterType, filterGroup, notify])

  const fetchGroups = useCallback(() => {
    setGrpLoad(true)
    api.get('/nomenclature/groups/')
      .then(res => setGroups(res.data.results || res.data || []))
      .catch(() => notify('Ошибка загрузки групп', 'error'))
      .finally(() => setGrpLoad(false))
  }, [notify])

  const fetchUnits = useCallback(() => {
    setUnitLoad(true)
    api.get('/nomenclature/units/')
      .then(res => setUnits(res.data.results || res.data || []))
      .catch(() => notify('Ошибка загрузки единиц измерения', 'error'))
      .finally(() => setUnitLoad(false))
  }, [notify])

  const fetchTemplates = useCallback(() => {
    setTplLoad(true)
    api.get('/nomenclature/bouquet-templates/')
      .then(res => setTemplates(res.data.results || res.data || []))
      .catch(() => notify('Ошибка загрузки шаблонов', 'error'))
      .finally(() => setTplLoad(false))
  }, [notify])

  useEffect(() => { fetchItems(); fetchGroups(); fetchUnits() }, [fetchItems, fetchGroups, fetchUnits])
  useEffect(() => { if (tab === 1) fetchGroups() }, [tab, fetchGroups])
  useEffect(() => { if (tab === 2) fetchUnits() }, [tab, fetchUnits])
  useEffect(() => { if (tab === 3) fetchTemplates() }, [tab, fetchTemplates])

  // ─── Flatten groups for selects ───
  const flatGroups: NomGroup[] = []
  const flatten = (list: NomGroup[]) => {
    list.forEach(g => { flatGroups.push(g); if (g.children?.length) flatten(g.children) })
  }
  flatten(groups)

  // ─── Item CRUD ───
  const openItemDlg = (item?: NomItem) => {
    if (item) {
      setEditItem(item)
      setItemForm({
        name: item.name, nomenclature_type: item.nomenclature_type,
        group: item.group || '', sku: item.sku || '', barcode: item.barcode || '',
        unit: item.unit || '', purchase_price: item.purchase_price || '',
        retail_price: item.retail_price || '', min_price: item.min_price || '',
        markup_percent: item.markup_percent || '', color: item.color || '',
        country: item.country || '', season_start: item.season_start ?? '',
        season_end: item.season_end ?? '', shelf_life_days: item.shelf_life_days ?? '',
        min_stock: item.min_stock ?? '', is_active: item.is_active, notes: item.notes || '',
      })
    } else {
      setEditItem(null)
      setItemForm(defaultItemForm())
    }
    setItemDlg(true)
  }

  const saveItem = async () => {
    setItemSaving(true)
    try {
      const d: Record<string, any> = { ...itemForm }
      if (!d.group) d.group = null
      if (!d.unit) d.unit = null
      if (d.season_start === '') d.season_start = null
      if (d.season_end === '') d.season_end = null
      if (d.shelf_life_days === '') d.shelf_life_days = null
      if (d.min_stock === '' || d.min_stock === null) d.min_stock = 0
      if (!d.purchase_price && d.purchase_price !== 0) d.purchase_price = '0.00'
      if (!d.retail_price && d.retail_price !== 0) d.retail_price = '0.00'
      if (!d.min_price && d.min_price !== 0) d.min_price = '0.00'
      if (!d.markup_percent && d.markup_percent !== 0) d.markup_percent = '0.00'
      if (editItem) { await api.patch(`/nomenclature/items/${editItem.id}/`, d); notify('Позиция обновлена') }
      else { await api.post('/nomenclature/items/', d); notify('Позиция создана') }
      setItemDlg(false); fetchItems()
    } catch (err) { notify(extractError(err, 'Ошибка сохранения позиции'), 'error') }
    setItemSaving(false)
  }

  const removeItem = async () => {
    if (!delItem) return
    try { await api.delete(`/nomenclature/items/${delItem.id}/`); notify('Позиция удалена'); setDelItem(null); fetchItems() }
    catch (err) { notify(extractError(err, 'Ошибка удаления позиции'), 'error') }
  }

  // ─── Group CRUD ───
  const openGrpDlg = (g?: NomGroup) => {
    if (g) { setEditGrp(g); setGrpForm({ name: g.name, parent: g.parent || '', sort_order: g.sort_order || 0 }) }
    else { setEditGrp(null); setGrpForm({ name: '', parent: '', sort_order: 0 }) }
    setGrpDlg(true)
  }

  const saveGrp = async () => {
    setGrpSaving(true)
    try {
      const d: Record<string, any> = { ...grpForm }
      if (!d.parent) d.parent = null
      if (editGrp) { await api.patch(`/nomenclature/groups/${editGrp.id}/`, d); notify('Группа обновлена') }
      else { await api.post('/nomenclature/groups/', d); notify('Группа создана') }
      setGrpDlg(false); fetchGroups()
    } catch (err) { notify(extractError(err, 'Ошибка сохранения группы'), 'error') }
    setGrpSaving(false)
  }

  const removeGrp = async () => {
    if (!delGrp) return
    try { await api.delete(`/nomenclature/groups/${delGrp.id}/`); notify('Группа удалена'); setDelGrp(null); fetchGroups() }
    catch (err) { notify(extractError(err, 'Ошибка удаления группы'), 'error') }
  }

  // ─── Unit CRUD ───
  const openUnitDlg = (u?: MeasureUnit) => {
    if (u) { setEditUnit(u); setUnitForm({ name: u.name, short_name: u.short_name }) }
    else { setEditUnit(null); setUnitForm({ name: '', short_name: '' }) }
    setUnitDlg(true)
  }

  const saveUnit = async () => {
    setUnitSaving(true)
    try {
      if (editUnit) { await api.patch(`/nomenclature/units/${editUnit.id}/`, unitForm); notify('Единица обновлена') }
      else { await api.post('/nomenclature/units/', unitForm); notify('Единица создана') }
      setUnitDlg(false); fetchUnits()
    } catch (err) { notify(extractError(err, 'Ошибка сохранения единицы'), 'error') }
    setUnitSaving(false)
  }

  const removeUnit = async () => {
    if (!delUnit) return
    try { await api.delete(`/nomenclature/units/${delUnit.id}/`); notify('Единица удалена'); setDelUnit(null); fetchUnits() }
    catch (err) { notify(extractError(err, 'Ошибка удаления единицы'), 'error') }
  }

  // ─── Bouquet Template CRUD ───
  const bouquetItems = items.filter(i => i.nomenclature_type === 'bouquet' || i.nomenclature_type === 'composition')
  const componentItems = items.filter(i => i.nomenclature_type !== 'bouquet' && i.nomenclature_type !== 'composition' && i.nomenclature_type !== 'service')

  const openTplDlg = (tpl?: BouquetTemplate) => {
    if (tpl) {
      setEditTpl(tpl)
      setTplForm({
        nomenclature: tpl.nomenclature,
        assembly_time_minutes: tpl.assembly_time_minutes,
        difficulty: tpl.difficulty,
        description: tpl.description || '',
      })
      setTplComponents(tpl.components.map(c => ({
        nomenclature: c.nomenclature,
        quantity: c.quantity,
        is_required: c.is_required,
      })))
    } else {
      setEditTpl(null)
      setTplForm({ nomenclature: '', assembly_time_minutes: 15, difficulty: 3, description: '' })
      setTplComponents([{ nomenclature: '', quantity: '1', is_required: true }])
    }
    setTplDlg(true)
  }

  const addTplComponent = () => {
    setTplComponents([...tplComponents, { nomenclature: '', quantity: '1', is_required: true }])
  }

  const removeTplComponent = (idx: number) => {
    setTplComponents(tplComponents.filter((_, i) => i !== idx))
  }

  const updateTplComponent = (idx: number, field: string, value: any) => {
    setTplComponents(tplComponents.map((c, i) => i === idx ? { ...c, [field]: value } : c))
  }

  const saveTpl = async () => {
    setTplSaving(true)
    try {
      // Validate
      const validComponents = tplComponents.filter(c => c.nomenclature && parseFloat(c.quantity) > 0)
      if (!validComponents.length) {
        notify('Добавьте хотя бы один компонент', 'error')
        setTplSaving(false)
        return
      }

      if (editTpl) {
        // Update template
        await api.patch(`/nomenclature/bouquet-templates/${editTpl.id}/`, {
          assembly_time_minutes: tplForm.assembly_time_minutes,
          difficulty: tplForm.difficulty,
          description: tplForm.description,
        })

        // Delete old components and create new ones
        const oldComponents = editTpl.components || []
        await Promise.all(oldComponents.map(c => api.delete(`/nomenclature/bouquet-components/${c.id}/`)))
        await Promise.all(validComponents.map(c =>
          api.post('/nomenclature/bouquet-components/', {
            template: editTpl.id,
            nomenclature: c.nomenclature,
            quantity: c.quantity,
            is_required: c.is_required,
          })
        ))
        notify('Шаблон обновлён')
      } else {
        // Create template
        const tplRes = await api.post('/nomenclature/bouquet-templates/', {
          nomenclature: tplForm.nomenclature,
          assembly_time_minutes: tplForm.assembly_time_minutes,
          difficulty: tplForm.difficulty,
          description: tplForm.description,
        })
        const newTplId = tplRes.data.id
        // Create components
        await Promise.all(validComponents.map(c =>
          api.post('/nomenclature/bouquet-components/', {
            template: newTplId,
            nomenclature: c.nomenclature,
            quantity: c.quantity,
            is_required: c.is_required,
          })
        ))
        notify('Шаблон создан')
      }
      setTplDlg(false); fetchTemplates(); fetchItems()
    } catch (err) { notify(extractError(err, 'Ошибка сохранения шаблона'), 'error') }
    setTplSaving(false)
  }

  const removeTpl = async () => {
    if (!delTpl) return
    try { await api.delete(`/nomenclature/bouquet-templates/${delTpl.id}/`); notify('Шаблон удалён'); setDelTpl(null); fetchTemplates() }
    catch (err) { notify(extractError(err, 'Ошибка удаления шаблона'), 'error') }
  }

  const tplNomName = (id: string) => items.find(i => i.id === id)?.name || '—'

  // ─── Find parent group name ───
  const parentName = (id: string | null) => {
    if (!id) return '—'
    const g = flatGroups.find(x => x.id === id)
    return g?.name || '—'
  }

  return (
    <Box>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 3 }}>Номенклатура</Typography>
      <Card>
        <CardContent>
          <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}>
            <Tab icon={<Inventory />} iconPosition="start" label="Номенклатура" />
            <Tab icon={<Category />} iconPosition="start" label="Группы" />
            <Tab icon={<Straighten />} iconPosition="start" label="Единицы измерения" />
            <Tab icon={<AutoAwesome />} iconPosition="start" label="Шаблоны букетов" />
          </Tabs>

          {/* ── Tab 0: Nomenclature Items ── */}
          {tab === 0 && (
            <>
              <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
                <TextField size="small" select label="Тип" value={filterType}
                  onChange={e => setFilterType(e.target.value)} sx={{ minWidth: 180 }}>
                  <MenuItem value="">Все типы</MenuItem>
                  {NOM_TYPES.map(t => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
                </TextField>
                <TextField size="small" select label="Группа" value={filterGroup}
                  onChange={e => setFilterGroup(e.target.value)} sx={{ minWidth: 180 }}>
                  <MenuItem value="">Все группы</MenuItem>
                  {flatGroups.map(g => <MenuItem key={g.id} value={g.id}>{g.name}</MenuItem>)}
                </TextField>
              </Box>
              <DataTable
                columns={[
                  { key: 'name', label: 'Название', render: (v: string) => <Typography fontWeight={500}>{v}</Typography> },
                  { key: 'nomenclature_type', label: 'Тип', render: (v: string) => <Chip label={nomTypeLabel(v)} size="small" variant="outlined" /> },
                  { key: 'group_name', label: 'Группа' },
                  { key: 'sku', label: 'Артикул' },
                  { key: 'purchase_price', label: 'Закупка', align: 'right', render: (v: string) => v ? `${v} ₽` : '—' },
                  { key: 'retail_price', label: 'Розница', align: 'right', render: (v: string) => v ? `${v} ₽` : '—' },
                  { key: 'is_active', label: 'Статус', render: (v: boolean) => <Chip label={v ? 'Активна' : 'Неактивна'} size="small" color={v ? 'success' : 'default'} /> },
                  { key: '_act', label: '', align: 'center', width: 100, render: (_: any, row: NomItem) => (<>
                    <IconButton size="small" onClick={() => openItemDlg(row)}><Edit fontSize="small" /></IconButton>
                    <IconButton size="small" onClick={() => setDelItem(row)}><Delete fontSize="small" /></IconButton>
                  </>) },
                ]}
                rows={items} loading={itemLoad} emptyText="Нет позиций номенклатуры"
                search={itemSearch} onSearchChange={setItemSearch} searchPlaceholder="Поиск по названию, артикулу, штрих-коду..."
                headerActions={<Button variant="contained" startIcon={<Add />} onClick={() => openItemDlg()}>Добавить позицию</Button>}
              />
            </>
          )}

          {/* ── Tab 1: Groups ── */}
          {tab === 1 && (
            <DataTable
              columns={[
                { key: 'name', label: 'Название', render: (v: string) => <Typography fontWeight={500}>{v}</Typography> },
                { key: 'parent', label: 'Родительская группа', render: (v: string | null) => parentName(v) },
                { key: 'sort_order', label: 'Сортировка', align: 'right' },
                { key: '_act', label: '', align: 'center', width: 100, render: (_: any, row: NomGroup) => (<>
                  <IconButton size="small" onClick={() => openGrpDlg(row)}><Edit fontSize="small" /></IconButton>
                  <IconButton size="small" onClick={() => setDelGrp(row)}><Delete fontSize="small" /></IconButton>
                </>) },
              ]}
              rows={flatGroups} loading={grpLoad} emptyText="Нет групп номенклатуры"
              headerActions={<Button variant="contained" startIcon={<Add />} onClick={() => openGrpDlg()}>Добавить группу</Button>}
            />
          )}

          {/* ── Tab 2: Measure Units ── */}
          {tab === 2 && (
            <DataTable
              columns={[
                { key: 'name', label: 'Название', render: (v: string) => <Typography fontWeight={500}>{v}</Typography> },
                { key: 'short_name', label: 'Сокращение' },
                { key: '_act', label: '', align: 'center', width: 100, render: (_: any, row: MeasureUnit) => (<>
                  <IconButton size="small" onClick={() => openUnitDlg(row)}><Edit fontSize="small" /></IconButton>
                  <IconButton size="small" onClick={() => setDelUnit(row)}><Delete fontSize="small" /></IconButton>
                </>) },
              ]}
              rows={units} loading={unitLoad} emptyText="Нет единиц измерения"
              headerActions={<Button variant="contained" startIcon={<Add />} onClick={() => openUnitDlg()}>Добавить единицу</Button>}
            />
          )}

          {/* ── Tab 3: Bouquet Templates ── */}
          {tab === 3 && (
            <DataTable
              columns={[
                { key: 'nomenclature', label: 'Букет', render: (v: string) => <Typography fontWeight={500}>{tplNomName(v)}</Typography> },
                { key: 'components', label: 'Компоненты', render: (v: BouquetComponent[]) => v?.length ? `${v.length} шт.` : '—' },
                { key: 'assembly_time_minutes', label: 'Время сборки', render: (v: number) => `${v} мин` },
                { key: 'difficulty', label: 'Сложность', render: (v: number) => '★'.repeat(v) + '☆'.repeat(5 - v) },
                { key: '_cost', label: 'Себестоимость', align: 'right', render: (_: any, row: BouquetTemplate) => {
                  const cost = row.components?.reduce((sum, c) => {
                    const nom = items.find(i => i.id === c.nomenclature)
                    return sum + (nom ? parseFloat(nom.purchase_price) * parseFloat(c.quantity) : 0)
                  }, 0) || 0
                  return `${cost.toFixed(2)} ₽`
                }},
                { key: '_act', label: '', align: 'center', width: 100, render: (_: any, row: BouquetTemplate) => (<>
                  <IconButton size="small" onClick={() => openTplDlg(row)}><Edit fontSize="small" /></IconButton>
                  <IconButton size="small" onClick={() => setDelTpl(row)}><Delete fontSize="small" /></IconButton>
                </>) },
              ]}
              rows={templates} loading={tplLoad} emptyText="Нет шаблонов букетов"
              headerActions={<Button variant="contained" startIcon={<Add />} onClick={() => openTplDlg()}>Добавить шаблон</Button>}
            />
          )}
        </CardContent>
      </Card>

      {/* ─── Item Dialog ─── */}
      <EntityFormDialog open={itemDlg} onClose={() => setItemDlg(false)} onSubmit={saveItem}
        title={editItem ? 'Редактировать позицию' : 'Новая позиция'} submitText={editItem ? 'Сохранить' : 'Создать'}
        loading={itemSaving} disabled={!itemForm.name} maxWidth="md">
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 8 }}>
            <TextField label="Название" required fullWidth value={itemForm.name}
              onChange={e => setItemForm({ ...itemForm, name: e.target.value })} />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField label="Тип" required select fullWidth value={itemForm.nomenclature_type}
              onChange={e => setItemForm({ ...itemForm, nomenclature_type: e.target.value })}>
              {NOM_TYPES.map(t => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <TextField label="Группа" select fullWidth value={itemForm.group}
              onChange={e => setItemForm({ ...itemForm, group: e.target.value })}>
              <MenuItem value="">Без группы</MenuItem>
              {flatGroups.map(g => <MenuItem key={g.id} value={g.id}>{g.name}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <TextField label="Единица измерения" select fullWidth value={itemForm.unit}
              onChange={e => setItemForm({ ...itemForm, unit: e.target.value })}>
              <MenuItem value="">Не указана</MenuItem>
              {units.map(u => <MenuItem key={u.id} value={u.id}>{u.name} ({u.short_name})</MenuItem>)}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <TextField label="Артикул (SKU)" fullWidth value={itemForm.sku}
              onChange={e => setItemForm({ ...itemForm, sku: e.target.value })} />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <TextField label="Штрих-код" fullWidth value={itemForm.barcode}
              onChange={e => setItemForm({ ...itemForm, barcode: e.target.value })} />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField label="Закупочная цена" type="number" fullWidth value={itemForm.purchase_price}
              onChange={e => setItemForm({ ...itemForm, purchase_price: e.target.value })} />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField label="Розничная цена" type="number" fullWidth value={itemForm.retail_price}
              onChange={e => setItemForm({ ...itemForm, retail_price: e.target.value })} />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField label="Минимальная цена" type="number" fullWidth value={itemForm.min_price}
              onChange={e => setItemForm({ ...itemForm, min_price: e.target.value })} />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField label="Наценка %" type="number" fullWidth value={itemForm.markup_percent}
              onChange={e => setItemForm({ ...itemForm, markup_percent: e.target.value })} />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField label="Цвет" fullWidth value={itemForm.color}
              onChange={e => setItemForm({ ...itemForm, color: e.target.value })} />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField label="Страна" fullWidth value={itemForm.country}
              onChange={e => setItemForm({ ...itemForm, country: e.target.value })} />
          </Grid>
          <Grid size={{ xs: 12, md: 3 }}>
            <TextField label="Сезон (начало)" select fullWidth value={itemForm.season_start}
              onChange={e => setItemForm({ ...itemForm, season_start: e.target.value ? Number(e.target.value) : '' })}>
              <MenuItem value="">Не указан</MenuItem>
              {MONTHS.map(m => <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, md: 3 }}>
            <TextField label="Сезон (конец)" select fullWidth value={itemForm.season_end}
              onChange={e => setItemForm({ ...itemForm, season_end: e.target.value ? Number(e.target.value) : '' })}>
              <MenuItem value="">Не указан</MenuItem>
              {MONTHS.map(m => <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, md: 3 }}>
            <TextField label="Срок годности (дни)" type="number" fullWidth value={itemForm.shelf_life_days}
              onChange={e => setItemForm({ ...itemForm, shelf_life_days: e.target.value ? Number(e.target.value) : '' })} />
          </Grid>
          <Grid size={{ xs: 12, md: 3 }}>
            <TextField label="Мин. остаток" type="number" fullWidth value={itemForm.min_stock}
              onChange={e => setItemForm({ ...itemForm, min_stock: e.target.value ? Number(e.target.value) : '' })} />
          </Grid>
          <Grid size={{ xs: 12 }}>
            <TextField label="Примечания" fullWidth multiline rows={2} value={itemForm.notes}
              onChange={e => setItemForm({ ...itemForm, notes: e.target.value })} />
          </Grid>
          <Grid size={{ xs: 12 }}>
            <FormControlLabel
              control={<Switch checked={itemForm.is_active} onChange={e => setItemForm({ ...itemForm, is_active: e.target.checked })} />}
              label="Активна"
            />
          </Grid>
        </Grid>
      </EntityFormDialog>

      {/* ─── Bouquet Template Dialog ─── */}
      <EntityFormDialog open={tplDlg} onClose={() => setTplDlg(false)} onSubmit={saveTpl}
        title={editTpl ? 'Редактировать шаблон букета' : 'Новый шаблон букета'}
        submitText={editTpl ? 'Сохранить' : 'Создать'}
        loading={tplSaving} disabled={!tplForm.nomenclature || tplComponents.length === 0} maxWidth="md">
        <TextField label="Букет (номенклатура)" required select fullWidth value={tplForm.nomenclature}
          disabled={!!editTpl}
          onChange={e => setTplForm({ ...tplForm, nomenclature: e.target.value })}>
          {bouquetItems.map(n => <MenuItem key={n.id} value={n.id}>{n.name}</MenuItem>)}
        </TextField>
        <Grid container spacing={2}>
          <Grid size={{ xs: 4 }}>
            <TextField label="Время сборки (мин)" type="number" fullWidth value={tplForm.assembly_time_minutes}
              onChange={e => setTplForm({ ...tplForm, assembly_time_minutes: Number(e.target.value) || 0 })} />
          </Grid>
          <Grid size={{ xs: 4 }}>
            <TextField label="Сложность (1-5)" type="number" fullWidth value={tplForm.difficulty}
              slotProps={{ htmlInput: { min: 1, max: 5 } }}
              onChange={e => setTplForm({ ...tplForm, difficulty: Math.min(5, Math.max(1, Number(e.target.value) || 1)) })} />
          </Grid>
          <Grid size={{ xs: 4 }}>
            <TextField label="Описание" fullWidth value={tplForm.description}
              onChange={e => setTplForm({ ...tplForm, description: e.target.value })} />
          </Grid>
        </Grid>

        {/* Components */}
        <Typography variant="subtitle1" fontWeight={600} sx={{ mt: 1 }}>Компоненты букета</Typography>
        {tplComponents.map((comp, idx) => (
          <Grid container spacing={1} key={idx} alignItems="center">
            <Grid size={{ xs: 6 }}>
              <TextField label="Материал" required select fullWidth size="small" value={comp.nomenclature}
                onChange={e => updateTplComponent(idx, 'nomenclature', e.target.value)}>
                {componentItems.map(n => <MenuItem key={n.id} value={n.id}>{n.name}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid size={{ xs: 2 }}>
              <TextField label="Кол-во" required type="number" fullWidth size="small" value={comp.quantity}
                onChange={e => updateTplComponent(idx, 'quantity', e.target.value)} />
            </Grid>
            <Grid size={{ xs: 3 }}>
              <FormControlLabel
                control={<Switch size="small" checked={comp.is_required}
                  onChange={e => updateTplComponent(idx, 'is_required', e.target.checked)} />}
                label="Обязат." />
            </Grid>
            <Grid size={{ xs: 1 }}>
              <IconButton size="small" color="error" onClick={() => removeTplComponent(idx)}>
                <RemoveCircleOutline fontSize="small" />
              </IconButton>
            </Grid>
          </Grid>
        ))}
        <Button startIcon={<AddCircleOutline />} onClick={addTplComponent} size="small">
          Добавить компонент
        </Button>

        {/* Estimated cost */}
        {tplComponents.length > 0 && (
          <Typography variant="body2" sx={{ mt: 1, fontWeight: 500 }}>
            Расчётная себестоимость: {tplComponents.reduce((sum, c) => {
              const nom = items.find(i => i.id === c.nomenclature)
              return sum + (nom ? parseFloat(nom.purchase_price) * (parseFloat(c.quantity) || 0) : 0)
            }, 0).toFixed(2)} ₽
          </Typography>
        )}
      </EntityFormDialog>

      {/* ─── Group Dialog ─── */}
      <EntityFormDialog open={grpDlg} onClose={() => setGrpDlg(false)} onSubmit={saveGrp}
        title={editGrp ? 'Редактировать группу' : 'Новая группа'} submitText={editGrp ? 'Сохранить' : 'Создать'}
        loading={grpSaving} disabled={!grpForm.name}>
        <TextField label="Название" required fullWidth value={grpForm.name}
          onChange={e => setGrpForm({ ...grpForm, name: e.target.value })} />
        <TextField label="Родительская группа" select fullWidth value={grpForm.parent}
          onChange={e => setGrpForm({ ...grpForm, parent: e.target.value })}>
          <MenuItem value="">Без родителя</MenuItem>
          {flatGroups.filter(g => g.id !== editGrp?.id).map(g => <MenuItem key={g.id} value={g.id}>{g.name}</MenuItem>)}
        </TextField>
        <TextField label="Сортировка" type="number" fullWidth value={grpForm.sort_order}
          onChange={e => setGrpForm({ ...grpForm, sort_order: Number(e.target.value) })} />
      </EntityFormDialog>

      {/* ─── Unit Dialog ─── */}
      <EntityFormDialog open={unitDlg} onClose={() => setUnitDlg(false)} onSubmit={saveUnit}
        title={editUnit ? 'Редактировать единицу' : 'Новая единица измерения'} submitText={editUnit ? 'Сохранить' : 'Создать'}
        loading={unitSaving} disabled={!unitForm.name || !unitForm.short_name}>
        <TextField label="Название" required fullWidth value={unitForm.name}
          onChange={e => setUnitForm({ ...unitForm, name: e.target.value })} placeholder="Штука" />
        <TextField label="Сокращение" required fullWidth value={unitForm.short_name}
          onChange={e => setUnitForm({ ...unitForm, short_name: e.target.value })} placeholder="шт." />
      </EntityFormDialog>

      {/* ─── Confirm Dialogs ─── */}
      <ConfirmDialog open={!!delItem} title="Удалить позицию?" message={`Удалить "${delItem?.name}"? Это действие нельзя отменить.`}
        onConfirm={removeItem} onCancel={() => setDelItem(null)} />
      <ConfirmDialog open={!!delGrp} title="Удалить группу?" message={`Удалить группу "${delGrp?.name}"?`}
        onConfirm={removeGrp} onCancel={() => setDelGrp(null)} />
      <ConfirmDialog open={!!delUnit} title="Удалить единицу?" message={`Удалить единицу "${delUnit?.name}"?`}
        onConfirm={removeUnit} onCancel={() => setDelUnit(null)} />
      <ConfirmDialog open={!!delTpl} title="Удалить шаблон?" message={`Удалить шаблон букета?`}
        onConfirm={removeTpl} onCancel={() => setDelTpl(null)} />
    </Box>
  )
}
