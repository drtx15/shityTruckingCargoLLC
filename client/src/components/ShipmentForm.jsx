import { useEffect, useMemo, useRef, useState } from 'react'
import { searchLocations } from '../api'
import TrackingMap from '../map/TrackingMap'

const initialForm = {
    origin: 'Tashkent',
    destination: 'Fergana'
}

function ShipmentForm({ onCreate }) {
    const [form, setForm] = useState(initialForm)
    const [originSuggestions, setOriginSuggestions] = useState([])
    const [destinationSuggestions, setDestinationSuggestions] = useState([])
    const [selectedOrigin, setSelectedOrigin] = useState(null)
    const [selectedDestination, setSelectedDestination] = useState(null)
    const [lookupError, setLookupError] = useState('')
    const originTimerRef = useRef(null)
    const destinationTimerRef = useRef(null)
    const savedLocations = useMemo(
        () => [
            { label: 'Tashkent Logistics Hub', value: 'Tashkent' },
            { label: 'Fergana Distribution Yard', value: 'Fergana' },
            { label: 'Samarkand Freight Terminal', value: 'Samarkand' }
        ],
        []
    )

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
            destinationLabel: selectedDestination?.label || form.destination.trim()
        })
    }

    const topOrigin = originSuggestions[0]
    const topDestination = destinationSuggestions[0]
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
                    <p className="eyebrow">Shipment lifecycle</p>
                    <h2>Create shipment</h2>
                </div>
                <button type="button" className="secondary-button" onClick={swapLocations}>
                    Swap route
                </button>
            </div>
            <div className="saved-locations">
                {savedLocations.map((location) => (
                    <button
                        key={location.label}
                        type="button"
                        className="saved-location"
                        onClick={() => {
                            setForm((prev) => ({
                                ...prev,
                                origin: location.value,
                                destination: prev.destination
                            }))
                            queueLookup('origin', location.value)
                        }}
                    >
                        {location.label}
                    </button>
                ))}
            </div>
            <div className="form-grid">
                <div className="suggestion-field">
                    <label htmlFor="origin-input">Origin (city, address, ZIP, state/country)</label>
                    <input
                        id="origin-input"
                        name="origin"
                        value={form.origin}
                        onChange={handleChange}
                        onFocus={() => queueLookup('origin', form.origin)}
                        placeholder="e.g. Tashkent or Amir Temur Avenue 10"
                        minLength={2}
                        autoComplete="off"
                        required
                    />
                    {selectedOrigin && (
                        <p className="location-chip">
                            Selected {selectedOrigin.label} {selectedOrigin.lat.toFixed(4)}, {selectedOrigin.lng.toFixed(4)}
                        </p>
                    )}
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
                        placeholder="e.g. Berlin or 10115"
                        minLength={2}
                        autoComplete="off"
                        required
                    />
                    {selectedDestination && (
                        <p className="location-chip">
                            Selected {selectedDestination.label} {selectedDestination.lat.toFixed(4)}, {selectedDestination.lng.toFixed(4)}
                        </p>
                    )}
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
            <p className="form-note">Type at least 2 characters to get OpenStreetMap suggestions.</p>
            {topOrigin && (
                <p className="form-note">
                    Origin top match: {topOrigin.lat.toFixed(4)}, {topOrigin.lng.toFixed(4)}
                </p>
            )}
            {topDestination && (
                <p className="form-note">
                    Destination top match: {topDestination.lat.toFixed(4)}, {topDestination.lng.toFixed(4)}
                </p>
            )}
            {lookupError && <p className="error-text">{lookupError}</p>}
            <div className="preview-shell">
                {previewRoute ? (
                    <TrackingMap
                        route={previewRoute}
                        compact
                        heading="Mini map preview"
                    />
                ) : (
                    <div className="preview-empty">
                        <p className="eyebrow">Selected locations</p>
                        <strong>Choose origin and destination suggestions to preview the route.</strong>
                    </div>
                )}
            </div>
            <button type="submit">Create</button>
        </form>
    )
}

export default ShipmentForm
