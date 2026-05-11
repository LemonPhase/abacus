import { useCallback, useEffect, useState } from 'react'
import { getBudgetStatus, getBudgetColors } from '@/lib/budget'

interface BudgetGaugeProps {
  percentage: number
  spent: string
  total: string
  size?: number
}

export function BudgetGauge({ percentage, spent, total, size = 180 }: BudgetGaugeProps) {
  const strokeWidth = size * 0.08
  const radius = (size - strokeWidth) / 2
  const center = size / 2
  const circumference = 2 * Math.PI * radius

  const clampedPct = Math.max(0, percentage)
  const cappedPct = Math.min(clampedPct, 100)
  const isOver = clampedPct > 100

  const status = getBudgetStatus(clampedPct)
  const ringClass = getBudgetColors(status).text

  const [offset, setOffset] = useState(circumference)

  useEffect(() => {
    const timer = requestAnimationFrame(() => {
      setOffset(circumference * (1 - cappedPct / 100))
    })
    return () => cancelAnimationFrame(timer)
  }, [cappedPct, circumference])

  const formatPercent = useCallback((n: number) => {
    return `${Math.round(n)}%`
  }, [])

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="shrink-0"
      role="img"
      aria-label={`Budget usage: ${formatPercent(clampedPct)}`}
    >
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke="currentColor"
        className="text-muted"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke="currentColor"
        className={ringClass}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform={`rotate(-90 ${center} ${center})`}
        style={{ transition: 'stroke-dashoffset 0.8s cubic-bezier(0.4, 0, 0.2, 1)' }}
      />
      {isOver && (
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="currentColor"
          className={ringClass}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - (clampedPct % 100 || 100) / 100)}
          transform={`rotate(-90 ${center} ${center})`}
          style={{ transition: 'stroke-dashoffset 0.5s cubic-bezier(0.4, 0, 0.2, 1)' }}
          opacity={0.35}
        />
      )}
      <text
        x={center}
        y={center - size * 0.04}
        textAnchor="middle"
        dominantBaseline="middle"
        className="fill-foreground"
        style={{ fontSize: size * 0.18, fontWeight: 700 }}
      >
        {formatPercent(clampedPct)}
      </text>
      <text
        x={center}
        y={center + size * 0.16}
        textAnchor="middle"
        dominantBaseline="middle"
        className="fill-muted-foreground"
        style={{ fontSize: size * 0.08 }}
      >
        {spent} / {total}
      </text>
    </svg>
  )
}
