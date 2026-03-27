import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  Box, Typography, Card, CardContent, TextField, MenuItem,
  IconButton, Button, Chip, Dialog, DialogTitle, DialogContent,
  DialogActions, InputAdornment, Badge, Divider, Avatar,
  Paper, Tabs, Tab, CircularProgress, Tooltip,
} from '@mui/material'
import Grid from '@mui/material/Grid2'
import {
  Add, Remove, Delete, Search, ShoppingCart, Payment,
  LocalFlorist, BookmarkBorder, Close, PointOfSale,
  Percent, Person, Phone, Category,
} from '@mui/icons-material'
import api from '../api'
import { useAuth } from '../contexts/AuthContext'
import { useNotification } from '../contexts/NotificationContext'
import extractError from '../utils/extractError'

// ─── Types ───
interface SalesCategory {
  id: string; name: string; icon: string; sort_order: number
  is_visible_in_cashier: boolean; source_type: string; is_system: boolean
  group_ids: string[]
}

interface FeedItem {
  source_type: string; item_id: string; title: string; subtitle: string
  image: string; price: string; available_qty: string; badge: string
  payload: Record<string, string>
  reserve_id: string; reserve_number: number; customer_name: string
  phone: string; expires_at: string | null
}

interface CartLine {
  key: string
  source_mode: string
  nomenclature: string
  batch?: string
  reserve?: string
  warehouse?: string
  title: string
  price: number
  quantity: number
  discount_percent: number
  available_qty: number
  image: string
}

interface CustomerRef { id: string; name: string; phone: string }
interface PaymentMethodRef { id: string; name: string }
interface BouquetSnapshot {
  id: string
  batch: string
  nomenclature: string
  nomenclature_name: string
  accounting_type: string
  quantity_per_unit: string
  price_per_unit: string
  sort_order: number
  source_mode: string
  created_at: string
}

const fmtPrice = (v: number) => v.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const SOURCE_ICONS: Record<string, React.ReactNode> = {
  nomenclature: <Category fontSize="small" />,
  finished_bouquets: <LocalFlorist fontSize="small" />,
  reserve: <BookmarkBorder fontSize="small" />,
}
const SOURCE_COLORS: Record<string, 'default' | 'primary' | 'success' | 'warning' | 'error' | 'info' | 'secondary'> = {
  nomenclature: 'default',
  finished_bouquets: 'success',
  reserve: 'warning',
}

