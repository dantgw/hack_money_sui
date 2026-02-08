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
    onLoadMore?: (beforeTimestamp: number) => void;
    isLoadingMore?: boolean;
    tickSize?: number; // Minimum price increment in smallest units of quote asset
    quoteAssetDecimals?: number; // Decimal places for the quote asset (price is in quote asset)
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

// Helper function to calculate decimal places from a number value
// Returns the number of decimal places needed to represent the value accurately
function getDecimalPlacesFromValue(value: number): number {
    if (value <= 0) return 0;

    // Handle scientific notation (e.g., 1e-8)
    const valueStr = value.toString();
    if (valueStr.includes('e')) {
        const match = valueStr.match(/e-(\d+)/);
        if (match) {
            return parseInt(match[1], 10);
        }
        // Handle positive exponents
        const matchPos = valueStr.match(/e\+(\d+)/);
        if (matchPos) {
            return 0; // Large numbers don't need decimals
        }
    }

    // Handle regular decimal notation
    if (valueStr.includes('.')) {
        const decimalPart = valueStr.split('.')[1];
        // Remove trailing zeros to get actual precision
        const trimmed = decimalPart.replace(/0+$/, '');
        return trimmed.length;
    }

    // If value is >= 1 and has no decimal point, no decimals needed
    return 0;
}

// Helper function to calculate decimal places from tickSize and asset decimals
// Returns the number of decimal places needed to display prices accurately
// tickSize is in the smallest units of the quote asset
// Price is quoted in the quote asset, so we use quoteAssetDecimals to convert tickSize
function getDecimalPlaces(
    tickSize?: number,
    quoteAssetDecimals?: number
): number {
    // If we have both tickSize and quoteAssetDecimals, calculate properly
    if (tickSize && tickSize > 0 && quoteAssetDecimals !== undefined && quoteAssetDecimals >= 0) {
        // tickSize is in smallest units of quote asset
        // Convert to quote asset units: tickSize / 10^quoteAssetDecimals
        const tickSizeInQuoteUnits = tickSize / Math.pow(10, quoteAssetDecimals);

        // Calculate decimal places needed for tickSize in quote units
        const tickSizeDecimals = getDecimalPlacesFromValue(tickSizeInQuoteUnits);

        // We need at least enough decimal places to show the tick size accurately
        // But we might also want to show more precision up to quoteAssetDecimals
        // Use the maximum to ensure we can display tick size accurately
        return tickSizeDecimals
    }

    // Fallback: if we only have quoteAssetDecimals, use that (capped at reasonable limit)
    if (quoteAssetDecimals !== undefined && quoteAssetDecimals >= 0) {
        return Math.min(quoteAssetDecimals, 8);
    }

    // Fallback: if we only have tickSize, try to infer decimals from it
    if (tickSize && tickSize > 0) {
        // Assume tickSize might already be in quote units, calculate decimals
        return getDecimalPlacesFromValue(tickSize);
    }

    // Default fallback
    return 4;
}

