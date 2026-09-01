import { afterEach, describe, expect, it } from 'vitest'
import handler from '../server/apiHandler'
import { adviceRequestFixture } from '../server/advice.fixture'

function responseRecorder() {
  let body = ''
  const headers = new Map<string, string>()
  return {
    response: {
      statusCode: 200,
      setHeader(name: string, value: string) { headers.set(name, value) },
      end(chunk?: string) { body = chunk ?? '' },
    },
    result: () => ({ body, headers }),
  }
}

const originalCode = process.env.DEMO_ACCESS_CODE
const originalKey = process.env.DEEPSEEK_API_KEY

afterEach(() => {
  process.env.DEMO_ACCESS_CODE = originalCode
  process.env.DEEPSEEK_API_KEY = originalKey
})

describe('POST /api/advice', () => {
  it('口令错误返回 401', async () => {
    process.env.DEMO_ACCESS_CODE = 'correct'
    const recorder = responseRecorder()
    await handler({ method: 'POST', body: adviceRequestFixture } as never, recorder.response as never)
    expect(recorder.response.statusCode).toBe(401)
    expect(JSON.parse(recorder.result().body).error).toContain('口令错误')
  })

  it('输入不合法返回 422', async () => {
    process.env.DEMO_ACCESS_CODE = 'correct'
    const recorder = responseRecorder()
    await handler({ method: 'POST', body: { accessCode: 'correct' } } as never, recorder.response as never)
    expect(recorder.response.statusCode).toBe(422)
  })

  it('合法口令但未配置 Key 时返回规则降级且主流程可用', async () => {
    process.env.DEMO_ACCESS_CODE = 'demo-code'
    delete process.env.DEEPSEEK_API_KEY
    const recorder = responseRecorder()
    await handler({ method: 'POST', body: adviceRequestFixture } as never, recorder.response as never)
    const payload = JSON.parse(recorder.result().body)
    expect(recorder.response.statusCode).toBe(200)
    expect(payload.mode).toBe('rule_fallback')
    expect(payload.meta.fallbackReason).toBe('api_key_missing')
  })
})