export default function CashierPage() {
  const { user } = useAuth()
  const { notify } = useNotification()
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const feedRequestRef = useRef(0)
  const checkoutRefsRequestRef = useRef<Promise<void> | null>(null)

  // ─── Categories ───
  const [categories, setCategories] = useState<SalesCategory[]>([])
  const [activeCat, setActiveCat] = useState<string>('')

  // ─── Feed ───
  const [feed, setFeed] = useState<FeedItem[]>([])
  const [feedLoading, setFeedLoading] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const [searchQ, setSearchQ] = useState('')

  // ─── Cart ───
  const [cart, setCart] = useState<CartLine[]>([])
  const [snapshotMap, setSnapshotMap] = useState<Record<string, BouquetSnapshot[]>>({})
  const [snapshotLoading, setSnapshotLoading] = useState<Record<string, boolean>>({})

  // ─── Checkout ───
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [checkoutSaving, setCheckoutSaving] = useState(false)
  const [orderDiscount, setOrderDiscount] = useState(0)
  const [orderNotes, setOrderNotes] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState('')
  const [selectedPayment, setSelectedPayment] = useState('')

  // ─── Refs ───
  const [customers, setCustomers] = useState<CustomerRef[]>([])
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodRef[]>([])
  const [checkoutRefsLoading, setCheckoutRefsLoading] = useState(false)
  const [checkoutRefsLoaded, setCheckoutRefsLoaded] = useState(false)

  // ─── Shift ───
  const [shiftOpen, setShiftOpen] = useState(true)
  const [shiftChecked, setShiftChecked] = useState(false)

  // ═══ Fetch Categories ═══
  const fetchCategories = useCallback(() => {
    api.get('/cashier/categories/')
      .then(res => {
        const cats: SalesCategory[] = (res.data.results || res.data || [])
          .filter((c: SalesCategory) => c.is_visible_in_cashier)
          .sort((a: SalesCategory, b: SalesCategory) => a.sort_order - b.sort_order)
        setCategories(cats)
        setActiveCat(prev => (prev && !cats.some((c: SalesCategory) => c.id === prev) ? '' : prev))
      })
      .catch(() => notify('Ошибка загрузки категорий', 'error'))
  }, [notify])

  // ═══ Check Shift ═══
  const checkShift = useCallback(() => {
    api.get('/finance/cash-shifts/', { params: { status: 'open' } })
      .then(res => {
        const list = res.data.results || res.data || []
        setShiftOpen(list.length > 0)
      })
      .catch(() => setShiftOpen(false))
      .finally(() => setShiftChecked(true))
  }, [])

  // ═══ Fetch Feed ═══
  const fetchFeed = useCallback(() => {
    const requestId = ++feedRequestRef.current
    setFeedLoading(true)
    const params: Record<string, string> = {}
    if (activeCat) params.category_id = activeCat
    if (searchQ.trim()) params.q = searchQ.trim()
    api.get('/cashier/feed/', { params })
      .then(res => {
        if (requestId !== feedRequestRef.current) return
        setFeed(res.data || [])
      })
      .catch(() => {
        if (requestId !== feedRequestRef.current) return
        setFeed([])
      })
      .finally(() => {
        if (requestId === feedRequestRef.current) {
          setFeedLoading(false)
        }
      })
  }, [activeCat, searchQ])

  // ═══ Fetch Refs ═══
  const fetchCheckoutRefs = useCallback(() => {
    if (checkoutRefsLoaded) return Promise.resolve()
    if (checkoutRefsRequestRef.current) return checkoutRefsRequestRef.current

    setCheckoutRefsLoading(true)
    const request = Promise.allSettled([
      api.get('/customers/customers/'),
      api.get('/core/payment-methods/'),
    ])
      .then(([custRes, pmRes]) => {
        if (custRes.status === 'fulfilled') setCustomers(custRes.value.data.results || custRes.value.data || [])
        if (pmRes.status === 'fulfilled') setPaymentMethods(pmRes.value.data.results || pmRes.value.data || [])
        if (custRes.status === 'fulfilled' || pmRes.status === 'fulfilled') {
          setCheckoutRefsLoaded(true)
        }
      })
      .finally(() => {
        setCheckoutRefsLoading(false)
        checkoutRefsRequestRef.current = null
      })

    checkoutRefsRequestRef.current = request
    return request
  }, [checkoutRefsLoaded])

  useEffect(() => { fetchCategories() }, [fetchCategories])
  useEffect(() => { checkShift() }, [checkShift])
  useEffect(() => { fetchFeed() }, [fetchFeed])
  useEffect(() => {
    if (!checkoutOpen) return
    void fetchCheckoutRefs()
  }, [checkoutOpen, fetchCheckoutRefs])

  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    searchDebounceRef.current = setTimeout(() => {
      setSearchQ(searchInput)
    }, 350)

    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    }
  }, [searchInput])

  const fetchSnapshots = useCallback(async (batchId: string) => {
    if (!batchId) return
    setSnapshotLoading(prev => ({ ...prev, [batchId]: true }))
    try {
      const res = await api.get('/cashier/snapshots/', { params: { batch: batchId } })
      setSnapshotMap(prev => ({ ...prev, [batchId]: res.data.results || res.data || [] }))
    } catch {
      setSnapshotMap(prev => ({ ...prev, [batchId]: [] }))
    } finally {
      setSnapshotLoading(prev => ({ ...prev, [batchId]: false }))
    }
  }, [])

  useEffect(() => {
    cart.forEach(line => {
      if (!line.batch) return
      if (!['ready_bouquet', 'reserve'].includes(line.source_mode)) return
      if (snapshotMap[line.batch] || snapshotLoading[line.batch]) return
      fetchSnapshots(line.batch)
    })
  }, [cart, snapshotMap, snapshotLoading, fetchSnapshots])

  // ═══ Cart Operations ═══
  const addToCart = (item: FeedItem) => {
    const key = `${item.payload.source_mode}_${item.item_id}`
    setCart(prev => {
      const existing = prev.find(c => c.key === key)
      if (existing) {
        if (existing.quantity >= existing.available_qty && item.payload.accounting_type !== 'service') {
          notify('Максимально доступное количество', 'warning')
          return prev
        }
        return prev.map(c => c.key === key ? { ...c, quantity: c.quantity + 1 } : c)
      }
      return [...prev, {
        key,
        source_mode: item.payload.source_mode || 'catalog',
        nomenclature: item.payload.nomenclature || item.item_id,
        batch: item.payload.batch,
        reserve: item.payload.reserve,
        warehouse: item.payload.warehouse,
        title: item.title,
        price: parseFloat(item.price) || 0,
        quantity: 1,
        discount_percent: 0,
        available_qty: item.payload.accounting_type === 'service' ? 999999 : (parseFloat(item.available_qty) || 0),
        image: item.image || '',
      }]
    })
  }

  const updateCartQty = (key: string, delta: number) => {
    setCart(prev => prev.map(c => {
      if (c.key !== key) return c
      const newQty = c.quantity + delta
      if (newQty < 1) return c
      if (newQty > c.available_qty && c.source_mode !== 'catalog') return c
      return { ...c, quantity: newQty }
    }))
  }

  const setCartQty = (key: string, value: number) => {
    const qty = Math.max(1, Math.floor(value) || 1)
    setCart(prev => prev.map(c => {
      if (c.key !== key) return c
      if (qty > c.available_qty && c.source_mode !== 'catalog') return { ...c, quantity: c.available_qty }
      return { ...c, quantity: qty }
    }))
  }

  const updateCartDiscount = (key: string, discount: number) => {
    setCart(prev => prev.map(c => c.key === key ? { ...c, discount_percent: Math.min(100, Math.max(0, discount)) } : c))
  }

  const updateCartPrice = (key: string, price: number) => {
    setCart(prev => prev.map(c => c.key === key ? { ...c, price: Math.max(0, price) } : c))
  }

  const removeFromCart = (key: string) => {
    setCart(prev => prev.filter(c => c.key !== key))
  }

  // ═══ Totals ═══
  const cartSubtotal = useMemo(() =>
    cart.reduce((sum, c) => sum + c.price * c.quantity * (1 - c.discount_percent / 100), 0),
    [cart])

  const cartTotal = useMemo(() => {
    const afterDiscount = cartSubtotal * (1 - orderDiscount / 100)
    return Math.max(0, afterDiscount)
  }, [cartSubtotal, orderDiscount])

  // ═══ Checkout ═══
  const doCheckout = async () => {
    if (!cart.length) { notify('Корзина пуста', 'warning'); return }
    setCheckoutSaving(true)
    try {
      const payload = {
        customer: selectedCustomer || null,
        payment_method: selectedPayment || null,
        notes: orderNotes,
        discount_percent: orderDiscount,
        discount_amount: 0,
        cart_lines: cart.map(c => ({
          source_mode: c.source_mode,
          nomenclature: c.nomenclature,
          batch: c.batch || null,
          reserve: c.reserve || null,
          warehouse: c.warehouse || null,
          quantity: c.quantity,
          price: c.price,
          discount_percent: c.discount_percent,
        })),
      }
      const res = await api.post('/cashier/checkout/', payload)
      notify(`Продажа #${res.data.sale_number} — ${fmtPrice(parseFloat(res.data.total))} ₽`)
      setCart([])
      setOrderDiscount(0)
      setOrderNotes('')
      setSelectedCustomer('')
      setSelectedPayment('')
      setCheckoutOpen(false)
      fetchFeed()
    } catch (err) {
      notify(extractError(err, 'Ошибка оформления продажи'), 'error')
    }
    setCheckoutSaving(false)
  }

  if (shiftChecked && !shiftOpen) {
    return (
      <Box sx={{
        height: 'calc(100vh - 80px)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: 2,
      }}>
        <PointOfSale sx={{ fontSize: 64, color: 'text.disabled' }} />
        <Typography variant="h5" color="text.secondary" fontWeight={600}>
          Касса недоступна
        </Typography>
        <Typography color="text.secondary">
          Для работы с кассой необходимо открыть смену
        </Typography>
      </Box>
    )
  }

  return (
    <Box sx={{ height: 'calc(100vh - 80px)', display: 'flex', gap: 2, p: 0 }}>
      {/* ════════════ LEFT: Catalog ════════════ */}
      <Box sx={{ flex: 2, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Search bar */}
        <Box sx={{ mb: 1.5 }}>
          <TextField
            placeholder="Поиск по названию, артикулу, телефону..."
            size="small" fullWidth
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            InputProps={{
              startAdornment: <InputAdornment position="start"><Search /></InputAdornment>,
              endAdornment: searchInput ? (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => {
                    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
                    setSearchInput('')
                    setSearchQ('')
                  }}><Close fontSize="small" /></IconButton>
                </InputAdornment>
              ) : null,
            }}
          />
        </Box>

        {/* Category tabs */}
        <Tabs
          value={activeCat}
          onChange={(_, v) => setActiveCat(v)}
          variant="scrollable" scrollButtons="auto"
          sx={{ mb: 1.5, minHeight: 40, '& .MuiTab-root': { minHeight: 40, py: 0.5, textTransform: 'none' } }}
        >
          <Tab key="all" value="" label="Все" icon={<Search fontSize="small" />} iconPosition="start" />
          {categories.map(cat => (
            <Tab key={cat.id} value={cat.id}
              label={cat.name}
              icon={SOURCE_ICONS[cat.source_type] as React.ReactElement || undefined}
              iconPosition="start"
            />
          ))}
        </Tabs>

        {/* Feed grid */}
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          {feedLoading ? (
            <Box display="flex" justifyContent="center" py={6}><CircularProgress /></Box>
          ) : feed.length === 0 ? (
            <Box display="flex" justifyContent="center" py={6}>
              <Typography color="text.secondary">Ничего не найдено</Typography>
            </Box>
          ) : (
            <Grid container spacing={1.5}>
              {feed.map(item => (
                <Grid key={`${item.source_type}_${item.item_id}`} size={{ xs: 6, sm: 4, md: 3, lg: 2.4 }}>
                  <Card
                    sx={{
                      cursor: 'pointer', height: '100%', display: 'flex', flexDirection: 'column',
                      transition: 'box-shadow 0.15s',
                      '&:hover': { boxShadow: 4 },
                    }}
                    onClick={() => addToCart(item)}
                  >
                    {item.image ? (
                      <Box sx={{ height: 120, backgroundImage: `url(${item.image})`, backgroundSize: 'cover', backgroundPosition: 'center', borderRadius: '8px 8px 0 0' }} />
                    ) : (
                      <Box sx={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'action.hover', borderRadius: '8px 8px 0 0' }}>
                        {SOURCE_ICONS[item.source_type] || <LocalFlorist sx={{ fontSize: 40, color: 'text.disabled' }} />}
                      </Box>
                    )}
                    <CardContent sx={{ flex: 1, py: 1, px: 1.5, '&:last-child': { pb: 1 } }}>
                      <Tooltip title={item.title} enterDelay={600}>
                        <Typography variant="body2" fontWeight={600} sx={{
                          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                          overflow: 'hidden', lineHeight: 1.3, minHeight: '2.6em',
                        }}>{item.title}</Typography>
                      </Tooltip>
                      {item.subtitle && <Typography variant="caption" color="text.secondary" noWrap>{item.subtitle}</Typography>}
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 0.5 }}>
                        <Typography variant="body2" fontWeight={700} color="primary">
                          {fmtPrice(parseFloat(item.price))} ₽
                        </Typography>
                        {item.badge && (
                          <Chip label={item.badge} size="small" color={SOURCE_COLORS[item.source_type] || 'default'} sx={{ height: 20, fontSize: 11 }} />
                        )}
                      </Box>
                      {item.source_type !== 'reserve' && item.payload?.accounting_type !== 'service' && parseFloat(item.available_qty) > 0 && (
                        <Typography variant="caption" color="text.secondary">
                          В наличии: {parseFloat(item.available_qty)}
                        </Typography>
                      )}
                      {item.source_type === 'reserve' && (
                        <Box sx={{ mt: 0.5 }}>
                          <Typography variant="caption" color="text.secondary">
                            {item.customer_name} {item.phone && `· ${item.phone}`}
                          </Typography>
                          {item.expires_at && (
                            <Typography variant="caption" display="block" color="warning.main">
                              до {new Date(item.expires_at).toLocaleDateString('ru-RU')}
                            </Typography>
                          )}
                        </Box>
                      )}
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          )}
        </Box>
      </Box>

      {/* ════════════ RIGHT: Cart ════════════ */}
      <Paper sx={{ flex: 1, minWidth: 340, maxWidth: 420, display: 'flex', flexDirection: 'column', p: 0 }} elevation={2}>
        {/* Header */}
        <Box sx={{ px: 2, py: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: 1, borderColor: 'divider' }}>
          <Box display="flex" alignItems="center" gap={1}>
            <ShoppingCart color="primary" />
            <Typography variant="h6" fontWeight={600}>Корзина</Typography>
            {cart.length > 0 && <Chip label={cart.length} size="small" color="primary" />}
          </Box>
          {cart.length > 0 && (
            <Button size="small" color="error" onClick={() => setCart([])}>Очистить</Button>
          )}
        </Box>

        {/* Cart items */}
        <Box sx={{ flex: 1, overflow: 'auto', px: 1.5 }}>
          {cart.length === 0 ? (
            <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" height="100%" py={4}>
              <ShoppingCart sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
              <Typography color="text.secondary">Корзина пуста</Typography>
              <Typography variant="caption" color="text.secondary">Нажмите на товар для добавления</Typography>
            </Box>
          ) : (
            cart.map(line => (
              <Box key={line.key} sx={{ py: 1.5, borderBottom: 1, borderColor: 'divider' }}>
                {line.batch && snapshotLoading[line.batch] && (
                  <Box display="flex" justifyContent="center" pb={1}><CircularProgress size={16} /></Box>
                )}
                <Box display="flex" gap={1} alignItems="flex-start">
                  {line.image ? (
                    <Avatar src={line.image} variant="rounded" sx={{ width: 44, height: 44 }} />
                  ) : (
                    <Avatar variant="rounded" sx={{ width: 44, height: 44, bgcolor: 'action.hover' }}>
                      <LocalFlorist fontSize="small" />
                    </Avatar>
                  )}
                  <Box flex={1} minWidth={0}>
                    <Typography variant="body2" fontWeight={600} noWrap>{line.title}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {fmtPrice(line.price)} ₽ / шт.
                    </Typography>
                    {line.batch && (snapshotMap[line.batch] || []).length > 0 && (
                      <Box sx={{ mt: 0.5 }}>
                        {(snapshotMap[line.batch] || []).map(snapshot => (
                          <Typography key={snapshot.id} variant="caption" display="block" color="text.secondary">
                            {snapshot.nomenclature_name} x {fmtPrice(parseFloat(snapshot.quantity_per_unit) * line.quantity)}
                          </Typography>
                        ))}
                      </Box>
                    )}
                  </Box>
                  <IconButton size="small" onClick={() => removeFromCart(line.key)}>
                    <Delete fontSize="small" />
                  </IconButton>
                </Box>
                <Box display="flex" alignItems="center" gap={1} mt={0.5}>
                  <IconButton size="small" onClick={() => updateCartQty(line.key, -1)} disabled={line.quantity <= 1}>
                    <Remove fontSize="small" />
                  </IconButton>
                  <TextField
                    size="small" type="number"
                    sx={{ width: 60, '& input': { textAlign: 'center', py: 0.5, px: 0.5 } }}
                    value={line.quantity}
                    onChange={e => setCartQty(line.key, parseInt(e.target.value, 10))}
                    inputProps={{ min: 1 }}
                  />
                  <IconButton size="small" onClick={() => updateCartQty(line.key, 1)}>
                    <Add fontSize="small" />
                  </IconButton>
                  <TextField
                    size="small" label="Цена" type="number"
                    sx={{ width: 110, ml: 'auto' }}
                    value={line.price || ''}
                    onChange={e => updateCartPrice(line.key, parseFloat(e.target.value) || 0)}
                  />
                  <TextField
                    size="small" label="Скидка %" type="number"
                    sx={{ width: 80 }}
                    value={line.discount_percent || ''}
                    inputProps={{ min: 0, max: 100 }}
                    onChange={e => updateCartDiscount(line.key, parseFloat(e.target.value) || 0)}
                  />
                  <Typography fontWeight={600} sx={{ minWidth: 70, textAlign: 'right' }}>
                    {fmtPrice(line.price * line.quantity * (1 - line.discount_percent / 100))} ₽
                  </Typography>
                </Box>
              </Box>
            ))
          )}
        </Box>

        {/* Totals & checkout */}
        {cart.length > 0 && (
          <Box sx={{ borderTop: 1, borderColor: 'divider', px: 2, py: 1.5 }}>
            <Box display="flex" justifyContent="space-between" mb={0.5}>
              <Typography variant="body2" color="text.secondary">Подитог:</Typography>
              <Typography variant="body2">{fmtPrice(cartSubtotal)} ₽</Typography>
            </Box>
            <Box display="flex" alignItems="center" gap={1} mb={1}>
              <Percent sx={{ fontSize: 18, color: 'text.secondary' }} />
              <TextField
                size="small" label="Скидка на чек %" type="number"
                sx={{ width: 130 }}
                value={orderDiscount || ''}
                inputProps={{ min: 0, max: 100 }}
                onChange={e => setOrderDiscount(parseFloat(e.target.value) || 0)}
              />
              <Box flex={1} />
              <Typography variant="h6" fontWeight={700} color="primary">
                {fmtPrice(cartTotal)} ₽
              </Typography>
            </Box>
            <Button
              variant="contained" fullWidth size="large"
              startIcon={<PointOfSale />}
              onClick={() => {
                setCheckoutOpen(true)
                void fetchCheckoutRefs()
              }}
              sx={{ fontWeight: 600, py: 1.2 }}
            >
              Оформить продажу
            </Button>
          </Box>
        )}
      </Paper>

      {/* ════════════ Checkout Dialog ════════════ */}
      <Dialog open={checkoutOpen} onClose={() => setCheckoutOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Оформление продажи</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
          {checkoutRefsLoading && (
            <Box display="flex" alignItems="center" gap={1} color="text.secondary">
              <CircularProgress size={16} />
              <Typography variant="caption">Загрузка клиентов и способов оплаты...</Typography>
            </Box>
          )}
          <TextField label="Клиент" select fullWidth value={selectedCustomer}
            onChange={e => setSelectedCustomer(e.target.value)}
            disabled={checkoutRefsLoading}>
            <MenuItem value="">— без клиента —</MenuItem>
            {customers.map(c => <MenuItem key={c.id} value={c.id}>{c.name} {c.phone && `(${c.phone})`}</MenuItem>)}
          </TextField>
          <TextField label="Способ оплаты" select fullWidth value={selectedPayment}
            onChange={e => setSelectedPayment(e.target.value)}
            disabled={checkoutRefsLoading}>
            <MenuItem value="">— не указан —</MenuItem>
            {paymentMethods.map(pm => <MenuItem key={pm.id} value={pm.id}>{pm.name}</MenuItem>)}
          </TextField>
          <TextField
            label="Заметки к продаже" fullWidth multiline rows={2}
            value={orderNotes} onChange={e => setOrderNotes(e.target.value)}
          />
          <Divider />
          <Box>
            {cart.map(c => (
              <Box key={c.key} display="flex" justifyContent="space-between" py={0.5}>
                <Typography variant="body2">{c.title} x{c.quantity}</Typography>
                <Typography variant="body2" fontWeight={600}>
                  {fmtPrice(c.price * c.quantity * (1 - c.discount_percent / 100))} ₽
                </Typography>
              </Box>
            ))}
          </Box>
          <Divider />
          <Box display="flex" justifyContent="space-between">
            <Typography variant="h6">Итого:</Typography>
            <Typography variant="h6" fontWeight={700} color="primary">{fmtPrice(cartTotal)} ₽</Typography>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCheckoutOpen(false)}>Отмена</Button>
          <Button variant="contained" onClick={doCheckout} disabled={checkoutSaving}
            startIcon={<Payment />}>
            {checkoutSaving ? 'Оформление...' : 'Подтвердить'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
