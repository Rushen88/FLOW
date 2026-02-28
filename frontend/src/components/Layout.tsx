import CashShiftDialog from './CashShiftDialog';
import { useState, useEffect, useRef } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import {
  Box, Drawer, List, ListItemButton, ListItemIcon, ListItemText,
  AppBar, Toolbar, Typography, IconButton, Avatar, Menu, MenuItem,
  Divider, useTheme, Alert, Button, Select, FormControl, InputLabel,
  SelectChangeEvent, Chip,
} from '@mui/material'
import {
  Dashboard, Inventory, ShoppingCart, Assignment, People,
  LocalShipping, AttachMoney, Campaign, BarChart, Settings,
  Logout, Menu as MenuIcon, LocalFlorist, Store,
  Group, ChevronLeft, AdminPanelSettings, Person,
  SwapHoriz,
} from '@mui/icons-material'
import { useAuth } from '../contexts/AuthContext'
import { useNotification } from '../contexts/NotificationContext'
import api from '../api'

const DRAWER_WIDTH = 260
const DRAWER_COLLAPSED = 72

interface NavItem {
  label: string
  path: string
  icon: React.ReactNode
  superuserOnly?: boolean
  /** Минимальные роли, которым доступен раздел. Если не указано — доступен всем. */
  allowedRoles?: string[]
}

const navItems: NavItem[] = [
  { label: 'Дашборд', path: '/', icon: <Dashboard /> },
  { label: 'Номенклатура', path: '/nomenclature', icon: <LocalFlorist /> },
  { label: 'Склад', path: '/inventory', icon: <Inventory />, allowedRoles: ['owner', 'admin', 'manager', 'florist'] },
  { label: 'Продажи', path: '/sales', icon: <ShoppingCart /> },
  { label: 'Заказы', path: '/orders', icon: <Assignment /> },
  { label: 'Клиенты', path: '/customers', icon: <People />, allowedRoles: ['owner', 'admin', 'manager', 'seller'] },
  { label: 'Поставщики', path: '/suppliers', icon: <Store />, allowedRoles: ['owner', 'admin', 'manager'] },
  { label: 'Персонал', path: '/staff', icon: <Group />, allowedRoles: ['owner', 'admin'] },
  { label: 'Финансы', path: '/finance', icon: <AttachMoney />, allowedRoles: ['owner', 'admin'] },
  { label: 'Маркетинг', path: '/marketing', icon: <Campaign />, allowedRoles: ['owner', 'admin', 'manager'] },
  { label: 'Доставка', path: '/delivery', icon: <LocalShipping />, allowedRoles: ['owner', 'admin', 'manager', 'courier'] },
  { label: 'Аналитика', path: '/analytics', icon: <BarChart />, allowedRoles: ['owner', 'admin', 'manager'] },
  { label: 'Настройки', path: '/settings', icon: <Settings />, allowedRoles: ['owner', 'admin'] },
  { label: 'Администрирование', path: '/admin', icon: <AdminPanelSettings />, superuserOnly: true },
]

interface OrgOption {
  id: string
  name: string
}

