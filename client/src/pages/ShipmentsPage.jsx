import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getShipments } from '../api'
import ShipmentList from '../components/ShipmentList'

const initialFilters = {
    query: '',
    status: 'all',
    truckId: 'all',
    timeRange: 'all',
    quick: 'all',
    priority: 'all'
}

function ShipmentsPage({
    eyebrow = 'Operations',
    title = 'Shipments',
    createTo = '/shipments/new',
    detailBasePath = '/shipments',
    loadBoardMode = false,
    listTitle = 'Shipment dashboard'
}) {
    const [shipments, setShipments] = useState([])
    const [filters, setFilters] = useState(initialFilters)
    const [error, setError] = useState('')

    useEffect(() => {
        getShipments()
            .then(setShipments)
            .catch((err) => setError(err.message))
    }, [])

    const visibleShipments = useMemo(() => {
        const query = filters.query.trim().toLowerCase()

        return shipments.filter((shipment) => {
            const haystack = [
                shipment.id,
                shipment.trackingCode,
                shipment.originLabel,
                shipment.destinationLabel,
                shipment.status,
                shipment.priority,
                shipment.shipper?.companyName,
                shipment.assignedTruck?.label
            ].filter(Boolean).join(' ').toLowerCase()

            const statusMatches = filters.status === 'all' || shipment.status === filters.status
            const priorityMatches = filters.priority === 'all' || shipment.priority === filters.priority
            const queryMatches = !query || haystack.includes(query)
            const marketplaceMatches = !loadBoardMode || (
                !shipment.assignedTruck && !['ARRIVED', 'CANCELLED'].includes(shipment.status)
            )
            return statusMatches && priorityMatches && queryMatches && marketplaceMatches
        })
    }, [filters, loadBoardMode, shipments])

    return (
        <section className="page-stack">
            <div className="page-heading">
                <div>
                    <p className="eyebrow">{eyebrow}</p>
                    <h2>{title}</h2>
                </div>
                {createTo && <Link className="text-action" to={createTo}>Create shipment</Link>}
            </div>
            <div className="filter-row panel">
                <label>
                    Priority
                    <select value={filters.priority} onChange={(event) => setFilters((prev) => ({ ...prev, priority: event.target.value }))}>
                        <option value="all">All priorities</option>
                        <option value="STANDARD">Standard</option>
                        <option value="EXPRESS">Express</option>
                        <option value="URGENT">Urgent</option>
                    </select>
                </label>
                <label>
                    Status
                    <select value={filters.status} onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))}>
                        <option value="all">All statuses</option>
                        <option value="PENDING">Pending</option>
                        <option value="ASSIGNED">Assigned</option>
                        <option value="IN_TRANSIT">In transit</option>
                        <option value="DELAYED">Delayed</option>
                        <option value="ARRIVED">Arrived</option>
                        <option value="CANCELLED">Cancelled</option>
                    </select>
                </label>
            </div>
            {error && <p className="error-text">{error}</p>}
            <ShipmentList
                shipments={visibleShipments}
                filters={filters}
                onFiltersChange={setFilters}
                detailBasePath={detailBasePath}
                title={listTitle}
            />
        </section>
    )
}

export default ShipmentsPage
