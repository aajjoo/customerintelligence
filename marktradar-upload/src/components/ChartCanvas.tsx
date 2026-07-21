"use client";

import { useEffect, useRef } from "react";
import {
  Chart,
  BarController,
  BarElement,
  LineController,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Legend,
  Tooltip,
  type ChartConfiguration,
} from "chart.js";

Chart.register(
  BarController,
  BarElement,
  LineController,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Legend,
  Tooltip
);

// Chart-Defaults laut design-spec.md: monochrom, Hind, Grid gray-075.
Chart.defaults.font.family = "'Hind', sans-serif";
Chart.defaults.font.size = 11;
Chart.defaults.color = "#6E6E6E";

export default function ChartCanvas({ config }: { config: ChartConfiguration }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const chart = new Chart(ref.current, {
      ...config,
      options: { maintainAspectRatio: false, ...config.options },
    });
    return () => chart.destroy();
    // Config kommt als serialisierbares Objekt aus Server-Komponenten und ändert sich nicht.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <canvas ref={ref} />;
}
