"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Badge } from "@/components/ui/badge"

export function TradingView() {
  const [ticker, setTicker] = useState("SOL")
  const [currentPrice, setCurrentPrice] = useState(0)
  const [chartData, setChartData] = useState<any[]>([])
  const [predictionData, setPredictionData] = useState<any[]>([])
  const [isLive, setIsLive] = useState(true)
  const [isLoading, setIsLoading] = useState(true)

  console.log('🎬 TradingView component rendered');

  // 1. LIVE DATA POLLING WITH HISTORICAL INITIALIZATION
  useEffect(() => {
    console.log('🎯 useEffect for data polling triggered, ticker:', ticker);
    let interval: NodeJS.Timeout;
    let componentMounted = true;

    const fetchHistoricalData = async () => {
      try {
        setIsLoading(true);
        console.log('🔄 Fetching historical data for:', ticker);
        const res = await fetch(`/api/market/history/${ticker}`, {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache' }
        });
        const data = await res.json();
        
        console.log('📊 Historical data received:', data);
        console.log('📊 History array length:', data.history?.length);
        console.log('📊 First 3 points:', data.history?.slice(0, 3));
        console.log('📊 Last 3 points:', data.history?.slice(-3));
        
        if (data.history && Array.isArray(data.history) && data.history.length > 0) {
          const formattedData = data.history.map((point: any, index: number) => {
            const formatted = {
              time: point.time,
              price: Number(point.price),
              type: "history"
            };
            if (index < 3) {
              console.log(`📈 Formatted point ${index}:`, formatted);
            }
            return formatted;
          });
          
          console.log('✅ Total formatted data points:', formattedData.length);
          console.log('✅ Price range:', {
            min: Math.min(...formattedData.map(d => d.price)),
            max: Math.max(...formattedData.map(d => d.price))
          });
          
          if (componentMounted) {
            setChartData(formattedData);
            setCurrentPrice(formattedData[formattedData.length - 1].price);
            console.log('✅ Chart data set with', formattedData.length, 'points');
            console.log('✅ Current price set to:', formattedData[formattedData.length - 1].price);
          }
        } else {
          console.error('❌ No valid history data in response');
        }
      } catch (e) {
        console.error("❌ Failed to fetch historical data:", e);
      } finally {
        if (componentMounted) {
          setIsLoading(false);
        }
      }
    };

    const fetchLiveData = async () => {
      try {
        console.log('🔴 Fetching live price for:', ticker);
        const res = await fetch(`/api/market/price/${ticker}`, {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache' }
        });
        
        if (!res.ok) {
          console.error('🔴 API returned status:', res.status);
          return;
        }
        
        const data = await res.json();
        
        console.log('🔴 Live price received:', data);
        
        if (componentMounted && data.price !== undefined && data.price !== null) {
          const price = Number(data.price);
          console.log('🔴 Setting current price to:', price);
          setCurrentPrice(price);
          
          // Add point to chart
          const now = new Date();
          const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
          
          setChartData(prev => {
            const newData = [...prev, { time: timeStr, price: price, type: "history" }];
            console.log('🔴 Added live point, total points now:', newData.length);
            // Keep last 50 points for better history
            if (newData.length > 50) newData.shift();
            return newData;
          });
        }
      } catch (e) {
        console.error("❌ Live fetch error - Details:", {
          message: e instanceof Error ? e.message : String(e),
          type: e instanceof SyntaxError ? 'SyntaxError (not valid JSON)' : 'Other error'
        });
      }
    };

    // Initialize with historical data first
    console.log('🚀 Component mounted, initializing data fetch...');
    fetchHistoricalData().then(() => {
      console.log('🚀 Historical data loaded, starting live polling...');
      // Start live polling after historical data is loaded
      fetchLiveData();
      // Poll every 5 seconds for live updates
      interval = setInterval(fetchLiveData, 5000);
    });

    return () => {
      console.log('🛑 Component unmounting, cleaning up...');
      componentMounted = false;
      if (interval) clearInterval(interval);
    };
  }, [ticker])

  // 2. LISTEN FOR "ALPHA BOUGHT" EVENTS (To show prediction)
  // In a real app, use a Context or Redux. For Hackathon, we can use a simple event listener
  useEffect(() => {
    const handleAlpha = (e: any) => {
        const prediction = e.detail?.prediction || []
        // Format prediction data to match chart
        // This is a simplified visual hack for the demo
        if (prediction.length > 0) {
           // We stop live updates to show the "Simulation" clearly
           setIsLive(false)
           // Merge current data with prediction
           const lastPoint = chartData[chartData.length - 1]
           const predPoints = prediction.map((p: any, i: number) => ({
               time: `Future +${i}m`,
               price: p.price,
               type: "prediction"
           }))
           setChartData([...chartData, ...predPoints])
        }
    }

    window.addEventListener("alpha-purchased", handleAlpha)
    return () => window.removeEventListener("alpha-purchased", handleAlpha)
  }, [chartData])

  console.log('🎬 TradingView rendering - isLoading:', isLoading, 'dataPoints:', chartData.length);

  return (
    <Card className="col-span-4 border-zinc-800 bg-zinc-950/50">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
            <CardTitle className="text-zinc-100">Live Market: {ticker}/USDC</CardTitle>
            <p className="text-2xl font-bold text-emerald-400">${currentPrice.toFixed(4)}</p>
        </div>
        {isLive ? (
            <Badge variant="outline" className="animate-pulse border-emerald-500 text-emerald-500">● LIVE</Badge>
        ) : (
            <Badge variant="outline" className="border-purple-500 text-purple-500">🔮 PREDICTION MODE</Badge>
        )}
      </CardHeader>
      <CardContent className="pl-0">
        {isLoading ? (
          <div className="h-[300px] w-full flex items-center justify-center text-zinc-500">
            Loading chart data...
          </div>
        ) : chartData.length === 0 ? (
          <div className="h-[300px] w-full flex items-center justify-center text-zinc-500">
            No data available
          </div>
        ) : (
          <div style={{ height: '300px', width: '100%', minHeight: '300px', display: 'flex', alignItems: 'stretch' }}>
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={300}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorPred" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#a855f7" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#a855f7" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                
                <XAxis 
                  dataKey="time" 
                  stroke="#52525b" 
                  fontSize={12} 
                  tickLine={false} 
                  axisLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis 
                  stroke="#52525b" 
                  fontSize={12} 
                  tickLine={false} 
                  axisLine={false} 
                  domain={['dataMin - 0.001', 'dataMax + 0.001']}
                  tickFormatter={(val) => `$${val.toFixed(4)}`} 
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: "#18181b", border: "1px solid #27272a" }}
                  labelStyle={{ color: "#a1a1aa" }}
                  formatter={(value: any) => [`$${Number(value).toFixed(6)}`, 'Price']}
                />
                
                {/* Historical Data (Green) */}
                <Area 
                  type="monotone" 
                  dataKey="price" 
                  stroke="#10b981" 
                  strokeWidth={2}
                  fill="url(#colorPrice)"
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default TradingView
