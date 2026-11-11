import {
  Bar,
  BarChart,
  CartesianGrid,
  Rectangle,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { formatMoney } from "@/lib/money"
import { formatMonth, monthAbbreviation } from "@/lib/months"

const config = {
  spent: { label: "Spent", color: "var(--chart-bar)" },
} satisfies ChartConfig

const tick = { fill: "var(--muted-foreground)", fontSize: 14 }

/** Even axis steps (1, 2, 2.5, or 5 times a power of ten dollars) reaching `max` cents. */
export function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0]
  const rough = max / 100 / count
  const power = 10 ** Math.floor(Math.log10(rough))
  const step =
    ([1, 2, 2.5, 5, 10].find((m) => m * power >= rough) ?? 10) * power * 100
  const steps = Math.ceil(max / step)
  return Array.from({ length: steps + 1 }, (_, i) => i * step)
}

/**
 * Monthly spending as bars, with a dashed line at the average (named in the
 * caption). The month in progress is drawn lighter, since it isn't over.
 */
export function SpendingChart({
  months,
  average,
  current,
}: {
  months: { month: string; spent: number }[]
  average: number
  /** The month in progress, if it's shown. */
  current?: string
}) {
  const ticks = niceTicks(Math.max(average, ...months.map((m) => m.spent)))
  const spansYears =
    months.length > 0 &&
    months[0].month.slice(0, 4) !== months.at(-1)!.month.slice(0, 4)
  const label = (month: string, index: number) =>
    spansYears && (index === 0 || month.endsWith("-01"))
      ? `${monthAbbreviation(month)} '${month.slice(2, 4)}`
      : monthAbbreviation(month)
  return (
    <ChartContainer config={config} className="aspect-auto h-56 w-full">
      <BarChart
        title="Spending each month"
        desc={`Monthly spending, with the ${formatMoney(average, { whole: true })} monthly average marked. Use the arrow keys to step through the months.`}
        data={months}
        margin={{ top: 8, right: 8, left: 8, bottom: 0 }}
        barCategoryGap="20%"
      >
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="month"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          interval="equidistantPreserveStart"
          tick={tick}
          tickFormatter={label}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={56}
          tick={tick}
          ticks={ticks}
          domain={[0, ticks.at(-1)!]}
          tickFormatter={(cents: number) => formatMoney(cents, { whole: true })}
        />
        <ChartTooltip
          cursor={{ fill: "var(--muted)", opacity: 0.5 }}
          content={
            <ChartTooltipContent
              labelFormatter={(_, payload) => {
                const month = String(payload?.[0]?.payload?.month ?? "")
                return month === current
                  ? `${formatMonth(month, "long")} so far`
                  : formatMonth(month, "long")
              }}
              formatter={(value) => (
                <span className="font-medium tabular-nums">
                  {formatMoney(Number(value))}
                </span>
              )}
            />
          }
        />
        <ReferenceLine
          y={average}
          stroke="var(--foreground)"
          strokeOpacity={0.6}
          strokeDasharray="4 4"
          strokeWidth={1}
        />
        <Bar
          dataKey="spent"
          fill="var(--color-spent)"
          radius={[4, 4, 0, 0]}
          maxBarSize={24}
          shape={(props) => (
            <Rectangle
              {...props}
              fillOpacity={props.payload?.month === current ? 0.3 : 1}
              stroke={
                props.payload?.month === current
                  ? "var(--color-spent)"
                  : undefined
              }
              strokeDasharray={
                props.payload?.month === current ? "3 2" : undefined
              }
            />
          )}
        />
      </BarChart>
    </ChartContainer>
  )
}
