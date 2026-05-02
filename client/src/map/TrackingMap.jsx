import { useEffect, useMemo, useRef } from 'react'
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet'

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
    if (!route) {
        return <div className="panel">Route unavailable.</div>
    }

    const origin = useMemo(() => [route.origin.lat, route.origin.lng], [route.origin.lat, route.origin.lng])
    const destination = useMemo(() => [route.destination.lat, route.destination.lng], [route.destination.lat, route.destination.lng])
    const routePolyline = Array.isArray(route.routePolyline) ? route.routePolyline : []
    const routePositions = useMemo(() => {
        if (routePolyline.length > 1) {
            return routePolyline.map((point) => [point.lat, point.lng])
        }

        return [origin, destination]
    }, [origin, destination, routePolyline])

    const truckPosition = useMemo(() => {
        if (
            truck?.currentLat === null ||
            truck?.currentLat === undefined ||
            truck?.currentLng === null ||
            truck?.currentLng === undefined
        ) {
            return null
        }

        return [truck.currentLat, truck.currentLng]
    }, [truck?.currentLat, truck?.currentLng])

    const center = truckPosition || routePositions[0] || origin

    return (
        <div className={`panel map-panel ${compact ? 'compact' : ''}`}>
            <h2>{heading}</h2>
            <MapContainer center={center} zoom={compact ? 6 : 7} scrollWheelZoom className="leaflet-map">
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <RouteBounds positions={routePositions} />
                <CircleMarker center={origin} radius={8} pathOptions={{ color: '#6b7280', fillColor: '#94a3b8', fillOpacity: 0.95 }}>
                    <Tooltip permanent direction="top" opacity={0.95}>
                        Origin
                    </Tooltip>
                </CircleMarker>
                <CircleMarker center={destination} radius={8} pathOptions={{ color: '#0f766e', fillColor: '#14b8a6', fillOpacity: 0.95 }}>
                    <Tooltip permanent direction="top" opacity={0.95}>
                        Destination
                    </Tooltip>
                </CircleMarker>
                {truckPosition && (
                    <CircleMarker
                        center={truckPosition}
                        radius={10}
                        pathOptions={{ color: '#1d4ed8', fillColor: '#3b82f6', fillOpacity: 0.98 }}
                    >
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
                    </CircleMarker>
                )}
                <Polyline positions={routePositions} />
            </MapContainer>
        </div>
    )
}

export default TrackingMap
