import { useState, useEffect, useCallback, useMemo, Fragment, useRef } from 'react'
import {
  Box, Typography, TextField, Button, Tab, Tabs, IconButton,
  Chip, MenuItem, Switch, FormControlLabel, Card, CardContent,
  Collapse, Tooltip, alpha, Autocomplete, Dialog, DialogTitle,
  DialogContent, DialogActions, CircularProgress, InputAdornment,
  Avatar, Table, TableBody, TableCell, TableHead, TableRow,
} from '@mui/material'
import Grid from '@mui/material/Grid2'
import {
  Add, Edit, Delete, Inventory, Straighten, AutoAwesome,
  AddCircleOutline, RemoveCircleOutline, FolderOpen, Folder,
  ExpandMore, ChevronRight, CreateNewFolder, Search, PhotoCamera,
  History, Info, Close, Check, DragIndicator,
} from '@mui/icons-material'
import api from '../api'
import { useNotification } from '../contexts/NotificationContext'
import extractError from '../utils/extractError'
import DataTable from '../components/DataTable'
import EntityFormDialog from '../components/EntityFormDialog'
import ConfirmDialog from '../components/ConfirmDialog'

// ─── Types ───
interface NomItem {
  id: string; organization: string; group: string | null; name: string; accounting_type: string
  sku: string; barcode: string; unit: string | null; purchase_price: string; retail_price: string
  min_price: string; markup_percent: string; image: string | null; color: string; country: string
  stem_length: number | null; diameter: number | null; default_shelf_life_days: number | null
  min_stock: number | null; is_active: boolean; notes: string; group_name: string; unit_name: string
}
interface NomGroup { id: string; organization: string; name: string; parent: string | null; children?: NomGroup[] }
interface MeasureUnit { id: string; name: string; short_name: string }
interface NomOption {
  id: string; name: string; accounting_type: string
  purchase_price: string; retail_price: string; is_active: boolean
}
interface BouquetComponent {
  id: string; template: string; nomenclature: string; quantity: string
  is_required: boolean; substitute: string | null; nomenclature_name: string
}
interface BouquetTemplate {
  id: string; nomenclature: string; bouquet_name: string; assembly_time_minutes: number
  difficulty: number; description: string; components: BouquetComponent[]
  image: string | null; nomenclature_name: string; accounting_type: string; retail_price: string
}

// Tree types from /groups/tree/ endpoint
interface TreeItem {
  id: string; name: string; accounting_type: string; sku: string
  retail_price: string; purchase_price: string; is_active: boolean
}
interface TreeGroup {
  id: string; name: string; parent: string | null
  children: TreeGroup[]; items: TreeItem[]
}
interface TreeData {
  groups: TreeGroup[]; root_items: TreeItem[]
}

// Price history record
interface PriceHistoryRecord {
  id: string; nomenclature: string; purchase_price: string; retail_price: string | null; source: string; created_at: string
}

const ACCOUNTING_TYPES = [
  { value: 'stock_material', label: 'Складской материал' },
  { value: 'finished_bouquet', label: 'Готовые букеты' },
  { value: 'service', label: 'Услуги' },
]

const accountingTypeLabel = (v: string) => ACCOUNTING_TYPES.find(t => t.value === v)?.label || v

const defaultItemForm = () => ({
  name: '', accounting_type: 'stock_material', group: '' as string, sku: '', barcode: '',
  unit: '' as string, purchase_price: '', retail_price: '', min_price: '', markup_percent: '',
  color: '', country: '', stem_length: '' as string | number, diameter: '' as string | number,
  default_shelf_life_days: '' as string | number, min_stock: '' as string | number, is_active: true, notes: '',
})

// ═══════════════════════════════════════════════════════════
// Drag & Drop context
// ═══════════════════════════════════════════════════════════
interface DragState {
  type: 'item' | 'group'
  id: string
  name: string
}

// ═══════════════════════════════════════════════════════════
// Tree Header — column headers for items (prices etc.)
// ═══════════════════════════════════════════════════════════
function TreeHeader() {
  return (
    <Box
      sx={{
        display: 'flex', alignItems: 'center', gap: 0.5,
        px: 1, py: 0.5,
        bgcolor: (theme) => alpha(theme.palette.primary.main, 0.04),
        borderBottom: '2px solid', borderColor: 'divider',
        minHeight: 30, position: 'sticky', top: 0, zIndex: 2,
      }}
    >
      <Box sx={{ width: 28 }} /> {/* drag handle placeholder */}
      <Typography variant="caption" fontWeight={700} sx={{ flex: 1, pl: 1 }} color="text.secondary">
        Название
      </Typography>
      <Typography variant="caption" fontWeight={700} sx={{ minWidth: 110, textAlign: 'center' }} color="text.secondary">
        Тип учёта
      </Typography>
      <Typography variant="caption" fontWeight={700} sx={{ minWidth: 70, textAlign: 'right' }} color="text.secondary">
        Закупочная
      </Typography>
      <Typography variant="caption" fontWeight={700} sx={{ minWidth: 70, textAlign: 'right' }} color="text.secondary">
        Розничная
      </Typography>
      <Box sx={{ minWidth: 56 }} /> {/* actions placeholder */}
    </Box>
  )
}

