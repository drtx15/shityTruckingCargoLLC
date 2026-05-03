class TokenBucket {
    constructor({ capacity, refillPerSecond, now = () => Date.now() }) {
        if (capacity <= 0) {
            throw new Error('capacity must be positive')
        }

        if (refillPerSecond <= 0) {
            throw new Error('refillPerSecond must be positive')
        }

        this.capacity = capacity
        this.refillPerSecond = refillPerSecond
        this.now = now
    }

    makeInitialState() {
        return {
            tokens: this.capacity,
            updatedAt: this.now()
        }
    }

    refill(state) {
        const now = this.now()
        const elapsedSeconds = Math.max(0, (now - state.updatedAt) / 1000)
        const tokens = Math.min(this.capacity, state.tokens + elapsedSeconds * this.refillPerSecond)

        return {
            tokens,
            updatedAt: now
        }
    }

    tryRemove(state, cost = 1) {
        const nextState = this.refill(state || this.makeInitialState())

        if (nextState.tokens >= cost) {
            return {
                allowed: true,
                retryAfterSeconds: 0,
                state: {
                    tokens: nextState.tokens - cost,
                    updatedAt: nextState.updatedAt
                }
            }
        }

        const missingTokens = cost - nextState.tokens
        return {
            allowed: false,
            retryAfterSeconds: Math.ceil(missingTokens / this.refillPerSecond),
            state: nextState
        }
    }
}

module.exports = {
    TokenBucket
}
