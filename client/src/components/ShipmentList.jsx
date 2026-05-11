import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
    ArrowRightIcon,
    IconButton,
    IconLink,
    SearchIcon,
} from './IconControls'
import StatusIndicator from './StatusIndicator'

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
    className = '',
    detailBasePath = '/shipments',
    title = 'Shipment dashboard',
    shipments,
    filters,
    onFiltersChange,
}) {
    const [searchOpen, setSearchOpen] = useState(false)

    const updateFilters = (patch) => {
        onFiltersChange((prev) => ({ ...prev, ...patch }))
    }

    return (
        <div className={`panel ${className}`.trim()}>
            <div className="dashboard-header">
                <div>
                    <h2>{title}</h2>
                </div>
            </div>

            <div className="filter-bar">
                {searchOpen ? (
                    <div className="search-collapse is-open">
                        <input
                            type="search"
                            value={filters.query}
                            onChange={(event) => updateFilters({ query: event.target.value })}
                            placeholder="Search shipment ID, truck, origin, destination"
                            autoFocus
                        />
                        <select
                            className="status-select"
                            value={filters.status}
                            onChange={(event) => updateFilters({ status: event.target.value })}
                        >
                            <option value="all">All statuses</option>
                            <option value="PENDING">Created</option>
                            <option value="ASSIGNED">Assigned</option>
                            <option value="IN_TRANSIT">In transit</option>
                            <option value="DELAYED">Delayed</option>
                            <option value="ARRIVED">Delivered</option>
                        </select>
                        <IconButton
                            type="button"
                            icon={SearchIcon}
                            label="Collapse search"
                            className="icon-button--soft search-toggle-right"
                            onClick={() => setSearchOpen(false)}
                        />
                    </div>
                ) : (
                    <IconButton
                        type="button"
                        icon={SearchIcon}
                        label="Open search"
                        className="icon-button--soft search-toggle-right"
                        onClick={() => setSearchOpen(true)}
                    />
                )}
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
                        const assignedTruck = shipment.assignedTruck
                        const lastUpdate = shipment.updatedAt || shipment.createdAt
                        const etaText = shipment.etaMinutes !== null && shipment.etaMinutes !== undefined
                            ? `${shipment.etaMinutes} min`
                            : 'Pending'

                        return (
                            <article key={shipment.id} className="shipment-row" role="row">
                                <Link to={`${detailBasePath}/${shipment.id}`} className="shipment-row-main">
                                    <p className="meta">{shipment.trackingCode || `Shipment #${shipment.id}`}</p>
                                    <h3>
                                        {shipment.originLabel || 'Origin pending'}
                                        <span>→</span>
                                        {shipment.destinationLabel || 'Destination pending'}
                                    </h3>
                                    <p>{shipment.shipper?.companyName || (shipment.isPaused ? 'Paused' : 'Live tracking enabled')}</p>
                                </Link>

                                <div className="shipment-cell">
                                    <StatusIndicator status={shipment.status} />
                                    {shipment.isPaused && <StatusIndicator label="Paused" className="status-paused" />}
                                </div>

                                <div className="shipment-cell">
                                    <strong>{assignedTruck ? assignedTruck.label : 'Unassigned'}</strong>
                                </div>

                                <div className="shipment-cell">
                                    <strong>{etaText}</strong>
                                </div>

                                <div className="shipment-cell">
                                    <strong>{formatRelativeTime(lastUpdate)}</strong>
                                </div>

                                <div className="shipment-actions">
                                    <IconLink to={`${detailBasePath}/${shipment.id}`} icon={ArrowRightIcon} label={`Open shipment ${shipment.id}`} />
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
