import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getPublicTracking, openTrackingSocket } from '../api'
import StatusTimeline from '../components/StatusTimeline'
import TrackingMap from '../map/TrackingMap'

function PublicTrackingPage() {
    const { trackingCode } = useParams()
    const [tracking, setTracking] = useState(null)
    const [liveState, setLiveState] = useState('Connecting')
    const [error, setError] = useState('')

    useEffect(() => {
        let socket
        getPublicTracking(trackingCode)
            .then(setTracking)
            .catch((err) => setError(err.message))

        socket = openTrackingSocket({
            trackingCode,
            onMessage: (event) => {
                if (event.type === 'error') {
                    setLiveState(event.message || 'Live tracking unavailable')
                    return
                }
                setLiveState('Live')
                setTracking(event.payload)
            },
            onError: (err) => setLiveState(err.message)
        })

        return () => socket?.close()
    }, [trackingCode])

    if (error) return <p className="error-text">{error}</p>
    if (!tracking) return <p>Loading public tracking...</p>

    return (
        <section className="detail-grid public-tracking">
            <div className="panel detail-summary">
                <div className="detail-summary-head">
                    <div>
                        <p className="eyebrow">{tracking.trackingCode}</p>
                        <h2>{tracking.originLabel || 'Origin'} <span>→</span> {tracking.destinationLabel || 'Destination'}</h2>
                    </div>
                    <span className="status-badge status-in-transit">{liveState}</span>
                </div>
                <div className="metrics-grid">
                    <div className="metric-card"><span>Status</span><strong>{tracking.status}</strong></div>
                    <div className="metric-card"><span>Priority</span><strong>{tracking.priority}</strong></div>
                    <div className="metric-card"><span>ETA</span><strong>{tracking.etaMinutes ?? 'Pending'} min</strong></div>
                    <div className="metric-card"><span>Truck</span><strong>{tracking.truck?.label || 'Pending assignment'}</strong></div>
                </div>
            </div>
            <TrackingMap route={tracking.route} truck={tracking.truck} heading="Public route map" />
            <StatusTimeline checkpoints={tracking.checkpoints || []} tracking={tracking} activityFeed={[]} />
        </section>
    )
}

export default PublicTrackingPage
