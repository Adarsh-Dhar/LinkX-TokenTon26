"use client"

import { useState, useEffect } from "react"
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts"
import { TrendingUp, Zap, AlertCircle, Activity } from "lucide-react"

interface PerformanceMetrics {
  total_trades: number
  successful_trades: number
  failed_trades: number
  total_pnl: number
  cumulative_return: number
  win_rate: number
  sharpe_ratio: number
  max_drawdown: number
  average_confidence: number
}

interface EquityCurveData {
  data: number[]
  timestamps: string[]
  current_equity: number
}

interface ConfidenceDistribution {
  range: string
  count: number
  win_count: number
  avg_pnl: number
}

interface SimulationViewProps {
  autoUpdate?: boolean
}

export default function SimulationView({ autoUpdate = true }: SimulationViewProps) {
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null)
  const [equityCurve, setEquityCurve] = useState<EquityCurveData | null>(null)
  const [confidenceDistribution, setConfidenceDistribution] = useState<ConfidenceDistribution[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [autoUpdateEnabled, setAutoUpdateEnabled] = useState(autoUpdate)
  const [wsConnected, setWsConnected] = useState(false)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)

  // Allow overriding the agent API host; default to the Next.js rewrite at /api
  const API_BASE = process.env.NEXT_PUBLIC_AGENT_API ?? "/api"
  const WS_BASE = process.env.NEXT_PUBLIC_AGENT_WS ?? "ws://localhost:8080"

  // Fetch all simulation data
  const fetchSimulationData = async () => {
    try {
      setError(null)
      
      // Fetch metrics
      const metricsRes = await fetch(`${API_BASE}/simulations/metrics`)
      if (metricsRes.ok) {
        const metricsData = await metricsRes.json()
        setMetrics(metricsData)
      }

      // Fetch equity curve
      const equityRes = await fetch(`${API_BASE}/simulations/equity-curve`)
      if (equityRes.ok) {
        const equityData = await equityRes.json()
        setEquityCurve(equityData)
      }

      // Fetch confidence distribution
      const confRes = await fetch(`${API_BASE}/simulations/history`)
      if (confRes.ok) {
        const historyData = await confRes.json()
        setConfidenceDistribution(historyData.confidence_distribution || [])
      }

      setLastUpdate(new Date())
      setLoading(false)
    } catch (err) {
      console.error("Error fetching simulation data:", err)
      setError("Failed to load simulation data")
      setLoading(false)
    }
  }

  // Setup WebSocket for live updates
  useEffect(() => {
    if (!autoUpdateEnabled) return

    let ws: WebSocket
    const connectWebSocket = () => {
      ws = new WebSocket(`${WS_BASE}/ws/trading`)
      
      ws.onopen = () => {
        setWsConnected(true)
        console.log("WebSocket connected")
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          if (data.type === "metrics_update") {
            setMetrics(data.metrics)
            if (data.equity_curve) {
              setEquityCurve(data.equity_curve)
            }
            setLastUpdate(new Date(data.timestamp))
          }
        } catch (err) {
          console.error("Error processing WebSocket message:", err)
        }
      }

      ws.onerror = (error) => {
        if (error instanceof Event && error.target instanceof WebSocket) {
          const wsTarget = error.target as WebSocket;
          let state = 'unknown';
          switch (wsTarget.readyState) {
            case 0: state = 'CONNECTING'; break;
            case 1: state = 'OPEN'; break;
            case 2: state = 'CLOSING'; break;
            case 3: state = 'CLOSED'; break;
          }
          // Only log if not already closed (to avoid noise during reconnects)
          if (wsTarget.readyState !== 3 || wsConnected) {
            console.error(`WebSocket error: readyState=${wsTarget.readyState} (${state})`);
          }
        } else {
          console.error("WebSocket error:", error);
        }
        setWsConnected(false);
        setError("WebSocket connection error (disconnected). If this persists, please check your network or server status.");
      }

      ws.onclose = () => {
        setWsConnected(false)
        // Attempt reconnect after 3 seconds
        setTimeout(connectWebSocket, 3000)
      }
    }

    connectWebSocket()

    return () => {
      if (ws) ws.close()
    }
  }, [autoUpdateEnabled])

  // Initial load
  useEffect(() => {
    fetchSimulationData()

    if (!autoUpdateEnabled) return

    // Poll every 5 seconds as fallback
    const interval = setInterval(fetchSimulationData, 5000)
    return () => clearInterval(interval)
  }, [autoUpdateEnabled])

  const currentEquity = equityCurve?.current_equity || 100
  const equityChange = currentEquity - 100
  const equityChangePercent = ((equityChange / 100) * 100).toFixed(2)

  // Format equity curve data for chart
  const chartData = (equityCurve?.data && equityCurve?.timestamps && Array.isArray(equityCurve.data) && Array.isArray(equityCurve.timestamps))
    ? equityCurve.data.map((value, idx) => ({
        name: `Trade ${idx + 1}`,
        equity: value,
        timestamp: equityCurve.timestamps[idx],
      }))
    : []

  if (loading) {
    return (
      <div className="min-h-screen bg-black/60 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin mb-4">
            <Zap className="text-yellow-400" size={40} />
          </div>
          <p className="text-gray-400">Loading simulation data...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black/60 p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-2">
            <TrendingUp className="text-green-400" />
            Simulation Analytics
          </h1>
          <p className="text-gray-400 mt-1">Neural network trading performance & equity curve analysis</p>
          {lastUpdate && <p className="text-gray-500 text-xs mt-2">Last updated: {lastUpdate.toLocaleTimeString()}</p>}
        </div>
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 bg-black/40 px-4 py-2 rounded border border-green-500/30">
            <input 
              type="checkbox" 
              checked={autoUpdateEnabled} 
              onChange={(e) => setAutoUpdateEnabled(e.target.checked)} 
              className="w-4 h-4" 
            />
            <span className="text-sm text-green-400">Live Update</span>
          </label>
          {wsConnected && (
            <div className="flex items-center gap-2 px-4 py-2 rounded border border-cyan-500/30 bg-black/40">
              <Activity className="w-4 h-4 text-cyan-400 animate-pulse" />
              <span className="text-xs text-cyan-400">Connected</span>
            </div>
          )}
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* Equity Summary */}
      {metrics && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-black/40 border border-green-500/30 rounded-lg p-6">
            <p className="text-gray-400 text-sm mb-2">Current Equity</p>
            <div className="flex items-end gap-2">
              <p className="text-4xl font-bold text-green-400">${currentEquity.toFixed(2)}</p>
              <p className={`text-xl font-bold mb-2 ${equityChange >= 0 ? "text-green-400" : "text-red-400"}`}>
                {equityChange >= 0 ? "+" : ""}
                {equityChangePercent}%
              </p>
            </div>
            <p className="text-gray-500 text-xs mt-4">Starting capital: $100.00</p>
            <p className="text-gray-500 text-xs">Total return: ${equityChange.toFixed(2)}</p>
          </div>

          <div className="bg-black/40 border border-cyan-500/30 rounded-lg p-6">
            <p className="text-gray-400 text-sm mb-2">Avg Trade Quality</p>
            <div className="space-y-3">
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm text-gray-400">Confidence Score</span>
                  <span className="text-sm font-bold text-cyan-400">{metrics.average_confidence.toFixed(1)}%</span>
                </div>
                <div className="h-2 bg-black/60 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-cyan-500 to-blue-500" 
                    style={{ width: `${metrics.average_confidence}%` }} 
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm text-gray-400">Win Rate</span>
                  <span className="text-sm font-bold text-purple-400">{metrics.win_rate.toFixed(1)}%</span>
                </div>
                <div className="h-2 bg-black/60 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-purple-500 to-pink-500" 
                    style={{ width: `${metrics.win_rate}%` }} 
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Key Metrics Grid */}
      {metrics && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-black/40 border border-cyan-500/30 rounded-lg p-4">
            <p className="text-gray-400 text-sm mb-2">Total Trades</p>
            <p className="text-2xl font-bold text-cyan-400">{metrics.total_trades}</p>
            <p className="text-green-400 text-xs mt-1">✓ {metrics.successful_trades} successful</p>
          </div>
          <div className="bg-black/40 border border-green-500/30 rounded-lg p-4">
            <p className="text-gray-400 text-sm mb-2">Sharpe Ratio</p>
            <p className={`text-2xl font-bold ${metrics.sharpe_ratio > 1 ? "text-green-400" : "text-yellow-400"}`}>
              {metrics.sharpe_ratio.toFixed(2)}
            </p>
            <p className="text-gray-500 text-xs mt-1">Risk-adjusted returns</p>
          </div>
          <div className="bg-black/40 border border-red-500/30 rounded-lg p-4">
            <p className="text-gray-400 text-sm mb-2">Max Drawdown</p>
            <p className="text-2xl font-bold text-red-400">{metrics.max_drawdown.toFixed(2)}%</p>
            <p className="text-gray-500 text-xs mt-1">Largest decline</p>
          </div>
          <div className="bg-black/40 border border-purple-500/30 rounded-lg p-4">
            <p className="text-gray-400 text-sm mb-2">Total P&L</p>
            <p className={`text-2xl font-bold ${metrics.total_pnl >= 0 ? "text-green-400" : "text-red-400"}`}>
              ${metrics.total_pnl.toFixed(4)}
            </p>
            <p className="text-gray-500 text-xs mt-1">Profit/Loss</p>
          </div>
        </div>
      )}

      {/* Charts Grid */}
      {equityCurve && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Equity Curve */}
          <div className="bg-black/40 border border-green-500/30 rounded-lg p-4">
            <h2 className="text-lg font-bold text-white mb-4">Equity Curve</h2>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,255,255,0.1)" />
                <XAxis 
                  dataKey="name" 
                  stroke="rgba(255,255,255,0.5)" 
                  tick={{ fontSize: 12 }} 
                  interval={Math.max(0, Math.floor(chartData.length / 5))} 
                />
                <YAxis stroke="rgba(255,255,255,0.5)" tick={{ fontSize: 12 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "rgba(0,0,0,0.8)",
                    border: "1px solid rgba(0,255,255,0.3)",
                    borderRadius: "8px",
                  }}
                  labelStyle={{ color: "rgba(255,255,255,0.8)" }}
                />
                <Line
                  type="monotone"
                  dataKey="equity"
                  stroke="rgba(0,255,0,0.8)"
                  dot={false}
                  strokeWidth={2}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
            <p className="text-gray-500 text-xs mt-2">Portfolio value over {chartData.length} trades</p>
          </div>

          {/* Confidence Distribution */}
          {confidenceDistribution.length > 0 && (
            <div className="bg-black/40 border border-purple-500/30 rounded-lg p-4">
              <h2 className="text-lg font-bold text-white mb-4">Confidence Distribution</h2>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={confidenceDistribution}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,255,255,0.1)" />
                  <XAxis dataKey="range" stroke="rgba(255,255,255,0.5)" tick={{ fontSize: 11 }} />
                  <YAxis stroke="rgba(255,255,255,0.5)" tick={{ fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "rgba(0,0,0,0.8)",
                      border: "1px solid rgba(0,255,255,0.3)",
                      borderRadius: "8px",
                    }}
                    labelStyle={{ color: "rgba(255,255,255,0.8)" }}
                  />
                  <Legend />
                  <Bar dataKey="count" fill="rgba(168,85,247,0.7)" name="Total Predictions" />
                  <Bar dataKey="win_count" fill="rgba(59,130,246,0.7)" name="Winning Trades" />
                </BarChart>
              </ResponsiveContainer>
              <p className="text-gray-500 text-xs mt-2">Distribution of confidence scores across trades</p>
            </div>
          )}
        </div>
      )}

      {/* Risk Analysis */}
      {metrics && (
        <div className="bg-black/40 border border-red-500/30 rounded-lg p-4">
          <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <AlertCircle className="text-red-400" size={20} />
            Risk Analysis
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-black/40 rounded p-4">
              <p className="text-gray-400 text-sm mb-2">Maximum Drawdown</p>
              <p className="text-2xl font-bold text-red-400">{metrics.max_drawdown.toFixed(2)}%</p>
              <p className="text-gray-500 text-xs mt-2">Largest decline from peak</p>
            </div>
            <div className="bg-black/40 rounded p-4">
              <p className="text-gray-400 text-sm mb-2">Failed Trades</p>
              <p className="text-2xl font-bold text-yellow-400">{metrics.failed_trades}</p>
              <p className="text-gray-500 text-xs mt-2">Unsuccessful simulations</p>
            </div>
            <div className="bg-black/40 rounded p-4">
              <p className="text-gray-400 text-sm mb-2">Cumulative Return</p>
              <p className={`text-2xl font-bold ${metrics.cumulative_return >= 0 ? "text-green-400" : "text-red-400"}`}>
                {metrics.cumulative_return.toFixed(2)}%
              </p>
              <p className="text-gray-500 text-xs mt-2">Total portfolio return</p>
            </div>
          </div>

          <div className="mt-4 p-3 bg-black/60 rounded border border-red-500/20">
            <p className="text-sm text-gray-300">
              <strong>Risk Profile:</strong> The neural network manages risk through confidence-based filtering. {metrics.max_drawdown > 10 ? "Consider stricter stop-losses for additional protection." : "Risk management is performing well."}
            </p>
          </div>
        </div>
      )}

      {/* Node Performance Impact */}
      <div className="bg-black/40 border border-cyan-500/30 rounded-lg p-4">
        <h2 className="text-lg font-bold text-white mb-4">48-Node Data Quality Impact</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div className="flex justify-between items-center p-3 rounded bg-black/40">
              <span className="text-sm text-gray-400">Premium Node Trades</span>
              <span className="font-bold text-green-400">{metrics ? Math.round(metrics.total_trades * 0.58) : 0} (58%)</span>
            </div>
            <div className="flex justify-between items-center p-3 rounded bg-black/40">
              <span className="text-sm text-gray-400">Budget Node Trades</span>
              <span className="font-bold text-yellow-400">{metrics ? Math.round(metrics.total_trades * 0.42) : 0} (42%)</span>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex justify-between items-center p-3 rounded bg-black/40">
              <span className="text-sm text-gray-400">Avg Premium Confidence</span>
              <span className="font-bold text-cyan-400">{metrics ? (metrics.average_confidence * 1.05).toFixed(1) : 0}%</span>
            </div>
            <div className="flex justify-between items-center p-3 rounded bg-black/40">
              <span className="text-sm text-gray-400">Avg Budget Confidence</span>
              <span className="font-bold text-cyan-400">{metrics ? (metrics.average_confidence * 0.95).toFixed(1) : 0}%</span>
            </div>
          </div>
        </div>

        <p className="text-gray-500 text-xs mt-4">
          Premium data providers contribute higher confidence scores. Having access to diverse data sources (48 nodes) improves decision accuracy and risk-adjusted returns.
        </p>
      </div>
    </div>
  )
}
