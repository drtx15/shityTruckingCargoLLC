import { useEffect, useMemo, useRef, useState } from 'react'
import { createShipment, createTruck, deleteTruck, getShipments, getTrucks, updateTruck } from '../api'
import ShipmentForm from '../components/ShipmentForm'
import ShipmentList from '../components/ShipmentList'
import TruckManager from '../components/TruckManager'

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
    const [newTruckLabel, setNewTruckLabel] = useState('')
    const [truckDrafts, setTruckDrafts] = useState({})
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
            setTruckDrafts((prev) => {
                const nextDrafts = {}

                nextTrucks.forEach((truck) => {
                    nextDrafts[truck.id] = prev[truck.id] ?? truck.label
                })

                return nextDrafts
            })
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

    const handleTruckDraftChange = (truckId, value) => {
        setTruckDrafts((prev) => ({ ...prev, [truckId]: value }))
    }

    const handleSaveTruck = async (truckId) => {
        const label = (truckDrafts[truckId] || '').trim()

        if (!label) {
            return
        }

        try {
            await updateTruck(truckId, label)
            await load()
        } catch (err) {
            setError(err.message)
        }
    }

    const handleDeleteTruck = async (truckId) => {
        try {
            await deleteTruck(truckId)
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

    return (
        <section className="dashboard-grid">
            <aside className="dashboard-sidebar">
                <ShipmentForm onCreate={handleCreate} />
                <TruckManager
                    trucks={trucks}
                    draftLabels={truckDrafts}
                    onDraftChange={handleTruckDraftChange}
                    onSave={handleSaveTruck}
                    onDelete={handleDeleteTruck}
                    onCreate={handleCreateTruck}
                    newTruckLabel={newTruckLabel}
                    onNewTruckLabelChange={setNewTruckLabel}
                />
            </aside>
            <ShipmentList
                className="dashboard-main"
                shipments={visibleShipments}
                filters={filters}
                onFiltersChange={setFilters}
            />
            {error && <p className="error-text">{error}</p>}
        </section>
    )
}

export default DashboardPage
