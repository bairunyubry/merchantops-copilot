import type { AdviceRequest } from '../src/lib/ai'

export const adviceRequestFixture: AdviceRequest = {
  accessCode: 'demo-code',
  question: '今天有什么经营问题？',
  surface: 'overview',
  selectedFindingId: 'finding-refund',
  context: {
    store: {
      name: '青柚研究所', industry: '美妆个护', sourceName: '演示场景', sourceType: 'sample', isSynthetic: true,
      latestCompleteDate: '2026-08-30', period: { from: '2026-08-24', to: '2026-08-30' }, baselinePeriod: { from: '2026-08-17', to: '2026-08-23' },
    },
    metrics: {
      current: { gmv: 10000, netRevenue: 8500, orders: 100, conversionRate: 0.1, refundRate: 0.15, ship48hRate: 0.82 },
      baseline: { gmv: 12000, netRevenue: 11400, orders: 120, conversionRate: 0.12, refundRate: 0.05, ship48hRate: 0.94 },
      deltas: { gmvRatio: -0.1667, netRevenueRatio: -0.254, ordersRatio: -0.1667, conversionRatio: -0.1667, refundPp: 10, ship48hPp: -12 },
    },
    findings: [{
      id: 'finding-refund', rank: 1, category: 'refund', title: '洁面 SKU 退款率异常', severity: 'high', priorityScore: 88,
      metric: { label: '退款率', current: '15%', baseline: '5%', delta: '+10pp', threshold: '较基线增加至少 3pp' },
      relatedSkuId: 'SKU-001', relatedSkuName: '清透洁面乳', evidence: ['退款率由 5% 升至 15%'],
      caveat: '需核查退款原因与履约记录', ruleSuggestion: '核查高频退款原因并抽查履约记录。', verification: '观察行动后 7 日退款率是否回落。',
    }],
    actions: [], weeklyReview: null, dataQuality: { validRows: 360, skippedRows: 0, issues: [] },
  },
}
