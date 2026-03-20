import { useState, useEffect, useCallback, useMemo, Fragment } from 'react'
import {
  Box, Typography, TextField, Button, Tab, Tabs, IconButton,
  Chip, MenuItem, Switch, FormControlLabel, Card, CardContent,
  Collapse, Tooltip, alpha,
} from '@mui/material'
import Grid from '@mui/material/Grid2'
import {
  Add, Edit, Delete, Inventory, Straighten, AutoAwesome,
  AddCircleOutline, RemoveCircleOutline, FolderOpen, Folder,
  ExpandMore, ChevronRight, CreateNewFolder, Search,
} from '@mui/icons-material'
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
  stem_length: number | null; diameter: number | null; default_shelf_life_days: number | null
  min_stock: number | null; is_active: boolean; notes: string; group_name: string; unit_name: string
}
interface NomGroup { id: string; organization: string; name: string; parent: string | null; children?: NomGroup[] }
interface MeasureUnit { id: string; name: string; short_name: string }
interface NomOption {
  id: string; name: string; nomenclature_type: string
  purchase_price: string; retail_price: string; is_active: boolean
}
interface BouquetComponent {
  id: string; template: string; nomenclature: string; quantity: string
  is_required: boolean; substitute: string | null; nomenclature_name: string
}
interface BouquetTemplate {
  id: string; nomenclature: string; bouquet_name: string; assembly_time_minutes: number
  difficulty: number; description: string; components: BouquetComponent[]
}

