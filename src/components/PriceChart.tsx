"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import type { Bar } from "@/lib/alpaca/marketData";

export function PriceChart({ bars }: { bars: Bar[] }) {
  const data = bars.map((bar) => ({
    date: new Date(bar.t).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    }),
    close: bar.c,
  }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-zinc-200 dark:stroke-zinc-800" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11 }}
          minTickGap={30}
          stroke="currentColor"
          className="text-zinc-500"
        />
        <YAxis
          domain={["auto", "auto"]}
          tick={{ fontSize: 11 }}
          width={50}
          stroke="currentColor"
          className="text-zinc-500"
        />
        <Tooltip
          formatter={(value) => [`$${Number(value).toFixed(2)}`, "Close"]}
          contentStyle={{ fontSize: 12 }}
        />
        <Line type="monotone" dataKey="close" stroke="#2563eb" dot={false} strokeWidth={1.5} />
      </LineChart>
    </ResponsiveContainer>
  );
}
