import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { formatDate, formatShortDate } from "@/lib/dates"
import { formatMoney } from "@/lib/money"

const config = {
  amount: { label: "Balance", color: "var(--chart-1)" },
} satisfies ChartConfig

const tick = { fill: "var(--muted-foreground)", fontSize: 14 }

/** An account's recorded balances over time, oldest on the left. */
export function BalanceChart({
  balances,
}: {
  balances: { asOf: string; amount: number }[]
}) {
  const points = [...balances].sort((a, b) => a.asOf.localeCompare(b.asOf))
  return (
    <ChartContainer config={config} className="aspect-auto h-48 w-full">
      <LineChart
        title="Balance over time"
        desc="Each recorded balance, oldest first. Use the arrow keys to step through them."
        data={points}
        margin={{ top: 8, right: 8, left: 8, bottom: 0 }}
      >
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="asOf"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={16}
          tick={tick}
          tickFormatter={formatShortDate}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={72}
          tick={tick}
          domain={["auto", "auto"]}
          tickFormatter={(cents: number) => formatMoney(cents, { whole: true })}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(_, payload) =>
                formatDate(String(payload?.[0]?.payload?.asOf ?? ""))
              }
              formatter={(value) => (
                <span className="font-medium tabular-nums">
                  {formatMoney(Number(value))}
                </span>
              )}
            />
          }
        />
        <Line
          dataKey="amount"
          type="monotone"
          stroke="var(--color-amount)"
          strokeWidth={2}
          dot={{ r: 3, fill: "var(--color-amount)" }}
        />
      </LineChart>
    </ChartContainer>
  )
}
