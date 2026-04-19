import { useLocation, useNavigate, Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useAuthStore } from '../store/auth'

const STORAGE_KEY = 'sidebar_collapsed'

interface NavItem {
  icon: string
  label: string
  path: string
  adminOnly?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { icon: '📋', label: 'Deals', path: '/' },
  { icon: '🏢', label: 'Borrowers', path: '/borrowers' },
  { icon: '📊', label: 'Portfolio', path: '/dashboard', adminOnly: true },
]

export default function Sidebar() {
  const location = useLocation()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true'
    } catch {
      return false
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(collapsed))
    } catch {
      // ignore
    }
  }, [collapsed])

  const handleSignOut = () => {
    logout()
    navigate('/login')
  }

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/'
    return location.pathname.startsWith(path)
  }

  const isSrOrAdmin = user?.role === 'sr_credit_analyst' || user?.role === 'admin'
  const visibleItems = NAV_ITEMS.filter((item) => !item.adminOnly || isSrOrAdmin)

  const initials = user?.full_name
    ? user.full_name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase()
    : '?'

  return (
    <aside
      style={{
        width: collapsed ? 52 : 240,
        minWidth: collapsed ? 52 : 240,
        transition: 'width 0.2s ease, min-width 0.2s ease',
        background: 'var(--bg-strip)',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        height: '100vh',
        position: 'sticky',
        top: 0,
        overflowX: 'hidden',
      }}
    >
      {/* Top: logo + collapse toggle */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          padding: collapsed ? '14px 0' : '14px 12px 14px 16px',
          borderBottom: '1px solid #3a2e20',
          flexShrink: 0,
        }}
      >
        {!collapsed && (
          <span style={{ fontSize: 13, fontWeight: 700, color: '#c8b89a', letterSpacing: '0.04em' }}>
            SpreadSense
          </span>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          style={{
            background: 'none',
            border: 'none',
            color: '#8a7a5a',
            fontSize: 16,
            cursor: 'pointer',
            padding: '2px 4px',
            lineHeight: 1,
          }}
        >
          {collapsed ? '›' : '‹'}
        </button>
      </div>

      {/* Nav items */}
      <nav style={{ flex: 1, padding: '8px 6px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {visibleItems.map((item) => {
          const active = isActive(item.path)
          return (
            <Link
              key={item.path}
              to={item.path}
              title={collapsed ? item.label : undefined}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: collapsed ? 0 : 10,
                justifyContent: collapsed ? 'center' : 'flex-start',
                padding: collapsed ? '9px 0' : '8px 10px',
                borderRadius: 6,
                textDecoration: 'none',
                background: active ? '#3a2e20' : 'transparent',
                color: active ? '#f5f0e8' : '#c8b89a',
                fontSize: 13,
                fontWeight: active ? 600 : 400,
                transition: 'background 0.15s',
              }}
            >
              <span style={{ fontSize: 15, flexShrink: 0 }}>{item.icon}</span>
              {!collapsed && <span>{item.label}</span>}
            </Link>
          )
        })}
      </nav>

      {/* Bottom: user + sign out */}
      <div
        style={{
          borderTop: '1px solid #3a2e20',
          padding: collapsed ? '10px 0' : '10px 12px',
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          alignItems: collapsed ? 'center' : 'flex-start',
        }}
      >
        {collapsed ? (
          <div
            title={user?.full_name ?? ''}
            style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              background: '#3a2e20',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 10,
              color: '#92805a',
              fontWeight: 600,
              cursor: 'default',
            }}
          >
            {initials}
          </div>
        ) : (
          <>
            <div>
              <div style={{ fontSize: 12, color: '#c8b89a', fontWeight: 500 }}>{user?.full_name}</div>
              <div style={{ fontSize: 10, color: '#8a7a5a', textTransform: 'capitalize' }}>
                {user?.role?.replace(/_/g, ' ')}
              </div>
            </div>
            <button
              onClick={handleSignOut}
              style={{
                background: 'none',
                border: 'none',
                color: '#8a7a5a',
                fontSize: 11,
                cursor: 'pointer',
                padding: 0,
                textAlign: 'left',
              }}
            >
              Sign out
            </button>
          </>
        )}
      </div>
    </aside>
  )
}
