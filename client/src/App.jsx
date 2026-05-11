import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { NavLink, Navigate, Outlet, Route, Routes, useNavigate } from 'react-router-dom'
import { AuthProvider } from './AuthContext'
import { getRoleHome, useAuth } from './auth'
import AdminUsersPage from './pages/AdminUsersPage'
import AnalyticsPage from './pages/AnalyticsPage'
import BrokerDashboardPage from './pages/BrokerDashboardPage'
import DispatcherExceptionsPage from './pages/DispatcherExceptionsPage'
import DispatcherMapPage from './pages/DispatcherMapPage'
import DriverRoadPage from './pages/DriverRoadPage'
import FleetCapacityPage from './pages/FleetCapacityPage'
import FleetDriversPage from './pages/FleetDriversPage'
import LoginPage from './pages/LoginPage'
import ProfilePage from './pages/ProfilePage'
import ProofOfDeliveryPage from './pages/ProofOfDeliveryPage'
import PublicTrackingPage from './pages/PublicTrackingPage'
import ShipmentDetailPage from './pages/ShipmentDetailPage'
import ShipmentNewPage from './pages/ShipmentNewPage'
import ShipmentsPage from './pages/ShipmentsPage'
import ShipperDetailPage from './pages/ShipperDetailPage'
import ShippersPage from './pages/ShippersPage'
import TrucksPage from './pages/TrucksPage'
import WebhooksPage from './pages/WebhooksPage'
import './App.css'

const ThemeContext = createContext(null)
const themeStorageKey = 'transit-grid-theme'

const roleLabels = {
  CUSTOMER: 'Shipper Portal',
  DRIVER: 'Driver Console',
  DISPATCHER: 'Dispatch Console',
  FLEET_MANAGER: 'Carrier Console',
  BROKER: 'Broker Desk',
  ADMIN: 'Admin Console'
}

const roleLinks = {
  CUSTOMER: [
    ['Load Board', '/customer/orders'],
    ['Create Load', '/customer/orders/new'],
  ],
  DRIVER: [
    ['Assigned Route', '/driver/road'],
    ['Proof of Delivery', '/driver/proof-of-delivery'],
  ],
  DISPATCHER: [
    ['Load Board', '/dispatcher/loads'],
    ['Exceptions', '/dispatcher/exceptions'],
    ['Fleet Map', '/dispatcher/map'],
  ],
  FLEET_MANAGER: [
    ['Load Board', '/fleet/load-board'],
    ['Fleet Assets', '/fleet/trucks'],
    ['Drivers', '/fleet/drivers'],
    ['Capacity', '/fleet/capacity'],
  ],
  BROKER: [
    ['Commercial Board', '/broker/dashboard'],
    ['Shippers', '/broker/customers'],
    ['Create Load', '/broker/orders/new'],
  ],
  ADMIN: [
    ['Analytics', '/admin/analytics'],
    ['Webhooks', '/admin/webhooks'],
    ['RBAC Users', '/admin/users'],
  ],
}

const roleScopes = {
  CUSTOMER: 'Post freight, track owned loads',
  DRIVER: 'Read assigned loads, submit POD',
  DISPATCHER: 'Read all loads, assign trucks, pause loads',
  FLEET_MANAGER: 'Manage carrier assets, capacity, drivers',
  BROKER: 'Manage shippers, create and broker loads',
  ADMIN: 'Full platform administration'
}

