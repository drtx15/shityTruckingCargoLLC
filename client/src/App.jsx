import { Navigate, Route, Routes } from 'react-router-dom'
import DashboardPage from './pages/DashboardPage'
import ShipmentDetailPage from './pages/ShipmentDetailPage'
import './App.css'

function App() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>Transit Grid</h1>
        <p>Distributed shipment tracking with live fleet telemetry</p>
      </header>

      <main className="app-main">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/shipments/:id" element={<ShipmentDetailPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
