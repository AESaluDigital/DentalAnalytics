"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type ValueFormat = "money" | "int" | "pct";

export interface Series {
  key: string;
  label: string;
  color: string;
}

function makeFormatter(format: ValueFormat, currency: string) {
  if (format === "money") {
    const f = new Intl.NumberFormat("pt-BR", { style: "currency", currency, maximumFractionDigits: 0 });
    return (v: number) => f.format(v);
  }
  if (format === "pct") return (v: number) => `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
  const f = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
  return (v: number) => f.format(v);
}

const compact = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });
const dayLabel = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

const axisProps = {
  stroke: "var(--axis)",
  tick: { fill: "var(--muted)", fontSize: 12 },
  tickLine: false,
} as const;

const tooltipStyle = {
  contentStyle: {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    color: "var(--ink)",
    fontSize: 13,
  },
  labelStyle: { color: "var(--ink-2)", fontWeight: 600 },
  itemStyle: { color: "var(--ink)" },
} as const;

/** Série temporal diária: 1 eixo, linhas de 2px, crosshair + tooltip. */
export function DailyLineChart({
  data,
  series,
  format,
  currency = "BRL",
  height = 260,
}: {
  data: object[];
  series: Series[];
  format: ValueFormat;
  currency?: string;
  height?: number;
}) {
  const fmt = makeFormatter(format, currency);
  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis dataKey="date" tickFormatter={dayLabel} minTickGap={24} {...axisProps} />
          <YAxis tickFormatter={(v: number) => compact.format(v)} width={48} axisLine={false} {...axisProps} />
          <Tooltip
            {...tooltipStyle}
            cursor={{ stroke: "var(--axis)", strokeWidth: 1 }}
            labelFormatter={(l) => dayLabel(String(l))}
            formatter={(v) => fmt(Number(v))}
          />
          {series.length > 1 && <Legend iconType="plainline" wrapperStyle={{ color: "var(--ink-2)", fontSize: 13 }} />}
          {series.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, stroke: "var(--surface)", strokeWidth: 2 }}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Barras diárias de uma série. */
export function DailyBarChart({
  data,
  dataKey,
  label,
  color,
  height = 220,
}: {
  data: object[];
  dataKey: string;
  label: string;
  color: string;
  height?: number;
}) {
  const fmt = makeFormatter("int", "BRL");
  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }} barCategoryGap={2}>
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis dataKey="date" tickFormatter={dayLabel} minTickGap={24} {...axisProps} />
          <YAxis tickFormatter={(v: number) => compact.format(v)} width={48} axisLine={false} allowDecimals={false} {...axisProps} />
          <Tooltip
            {...tooltipStyle}
            cursor={{ fill: "var(--surface-2)" }}
            labelFormatter={(l) => dayLabel(String(l))}
            formatter={(v) => fmt(Number(v))}
          />
          <Bar dataKey={dataKey} name={label} fill={color} radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Barras horizontais por categoria (ex.: sessões por canal do GA4). */
export function CategoryBarChart({
  data,
  dataKey,
  categoryKey,
  label,
  color,
}: {
  data: object[];
  dataKey: string;
  categoryKey: string;
  label: string;
  color: string;
}) {
  const fmt = makeFormatter("int", "BRL");
  const height = Math.max(160, data.length * 32 + 24);
  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 24, bottom: 0, left: 8 }} barCategoryGap={4}>
          <CartesianGrid stroke="var(--grid)" horizontal={false} />
          <XAxis type="number" tickFormatter={(v: number) => compact.format(v)} {...axisProps} />
          <YAxis type="category" dataKey={categoryKey} width={140} axisLine={false} {...axisProps} />
          <Tooltip {...tooltipStyle} cursor={{ fill: "var(--surface-2)" }} formatter={(v) => fmt(Number(v))} />
          <Bar dataKey={dataKey} name={label} fill={color} radius={[0, 4, 4, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Gráfico principal: investimento e CPL (linhas, eixo R$) + conversões (barras, eixo direito). */
export function SpendConvCplChart({
  data,
  currency = "BRL",
  height = 300,
  colors,
}: {
  data: { date: string; spend: number; conversions: number; cpl: number | null }[];
  currency?: string;
  height?: number;
  colors: { spend: string; conversions: string; cpl: string };
}) {
  const money = makeFormatter("money", currency);
  const moneyFine = new Intl.NumberFormat("pt-BR", { style: "currency", currency });
  const ints = makeFormatter("int", currency);
  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap={3}>
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis dataKey="date" tickFormatter={dayLabel} minTickGap={24} {...axisProps} />
          <YAxis yAxisId="money" tickFormatter={(v: number) => compact.format(v)} width={52} axisLine={false} {...axisProps} />
          <YAxis yAxisId="conv" orientation="right" tickFormatter={(v: number) => compact.format(v)} width={40}
            axisLine={false} allowDecimals={false} {...axisProps} />
          {/* CPL tem escala própria (valores bem menores que o investimento); eixo oculto, valor no tooltip. */}
          <YAxis yAxisId="cpl" hide domain={[0, (max: number) => max * 1.15]} />
          <Tooltip
            {...tooltipStyle}
            cursor={{ fill: "var(--surface-2)" }}
            labelFormatter={(l) => dayLabel(String(l))}
            formatter={(v, name) => {
              if (v === null || v === undefined) return ["—", name];
              if (name === "Conversões") return [ints(Number(v)), name];
              return [name === "CPL" ? moneyFine.format(Number(v)) : money(Number(v)), name];
            }}
          />
          <Legend wrapperStyle={{ color: "var(--ink-2)", fontSize: 13 }} />
          <Bar yAxisId="conv" dataKey="conversions" name="Conversões" fill={colors.conversions} fillOpacity={0.55}
            radius={[4, 4, 0, 0]} isAnimationActive={false} />
          <Line yAxisId="money" type="monotone" dataKey="spend" name="Investimento" stroke={colors.spend} strokeWidth={2.5}
            dot={false} activeDot={{ r: 4, stroke: "var(--surface)", strokeWidth: 2 }} isAnimationActive={false} />
          <Line yAxisId="cpl" type="monotone" dataKey="cpl" name="CPL" stroke={colors.cpl} strokeWidth={2}
            strokeDasharray="5 4" dot={false} connectNulls activeDot={{ r: 4, stroke: "var(--surface)", strokeWidth: 2 }}
            isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
