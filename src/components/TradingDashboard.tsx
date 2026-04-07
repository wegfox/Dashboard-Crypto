/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useRef } from 'react';
import { createChart, ColorType, IChartApi, ISeriesApi, CandlestickData, LineData, HistogramData, CandlestickSeries, LineSeries, HistogramSeries } from 'lightweight-charts';
import { format } from 'date-fns';
import { 
  TrendingUp, 
  Activity, 
  Zap, 
  ArrowUpRight, 
  ArrowDownRight,
  Info,
  RefreshCw,
  Volume2,
  VolumeX,
  ChevronDown
} from 'lucide-react';
import { cn } from '@/src/lib/utils';

// --- Types ---

interface KlineData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface IndicatorData extends KlineData {
  rsi?: number;
  stochRsiK?: number;
  stochRsiD?: number;
  macd?: number;
  signal?: number;
  histogram?: number;
  ema20?: number;
  ema50?: number;
  ema200?: number;
  bbUpper?: number;
  bbLower?: number;
  bbMiddle?: number;
}

// --- Constants ---

const SYMBOLS = [
  { label: 'BTC/USDT', value: 'BTCUSDT', support: 60000, resistance: 75000 },
  { label: 'ETH/USDT', value: 'ETHUSDT', support: 3000, resistance: 4000 },
  { label: 'BNB/USDT', value: 'BNBUSDT', support: 500, resistance: 650 },
  { label: 'SOL/USDT', value: 'SOLUSDT', support: 120, resistance: 200 },
  { label: 'XRP/USDT', value: 'XRPUSDT', support: 0.45, resistance: 0.65 },
  { label: 'ADA/USDT', value: 'ADAUSDT', support: 0.35, resistance: 0.55 },
  { label: 'DOGE/USDT', value: 'DOGEUSDT', support: 0.12, resistance: 0.22 },
  { label: 'AVAX/USDT', value: 'AVAXUSDT', support: 30, resistance: 50 },
  { label: 'DOT/USDT', value: 'DOTUSDT', support: 6, resistance: 10 },
  { label: 'LINK/USDT', value: 'LINKUSDT', support: 12, resistance: 20 },
  { label: 'TRX/USDT', value: 'TRXUSDT', support: 0.10, resistance: 0.15 },
  { label: 'POL/USDT', value: 'POLUSDT', support: 0.30, resistance: 0.60 },
  { label: 'BCH/USDT', value: 'BCHUSDT', support: 400, resistance: 600 },
  { label: 'NEAR/USDT', value: 'NEARUSDT', support: 1.17, resistance: 1.34 },
  { label: 'LTC/USDT', value: 'LTCUSDT', support: 70, resistance: 100 },
  { label: 'UNI/USDT', value: 'UNIUSDT', support: 7, resistance: 12 },
  { label: 'APT/USDT', value: 'APTUSDT', support: 8, resistance: 15 },
  { label: 'SUI/USDT', value: 'SUIUSDT', support: 1.00, resistance: 2.00 },
  { label: 'ICP/USDT', value: 'ICPUSDT', support: 10, resistance: 18 },
  { label: 'HBAR/USDT', value: 'HBARUSDT', support: 0.07, resistance: 0.12 },
  { label: 'ATOM/USDT', value: 'ATOMUSDT', support: 8, resistance: 12 },
  { label: 'TIA/USDT', value: 'TIAUSDT', support: 10, resistance: 18 },
];

const RSI_PERIOD = 14;
const MACD_FAST = 12;
const MACD_SLOW = 26;
const MACD_SIGNAL = 9;
const BB_PERIOD = 20;
const BB_STD_DEV = 2;
const STOCH_RSI_PERIOD = 14;
const EMA_SHORT = 20;
const EMA_MEDIUM = 50;
const EMA_LONG = 200;

// --- Helper Functions ---

const calculateEMA = (data: number[], period: number) => {
  const k = 2 / (period + 1);
  let ema = data[0];
  const results = [ema];
  for (let i = 1; i < data.length; i++) {
    ema = data[i] * k + ema * (1 - k);
    results.push(ema);
  }
  return results;
};

const calculateRSI = (data: number[], period: number) => {
  const rsi = new Array(data.length).fill(null);
  if (data.length <= period) return rsi;

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = data[i] - data[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  rsi[period] = 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < data.length; i++) {
    const diff = data[i] - data[i - 1];
    const gain = diff >= 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    rsi[i] = 100 - 100 / (1 + avgGain / avgLoss);
  }

  return rsi;
};