// Tree types from /groups/tree/ endpoint
interface TreeItem {
  id: string; name: string; nomenclature_type: string; accounting_type: string; sku: string
  retail_price: string; purchase_price: string; is_active: boolean
}
interface TreeGroup {
  id: string; name: string; parent: string | null
  children: TreeGroup[]; items: TreeItem[]
}
interface TreeData {
  groups: TreeGroup[]; root_items: TreeItem[]
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

const ACCOUNTING_TYPES = [
  { value: 'stock_material', label: 'Складской товар' },
  { value: 'finished_bouquet', label: 'Готовый букет' },
  { value: 'service', label: 'Услуга' },
]

const accountingTypeLabel = (v: string) => ACCOUNTING_TYPES.find(t => t.value === v)?.label || v

const nomTypeLabel = (v: string) => NOM_TYPES.find(t => t.value === v)?.label || v

const defaultItemForm = () => ({
  name: '', nomenclature_type: 'single_flower', accounting_type: 'stock_material', group: '' as string, sku: '', barcode: '',
  unit: '' as string, purchase_price: '', retail_price: '', min_price: '', markup_percent: '',
  color: '', country: '', stem_length: '' as string | number, diameter: '' as string | number,
  default_shelf_life_days: '' as string | number, min_stock: '' as string | number, is_active: true, notes: '',
})

// ═══════════════════════════════════════════════════════════
// Tree Row Component — recursive rendering of groups + items
// ═══════════════════════════════════════════════════════════
function TreeGroupRow({ group, depth, expanded, onToggle, selectedGroupId, onSelectGroup, onEditItem, onDeleteItem, onEditGroup, onDeleteGroup }: {
  group: TreeGroup; depth: number
  expanded: Record<string, boolean>; onToggle: (id: string) => void
  selectedGroupId: string | null; onSelectGroup: (id: string | null) => void
  onEditItem: (id: string) => void; onDeleteItem: (id: string, name: string) => void
  onEditGroup: (id: string) => void; onDeleteGroup: (id: string, name: string) => void
}) {
  const isOpen = expanded[group.id] ?? false
  const isSelected = selectedGroupId === group.id
  const hasChildren = group.children.length > 0 || group.items.length > 0

  return (
    <Fragment>
      {/* Group row */}
      <Box
        onClick={(e) => { e.stopPropagation(); onSelectGroup(isSelected ? null : group.id) }}
        sx={{
          display: 'flex', alignItems: 'center', gap: 0.5,
          pl: depth * 3 + 0.5, pr: 1, py: 0.4,
          cursor: 'pointer', userSelect: 'none',
          bgcolor: isSelected ? 'action.selected' : 'transparent',
          '&:hover': { bgcolor: isSelected ? 'action.selected' : 'action.hover' },
          borderBottom: '1px solid', borderColor: 'divider',
          minHeight: 36,
        }}
      >
        <IconButton
          size="small" sx={{ p: 0.25 }}
          onClick={(e) => { e.stopPropagation(); onToggle(group.id) }}
        >
          {hasChildren ? (isOpen ? <ExpandMore fontSize="small" /> : <ChevronRight fontSize="small" />) : <Box sx={{ width: 20 }} />}
        </IconButton>
        {isOpen ? <FolderOpen fontSize="small" color="warning" /> : <Folder fontSize="small" color="warning" />}
        <Typography variant="body2" fontWeight={600} sx={{ flex: 1, ml: 0.5 }} noWrap>
          {group.name}
        </Typography>
        <Chip label={`${countAllItems(group)}`} size="small" variant="outlined" sx={{ height: 20, fontSize: '0.7rem' }} />
        <Box sx={{ display: 'flex', ml: 0.5, opacity: 0.6, '&:hover': { opacity: 1 } }}>
          <Tooltip title="Редактировать группу"><IconButton size="small" sx={{ p: 0.25 }} onClick={(e) => { e.stopPropagation(); onEditGroup(group.id) }}><Edit sx={{ fontSize: 16 }} /></IconButton></Tooltip>
          <Tooltip title="Удалить группу"><IconButton size="small" sx={{ p: 0.25 }} onClick={(e) => { e.stopPropagation(); onDeleteGroup(group.id, group.name) }}><Delete sx={{ fontSize: 16 }} /></IconButton></Tooltip>
        </Box>
      </Box>
      {/* Children */}
      <Collapse in={isOpen} unmountOnExit>
        {group.children.map(child => (
          <TreeGroupRow
            key={child.id} group={child} depth={depth + 1}
            expanded={expanded} onToggle={onToggle}
            selectedGroupId={selectedGroupId} onSelectGroup={onSelectGroup}
            onEditItem={onEditItem} onDeleteItem={onDeleteItem}
            onEditGroup={onEditGroup} onDeleteGroup={onDeleteGroup}
          />
        ))}
        {group.items.map(item => (
          <TreeItemRow key={item.id} item={item} depth={depth + 1}
            onEdit={onEditItem} onDelete={onDeleteItem} />
        ))}
      </Collapse>
    </Fragment>
  )
}

function TreeItemRow({ item, depth, onEdit, onDelete }: {
  item: TreeItem; depth: number
  onEdit: (id: string) => void; onDelete: (id: string, name: string) => void
}) {
  return (
    <Box
      sx={{
        display: 'flex', alignItems: 'center', gap: 0.5,
        pl: depth * 3 + 3.5, pr: 1, py: 0.3,
        '&:hover': { bgcolor: 'action.hover' },
        borderBottom: '1px solid', borderColor: 'divider',
        minHeight: 32,
        opacity: item.is_active ? 1 : 0.5,
      }}
    >
      <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }} noWrap>{item.name}</Typography>
      <Chip label={nomTypeLabel(item.nomenclature_type)} size="small" variant="outlined"
        sx={{ height: 20, fontSize: '0.65rem', flexShrink: 0 }} />
      {item.accounting_type && item.accounting_type !== 'stock_material' && (
        <Chip label={accountingTypeLabel(item.accounting_type)} size="small" color="info" variant="outlined"
          sx={{ height: 20, fontSize: '0.6rem', flexShrink: 0 }} />
      )}
      {item.sku && (
        <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0, mx: 0.5 }}>{item.sku}</Typography>
      )}
      <Typography variant="body2" sx={{ minWidth: 70, textAlign: 'right', flexShrink: 0 }}>
        {item.retail_price && parseFloat(item.retail_price) > 0 ? `${item.retail_price} ₽` : '—'}
      </Typography>
      {!item.is_active && <Chip label="Неакт." size="small" color="default" sx={{ height: 18, fontSize: '0.6rem' }} />}
      <Box sx={{ display: 'flex', ml: 0.5, opacity: 0.6, '&:hover': { opacity: 1 }, flexShrink: 0 }}>
        <Tooltip title="Редактировать"><IconButton size="small" sx={{ p: 0.25 }} onClick={() => onEdit(item.id)}><Edit sx={{ fontSize: 16 }} /></IconButton></Tooltip>
        <Tooltip title="Удалить"><IconButton size="small" sx={{ p: 0.25 }} onClick={() => onDelete(item.id, item.name)}><Delete sx={{ fontSize: 16 }} /></IconButton></Tooltip>
      </Box>
    </Box>
  )
}

