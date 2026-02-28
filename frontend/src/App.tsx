import { Routes, Route, Navigate } from 'react-router-dom'
import { lazy, Suspense, Component, ReactNode, ErrorInfo } from 'react'
import { useAuth } from './contexts/AuthContext'
import { Box, CircularProgress, Typography, Button, Paper } from '@mui/material'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'

// Code Splitting: lazy load pages to reduce initial bundle size
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const NomenclaturePage = lazy(() => import('./pages/NomenclaturePage'))
const InventoryPage = lazy(() => import('./pages/InventoryPage'))
const SalesPage = lazy(() => import('./pages/SalesPage'))
const OrdersPage = lazy(() => import('./pages/OrdersPage'))
const CustomersPage = lazy(() => import('./pages/CustomersPage'))
const SuppliersPage = lazy(() => import('./pages/SuppliersPage'))
const StaffPage = lazy(() => import('./pages/StaffPage'))
const FinancePage = lazy(() => import('./pages/FinancePage'))
const MarketingPage = lazy(() => import('./pages/MarketingPage'))
const DeliveryPage = lazy(() => import('./pages/DeliveryPage'))
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const AdminPage = lazy(() => import('./pages/AdminPage'))
const ProfilePage = lazy(() => import('./pages/ProfilePage'))

// Error Boundary to catch runtime errors
interface ErrorBoundaryState { hasError: boolean; error: Error | null }
class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null }
  
  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }
  
  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo)
  }
  
  render() {
    if (this.state.hasError) {
      return (
        <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh" p={3}>
          <Paper sx={{ p: 4, maxWidth: 500, textAlign: 'center' }}>
            <Typography variant="h5" color="error" gutterBottom>Произошла ошибка</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {this.state.error?.message || 'Неизвестная ошибка'}
            </Typography>
            <Button variant="contained" onClick={() => window.location.reload()}>Перезагрузить</Button>
          </Paper>
        </Box>
      )
    }
    return this.props.children
  }
}

// Loading fallback for lazy components
const PageLoader = () => (
  <Box display="flex" justifyContent="center" alignItems="center" minHeight="50vh">
    <CircularProgress color="primary" />
  </Box>
)

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth()
  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
        <CircularProgress color="primary" />
      </Box>
    )
  }
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" />
}

export default function App() {
  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
          <Route index element={<Suspense fallback={<PageLoader />}><DashboardPage /></Suspense>} />
          <Route path="nomenclature" element={<Suspense fallback={<PageLoader />}><NomenclaturePage /></Suspense>} />
          <Route path="inventory" element={<Suspense fallback={<PageLoader />}><InventoryPage /></Suspense>} />
          <Route path="sales" element={<Suspense fallback={<PageLoader />}><SalesPage /></Suspense>} />
          <Route path="orders" element={<Suspense fallback={<PageLoader />}><OrdersPage /></Suspense>} />
          <Route path="customers" element={<Suspense fallback={<PageLoader />}><CustomersPage /></Suspense>} />
          <Route path="suppliers" element={<Suspense fallback={<PageLoader />}><SuppliersPage /></Suspense>} />
          <Route path="staff" element={<Suspense fallback={<PageLoader />}><StaffPage /></Suspense>} />
          <Route path="finance" element={<Suspense fallback={<PageLoader />}><FinancePage /></Suspense>} />
          <Route path="marketing" element={<Suspense fallback={<PageLoader />}><MarketingPage /></Suspense>} />
          <Route path="delivery" element={<Suspense fallback={<PageLoader />}><DeliveryPage /></Suspense>} />
          <Route path="analytics" element={<Suspense fallback={<PageLoader />}><AnalyticsPage /></Suspense>} />
          <Route path="settings" element={<Suspense fallback={<PageLoader />}><SettingsPage /></Suspense>} />
          <Route path="admin" element={<Suspense fallback={<PageLoader />}><AdminPage /></Suspense>} />
          <Route path="profile" element={<Suspense fallback={<PageLoader />}><ProfilePage /></Suspense>} />
        </Route>
      </Routes>
    </ErrorBoundary>
  )
}
