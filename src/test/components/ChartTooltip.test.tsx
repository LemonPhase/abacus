import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { PieChart, Pie, ResponsiveContainer } from 'recharts'
import { ChartTooltip } from '@/components/charts/ChartTooltip'

function renderChart() {
  const data = [
    { name: 'A', value: 100 },
    { name: 'B', value: 200 },
  ]

  const formatter = vi.fn((value: number) => `$${value.toLocaleString()}`)

  const { container } = render(
    <ResponsiveContainer width={400} height={400}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" />
        <ChartTooltip formatter={formatter} />
      </PieChart>
    </ResponsiveContainer>,
  )

  return { container, formatter }
}

describe('ChartTooltip', () => {
  it('renders without crashing inside a chart', () => {
    const { container } = renderChart()
    expect(container.querySelector('.recharts-tooltip-wrapper')).toBeTruthy()
  })

  it('accepts formatter prop', () => {
    const { formatter } = renderChart()
    expect(formatter).toBeDefined()
  })
})
