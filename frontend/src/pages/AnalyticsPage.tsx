import { useState, useEffect, useCallback } from 'react'
import {
  Box, Card, CardContent, Typography, TextField, MenuItem, Skeleton,
} from '@mui/material'
import Grid from '@mui/material/Grid2'
import {
  TrendingUp, ShoppingCart, AttachMoney, Assignment, People,
} from '@mui/icons-material'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import api from '../api'
import { useAuth } from '../contexts/AuthContext'
import { useNotification } from '../contexts/NotificationContext'
import DataTable from '../components/DataTable'

// ─── Types ───
interface DailySummary {
  id: string
  organization: string
  trading_point: string
  date: string
  revenue: string
  cost: string
  profit: string
  sales_count: number
  orders_count: number
  avg_check: string
  new_customers: number
  write_offs: string
  trading_point_name: string
}

interface DashboardData {
  today_revenue: number
  today_sales_count: number
  month_revenue: number
  active_orders: number
  total_customers: number
}

interface TradingPoint {
  id: string
  name: string
}

// ─── Helpers ───
const fmt = (v: number | string) =>
  Number(v).toLocaleString('ru-RU', { maximumFractionDigits: 0 })

const fmtRub = (v: number | string) => `${fmt(v)} ₽`

function last30() {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - 30)
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  }
}

// ─── StatCard ───
interface StatCardProps {
  title: string
  value: string
  icon: React.ReactNode
  color: string
  loading?: boolean
}

function StatCard({ title, value, icon, color, loading }: StatCardProps) {
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Box>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              {title}
            </Typography>
            {loading ? (
              <Skeleton width={100} height={40} />
            ) : (
              <Typography variant="h5" sx={{ fontWeight: 700, color }}>
                {value}
              </Typography>
            )}
          </Box>
          <Box
            sx={{
              p: 1.5, borderRadius: 3,
              backgroundColor: `${color}15`, color,
              display: 'flex',
            }}
          >
            {icon}
          </Box>
        </Box>
      </CardContent>
    </Card>
  )
}

// ─── Colors ───
const C = {
  revenue: '#2196F3',
  profit: '#4CAF50',
  cost: '#FF5722',
  sales: '#9C27B0',
  orders: '#FF9800',
}

