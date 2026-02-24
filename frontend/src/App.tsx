import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import { Box, CircularProgress } from '@mui/material'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import NomenclaturePage from './pages/NomenclaturePage'
import InventoryPage from './pages/InventoryPage'
import SalesPage from './pages/SalesPage'
import OrdersPage from './pages/OrdersPage'
import CustomersPage from './pages/CustomersPage'
import SuppliersPage from './pages/SuppliersPage'
import StaffPage from './pages/StaffPage'
import FinancePage from './pages/FinancePage'
import MarketingPage from './pages/MarketingPage'
import DeliveryPage from './pages/DeliveryPage'
import AnalyticsPage from './pages/AnalyticsPage'
import SettingsPage from './pages/SettingsPage'
import AdminPage from './pages/AdminPage'
import ProfilePage from './pages/ProfilePage'

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
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
        <Route index element={<DashboardPage />} />
        <Route path="nomenclature" element={<NomenclaturePage />} />
        <Route path="inventory" element={<InventoryPage />} />
        <Route path="sales" element={<SalesPage />} />
        <Route path="orders" element={<OrdersPage />} />
        <Route path="customers" element={<CustomersPage />} />
        <Route path="suppliers" element={<SuppliersPage />} />
        <Route path="staff" element={<StaffPage />} />
        <Route path="finance" element={<FinancePage />} />
        <Route path="marketing" element={<MarketingPage />} />
        <Route path="delivery" element={<DeliveryPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="admin" element={<AdminPage />} />
        <Route path="profile" element={<ProfilePage />} />
      </Route>
    </Routes>
  )
}