const calculateMACD = (data: number[]) => {
  const ema12 = calculateEMA(data, MACD_FAST);
  const ema26 = calculateEMA(data, MACD_SLOW);
  
  const macdLine = ema12.map((v, i) => v - ema26[i]);
  const signalLine = calculateEMA(macdLine, MACD_SIGNAL);
  const histogram = macdLine.map((v, i) => v - signalLine[i]);

  return { macdLine, signalLine, histogram };
};

const calculateBollingerBands = (data: number[], period: number, stdDev: number) => {
  const upper = [];
  const lower = [];
  const middle = [];

  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      upper.push(null);
      lower.push(null);
      middle.push(null);
      continue;
    }

    const slice = data.slice(i - period + 1, i + 1);
    const avg = slice.reduce((a, b) => a + b, 0) / period;
    const squareDiffs = slice.map(v => Math.pow(v - avg, 2));
    const variance = squareDiffs.reduce((a, b) => a + b, 0) / period;
    const sd = Math.sqrt(variance);

    middle.push(avg);
    upper.push(avg + stdDev * sd);
    lower.push(avg - stdDev * sd);
  }

  return { upper, lower, middle };
};

const calculateStochasticRSI = (rsiData: (number | null)[], period: number) => {
  const k = new Array(rsiData.length).fill(null);
  const d = new Array(rsiData.length).fill(null);

  for (let i = period; i < rsiData.length; i++) {
    const slice = rsiData.slice(i - period + 1, i + 1).filter(v => v !== null) as number[];
    if (slice.length < period) continue;

    const minRsi = Math.min(...slice);
    const maxRsi = Math.max(...slice);
    
    if (maxRsi - minRsi !== 0) {
      k[i] = ((rsiData[i]! - minRsi) / (maxRsi - minRsi)) * 100;
    } else {
      k[i] = 0;
    }
  }

  // Calculate D (3-period SMA of K)
  for (let i = period + 3; i < k.length; i++) {
    const slice = k.slice(i - 2, i + 1).filter(v => v !== null) as number[];
    if (slice.length === 3) {
      d[i] = slice.reduce((a, b) => a + b, 0) / 3;
    }
  }

  return { k, d };
};

// --- Components ---

