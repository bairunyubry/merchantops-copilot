import ReactECharts from 'echarts-for-react'
import type { DiagnosisFinding } from '../lib/dashboard'

export function FindingTrendChart({ finding }: { finding: DiagnosisFinding }) {
  const values = finding.trend.map((point) => point.value)
  const numeric = values.filter((value): value is number => value !== null)
  const threshold = finding.trendThreshold
  const allValues = threshold === undefined ? numeric : [...numeric, threshold]
  const minimum = allValues.length === 0 ? 0 : Math.min(...allValues)
  const maximum = allValues.length === 0 ? 100 : Math.max(...allValues)
  const padding = Math.max((maximum - minimum) * 0.25, finding.trendUnit === '%' ? 2 : 1)

  return (
    <ReactECharts
      className="finding-trend-chart"
      option={{
        animation: false,
        tooltip: {
          trigger: 'axis',
          valueFormatter: (value: number) => `${value.toFixed(finding.trendUnit === '%' ? 2 : 0)}${finding.trendUnit}`,
        },
        grid: { left: 48, right: 20, top: 22, bottom: 32 },
        xAxis: {
          type: 'category',
          boundaryGap: false,
          data: finding.trend.map((point) => point.date.slice(5)),
          axisLabel: { color: '#8fa8ca', fontSize: 9, interval: 4 },
          axisLine: { lineStyle: { color: 'rgba(155, 190, 230, 0.24)' } },
        },
        yAxis: {
          type: 'value',
          min: Math.max(0, Math.floor(minimum - padding)),
          max: Math.ceil(maximum + padding),
          axisLabel: { color: '#8fa8ca', fontSize: 9, formatter: `{value}${finding.trendUnit}` },
          splitLine: { lineStyle: { color: 'rgba(145, 181, 224, 0.12)' } },
        },
        series: [{
          type: 'line',
          data: values,
          symbol: 'none',
          smooth: 0.18,
          lineStyle: { color: '#65d3ff', width: 2, shadowColor: 'rgba(61, 194, 255, 0.36)', shadowBlur: 8 },
          areaStyle: { color: 'rgba(65, 181, 255, 0.14)' },
          markLine: threshold === undefined ? undefined : {
            symbol: 'none',
            label: { formatter: `规则阈值 ${threshold.toFixed(1)}${finding.trendUnit}`, color: '#ff9ba9', fontSize: 9 },
            lineStyle: { color: '#ff7f91', type: 'dashed' },
            data: [{ yAxis: threshold }],
          },
        }],
      }}
      opts={{ renderer: 'canvas' }}
    />
  )
}
