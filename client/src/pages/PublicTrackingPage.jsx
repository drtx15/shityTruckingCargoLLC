import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getPublicTracking, openTrackingSocket } from '../api'
import MetricStrip from '../components/MetricStrip'
import StatusIndicator from '../components/StatusIndicator'
import StatusTimeline from '../components/StatusTimeline'
import { ClockIcon, FlagIcon, SignalIcon, TruckIcon } from '../components/IconControls'
import TrackingMap from '../map/TrackingMap'

function PublicTrackingPage() {
    const { trackingCode } = useParams()
    const [tracking, setTracking] = useState(null)
    const [liveState, setLiveState] = useState('Connecting')
    const [error, setError] = useState('')

    useEffect(() => {
        let active = true
        let socket
        const load = () => {
            getPublicTracking(trackingCode)
                .then((data) => {
                    if (active) {
                        setTracking(data)
                        setError('')
                    }
                })
                .catch((err) => active && setError(err.message))
        }

        load()
        const timer = setInterval(load, 1000)

        socket = openTrackingSocket({
            trackingCode,
            onMessage: (event) => {
                if (!active) {
                    return
                }
                if (event.type === 'error') {
                    setLiveState(event.message || 'Live tracking unavailable')
                    return
                }
                setLiveState('Live')
                setTracking(event.payload)
            },
            onError: (err) => active && setLiveState(err.message)
        })

        return () => {
            active = false
            clearInterval(timer)
            socket?.close()
        }
    }, [trackingCode])

    if (error) return <p className="error-text">{error}</p>
    if (!tracking) return <p>Loading public tracking...</p>
    const isLive = liveState === 'Live'

    return (
        <section className="detail-grid public-tracking">
            <div className="panel detail-summary">
                <div className="detail-summary-head">
                    <div>
                        <p className="eyebrow">{tracking.trackingCode}</p>
                        <h2>{tracking.originLabel || 'Origin'} <span>→</span> {tracking.destinationLabel || 'Destination'}</h2>
                    </div>
                    <StatusIndicator label={liveState} className="status-in-transit" />
                </div>
                <MetricStrip
                    items={[
                        { label: 'Stream', value: liveState, icon: SignalIcon, state: isLive ? 'live' : 'warn' },
                        { label: 'Priority', value: tracking.priority, icon: FlagIcon },
                        { label: 'ETA', value: `${tracking.etaMinutes ?? 'Pending'} min`, icon: ClockIcon },
                        { label: 'Truck', value: tracking.truck?.label || 'Pending assignment', icon: TruckIcon }
                    ]}
                />
            </div>
            <TrackingMap route={tracking.route} truck={tracking.truck} heading="Public route map" />
            <StatusTimeline checkpoints={tracking.checkpoints || []} tracking={tracking} activityFeed={[]} />
        </section>
    )
}

export default PublicTrackingPage
