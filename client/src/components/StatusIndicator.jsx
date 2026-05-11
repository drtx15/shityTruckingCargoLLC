const shipmentStatusMeta = {
    PENDING: { label: 'Created', className: 'status-created' },
    ASSIGNED: { label: 'Assigned', className: 'status-assigned' },
    IN_TRANSIT: { label: 'In transit', className: 'status-in-transit' },
    DELAYED: { label: 'Delayed', className: 'status-delayed' },
    CANCELLED: { label: 'Cancelled', className: 'status-paused' },
    ARRIVED: { label: 'Delivered', className: 'status-delivered' },
    IDLE: { label: 'Idle', className: 'status-created' },
    MOVING: { label: 'Moving', className: 'status-in-transit' },
    REST: { label: 'Rest', className: 'status-paused' },
    ACTIVE: { label: 'Active', className: 'status-delivered' },
    INACTIVE: { label: 'Inactive', className: 'status-paused' },
    ENABLED: { label: 'Enabled', className: 'status-delivered' },
    DISABLED: { label: 'Disabled', className: 'status-paused' },
    SUCCESS: { label: 'Success', className: 'status-delivered' },
    DELIVERED: { label: 'Delivered', className: 'status-delivered' },
    FAILED: { label: 'Failed', className: 'status-delayed' },
    RETRYING: { label: 'Retrying', className: 'status-paused' }
}

function StatusIndicator({ className = '', label, status }) {
    const meta = shipmentStatusMeta[status] || { label: label || status || 'Unknown', className: 'status-created' }
    const classes = ['status-badge', meta.className, className].filter(Boolean).join(' ')

    return <span className={classes}>{label || meta.label}</span>
}

export default StatusIndicator
