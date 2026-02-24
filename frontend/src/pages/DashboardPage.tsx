import { useEffect, useState } from 'react'
import {
  Box, Card, CardContent, Typography, Skeleton,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, useTheme, alpha,
} from '@mui/material'
import Grid from '@mui/material/Grid2'
import TrendingUpIcon from '@mui/icons-material/TrendingUp'
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart'
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth'
import AssignmentIcon from '@mui/icons-material/Assignment'
import AccountBalanceIcon from '@mui/icons-material/AccountBalance'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Area, AreaChart, Legend,
} from 'recharts'
import api from '../api'
import { useNotification } from '../contexts/NotificationContext'

interface DashboardKPI {
  today_revenue: number
  today_sales_count: number
  month_revenue: number
  active_orders: number
  total_customers: number
}

interface DailySummary {
  date: string
  revenue: number
  cost: number
  profit: number
  sales_count: number
  orders_count: number
  avg_check: number
  new_customers: number
  write_offs: number
  trading_point_name: string
}

interface Order {
  id: number
  number: string
  customer_name: string
  total: number
  delivery_date: string
}

interface StockItem {
  id: number
  nomenclature_name: string
  quantity: number
  warehouse_name: string
}

const fmt = (v: number) =>
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(v)

const fmtCur = (v: number) => `${fmt(v)} ₽`