function countAllItems(group: TreeGroup): number {
  let count = group.items.length
  for (const child of group.children) count += countAllItems(child)
  return count
}

// ═══════════════════════════════════════════════════════════
// Main Page
// ═══════════════════════════════════════════════════════════
export default function NomenclaturePage() {
  const { notify } = useNotification()
  const [tab, setTab] = useState(0)

  // ─── Tree data ───
  const [treeData, setTreeData] = useState<TreeData | null>(null)
  const [treeLoading, setTreeLoading] = useState(false)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [treeSearch, setTreeSearch] = useState('')

  // ─── All items (for forms / bouquet templates) ───
  const [items, setItems] = useState<NomOption[]>([])

  // ─── Item dialog ───
  const [itemDlg, setItemDlg] = useState(false)
  const [editItem, setEditItem] = useState<NomItem | null>(null)
  const [itemForm, setItemForm] = useState(defaultItemForm())
  const [itemSaving, setItemSaving] = useState(false)
  const [delItemId, setDelItemId] = useState<string | null>(null)
  const [delItemName, setDelItemName] = useState('')

  const [grpDlg, setGrpDlg] = useState(false)
  const [editGrp, setEditGrp] = useState<NomGroup | null>(null)
  const [grpForm, setGrpForm] = useState({ name: '', parent: '' as string })
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
  const [tplForm, setTplForm] = useState({ nomenclature: '', bouquet_name: '', assembly_time_minutes: 15, difficulty: 3, description: '' })
  const [tplComponents, setTplComponents] = useState<{ nomenclature: string; quantity: string; is_required: boolean }[]>([])
  const [tplSaving, setTplSaving] = useState(false)
  const [delTpl, setDelTpl] = useState<BouquetTemplate | null>(null)

  // ─── Fetchers ───
  const fetchTree = useCallback(() => {
    setTreeLoading(true)
    api.get('/nomenclature/groups/tree/')
      .then(res => setTreeData(res.data))
      .catch(() => notify('Ошибка загрузки дерева номенклатуры', 'error'))
      .finally(() => setTreeLoading(false))
  }, [notify])

  const fetchItems = useCallback(() => {
    api.get('/nomenclature/items/options/')
      .then(res => setItems(res.data || []))
      .catch(() => {})
  }, [])

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

  useEffect(() => { fetchTree() }, [fetchTree])
  useEffect(() => {
    if ((itemDlg || tab === 1) && units.length === 0 && !unitLoad) {
      fetchUnits()
    }
  }, [itemDlg, tab, units.length, unitLoad, fetchUnits])
  useEffect(() => {
    if (tab === 2) {
      fetchTemplates()
      fetchItems()
    }
  }, [tab, fetchTemplates, fetchItems])

  // ─── Flatten groups for selects ───
  const flatGroups = useMemo(() => {
    const result: NomGroup[] = []
    const seen = new Set<string>()
    const flatten = (list: TreeGroup[]) => {
      list.forEach(g => {
        if (!seen.has(g.id)) {
          seen.add(g.id)
          result.push({ id: g.id, organization: '', name: g.name, parent: g.parent })
        }
        if (g.children?.length) flatten(g.children)
      })
    }
    if (treeData?.groups) flatten(treeData.groups)
    return result
  }, [treeData])

  useEffect(() => {
    if (selectedGroupId && !flatGroups.some(group => group.id === selectedGroupId)) {
      setSelectedGroupId(null)
    }
  }, [selectedGroupId, flatGroups])

  // ─── Filter tree by search term ───
  const filteredTree = useMemo((): TreeData | null => {
    if (!treeData) return null
    if (!treeSearch.trim()) return treeData
    const term = treeSearch.toLowerCase()

    function filterGroup(g: TreeGroup): TreeGroup | null {
      const matchedItems = g.items.filter(i =>
        i.name.toLowerCase().includes(term) || i.sku.toLowerCase().includes(term))
      const matchedChildren = g.children.map(filterGroup).filter(Boolean) as TreeGroup[]
      if (matchedItems.length > 0 || matchedChildren.length > 0 || g.name.toLowerCase().includes(term)) {
        return { ...g, children: matchedChildren, items: matchedItems }
      }
      return null
    }

    const groups = treeData.groups.map(filterGroup).filter(Boolean) as TreeGroup[]
    const root_items = treeData.root_items.filter(i =>
      i.name.toLowerCase().includes(term) || i.sku.toLowerCase().includes(term))
    return { groups, root_items }
  }, [treeData, treeSearch])

  // Auto-expand when searching
  useEffect(() => {
    if (treeSearch.trim() && filteredTree) {
      const ids: Record<string, boolean> = {}
      const collect = (g: TreeGroup) => { ids[g.id] = true; g.children.forEach(collect) }
      filteredTree.groups.forEach(collect)
      setExpanded(ids)
    }
  }, [treeSearch, filteredTree])

  const toggleExpand = (id: string) => {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const expandAll = () => {
    if (!treeData) return
    const ids: Record<string, boolean> = {}
    const collect = (g: TreeGroup) => { ids[g.id] = true; g.children.forEach(collect) }
    treeData.groups.forEach(collect)
    setExpanded(ids)
  }

  const collapseAll = () => setExpanded({})

  // ─── Item CRUD ───
  const openItemDlg = (item?: NomItem) => {
    if (units.length === 0 && !unitLoad) {
      fetchUnits()
    }

    if (item) {
      setEditItem(item)
      setItemForm({
        name: item.name, nomenclature_type: item.nomenclature_type,
        accounting_type: (item as any).accounting_type || 'stock_material',
        group: item.group || '', sku: item.sku || '', barcode: item.barcode || '',
        unit: item.unit || '', purchase_price: item.purchase_price || '',
        retail_price: item.retail_price || '', min_price: item.min_price || '',
        markup_percent: item.markup_percent || '', color: item.color || '',
        stem_length: item.stem_length ?? '', diameter: item.diameter ?? '',
        country: item.country || '', default_shelf_life_days: item.default_shelf_life_days ?? '',
        min_stock: item.min_stock ?? '', is_active: item.is_active, notes: item.notes || '',
      })
    } else {
      setEditItem(null)
      const form = defaultItemForm()
      // If a group is selected, pre-fill the group field
      if (selectedGroupId) form.group = selectedGroupId
      setItemForm(form)
    }
    setItemDlg(true)
  }

  const openItemDlgById = async (id: string) => {
    try {
      const res = await api.get(`/nomenclature/items/${id}/`)
      openItemDlg(res.data)
    } catch { notify('Не удалось загрузить позицию', 'error') }
  }

  const saveItem = async () => {
    setItemSaving(true)
    try {
      const d: Record<string, any> = { ...itemForm }
      if (!d.group) d.group = null
      if (!d.unit) d.unit = null
      if (d.stem_length === '') d.stem_length = null
      if (d.diameter === '') d.diameter = null
      if (d.default_shelf_life_days === '') d.default_shelf_life_days = null
      if (d.min_stock === '' || d.min_stock === null) d.min_stock = 0
      if (!d.purchase_price && d.purchase_price !== 0) d.purchase_price = '0.00'
      if (!d.retail_price && d.retail_price !== 0) d.retail_price = '0.00'
      if (!d.min_price && d.min_price !== 0) d.min_price = '0.00'
      if (!d.markup_percent && d.markup_percent !== 0) d.markup_percent = '0.00'
      if (editItem) { await api.patch(`/nomenclature/items/${editItem.id}/`, d); notify('Позиция обновлена') }
      else { await api.post('/nomenclature/items/', d); notify('Позиция создана') }
      setItemDlg(false); fetchTree(); fetchItems()
    } catch (err) { notify(extractError(err, 'Ошибка сохранения позиции'), 'error') }
    setItemSaving(false)
  }

  const confirmDeleteItem = (id: string, name: string) => { setDelItemId(id); setDelItemName(name) }
  const removeItem = async () => {
    if (!delItemId) return
    try { await api.delete(`/nomenclature/items/${delItemId}/`); notify('Позиция удалена'); setDelItemId(null); fetchTree(); fetchItems() }
    catch (err) { notify(extractError(err, 'Ошибка удаления позиции'), 'error') }
  }

  // ─── Group CRUD ───
  const openGrpDlg = (g?: NomGroup) => {
    if (g) { setEditGrp(g); setGrpForm({ name: g.name, parent: g.parent || '' }) }
    else {
      setEditGrp(null)
      // If a group is selected, new group becomes its child
      setGrpForm({ name: '', parent: selectedGroupId || '' })
    }
    setGrpDlg(true)
  }

  const openGrpDlgById = async (id: string) => {
    const localGroup = flatGroups.find(group => group.id === id)
    if (localGroup) {
      setEditGrp(localGroup)
      setGrpForm({ name: localGroup.name, parent: localGroup.parent || '' })
      setGrpDlg(true)
      return
    }

    try {
      const res = await api.get(`/nomenclature/groups/${id}/`)
      const g = res.data
      setEditGrp(g)
      setGrpForm({ name: g.name, parent: g.parent || '' })
      setGrpDlg(true)
    } catch { notify('Не удалось загрузить группу', 'error') }
  }

  const saveGrp = async () => {
    setGrpSaving(true)
    try {
      const d: Record<string, any> = { ...grpForm }
      if (!d.parent) d.parent = null
      if (editGrp) { await api.patch(`/nomenclature/groups/${editGrp.id}/`, d); notify('Группа обновлена') }
      else { await api.post('/nomenclature/groups/', d); notify('Группа создана') }
      setGrpDlg(false); fetchTree()
    } catch (err) { notify(extractError(err, 'Ошибка сохранения группы'), 'error') }
    setGrpSaving(false)
  }

  const confirmDeleteGroup = async (id: string, name: string) => {
    const g = flatGroups.find(x => x.id === id)
    const grp = g || { id, name, organization: '', parent: null }
    try {
      const res = await api.get(`/nomenclature/groups/${id}/delete-info/`)
      const info = res.data
      ;(grp as any)._deleteInfo = info
    } catch { /* ignore */ }
    setDelGrp(grp)
  }

  const removeGrp = async () => {
    if (!delGrp) return
    try { await api.delete(`/nomenclature/groups/${delGrp.id}/`); notify('Группа удалена'); setDelGrp(null); fetchTree() }
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
  const componentItems = items.filter(i => i.nomenclature_type !== 'bouquet' && i.nomenclature_type !== 'composition')

  const openTplDlg = (tpl?: BouquetTemplate) => {
    if (items.length === 0) {
      fetchItems()
    }

    if (tpl) {
      setEditTpl(tpl)
      setTplForm({
        nomenclature: tpl.nomenclature,
        bouquet_name: tpl.bouquet_name || '',
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
      setTplForm({ nomenclature: '', bouquet_name: '', assembly_time_minutes: 15, difficulty: 3, description: '' })
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
      const validComponents = tplComponents.filter(c => c.nomenclature && parseFloat(c.quantity) > 0)
      if (!validComponents.length) {
        notify('Добавьте хотя бы один компонент', 'error')
        setTplSaving(false)
        return
      }

      if (editTpl) {
        await api.patch(`/nomenclature/bouquet-templates/${editTpl.id}/`, {
          bouquet_name: tplForm.bouquet_name,
          assembly_time_minutes: tplForm.assembly_time_minutes,
          difficulty: tplForm.difficulty,
          description: tplForm.description,
        })
        const oldComponents = editTpl.components || []
        await Promise.all(oldComponents.map(c => api.delete(`/nomenclature/bouquet-components/${c.id}/`)))
        await Promise.all(validComponents.map(c =>
          api.post('/nomenclature/bouquet-components/', {
            template: editTpl.id, nomenclature: c.nomenclature,
            quantity: c.quantity, is_required: c.is_required,
          })
        ))
        notify('Шаблон обновлён')
      } else {
        const nomRes = await api.post('/nomenclature/items/', {
          name: tplForm.bouquet_name || 'Новый букет',
          nomenclature_type: 'bouquet', is_active: true,
        })
        const tplRes = await api.post('/nomenclature/bouquet-templates/', {
          nomenclature: nomRes.data.id, bouquet_name: tplForm.bouquet_name,
          assembly_time_minutes: tplForm.assembly_time_minutes,
          difficulty: tplForm.difficulty, description: tplForm.description,
        })
        await Promise.all(validComponents.map(c =>
          api.post('/nomenclature/bouquet-components/', {
            template: tplRes.data.id, nomenclature: c.nomenclature,
            quantity: c.quantity, is_required: c.is_required,
          })
        ))
        notify('Шаблон создан')
      }
      setTplDlg(false); fetchTemplates(); fetchItems(); fetchTree()
    } catch (err) { notify(extractError(err, 'Ошибка сохранения шаблона'), 'error') }
    setTplSaving(false)
  }

  const removeTpl = async () => {
    if (!delTpl) return
    try { await api.delete(`/nomenclature/bouquet-templates/${delTpl.id}/`); notify('Шаблон удалён'); setDelTpl(null); fetchTemplates() }
    catch (err) { notify(extractError(err, 'Ошибка удаления шаблона'), 'error') }
  }

  const tplDisplayName = (tpl: BouquetTemplate) => tpl.bouquet_name || items.find(i => i.id === tpl.nomenclature)?.name || '—'

  // Count total items in tree
  const totalCount = useMemo(() => {
    if (!treeData) return 0
    let count = treeData.root_items.length
    const countGroup = (g: TreeGroup): number => g.items.length + g.children.reduce((s, c) => s + countGroup(c), 0)
    treeData.groups.forEach(g => { count += countGroup(g) })
    return count
  }, [treeData])

  return (
    <Box>
      <Typography variant="h5" fontWeight={700} sx={{ mb: 2 }}>Номенклатура</Typography>
      <Card>
        <CardContent sx={{ pb: '16px !important' }}>
          <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}>
            <Tab icon={<Inventory />} iconPosition="start" label="Номенклатура" />
            <Tab icon={<Straighten />} iconPosition="start" label="Единицы измерения" />
            <Tab icon={<AutoAwesome />} iconPosition="start" label="Шаблоны букетов" />
          </Tabs>

          {/* ══════════════════════════════════════════════════════════════
              Tab 0: Nomenclature Tree View
              ══════════════════════════════════════════════════════════════ */}
          {tab === 0 && (
            <Box>
              {/* Toolbar */}
              <Box sx={{ display: 'flex', gap: 1, mb: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
                <TextField
                  size="small" placeholder="Поиск по названию, артикулу..."
                  value={treeSearch} onChange={(e) => setTreeSearch(e.target.value)}
                  sx={{ minWidth: 260 }}
                  slotProps={{ input: { startAdornment: <Search sx={{ mr: 0.5, color: 'text.secondary', fontSize: 20 }} /> } }}
                />
                <Button size="small" variant="text" onClick={expandAll} sx={{ textTransform: 'none', minWidth: 'auto' }}>
                  Развернуть все
                </Button>
                <Button size="small" variant="text" onClick={collapseAll} sx={{ textTransform: 'none', minWidth: 'auto' }}>
                  Свернуть все
                </Button>
                <Chip label={`Всего: ${totalCount}`} size="small" variant="outlined" />
                <Box sx={{ flexGrow: 1 }} />
                <Button variant="outlined" size="small" startIcon={<CreateNewFolder />} onClick={() => openGrpDlg()}>
                  Добавить группу
                </Button>
                <Button variant="contained" size="small" startIcon={<Add />} onClick={() => openItemDlg()}>
                  Добавить позицию
                </Button>
              </Box>

              {/* Selected group hint */}
              {selectedGroupId && (
                <Box sx={{
                  display: 'flex', alignItems: 'center', gap: 1, mb: 1,
                  px: 1.5, py: 0.5, borderRadius: 1,
                  bgcolor: (theme) => alpha(theme.palette.primary.main, 0.08),
                  border: '1px solid', borderColor: 'primary.light',
                }}>
                  <Folder fontSize="small" color="primary" />
                  <Typography variant="body2" color="primary.main">
                    Выбрана группа: <b>{flatGroups.find(g => g.id === selectedGroupId)?.name || '...'}</b> — новые позиции и группы будут добавлены в неё
                  </Typography>
                  <Button size="small" variant="text" onClick={() => setSelectedGroupId(null)} sx={{ ml: 'auto', textTransform: 'none' }}>
                    Сбросить
                  </Button>
                </Box>
              )}

              {/* Tree container */}
              <Box sx={{
                border: '1px solid', borderColor: 'divider', borderRadius: 1,
                maxHeight: 'calc(100vh - 320px)', overflow: 'auto',
                bgcolor: 'background.paper',
              }}>
                {treeLoading ? (
                  <Box sx={{ p: 3, textAlign: 'center' }}>
                    <Typography color="text.secondary">Загрузка...</Typography>
                  </Box>
                ) : !filteredTree || (filteredTree.groups.length === 0 && filteredTree.root_items.length === 0) ? (
                  <Box sx={{ p: 3, textAlign: 'center' }}>
                    <Typography color="text.secondary">
                      {treeSearch ? 'Ничего не найдено' : 'Нет позиций номенклатуры'}
                    </Typography>
                  </Box>
                ) : (
                  <>
                    {filteredTree.groups.map(group => (
                      <TreeGroupRow
                        key={group.id} group={group} depth={0}
                        expanded={expanded} onToggle={toggleExpand}
                        selectedGroupId={selectedGroupId} onSelectGroup={setSelectedGroupId}
                        onEditItem={openItemDlgById} onDeleteItem={confirmDeleteItem}
                        onEditGroup={openGrpDlgById} onDeleteGroup={confirmDeleteGroup}
                      />
                    ))}
                    {filteredTree.root_items.map(item => (
                      <TreeItemRow key={item.id} item={item} depth={0}
                        onEdit={openItemDlgById} onDelete={confirmDeleteItem} />
                    ))}
                  </>
                )}
              </Box>
            </Box>
          )}

          {/* ══ Tab 1: Measure Units ══ */}
          {tab === 1 && (
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

          {/* ══ Tab 2: Bouquet Templates ══ */}
          {tab === 2 && (
            <DataTable
              columns={[
                { key: 'bouquet_name', label: 'Букет', render: (_: any, row: BouquetTemplate) => <Typography fontWeight={500}>{tplDisplayName(row)}</Typography> },
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
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField label="Тип учёта" select fullWidth value={itemForm.accounting_type}
              onChange={e => setItemForm({ ...itemForm, accounting_type: e.target.value })}>
              {ACCOUNTING_TYPES.map(t => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
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
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField label="Ростовка / длина, см" type="number" fullWidth value={itemForm.stem_length}
              onChange={e => setItemForm({ ...itemForm, stem_length: e.target.value ? Number(e.target.value) : '' })} />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField label="Диаметр, см" type="number" fullWidth value={itemForm.diameter}
              onChange={e => setItemForm({ ...itemForm, diameter: e.target.value ? Number(e.target.value) : '' })} />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField label="Срок годности по умолчанию (дни)" type="number" fullWidth value={itemForm.default_shelf_life_days}
              onChange={e => setItemForm({ ...itemForm, default_shelf_life_days: e.target.value ? Number(e.target.value) : '' })} />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
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
        loading={tplSaving} disabled={!tplForm.bouquet_name || tplComponents.length === 0} maxWidth="md">
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 6 }}>
            <TextField label="Букет (наименование)" required fullWidth value={tplForm.bouquet_name} disabled={!!editTpl} onChange={e => setTplForm({ ...tplForm, bouquet_name: e.target.value })} />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <TextField label="Описание" fullWidth value={tplForm.description}
              onChange={e => setTplForm({ ...tplForm, description: e.target.value })} />
          </Grid>
        </Grid>
        <Grid container spacing={2}>
          <Grid size={{ xs: 6 }}>
            <TextField label="Время сборки (мин)" type="number" fullWidth value={tplForm.assembly_time_minutes}
              onChange={e => setTplForm({ ...tplForm, assembly_time_minutes: Number(e.target.value) || 0 })} />
          </Grid>
          <Grid size={{ xs: 6 }}>
            <TextField label="Сложность (1-5)" type="number" fullWidth value={tplForm.difficulty}
              slotProps={{ htmlInput: { min: 1, max: 5 } }}
              onChange={e => setTplForm({ ...tplForm, difficulty: Math.min(5, Math.max(1, Number(e.target.value) || 1)) })} />
          </Grid>
        </Grid>

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
          <MenuItem value="">Корневая (без родителя)</MenuItem>
          {flatGroups.filter(g => g.id !== editGrp?.id).map(g => <MenuItem key={g.id} value={g.id}>{g.name}</MenuItem>)}
        </TextField>
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
      <ConfirmDialog open={!!delItemId} title="Удалить позицию?" message={`Удалить "${delItemName}"? Это действие нельзя отменить.`}
        onConfirm={removeItem} onCancel={() => setDelItemId(null)} />
      <ConfirmDialog open={!!delGrp} title="Удалить группу?"
        message={`Удалить группу "${delGrp?.name}"?${(delGrp as any)?._deleteInfo ? ` Будет удалено: ${(delGrp as any)._deleteInfo.child_groups} подгрупп, ${(delGrp as any)._deleteInfo.items} позиций` : ''}`}
        onConfirm={removeGrp} onCancel={() => setDelGrp(null)} />
      <ConfirmDialog open={!!delUnit} title="Удалить единицу?" message={`Удалить единицу "${delUnit?.name}"?`}
        onConfirm={removeUnit} onCancel={() => setDelUnit(null)} />
      <ConfirmDialog open={!!delTpl} title="Удалить шаблон?" message={`Удалить шаблон букета?`}
        onConfirm={removeTpl} onCancel={() => setDelTpl(null)} />
    </Box>
  )
}
