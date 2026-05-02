import { Link } from 'react-router-dom'

const statusMeta = {
    PENDING: { label: 'Created', className: 'status-created' },
    ASSIGNED: { label: 'Assigned', className: 'status-assigned' },
    IN_TRANSIT: { label: 'In Transit', className: 'status-in-transit' },
    ARRIVED: { label: 'Delivered', className: 'status-delivered' }
}

function formatRelativeTime(value) {
    if (!value) {
        return 'N/A'
    }

    const diffMinutes = Math.round((Date.now() - new Date(value).getTime()) / 60000)

    if (diffMinutes < 1) {
        return 'just now'
    }

    if (diffMinutes < 60) {
        return `${diffMinutes}m ago`
    }

    const hours = Math.round(diffMinutes / 60)
    if (hours < 24) {
        return `${hours}h ago`
    }

    return `${Math.round(hours / 24)}d ago`
}

function ShipmentList({
    shipments,
    trucks,
    onAssign,
    newTruckLabel,
    onNewTruckLabelChange,
    onCreateTruck,
    filters,
    onFiltersChange,
    summary,
    lastSyncedAt
}) {
    const updateFilters = (patch) => {
        onFiltersChange((prev) => ({ ...prev, ...patch }))
    }

    const currentTruckId = filters.truckId || 'all'

    return (
        <div className="panel">
            <div className="dashboard-header">
                <div>
                    <p className="eyebrow">Operations board</p>
                    <h2>Shipment dashboard</h2>
                </div>
                <div className="sync-meta">
                    <span>{summary.total} shipments</span>
                    <span>{summary.active} active</span>
                    <span>{summary.delayed} delayed</span>
                    <span>{summary.delivered} delivered</span>
                    <small>Synced {formatRelativeTime(lastSyncedAt)}</small>
                </div>
            </div>

            <div className="filter-bar">
                <input
                    type="search"
                    value={filters.query}
                    onChange={(event) => updateFilters({ query: event.target.value })}
                    placeholder="Search shipment ID, truck, origin, destination"
                />
                <select value={filters.status} onChange={(event) => updateFilters({ status: event.target.value })}>
                    <option value="all">All statuses</option>
                    <option value="created">Created</option>
                    <option value="assigned">Assigned</option>
                    <option value="in_transit">In transit</option>
                    <option value="delivered">Delivered</option>
                </select>
                <select value={currentTruckId} onChange={(event) => updateFilters({ truckId: event.target.value })}>
                    <option value="all">All trucks</option>
                    {trucks.map((truck) => (
                        <option key={truck.id} value={String(truck.id)}>
                            {truck.label}
                        </option>
                    ))}
                </select>
                <select value={filters.timeRange} onChange={(event) => updateFilters({ timeRange: event.target.value })}>
                    <option value="all">All time</option>
                    <option value="24h">Last 24h</option>
                    <option value="7d">Last 7d</option>
                </select>
            </div>

            <form className="filter-bar" onSubmit={onCreateTruck}>
                <input
                    type="text"
                    value={newTruckLabel}
                    onChange={(event) => onNewTruckLabelChange(event.target.value)}
                    placeholder="Create truck label (example: TR-201)"
                    minLength={2}
                    required
                />
                <button type="submit">Create truck</button>
            </form>

            {!trucks.length && (
                <div className="empty-state compact">
                    <h3>No trucks in database.</h3>
                    <p>Create at least one truck to enable assignment and live movement.</p>
                </div>
            )}

            <div className="quick-filter-row">
                <button type="button" className={filters.quick === 'all' ? 'pill active' : 'pill'} onClick={() => updateFilters({ quick: 'all' })}>
                    All
                </button>
                <button type="button" className={filters.quick === 'active' ? 'pill active' : 'pill'} onClick={() => updateFilters({ quick: 'active' })}>
                    Active
                </button>
                <button type="button" className={filters.quick === 'delayed' ? 'pill active' : 'pill'} onClick={() => updateFilters({ quick: 'delayed' })}>
                    Delayed
                </button>
            </div>

            {!shipments.length ? (
                <div className="empty-state">
                    <h3>No shipments match the current filters.</h3>
                    <p>Clear a filter or create a new shipment to populate the lifecycle board.</p>
                </div>
            ) : (
                <div className="shipment-table" role="table" aria-label="Shipment dashboard">
                    <div className="shipment-table-head" role="row">
                        <span>Shipment</span>
                        <span>Status</span>
                        <span>Truck</span>
                        <span>ETA</span>
                        <span>Last update</span>
                        <span>Actions</span>
                    </div>
                    {shipments.map((shipment) => {
                        const statusInfo = statusMeta[shipment.status] || statusMeta.PENDING
                        const assignedTruck = shipment.assignedTruck
                        const lastUpdate = shipment.updatedAt || shipment.createdAt
                        const etaText = shipment.etaMinutes !== null && shipment.etaMinutes !== undefined
                            ? `${shipment.etaMinutes} min`
                            : 'Pending'

                        return (
                            <article key={shipment.id} className="shipment-row" role="row">
                                <Link to={`/shipments/${shipment.id}`} className="shipment-row-main">
                                    <p className="meta">Shipment #{shipment.id}</p>
                                    <h3>
                                        {shipment.originLabel || 'Origin pending'}
                                        <span>→</span>
                                        {shipment.destinationLabel || 'Destination pending'}
                                    </h3>
                                    <p>{shipment.isPaused ? 'Paused' : 'Live tracking enabled'}</p>
                                </Link>

                                <div className="shipment-cell">
                                    <span className={`status-badge ${statusInfo.className}`}>{statusInfo.label}</span>
                                    {shipment.isPaused && <span className="status-badge status-paused">Paused</span>}
                                </div>

                                <div className="shipment-cell">
                                    <strong>{assignedTruck ? assignedTruck.label : 'Unassigned'}</strong>
                                    <small>{assignedTruck ? assignedTruck.status : 'Ready for dispatch'}</small>
                                </div>

                                <div className="shipment-cell">
                                    <strong>{etaText}</strong>
                                    <small>{shipment.estimatedAt ? new Date(shipment.estimatedAt).toLocaleTimeString() : 'Awaiting route'}</small>
                                </div>

                                <div className="shipment-cell">
                                    <strong>{formatRelativeTime(lastUpdate)}</strong>
                                    <small>{new Date(lastUpdate).toLocaleString()}</small>
                                </div>

                                <div className="shipment-actions">
                                    <select
                                        defaultValue=""
                                        onChange={(event) => {
                                            const value = Number(event.target.value)
                                            if (value) {
                                                onAssign(shipment.id, value)
                                                event.target.value = ''
                                            }
                                        }}
                                        disabled={shipment.status === 'ARRIVED' || !trucks.length}
                                    >
                                        <option value="">Assign truck</option>
                                        {trucks.map((truck) => (
                                            <option key={truck.id} value={truck.id}>
                                                {truck.label} ({truck.status})
                                            </option>
                                        ))}
                                    </select>
                                    <Link to={`/shipments/${shipment.id}`}>Open</Link>
                                </div>
                            </article>
                        )
                    })}
                </div>
            )}
        </div>
    )
}

export default ShipmentList
