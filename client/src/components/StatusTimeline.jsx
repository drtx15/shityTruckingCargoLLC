function formatTimestamp(value) {
    return value ? new Date(value).toLocaleString() : 'Unknown time'
}

function StatusTimeline({ checkpoints, tracking, activityFeed = [] }) {
    const entries = activityFeed.length ? activityFeed : (checkpoints || []).map((checkpoint) => ({
        id: checkpoint.id,
        title: checkpoint.type.replace('_', ' '),
        detail: `${checkpoint.lat.toFixed(4)}, ${checkpoint.lng.toFixed(4)}`,
        timestamp: checkpoint.timestamp
    }))
    const hasEntries = Boolean(entries.length)

    return (
        <div className="panel">
            <div className="timeline-header">
                <div>
                    <p className="eyebrow">Event stream</p>
                    <h2>Status timeline</h2>
                </div>
                {tracking?.isPaused && <span className="status-badge status-paused">Paused</span>}
            </div>
            {!hasEntries ? (
                <div className="empty-state compact">
                    <h3>No checkpoints yet.</h3>
                    <p>Movement events will appear here once the truck departs.</p>
                </div>
            ) : (
                <ul className="timeline">
                    {entries.map((event) => (
                        <li key={event.id}>
                            <strong>{event.title}</strong>
                            <span>{formatTimestamp(event.timestamp)}</span>
                            <small>{event.detail}</small>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    )
}

export default StatusTimeline
