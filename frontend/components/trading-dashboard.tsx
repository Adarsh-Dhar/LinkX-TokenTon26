"use client"

import { useState, useEffect } from "react"
import { Activity, TrendingUp, TrendingDown, Zap, AlertCircle, CheckCircle } from "lucide-react"

interface NodeStatus {
  node_id: number
  port: number
  category: string
  provider_type: string
  status: string
  last_updated: string
  data_freshness_ms: number
}

interface TradeSimulation {
  simulation_id: string
  timestamp: string
  token_in: string
  token_out: string
  amount_in: number
  predicted_amount_out: number
  entry_price: number
  exit_price: number
  confidence: number
  neural_decision: string
  reasoning: string
  nodes_used: string[]
}

interface PerformanceMetrics {
  total_trades: number
  successful_trades: number
  failed_trades: number
  cumulative_pnl: number
  win_rate: number
  sharpe_ratio: number
  max_drawdown: number
  average_confidence: number
}

export default function TradingDashboard() {
  const [nodesStatus, setNodesStatus] = useState<NodeStatus[]>([])
  const [recentTrades, setRecentTrades] = useState<TradeSimulation[]>([])
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedTrade, setSelectedTrade] = useState<TradeSimulation | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [refreshInterval, setRefreshInterval] = useState(5000) // 5 seconds

  // Fetch nodes status
  const fetchNodesStatus = async () => {
    try {
      const response = await fetch("/api/nodes/status")
      if (response.ok) {
        const data = await response.json()
        setNodesStatus(data.nodes || [])
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Error fetching nodes status:", error)
    }
  }

  // Fetch trade history and metrics
  const fetchTradesAndMetrics = async () => {
    try {
      // Fetch recent trades
      const tradesRes = await fetch("/api/simulations/recent?limit=5")
      if (tradesRes.ok) {
        const tradesData = await tradesRes.json()
        setRecentTrades(tradesData)
      }

      // Fetch metrics
      const metricsRes = await fetch("/api/simulations/metrics")
      if (metricsRes.ok) {
        const metricsData = await metricsRes.json()
        setMetrics(metricsData)
        // Log the latest portfolio value
        console.log("Latest Portfolio Value (P&L):", metricsData.cumulative_pnl)
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Error fetching trades:", error)
    }
  }

  // Initial load
  useEffect(() => {
    const loadDashboard = async () => {
      setLoading(true)
      await fetchNodesStatus()
      await fetchTradesAndMetrics()
      setLoading(false)
    }

    loadDashboard()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return

    const interval = setInterval(() => {
      fetchNodesStatus()
      fetchTradesAndMetrics()
    }, refreshInterval)

    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, refreshInterval])

  const onlineNodes = nodesStatus.filter((n) => n.status === "online").length
  const categories = Array.from(new Set(nodesStatus.map((n) => n.category)))
  const avgLatency = nodesStatus.length > 0 ? nodesStatus.reduce((sum, n) => sum + n.data_freshness_ms, 0) / nodesStatus.length : 0

  return (
    <div className="min-h-screen bg-black/60 p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-2">
            <Zap className="text-yellow-400" />
            Trading Dashboard
          </h1>
          <p className="text-gray-400 mt-1">Real-time agent trading with 48-node ecosystem</p>
        </div>
        <div className="flex gap-2">
          <label className="flex items-center gap-2 bg-black/40 px-4 py-2 rounded border border-green-500/30">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="w-4 h-4"
            />
            <span className="text-sm text-green-400">Auto Refresh</span>
          </label>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Nodes Status */}
        <div className="bg-black/40 border border-cyan-500/30 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">Connected Nodes</p>
              <p className="text-2xl font-bold text-cyan-400">{onlineNodes}/48</p>
            </div>
            <Activity className="text-cyan-400" size={32} />
          </div>
          <p className="text-gray-500 text-xs mt-2">Avg Latency: {avgLatency.toFixed(0)}ms</p>
        </div>

        {/* Win Rate */}
        <div className="bg-black/40 border border-green-500/30 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">Win Rate</p>
              <p className="text-2xl font-bold text-green-400">{metrics?.win_rate ? (metrics.win_rate * 100).toFixed(1) : "0.0"}%</p>
            </div>
            <CheckCircle className="text-green-400" size={32} />
          </div>
          <p className="text-gray-500 text-xs mt-2">
            {metrics?.successful_trades ?? 0} / {metrics?.total_trades ?? 0} trades
          </p>
        </div>

        {/* Total P&L */}
        <div className={`bg-black/40 border rounded-lg p-4 ${metrics && metrics.cumulative_pnl >= 0 ? "border-green-500/30" : "border-red-500/30"}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">Total P&L</p>
              <p className={`text-2xl font-bold ${metrics && metrics.cumulative_pnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                ${metrics?.cumulative_pnl !== undefined ? metrics.cumulative_pnl.toFixed(2) : "0.00"}
              </p>
            </div>
            {metrics && metrics.cumulative_pnl >= 0 ? (
              <TrendingUp className="text-green-400" size={32} />
            ) : (
              <TrendingDown className="text-red-400" size={32} />
            )}
          </div>
          <p className="text-gray-500 text-xs mt-2">Cumulative returns</p>
        </div>

        {/* Avg Confidence */}
        <div className="bg-black/40 border border-purple-500/30 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">Avg Confidence</p>
              <p className="text-2xl font-bold text-purple-400">{metrics ? (metrics.average_confidence * 100).toFixed(1) : "0.0"}%</p>
            </div>
            <Zap className="text-purple-400" size={32} />
          </div>
          <p className="text-gray-500 text-xs mt-2">Neural decision confidence</p>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Nodes Heatmap */}
        <div className="lg:col-span-1">
          <div className="bg-black/40 border border-cyan-500/30 rounded-lg p-4">
            <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <Zap size={20} />
              48-Node Network
            </h2>

            {/* Node Status Summary */}
            <div className="space-y-3 mb-4">
              {categories.map((category, idx) => {
                const categoryNodes = nodesStatus.filter((n) => n.category === category)
                const onlineCount = categoryNodes.filter((n) => n.status === "online").length
                return (
                  <div key={`${category}-${idx}`} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-400">{category}</span>
                      <span className="text-cyan-400 font-bold">
                        {onlineCount}/{categoryNodes.length}
                      </span>
                    </div>
                    <div className="h-2 bg-black/60 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all"
                        style={{ width: `${(onlineCount / categoryNodes.length) * 100}%` }}
                      />
                    </div>
                    {/* Add unique key for each node in categoryNodes */}
                    <div className="space-y-1 text-xs">
                      {categoryNodes.map((node) => (
                        <div
                          key={node.node_id}
                          className="flex justify-between items-center p-2 rounded bg-black/30 hover:bg-black/50"
                        >
                          <span className="text-gray-400">
                            Node {node.node_id} (
                              {node.provider_type?.[0]?.toUpperCase() ||
                                // @ts-expect-error
                                node.name?.[0]?.toUpperCase() ||
                                "N"}
                            )
                          </span>
                          <span
                            className={node.status === "online" ? "text-green-400" : "text-red-400"}
                          >
                            {node.status === "online" ? "●" : "○"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Detailed Nodes List */}
            <div className="bg-black/40 border border-cyan-500/20 rounded p-3 max-h-80 overflow-y-auto">
              <p className="text-xs text-gray-500 mb-2">Active Nodes</p>
              <div className="space-y-1 text-xs">
                {nodesStatus.slice(0, 15).map((node) => {
                  const providerType =
                    node.provider_type?.[0]?.toUpperCase() ||
                    // @ts-expect-error
                    node.name?.[0]?.toUpperCase() ||
                    "N"
                  return (
                    <div
                      key={node.node_id}
                      className="flex justify-between items-center p-2 rounded bg-black/30 hover:bg-black/50"
                    >
                      <span className="text-gray-400">
                        Node {node.node_id} ({providerType})
                      </span>
                      <span className={node.status === "online" ? "text-green-400" : "text-red-400"}>
                        {node.status === "online" ? "●" : "○"}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column - Trade Feed & Metrics */}
        <div className="lg:col-span-2 space-y-6">
          {/* Recent Trades */}
          <div className="bg-black/40 border border-green-500/30 rounded-lg p-4">
            <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <Activity size={20} />
              Live Trade Feed
            </h2>

            <div className="space-y-2 max-h-96 overflow-y-auto">
              {recentTrades.length > 0 ? (
                recentTrades.slice(0, 5).map((trade) => (
                  <div
                    key={trade.simulation_id}
                    onClick={() => setSelectedTrade(trade)}
                    className="p-3 rounded bg-black/40 border border-green-500/20 hover:border-green-500/50 cursor-pointer transition-all"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-2">
                        <div className={`px-2 py-1 rounded text-xs font-bold ${
                          trade.neural_decision === "BUY"
                            ? "bg-green-500/20 text-green-400"
                            : trade.neural_decision === "SELL"
                              ? "bg-red-500/20 text-red-400"
                              : "bg-yellow-500/20 text-yellow-400"
                        }`}>
                          {trade.neural_decision}
                        </div>
                        <span className="text-sm text-gray-300">
                          {trade.token_in} → {trade.token_out}
                        </span>
                      </div>
                      <span className="text-xs text-gray-500">{trade.simulation_id}</span>
                    </div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-400">{trade.amount_in.toFixed(2)} → {trade.predicted_amount_out.toFixed(2)}</span>
                      <span className={trade.confidence > 0.7 ? "text-green-400" : "text-yellow-400"}>
                        {(trade.confidence * 100).toFixed(0)}% confidence
                      </span>
                    </div>
                    <div className="w-full h-1 bg-black/60 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-cyan-500 to-green-500"
                        style={{ width: `${trade.confidence * 100}%` }}
                      />
                    </div>
                  </div>
                ))
              ) : (
                <div className="flex items-center justify-center p-8 text-gray-500">
                  <AlertCircle size={20} className="mr-2" />
                  No trades yet. Start trading to see activity.
                </div>
              )}
            </div>
          </div>

          {/* Performance Metrics */}
          <div className="bg-black/40 border border-purple-500/30 rounded-lg p-4">
            <h2 className="text-lg font-bold text-white mb-4">Performance Metrics</h2>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-black/40 rounded p-3">
                <p className="text-gray-400 text-xs mb-1">Sharpe Ratio</p>
                <p className="text-xl font-bold text-purple-400">{metrics?.sharpe_ratio !== undefined ? metrics.sharpe_ratio.toFixed(2) : "—"}</p>
              </div>
              <div className="bg-black/40 rounded p-3">
                <p className="text-gray-400 text-xs mb-1">Max Drawdown</p>
                <p className="text-xl font-bold text-red-400">{metrics?.max_drawdown !== undefined ? (metrics.max_drawdown * 100).toFixed(1) : "—"}%</p>
              </div>
              <div className="bg-black/40 rounded p-3 col-span-2">
                <p className="text-gray-400 text-xs mb-1">Nodes Used in Analysis</p>
                <p className="text-sm text-cyan-400">{onlineNodes} active nodes providing real-time market data</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Selected Trade Details Modal */}
      {selectedTrade && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50"
          onClick={() => setSelectedTrade(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="bg-black/90 border border-cyan-500/50 rounded-lg p-6 max-w-2xl w-full max-h-96 overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-xl font-bold text-white mb-4">Trade Details: {selectedTrade.simulation_id}</h3>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <p className="text-gray-400 text-sm">Decision</p>
                <p className={`text-lg font-bold ${selectedTrade.neural_decision === "BUY" ? "text-green-400" : selectedTrade.neural_decision === "SELL" ? "text-red-400" : "text-yellow-400"}`}>
                  {selectedTrade.neural_decision}
                </p>
              </div>
              <div>
                <p className="text-gray-400 text-sm">Confidence</p>
                <p className="text-lg font-bold text-purple-400">{(selectedTrade.confidence * 100).toFixed(1)}%</p>
              </div>
              <div>
                <p className="text-gray-400 text-sm">Entry Price</p>
                <p className="text-lg font-bold text-cyan-400">${selectedTrade.entry_price.toFixed(4)}</p>
              </div>
              <div>
                <p className="text-gray-400 text-sm">Exit Price</p>
                <p className="text-lg font-bold text-cyan-400">${selectedTrade.exit_price.toFixed(4)}</p>
              </div>
            </div>

            <div className="bg-black/40 rounded p-3 mb-4">
              <p className="text-gray-400 text-sm mb-2">Reasoning</p>
              <p className="text-sm text-gray-300">{selectedTrade.reasoning}</p>
            </div>

            <button
              type="button"
              onClick={() => setSelectedTrade(null)}
              className="w-full bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/50 text-cyan-400 py-2 rounded transition-all"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
