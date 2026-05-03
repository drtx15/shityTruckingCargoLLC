import { useEffect, useRef, useState } from 'react'
import { searchLocations } from '../api'
import TrackingMap from '../map/TrackingMap'
import { IconButton, PlusIcon, SwapIcon } from './IconControls'

const initialForm = {
    origin: '',
    destination: '',
    shipperId: '',
    priority: 'STANDARD',
    cargoDescription: '',
    weightKg: '1000',
    deliveryDeadline: ''
}

function ShipmentForm({ onCreate, shippers = [], expanded = false, hideShipper = false }) {
    const [form, setForm] = useState(initialForm)
    const [originSuggestions, setOriginSuggestions] = useState([])
    const [destinationSuggestions, setDestinationSuggestions] = useState([])
    const [selectedOrigin, setSelectedOrigin] = useState(null)
    const [selectedDestination, setSelectedDestination] = useState(null)
    const [lookupError, setLookupError] = useState('')
    const originTimerRef = useRef(null)
    const destinationTimerRef = useRef(null)
    useEffect(() => {
        return () => {
            if (originTimerRef.current) {
                clearTimeout(originTimerRef.current)
            }
            if (destinationTimerRef.current) {
                clearTimeout(destinationTimerRef.current)
            }
        }
    }, [])

    const queueLookup = (field, query) => {
        const timerRef = field === 'origin' ? originTimerRef : destinationTimerRef
        const setSuggestions = field === 'origin' ? setOriginSuggestions : setDestinationSuggestions
        const normalizedQuery = query.trim()

        if (timerRef.current) {
            clearTimeout(timerRef.current)
        }

        if (normalizedQuery.length < 2) {
            setSuggestions([])
            return
        }

        timerRef.current = setTimeout(async () => {
            try {
                const results = await searchLocations(normalizedQuery, 5)
                setSuggestions(results)
                setLookupError('')
            } catch (error) {
                setSuggestions([])
                setLookupError(error.message)
            }
        }, 350)
    }

    const selectSuggestion = (field, location) => {
        setForm((prev) => ({ ...prev, [field]: location.label }))

        if (field === 'origin') {
            setSelectedOrigin(location)
            setOriginSuggestions([])
        } else {
            setSelectedDestination(location)
            setDestinationSuggestions([])
        }
    }

    const swapLocations = () => {
        setForm((prev) => ({
            ...prev,
            origin: prev.destination,
            destination: prev.origin
        }))
        setSelectedOrigin(selectedDestination)
        setSelectedDestination(selectedOrigin)
        setOriginSuggestions([])
        setDestinationSuggestions([])
    }

    const handleChange = (event) => {
        const { name, value } = event.target
        setForm((prev) => ({ ...prev, [name]: value }))

        if (name === 'origin' || name === 'destination') {
            if (name === 'origin') {
                setSelectedOrigin(null)
            } else {
                setSelectedDestination(null)
            }
            queueLookup(name, value)
        }
    }

    const submit = (event) => {
        event.preventDefault()
        onCreate({
            origin: form.origin.trim(),
            originLat: selectedOrigin?.lat,
            originLng: selectedOrigin?.lng,
            originLabel: selectedOrigin?.label || form.origin.trim(),
            destination: form.destination.trim(),
            destinationLat: selectedDestination?.lat,
            destinationLng: selectedDestination?.lng,
            destinationLabel: selectedDestination?.label || form.destination.trim(),
            shipperId: form.shipperId ? Number(form.shipperId) : null,
            priority: form.priority,
            cargoDescription: form.cargoDescription.trim(),
            weightKg: Number(form.weightKg || 1000),
            deliveryDeadline: form.deliveryDeadline || null
        })
    }

    const previewRoute = selectedOrigin && selectedDestination
        ? {
            origin: { lat: selectedOrigin.lat, lng: selectedOrigin.lng },
            destination: { lat: selectedDestination.lat, lng: selectedDestination.lng },
            routePolyline: []
        }
        : null

    return (
        <form className="panel form-panel" onSubmit={submit}>
            <div className="form-header">
                <div>
                    <h2>Create shipment</h2>
                </div>
                <IconButton type="button" icon={SwapIcon} label="Swap route" className="icon-button--soft" onClick={swapLocations} />
            </div>
            <div className="form-grid">
                {expanded && (
                    <>
                        {!hideShipper && (
                            <label>
                                Shipper
                                <select name="shipperId" value={form.shipperId} onChange={handleChange}>
                                    <option value="">No shipper selected</option>
                                    {shippers.map((shipper) => (
                                        <option key={shipper.id} value={shipper.id}>{shipper.companyName}</option>
                                    ))}
                                </select>
                            </label>
                        )}
                        <label>
                            Priority
                            <select name="priority" value={form.priority} onChange={handleChange}>
                                <option value="STANDARD">Standard</option>
                                <option value="EXPRESS">Express</option>
                                <option value="URGENT">Urgent</option>
                            </select>
                        </label>
                        <label>
                            Cargo description
                            <input name="cargoDescription" value={form.cargoDescription} onChange={handleChange} placeholder="Electronics pallets" />
                        </label>
                        <label>
                            Weight kg
                            <input name="weightKg" type="number" min="1" value={form.weightKg} onChange={handleChange} />
                        </label>
                        <label>
                            Delivery deadline
                            <input name="deliveryDeadline" type="datetime-local" value={form.deliveryDeadline} onChange={handleChange} />
                        </label>
                    </>
                )}
                <div className="suggestion-field">
                    <label htmlFor="origin-input">Origin (city, address, ZIP, state/country)</label>
                    <input
                        id="origin-input"
                        name="origin"
                        value={form.origin}
                        onChange={handleChange}
                        onFocus={() => queueLookup('origin', form.origin)}
                        minLength={2}
                        autoComplete="off"
                        required
                    />
                    {originSuggestions.length > 0 && (
                        <div className="suggestions-menu" role="listbox" aria-label="Origin suggestions">
                            {originSuggestions.map((location) => (
                                <button
                                    key={`origin-${location.label}-${location.lat}-${location.lng}`}
                                    type="button"
                                    className="suggestion-item"
                                    onClick={() => selectSuggestion('origin', location)}
                                >
                                    <span className="suggestion-label">{location.label}</span>
                                    <span className="suggestion-meta">
                                        {location.lat.toFixed(4)}, {location.lng.toFixed(4)}
                                    </span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div className="suggestion-field">
                    <label htmlFor="destination-input">Destination (city, address, ZIP, state/country)</label>
                    <input
                        id="destination-input"
                        name="destination"
                        value={form.destination}
                        onChange={handleChange}
                        onFocus={() => queueLookup('destination', form.destination)}
                        minLength={2}
                        autoComplete="off"
                        required
                    />
                    {destinationSuggestions.length > 0 && (
                        <div className="suggestions-menu" role="listbox" aria-label="Destination suggestions">
                            {destinationSuggestions.map((location) => (
                                <button
                                    key={`destination-${location.label}-${location.lat}-${location.lng}`}
                                    type="button"
                                    className="suggestion-item"
                                    onClick={() => selectSuggestion('destination', location)}
                                >
                                    <span className="suggestion-label">{location.label}</span>
                                    <span className="suggestion-meta">
                                        {location.lat.toFixed(4)}, {location.lng.toFixed(4)}
                                    </span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
            {lookupError && <p className="error-text">{lookupError}</p>}
            <div className="preview-shell">
                {previewRoute && (
                    <TrackingMap
                        route={previewRoute}
                        compact
                        heading="Mini map preview"
                    />
                )}
            </div>
            <IconButton type="submit" icon={PlusIcon} label="Create shipment" />
        </form>
    )
}

export default ShipmentForm
