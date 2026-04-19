import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import LoginPage from './pages/LoginPage'
import DealDashboardPage from './pages/DealDashboardPage'
import DashboardPage from './pages/DashboardPage'
import SpreadDetailPage from './pages/SpreadDetailPage'
import ProtectedRoute from './components/ProtectedRoute'
import RoleRoute from './components/RoleRoute'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<DealDashboardPage />} />
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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
