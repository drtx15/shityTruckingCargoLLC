import { useEffect, useRef, useState } from 'react'
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet'

function RouteBounds({ positions }) {
    const map = useMap()

    useEffect(() => {
        if (!positions || positions.length < 2) {
            return
        }

        map.fitBounds(positions, {
            padding: [36, 36],
            maxZoom: 12
        })
    }, [map, positions])

    return null
}

function useAnimatedPosition(targetPosition) {
    const [animatedPosition, setAnimatedPosition] = useState(targetPosition)
    const positionRef = useRef(targetPosition)

    useEffect(() => {
        if (!targetPosition) {
            setAnimatedPosition(null)
            positionRef.current = null
            return undefined
        }

        if (!positionRef.current) {
            setAnimatedPosition(targetPosition)
            positionRef.current = targetPosition
            return undefined
        }

        const startPosition = positionRef.current
        const startTime = performance.now()
        let frameId = 0

        const step = (timestamp) => {
            const progress = Math.min((timestamp - startTime) / 650, 1)
            const nextPosition = [
                startPosition[0] + (targetPosition[0] - startPosition[0]) * progress,
                startPosition[1] + (targetPosition[1] - startPosition[1]) * progress
            ]

            setAnimatedPosition(nextPosition)
            positionRef.current = nextPosition

            if (progress < 1) {
                frameId = requestAnimationFrame(step)
            }
        }

        frameId = requestAnimationFrame(step)

        return () => cancelAnimationFrame(frameId)
    }, [targetPosition])

    return animatedPosition
}

function TrackingMap({ route, truck, compact = false, heading = 'Live Tracking' }) {
    if (!route) {
        return <div className="panel">Route unavailable.</div>
    }

    const origin = [route.origin.lat, route.origin.lng]
    const destination = [route.destination.lat, route.destination.lng]
    const routePolyline = Array.isArray(route.routePolyline) ? route.routePolyline : []
    const routePositions = routePolyline.length > 1
        ? routePolyline.map((point) => [point.lat, point.lng])
        : [origin, destination]
    const truckPosition =
        truck?.currentLat !== null &&
            truck?.currentLat !== undefined &&
            truck?.currentLng !== null &&
            truck?.currentLng !== undefined
            ? [truck.currentLat, truck.currentLng]
            : null
    const animatedTruckPosition = useAnimatedPosition(truckPosition)

    const center = animatedTruckPosition || routePositions[0] || origin

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
                {animatedTruckPosition && (
                    <CircleMarker
                        center={animatedTruckPosition}
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
