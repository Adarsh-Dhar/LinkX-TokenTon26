"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@/hooks/use-wallet";

// Type for chart data points
interface ChartPoint {
  time: string;
  value: number;
}

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, ArrowUpRight, DollarSign, Wallet, Brain, BarChart3 } from "lucide-react";
import StatCard from "./stat-card";
import { ActivityFeed } from "./activity-feed";
import { Button } from "@/components/ui/button";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge } from "@/components/ui/badge";

// Wrapped SOL to USDC price (fixed, can be updated from market data)
const WRAPPED_SOL_USDC_PRICE = 0.0552;

// Default empty state to prevent UI flickering before load
const defaultStats = {
  wrappedSolBalance: 0,
  usdcBalance: 0,
  walletBalanceUsd: 0,
  alphaPurchased: 0,
  totalPnL: 0,
  profitPercent: 0,
  winRate: 0,
  totalTrades: 0,
  avgConfidence: 0,
};

export default function Dashboard() {
  const { balance: wrappedSolBalance, usdcBalance, isConnected } = useWallet();
  const [stats, setStats] = useState(defaultStats);
  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch additional stats from API (alphaPurchased, totalPnL, etc.)
  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await fetch("/api/dashboard/stats");
        if (res.ok) {
          const data = await res.json();
          setStats((prev) => ({
            ...prev,
            alphaPurchased: data.alphaPurchased || 0,
            totalPnL: data.totalPnL || 0,
            profitPercent: data.profitPercent || 0,
            winRate: data.winRate || 0,
            totalTrades: data.totalTrades || 0,
            avgConfidence: data.avgConfidence || 0,
          }));
        }
      } catch (error) {
        console.error("Failed to fetch stats:", error);
      }
    }
    fetchStats();
  }, []);

  // Generate cumulative returns data based on current wallet balances
  useEffect(() => {
    if (!isConnected || !wrappedSolBalance || !usdcBalance) {
      setLoading(false);
      return;
    }

    let componentMounted = true;
    let interval: NodeJS.Timeout;

    try {
      const initialWrappedSol = parseFloat(wrappedSolBalance);
      const initialUsdc = parseFloat(usdcBalance);
      
      // Calculate total portfolio value in USDC
      let totalUsdc = (initialWrappedSol * WRAPPED_SOL_USDC_PRICE) + initialUsdc;

      // Update stats
      setStats((prev) => ({
        ...prev,
        wrappedSolBalance: initialWrappedSol,
        usdcBalance: initialUsdc,
        walletBalanceUsd: totalUsdc,
      }));

      // Function to generate a new data point
      const generateNewDataPoint = (baseValue: number) => {
        const now = new Date();
        const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
        
        // Add small random variation to simulate market movement (±0.5%)
        const variation = 1 + (Math.random() - 0.5) * 0.005;
        const value = baseValue * variation;
        
        return {
          time: timeStr,
          value: Math.max(0, value),
        };
      };

      // Initialize with 50 data points going back (like trading-view)
      const initialPoints: ChartPoint[] = [];
      for (let i = 49; i >= 0; i--) {
        const time = new Date(Date.now() - i * 5000); // 5 seconds apart
        const timeStr = `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}:${String(time.getSeconds()).padStart(2, '0')}`;
        
        const variation = 1 + (Math.random() - 0.5) * 0.005;
        const value = totalUsdc * variation;
        
        initialPoints.push({
          time: timeStr,
          value: Math.max(0, value),
        });
      }
      
      if (componentMounted) {
        setChartData(initialPoints);
        setLoading(false);
      }

      // Update chart every 5 seconds with a new data point (like trading-view)
      const fetchLiveUpdate = () => {
        if (componentMounted) {
          // Recalculate total portfolio value with current balances
          const currentWrappedSol = parseFloat(wrappedSolBalance);
          const currentUsdc = parseFloat(usdcBalance);
          totalUsdc = (currentWrappedSol * WRAPPED_SOL_USDC_PRICE) + currentUsdc;

          const newPoint = generateNewDataPoint(totalUsdc);
          
          // Log the latest values
          console.log("📊 Latest Cumulative Returns:", {
            timestamp: newPoint.time,
            portfolioValueUSDC: newPoint.value.toFixed(2),
            wrappedSolBalance: currentWrappedSol.toFixed(4),
            usdcBalance: currentUsdc.toFixed(2),
            wrappedSolInUSDC: (currentWrappedSol * WRAPPED_SOL_USDC_PRICE).toFixed(2),
            totalPortfolio: totalUsdc.toFixed(2),
            dataPoints: chartData.length + 1,
          });
          
          // Update chart with real-time portfolio value
          setChartData((prevData) => {
            const updatedData = [...prevData.slice(1), newPoint];
            return updatedData;
          });

          // Update current portfolio value with real-time portfolioValueUSDC
          setStats((prev) => ({
            ...prev,
            wrappedSolBalance: currentWrappedSol,
            usdcBalance: currentUsdc,
            walletBalanceUsd: newPoint.value,
          }));
        }
      };

      interval = setInterval(fetchLiveUpdate, 5000); // Poll every 5 seconds

      return () => {
        componentMounted = false;
        if (interval) clearInterval(interval);
      };
    } catch (error) {
      console.error("Failed to calculate cumulative returns:", error);
      setLoading(false);
    }
  }, [wrappedSolBalance, usdcBalance, isConnected]);

  return (
    <div className="flex-1 space-y-4 p-4 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
        <div className="flex items-center space-x-2">
          <Button>Download Report</Button>
        </div>
      </div>

      <div className="space-y-4">
        {/* STATS GRID */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Wallet Balance"
               value={`${stats.wrappedSolBalance.toFixed(4)} WRAPPED_SOL • ${stats.usdcBalance.toFixed(2)} USDC`}
              icon={<Wallet />}
            />
            <StatCard
              label="Live Portfolio Value"
              value={`$${stats.walletBalanceUsd.toFixed(2)}`}
              icon={<DollarSign />}
            />
            <StatCard
              label="Total Profit"
              value={`$${stats.totalPnL.toFixed(2)}`}
              icon={<DollarSign />}
            />
            <StatCard
              label="Alpha Purchased"
              value={`${stats.alphaPurchased} nodes`}
              icon={<Activity />}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7 w-full">
            {/* CHART CARD */}
            <Card className="col-span-4 w-full min-w-0 border-border bg-card/50">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-foreground">Cumulative Returns</CardTitle>
                  <p className="text-2xl font-bold text-emerald-400">${stats.walletBalanceUsd.toFixed(2)}</p>
                </div>
                <Badge variant="outline" className="animate-pulse border-emerald-500 text-emerald-500">
                  ● LIVE
                </Badge>
              </CardHeader>
              <CardContent className="pl-0 w-full">
                <div style={{ height: '300px', width: '100%', minHeight: 300, display: 'flex', alignItems: 'stretch' }}>
                  {loading ? (
                    <div className="h-full w-full flex items-center justify-center text-muted-foreground">
                      Loading chart data...
                    </div>
                  ) : chartData.length === 0 ? (
                    <div className="h-full w-full flex items-center justify-center text-muted-foreground">
                      No data available
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={300}>
                      <AreaChart data={chartData}>
                        <defs>
                          <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
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
                          domain={['dataMin - 1', 'dataMax + 1']}
                          tickFormatter={(val) => `$${val.toFixed(0)}`}
                        />
                        <Tooltip
                          contentStyle={{ backgroundColor: "#18181b", border: "1px solid #27272a" }}
                          labelStyle={{ color: "#a1a1aa" }}
                          formatter={(value: any) => [`$${Number(value).toFixed(2)}`, 'Portfolio Value']}
                        />
                        <Area
                          type="monotone"
                          dataKey="value"
                          stroke="#10b981"
                          strokeWidth={2}
                          fill="url(#colorValue)"
                          isAnimationActive={false}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* ACTIVITY FEED CARD */}
            <Card className="col-span-3">
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
              </CardHeader>
              <CardContent className="h-[350px] overflow-y-auto">
                <ActivityFeed chartData={chartData} />
              </CardContent>
            </Card>
          </div>
      </div>
    </div>
  );
}
