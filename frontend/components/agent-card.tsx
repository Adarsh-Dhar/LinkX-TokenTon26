"use client"

import { useEffect, useState } from "react"
import { Play, Square } from "lucide-react"

export default function AgentCard() {
  const [isRunning, setIsRunning] = useState(false)
  const [network, setNetwork] = useState("unknown")
  const [rawStatus, setRawStatus] = useState<{ status: string, network: string } | null>(null)

  useEffect(() => {
    async function fetchStatus() {
      try {
        const res = await fetch("/api/agent-status");
        const data = await res.json();
        setIsRunning(data.status === "online" || data.status === "running");
        setNetwork(data.network || "unknown");
        setRawStatus(data);
      } catch {
        setIsRunning(false);
        setNetwork("unknown");
        setRawStatus(null);
      }
    }
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="glass glow-accent p-6 rounded-lg border border-border/30">
      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <div className={`w-3 h-3 rounded-full ${isRunning ? "bg-green-500 animate-pulse" : "bg-red-500"}`}></div>
        Active Agents
      </h3>

      <div className="space-y-4">
        <div className="bg-black/40 p-4 rounded-lg border border-secondary/30">
          <p className="text-sm font-mono text-secondary mb-3">VVS_WHALE_WATCHER_BOT</p>
          <p className="text-xs text-muted-foreground mb-1">Status: {isRunning ? "Online" : "Offline"}</p>
          <p className="text-xs text-muted-foreground mb-4">Network: {network}</p>
          <pre className="text-xs text-muted-foreground bg-black/20 p-2 rounded mt-2">{rawStatus ? JSON.stringify(rawStatus, null, 2) : "No status"}</pre>
          <button
            onClick={() => setIsRunning(!isRunning)}
            className={`w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg transition-all text-sm font-medium ${
              isRunning
                ? "bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30"
                : "bg-green-500/20 hover:bg-green-500/30 text-green-400 border border-green-500/30"
            }`}
          >
            {isRunning ? <Square size={16} /> : <Play size={16} />}
            {isRunning ? "Stop Agent" : "Start Agent"}
          </button>
        </div>
      </div>
    </div>
  )
}
