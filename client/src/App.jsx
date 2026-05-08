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
  CUSTOMER: 'Customer workspace',
  DRIVER: 'Driver workspace',
  DISPATCHER: 'Dispatcher workspace',
  FLEET_MANAGER: 'Fleet workspace',
  BROKER: 'Broker workspace',
  ADMIN: 'Admin workspace'
}

const roleLinks = {
  CUSTOMER: [
    ['Orders', '/customer/orders'],
    ['New order', '/customer/orders/new'],
  ],
  DRIVER: [
    ['Road', '/driver/road'],
    ['Delivery proof', '/driver/proof-of-delivery'],
  ],
  DISPATCHER: [
    ['Loads', '/dispatcher/loads'],
    ['Exceptions', '/dispatcher/exceptions'],
    ['Map', '/dispatcher/map'],
  ],
  FLEET_MANAGER: [
    ['Trucks', '/fleet/trucks'],
    ['Drivers', '/fleet/drivers'],
    ['Capacity', '/fleet/capacity'],
  ],
  BROKER: [
    ['Dashboard', '/broker/dashboard'],
    ['Customers', '/broker/customers'],
    ['New order', '/broker/orders/new'],
  ],
  ADMIN: [
    ['Analytics', '/admin/analytics'],
    ['Webhooks', '/admin/webhooks'],
    ['Users', '/admin/users'],
  ],
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
              <p>{user?.email}</p>
            </div>
          </div>
          <nav className="workspace-nav" aria-label={`${roleLabels[primaryRole]} navigation`}>
            {links.map(([label, to]) => (
              <NavLink key={to} to={to}>{label}</NavLink>
            ))}
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
            <span>{user?.email}</span>
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
        <Route index element={<Navigate to="/fleet/trucks" replace />} />
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
