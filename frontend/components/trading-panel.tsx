"use client"

import { useState } from "react"
import { Send, Play, AlertCircle, CheckCircle, Loader } from "lucide-react"

interface TradeRequest {
  token_in: string
  token_out: string
  amount: number
  simulate_only: boolean
}

interface SimulationResult {
  success: boolean
  tx_hash?: string // Add this
  simulation: {
    simulation_id: string
    timestamp: string
    token_in: string
    token_out: string
    amount_in: number
    predicted_amount_out: number
    confidence: number
    neural_decision: string
    reasoning: string
  }
  nodes_used_count?: number
}

export default function TradingPanel() {
  const [tokenIn, setTokenIn] = useState("SOL")
  const [tokenOut, setTokenOut] = useState("USDC")
  const [amount, setAmount] = useState<number | "">(100)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [recentTrades, setRecentTrades] = useState<any[]>([])

  const API_BASE = process.env.NEXT_PUBLIC_AGENT_API ?? "/api"

  const handleRealTrade = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`${API_BASE}/trade/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token_in: tokenIn, // 'SOL' for native SOL
          token_out: tokenOut,
          amount: typeof amount === "number" ? amount : 0,
          simulate_only: false,
          slippage_tolerance: 1.0,
        }),
      })

      let data = null
      let text = await response.text()
      try {
        data = JSON.parse(text)
      } catch (jsonErr) {
        // If response is not valid JSON (e.g., Internal Server Error HTML)
        console.error("Non-JSON response from backend:", text)
        setError("Backend returned invalid JSON. Possible server error.\n" + text.slice(0, 200))
        setResult(null)
        return
      }

      if (data && (data.success === false || data.error)) {
        console.error("Trade failed:", data)
        let backendError = data.error || data.detail || "Trade execution failed"
        let reason = ""
        if (backendError.includes("Could not transact with/call contract")) {
          reason = `Possible causes:\n- Contract address is wrong or not deployed on this chain\n- Chain/RPC is not synced or unreliable\n- Contract ABI or method is incorrect\n- Wallet/account has insufficient funds or permissions\n\nBackend error: ${backendError}`
        } else {
          reason = backendError
        }
        setError(reason)
        setResult(null)
      }
      else if (response.ok && (data.tx_hash || data.transaction_hash)) {
        setResult({ ...data, tx_hash: data.tx_hash || data.transaction_hash })
        setError(null)
        await fetchRecentTrades()
      } 
      else {
        setResult(null)
        setError("No transaction hash returned. Check backend logs.")
      }

    } catch (err) {
      console.error("Error:", err)
      setError("Failed to connect to trading server")
    } finally {
      setLoading(false)
    }
  }

  const fetchRecentTrades = async () => {
    try {
      const response = await fetch(`${API_BASE}/simulations/recent?limit=5`)
      if (response.ok) {
        const trades = await response.json()
        setRecentTrades(trades)
      }
    } catch (err) {
      console.error("Error fetching recent trades:", err)
    }
  }

  return (
    <div className="w-96 bg-black/60 border-l border-cyan-500/30 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="bg-black/80 border-b border-cyan-500/30 p-4">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <Send className="w-5 h-5 text-cyan-400" />
          Trade Executor
        </h2>
      </div>

      {/* Form */}
      <form onSubmit={handleRealTrade} className="p-4 space-y-4 flex-1 overflow-y-auto">
        <div>
          <label className="block text-sm text-gray-400 mb-2">From Token</label>
          <select value={tokenIn} onChange={(e) => setTokenIn(e.target.value)} className="w-full bg-black/40 border border-cyan-500/30 rounded px-3 py-2 text-white bg-black/40 focus:border-cyan-500 focus:outline-none">
            <option value="SOL">SOL (Native SOL)</option>
            <option value="WRAPPED_SOL">WRAPPED_SOL (Wrapped SOL)</option>
          </select>
          <p className="text-xs text-gray-500 mt-1">SOL is the native Solana token. Use WRAPPED_SOL for wrapped SOL.</p>
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-2">To Token</label>
          <select value={tokenOut} onChange={(e) => setTokenOut(e.target.value)} className="w-full bg-black/40 border border-cyan-500/30 rounded px-3 py-2 text-white bg-black/40 focus:border-cyan-500 focus:outline-none">
            <option value="USDC">USDC</option>
            <option value="WRAPPED_SOL">WRAPPED_SOL (Wrapped SOL)</option>
          </select>
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-2">Amount</label>
          <input 
            type="number" 
            value={amount === "" ? "" : amount}
            onChange={(e) => {
              const val = e.target.value;
              setAmount(val === "" ? "" : parseFloat(val));
            }}
            className="w-full bg-black/40 border border-cyan-500/30 rounded px-3 py-2 text-white bg-black/40 focus:border-cyan-500 focus:outline-none" 
            min="0"
            step="0.01"
          />
        </div>

        <button 
          type="submit" 
          disabled={loading} 
          className="w-full bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 disabled:opacity-50 text-white font-bold py-2 rounded flex items-center justify-center gap-2 transition-all"
        >
          {loading ? (
            <>
              <Loader className="w-4 h-4 animate-spin" />
              Executing...
            </>
          ) : (
            <>
              <CheckCircle className="w-4 h-4" />
              Execute Real Trade
            </>
          )}
        </button>
      </form>

      {/* Results */}
      <div className="border-t border-cyan-500/30 flex flex-col flex-1 overflow-y-auto">
        {error && (
          <div className="p-4 bg-red-500/10 border-b border-red-500/30 text-red-400 text-sm flex gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div className="break-words w-full">{error}</div>
          </div>
        )}

        {result && result.tx_hash && (
          <div className="p-4 space-y-3 bg-black/40 border-b border-green-500/30">
            <div className="bg-black/60 rounded p-3">
              <p className="text-xs text-gray-400 mb-1">Transaction Hash</p>
              <p className="text-xs font-mono text-cyan-400 break-all">{result.tx_hash}</p>
            </div>
            <div className="bg-black/60 rounded p-3">
              <p className="text-xs text-gray-400 mb-1">Neural Decision</p>
              <p className={`text-lg font-bold ${
                result.simulation?.neural_decision === "BUY" ? "text-green-400" : 
                result.simulation?.neural_decision === "SELL" ? "text-red-400" : "text-yellow-400"
              }`}>
                {result.simulation?.neural_decision}
              </p>
            </div>
            <div className="bg-black/60 rounded p-3">
              <p className="text-xs text-gray-400 mb-1">Predicted Output</p>
              <p className="text-base font-bold text-white">{result.simulation ? result.simulation.predicted_amount_out.toFixed(6) : "-"} {tokenOut}</p>
            </div>
          </div>
        )}

        {recentTrades.length > 0 && (
          <div className="p-4 space-y-2">
            <p className="text-xs font-bold text-gray-400 uppercase">Recent Trades</p>
            {recentTrades.map((trade, idx) => (
              <div key={idx} className="bg-black/40 rounded p-2 border border-cyan-500/10">
                <div className="flex justify-between items-start mb-1">
                  <span className="text-xs text-cyan-400 font-mono">{trade.simulation_id}</span>
                  <span className={`text-xs font-bold ${trade.status === "completed" ? "text-green-400" : "text-yellow-400"}`}>
                    {trade.status}
                  </span>
                </div>
                <p className="text-xs text-gray-400">
                  {trade.token_in} → {trade.token_out} ({trade.amount_in})
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}