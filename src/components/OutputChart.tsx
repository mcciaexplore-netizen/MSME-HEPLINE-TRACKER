"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function OutputChart({ data }: { data: { name: string; scheduled: number; done: number }[] }) {
  if (!data.length) return <p className="py-10 text-center text-sm text-muted">No meetings scheduled or done in this period.</p>;
  return (
    <div className="mt-3 overflow-x-auto">
      <div style={{ minWidth: Math.max(480, data.length * 64), height: 300 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 48 }} barGap={2}>
            <CartesianGrid vertical={false} stroke="#e3e7ef" />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#5b6475" }} interval={0} angle={-35} textAnchor="end" height={60} tickLine={false} axisLine={{ stroke: "#e3e7ef" }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#5b6475" }} tickLine={false} axisLine={false} />
            <Tooltip cursor={{ fill: "#f5f7fb" }} contentStyle={{ borderRadius: 8, borderColor: "#e3e7ef", fontSize: 13 }} />
            <Legend verticalAlign="top" align="right" iconType="square" wrapperStyle={{ fontSize: 13, paddingBottom: 8 }} />
            <Bar dataKey="scheduled" name="Meetings scheduled" fill="#f08a24" radius={[3, 3, 0, 0]} />
            <Bar dataKey="done" name="Meetings done" fill="#1b3a7a" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