// ═══════════════════════════════════════════════════════════
// Tree Row Component — recursive rendering of groups + items
// ═══════════════════════════════════════════════════════════
function TreeGroupRow({ group, depth, expanded, onToggle, selectedGroupId, onSelectGroup, onEditItem, onDeleteItem, onEditGroup, onDeleteGroup, onOpenCard, onInlinePrice, dragState, onDragStart, onDrop, onDragExpandGroup }: {
  group: TreeGroup; depth: number
  expanded: Record<string, boolean>; onToggle: (id: string) => void
  selectedGroupId: string | null; onSelectGroup: (id: string | null) => void
  onEditItem: (id: string) => void; onDeleteItem: (id: string, name: string) => void
  onEditGroup: (id: string) => void; onDeleteGroup: (id: string, name: string) => void
  onOpenCard?: (id: string) => void
  onInlinePrice?: (id: string, currentPrice: string) => void
  dragState: DragState | null
  onDragStart: (state: DragState) => void
  onDrop: (targetGroupId: string | null) => void
  onDragExpandGroup: (groupId: string) => void
}) {
  const isOpen = expanded[group.id] ?? false
  const isSelected = selectedGroupId === group.id
  const hasChildren = group.children.length > 0 || group.items.length > 0
  const isDragTarget = dragState !== null && !(dragState.type === 'group' && dragState.id === group.id)
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout>>(null)

  return (
    <Fragment>
      {/* Group row */}
      <Box
        onClick={(e) => { e.stopPropagation(); onSelectGroup(isSelected ? null : group.id) }}
        onDragOver={isDragTarget ? (e) => {
          e.preventDefault()
          e.stopPropagation()
          ;(e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(25,118,210,0.10)'
          if (!isOpen && hasChildren) {
            if (!hoverTimerRef.current) {
              hoverTimerRef.current = setTimeout(() => { onDragExpandGroup(group.id); hoverTimerRef.current = null }, 700)
            }
          }
        } : undefined}
        onDragLeave={isDragTarget ? (e) => {
          ;(e.currentTarget as HTMLElement).style.backgroundColor = ''
          if (hoverTimerRef.current) { clearTimeout(hoverTimerRef.current); hoverTimerRef.current = null }
        } : undefined}
        onDrop={isDragTarget ? (e) => {
          e.preventDefault()
          e.stopPropagation()
          ;(e.currentTarget as HTMLElement).style.backgroundColor = ''
          if (hoverTimerRef.current) { clearTimeout(hoverTimerRef.current); hoverTimerRef.current = null }
          onDrop(group.id)
        } : undefined}
        sx={{
          display: 'flex', alignItems: 'center', gap: 0.5,
          pl: depth * 3 + 0.5, pr: 1, py: 0.4,
          cursor: 'pointer', userSelect: 'none',
          bgcolor: isSelected ? 'action.selected' : 'transparent',
          '&:hover': { bgcolor: isSelected ? 'action.selected' : 'action.hover' },
          borderBottom: '1px solid', borderColor: 'divider',
          minHeight: 36,
          transition: 'background-color 0.15s',
        }}
        draggable
        onDragStart={(e) => {
          e.stopPropagation()
          onDragStart({ type: 'group', id: group.id, name: group.name })
          e.dataTransfer.effectAllowed = 'move'
          try { e.dataTransfer.setData('text/plain', group.id) } catch {}
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
            onOpenCard={onOpenCard} onInlinePrice={onInlinePrice}
            dragState={dragState} onDragStart={onDragStart} onDrop={onDrop}
            onDragExpandGroup={onDragExpandGroup}
          />
        ))}
        {group.items.map(item => (
          <TreeItemRow key={item.id} item={item} depth={depth + 1}
            onEdit={onEditItem} onDelete={onDeleteItem}
            onOpenCard={onOpenCard} onInlinePrice={onInlinePrice}
            onDragStart={onDragStart} />
        ))}
      </Collapse>
    </Fragment>
  )
}