const shortDate = (iso: string) => {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`
}

interface KPICardProps {
  icon: React.ReactNode
  label: string
  value: string
  color: string
  loading: boolean
}

function KPICard({ icon, label, value, color, loading }: KPICardProps) {
  return (
    <Card
      sx={{
        height: '100%',
        borderLeft: `4px solid ${color}`,
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        transition: 'box-shadow .2s',
        '&:hover': { boxShadow: '0 4px 16px rgba(0,0,0,0.13)' },
      }}
    >
      <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2, py: 2.5 }}>
        <Box
          sx={{
            bgcolor: alpha(color, 0.12),
            color,
            borderRadius: 2,
            p: 1.2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {icon}
        </Box>
        <Box sx={{ minWidth: 0 }}>
          {loading ? (
            <>
              <Skeleton width={80} height={32} />
              <Skeleton width={100} height={18} />
            </>
          ) : (
            <>
              <Typography variant="h5" fontWeight={700} noWrap>
                {value}
              </Typography>
              <Typography variant="body2" color="text.secondary" noWrap>
                {label}
              </Typography>
            </>
          )}
        </Box>
      </CardContent>
    </Card>
  )
}

export default function DashboardPage() {
  const theme = useTheme()
  const { notify } = useNotification()

  const [loading, setLoading] = useState(true)
  const [kpi, setKpi] = useState<DashboardKPI | null>(null)
  const [walletBalance, setWalletBalance] = useState<number>(0)
  const [daily, setDaily] = useState<DailySummary[]>([])
  const [newOrders, setNewOrders] = useState<Order[]>([])
  const [lowStock, setLowStock] = useState<StockItem[]>([])

  useEffect(() => {
    const load = async () => {
      try {
        const [kpiRes, dailyRes, ordersRes, stockRes, walletsRes] = await Promise.all([
          api.get('/analytics/daily-summary/dashboard/'),
          api.get('/analytics/daily-summary/?ordering=-date'),
          api.get('/sales/orders/?status=new'),
          api.get('/inventory/stock/'),
          api.get('/finance/wallets/summary/'),
        ])

        setKpi(kpiRes.data)
        setWalletBalance(walletsRes.data?.total_balance ?? 0)

        const dailyList: DailySummary[] = dailyRes.data.results || dailyRes.data
        setDaily(dailyList.slice(0, 7).reverse())

        const ordersList: Order[] = ordersRes.data.results || ordersRes.data
        setNewOrders(ordersList.slice(0, 5))

        const stockList: StockItem[] = stockRes.data.results || stockRes.data
        const sorted = [...stockList].sort((a, b) => a.quantity - b.quantity)
        setLowStock(sorted.slice(0, 5))
      } catch {
        notify('Ошибка загрузки данных дашборда', 'error')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [notify])

  const kpiCards = [
    { label: 'Выручка сегодня', value: fmtCur(kpi?.today_revenue ?? 0), color: '#2e7d32', icon: <TrendingUpIcon /> },
    { label: 'Продажи сегодня', value: fmt(kpi?.today_sales_count ?? 0), color: '#1565c0', icon: <ShoppingCartIcon /> },
    { label: 'Выручка за месяц', value: fmtCur(kpi?.month_revenue ?? 0), color: '#6a1b9a', icon: <CalendarMonthIcon /> },
    { label: 'Активные заказы', value: fmt(kpi?.active_orders ?? 0), color: '#e65100', icon: <AssignmentIcon /> },
    { label: 'Баланс кошельков', value: fmtCur(walletBalance), color: '#00838f', icon: <AccountBalanceIcon /> },
  ]

  const chartColors = {
    revenue: theme.palette.primary.main,
    sales: '#42a5f5',
    orders: '#ef5350',
  }

  return (
    <Box>
      <Typography variant="h4" fontWeight={700} mb={3}>
        Дашборд
      </Typography>

      {/* KPI Cards */}
      <Grid container spacing={2.5} mb={3}>
        {kpiCards.map((c) => (
          <Grid key={c.label} size={{ xs: 12, sm: 6, md: 2.4 }}>
            <KPICard {...c} loading={loading} />
          </Grid>
        ))}
      </Grid>

      {/* Charts Row */}
      <Grid container spacing={2.5} mb={3}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card sx={{ boxShadow: '0 2px 8px rgba(0,0,0,0.08)', p: 2 }}>
            <Typography variant="h6" fontWeight={600} mb={2}>
              Выручка за неделю
            </Typography>
            {loading ? (
              <Skeleton variant="rectangular" height={260} sx={{ borderRadius: 1 }} />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={daily}>
                  <defs>
                    <linearGradient id="gradRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={chartColors.revenue} stopOpacity={0.3} />
                      <stop offset="100%" stopColor={chartColors.revenue} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={alpha('#000', 0.07)} />
                  <XAxis dataKey="date" tickFormatter={shortDate} fontSize={12} />
                  <YAxis tickFormatter={(v: number) => fmt(v)} fontSize={12} width={70} />
                  <Tooltip
                    formatter={(v: number) => [fmtCur(v), 'Выручка']}
                    labelFormatter={shortDate}
                  />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke={chartColors.revenue}
                    strokeWidth={2.5}
                    fill="url(#gradRevenue)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <Card sx={{ boxShadow: '0 2px 8px rgba(0,0,0,0.08)', p: 2 }}>
            <Typography variant="h6" fontWeight={600} mb={2}>
              Продажи и заказы
            </Typography>
            {loading ? (
              <Skeleton variant="rectangular" height={260} sx={{ borderRadius: 1 }} />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={daily}>
                  <CartesianGrid strokeDasharray="3 3" stroke={alpha('#000', 0.07)} />
                  <XAxis dataKey="date" tickFormatter={shortDate} fontSize={12} />
                  <YAxis fontSize={12} />
                  <Tooltip labelFormatter={shortDate} />
                  <Legend />
                  <Bar dataKey="sales_count" name="Продажи" fill={chartColors.sales} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="orders_count" name="Заказы" fill={chartColors.orders} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>
        </Grid>
      </Grid>

      {/* Tables Row */}
      <Grid container spacing={2.5}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card sx={{ boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
            <CardContent>
              <Typography variant="h6" fontWeight={600} mb={2}>
                Новые заказы
              </Typography>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} height={36} sx={{ mb: 0.5 }} />
                ))
              ) : newOrders.length === 0 ? (
                <Typography color="text.secondary" py={3} textAlign="center">
                  Нет новых заказов
                </Typography>
              ) : (
                <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 1 }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 600 }}>Номер</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Клиент</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600 }}>Сумма</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Доставка</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {newOrders.map((o) => (
                        <TableRow key={o.id} hover>
                          <TableCell>{o.number}</TableCell>
                          <TableCell>{o.customer_name}</TableCell>
                          <TableCell align="right">{fmtCur(Number(o.total))}</TableCell>
                          <TableCell>{o.delivery_date ? shortDate(o.delivery_date) : '—'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <Card sx={{ boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
            <CardContent>
              <Typography variant="h6" fontWeight={600} mb={2}>
                Низкие остатки
              </Typography>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} height={36} sx={{ mb: 0.5 }} />
                ))
              ) : lowStock.length === 0 ? (
                <Typography color="text.secondary" py={3} textAlign="center">
                  Нет данных по остаткам
                </Typography>
              ) : (
                <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 1 }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 600 }}>Номенклатура</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Склад</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600 }}>Остаток</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {lowStock.map((s) => (
                        <TableRow key={s.id} hover>
                          <TableCell>{s.nomenclature_name}</TableCell>
                          <TableCell>{s.warehouse_name}</TableCell>
                          <TableCell
                            align="right"
                            sx={{ color: s.quantity <= 5 ? 'error.main' : 'text.primary', fontWeight: 600 }}
                          >
                            {s.quantity}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  )
}
