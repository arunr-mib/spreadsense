import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '../store/auth'

interface Props {
  allowedRoles: string[]
  redirectTo: string
}

export default function RoleRoute({ allowedRoles, redirectTo }: Props) {
  const user = useAuthStore((s) => s.user)
  if (!user || !allowedRoles.includes(user.role)) {
    return <Navigate to={redirectTo} replace />
  }
  return <Outlet />
}
