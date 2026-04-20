import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import LoginPage from './pages/LoginPage'
import DealDashboardPage from './pages/DealDashboardPage'
import DashboardPage from './pages/DashboardPage'
import SpreadDetailPage from './pages/SpreadDetailPage'
import BorrowerListPage from './pages/BorrowerListPage'
import BorrowerOverviewPage from './pages/BorrowerOverviewPage'
import BorrowerNewPage from './pages/BorrowerNewPage'
import ProtectedRoute from './components/ProtectedRoute'
import RoleRoute from './components/RoleRoute'
import MainLayout from './components/MainLayout'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<MainLayout />}>
            <Route path="/" element={<DealDashboardPage />} />
            <Route path="/borrowers" element={<BorrowerListPage />} />
            <Route path="/borrowers/new" element={<BorrowerNewPage />} />
            <Route path="/borrowers/:id" element={<BorrowerOverviewPage />} />
            <Route path="/spreads/:id" element={<SpreadDetailPage />} />
            <Route
              element={
                <RoleRoute
                  allowedRoles={['sr_credit_analyst', 'admin']}
                  redirectTo="/"
                />
              }
            >
              <Route path="/dashboard" element={<DashboardPage />} />
            </Route>
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
