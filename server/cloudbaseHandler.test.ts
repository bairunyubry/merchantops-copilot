import { afterEach, describe, expect, it } from 'vitest'
import { adviceRequestFixture } from './advice.fixture'
import { main } from './cloudbaseHandler'

afterEach(() => {
  delete process.env.DEMO_ACCESS_CODE
})

describe('CloudBase HTTP adapter', () => {
  it('handles preflight requests', async () => {
    const result = await main({ httpMethod: 'OPTIONS', path: '/api/advice' })
    expect(result.statusCode).toBe(204)
  })

  it('rejects invalid JSON', async () => {
    const result = await main({ httpMethod: 'POST', path: '/api/advice', body: '{' })
    expect(result.statusCode).toBe(422)
  })

  it('requires server-side configuration', async () => {
    const result = await main({
      httpMethod: 'POST',
      path: '/api/advice',
      body: JSON.stringify(adviceRequestFixture),
    })
    expect(result.statusCode).toBe(503)
  })

  it('rejects a wrong access code before calling DeepSeek', async () => {
    process.env.DEMO_ACCESS_CODE = 'correct-code'
    const result = await main({
      httpMethod: 'POST',
      path: '/api/advice',
      body: JSON.stringify(adviceRequestFixture),
    })
    expect(result.statusCode).toBe(401)
  })
})
