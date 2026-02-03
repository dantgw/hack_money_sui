import { useEffect, useRef } from 'react';
import {
    createChart,
    ColorType,
    CandlestickSeries,
    type IChartApi,
    type ISeriesApi,
    type Time
} from 'lightweight-charts';

export interface CandlestickData {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
}

interface TradingChartProps {
    data: CandlestickData[];
    symbol?: string;
}

export function TradingChart({ data, symbol = 'Price' }: TradingChartProps) {
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Create chart with initial size
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#0c0d10' },
        textColor: '#d1d4dc',
      },
      grid: {
        vertLines: { color: '#1a1a1a' },
        horzLines: { color: '#1a1a1a' },
      },
      crosshair: {
        mode: 1,
      },
      rightPriceScale: {
        borderColor: '#2a2a2a',
      },
      timeScale: {
        borderColor: '#2a2a2a',
        timeVisible: true,
        secondsVisible: false,
      },
    });

    chartRef.current = chart;

    // Add candlestick series
    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    });

    seriesRef.current = candlestickSeries;

    // Use ResizeObserver for reliable responsive sizing
    const resizeObserver = new ResizeObserver(entries => {
      if (entries.length === 0 || !entries[0].contentRect) return;
      const { width, height } = entries[0].contentRect;
      chart.applyOptions({ width, height });
      chart.timeScale().fitContent();
    });

    resizeObserver.observe(chartContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      if (chartRef.current) {
        chartRef.current.remove();
      }
    };
  }, []);

    useEffect(() => {
        if (seriesRef.current && data.length > 0) {
            // Convert data to lightweight-charts format
            const formattedData = data.map(d => ({
                time: d.time as Time,
                open: d.open,
                high: d.high,
                low: d.low,
                close: d.close,
            }));

            seriesRef.current.setData(formattedData);

            // Fit content to visible range
            if (chartRef.current) {
                chartRef.current.timeScale().fitContent();
            }
        }
    }, [data]);

  return (
    <div ref={chartContainerRef} className="absolute inset-0 w-full h-full" />
  );
}