export default function TradingDashboard() {
  const [currentSymbol, setCurrentSymbol] = useState(SYMBOLS[0]);
  const [data, setData] = useState<IndicatorData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPrice, setCurrentPrice] = useState<number>(0);
  const [priceChange, setPriceChange] = useState<number>(0);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [isChartReady, setIsChartReady] = useState(false);
  const [volumeProfile, setVolumeProfile] = useState<{ price: number; volume: number; y: number; width: number }[]>([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [allPrices, setAllPrices] = useState<Record<string, { price: number; change: number; high: number; low: number; flash: 'up' | 'down' | null }>>({});
  const [priceFlash, setPriceFlash] = useState<'up' | 'down' | null>(null);
  const [visibility, setVisibility] = useState({
    ema20: true,
    ema50: true,
    ema200: true,
    rsi: true,
    volumeProfile: true,
  });
  
  const mainChartContainerRef = useRef<HTMLDivElement>(null);
  
  const mainChartRef = useRef<IChartApi | null>(null);
  
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const rsiSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const stochKSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const stochDSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const ema20SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const ema50SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const ema200SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const bbUpperSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const bbLowerSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const bbMiddleSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  const playTickSound = () => {
    if (!audioEnabled) return;
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioContextRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.05);
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.05);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.05);
    } catch (e) {
      console.error('Audio error:', e);
    }
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      const response = await fetch(`https://api.binance.com/api/v3/klines?symbol=${currentSymbol.value}&interval=1d&limit=200`);
      if (!response.ok) throw new Error('Failed to fetch data');
      const rawData = await response.json();
      
      const formattedData: KlineData[] = rawData.map((d: any) => ({
        time: d[0] / 1000, // Lightweight charts expects seconds
        open: parseFloat(d[1]),
        high: parseFloat(d[2]),
        low: parseFloat(d[3]),
        close: parseFloat(d[4]),
        volume: parseFloat(d[5]),
      }));

      processAndSetData(formattedData);
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setLoading(false);
    }
  };

  const calculateAllIndicators = (klines: KlineData[]): IndicatorData[] => {
    const closes = klines.map(k => k.close);
    const rsiValues = calculateRSI(closes, RSI_PERIOD);
    const { macdLine, signalLine, histogram } = calculateMACD(closes);
    const { upper, lower, middle } = calculateBollingerBands(closes, BB_PERIOD, BB_STD_DEV);
    const { k, d } = calculateStochasticRSI(rsiValues, STOCH_RSI_PERIOD);
    const ema20 = calculateEMA(closes, EMA_SHORT);
    const ema50 = calculateEMA(closes, EMA_MEDIUM);
    const ema200 = calculateEMA(closes, EMA_LONG);

    return klines.map((kl, i) => ({
      ...kl,
      rsi: rsiValues[i],
      stochRsiK: k[i],
      stochRsiD: d[i],
      macd: macdLine[i],
      signal: signalLine[i],
      histogram: histogram[i],
      ema20: ema20[i],
      ema50: ema50[i],
      ema200: ema200[i],
      bbUpper: upper[i] as any,
      bbLower: lower[i] as any,
      bbMiddle: middle[i] as any,
    }));
  };

  const processAndSetData = (klines: KlineData[]) => {
    const enrichedData = calculateAllIndicators(klines);
    setData(enrichedData);
    const lastPrice = enrichedData[enrichedData.length - 1].close;
    const prevPrice = enrichedData[enrichedData.length - 2].close;
    setCurrentPrice(lastPrice);
    setPriceChange(((lastPrice - prevPrice) / prevPrice) * 100);
  };

  // Initialize Charts
  useEffect(() => {
    if (!mainChartContainerRef.current) return;

    const chartOptions = {
      layout: {
        background: { type: ColorType.Solid, color: '#141414' },
        textColor: '#d1d4dc',
      },
      grid: {
        vertLines: { color: 'rgba(42, 46, 57, 0.5)' },
        horzLines: { color: 'rgba(42, 46, 57, 0.5)' },
      },
      rightPriceScale: {
        borderColor: 'rgba(197, 203, 206, 0.1)',
        visible: true,
      },
      leftPriceScale: {
        borderColor: 'rgba(197, 203, 206, 0.1)',
        visible: true,
      },
      localization: {
        priceFormatter: (price: number) => price.toFixed(5),
      },
      timeScale: {
        borderColor: 'rgba(197, 203, 206, 0.1)',
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: {
        mode: 0,
      },
    };

    // Main Chart
    const mainChart = createChart(mainChartContainerRef.current, {
      ...chartOptions,
      height: 700,
    });
    const candlestickSeries = mainChart.addSeries(CandlestickSeries, {
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
      priceFormat: {
        type: 'price',
        precision: 5,
        minMove: 0.00001,
      },
      priceScaleId: 'right',
    });

    // Add RSI & Stoch RSI to Main Chart (Left Scale)
    const rsiSeries = mainChart.addSeries(LineSeries, {
      color: '#a855f7',
      lineWidth: 2,
      priceScaleId: 'left',
      title: 'RSI',
    });
    const stochKSeries = mainChart.addSeries(LineSeries, { 
      color: '#3b82f6', 
      lineWidth: 1,
      priceScaleId: 'left',
      title: 'Stoch K',
    });
    const stochDSeries = mainChart.addSeries(LineSeries, { 
      color: '#f97316', 
      lineWidth: 1, 
      lineStyle: 2,
      priceScaleId: 'left',
      title: 'Stoch D',
    });

    // Configure Left Scale for RSI (0-100)
    mainChart.priceScale('left').applyOptions({
      autoScale: true,
      scaleMargins: {
        top: 0.8, // Keep RSI at the bottom 20% of the chart
        bottom: 0.05,
      },
    });

    // Add EMAs to Main Chart
    const ema20Series = mainChart.addSeries(LineSeries, { color: '#3b82f6', lineWidth: 1, title: 'EMA 20', priceScaleId: 'right' });
    const ema50Series = mainChart.addSeries(LineSeries, { color: '#f97316', lineWidth: 1, title: 'EMA 50', priceScaleId: 'right' });
    const ema200Series = mainChart.addSeries(LineSeries, { color: '#a855f7', lineWidth: 2, title: 'EMA 200', priceScaleId: 'right' });

    // Add Bollinger Bands to Main Chart
    const bbUpperSeries = mainChart.addSeries(LineSeries, { color: 'rgba(255, 255, 255, 0.2)', lineWidth: 1, lineStyle: 2, priceScaleId: 'right' });
    const bbLowerSeries = mainChart.addSeries(LineSeries, { color: 'rgba(255, 255, 255, 0.2)', lineWidth: 1, lineStyle: 2, priceScaleId: 'right' });
    const bbMiddleSeries = mainChart.addSeries(LineSeries, { color: 'rgba(255, 255, 255, 0.1)', lineWidth: 1, priceScaleId: 'right' });
    
    // Add Support/Resistance Lines
    candlestickSeries.createPriceLine({
      price: currentSymbol.resistance,
      color: '#ef5350',
      lineWidth: 2,
      lineStyle: 2, // Dashed
      axisLabelVisible: true,
      title: 'RESISTANCE',
    });
    candlestickSeries.createPriceLine({
      price: currentSymbol.support,
      color: '#26a69a',
      lineWidth: 2,
      lineStyle: 2, // Dashed
      axisLabelVisible: true,
      title: 'SUPPORT',
    });

    mainChartRef.current = mainChart;
    candlestickSeriesRef.current = candlestickSeries;
    rsiSeriesRef.current = rsiSeries;
    stochKSeriesRef.current = stochKSeries;
    stochDSeriesRef.current = stochDSeries;
    ema20SeriesRef.current = ema20Series;
    ema50SeriesRef.current = ema50Series;
    ema200SeriesRef.current = ema200Series;
    bbUpperSeriesRef.current = bbUpperSeries;
    bbLowerSeriesRef.current = bbLowerSeries;
    bbMiddleSeriesRef.current = bbMiddleSeries;
    setIsChartReady(true);

    const handleResize = () => {
      if (mainChartContainerRef.current) mainChart.applyOptions({ width: mainChartContainerRef.current.clientWidth });
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      mainChart.remove();
      mainChartRef.current = null;
    };
  }, [loading]);

  // Update Chart Data
  useEffect(() => {
    if (data.length === 0 || !isChartReady) return;

    const candles: CandlestickData[] = data.map(d => ({
      time: d.time as any,
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
    }));

    const rsiData: LineData[] = data
      .filter(d => d.rsi !== null && d.rsi !== undefined)
      .map(d => ({
        time: d.time as any,
        value: d.rsi!,
      }));

    const stochKData: LineData[] = data
      .filter(d => d.stochRsiK !== null)
      .map(d => ({
        time: d.time as any,
        value: d.stochRsiK!,
      }));

    const stochDData: LineData[] = data
      .filter(d => d.stochRsiD !== null)
      .map(d => ({
        time: d.time as any,
        value: d.stochRsiD!,
      }));

    const ema20Data: LineData[] = data.filter(d => d.ema20 !== null).map(d => ({ time: d.time as any, value: d.ema20! }));
    const ema50Data: LineData[] = data.filter(d => d.ema50 !== null).map(d => ({ time: d.time as any, value: d.ema50! }));
    const ema200Data: LineData[] = data.filter(d => d.ema200 !== null).map(d => ({ time: d.time as any, value: d.ema200! }));
    const bbUpperData: LineData[] = data.filter(d => d.bbUpper !== null).map(d => ({ time: d.time as any, value: d.bbUpper! }));
    const bbLowerData: LineData[] = data.filter(d => d.bbLower !== null).map(d => ({ time: d.time as any, value: d.bbLower! }));
    const bbMiddleData: LineData[] = data.filter(d => d.bbMiddle !== null).map(d => ({ time: d.time as any, value: d.bbMiddle! }));

    if (candlestickSeriesRef.current) candlestickSeriesRef.current.setData(candles);
    if (rsiSeriesRef.current) rsiSeriesRef.current.setData(rsiData);
    if (stochKSeriesRef.current) stochKSeriesRef.current.setData(stochKData);
    if (stochDSeriesRef.current) stochDSeriesRef.current.setData(stochDData);
    if (ema20SeriesRef.current) ema20SeriesRef.current.setData(ema20Data);
    if (ema50SeriesRef.current) ema50SeriesRef.current.setData(ema50Data);
    if (ema200SeriesRef.current) ema200SeriesRef.current.setData(ema200Data);
    if (bbUpperSeriesRef.current) bbUpperSeriesRef.current.setData(bbUpperData);
    if (bbLowerSeriesRef.current) bbLowerSeriesRef.current.setData(bbLowerData);
    if (bbMiddleSeriesRef.current) bbMiddleSeriesRef.current.setData(bbMiddleData);

    // Apply visibility
    if (rsiSeriesRef.current) rsiSeriesRef.current.applyOptions({ visible: visibility.rsi });
    if (stochKSeriesRef.current) stochKSeriesRef.current.applyOptions({ visible: visibility.rsi });
    if (stochDSeriesRef.current) stochDSeriesRef.current.applyOptions({ visible: visibility.rsi });
    if (ema20SeriesRef.current) ema20SeriesRef.current.applyOptions({ visible: visibility.ema20 });
    if (ema50SeriesRef.current) ema50SeriesRef.current.applyOptions({ visible: visibility.ema50 });
    if (ema200SeriesRef.current) ema200SeriesRef.current.applyOptions({ visible: visibility.ema200 });

    // Sync time scales
    const mainTimeScale = mainChartRef.current?.timeScale();

    if (mainTimeScale) {
      mainTimeScale.subscribeVisibleTimeRangeChange(() => {
        updateVolumeProfile();
      });
    }
    
    // Initial calculation
    updateVolumeProfile();
  }, [data, isChartReady, visibility]);

  const updateVolumeProfile = () => {
    if (!mainChartRef.current || !candlestickSeriesRef.current || data.length === 0) return;

    const chart = mainChartRef.current;
    const series = candlestickSeriesRef.current;
    const timeScale = chart.timeScale();
    const visibleRange = timeScale.getVisibleRange();

    if (!visibleRange) return;

    // Filter data to visible range
    const visibleData = data.filter(d => d.time >= (visibleRange.from as number) && d.time <= (visibleRange.to as number));
    if (visibleData.length === 0) return;

    const prices = visibleData.flatMap(d => [d.high, d.low]);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const binsCount = 40;
    const binSize = (maxPrice - minPrice) / binsCount;

    const bins = new Array(binsCount).fill(0).map((_, i) => ({
      price: minPrice + i * binSize,
      volume: 0,
    }));

    visibleData.forEach(d => {
      const index = Math.min(Math.floor((d.close - minPrice) / binSize), binsCount - 1);
      if (index >= 0) {
        bins[index].volume += d.volume;
      }
    });

    const maxVolume = Math.max(...bins.map(b => b.volume));
    const chartWidth = mainChartContainerRef.current?.clientWidth || 0;
    const maxWidth = chartWidth * 0.2; // Max 20% of chart width

    const profile = bins.map(bin => {
      const y = series.priceToCoordinate(bin.price) || 0;
      const nextY = series.priceToCoordinate(bin.price + binSize) || 0;
      const height = Math.abs(y - nextY);
      
      return {
        price: bin.price,
        volume: bin.volume,
        y: Math.min(y, nextY),
        height: height,
        width: (bin.volume / maxVolume) * maxWidth,
      };
    }).filter(b => b.height > 0);

    setVolumeProfile(profile as any);
  };

  // WebSocket
  useEffect(() => {
    fetchData();

    // Combined stream for current kline and all tickers
    const tickerStreams = SYMBOLS.map(s => `${s.value.toLowerCase()}@ticker`).join('/');
    const klineStream = `${currentSymbol.value.toLowerCase()}@kline_1d`;
    const ws = new WebSocket(`wss://stream.binance.com:9443/stream?streams=${klineStream}/${tickerStreams}`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      const { stream, data: msg } = JSON.parse(event.data);
      
      if (stream.includes('@ticker')) {
        const symbol = msg.s;
        const price = parseFloat(msg.c);
        const change = parseFloat(msg.P);
        const high = parseFloat(msg.h);
        const low = parseFloat(msg.l);
        
        setAllPrices(prev => {
          const prevData = prev[symbol];
          let flash: 'up' | 'down' | null = null;
          if (prevData) {
            if (price > prevData.price) flash = 'up';
            else if (price < prevData.price) flash = 'down';
          }
          
          // Auto-clear flash after 500ms
          if (flash) {
            setTimeout(() => {
              setAllPrices(current => ({
                ...current,
                [symbol]: { ...current[symbol], flash: null }
              }));
            }, 500);
          }

          return {
            ...prev,
            [symbol]: { price, change, high, low, flash }
          };
        });
        return;
      }

      if (stream.includes('@kline')) {
        const k = msg.k;
        const newKline: KlineData = {
          time: k.t / 1000,
          open: parseFloat(k.o),
          high: parseFloat(k.h),
          low: parseFloat(k.l),
          close: parseFloat(k.c),
          volume: parseFloat(k.v),
        };

        setData(prev => {
          const last = prev[prev.length - 1];
          if (last && last.close !== newKline.close) {
            playTickSound();
            setPriceFlash(newKline.close > last.close ? 'up' : 'down');
            setTimeout(() => setPriceFlash(null), 500);
          }

          let updated;
          if (last && last.time === newKline.time) {
            updated = [...prev.slice(0, -1), newKline];
          } else {
            updated = [...prev.slice(1), newKline];
          }
          
          return calculateAllIndicators(updated);
        });

        setCurrentPrice(newKline.close);
      }
    };

    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, [audioEnabled, currentSymbol]);

  const latestData = data[data.length - 1];
  const tickerData = allPrices[currentSymbol.value];
  const displayPriceChange = tickerData ? tickerData.change : priceChange;
  const isBullish = displayPriceChange >= 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#0a0a0a] text-white">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="w-8 h-8 animate-spin text-orange-500" />
          <p className="text-sm font-mono tracking-widest uppercase opacity-50">Initializing Charts...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#0a0a0a] text-red-500">
        <div className="p-8 border border-red-900/30 bg-red-950/10 rounded-xl backdrop-blur-sm">
          <p className="font-mono uppercase tracking-tighter">Error: {error}</p>
          <button onClick={() => window.location.reload()} className="mt-4 px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition-colors">Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#e4e4e4] p-4 md:p-8 font-sans selection:bg-orange-500/30">
      <header className="max-w-7xl mx-auto mb-8 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-8">
        <div className="flex flex-col md:flex-row items-start md:items-end gap-8">
          <div>
            <div className="flex items-center gap-4 mb-2">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/40">Live Market Feed</span>
              </div>
              <button 
                onClick={() => setAudioEnabled(!audioEnabled)}
                className={cn(
                  "flex items-center gap-2 px-2 py-0.5 rounded text-[9px] font-mono uppercase tracking-tighter transition-all",
                  audioEnabled ? "bg-orange-500/20 text-orange-500 border border-orange-500/30" : "bg-white/5 text-white/30 border border-white/10"
                )}
              >
                {audioEnabled ? <Volume2 size={10} /> : <VolumeX size={10} />}
                Sound: {audioEnabled ? 'ON' : 'OFF'}
              </button>
            </div>
            <div className="relative">
              <button 
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="group flex items-center gap-4 hover:bg-white/5 px-4 py-2 rounded-2xl transition-all"
              >
                <h1 className="text-5xl md:text-7xl font-bold tracking-tighter text-white flex items-baseline gap-4">
                  {currentSymbol.label.split('/')[0]}<span className="text-white/20">/</span>{currentSymbol.label.split('/')[1]}
                </h1>
                <ChevronDown className={cn("text-white/20 group-hover:text-orange-500 transition-all", isDropdownOpen && "rotate-180")} size={32} />
              </button>

              {isDropdownOpen && (
                <div className="absolute top-full left-0 mt-2 w-64 bg-[#1a1a1a] border border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden backdrop-blur-xl">
                  {SYMBOLS.map((s) => (
                    <button
                      key={s.value}
                      onClick={() => {
                        setCurrentSymbol(s);
                        setIsDropdownOpen(false);
                        setIsChartReady(false); // Force re-init
                      }}
                      className={cn(
                        "w-full px-6 py-4 text-left font-mono text-sm transition-all hover:bg-white/5 flex items-center justify-between",
                        currentSymbol.value === s.value ? "text-orange-500 bg-orange-500/5" : "text-white/60"
                      )}
                    >
                      {s.label}
                      {currentSymbol.value === s.value && <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col items-start md:items-end">
            <div className={cn(
              "text-4xl md:text-6xl font-mono font-medium tracking-tighter transition-colors duration-300",
              priceFlash === 'up' ? "text-green-400" : priceFlash === 'down' ? "text-red-400" : "text-white"
            )}>
              ${currentPrice.toLocaleString(undefined, { 
                minimumFractionDigits: currentPrice >= 10 ? 2 : 5, 
                maximumFractionDigits: currentPrice >= 10 ? 2 : 5 
              })}
            </div>
            <div className={cn(
              "flex items-center gap-1 font-mono text-sm mt-1",
              isBullish ? "text-green-400" : "text-red-400"
            )}>
              {isBullish ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
              {isBullish ? '+' : ''}{displayPriceChange.toFixed(2)}%
              <span className="text-white/20 ml-2">(24h)</span>
            </div>
          </div>
        </div>

        {/* Trading Signal - Moved to Header */}
        <div className="bg-orange-500/10 border border-orange-500/20 rounded-2xl p-4 max-w-sm w-full">
          <div className="flex items-center gap-3 mb-2">
            <TrendingUp size={14} className="text-orange-500" />
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-white/70">Trading Signal</h4>
          </div>
          <div className="text-[10px] text-white/60 leading-tight space-y-1">
            <p>
              {currentSymbol.label.split('/')[0]} is near {currentPrice > (currentSymbol.resistance + currentSymbol.support) / 2 ? 'resistance' : 'support'}.
              {latestData?.ema20 && latestData?.ema50 && latestData.ema20 > latestData.ema50 ? (
                <span className="text-green-400 ml-1">BULLISH TREND</span>
              ) : (
                <span className="text-red-400 ml-1">BEARISH TREND</span>
              )}
            </p>
            <p className="font-mono uppercase text-white/40">
              Action: <span className="text-white/80">{
                latestData?.ema20 && latestData?.ema50 && latestData.ema20 > latestData.ema50 && latestData.rsi && latestData.rsi < 70 ? 
                "Buy Opportunities" : 
                latestData?.ema20 && latestData?.ema50 && latestData.ema20 < latestData.ema50 && latestData.rsi && latestData.rsi > 30 ? 
                "Sell Opportunities" : "Wait Confirmation"
              }</span>
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-5 gap-6 items-stretch">
        <div className="lg:col-span-3">
          {/* Main Chart */}
          <div className="bg-[#141414] border border-white/5 rounded-2xl p-4 overflow-hidden relative group h-full flex flex-col">
            <div className="flex items-center justify-between mb-4 px-2">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 px-3 py-1 bg-white/5 rounded-full border border-white/10">
                  <Activity size={14} className="text-orange-500" />
                  <span className="text-[10px] font-mono uppercase tracking-wider text-white/60">{currentSymbol.label} 1D + Indicators Overlay</span>
                </div>
                
                {/* Indicator Toggles */}
                <div className="flex items-center gap-2 bg-white/5 p-1 rounded-lg border border-white/10">
                  <button 
                    onClick={() => setVisibility(v => ({ ...v, ema20: !v.ema20 }))}
                    className={cn("px-2 py-0.5 rounded text-[9px] font-mono transition-all", visibility.ema20 ? "bg-blue-500/20 text-blue-400" : "text-white/20 hover:text-white/40")}
                  >
                    EMA20
                  </button>
                  <button 
                    onClick={() => setVisibility(v => ({ ...v, ema50: !v.ema50 }))}
                    className={cn("px-2 py-0.5 rounded text-[9px] font-mono transition-all", visibility.ema50 ? "bg-orange-500/20 text-orange-400" : "text-white/20 hover:text-white/40")}
                  >
                    EMA50
                  </button>
                  <button 
                    onClick={() => setVisibility(v => ({ ...v, ema200: !v.ema200 }))}
                    className={cn("px-2 py-0.5 rounded text-[9px] font-mono transition-all", visibility.ema200 ? "bg-purple-500/20 text-purple-400" : "text-white/20 hover:text-white/40")}
                  >
                    EMA200
                  </button>
                  <button 
                    onClick={() => setVisibility(v => ({ ...v, rsi: !v.rsi }))}
                    className={cn("px-2 py-0.5 rounded text-[9px] font-mono transition-all", visibility.rsi ? "bg-purple-500/20 text-purple-400" : "text-white/20 hover:text-white/40")}
                  >
                    RSI
                  </button>
                  <button 
                    onClick={() => setVisibility(v => ({ ...v, volumeProfile: !v.volumeProfile }))}
                    className={cn("px-2 py-0.5 rounded text-[9px] font-mono transition-all", visibility.volumeProfile ? "bg-orange-500/20 text-orange-400" : "text-white/20 hover:text-white/40")}
                  >
                    VOL
                  </button>
                </div>

                <div className="flex items-center gap-4 text-[10px] font-mono text-white/40">
                  {allPrices[currentSymbol.value] ? (
                    <>
                      <span>H: <span className="text-white/70">{allPrices[currentSymbol.value].high.toLocaleString(undefined, { maximumFractionDigits: allPrices[currentSymbol.value].high >= 10 ? 2 : 5 })}</span></span>
                      <span>L: <span className="text-white/70">{allPrices[currentSymbol.value].low.toLocaleString(undefined, { maximumFractionDigits: allPrices[currentSymbol.value].low >= 10 ? 2 : 5 })}</span></span>
                    </>
                  ) : (
                    <>
                      <span>L: <span className="text-white/70">{latestData?.low.toFixed(5)}</span></span>
                      <span>H: <span className="text-white/70">{latestData?.high.toFixed(5)}</span></span>
                    </>
                  )}
                  <span className="ml-4 text-purple-400">RSI: {latestData?.rsi?.toFixed(2)}</span>
                </div>
              </div>
            </div>
            <div className="relative">
              <div ref={mainChartContainerRef} className="w-full h-[700px]" />
              {/* Volume Profile Overlay */}
              {visibility.volumeProfile && (
                <svg 
                  className="absolute top-0 left-0 pointer-events-none z-10" 
                  style={{ width: '100%', height: '700px' }}
                >
                  {volumeProfile.map((bin, i) => (
                    <rect
                      key={i}
                      x={0}
                      y={bin.y}
                      width={bin.width}
                      height={(bin as any).height}
                      fill="rgba(249, 115, 22, 0.2)"
                      stroke="rgba(249, 115, 22, 0.1)"
                      strokeWidth={0.5}
                    />
                  ))}
                </svg>
              )}
            </div>
          </div>
        </div>

        <div className="lg:col-span-2">
          {/* Market Watch - Replaces Market Analysis */}
          <div className="bg-[#141414] border border-white/5 rounded-2xl p-6 h-full flex flex-col">
            <h3 className="text-xs font-mono uppercase tracking-widest text-white/40 mb-6 flex items-center gap-2">
              <Activity size={14} /> Market Watch
            </h3>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-2 flex-1 overflow-y-auto pr-2 custom-scrollbar content-start">
              {SYMBOLS.map((s) => {
                const ticker = allPrices[s.value];
                const isSymBullish = ticker ? ticker.change >= 0 : true;
                return (
                  <button
                    key={s.value}
                    onClick={() => {
                      setCurrentSymbol(s);
                      setIsChartReady(false);
                    }}
                    className={cn(
                      "w-full p-3 rounded-xl border transition-all flex items-center justify-between group",
                      currentSymbol.value === s.value 
                        ? "bg-orange-500/10 border-orange-500/20" 
                        : "bg-white/5 border-transparent hover:border-white/10"
                    )}
                  >
                    <div className="text-left">
                      <p className={cn(
                        "text-xs font-bold transition-colors",
                        currentSymbol.value === s.value ? "text-orange-500" : "text-white/70 group-hover:text-white"
                      )}>
                        {s.label.split('/')[0]}
                      </p>
                      <p className="text-[10px] font-mono text-white/20 uppercase">USDT</p>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <span className={cn(
                          "text-[10px] font-mono",
                          isSymBullish ? "text-green-400" : "text-red-400"
                        )}>
                          {ticker ? (isSymBullish ? '+' : '') + ticker.change.toFixed(2) + '%' : '0.00%'}
                        </span>
                        <p className={cn(
                          "text-xs font-mono font-medium transition-colors duration-300",
                          ticker?.flash === 'up' ? "text-green-400" : ticker?.flash === 'down' ? "text-red-400" : "text-white"
                        )}>
                          {ticker ? ticker.price.toLocaleString(undefined, { 
                            minimumFractionDigits: ticker.price >= 10 ? 2 : 5,
                            maximumFractionDigits: ticker.price >= 10 ? 2 : 5
                          }) : '---'}
                        </p>
                      </div>
                      {ticker && (
                        <div className="flex gap-1.5 text-[9px] font-mono text-white/30 justify-end mt-1">
                          <span>L: <span className="text-white/50">{ticker.low.toLocaleString(undefined, { maximumFractionDigits: ticker.low >= 10 ? 2 : 4 })}</span></span>
                          <span>H: <span className="text-white/50">{ticker.high.toLocaleString(undefined, { maximumFractionDigits: ticker.high >= 10 ? 2 : 4 })}</span></span>
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </main>

      <footer className="max-w-7xl mx-auto mt-12 pt-8 border-t border-white/5 flex justify-between items-center">
        <p className="text-[10px] font-mono text-white/20 uppercase tracking-widest">Analytics Dashboard</p>
        <div className="flex gap-4">
          <div className="w-2 h-2 rounded-full bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.5)]" />
          <div className="w-2 h-2 rounded-full bg-white/10" />
          <div className="w-2 h-2 rounded-full bg-white/10" />
        </div>
      </footer>
    </div>
  );
}
