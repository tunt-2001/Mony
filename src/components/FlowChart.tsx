import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, Cell, CartesianGrid, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import type { Bucket } from '../lib/stats';
import { dayLabel, formatShort, formatVnd } from '../lib/format';
import { IconIn, IconOut } from './Icons';

interface Props {
  buckets: Bucket[];
  monthly: boolean;
}

/** Index of the most recent bucket with any money moving, else the last one. */
function lastActive(buckets: Bucket[]): number {
  for (let i = buckets.length - 1; i >= 0; i--) if (buckets[i].income || buckets[i].spent) return i;
  return buckets.length - 1;
}

/**
 * Money in above the zero line, money out below it: one column per day, so bars stay
 * twice as wide as side-by-side pairs. Tapping a column fills the readout above the
 * chart instead of a floating tooltip that covers the bars on a phone.
 */
export function FlowChart({ buckets, monthly }: Props) {
  const [selected, setSelected] = useState(() => lastActive(buckets));
  // Dim the other columns only once the user has picked one; before that the
  // readout just shows the latest day and every bar stays at full strength.
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    setSelected(lastActive(buckets));
    setTouched(false);
  }, [buckets]);

  const data = useMemo(() => buckets.map((b) => ({ ...b, out: -b.spent })), [buckets]);
  const sel = buckets[selected] ?? buckets[buckets.length - 1];
  const tickEvery = Math.max(0, Math.ceil(buckets.length / 6) - 1);

  const pick = (state: { activeTooltipIndex?: number | string | null } | null) => {
    const i = Number(state?.activeTooltipIndex);
    if (Number.isInteger(i) && i >= 0) {
      setSelected(i);
      setTouched(true);
    }
  };
  const cellClass = (i: number) => (touched && i !== selected ? 'dim' : '');

  return (
    <div className="flow">
      <div className="readout" aria-live="polite">
        <p className="readout-date">
          {monthly ? `Tháng ${Number(sel.key.slice(5))}/${sel.key.slice(0, 4)}` : dayLabel(sel.key)}
        </p>
        <div className="readout-values">
          <span className="readout-item in">
            <IconIn size={14} />
            <span className="num">{formatVnd(sel.income)}</span>
          </span>
          <span className="readout-item out">
            <IconOut size={14} />
            <span className="num">{formatVnd(sel.spent)}</span>
          </span>
        </div>
      </div>

      <div className="chart">
        <ResponsiveContainer width="100%" height={210}>
          <BarChart
            data={data}
            stackOffset="sign"
            margin={{ top: 6, right: 4, bottom: 0, left: 0 }}
            barCategoryGap="12%"
            onClick={pick}
            onMouseMove={pick}
          >
            <CartesianGrid vertical={false} className="grid" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              interval={tickEvery}
              tick={{ fontSize: 11 }}
              dy={4}
            />
            <YAxis
              tickFormatter={(v: number) => formatShort(Math.abs(v))}
              tickLine={false}
              axisLine={false}
              width={44}
              tick={{ fontSize: 11 }}
              tickCount={5}
            />
            <ReferenceLine y={0} className="zero" />
            <Bar dataKey="income" stackId="flow" className="bar-in" radius={[4, 4, 0, 0]} isAnimationActive={false}>
              {data.map((_, i) => (
                <Cell key={i} className={cellClass(i)} />
              ))}
            </Bar>
            <Bar dataKey="out" stackId="flow" className="bar-out" radius={[0, 0, 4, 4]} isAnimationActive={false}>
              {data.map((_, i) => (
                <Cell key={i} className={cellClass(i)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="chart-hint">Chạm vào cột để xem số liệu của {monthly ? 'tháng' : 'ngày'} đó</p>
    </div>
  );
}
