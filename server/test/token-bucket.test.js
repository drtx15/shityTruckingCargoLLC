const assert = require('node:assert/strict')
const test = require('node:test')
const { TokenBucket } = require('../src/system-components/token-bucket')

test('token bucket allows burst up to capacity', () => {
    let now = 0
    const bucket = new TokenBucket({ capacity: 3, refillPerSecond: 1, now: () => now })
    let state = bucket.makeInitialState()

    for (let i = 0; i < 3; i += 1) {
        const result = bucket.tryRemove(state)
        assert.equal(result.allowed, true)
        state = result.state
    }

    const blocked = bucket.tryRemove(state)
    assert.equal(blocked.allowed, false)
    assert.equal(blocked.retryAfterSeconds, 1)
})

test('token bucket refills over time', () => {
    let now = 0
    const bucket = new TokenBucket({ capacity: 2, refillPerSecond: 1, now: () => now })
    let state = bucket.tryRemove(bucket.makeInitialState(), 2).state

    now = 1000
    const oneToken = bucket.tryRemove(state)
    assert.equal(oneToken.allowed, true)
    state = oneToken.state

    const blocked = bucket.tryRemove(state)
    assert.equal(blocked.allowed, false)
})