// ─── Component ───
export default function AnalyticsPage() {
  const { notify } = useNotification()
  const { user } = useAuth()
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [summaries, setSummaries] = useState<DailySummary[]>([])
  const [tradingPoints, setTradingPoints] = useState<TradingPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [dashLoading, setDashLoading] = useState(true)

  const [tpFilter, setTpFilter] = useState('')
  const [dateRange, setDateRange] = useState(last30)

  // ─── Load helpers ───
  useEffect(() => {
    api.get('/core/trading-points/')
      .then(res => setTradingPoints(res.data.results || res.data))
      .catch(() => {})
  }, [])

  // ─── Dashboard ───
  const loadDashboard = useCallback(() => {
    setDashLoading(true)
    api.get('/analytics/daily-summary/dashboard/')
      .then(res => setDashboard(res.data))
      .catch(() => notify('Ошибка загрузки дашборда', 'error'))
      .finally(() => setDashLoading(false))
  }, [notify, user?.active_trading_point])

  // ─── Daily summaries ───
  const loadSummaries = useCallback(() => {
    setLoading(true)
    const params: Record<string, string> = {}
    if (tpFilter) params.trading_point = tpFilter
    if (dateRange.start) params.date_after = dateRange.start
    if (dateRange.end) params.date_before = dateRange.end
    api.get('/analytics/daily-summary/', { params })
      .then(res => setSummaries(res.data.results || res.data))
      .catch(() => notify('Ошибка загрузки аналитики', 'error'))
      .finally(() => setLoading(false))
  }, [tpFilter, dateRange, notify, user?.active_trading_point])

  useEffect(() => { loadDashboard() }, [loadDashboard])
  useEffect(() => { loadSummaries() }, [loadSummaries])

  // ─── Chart data (sorted by date) ───
  const chartData = [...summaries]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(s => ({
      date: s.date,
      revenue: Number(s.revenue),
      profit: Number(s.profit),
      cost: Number(s.cost),
      sales_count: s.sales_count,
      orders_count: s.orders_count,
      avg_check: Number(s.avg_check),
    }))

  // ─── Table columns ───
  const columns = [
    { key: 'date', label: 'Дата', width: 110 },
    { key: 'trading_point_name', label: 'Торговая точка' },
    { key: 'revenue', label: 'Выручка', align: 'right' as const, render: (v: string) => fmtRub(v) },
    { key: 'cost', label: 'Себестоимость', align: 'right' as const, render: (v: string) => fmtRub(v) },
    { key: 'profit', label: 'Прибыль', align: 'right' as const, render: (v: string) => fmtRub(v) },
    { key: 'sales_count', label: 'Продажи', align: 'right' as const },
    { key: 'orders_count', label: 'Заказы', align: 'right' as const },
    { key: 'avg_check', label: 'Средний чек', align: 'right' as const, render: (v: string) => fmtRub(v) },
    { key: 'new_customers', label: 'Новые клиенты', align: 'right' as const },
    { key: 'write_offs', label: 'Списания', align: 'right' as const, render: (v: string) => fmtRub(v) },
  ]

  return (
    <Box>
      <Typography variant="h4" sx={{ fontWeight: 700, mb: 3 }}>Аналитика</Typography>

      {/* ─── Filters ─── */}
      <Card sx={{ mb: 3 }}>
        <CardContent sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center', py: 2 }}>
          <TextField
            select size="small" label="Торговая точка"
            value={tpFilter} onChange={e => setTpFilter(e.target.value)}
            sx={{ minWidth: 220 }}
          >
            <MenuItem value="">Все точки</MenuItem>
            {tradingPoints.map(tp => (
              <MenuItem key={tp.id} value={tp.id}>{tp.name}</MenuItem>
            ))}
          </TextField>
          <TextField
            size="small" label="С" type="date"
            value={dateRange.start}
            onChange={e => setDateRange(prev => ({ ...prev, start: e.target.value }))}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            size="small" label="По" type="date"
            value={dateRange.end}
            onChange={e => setDateRange(prev => ({ ...prev, end: e.target.value }))}
            slotProps={{ inputLabel: { shrink: true } }}
          />
        </CardContent>
      </Card>

      {/* ─── Summary Cards ─── */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
          <StatCard title="Выручка сегодня" value={fmtRub(dashboard?.today_revenue ?? 0)}
            icon={<AttachMoney />} color={C.revenue} loading={dashLoading} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
          <StatCard title="Продажи сегодня" value={fmt(dashboard?.today_sales_count ?? 0)}
            icon={<ShoppingCart />} color={C.sales} loading={dashLoading} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
          <StatCard title="Выручка за месяц" value={fmtRub(dashboard?.month_revenue ?? 0)}
            icon={<TrendingUp />} color={C.profit} loading={dashLoading} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
          <StatCard title="Активные заказы" value={fmt(dashboard?.active_orders ?? 0)}
            icon={<Assignment />} color={C.orders} loading={dashLoading} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 2.4 }}>
          <StatCard title="Всего клиентов" value={fmt(dashboard?.total_customers ?? 0)}
            icon={<People />} color="#E91E63" loading={dashLoading} />
        </Grid>
      </Grid>

      {/* ─── Charts ─── */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {/* Revenue & Profit */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2 }}>Выручка и прибыль</Typography>
              {loading ? <Skeleton variant="rectangular" height={300} /> : (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(v: number) => fmtRub(v)} />
                    <Legend />
                    <Line type="monotone" dataKey="revenue" name="Выручка"
                      stroke={C.revenue} strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="profit" name="Прибыль"
                      stroke={C.profit} strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Sales & Orders */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2 }}>Продажи и заказы</Typography>
              {loading ? <Skeleton variant="rectangular" height={300} /> : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="sales_count" name="Продажи" fill={C.sales} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="orders_count" name="Заказы" fill={C.orders} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Avg Check */}
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" sx={{ mb: 2 }}>Средний чек</Typography>
              {loading ? <Skeleton variant="rectangular" height={300} /> : (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(v: number) => fmtRub(v)} />
                    <Legend />
                    <Line type="monotone" dataKey="avg_check" name="Средний чек"
                      stroke={C.cost} strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* ─── Daily Summary Table ─── */}
      <Typography variant="h6" sx={{ mb: 2 }}>Ежедневная сводка</Typography>
      <DataTable
        columns={columns}
        rows={summaries}
        loading={loading}
        emptyText="Нет данных за выбранный период"
      />
    </Box>
  )
}
