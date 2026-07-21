// Signalverlauf als SVG-Polyline, wie die Sparklines im Prototyp (120×26).
export default function Sparkline({
  values,
  muted = false,
}: {
  values: number[];
  muted?: boolean;
}) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * 120;
      const y = 22 - ((v - min) / range) * 18; // 4px Rand oben/unten
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg className="mt-1.5" width="120" height="26" viewBox="0 0 120 26" aria-hidden="true">
      <polyline
        fill="none"
        stroke={muted ? "#B8B8B4" : "#0A0A0A"}
        strokeWidth="1.5"
        points={points}
      />
    </svg>
  );
}
