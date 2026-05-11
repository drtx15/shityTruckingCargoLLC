function MetricStrip({ items }) {
    return (
        <dl className="metric-strip">
            {items.map((item) => {
                const Icon = item.icon
                const classes = [
                    'metric-strip-item',
                    item.tone ? `metric-${item.tone}` : '',
                    item.state ? `metric-state-${item.state}` : ''
                ].filter(Boolean).join(' ')

                return (
                    <div key={item.label} className={classes}>
                        {Icon && (
                            <span className="metric-strip-icon" aria-hidden="true">
                                <Icon />
                            </span>
                        )}
                        <div className="metric-strip-copy">
                            <dt>{item.label}</dt>
                            <dd>
                                {item.state && <span className="metric-state-dot" aria-hidden="true" />}
                                {item.value}
                            </dd>
                            {item.meta && <small>{item.meta}</small>}
                        </div>
                    </div>
                )
            })}
        </dl>
    )
}

export default MetricStrip