// Helper function to format price based on decimal places
function formatPrice(price: number, decimalPlaces: number): string {
    return price.toFixed(decimalPlaces);
}

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
    onIntervalChange,
    onLoadMore: _onLoadMore,
    tickSize,
    quoteAssetDecimals
}: TradingChartProps) {
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const isLoadingMoreRef = useRef(false);
    const loadedDataRef = useRef<Set<number>>(new Set());
    const oldestTimestampRef = useRef<number | null>(null);

    useEffect(() => {
        const container = chartContainerRef.current;
        if (!container) return;

        // Calculate decimal places from tickSize and asset decimals
        const decimalPlaces = getDecimalPlaces(tickSize, quoteAssetDecimals);

        // Create price formatter function
        const priceFormatter = (price: number): string => {
            return formatPrice(price, decimalPlaces);
        };

        let rafId: number | undefined;
        let resizeObserver: ResizeObserver | null = null;

        const initChart = () => {
            const rect = container.getBoundingClientRect();
            const width = Math.max(rect.width || 300, 100);
            const height = Math.max(rect.height || 200, 100);

            const chart = createChart(container, {
                width,
                height,
                autoSize: true, // Handles mobile resize; uses ResizeObserver internally
                layout: {
                    background: { type: ColorType.Solid, color: '#0d1210' },
                    textColor: '#e8e6e1',
                },
                grid: {
                    vertLines: { color: '#1e2824' },
                    horzLines: { color: '#1e2824' },
                },
                crosshair: {
                    mode: 1,
                },
                rightPriceScale: {
                    borderColor: '#2a332e',
                    scaleMargins: {
                        top: 0.1,
                        bottom: 0.1,
                    },
                },
                timeScale: {
                    borderColor: '#2a332e',
                    timeVisible: true,
                    secondsVisible: false,
                    rightOffset: 10,
                    fixLeftEdge: false,
                    fixRightEdge: false,
                },
                localization: {
                    ...getLocalization(interval),
                    priceFormatter,
                },
            });

            chartRef.current = chart;

            // Add candlestick series (logo palette: primary green for up, destructive red for down)
            const candlestickSeries = chart.addSeries(CandlestickSeries, {
                upColor: '#22c55e',
                downColor: '#ef4444',
                borderVisible: false,
                wickUpColor: '#22c55e',
                wickDownColor: '#ef4444',
            });

            seriesRef.current = candlestickSeries;
        };

        const tryInit = () => {
            const rect = container.getBoundingClientRect();
            if (rect.width >= 50 && rect.height >= 50) {
                initChart();
                return true;
            }
            return false;
        };

        // On mobile, container often has 0 size before layout — wait for dimensions
        if (!tryInit()) {
            resizeObserver = new ResizeObserver(() => {
                if (tryInit() && resizeObserver) {
                    resizeObserver.disconnect();
                }
            });
            resizeObserver.observe(container);
            rafId = requestAnimationFrame(() => {
                if (!chartRef.current) tryInit();
            });
        }

        return () => {
            if (resizeObserver) resizeObserver.disconnect();
            if (rafId !== undefined) cancelAnimationFrame(rafId);
            if (chartRef.current) {
                chartRef.current.remove();
                chartRef.current = null;
            }
        };
    }, []);

    // Subscribe to visible range changes to detect scrolling back
    // useEffect(() => {
    //     if (!chartRef.current || !onLoadMore || data.length === 0) return;

    //     const timeScale = chartRef.current.timeScale();
    //     const handler = (range: { from: number; to: number } | null) => {
    //         if (!range) {
    //             console.log('[Scroll Detection] Range is null');
    //             return;
    //         }

    //         if (isLoadingMoreRef.current) {
    //             console.log('[Scroll Detection] Already loading more, skipping');
    //             return;
    //         }

    //         console.log('[Scroll Detection] Visible range:', {
    //             from: range.from,
    //             to: range.to,
    //             dataLength: data.length,
    //             oldestCandleTime: data.length > 0 ? data[0].time : 'N/A',
    //             oldestCandleDate: data.length > 0 ? new Date(data[0].time * 1000).toISOString() : 'N/A'
    //         });

    //         // range.from is a logical index (0-based) of the data array
    //         // Load more when we're near the left edge (within first 20 candles)
    //         const threshold = 20; // Load more when within first 20 candles

    //         if (range.from < threshold && data.length > 0) {
    //             console.log('[Scroll Detection] ✅ Scrolled past threshold!', {
    //                 rangeFrom: range.from,
    //                 threshold,
    //                 oldestCandleIndex: 0,
    //                 oldestCandleTime: data[0].time
    //             });

    //             // Find the oldest candle timestamp
    //             const oldestCandle = data[0];
    //             const oldestTimestamp = oldestCandle.time;

    //             // Use the actual oldest timestamp as the cache key for more precision
    //             // This ensures we can load more data even if we've scrolled past the edge
    //             // The cache will be cleared when new data is loaded (oldest timestamp moves backward)
    //             const cacheKey = oldestTimestamp;
    //             const alreadyLoaded = loadedDataRef.current.has(cacheKey);

    //             console.log('[Scroll Detection] Cache check:', {
    //                 oldestTimestamp,
    //                 oldestTimestampDate: new Date(oldestTimestamp * 1000).toISOString(),
    //                 cacheKey,
    //                 alreadyLoaded,
    //                 cacheSize: loadedDataRef.current.size,
    //                 cacheKeys: Array.from(loadedDataRef.current).slice(0, 10) // Show first 10 for debugging
    //             });

    //             if (!alreadyLoaded) {
    //                 console.log('[Scroll Detection] 🚀 Triggering loadMore!', {
    //                     oldestTimestamp,
    //                     oldestTimestampDate: new Date(oldestTimestamp * 1000).toISOString(),
    //                     rangeFrom: range.from
    //                 });

    //                 isLoadingMoreRef.current = true;
    //                 loadedDataRef.current.add(cacheKey);
    //                 onLoadMore(oldestTimestamp);

    //                 // Reset loading flag after a delay to allow for new data to load
    //                 setTimeout(() => {
    //                     console.log('[Scroll Detection] Resetting loading flag');
    //                     isLoadingMoreRef.current = false;
    //                 }, 2000);
    //             } else {
    //                 console.log('[Scroll Detection] ⏭️ Skipping - already loaded for this timestamp', {
    //                     oldestTimestamp,
    //                     oldestTimestampDate: new Date(oldestTimestamp * 1000).toISOString(),
    //                     suggestion: 'New data may not have been loaded yet, or cache needs clearing'
    //                 });
    //             }
    //         } else {
    //             console.log('[Scroll Detection] Not at threshold yet', {
    //                 rangeFrom: range.from,
    //                 threshold,
    //                 condition: range.from < threshold ? 'true' : 'false'
    //             });
    //         }
    //     };

    //     // Subscribe to visible range changes
    //     // Note: lightweight-charts subscription methods may return void or a function
    //     // The chart will handle cleanup when removed
    //     timeScale.subscribeVisibleLogicalRangeChange(handler);

    //     // Cleanup is handled by chart removal in the main useEffect
    //     // No explicit unsubscribe needed as the chart instance manages subscriptions
    // }, [data, interval, onLoadMore]);

    // Update localization formatting when interval, tickSize, or asset decimals change
    useEffect(() => {
        if (chartRef.current) {
            const decimalPlaces = getDecimalPlaces(tickSize, quoteAssetDecimals);
            const priceFormatter = (price: number): string => {
                return formatPrice(price, decimalPlaces);
            };

            // Update chart localization with price formatter
            chartRef.current.applyOptions({
                localization: {
                    ...getLocalization(interval),
                    priceFormatter,
                },
            });
        }
        // Reset loaded data cache when interval changes
        loadedDataRef.current.clear();
        isLoadingMoreRef.current = false;
    }, [interval, tickSize, quoteAssetDecimals]);

    // Clear cache when new data is loaded (oldest timestamp moves backward)
    useEffect(() => {
        if (data.length > 0) {
            const oldestTime = data[0].time;

            // If the oldest timestamp moved backward (got older), clear the cache entry for the previous oldest timestamp
            // This allows loading more data when scrolling further back
            if (oldestTimestampRef.current !== null && oldestTime < oldestTimestampRef.current) {
                console.log('[Cache] Clearing cache entry for previous oldest timestamp:', {
                    previousOldest: oldestTimestampRef.current,
                    newOldest: oldestTime,
                    previousDate: new Date(oldestTimestampRef.current * 1000).toISOString(),
                    newDate: new Date(oldestTime * 1000).toISOString()
                });
                // Remove the cache entry for the previous oldest timestamp
                loadedDataRef.current.delete(oldestTimestampRef.current);
            }

            // If timestamp changed significantly forward (likely new pool), clear all cache
            if (oldestTimestampRef.current !== null) {
                const tolerance = interval === '1m' ? 60 :
                    interval === '5m' ? 300 :
                        interval === '15m' ? 900 :
                            interval === '30m' ? 1800 :
                                interval === '1h' ? 3600 :
                                    interval === '4h' ? 14400 :
                                        interval === '1d' ? 86400 : 604800;
                // If timestamp changed forward by more than tolerance, it's likely a new pool
                if (oldestTime > oldestTimestampRef.current + tolerance * 10) {
                    console.log('[Cache] Clearing all cache - likely new pool selected');
                    loadedDataRef.current.clear();
                }
            }
            oldestTimestampRef.current = oldestTime;
        }
    }, [data.length > 0 ? data[0].time : null, interval]); // Track oldest timestamp

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

            // Get current visible range to preserve scroll position
            const currentRange = chartRef.current?.timeScale().getVisibleLogicalRange();

            seriesRef.current.setData(formattedData);

            // Restore visible range if we were scrolled back (preserving user's scroll position)
            if (chartRef.current && currentRange) {
                // Only restore if we're not at the right edge (most recent data)
                // This prevents jumping when new data is added at the end
                const dataLength = formattedData.length;
                const rightEdge = dataLength - 1;
                if (currentRange.to < rightEdge - 5) {
                    // User was scrolled back, restore their position
                    chartRef.current.timeScale().setVisibleLogicalRange(currentRange);
                } else {
                    // User was at the end, fit content to show latest data
                    chartRef.current.timeScale().fitContent();
                }
            } else if (chartRef.current) {
                // Initial load or no previous range, fit content
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
        <div className="absolute inset-0 flex flex-col min-h-0">
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
                        <div className="absolute top-full left-0 mt-1 bg-card border-2 border-border rounded-lg shadow-lg overflow-hidden min-w-[80px] z-50">
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

            {/* Chart Container — flex-1 fills available space; min-h for Lightweight Charts init */}
            <div ref={chartContainerRef} className="flex-1 min-h-0 w-full min-h-[200px]" />
        </div>
    );
}
