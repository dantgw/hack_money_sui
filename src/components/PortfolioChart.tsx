import { useEffect, useRef, useState } from "react";
import {
  createChart,
  ColorType,
  AreaSeries,
  LastPriceAnimationMode,
  LineType,
  type IChartApi,
  type ISeriesApi,
  type Time,
} from "lightweight-charts";
import { cn } from "../lib/utils";

export type PortfolioTimeframe = "1M" | "3M" | "YTD" | "1Y" | "ALL";

const TIMEFRAME_OPTIONS: PortfolioTimeframe[] = ["1M", "3M", "YTD", "1Y", "ALL"];

// Generate realistic simulated portfolio value data
function generateSimulatedData(
  timeframe: PortfolioTimeframe,
  baseValue: number
): { time: Time; value: number }[] {
  const now = Date.now();
  const points: { time: Time; value: number }[] = [];
  let startTime: number;
  let stepMs: number;
  let pointCount: number;

  switch (timeframe) {

    case "1W":
      startTime = now - 7 * 24 * 60 * 60 * 1000;
      stepMs = 2 * 60 * 60 * 1000; // 2 hours
      pointCount = 84;
      break;
    case "1M":
      startTime = now - 30 * 24 * 60 * 60 * 1000;
      stepMs = 12 * 60 * 60 * 1000; // 12 hours
      pointCount = 60;
      break;
    case "3M":
      startTime = now - 90 * 24 * 60 * 60 * 1000;
      stepMs = 2 * 24 * 60 * 60 * 1000; // 2 days
      pointCount = 45;
      break;
    case "YTD":
      startTime = new Date(new Date().getFullYear(), 0, 1).getTime();
      stepMs = 3 * 24 * 60 * 60 * 1000; // 3 days
      pointCount = Math.ceil((now - startTime) / stepMs);
      break;
    case "1Y":
      startTime = now - 365 * 24 * 60 * 60 * 1000;
      stepMs = 4 * 24 * 60 * 60 * 1000; // 4 days
      pointCount = 90;
      break;
    case "ALL":
      startTime = now - 2 * 365 * 24 * 60 * 60 * 1000;
      stepMs = 7 * 24 * 60 * 60 * 1000; // 1 week
      pointCount = 104;
      break;
    default:
      startTime = now - 7 * 24 * 60 * 60 * 1000;
      stepMs = 2 * 60 * 60 * 1000;
      pointCount = 84;
  }

  // Rising portfolio: start ~12–18% below current, trend upward to baseValue
  const startValue = baseValue * (0.82 + Math.random() * 0.06);
  let value = startValue;
  const volatility = baseValue * 0.008;
  const upBias = (baseValue - startValue) / pointCount;

  for (let i = 0; i < pointCount; i++) {
    const t = startTime + i * stepMs;
    const rand = Math.random() * 0.6 - 0.2; // Slight upward bias
    value = Math.min(baseValue * 1.02, value + rand * volatility + upBias);
    value = Math.max(startValue * 0.98, value);
    points.push({
      time: Math.floor(t / 1000) as Time,
      value: Math.round(value * 100) / 100,
    });
  }

  // Ensure last point is current value
  points.push({ time: Math.floor(now / 1000) as Time, value: baseValue });

  return points;
}

interface PortfolioChartProps {
  totalValue: number;
  dailyChange: number;
  dailyChangePercent: number;
  className?: string;
}

export function PortfolioChart({
  totalValue,
  dailyChange,
  dailyChangePercent,
  className,
}: PortfolioChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);
  const [timeframe, setTimeframe] = useState<PortfolioTimeframe>("ALL");
  const [chartData, setChartData] = useState(() =>
    generateSimulatedData("ALL", totalValue)
  );

  useEffect(() => {
    setChartData(generateSimulatedData(timeframe, totalValue));
  }, [timeframe, totalValue]);

  useEffect(() => {
    const container = chartContainerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const width = Math.max(rect.width || 300, 100);
    const height = Math.max(rect.height || 180, 100);

    const chart = createChart(container, {
      width,
      height,
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "transparent",
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { visible: false },
      },
      crosshair: {
        mode: 1,
        vertLine: {
          visible: true,
          labelVisible: false,
          color: "rgba(255,255,255,0.2)",
        },
        horzLine: {
          visible: true,
          labelVisible: false,
          color: "rgba(255,255,255,0.2)",
        },
      },
      rightPriceScale: {
        visible: false,
        borderVisible: false,
      },
      timeScale: {
        visible: false,
        borderVisible: false,
      },
      handleScroll: { vertTouchDrag: false, horzTouchDrag: true },
    });

    const isPositive = dailyChange >= 0;
    const areaColor = isPositive
      ? "rgba(34, 197, 94, 0.4)"
      : "rgba(239, 68, 68, 0.4)";
    const lineColor = isPositive ? "#4ade80" : "#f87171";

    const areaSeries = chart.addSeries(AreaSeries, {
      lineColor,
      topColor: areaColor,
      bottomColor: "rgba(0,0,0,0)",
      lineWidth: 2,
      lineType: LineType.Curved,
      priceLineVisible: false,
      lastValueVisible: false,
      lastPriceAnimation: LastPriceAnimationMode.Continuous,
    });

    chartRef.current = chart;
    seriesRef.current = areaSeries;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width: w, height: h } = entry.contentRect;
        if (w > 0 && h > 0) chart.applyOptions({ width: w, height: h });
      }
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [dailyChange, dailyChangePercent]);

  useEffect(() => {
    const series = seriesRef.current;
    if (!series || !chartData.length) return;

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout>;

    // Progressive draw-in: add points in batches for a smooth line animation
    const batchSize = Math.max(1, Math.floor(chartData.length / 25));
    let idx = 0;

    const addBatch = () => {
      if (cancelled) return;
      if (idx >= chartData.length) {
        series.applyOptions({
          lineColor: dailyChange >= 0 ? "#4ade80" : "#f87171",
          topColor:
            dailyChange >= 0
              ? "rgba(34, 197, 94, 0.4)"
              : "rgba(239, 68, 68, 0.4)",
        });
        return;
      }
      const end = Math.min(idx + batchSize, chartData.length);
      series.setData(chartData.slice(0, end));
      idx = end;
      timeoutId = setTimeout(addBatch, 25);
    };

    timeoutId = setTimeout(addBatch, 25);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [chartData, dailyChange]);

  return (
    <div className={cn("w-full animate-fade-slide-up", className)}>
      <div
        ref={chartContainerRef}
        className="w-full h-[180px] sm:h-[220px] lg:h-[380px] xl:h-[420px]"
        style={{ minHeight: 180 }}
      />
      <div className="flex gap-1 mt-4 px-4 lg:px-6 justify-center sm:justify-start flex-wrap">
        {TIMEFRAME_OPTIONS.map((tf) => (
          <button
            key={tf}
            onClick={() => setTimeframe(tf)}
            className={cn(
              "px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-200",
              timeframe === tf
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
          >
            {tf}
          </button>
        ))}
      </div>
    </div>
  );
}
