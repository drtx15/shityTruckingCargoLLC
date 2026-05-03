const SLA_HOURS_BY_PRIORITY = {
    STANDARD: 72,
    EXPRESS: 36,
    URGENT: 12
}

const STOPPED_GRACE_MINUTES_BY_PRIORITY = {
    STANDARD: 20,
    EXPRESS: 12,
    URGENT: 6
}

function normalizePriority(value) {
    const normalized = typeof value === 'string' ? value.toUpperCase() : 'STANDARD'
    return SLA_HOURS_BY_PRIORITY[normalized] ? normalized : 'STANDARD'
}

function buildSlaDeadline(priority, from = new Date()) {
    const normalized = normalizePriority(priority)
    return new Date(from.getTime() + SLA_HOURS_BY_PRIORITY[normalized] * 60 * 60 * 1000)
}

function getStoppedGraceMinutes(priority) {
    return STOPPED_GRACE_MINUTES_BY_PRIORITY[normalizePriority(priority)]
}

function etaBreachesSla(estimatedAt, slaDeadline) {
    if (!estimatedAt || !slaDeadline) {
        return false
    }

    return new Date(estimatedAt).getTime() > new Date(slaDeadline).getTime()
}

module.exports = {
    buildSlaDeadline,
    etaBreachesSla,
    getStoppedGraceMinutes,
    normalizePriority
}
