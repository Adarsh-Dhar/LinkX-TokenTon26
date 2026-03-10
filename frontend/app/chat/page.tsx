"use client"

import { useState, useRef, useEffect } from "react"
import { Send, MessageCircle, Zap } from "lucide-react"

interface Message {
  id: string
  type: "user" | "agent"
  content: string
  timestamp: Date
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      type: "agent",
      content:
        "👋 Welcome to Alpha-Consumer! I'm your AI trading agent. I can help you with:\n\n📋 Commands:\n  • 'sol balance' or 'check balance' - Check your balances\n  • 'swap 1 usdc to vvs' - Execute a swap\n  • 'get signals' - Get trading signals\n  • 'portfolio value' - Check portfolio value\n  • 'estimate swap 10 usdc to vvs' - Estimate a swap\n\nWhat would you like to do?",
      timestamp: new Date(),
    },
  ])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const generateAgentResponse = (userMessage: string): string => {
    const lowerMessage = userMessage.toLowerCase()

    // Balance check
    if (
      lowerMessage.includes("balance") ||
      lowerMessage.includes("check balance")
    ) {
      if (lowerMessage.includes("sol") || lowerMessage.includes("wrapped")) {
        return "💰 Wrapped SOL Balance: 41.148926 WRAPPED_SOL\n\nCurrent Value: ~$1,230.00"
      }
      return "📊 Your Balances:\n\n  • WRAPPED_SOL: 41.148926 WRAPPED_SOL (~$1,230.00)\n  • USDC: 500.00 USDC\n  • VVS: 150.50 VVS (~$45.15)\n\nTotal Portfolio Value: $1,775.15"
    }

    // Swap execution
    if (lowerMessage.includes("swap") && !lowerMessage.includes("estimate")) {
      const swapMatch = lowerMessage.match(
        /(\d+(?:\.\d+)?)\s*(\w+)\s*to\s*(\w+)/i
      )
      if (swapMatch) {
        const [, amount, fromToken, toToken] = swapMatch
        const vvsAmount = parseFloat(amount) * 55 // Mock conversion rate
        return `✅ Swap executed: ${amount} ${fromToken.toUpperCase()} → ${vvsAmount.toFixed(2)} ${toToken.toUpperCase()}\n\nTransaction Hash: 4f6feed727c6bbfc0782a1c98e5d4cb6e3d2a1f5abc123def4567890fedcba9876543210\n\nStatus: Confirmed ✓\n\nFee: 0.3% (${(parseFloat(amount) * 0.003).toFixed(2)} ${fromToken.toUpperCase()})`
      }
      return "❓ How much would you like to swap? (e.g., 'swap 10 usdc to vvs')"
    }

    // Estimate swap
    if (lowerMessage.includes("estimate")) {
      const estimateMatch = lowerMessage.match(
        /(\d+(?:\.\d+)?)\s*(\w+)\s*to\s*(\w+)/i
      )
      if (estimateMatch) {
        const [, amount, fromToken, toToken] = estimateMatch
        const vvsAmount = parseFloat(amount) * 55 // Mock conversion rate
        const minWithSlippage = vvsAmount * 0.99 // 1% slippage
        return `📊 Swap Estimate:\n\n  ${amount} ${fromToken.toUpperCase()} → ${vvsAmount.toFixed(2)} ${toToken.toUpperCase()}\n\nMin (with 1% slippage): ${minWithSlippage.toFixed(2)} ${toToken.toUpperCase()}\n\nFee: 0.3%\n\nReady to execute? Just say 'swap ${amount} ${fromToken} to ${toToken}'`
      }
      return "📊 Estimate what? (e.g., 'estimate swap 10 usdc to vvs')"
    }

    // Trading signals
    if (
      lowerMessage.includes("signal") ||
      lowerMessage.includes("signal") ||
      lowerMessage.includes("trading")
    ) {
      return `📊 Trading Signals (2 active):\n\n  • {'ticker': 'SOL', 'signal': 'BUY', 'confidence': 0.85, 'sentiment': 'bullish', 'recommended_action': 'ACCUMULATE'}\n\n  • {'ticker': 'VVS', 'signal': 'BUY', 'confidence': 0.78, 'sentiment': 'bullish', 'recommended_action': 'BUY', 'amount_usdc': 5, 'reason': 'Strong accumulation pattern detected. Volume surge on VVS Finance.'}\n\nWould you like to act on any of these signals?`
    }

    // Portfolio value
    if (lowerMessage.includes("portfolio")) {
      return "📈 Portfolio Value: $1,775.15\n\nBreakdown:\n  • WRAPPED_SOL Holdings: $1,230.00 (69.3%)\n  • USDC Holdings: $500.00 (28.1%)\n  • VVS Holdings: $45.15 (2.5%)\n\n24h Change: +2.3% 📈"
    }

    // Exit/quit
    if (lowerMessage.includes("exit") || lowerMessage.includes("quit")) {
      return "👋 Goodbye! Your trading session has been saved. See you next time!"
    }

    // Default response
    return `🤔 I'm not sure about "${userMessage}". Try one of these commands:\n\n  • 'sol balance' - Check Wrapped SOL balance\n  • 'swap 10 usdc to vvs' - Execute swap\n  • 'get signals' - Trading signals\n  • 'portfolio value' - Portfolio overview\n  • 'estimate swap' - Estimate trades\n\nOr just ask me anything about your trading!`
  }

  const handleSendMessage = async () => {
    if (!input.trim()) return

    // Add user message
    const userMsg: Message = {
      id: Date.now().toString(),
      type: "user",
      content: input,
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMsg])
    const userInput = input
    setInput("")
    setIsLoading(true)

    try {
      // Call the agent API
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userInput }),
      })

      let data;
      try {
        data = await response.json();
      } catch (e) {
        // If not JSON, fallback to text
        const text = await response.text();
        data = { response: `⚠️ API returned non-JSON response: ${text}` };
      }

      // Enhanced buy node response handling
      let content = data.response || data.reply || "No response from agent";
      // Always try to extract and display tx hash for any purchase/success message
      if (
        content.match(/(PAYMENT SUCCESSFUL|transaction (complete|successful)|purchased)/i)
      ) {
        // Print raw backend response for debugging
        // eslint-disable-next-line no-console
        console.log('Raw backend response:', data);
        // Try to extract the tx hash from the response (various formats)
        const txMatch =
          content.match(/x402 Transaction: `([^`]+)`/i) ||
          content.match(/Transaction Hash: ([0xA-Fa-f0-9]{10,})/i) ||
          content.match(/tx(hash)?:\s*([0xA-Fa-f0-9]{10,})/i);
        const txHash = txMatch ? (txMatch[1] || txMatch[2]) : null;
        // Print extracted hash for debugging
        // eslint-disable-next-line no-console
        console.log('Extracted txHash:', txHash);
        if (txHash && txHash !== 'N/A') {
          content += `\n\nTransaction Hash: ${txHash}`;
        } else {
          content += `\n\nTransaction Hash: NOT_FOUND`;
        }
      }

      // Log transfer amount and current balance if transfer amount exceeds balance error
      if (
        content.includes('transfer amount exceeds balance') && typeof data === 'object'
      ) {
        let debugJson = null;
        let txData = null;
        let transferAmountSOL = null;
        let balanceSOL = null;
        // Try to extract from Debug Data block
        if (data.response && data.response.includes('Debug Data:')) {
          const debugMatch = data.response.match(/Debug Data:\n```json\n([\s\S]+?)```/);
          if (debugMatch) {
            try {
              debugJson = JSON.parse(debugMatch[1]);
            } catch (e) {}
          }
        }
        // If not found, try to extract transaction data field from error string using improved regex
        if (!debugJson && data.response && data.response.includes('error')) {
          // Try to extract the transaction data field directly, even with nested braces
          const dataFieldMatch = data.response.match(/data\s*[:=]\s*\"([0-9a-fA-Fx]+)\"/);
          if (dataFieldMatch) {
            txData = dataFieldMatch[1];
          }
        }
        if (!debugJson && typeof data.response === 'string') {
          try {
            debugJson = JSON.parse(data.response);
          } catch {}
        }
        if (!txData && debugJson && debugJson.transaction && debugJson.transaction.data) {
          txData = debugJson.transaction.data;
        }
        // Extract transfer amount
        if (txData) {
          // Debug: print txData
          // eslint-disable-next-line no-console
          console.log('txData:', txData);
          // The amount is at offset 8+64+64=136, next 64 hex chars
          const amountHex = txData.slice(136, 200);
          // Debug: print amountHex
          // eslint-disable-next-line no-console
          console.log('amountHex:', amountHex);
          if (amountHex && amountHex.length === 64) {
            const transferAmount = parseInt(amountHex, 16);
            if (!isNaN(transferAmount)) {
              transferAmountSOL = transferAmount / 1e18;
            } else {
              // eslint-disable-next-line no-console
              console.log('Could not parse transferAmount from amountHex:', amountHex);
            }
          } else {
            // eslint-disable-next-line no-console
            console.log('Could not extract valid amountHex:', amountHex);
          }
        }
        // Extract current balance if present
        if (debugJson && debugJson.currentBalance) {
           balanceSOL = debugJson.currentBalance / 1e18;
        }
        // Show in agent message if available, else show fallback
        if (transferAmountSOL !== null) {
          content += `\n\n❌ Insufficient balance!\nNeeded: ${transferAmountSOL} WRAPPED_SOL`;
          if (balanceSOL !== null) {
            content += `\nAvailable: ${balanceSOL} WRAPPED_SOL`;
          }
        } else {
          content += `\n\n❌ Insufficient balance! Could not extract transfer amount from transaction data.`;
        }
      }
      const agentMsg: Message = {
        id: (Date.now() + 1).toString(),
        type: "agent",
        content,
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, agentMsg])

      // DISPATCH ALPHA EVENT IF ALPHA WAS PURCHASED
      if (content.includes("Alpha Purchased")) {
        console.log("🚀 Triggering Prediction Mode...");
        const event = new CustomEvent("alpha-purchased", { 
          detail: { 
            prediction: [
              { price: 0.12 },
              { price: 0.13 },
              { price: 0.14 }
            ]
          } 
        });
        window.dispatchEvent(event);
      }
    } catch (error) {
      console.error("Error calling agent API:", error)
      // Fallback to mock response if API fails
      const agentMsg: Message = {
        id: (Date.now() + 1).toString(),
        type: "agent",
        content: `⚠️ Agent API unavailable. Please ensure the agent is running on port 8080.\n\nTo start the agent:\n  cd agent\n  uvicorn api:app --reload --port 8080\n\nMock response: ${generateAgentResponse(userInput)}`,
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, agentMsg])
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="border-b border-border/30 glass px-6 py-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <Zap size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">
                Alpha Trading Agent
              </h1>
              <p className="text-xs text-muted-foreground">
                AI-Powered Trading Assistant
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto px-6 py-8 space-y-6">
        <div className="max-w-4xl mx-auto w-full space-y-6">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${
                message.type === "user" ? "justify-end" : "justify-start"
              } items-end gap-4`}
            >
              {message.type === "agent" && (
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center flex-shrink-0">
                  <MessageCircle size={16} className="text-white" />
                </div>
              )}

              <div
                className={`max-w-2xl px-4 py-3 rounded-2xl whitespace-pre-wrap break-words ${
                  message.type === "user"
                    ? "bg-gradient-to-r from-primary to-accent text-white rounded-br-none"
                    : "glass border border-border/30 text-foreground rounded-bl-none"
                }`}
              >
                {message.content}
              </div>

              {message.type === "user" && (
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-accent to-primary flex items-center justify-center flex-shrink-0">
                  <span className="text-white text-sm font-bold">Y</span>
                </div>
              )}
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start items-end gap-4">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center flex-shrink-0">
                <MessageCircle size={16} className="text-white" />
              </div>
              <div className="glass border border-border/30 px-4 py-3 rounded-2xl rounded-bl-none">
                <div className="flex gap-2">
                  <div className="w-2 h-2 bg-secondary rounded-full animate-bounce"></div>
                  <div
                    className="w-2 h-2 bg-secondary rounded-full animate-bounce"
                    style={{ animationDelay: "0.1s" }}
                  ></div>
                  <div
                    className="w-2 h-2 bg-secondary rounded-full animate-bounce"
                    style={{ animationDelay: "0.2s" }}
                  ></div>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area */}
      <div className="border-t border-border/30 glass px-6 py-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex gap-4">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Ask me to check balance, execute swaps, get signals... or anything else!"
              className="flex-1 bg-input border border-border/50 rounded-2xl px-6 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-transparent transition-all"
              disabled={isLoading}
            />
            <button
              onClick={handleSendMessage}
              disabled={!input.trim() || isLoading}
              className="bg-gradient-to-r from-primary to-accent hover:shadow-lg hover:shadow-primary/30 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-2xl px-6 py-3 font-medium transition-all flex items-center justify-center gap-2 min-w-max"
            >
              <Send size={18} />
            </button>
          </div>

          <p className="text-xs text-muted-foreground mt-3 text-center">
            💡 Try: "check balance" • "swap 10 usdc to vvs" • "get signals" •
            "portfolio value"
          </p>
        </div>
      </div>
    </div>
  )
}