export default function Layout() {
  const theme = useTheme()
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout, switchOrganization, switchTradingPoint } = useAuth()
  const { notify } = useNotification()
  const [drawerOpen, setDrawerOpen] = useState(true)
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const [allOrgs, setAllOrgs] = useState<OrgOption[]>([])
  const [allTradingPoints, setAllTradingPoints] = useState<{ id: string; name: string }[]>([])
  const lastNegativeReminderRef = useRef<number>(0)
  
  // Cash shift state
  const [cashShiftDialogOpen, setCashShiftDialogOpen] = useState(false);
  const [activeShift, setActiveShift] = useState<any | null>(null);

  const currentWidth = drawerOpen ? DRAWER_WIDTH : DRAWER_COLLAPSED

  // Загружаем список организаций для суперадмина
  useEffect(() => {
    if (user?.is_superuser) {
      api.get('/core/organizations/').then(res => {
        const list = res.data.results || res.data || []
        setAllOrgs(list.map((o: any) => ({ id: o.id, name: o.name })))
      }).catch(() => {})
    }
  }, [user?.is_superuser])

  // Загружаем список торговых точек для суперадмина и владельца
  const showTpSelector = user?.is_superuser || user?.role === 'owner' || user?.role === 'admin'
  useEffect(() => {
    if (showTpSelector) {
      api.get('/core/trading-points/').then(res => {
        const list = res.data.results || res.data || []
        setAllTradingPoints(list.map((tp: any) => ({ id: tp.id, name: tp.name })))
      }).catch(() => {})
    }
  }, [showTpSelector, user?.active_organization])

  useEffect(() => {
    if (!user) return

    const effectiveTp = user.active_trading_point || user.trading_point
    if (!effectiveTp) return

    let isMounted = true

    const checkNegativeStocks = async () => {
      try {
        const res = await api.get('/inventory/stock/negative-alerts/', {
          params: { trading_point: effectiveTp },
        })
        const count = Number(res.data?.count || 0)
        if (!isMounted || count <= 0) return

        const now = Date.now()
        if (now - lastNegativeReminderRef.current < 5 * 60 * 1000) return

        lastNegativeReminderRef.current = now
        notify(
          `На складах торговой точки есть отрицательные остатки (${count} поз.). Проверьте инвентаризацию и корректировки.`,
          'warning'
        )
      } catch {
        // intentionally silent
      }
    }

    checkNegativeStocks()
    const timer = setInterval(checkNegativeStocks, 5 * 60 * 1000)
    return () => {
      isMounted = false
      clearInterval(timer)
    }
  }, [user?.id, user?.active_trading_point, user?.trading_point, notify])

  const handleOrgSwitch = async (e: SelectChangeEvent<string>) => {
    const val = e.target.value
    try {
      await switchOrganization(val === '__all__' ? null : val)
    } catch {
      // error handled in switchOrganization
    }
  }

  const handleTpSwitch = async (e: SelectChangeEvent<string>) => {
    const val = e.target.value
    try {
      await switchTradingPoint(val === '__all__' ? null : val)
    } catch {
      // error handled in switchTradingPoint
    }
  }

  // Определяем «рабочую» организацию: для суперадмина — active, для обычного — organization
  const workingOrg = user?.is_superuser ? user.active_organization : user?.organization
  const showOnboarding = !user?.is_superuser && !user?.organization

  const checkActiveShift = async () => {
    if (!user?.active_trading_point) {
      setActiveShift(null);
      return;
    }
    try {
      const res = await api.get('/finance/cash-shifts/', {
        params: { status: 'open', trading_point: user.active_trading_point }
      });
      const shifts = res.data.results || res.data;
      if (shifts.length > 0) setActiveShift(shifts[0]);
      else setActiveShift(null);
    } catch {
      setActiveShift(null);
    }
  };

  useEffect(() => {
    if (user?.active_trading_point) {
      checkActiveShift();
    } else {
      setActiveShift(null);
    }
  }, [user?.active_trading_point]);

  // Фильтруем пункты навигации по роли
  const visibleNav = navItems.filter(item => {
    if (item.superuserOnly && !user?.is_superuser) return false
    if (user?.is_superuser) return true
    if (item.allowedRoles && user?.role && !item.allowedRoles.includes(user.role)) return false
    return true
  })

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      {/* Sidebar */}
      <Drawer
        variant="permanent"
        sx={{
          width: currentWidth,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: currentWidth,
            boxSizing: 'border-box',
            background: 'linear-gradient(180deg, #1a1a2e 0%, #16213e 100%)',
            color: '#fff',
            borderRight: 'none',
            transition: 'width 0.3s ease',
            overflowX: 'hidden',
          },
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            minHeight: 64,
            ...(drawerOpen
              ? { p: 2, gap: 1.5 }
              : { flexDirection: 'column', justifyContent: 'center', py: 1, gap: 0.5 }),
          }}
        >
          <LocalFlorist sx={{ color: theme.palette.primary.main, fontSize: drawerOpen ? 32 : 28 }} />
          {drawerOpen && (
            <Typography variant="h6" sx={{ fontWeight: 700, color: '#fff', whiteSpace: 'nowrap' }}>
              FlowerBoss
            </Typography>
          )}
          {drawerOpen && <Box sx={{ flexGrow: 1 }} />}
          <IconButton
            onClick={() => setDrawerOpen(!drawerOpen)}
            sx={{ color: '#fff', p: drawerOpen ? 1 : 0.5 }}
          >
            {drawerOpen ? <ChevronLeft /> : <MenuIcon />}
          </IconButton>
        </Box>

        <Divider sx={{ borderColor: 'rgba(255,255,255,0.1)' }} />

        <List sx={{ px: 1, py: 1 }}>
          {visibleNav.map((item) => {
            const isActive = location.pathname === item.path
            return (
              <ListItemButton
                key={item.path}
                onClick={() => navigate(item.path)}
                sx={{
                  borderRadius: 2,
                  mb: 0.5,
                  minHeight: 44,
                  px: drawerOpen ? 2 : 2.5,
                  justifyContent: drawerOpen ? 'initial' : 'center',
                  backgroundColor: isActive ? 'rgba(233,30,99,0.15)' : 'transparent',
                  color: isActive ? theme.palette.primary.light : 'rgba(255,255,255,0.7)',
                  '&:hover': {
                    backgroundColor: 'rgba(255,255,255,0.08)',
                    color: '#fff',
                  },
                }}
              >
                <ListItemIcon
                  sx={{
                    color: 'inherit',
                    minWidth: drawerOpen ? 40 : 'auto',
                    mr: drawerOpen ? 1 : 0,
                    justifyContent: 'center',
                  }}
                >
                  {item.icon}
                </ListItemIcon>
                {drawerOpen && (
                  <ListItemText
                    primary={item.label}
                    primaryTypographyProps={{ fontSize: 14, fontWeight: isActive ? 600 : 400 }}
                  />
                )}
              </ListItemButton>
            )
          })}
        </List>
      </Drawer>

      {/* Main content */}
      <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
        <AppBar
          position="sticky"
          elevation={0}
          sx={{
            backgroundColor: '#fff',
            color: '#333',
            borderBottom: '1px solid #e0e0e0',
          }}
        >
          <Toolbar>
            <Typography variant="h6" sx={{ flexGrow: 1, fontWeight: 600 }}>
              {navItems.find(i => i.path === location.pathname)?.label || 'FlowerBoss'}
            </Typography>

            {/* ─── Org Switcher для суперадмина ─── */}
            {user?.is_superuser && allOrgs.length > 0 && (
              <FormControl size="small" sx={{ minWidth: 220, mr: 2 }}>
                <InputLabel id="org-switch-label" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <SwapHoriz fontSize="small" /> Организация
                </InputLabel>
                <Select
                  labelId="org-switch-label"
                  label="Организация"
                  value={user.active_organization || '__all__'}
                  onChange={handleOrgSwitch}
                  sx={{ fontSize: 14 }}
                >
                  <MenuItem value="__all__">
                    <em>Все организации</em>
                  </MenuItem>
                  {allOrgs.map(o => (
                    <MenuItem key={o.id} value={o.id}>{o.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}

            {/* ─── TP Switcher для суперадмина и владельца ─── */}
            {showTpSelector && allTradingPoints.length > 0 && (
              <FormControl size="small" sx={{ minWidth: 200, mr: 2 }}>
                <InputLabel id="tp-switch-label">
                  <Store fontSize="small" sx={{ mr: 0.5, verticalAlign: 'middle' }} /> Точка
                </InputLabel>
                <Select
                  labelId="tp-switch-label"
                  label="Точка"
                  value={user?.active_trading_point || '__all__'}
                  onChange={handleTpSwitch}
                  sx={{ fontSize: 14 }}
                >
                  <MenuItem value="__all__">
                    <em>Все точки</em>
                  </MenuItem>
                  {allTradingPoints.map(tp => (
                    <MenuItem key={tp.id} value={tp.id}>{tp.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}

            {/* Индикатор суперадмина */}
            {user?.is_superuser && (
              <Chip label="SA" size="small" color="error" sx={{ mr: 1, fontWeight: 700 }} />
            )}

            {/* Кассовая смена */}
            {user?.active_trading_point && (
              <Button
                variant={activeShift ? "contained" : "outlined"}
                color={activeShift ? "success" : "warning"}
                size="small"
                onClick={() => setCashShiftDialogOpen(true)}
                sx={{ mr: 2, borderRadius: 2 }}
              >
                {activeShift ? `Смена открыта (${activeShift.wallet_name})` : "Смена закрыта"}
              </Button>
            )}

            <IconButton onClick={(e) => setAnchorEl(e.currentTarget)}>
              <Avatar sx={{ bgcolor: theme.palette.primary.main, width: 36, height: 36 }}>
                {user?.first_name?.[0] || user?.username?.[0] || 'U'}
              </Avatar>
            </IconButton>
            <Menu
              anchorEl={anchorEl}
              open={Boolean(anchorEl)}
              onClose={() => setAnchorEl(null)}
              transformOrigin={{ horizontal: 'right', vertical: 'top' }}
              anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
            >
              <MenuItem disabled>
                <Typography variant="body2">{user?.full_name || user?.username}</Typography>
              </MenuItem>
              <MenuItem disabled>
                <Typography variant="caption" color="textSecondary">
                  {user?.is_superuser ? 'Суперадмин' : user?.role}
                </Typography>
              </MenuItem>
              <Divider />
              <MenuItem onClick={() => { navigate('/profile'); setAnchorEl(null) }}>
                <ListItemIcon><Person fontSize="small" /></ListItemIcon>
                Мой профиль
              </MenuItem>
              <Divider />
              <MenuItem onClick={() => { logout(); setAnchorEl(null); }}>
                <ListItemIcon><Logout fontSize="small" /></ListItemIcon>
                Выйти
              </MenuItem>
            </Menu>
          </Toolbar>
        </AppBar>

        <Box sx={{ flexGrow: 1, p: 3, backgroundColor: '#F5F5F7' }}>
          {showOnboarding && (
            <Alert
              severity="warning"
              sx={{ mb: 3 }}
              action={
                <Button color="inherit" size="small" onClick={() => navigate('/settings')}>
                  Настроить
                </Button>
              }
            >
              Для начала работы создайте организацию в разделе «Настройки».
            </Alert>
          )}
          {user?.is_superuser && !user.active_organization && (
            <Alert severity="info" sx={{ mb: 3 }}>
              Выберите организацию в верхнем меню, чтобы работать от её имени.
              Без выбора вы видите данные всех организаций.
            </Alert>
          )}
          <Outlet />
        </Box>
      </Box>
      <CashShiftDialog
        open={cashShiftDialogOpen}
        onClose={() => setCashShiftDialogOpen(false)}
        activeShift={activeShift}
        onShiftChanged={() => checkActiveShift()}
      />
    </Box>
  )
}
