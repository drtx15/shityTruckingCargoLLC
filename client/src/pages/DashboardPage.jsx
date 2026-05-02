import { useEffect, useMemo, useRef, useState } from 'react'
import { assignTruck, createShipment, createTruck, getShipments, getTrucks } from '../api'
import ShipmentForm from '../components/ShipmentForm'
import ShipmentList from '../components/ShipmentList'

const statusAliases = {
    all: 'all',
    created: 'PENDING',
    assigned: 'ASSIGNED',
    in_transit: 'IN_TRANSIT',
    delivered: 'ARRIVED'
}

function isDelayed(shipment, now) {
    if (shipment.status === 'ARRIVED') {
        return false
    }

    if (shipment.estimatedAt) {
        return new Date(shipment.estimatedAt).getTime() < now.getTime()
    }

    return shipment.status === 'IN_TRANSIT' && typeof shipment.etaMinutes === 'number' && shipment.etaMinutes > 120
}

function toCreatedAgeBucket(createdAt, now) {
    const ageMs = now.getTime() - new Date(createdAt).getTime()
    const dayMs = 24 * 60 * 60 * 1000
    const weekMs = 7 * dayMs

    if (ageMs <= dayMs) {
        return '24h'
    }

    if (ageMs <= weekMs) {
        return '7d'
    }

    return 'all'
}

function DashboardPage() {
    const [shipments, setShipments] = useState([])
    const [trucks, setTrucks] = useState([])
    const [error, setError] = useState('')
    const [lastSyncedAt, setLastSyncedAt] = useState(null)
    const [newTruckLabel, setNewTruckLabel] = useState('')
    const [filters, setFilters] = useState({
        query: '',
        status: 'all',
        truckId: 'all',
        timeRange: 'all',
        quick: 'all'
    })
    const loadAbortRef = useRef(null)

    const load = async () => {
        if (loadAbortRef.current) {
            loadAbortRef.current.abort()
        }

        const controller = new AbortController()
        loadAbortRef.current = controller

        try {
            const [nextShipments, nextTrucks] = await Promise.all([
                getShipments({ signal: controller.signal }),
                getTrucks({ signal: controller.signal })
            ])

            if (controller.signal.aborted) {
                return
            }

            setShipments(nextShipments)
            setTrucks(nextTrucks)
            setLastSyncedAt(new Date())
            setError('')
        } catch (err) {
            if (err?.name === 'AbortError') {
                return
            }
            setError(err.message)
        } finally {
            if (loadAbortRef.current === controller) {
                loadAbortRef.current = null
            }
        }
    }

    useEffect(() => {
        load()
        const timer = setInterval(load, 4000)
        return () => {
            clearInterval(timer)

            if (loadAbortRef.current) {
                loadAbortRef.current.abort()
            }
        }
    }, [])

    const handleCreate = async (data) => {
        try {
            await createShipment(data)
            await load()
        } catch (err) {
            setError(err.message)
        }
    }

    const handleAssign = async (shipmentId, truckId) => {
        try {
            await assignTruck(shipmentId, truckId)
            await load()
        } catch (err) {
            setError(err.message)
        }
    }

    const handleCreateTruck = async (event) => {
        event.preventDefault()
        const label = newTruckLabel.trim()
        if (!label) {
            return
        }

        try {
            await createTruck(label)
            setNewTruckLabel('')
            await load()
        } catch (err) {
            setError(err.message)
        }
    }

    const visibleShipments = useMemo(() => {
        const now = new Date()
        const query = filters.query.trim().toLowerCase()

        return shipments.filter((shipment) => {
            const truckLabel = shipment.assignedTruck?.label || ''
            const originLabel = shipment.originLabel || ''
            const destinationLabel = shipment.destinationLabel || ''
            const statusMatches = filters.status === 'all' || shipment.status === statusAliases[filters.status]
            const truckMatches = filters.truckId === 'all' || String(shipment.assignedTruckId || '') === filters.truckId
            const timeMatches = filters.timeRange === 'all' || toCreatedAgeBucket(shipment.createdAt, now) === filters.timeRange
            const quickMatches =
                filters.quick === 'all' ||
                (filters.quick === 'active' && shipment.status !== 'ARRIVED') ||
                (filters.quick === 'delayed' && isDelayed(shipment, now))
            const queryMatches =
                !query ||
                String(shipment.id).includes(query) ||
                truckLabel.toLowerCase().includes(query) ||
                originLabel.toLowerCase().includes(query) ||
                destinationLabel.toLowerCase().includes(query) ||
                shipment.status.toLowerCase().includes(query)

            return statusMatches && truckMatches && timeMatches && quickMatches && queryMatches
        })
    }, [filters, shipments])

    const summary = useMemo(() => {
        const now = new Date()
        return {
            total: shipments.length,
            active: shipments.filter((shipment) => shipment.status !== 'ARRIVED').length,
            delayed: shipments.filter((shipment) => isDelayed(shipment, now)).length,
            delivered: shipments.filter((shipment) => shipment.status === 'ARRIVED').length
        }
    }, [shipments])

    return (
        <section className="dashboard-grid">
            <ShipmentForm onCreate={handleCreate} />
            <ShipmentList
                shipments={visibleShipments}
                trucks={trucks}
                onAssign={handleAssign}
                newTruckLabel={newTruckLabel}
                onNewTruckLabelChange={setNewTruckLabel}
                onCreateTruck={handleCreateTruck}
                filters={filters}
                onFiltersChange={setFilters}
                summary={summary}
                lastSyncedAt={lastSyncedAt}
            />
            {error && <p className="error-text">{error}</p>}
        </section>
    )
}

export default DashboardPage
