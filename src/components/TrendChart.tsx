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
        color: ['#67d5ff'],
        grid: { left: 58, right: 28, top: 34, bottom: 45 },
        tooltip: {
          trigger: 'axis',
          backgroundColor: 'rgba(5, 18, 48, 0.94)',
          borderColor: 'rgba(113, 200, 255, 0.35)',
          borderWidth: 1,
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
          axisLine: { lineStyle: { color: 'rgba(155, 190, 230, 0.24)' } },
          axisTick: { show: false },
          axisLabel: { color: '#8fa8ca', fontSize: 11, interval: 6 },
        },
        yAxis: {
          type: 'value',
          name: meta.unit,
          nameTextStyle: { color: '#8fa8ca', padding: [0, 0, 0, -35] },
          splitLine: { lineStyle: { color: 'rgba(145, 181, 224, 0.12)' } },
          axisLabel: { color: '#8fa8ca', fontSize: 11 },
        },
        series: [
          {
            name: meta.label,
            type: 'line',
            smooth: 0.22,
            symbol: 'none',
            lineStyle: { width: 3, color: '#65d3ff', shadowColor: 'rgba(61, 194, 255, 0.42)', shadowBlur: 10 },
            areaStyle: { color: 'rgba(65, 181, 255, 0.14)' },
            data,
            markLine: {
              silent: true,
              symbol: 'none',
              label: { formatter: '本期开始', color: '#9bb3d3', fontSize: 11 },
              lineStyle: { color: 'rgba(154, 187, 225, 0.45)', type: 'dashed' },
              data: [{ xAxis: points[currentStart]?.date.slice(5) }],
            },
          },
        ],
      }}
      opts={{ renderer: 'canvas' }}
    />
  )
}
