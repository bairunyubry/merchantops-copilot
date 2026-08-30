import ReactECharts from 'echarts-for-react'
import type { DailyPoint } from '../lib/dashboard'

interface TrendChartProps {
  points: DailyPoint[]
  metric: 'netRevenue' | 'gmv' | 'orders' | 'refundOrderRate'
}

const metricMeta = {
  netRevenue: { label: '净收入', unit: '元' },
  gmv: { label: 'GMV', unit: '元' },
  orders: { label: '支付订单行', unit: '行' },
  refundOrderRate: { label: '退款率', unit: '%' },
} as const

export function TrendChart({ points, metric }: TrendChartProps) {
  const meta = metricMeta[metric]
  const data = points.map((point) => {
    const value = point[metric]
    if (value === null) return null
    return metric === 'refundOrderRate' ? Number((value * 100).toFixed(2)) : Number(value.toFixed(2))
  })
  const currentStart = Math.max(0, points.length - 7)

  return (
    <ReactECharts
      className="trend-chart"
      option={{
        animation: false,
        color: ['#5470c6'],
        grid: { left: 58, right: 28, top: 34, bottom: 45 },
        tooltip: {
          trigger: 'axis',
          backgroundColor: '#111827',
          borderWidth: 0,
          textStyle: { color: '#fff', fontSize: 12 },
          formatter: (params: Array<{ axisValue: string; value: number }>) => {
            const item = params[0]
            const formatted = metric === 'refundOrderRate'
              ? `${item.value.toFixed(2)}%`
              : new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 }).format(item.value)
            return `${item.axisValue}<br/>${meta.label}：${formatted} ${meta.unit}`
          },
        },
        xAxis: {
          type: 'category',
          boundaryGap: false,
          data: points.map((point) => point.date.slice(5)),
          axisLine: { lineStyle: { color: '#d7dde8' } },
          axisTick: { show: false },
          axisLabel: { color: '#7a8498', fontSize: 11, interval: 6 },
        },
        yAxis: {
          type: 'value',
          name: meta.unit,
          nameTextStyle: { color: '#8a94a6', padding: [0, 0, 0, -35] },
          splitLine: { lineStyle: { color: '#eef1f5' } },
          axisLabel: { color: '#7a8498', fontSize: 11 },
        },
        series: [
          {
            name: meta.label,
            type: 'line',
            smooth: 0.22,
            symbol: 'none',
            lineStyle: { width: 3, color: '#5978d4' },
            areaStyle: { color: 'rgba(89, 120, 212, 0.08)' },
            data,
            markLine: {
              silent: true,
              symbol: 'none',
              label: { formatter: '本期开始', color: '#7a8498', fontSize: 11 },
              lineStyle: { color: '#aab5c8', type: 'dashed' },
              data: [{ xAxis: points[currentStart]?.date.slice(5) }],
            },
          },
        ],
      }}
      opts={{ renderer: 'canvas' }}
    />
  )
}
