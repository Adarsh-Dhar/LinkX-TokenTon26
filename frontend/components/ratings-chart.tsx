"use client";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

export default function RatingsChart({ ratings }: { ratings: { time: string, rating: number }[] }) {
  if (!ratings || ratings.length === 0) return null;
  
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const hoveredAverage = Number(payload[0].value).toFixed(2);
      return (
        <div className="bg-card border border-border p-3 rounded shadow-lg">
          <p className="text-white text-sm font-medium">Time: {payload[0].payload.time}</p>
          <p className="text-emerald-400 text-lg font-bold">Average Score: {hoveredAverage}/10</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={ratings}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="time" />
          <YAxis domain={[0, 10]} />
          <Tooltip content={<CustomTooltip />} />
          <Line 
            type="monotone" 
            dataKey="rating" 
            stroke="#10b981" 
            strokeWidth={2} 
            dot={{ r: 5, fill: '#10b981', strokeWidth: 2, stroke: '#065f46' }} 
            activeDot={{ r: 7, fill: '#34d399', stroke: '#065f46', strokeWidth: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
