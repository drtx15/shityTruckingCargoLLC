import { useEffect, useState } from 'react'
import { createTruck, getTrucks, updateTruck } from '../api'

function TrucksPage() {
    const [trucks, setTrucks] = useState([])
    const [form, setForm] = useState({ label: '', driverName: '', maxWeightKg: '10000' })
    const [error, setError] = useState('')

    const load = () => getTrucks().then(setTrucks).catch((err) => setError(err.message))

    useEffect(() => {
        load()
    }, [])

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

    const saveCapacity = async (truck, maxWeightKg) => {
        await updateTruck(truck.id, { label: truck.label, driverName: truck.driverName, maxWeightKg: Number(maxWeightKg) })
        await load()
    }

    return (
        <section className="page-grid">
            <form className="panel form-panel" onSubmit={submit}>
                <h2>Add truck</h2>
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
                    <input type="number" value={form.maxWeightKg} onChange={(event) => setForm((prev) => ({ ...prev, maxWeightKg: event.target.value }))} />
                </label>
                <button type="submit">Add truck</button>
                {error && <p className="error-text">{error}</p>}
            </form>
            <div className="panel">
                <h2>Fleet</h2>
                <div className="data-list">
                    {trucks.map((truck) => (
                        <div key={truck.id} className="data-row">
                            <strong>{truck.label}</strong>
                            <span>{truck.driverName || 'No driver'}</span>
                            <span>{truck.status}</span>
                            <span>{truck.currentLoadKg || 0} / {truck.maxWeightKg} kg</span>
                            <button type="button" onClick={() => saveCapacity(truck, truck.maxWeightKg)}>Save</button>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    )
}

export default TrucksPage