function TreeItemRow({ item, depth, onEdit, onDelete, onOpenCard, onInlinePrice, onDragStart }: {
  item: TreeItem; depth: number
  onEdit: (id: string) => void; onDelete: (id: string, name: string) => void
  onOpenCard?: (id: string) => void
  onInlinePrice?: (id: string, currentPrice: string) => void
  onDragStart: (state: DragState) => void
}) {
  return (
    <Box
      onClick={() => onOpenCard?.(item.id)}
      draggable
      onDragStart={(e) => {
        e.stopPropagation()
        onDragStart({ type: 'item', id: item.id, name: item.name })
        e.dataTransfer.effectAllowed = 'move'
        try { e.dataTransfer.setData('text/plain', item.id) } catch {}
      }}
      sx={{
        display: 'flex', alignItems: 'center', gap: 0.5,
        pl: depth * 3 + 3.5, pr: 1, py: 0.3,
        cursor: 'pointer',
        '&:hover': { bgcolor: 'action.hover' },
        borderBottom: '1px solid', borderColor: 'divider',
        minHeight: 32,
        opacity: item.is_active ? 1 : 0.5,
      }}
    >
      <DragIndicator sx={{ fontSize: 14, color: 'text.disabled', cursor: 'grab', flexShrink: 0 }} />
      <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }} noWrap>{item.name}</Typography>
      <Chip label={accountingTypeLabel(item.accounting_type)} size="small" variant="outlined"
        color={item.accounting_type === 'service' ? 'secondary' : item.accounting_type === 'finished_bouquet' ? 'info' : 'default'}
        sx={{ height: 20, fontSize: '0.6rem', flexShrink: 0, minWidth: 100, justifyContent: 'center' }} />
      <Typography variant="caption" color="text.secondary" sx={{ minWidth: 70, textAlign: 'right', flexShrink: 0 }}>
        {item.purchase_price && parseFloat(item.purchase_price) > 0 ? `${parseFloat(item.purchase_price).toFixed(0)} ₽` : '—'}
      </Typography>
      <Tooltip title="Двойной клик — редактировать">
        <Typography
          variant="body2"
          fontWeight={500}
          color="primary"
          onDoubleClick={(e) => { e.stopPropagation(); onInlinePrice?.(item.id, item.retail_price || '0') }}
          sx={{
            minWidth: 70, textAlign: 'right', flexShrink: 0,
            px: 0.5, borderRadius: 0.5,
            '&:hover': { bgcolor: 'action.selected', cursor: 'text' },
          }}
        >
          {item.retail_price && parseFloat(item.retail_price) > 0 ? `${parseFloat(item.retail_price).toFixed(0)} ₽` : '—'}
        </Typography>
      </Tooltip>
      {!item.is_active && <Chip label="Неакт." size="small" color="default" sx={{ height: 18, fontSize: '0.6rem' }} />}
      <Box sx={{ display: 'flex', ml: 0.5, opacity: 0.6, '&:hover': { opacity: 1 }, flexShrink: 0 }}
        onClick={e => e.stopPropagation()}>
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

  // ─── Drag & Drop state ───
  const [dragState, setDragState] = useState<DragState | null>(null)
  // ─── Item dialog ───
  const [itemDlg, setItemDlg] = useState(false)
  const [editItem, setEditItem] = useState<NomItem | null>(null)
  const [itemForm, setItemForm] = useState(defaultItemForm())
  const [itemSaving, setItemSaving] = useState(false)
  const [delItemId, setDelItemId] = useState<string | null>(null)
  const [delItemName, setDelItemName] = useState('')

  // ─── Item Card (detail view with tabs) ───
  const [cardItem, setCardItem] = useState<NomItem | null>(null)
  const [cardTab, setCardTab] = useState(0)
  const [priceHistory, setPriceHistory] = useState<PriceHistoryRecord[]>([])
  const [priceHistoryLoading, setPriceHistoryLoading] = useState(false)

  // ─── Inline price editing ───
  const [inlinePriceId, setInlinePriceId] = useState<string | null>(null)
  const [inlinePriceValue, setInlinePriceValue] = useState('')
  const [inlinePriceSaving, setInlinePriceSaving] = useState(false)
  const inlinePriceRef = useRef<HTMLInputElement>(null)

  // ─── Item image ───
  const [itemImageFile, setItemImageFile] = useState<File | null>(null)
  const [itemImagePreview, setItemImagePreview] = useState('')
  const itemFileInputRef = useRef<HTMLInputElement>(null)

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
  const [tplForm, setTplForm] = useState({ nomenclature: '', bouquet_name: '', assembly_time_minutes: 15, difficulty: 3, description: '', retail_price: '' })
  const [tplComponents, setTplComponents] = useState<{ nomenclature: string; quantity: string; is_required: boolean }[]>([])
  const [tplSaving, setTplSaving] = useState(false)
  const [delTpl, setDelTpl] = useState<BouquetTemplate | null>(null)
  const [tplImageFile, setTplImageFile] = useState<File | null>(null)
  const [tplImagePreview, setTplImagePreview] = useState('')
  const tplFileInputRef = useRef<HTMLInputElement>(null)

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

  // ─── Fetch price history for an item ───
  const fetchPriceHistory = useCallback(async (itemId: string) => {
    setPriceHistoryLoading(true)
    try {
      const res = await api.get(`/nomenclature/items/${itemId}/price-history/`)
      setPriceHistory(res.data || [])
    } catch {
      notify('Ошибка загрузки истории цен', 'error')
      setPriceHistory([])
    } finally {
      setPriceHistoryLoading(false)
    }
  }, [notify])

  // ─── Open item card ───
  const openItemCard = useCallback(async (id: string) => {
    try {
      const res = await api.get(`/nomenclature/items/${id}/`)
      setCardItem(res.data)
      setCardTab(0)
      fetchPriceHistory(id)
    } catch {
      notify('Не удалось загрузить позицию', 'error')
    }
  }, [notify, fetchPriceHistory])

  // ─── Inline price update ───
  const startInlinePrice = (id: string, currentPrice: string) => {
    setInlinePriceId(id)
    setInlinePriceValue(currentPrice || '0')
    setTimeout(() => inlinePriceRef.current?.select(), 50)
  }

  const saveInlinePrice = async () => {
    if (!inlinePriceId) return
    setInlinePriceSaving(true)
    try {
      await api.patch(`/nomenclature/items/${inlinePriceId}/update-price/`, {
        retail_price: inlinePriceValue,
      })
      notify('Цена обновлена')
      fetchTree()
    } catch (err) {
      notify(extractError(err, 'Ошибка обновления цены'), 'error')
    } finally {
      setInlinePriceSaving(false)
      setInlinePriceId(null)
    }
  }

  const cancelInlinePrice = () => {
    setInlinePriceId(null)
    setInlinePriceValue('')
  }

  const appendFormDataValue = (formData: FormData, key: string, value: unknown) => {
    if (value === null || value === undefined) return
    formData.append(key, String(value))
  }

  // ─── Item image handler ───
  const handleItemImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setItemImageFile(file)
    setItemImagePreview(URL.createObjectURL(file))
  }

  // ─── Template image handler ───
  const handleTemplateImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setTplImageFile(file)
    setTplImagePreview(URL.createObjectURL(file))
  }

  const closeItemDialog = () => {
    setItemDlg(false)
    setEditItem(null)
    setItemImageFile(null)
    setItemImagePreview('')
    if (itemFileInputRef.current) itemFileInputRef.current.value = ''
  }

  const closeTplDialog = () => {
    setTplDlg(false)
    setEditTpl(null)
    setTplImageFile(null)
    setTplImagePreview('')
    if (tplFileInputRef.current) tplFileInputRef.current.value = ''
  }

  // ─── Get default unit (шт.) ───
  const getDefaultUnit = useCallback(() => {
    return units.find(u => u.short_name === 'шт.' || u.short_name === 'шт' || u.name.toLowerCase() === 'штука')
  }, [units])

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
  useEffect(() => {
    return () => {
      if (itemImagePreview.startsWith('blob:')) {
        URL.revokeObjectURL(itemImagePreview)
      }
    }
  }, [itemImagePreview])
  useEffect(() => {
    return () => {
      if (tplImagePreview.startsWith('blob:')) {
        URL.revokeObjectURL(tplImagePreview)
      }
    }
  }, [tplImagePreview])

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

  // ─── Drag & Drop handlers ───
  const handleDragStart = useCallback((state: DragState) => {
    setDragState(state)
  }, [])

  const handleDrop = useCallback(async (targetGroupId: string | null) => {
    if (!dragState) return
    try {
      if (dragState.type === 'item') {
        await api.patch(`/nomenclature/items/${dragState.id}/move/`, { group: targetGroupId })
        notify(`«${dragState.name}» перемещён`)
      } else {
        await api.patch(`/nomenclature/groups/${dragState.id}/move/`, { parent: targetGroupId })
        notify(`Группа «${dragState.name}» перемещена`)
      }
      fetchTree()
    } catch (err) {
      notify(extractError(err, 'Ошибка перемещения'), 'error')
    } finally {
      setDragState(null)
    }
  }, [dragState, notify, fetchTree])

  const handleDragExpandGroup = useCallback((groupId: string) => {
    setExpanded(prev => ({ ...prev, [groupId]: true }))
  }, [])

  // ─── Item CRUD ───
  const openItemDlg = (item?: NomItem) => {
    if (units.length === 0 && !unitLoad) {
      fetchUnits()
    }

    setItemImageFile(null)
    setItemImagePreview(item?.image || '')
    if (itemFileInputRef.current) itemFileInputRef.current.value = ''

    if (item) {
      setEditItem(item)
      setItemForm({
        name: item.name,
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
      // Set default unit to "шт." if available
      const defaultUnit = getDefaultUnit()
      if (defaultUnit) form.unit = defaultUnit.id
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
      const payload: Record<string, unknown> = {
        ...itemForm,
        group: itemForm.group || null,
        unit: itemForm.unit || null,
        stem_length: itemForm.stem_length === '' ? null : itemForm.stem_length,
        diameter: itemForm.diameter === '' ? null : itemForm.diameter,
        default_shelf_life_days: itemForm.default_shelf_life_days === '' ? null : itemForm.default_shelf_life_days,
        min_stock: itemForm.min_stock === '' || itemForm.min_stock === null ? 0 : itemForm.min_stock,
        purchase_price: itemForm.purchase_price || '0.00',
        retail_price: itemForm.retail_price || '0.00',
        min_price: itemForm.min_price || '0.00',
        markup_percent: itemForm.markup_percent || '0.00',
      }

      const formData = new FormData()
      Object.entries(payload).forEach(([key, value]) => appendFormDataValue(formData, key, value))
      if (itemImageFile) {
        formData.append('image', itemImageFile)
      }

      const requestConfig = { headers: { 'Content-Type': 'multipart/form-data' } }
      if (editItem) {
        await api.patch(`/nomenclature/items/${editItem.id}/`, formData, requestConfig)
        notify('Позиция обновлена')
      } else {
        await api.post('/nomenclature/items/', formData, requestConfig)
        notify('Позиция создана')
      }
      closeItemDialog()
      fetchTree(); fetchItems()
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
  const componentItems = items.filter(i => i.accounting_type !== 'finished_bouquet' && i.accounting_type !== 'service')

  const openTplDlg = (tpl?: BouquetTemplate) => {
    if (items.length === 0) {
      fetchItems()
    }

    setTplImageFile(null)
    setTplImagePreview(tpl?.image || '')
    if (tplFileInputRef.current) tplFileInputRef.current.value = ''

    if (tpl) {
      setEditTpl(tpl)
      setTplForm({
        nomenclature: tpl.nomenclature,
        bouquet_name: tpl.bouquet_name || tpl.nomenclature_name || '',
        assembly_time_minutes: tpl.assembly_time_minutes,
        difficulty: tpl.difficulty,
        description: tpl.description || '',
        retail_price: tpl.retail_price || '',
      })
      setTplComponents(tpl.components.map(c => ({
        nomenclature: c.nomenclature,
        quantity: c.quantity,
        is_required: c.is_required,
      })))
    } else {
      setEditTpl(null)
      setTplForm({ nomenclature: '', bouquet_name: '', assembly_time_minutes: 15, difficulty: 3, description: '', retail_price: '' })
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

      const bouquetName = tplForm.bouquet_name.trim() || 'Новый букет'
      const retailPrice = tplForm.retail_price || '0.00'

      const saveComponents = async (templateId: string, previousComponents: BouquetComponent[] = []) => {
        if (previousComponents.length) {
          await Promise.all(previousComponents.map(c => api.delete(`/nomenclature/bouquet-components/${c.id}/`)))
        }
        await Promise.all(validComponents.map(c =>
          api.post('/nomenclature/bouquet-components/', {
            template: templateId,
            nomenclature: c.nomenclature,
            quantity: c.quantity,
            is_required: c.is_required,
          })
        ))
      }

      if (editTpl) {
        await api.patch(`/nomenclature/items/${editTpl.nomenclature}/`, {
          name: bouquetName,
          retail_price: retailPrice,
          is_active: true,
          accounting_type: 'finished_bouquet',
          is_template_placeholder: true,
        })

        const templateFormData = new FormData()
        appendFormDataValue(templateFormData, 'bouquet_name', bouquetName)
        appendFormDataValue(templateFormData, 'assembly_time_minutes', tplForm.assembly_time_minutes)
        appendFormDataValue(templateFormData, 'difficulty', tplForm.difficulty)
        appendFormDataValue(templateFormData, 'description', tplForm.description)
        if (tplImageFile) {
          templateFormData.append('image', tplImageFile)
        }

        await api.patch(`/nomenclature/bouquet-templates/${editTpl.id}/`, templateFormData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        await saveComponents(editTpl.id, editTpl.components || [])
        notify('Шаблон обновлён')
      } else {
        const nomRes = await api.post('/nomenclature/items/', {
          name: bouquetName,
          accounting_type: 'finished_bouquet',
          retail_price: retailPrice,
          is_active: true,
          is_template_placeholder: true,
        })

        const templateFormData = new FormData()
        appendFormDataValue(templateFormData, 'nomenclature', nomRes.data.id)
        appendFormDataValue(templateFormData, 'bouquet_name', bouquetName)
        appendFormDataValue(templateFormData, 'assembly_time_minutes', tplForm.assembly_time_minutes)
        appendFormDataValue(templateFormData, 'difficulty', tplForm.difficulty)
        appendFormDataValue(templateFormData, 'description', tplForm.description)
        if (tplImageFile) {
          templateFormData.append('image', tplImageFile)
        }

        const tplRes = await api.post('/nomenclature/bouquet-templates/', templateFormData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        await saveComponents(tplRes.data.id)
        notify('Шаблон создан')
      }
      closeTplDialog(); fetchTemplates(); fetchItems(); fetchTree()
    } catch (err) { notify(extractError(err, 'Ошибка сохранения шаблона'), 'error') }
    setTplSaving(false)
  }

  const removeTpl = async () => {
    if (!delTpl) return
    try { await api.delete(`/nomenclature/bouquet-templates/${delTpl.id}/`); notify('Шаблон удалён'); setDelTpl(null); fetchTemplates() }
    catch (err) { notify(extractError(err, 'Ошибка удаления шаблона'), 'error') }
  }

  const tplDisplayName = (tpl: BouquetTemplate) => tpl.bouquet_name || tpl.nomenclature_name || '—'

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
              <Box
                onDragOver={dragState ? (e) => { e.preventDefault() } : undefined}
                onDrop={dragState ? (e) => {
                  e.preventDefault()
                  handleDrop(null)
                } : undefined}
                onDragEnd={() => setDragState(null)}
                sx={{
                  border: '1px solid', borderColor: 'divider', borderRadius: 1,
                  maxHeight: 'calc(100vh - 320px)', overflow: 'auto',
                  bgcolor: 'background.paper', position: 'relative',
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
                    <TreeHeader />
                    {filteredTree.groups.map(group => (
                      <TreeGroupRow
                        key={group.id} group={group} depth={0}
                        expanded={expanded} onToggle={toggleExpand}
                        selectedGroupId={selectedGroupId} onSelectGroup={setSelectedGroupId}
                        onEditItem={openItemDlgById} onDeleteItem={confirmDeleteItem}
                        onEditGroup={openGrpDlgById} onDeleteGroup={confirmDeleteGroup}
                        onOpenCard={openItemCard} onInlinePrice={startInlinePrice}
                        dragState={dragState} onDragStart={handleDragStart} onDrop={handleDrop}
                        onDragExpandGroup={handleDragExpandGroup}
                      />
                    ))}
                    {filteredTree.root_items.map(item => (
                      <TreeItemRow key={item.id} item={item} depth={0}
                        onEdit={openItemDlgById} onDelete={confirmDeleteItem}
                        onOpenCard={openItemCard} onInlinePrice={startInlinePrice}
                        onDragStart={handleDragStart} />
                    ))}
                    {dragState && (
                      <Box sx={{ p: 1.5, borderTop: '2px dashed', borderColor: 'primary.main', textAlign: 'center', bgcolor: alpha('#1976d2', 0.04) }}>
                        <Typography variant="caption" color="primary">Перетащите сюда для перемещения в корень</Typography>
                      </Box>
                    )}
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
              rows={units} loading={unitLoad} emptyText="Нет единиц измерения" dense
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
              rows={templates} loading={tplLoad} emptyText="Нет шаблонов букетов" dense
              headerActions={<Button variant="contained" startIcon={<Add />} onClick={() => openTplDlg()}>Добавить шаблон</Button>}
            />
          )}
        </CardContent>
      </Card>

      {/* ─── Item Dialog ─── */}
      <EntityFormDialog open={itemDlg} onClose={closeItemDialog} onSubmit={saveItem}
        title={editItem ? 'Редактировать позицию' : 'Новая позиция'} submitText={editItem ? 'Сохранить' : 'Создать'}
        loading={itemSaving} disabled={!itemForm.name} maxWidth="md">
        <Grid container spacing={2}>
          {/* Photo upload area */}
          <Grid size={{ xs: 12, md: 3 }}>
            <Box sx={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
              p: 2, border: '1px dashed', borderColor: 'divider', borderRadius: 1,
              bgcolor: 'background.default', minHeight: 120,
            }}>
              {itemImagePreview ? (
                <Avatar
                  src={itemImagePreview}
                  variant="rounded"
                  sx={{ width: 80, height: 80 }}
                />
              ) : (
                <PhotoCamera sx={{ fontSize: 40, color: 'text.disabled' }} />
              )}
              <input
                ref={itemFileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleItemImageChange}
              />
              <Button
                size="small" variant="outlined"
                onClick={() => itemFileInputRef.current?.click()}
                startIcon={<PhotoCamera />}
              >
                {itemImagePreview ? 'Изменить фото' : 'Выбрать фото'}
              </Button>
              <Typography variant="caption" color="text.secondary" align="center">
                Фото сохранится вместе с карточкой позиции
              </Typography>
            </Box>
          </Grid>
          <Grid size={{ xs: 12, md: 9 }}>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12 }}>
                <TextField label="Название" required fullWidth value={itemForm.name}
                  onChange={e => setItemForm({ ...itemForm, name: e.target.value })} />
              </Grid>
            </Grid>
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField label="Тип учёта" select fullWidth value={itemForm.accounting_type}
              onChange={e => setItemForm({ ...itemForm, accounting_type: e.target.value })}>
              {ACCOUNTING_TYPES.map(t => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField label="Группа" select fullWidth value={itemForm.group}
              onChange={e => setItemForm({ ...itemForm, group: e.target.value })}>
              <MenuItem value="">Без группы</MenuItem>
              {flatGroups.map(g => <MenuItem key={g.id} value={g.id}>{g.name}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <Autocomplete
              options={units}
              getOptionLabel={(option) => `${option.name} (${option.short_name})`}
              value={units.find(u => u.id === itemForm.unit) || null}
              onChange={(_, newValue) => setItemForm({ ...itemForm, unit: newValue?.id || '' })}
              renderInput={(params) => (
                <TextField {...params} label="Единица измерения" placeholder="Поиск..." />
              )}
              isOptionEqualToValue={(option, value) => option.id === value.id}
              noOptionsText="Нет единиц"
              loading={unitLoad}
            />
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
      <EntityFormDialog open={tplDlg} onClose={closeTplDialog} onSubmit={saveTpl}
        title={editTpl ? 'Редактировать шаблон букета' : 'Новый шаблон букета'}
        submitText={editTpl ? 'Сохранить' : 'Создать'}
        loading={tplSaving} disabled={!tplForm.bouquet_name || tplComponents.length === 0} maxWidth="md">
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 3 }}>
            <Box sx={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
              p: 2, border: '1px dashed', borderColor: 'divider', borderRadius: 1,
              bgcolor: 'background.default', minHeight: 140,
            }}>
              {tplImagePreview ? (
                <Avatar src={tplImagePreview} variant="rounded" sx={{ width: 88, height: 88 }} />
              ) : (
                <AutoAwesome sx={{ fontSize: 42, color: 'text.disabled' }} />
              )}
              <input
                ref={tplFileInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleTemplateImageChange}
              />
              <Button size="small" variant="outlined" startIcon={<PhotoCamera />} onClick={() => tplFileInputRef.current?.click()}>
                {tplImagePreview ? 'Изменить фото' : 'Выбрать фото'}
              </Button>
            </Box>
          </Grid>
          <Grid size={{ xs: 12, md: 5 }}>
            <TextField label="Букет (наименование)" required fullWidth value={tplForm.bouquet_name}
              onChange={e => setTplForm({ ...tplForm, bouquet_name: e.target.value })} />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField label="Цена продажи" type="number" fullWidth value={tplForm.retail_price}
              onChange={e => setTplForm({ ...tplForm, retail_price: e.target.value })} />
          </Grid>
          <Grid size={{ xs: 12, md: 9 }}>
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
        {tplComponents.map((comp, idx) => {
          const selectedNom = componentItems.find(n => n.id === comp.nomenclature) || null
          return (
          <Grid container spacing={1} key={idx} alignItems="center">
            <Grid size={{ xs: 4 }}>
              <Autocomplete size="small" options={componentItems}
                getOptionLabel={(o) => o.name}
                value={selectedNom}
                onChange={(_, newValue) => updateTplComponent(idx, 'nomenclature', newValue ? newValue.id : '')}
                renderInput={(params) => <TextField {...params} label="Материал" required fullWidth />}
                isOptionEqualToValue={(option, value) => option.id === value.id}
                noOptionsText="Нет компонентов" />
            </Grid>
            <Grid size={{ xs: 2 }}>
              <TextField label="Кол-во" required type="number" fullWidth size="small" value={comp.quantity}
                onChange={e => updateTplComponent(idx, 'quantity', e.target.value)} />
            </Grid>
            <Grid size={{ xs: 2 }}>
              <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'right', pr: 1 }}>
                {selectedNom ? `${selectedNom.retail_price} ₽` : '—'}
              </Typography>
            </Grid>
            <Grid size={{ xs: 2 }}>
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
          )
        })}
        <Button startIcon={<AddCircleOutline />} onClick={addTplComponent} size="small">
          Добавить компонент
        </Button>
        {tplComponents.length > 0 && (
          <>
          <Typography variant="body2" sx={{ mt: 1, fontWeight: 500 }}>
            Расчётная себестоимость: {tplComponents.reduce((sum, c) => {
              const nom = items.find(i => i.id === c.nomenclature)
              return sum + (nom ? parseFloat(nom.purchase_price) * (parseFloat(c.quantity) || 0) : 0)
            }, 0).toFixed(2)} ₽
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            Расчётная розничная: {tplComponents.reduce((sum, c) => {
              const nom = items.find(i => i.id === c.nomenclature)
              return sum + (nom ? parseFloat(nom.retail_price) * (parseFloat(c.quantity) || 0) : 0)
            }, 0).toFixed(2)} ₽
          </Typography>
          </>
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

      {/* ─── Item Card Dialog (detail view with tabs) ─── */}
      <Dialog open={!!cardItem} onClose={() => setCardItem(null)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {cardItem?.image && (
            <Avatar src={cardItem.image} variant="rounded" sx={{ width: 48, height: 48 }} />
          )}
          <Box sx={{ flex: 1 }}>
            <Typography variant="h6">{cardItem?.name || ''}</Typography>
            <Typography variant="caption" color="text.secondary">
              {cardItem?.sku ? `Артикул: ${cardItem.sku}` : ''}
              {cardItem?.sku && cardItem?.barcode ? ' • ' : ''}
              {cardItem?.barcode ? `Штрих-код: ${cardItem.barcode}` : ''}
            </Typography>
          </Box>
          <IconButton onClick={() => setCardItem(null)}><Close /></IconButton>
        </DialogTitle>
        <DialogContent dividers>
          <Tabs value={cardTab} onChange={(_, v) => setCardTab(v)} sx={{ mb: 2 }}>
            <Tab icon={<Info />} iconPosition="start" label="Основная информация" />
            <Tab icon={<History />} iconPosition="start" label="История цен" />
          </Tabs>

          {cardTab === 0 && cardItem && (
            <Grid container spacing={2}>
              <Grid size={{ xs: 6, md: 3 }}>
                <Typography variant="caption" color="text.secondary">Тип учёта</Typography>
                <Typography>{accountingTypeLabel(cardItem.accounting_type || 'stock_material')}</Typography>
              </Grid>
              <Grid size={{ xs: 6, md: 3 }}>
                <Typography variant="caption" color="text.secondary">Группа</Typography>
                <Typography>{cardItem.group_name || 'Без группы'}</Typography>
              </Grid>
              <Grid size={{ xs: 6, md: 3 }}>
                <Typography variant="caption" color="text.secondary">Единица измерения</Typography>
                <Typography>{cardItem.unit_name || '—'}</Typography>
              </Grid>
              <Grid size={{ xs: 6, md: 3 }}>
                <Typography variant="caption" color="text.secondary">Закупочная цена</Typography>
                <Typography fontWeight={500}>{cardItem.purchase_price ? `${cardItem.purchase_price} ₽` : '—'}</Typography>
              </Grid>
              <Grid size={{ xs: 6, md: 3 }}>
                <Typography variant="caption" color="text.secondary">Розничная цена</Typography>
                <Typography fontWeight={500} color="primary">{cardItem.retail_price ? `${cardItem.retail_price} ₽` : '—'}</Typography>
              </Grid>
              <Grid size={{ xs: 6, md: 3 }}>
                <Typography variant="caption" color="text.secondary">Минимальная цена</Typography>
                <Typography>{cardItem.min_price ? `${cardItem.min_price} ₽` : '—'}</Typography>
              </Grid>
              <Grid size={{ xs: 6, md: 3 }}>
                <Typography variant="caption" color="text.secondary">Наценка</Typography>
                <Typography>{cardItem.markup_percent ? `${cardItem.markup_percent}%` : '—'}</Typography>
              </Grid>
              {cardItem.color && (
                <Grid size={{ xs: 6, md: 3 }}>
                  <Typography variant="caption" color="text.secondary">Цвет</Typography>
                  <Typography>{cardItem.color}</Typography>
                </Grid>
              )}
              {cardItem.country && (
                <Grid size={{ xs: 6, md: 3 }}>
                  <Typography variant="caption" color="text.secondary">Страна</Typography>
                  <Typography>{cardItem.country}</Typography>
                </Grid>
              )}
              {cardItem.stem_length && (
                <Grid size={{ xs: 6, md: 3 }}>
                  <Typography variant="caption" color="text.secondary">Ростовка</Typography>
                  <Typography>{cardItem.stem_length} см</Typography>
                </Grid>
              )}
              {cardItem.notes && (
                <Grid size={{ xs: 12 }}>
                  <Typography variant="caption" color="text.secondary">Примечания</Typography>
                  <Typography>{cardItem.notes}</Typography>
                </Grid>
              )}
            </Grid>
          )}

          {cardTab === 1 && (
            <Box>
              {priceHistoryLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                  <CircularProgress />
                </Box>
              ) : priceHistory.length === 0 ? (
                <Typography color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
                  История изменения цен отсутствует. Цены записываются при редактировании позиции, быстром изменении цены и поступлениях.
                </Typography>
              ) : (
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Дата</TableCell>
                      <TableCell align="right">Закупочная</TableCell>
                      <TableCell align="right">Розничная</TableCell>
                      <TableCell>Источник</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {priceHistory.map((record) => (
                      <TableRow key={record.id}>
                        <TableCell>{new Date(record.created_at).toLocaleString('ru-RU')}</TableCell>
                        <TableCell align="right">{record.purchase_price} ₽</TableCell>
                        <TableCell align="right">{record.retail_price ? `${record.retail_price} ₽` : '—'}</TableCell>
                        <TableCell>
                          <Chip
                            label={record.source || 'Источник не указан'}
                            size="small" variant="outlined"
                            color={record.source.startsWith('Приход') ? 'success' : 'default'}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setCardItem(null); openItemDlg(cardItem!) }} startIcon={<Edit />}>
            Редактировать
          </Button>
          <Button onClick={() => setCardItem(null)}>Закрыть</Button>
        </DialogActions>
      </Dialog>

      {/* ─── Inline Price Editor Dialog ─── */}
      <Dialog open={!!inlinePriceId} onClose={cancelInlinePrice} maxWidth="xs">
        <DialogTitle>Изменить розничную цену</DialogTitle>
        <DialogContent>
          <TextField
            inputRef={inlinePriceRef}
            type="number"
            label="Розничная цена"
            fullWidth
            value={inlinePriceValue}
            onChange={(e) => setInlinePriceValue(e.target.value)}
            slotProps={{
              input: {
                endAdornment: <InputAdornment position="end">₽</InputAdornment>,
              },
            }}
            sx={{ mt: 1 }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveInlinePrice()
              if (e.key === 'Escape') cancelInlinePrice()
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={cancelInlinePrice}>Отмена</Button>
          <Button
            variant="contained"
            onClick={saveInlinePrice}
            disabled={inlinePriceSaving}
            startIcon={inlinePriceSaving ? <CircularProgress size={16} /> : <Check />}
          >
            Сохранить
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
