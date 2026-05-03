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
            <p className="eyebrow">Transit Grid</p>
            <h1>{roleLabels[primaryRole] || 'Workspace'}</h1>
            <p>{user?.email}</p>
          </div>
          <nav className="workspace-nav" aria-label={`${roleLabels[primaryRole]} navigation`}>
            {links.map(([label, to]) => (
              <NavLink key={to} to={to}>{label}</NavLink>
            ))}
          </nav>
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
        </aside>
        <main className="workspace-main">
          <Outlet />
        </main>
      </div>
    </ProtectedRoute>
  )
}

function AppRoutes() {
  const allRoles = Object.keys(roleLabels)

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/track/:trackingCode" element={<PublicTrackingPage />} />

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
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  )
}

export default App
