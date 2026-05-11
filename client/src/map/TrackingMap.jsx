import { useEffect, useMemo, useRef } from 'react'
import L from 'leaflet'
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet'

const markerIcons = {
    origin: L.divIcon({
        className: 'map-marker map-marker-origin',
        html: '<span></span>',
        iconSize: [24, 24],
        iconAnchor: [12, 12]
    }),
    destination: L.divIcon({
        className: 'map-marker map-marker-destination',
        html: '<span></span>',
        iconSize: [24, 24],
        iconAnchor: [12, 12]
    }),
    truck: L.divIcon({
        className: 'map-marker map-marker-truck',
        html: '<span></span>',
        iconSize: [30, 30],
        iconAnchor: [15, 15]
    })
}

function RouteBounds({ positions }) {
    const map = useMap()
    const lastFitKeyRef = useRef('')

    useEffect(() => {
        if (!positions || positions.length < 2) {
            return
        }

        const routeKey = positions.map((point) => point.join(',')).join('|')
        if (lastFitKeyRef.current === routeKey) {
            return
        }

        lastFitKeyRef.current = routeKey

        map.fitBounds(positions, {
            padding: [36, 36],
            maxZoom: 12
        })
    }, [map, positions])

    return null
}

function TrackingMap({ route, truck, compact = false, heading = 'Live Tracking' }) {
    const routeAvailable = Boolean(route?.origin && route?.destination)
    const originLat = route?.origin?.lat ?? 0
    const originLng = route?.origin?.lng ?? 0
    const destinationLat = route?.destination?.lat ?? 0
    const destinationLng = route?.destination?.lng ?? 0
    const origin = useMemo(() => [originLat, originLng], [originLat, originLng])
    const destination = useMemo(() => [destinationLat, destinationLng], [destinationLat, destinationLng])
    const routePolyline = useMemo(() => (Array.isArray(route?.routePolyline) ? route.routePolyline : []), [route?.routePolyline])
    const routePositions = useMemo(() => {
        if (routePolyline.length > 1) {
            return routePolyline.map((point) => [point.lat, point.lng])
        }

        return [origin, destination]
    }, [origin, destination, routePolyline])

    const truckLat = truck?.currentLat
    const truckLng = truck?.currentLng
    const truckPosition = useMemo(() => {
        if (
            truckLat === null ||
            truckLat === undefined ||
            truckLng === null ||
            truckLng === undefined
        ) {
            return null
        }

        return [truckLat, truckLng]
    }, [truckLat, truckLng])

    const center = truckPosition || routePositions[0] || origin

    if (!routeAvailable) {
        return <div className="panel">Route unavailable.</div>
    }

    return (
        <div className={`panel map-panel ${compact ? 'compact' : ''}`}>
            <h2>{heading}</h2>
            <MapContainer center={center} zoom={compact ? 6 : 7} scrollWheelZoom className="leaflet-map">
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <RouteBounds positions={routePositions} />
                <Marker position={origin} icon={markerIcons.origin}>
                    <Tooltip permanent direction="top" opacity={0.95}>
                        Origin
                    </Tooltip>
                </Marker>
                <Marker position={destination} icon={markerIcons.destination}>
                    <Tooltip permanent direction="top" opacity={0.95}>
                        Destination
                    </Tooltip>
                </Marker>
                {truckPosition && (
                    <Marker position={truckPosition} icon={markerIcons.truck}>
                        <Tooltip permanent direction="top" opacity={0.98}>
                            <div className="truck-tooltip">
                                <strong>{truck?.label || 'Assigned truck'}</strong>
                                <span>
                                    Speed {truck?.currentSpeed !== null && truck?.currentSpeed !== undefined
                                        ? `${Math.round(truck.currentSpeed)} kph`
                                        : 'N/A'}
                                </span>
                                <span>
                                    ETA {route.etaMinutes !== null && route.etaMinutes !== undefined
                                        ? `${route.etaMinutes} min`
                                        : 'Pending'}
                                </span>
                            </div>
                        </Tooltip>
                    </Marker>
                )}
                <Polyline positions={routePositions} pathOptions={{ color: '#2563eb', weight: 4, opacity: 0.88 }} />
            </MapContainer>
        </div>
    )
}

export default TrackingMap
