import { useEffect, useRef, useState } from 'react';
import {
    createChart,
    ColorType,
    CandlestickSeries,
    type IChartApi,
    type ISeriesApi,
    type Time,
    type BusinessDay
} from 'lightweight-charts';
import { ChevronDown } from 'lucide-react';
import { cn } from '../lib/utils';

export interface CandlestickData {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
}

export type Interval = '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d' | '1w';

interface TradingChartProps {
    data: CandlestickData[];
    symbol?: string;
    interval?: Interval;
    onIntervalChange?: (interval: Interval) => void;
}

const INTERVAL_OPTIONS: { value: Interval; label: string }[] = [
    { value: '1m', label: '1m' },
    { value: '5m', label: '5m' },
    { value: '15m', label: '15m' },
    { value: '30m', label: '30m' },
    { value: '1h', label: '1h' },
    { value: '4h', label: '4h' },
    { value: '1d', label: '1d' },
    { value: '1w', label: '1w' },
];

// Helper function to get date format based on interval
// Using predefined formats from lightweight-charts documentation
function getDateFormat(interval: Interval): string {
    switch (interval) {
        case '1m':
        case '5m':
        case '15m':
        case '30m':
        case '1h':
        case '4h':
            // For shorter intervals, show date with time context
            // Note: dateFormat doesn't support time, but this will show dates
            return 'MM/dd/yy';
        case '1d':
            return 'MM/dd/yy';
        case '1w':
            return 'MM/dd/yy';
        default:
            return 'MM/dd/yyyy';
    }
}

// Helper function to get localization options based on interval
function getLocalization(interval: Interval) {
    // timeFormatter formats the crosshair time display (not the time scale labels)
    const timeFormatter = (time: Time): string => {
        // Import isBusinessDay check if available
        let date: Date;
        if (typeof time === 'number') {
            // Unix timestamp - check if seconds or milliseconds
            const timestamp = time < 10000000000 ? time * 1000 : time;
            date = new Date(timestamp);
        } else if (typeof time === 'string') {
            date = new Date(time);
        } else {
            // BusinessDay format
            const businessDay = time as BusinessDay;
            date = new Date(businessDay.year, businessDay.month - 1, businessDay.day);
        }

        // Format based on interval for crosshair display
        switch (interval) {
            case '1m':
            case '5m':
                return date.toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false
                });
            case '15m':
            case '30m':
            case '1h':
            case '4h':
                return `${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')} ${date.toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false
                })}`;
            case '1d':
                return `${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')}`;
            case '1w':
                return `${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')}/${date.getFullYear().toString().slice(-2)}`;
            default:
                return date.toLocaleString();
        }
    };

    return {
        dateFormat: getDateFormat(interval),
        timeFormatter,
        locale: 'en-US',
    };
}

export function TradingChart({
    data,
    interval = '1h',
    onIntervalChange
}: TradingChartProps) {
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

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
                rightOffset: 10,
                fixLeftEdge: false,
                fixRightEdge: false,
            },
            localization: getLocalization(interval),
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

    // Update localization formatting when interval changes
    useEffect(() => {
        if (chartRef.current) {
            chartRef.current.applyOptions({
                localization: getLocalization(interval),
            });
        }
    }, [interval]);

    useEffect(() => {
        if (seriesRef.current && data.length > 0) {
            // Convert data to lightweight-charts format
            // Ensure timestamps are Unix timestamps in seconds (lightweight-charts expects this)
            const formattedData = data.map(d => {
                // The API returns Unix timestamp in seconds, which is what lightweight-charts expects
                let timeValue: number;

                if (typeof d.time === 'number') {
                    // DeepBook indexer returns Unix timestamps in seconds
                    // Ensure it's in seconds format (Unix timestamps in seconds are < 10000000000)
                    // If it's larger, it might be in milliseconds, so convert
                    timeValue = d.time < 10000000000 ? d.time : Math.floor(d.time / 1000);
                } else if (typeof d.time === 'string') {
                    // If it's a string, parse it to Unix timestamp in seconds
                    timeValue = Math.floor(new Date(d.time).getTime() / 1000);
                } else {
                    timeValue = d.time as number;
                }

                return {
                    time: timeValue as Time,
                    open: d.open,
                    high: d.high,
                    low: d.low,
                    close: d.close,
                };
            });

            seriesRef.current.setData(formattedData);

            // Fit content to visible range and ensure time scale is properly configured
            if (chartRef.current) {
                chartRef.current.timeScale().fitContent();
            }
        }
    }, [data]);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsDropdownOpen(false);
            }
        };

        if (isDropdownOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isDropdownOpen]);

    const handleIntervalClick = (newInterval: Interval) => {
        if (onIntervalChange) {
            onIntervalChange(newInterval);
        }
        setIsDropdownOpen(false);
    };

    return (
        <div className="relative w-full h-full flex flex-col">
            {/* Interval Controls */}
            <div className="absolute top-2 left-2 z-10 flex items-center gap-1">
                <button
                    onClick={() => handleIntervalClick('5m')}
                    className={cn(
                        "px-2.5 py-1 text-xs font-medium rounded transition-colors",
                        interval === '5m'
                            ? "bg-primary text-primary-foreground"
                            : "bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-foreground"
                    )}
                >
                    5m
                </button>
                <button
                    onClick={() => handleIntervalClick('1h')}
                    className={cn(
                        "px-2.5 py-1 text-xs font-medium rounded transition-colors",
                        interval === '1h'
                            ? "bg-primary text-primary-foreground"
                            : "bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-foreground"
                    )}
                >
                    1h
                </button>
                <button
                    onClick={() => handleIntervalClick('1d')}
                    className={cn(
                        "px-2.5 py-1 text-xs font-medium rounded transition-colors",
                        interval === '1d'
                            ? "bg-primary text-primary-foreground"
                            : "bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-foreground"
                    )}
                >
                    D
                </button>
                <div ref={dropdownRef} className="relative">
                    <button
                        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                        className={cn(
                            "px-2 py-1 text-xs font-medium rounded transition-colors flex items-center gap-1",
                            isDropdownOpen
                                ? "bg-white/10 text-foreground"
                                : "bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-foreground"
                        )}
                    >
                        <ChevronDown className="w-3 h-3" />
                    </button>
                    {isDropdownOpen && (
                        <div className="absolute top-full left-0 mt-1 bg-[#15171c] border border-white/10 rounded-lg shadow-lg overflow-hidden min-w-[80px] z-50">
                            {INTERVAL_OPTIONS.map((option) => (
                                <button
                                    key={option.value}
                                    onClick={() => handleIntervalClick(option.value)}
                                    className={cn(
                                        "w-full px-3 py-2 text-xs text-left transition-colors",
                                        interval === option.value
                                            ? "bg-primary/20 text-primary font-medium"
                                            : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                                    )}
                                >
                                    {option.label}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Chart Container */}
            <div ref={chartContainerRef} className="flex-1 w-full h-full" />
        </div>
    );
}
