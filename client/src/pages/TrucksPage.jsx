import { useEffect, useMemo, useState } from 'react'
import { createTruck, deleteTruck, getTrucks, updateTruck } from '../api'
import { CheckIcon, IconButton, SignalIcon, TrashIcon, TruckIcon } from '../components/IconControls'
import MetricStrip from '../components/MetricStrip'
import StatusIndicator from '../components/StatusIndicator'

function TrucksPage() {
    const [trucks, setTrucks] = useState([])
    const [drafts, setDrafts] = useState({})
    const [form, setForm] = useState({ label: '', driverName: '', maxWeightKg: '10000' })
    const [error, setError] = useState('')

    const load = async () => {
        try {
            const data = await getTrucks()
            setTrucks(data)
            setDrafts((prev) => {
                const next = {}
                data.forEach((truck) => {
                    next[truck.id] = prev[truck.id] || {
                        label: truck.label || '',
                        driverName: truck.driverName || '',
                        maxWeightKg: String(truck.maxWeightKg || 10000)
                    }
                })
                return next
            })
            setError('')
        } catch (err) {
            setError(err.message)
        }
    }

    useEffect(() => {
        load()
    }, [])

    const stats = useMemo(() => ({
        total: trucks.length,
        moving: trucks.filter((truck) => truck.status === 'MOVING').length,
        available: trucks.filter((truck) => truck.status === 'IDLE').length,
        assigned: trucks.filter((truck) => truck.status === 'ASSIGNED').length
    }), [trucks])

    const updateDraft = (truckId, patch) => {
        setDrafts((prev) => ({
            ...prev,
            [truckId]: {
                ...prev[truckId],
                ...patch
            }
        }))
    }

    const submit = async (event) => {
        event.preventDefault()
        try {
            await createTruck({ ...form, maxWeightKg: Number(form.maxWeightKg) })
            setForm({ label: '', driverName: '', maxWeightKg: '10000' })
            await load()
        } catch (err) {
            setError(err.message)
        }
    }

    const saveTruck = async (truck) => {
        const draft = drafts[truck.id] || {}
        try {
            await updateTruck(truck.id, {
                label: draft.label,
                driverName: draft.driverName,
                maxWeightKg: Number(draft.maxWeightKg)
            })
            await load()
        } catch (err) {
            setError(err.message)
        }
    }

    const removeTruck = async (truck) => {
        if (typeof window !== 'undefined' && !window.confirm(`Delete ${truck.label}?`)) {
            return
        }

        try {
            await deleteTruck(truck.id)
            await load()
        } catch (err) {
            setError(err.message)
        }
    }

    return (
        <section className="page-stack">
            <div className="page-heading">
                <div>
                    <p className="eyebrow">Fleet operations</p>
                    <h2>Fleet assets</h2>
                </div>
            </div>

            <MetricStrip
                items={[
                    { label: 'Total trucks', value: stats.total, icon: TruckIcon },
                    { label: 'Moving', value: stats.moving, icon: SignalIcon, state: stats.moving ? 'live' : '' },
                    { label: 'Idle', value: stats.available, icon: TruckIcon },
                    { label: 'Assigned', value: stats.assigned, icon: SignalIcon, state: stats.assigned ? 'warn' : '' }
                ]}
            />

            {error && <p className="error-text">{error}</p>}

            <div className="crud-layout">
                <div className="panel">
                    <div className="table-header">
                        <span>Truck</span>
                        <span>Driver</span>
                        <span>Capacity</span>
                        <span>Status</span>
                        <span>Actions</span>
                    </div>
                    <div className="data-list">
                        {trucks.map((truck) => {
                            const draft = drafts[truck.id] || {}
                            return (
                                <form key={truck.id} className="data-row fleet-edit-row" onSubmit={(event) => {
                                    event.preventDefault()
                                    saveTruck(truck)
                                }}>
                                    <label className="inline-field">
                                        <span>Truck</span>
                                        <input value={draft.label || ''} onChange={(event) => updateDraft(truck.id, { label: event.target.value })} required />
                                    </label>
                                    <label className="inline-field">
                                        <span>Driver</span>
                                        <input value={draft.driverName || ''} onChange={(event) => updateDraft(truck.id, { driverName: event.target.value })} placeholder="Unassigned" />
                                    </label>
                                    <label className="inline-field">
                                        <span>Max kg</span>
                                        <input type="number" value={draft.maxWeightKg || ''} onChange={(event) => updateDraft(truck.id, { maxWeightKg: event.target.value })} min="1" />
                                    </label>
                                    <div className="row-status">
                                        <StatusIndicator status={truck.status} />
                                        <small>{Math.round(truck.currentLoadKg || 0)} kg loaded</small>
                                    </div>
                                    <div className="row-actions">
                                        <IconButton type="submit" icon={CheckIcon} label={`Save ${truck.label}`} className="icon-button--soft" />
                                        <IconButton type="button" icon={TrashIcon} label={`Delete ${truck.label}`} className="icon-button--danger" onClick={() => removeTruck(truck)} />
                                    </div>
                                </form>
                            )
                        })}
                    </div>
                </div>

                <form className="panel form-panel" onSubmit={submit}>
                    <div className="form-header">
                        <div>
                            <p className="eyebrow">CRUD</p>
                            <h2>Add truck</h2>
                        </div>
                    </div>
                    <label>
                        Label
                        <input value={form.label} onChange={(event) => setForm((prev) => ({ ...prev, label: event.target.value }))} required />
                    </label>
                    <label>
                        Driver
                        <input value={form.driverName} onChange={(event) => setForm((prev) => ({ ...prev, driverName: event.target.value }))} />
                    </label>
                    <label>
                        Max weight kg
                        <input type="number" value={form.maxWeightKg} onChange={(event) => setForm((prev) => ({ ...prev, maxWeightKg: event.target.value }))} min="1" />
                    </label>
                    <button type="submit">Add truck</button>
                </form>
            </div>
        </section>
    )
}

export default TrucksPage
