
"use client";

import { useEffect, useState, useRef } from "react";
import { Terminal } from "lucide-react";

interface LogEntry {
  timestamp: string;
  message: string;
  type: "info" | "success" | "error" | "warning";
}

export default function LiveTerminal() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Poll for logs every 2 seconds
  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const res = await fetch("http://localhost:8080/system/logs"); // Adjust port if needed
        if (res.ok) {
          const newLogs = await res.json();
          setLogs(newLogs);
        }
      } catch (e) {
        // Silent fail (offline)
      }
    };

    fetchLogs();
    const interval = setInterval(fetchLogs, 2000);
    return () => clearInterval(interval);
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div className="flex flex-col h-full bg-background border border-border rounded-lg font-mono text-xs shadow-2xl">
      {/* Header */}
      <div className="flex items-center px-4 py-2 bg-card border-b border-border">
        <Terminal className="w-4 h-4 text-green-500 mr-2" />
        <span className="text-gray-400">Agent Terminal (Live)</span>
        <div className="ml-auto flex items-center space-x-2">
           <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
           <span className="text-green-500 text-[10px]">ONLINE</span>
        </div>
      </div>

      {/* Log Area */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-1.5 scrollbar-thin scrollbar-thumb-gray-700"
      >
        {logs.length === 0 && (
          <div className="text-gray-600 italic">Waiting for agent activity...</div>
        )}
        
        {logs.map((log, i) => (
          <div key={i} className="flex">
            <span className="text-gray-600 mr-3">[{log.timestamp}]</span>
            <span className={`
              ${log.type === 'error' ? 'text-red-400' : ''}
              ${log.type === 'success' ? 'text-green-400' : ''}
              ${log.type === 'warning' ? 'text-yellow-400' : ''}
              ${log.type === 'info' ? 'text-gray-300' : ''}
            `}>
              {log.type === 'info' && '> '}
              {log.message}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
