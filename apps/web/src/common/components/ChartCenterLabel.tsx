interface ChartCenterLabelProps {
  totalBs: number;
}

export function ChartCenterLabel({ totalBs }: ChartCenterLabelProps) {
  return (
    <text
      x="50%"
      y="50%"
      textAnchor="middle"
      dominantBaseline="central"
    >
      <tspan x="50%" dy="-0.4em" className="fill-gray-700" style={{ fontSize: 13, fontWeight: 600 }}>Total</tspan>
      <tspan x="50%" dy="1.4em" className="fill-gray-900" style={{ fontSize: 14, fontWeight: 800 }}>
        {totalBs >= 1000 ? `${(totalBs / 1000).toFixed(1)}K` : totalBs.toFixed(0)}
      </tspan>
      <tspan x="50%" dy="1.3em" className="fill-gray-700" style={{ fontSize: 12, fontWeight: 500 }}>Bs</tspan>
    </text>
  );
}
