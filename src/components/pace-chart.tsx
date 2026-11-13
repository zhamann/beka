import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceDot,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts"

import { niceTicks } from "@/components/spending-chart"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { formatMoney } from "@/lib/money"
import { monthAbbreviation } from "@/lib/months"

const config = {
  spent: { label: "This month", color: "var(--spending)" },
  usual: { label: "A usual month", color: "var(--muted-foreground)" },
} satisfies ChartConfig

const tick = { fill: "var(--muted-foreground)", fontSize: 14 }

/**
 * This month's spending building up day by day, against how a usual month
 * builds up (dotted). The line stops at today; the rule from it to the usual
 * line is how far under or over the month is running.
 */
export function PaceChart({
  month,
  day,
  days,
  spent,
  usual,
}: {
  /** The month in progress, as `YYYY-MM`. */
  month: string
  day: number
  days: number
  /** Cents spent by the end of each day so far. */
  spent: number[]
  /** Cents usually spent by the end of each day, or none without history. */
  usual: number[]
}) {
  const name = monthAbbreviation(month)
  // Day 0 is the month's start, so both lines rise from nothing.
  const data = Array.from({ length: days + 1 }, (_, index) => ({
    day: index,
    spent: index === 0 ? 0 : index <= day ? spent[index - 1] : undefined,
    usual: usual.length ? (index === 0 ? 0 : usual[index - 1]) : undefined,
  }))
  const now = spent.at(-1) ?? 0
  const usualNow = usual[day - 1]
  const ticks = niceTicks(Math.max(now, usual.at(-1) ?? 0, 100))
  const dayTicks = [1, 8, 15, 22, days].filter(
    (d, index, all) => index === all.length - 1 || all.at(-1)! - d >= 3
  )
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm" aria-hidden="true">
        <li className="flex items-center gap-2">
          <span className="h-0.5 w-5 rounded-full bg-spending" />
          This month
        </li>
        {usual.length > 0 && (
          <li className="flex items-center gap-2 text-muted-foreground">
            <span className="w-5 border-t-2 border-dotted border-muted-foreground" />
            A usual month
          </li>
        )}
      </ul>
      <ChartContainer
        config={config}
        className="aspect-auto h-52 w-full md:h-64"
      >
        <ComposedChart
          title="Spending so far this month"
          desc={
            usualNow === undefined
              ? `${formatMoney(now, { whole: true })} spent by ${name} ${day}. Use the arrow keys to step through the days.`
              : `${formatMoney(now, { whole: true })} spent by ${name} ${day}, against ${formatMoney(usualNow, { whole: true })} by this day in a usual month. Use the arrow keys to step through the days.`
          }
          data={data}
          margin={{ top: 8, right: 12, left: 8, bottom: 0 }}
        >
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="day"
            type="number"
            domain={[0, days]}
            ticks={dayTicks}
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            tick={tick}
            tickFormatter={(d: number) => (d === 1 ? `${name} 1` : String(d))}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={56}
            tick={tick}
            ticks={ticks}
            domain={[0, ticks.at(-1)!]}
            tickFormatter={(cents: number) =>
              formatMoney(cents, { whole: true })
            }
          />
          <ChartTooltip
            content={
              <ChartTooltipContent
                indicator="line"
                labelFormatter={(_, payload) => {
                  const d = Number(payload?.[0]?.payload?.day ?? 0)
                  return d === 0 ? `${name} 1, start of day` : `${name} ${d}`
                }}
                formatter={(value, key) => (
                  <span className="flex flex-1 items-center justify-between gap-4">
                    <span className="text-muted-foreground">
                      {config[key as keyof typeof config]?.label}
                    </span>
                    <span className="font-medium tabular-nums">
                      {formatMoney(Number(value), { whole: true })}
                    </span>
                  </span>
                )}
              />
            }
          />
          <Line
            dataKey="usual"
            type="monotone"
            stroke="var(--color-usual)"
            strokeWidth={2}
            strokeDasharray="1 5"
            strokeLinecap="round"
            dot={false}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
          />
          <Area
            dataKey="spent"
            type="linear"
            stroke="var(--color-spent)"
            strokeWidth={2.5}
            fill="var(--color-spent)"
            fillOpacity={0.12}
            dot={false}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
          />
          {usualNow !== undefined && usualNow !== now && (
            <ReferenceLine
              segment={[
                { x: day, y: now },
                { x: day, y: usualNow },
              ]}
              stroke="var(--foreground)"
              strokeOpacity={0.5}
              strokeWidth={1}
            />
          )}
          <ReferenceDot
            x={day}
            y={now}
            r={5}
            fill="var(--color-spent)"
            stroke="var(--card)"
            strokeWidth={2}
          />
        </ComposedChart>
      </ChartContainer>
    </div>
  )
}
