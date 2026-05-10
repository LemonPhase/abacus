import { Tooltip } from 'recharts'
import type { TooltipProps } from 'recharts'
import type { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent'

interface ChartTooltipProps extends Omit<
  TooltipProps<ValueType, NameType>,
  'content' | 'formatter'
> {
  formatter: (value: number) => string
}

export function ChartTooltip({ formatter, ...props }: ChartTooltipProps) {
  return (
    <Tooltip
      {...props}
      cursor={false}
      // isAnimationActive={false}
      content={({ active, payload, label }) => {
        if (!active || !payload?.length) return null
        return (
          <div className="rounded-xl border bg-popover px-3 py-2.5 text-popover-foreground shadow-lg">
            {label && <p className="mb-1.5 text-xs font-medium text-muted-foreground">{label}</p>}
            <div className="flex flex-col gap-1.5">
              {payload.map((entry, i) => {
                const value = entry.value as number
                if (value === undefined) return null
                return (
                  <div key={i} className="flex items-center gap-2.5">
                    <span
                      className="size-2.5 shrink-0 rounded-full ring-1 ring-inset ring-black/10 dark:ring-white/10"
                      style={{ backgroundColor: entry.color }}
                    />
                    <span className="flex-1 text-xs text-muted-foreground">{entry.name}</span>
                    <span className="text-sm font-semibold tabular-nums">{formatter(value)}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )
      }}
    />
  )
}