function initialsFor(user) {
  const source = user?.displayName || user?.email || 'Transit Grid'
  return source
    .split(/[.\s_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'TG'
}

function UserAvatar({ user, size = 'default' }) {
  const classes = ['profile-avatar', size === 'small' ? 'profile-avatar-small' : ''].filter(Boolean).join(' ')

  return (
    <div className={classes} aria-hidden="true">
      {user?.avatarUrl ? <img src={user.avatarUrl} alt="" /> : <span>{initialsFor(user)}</span>}
    </div>
  )
}

function getInitialTheme() {
  if (typeof window === 'undefined') {
    return 'light'
  }

  const storedTheme = window.localStorage.getItem(themeStorageKey)
  if (storedTheme === 'light' || storedTheme === 'dark') {
    return storedTheme
  }

  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(getInitialTheme)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.style.colorScheme = theme
    window.localStorage.setItem(themeStorageKey, theme)
  }, [theme])

  const value = useMemo(() => ({ setTheme, theme }), [theme])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

function useTheme() {
  const value = useContext(ThemeContext)
  if (!value) {
    throw new Error('useTheme must be used inside ThemeProvider')
  }
  return value
}

function ThemeToggle() {
  const { setTheme, theme } = useTheme()

  return (
    <div className="theme-toggle" role="group" aria-label="Color theme">
      {['light', 'dark'].map((mode) => (
        <button
          key={mode}
          type="button"
          className={theme === mode ? 'is-active' : ''}
          aria-pressed={theme === mode}
          onClick={() => setTheme(mode)}
        >
          <span className={`theme-toggle-icon theme-toggle-icon--${mode}`} aria-hidden="true" />
          <span>{mode === 'light' ? 'Light' : 'Dark'}</span>
        </button>
      ))}
    </div>
  )
}

function RoleRedirect() {
  const { loading, user } = useAuth()

  if (loading) {
    return <div className="loading-page">Loading workspace...</div>
  }

  return <Navigate to={user ? getRoleHome(user.role) : '/login'} replace />
}

function ProtectedRoute({ roles, children }) {
  const { loading, user } = useAuth()

  if (loading) {
    return <div className="loading-page">Loading workspace...</div>
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (roles?.length && !roles.includes(user.role)) {
    return <Navigate to={getRoleHome(user.role)} replace />
  }

  return children
}

function RoleLayout({ roles }) {
  const navigate = useNavigate()
  const { signOut, user } = useAuth()
  const primaryRole = user?.role
  const links = roleLinks[primaryRole] || []

  return (
    <ProtectedRoute roles={roles}>
      <div className="workspace-shell">
        <aside className="workspace-sidebar">
          <div className="workspace-brand">
            <div className="brand-mark" aria-hidden="true">TG</div>
            <div>
              <p className="eyebrow">Transit Grid</p>
              <h1>{roleLabels[primaryRole] || 'Workspace'}</h1>
              <p>{user?.organization?.legalName || user?.organizationName || user?.shipper?.companyName || user?.truck?.label || 'Operations platform'}</p>
            </div>
          </div>
          <div className="workspace-profile-card">
            <UserAvatar user={user} />
            <div>
              <strong>{user?.displayName || user?.email}</strong>
              <span>{user?.title || roleLabels[primaryRole] || 'Workspace user'}</span>
              <small>{user?.email}</small>
            </div>
          </div>
          <div className="rbac-scope">
            <span>{primaryRole}</span>
            <p>{roleScopes[primaryRole] || 'Role-scoped access'}</p>
            {user?.organization?.verificationStatus && <small>{user.organization.verificationStatus.replaceAll('_', ' ')}</small>}
          </div>
          <nav className="workspace-nav" aria-label={`${roleLabels[primaryRole]} navigation`}>
            <span className="nav-section-label">Operations</span>
            {links.map(([label, to]) => (
              <NavLink key={to} to={to}>{label}</NavLink>
            ))}
            <span className="nav-section-label">Account</span>
            <NavLink to="/profile">Profile</NavLink>
          </nav>
          <div className="workspace-sidebar-footer">
            <ThemeToggle />
            <button
              type="button"
              className="secondary-button workspace-signout"
              onClick={() => {
                signOut()
                navigate('/login', { replace: true })
              }}
            >
              Sign out
            </button>
          </div>
        </aside>
        <main className="workspace-main">
          <header className="workspace-topbar">
            <div>
              <p className="eyebrow">Workspace</p>
              <strong>{roleLabels[primaryRole] || 'Transit Grid'}</strong>
            </div>
            <div className="topbar-profile">
              <UserAvatar user={user} size="small" />
              <span>{user?.displayName || user?.email}</span>
            </div>
          </header>
          <Outlet />
        </main>
      </div>
    </ProtectedRoute>
  )
}

function PublicFrame({ children }) {
  return (
    <main className="public-page">
      <header className="public-header">
        <div>
          <p className="eyebrow">Transit Grid</p>
          <h1>Live shipment tracking</h1>
        </div>
        <ThemeToggle />
      </header>
      {children}
    </main>
  )
}

function AppRoutes() {
  const allRoles = Object.keys(roleLabels)

  return (
    <Routes>
      <Route path="/login" element={<LoginPage themeToggle={<ThemeToggle />} />} />
      <Route path="/track/:trackingCode" element={<PublicFrame><PublicTrackingPage /></PublicFrame>} />

      <Route path="/customer" element={<RoleLayout roles={['CUSTOMER']} />}>
        <Route index element={<Navigate to="/customer/orders" replace />} />
        <Route
          path="orders"
          element={<ShipmentsPage eyebrow="Customer" title="My orders" createTo="/customer/orders/new" detailBasePath="/customer/orders" listTitle="Order history" />}
        />
        <Route
          path="orders/new"
          element={<ShipmentNewPage eyebrow="Customer order" title="New order" detailBasePath="/customer/orders" hideShipper />}
        />
        <Route path="orders/:id" element={<ShipmentDetailPage />} />
      </Route>

      <Route path="/driver" element={<RoleLayout roles={['DRIVER']} />}>
        <Route index element={<Navigate to="/driver/road" replace />} />
        <Route path="road" element={<DriverRoadPage />} />
        <Route path="proof-of-delivery" element={<ProofOfDeliveryPage />} />
      </Route>

      <Route path="/dispatcher" element={<RoleLayout roles={['DISPATCHER']} />}>
        <Route index element={<Navigate to="/dispatcher/loads" replace />} />
        <Route
          path="loads"
          element={<ShipmentsPage eyebrow="Dispatcher" title="Loads" createTo={null} detailBasePath="/dispatcher/loads" listTitle="Dispatch load board" />}
        />
        <Route path="loads/:id" element={<ShipmentDetailPage />} />
        <Route path="exceptions" element={<DispatcherExceptionsPage />} />
        <Route path="map" element={<DispatcherMapPage />} />
      </Route>

      <Route path="/fleet" element={<RoleLayout roles={['FLEET_MANAGER']} />}>
        <Route index element={<Navigate to="/fleet/load-board" replace />} />
        <Route
          path="load-board"
          element={<ShipmentsPage eyebrow="Carrier marketplace" title="Load board" createTo={null} detailBasePath="/fleet/load-board" loadBoardMode listTitle="Available freight" />}
        />
        <Route path="load-board/:id" element={<ShipmentDetailPage />} />
        <Route path="trucks" element={<TrucksPage />} />
        <Route path="drivers" element={<FleetDriversPage />} />
        <Route path="capacity" element={<FleetCapacityPage />} />
      </Route>

      <Route path="/broker" element={<RoleLayout roles={['BROKER']} />}>
        <Route index element={<Navigate to="/broker/dashboard" replace />} />
        <Route path="dashboard" element={<BrokerDashboardPage />} />
        <Route path="customers" element={<ShippersPage />} />
        <Route path="customers/:id" element={<ShipperDetailPage />} />
        <Route
          path="orders/new"
          element={<ShipmentNewPage eyebrow="Broker order" title="Create customer order" detailBasePath="/broker/orders" />}
        />
        <Route path="orders/:id" element={<ShipmentDetailPage />} />
      </Route>

      <Route path="/admin" element={<RoleLayout roles={['ADMIN']} />}>
        <Route index element={<Navigate to="/admin/analytics" replace />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="webhooks" element={<WebhooksPage />} />
        <Route path="users" element={<AdminUsersPage />} />
      </Route>

      <Route
        path="/shipments/:id"
        element={(
          <ProtectedRoute roles={allRoles}>
            <ShipmentDetailPage />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/profile"
        element={(
          <ProtectedRoute roles={allRoles}>
            <ProfilePage />
          </ProtectedRoute>
        )}
      />
      <Route path="/shipments" element={<RoleRedirect />} />
      <Route path="/shipments/new" element={<RoleRedirect />} />
      <Route path="/dashboard" element={<RoleRedirect />} />
      <Route path="/" element={<RoleRedirect />} />
      <Route path="*" element={<RoleRedirect />} />
    </Routes>
  )
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </ThemeProvider>
  )
}

export default App
