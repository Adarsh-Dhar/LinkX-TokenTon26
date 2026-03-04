"use client"

import { useState, useEffect } from "react"

interface WalletState {
  address: string | null
  balance: string | null
  usdcBalance: string | null
  isConnected: boolean
  isConnecting: boolean
  chainId: number | null
}

const BALANCE_ENDPOINT = "/api/wallet/balances"
const DEFAULT_CHAIN_ID = 103; // Solana Devnet
const DEFAULT_SYMBOL = "SOL";

export function useWallet() {
  const [state, setState] = useState<WalletState & { symbol?: string }>({
    address: null,
    balance: null,
    usdcBalance: null,
    isConnected: false,
    isConnecting: false,
    chainId: null,
    symbol: DEFAULT_SYMBOL,
  })

  const connect = async () => {
    setState((prev) => ({ ...prev, isConnecting: true }))
    try {
      const response = await fetch(BALANCE_ENDPOINT, { cache: "no-store" })
      const data = await response.json()
      if (!response.ok || data?.error) {
        throw new Error(data?.error || "Failed to fetch wallet balances")
      }
      setState({
        address: data.address || null,
        balance: data.wrappedSolBalance?.toString?.() ?? String(data.wrappedSolBalance ?? "0"),
        usdcBalance: data.usdcBalance?.toString?.() ?? String(data.usdcBalance ?? "0"),
        isConnected: true,
        isConnecting: false,
        chainId: data.chainId || DEFAULT_CHAIN_ID,
        symbol: data.symbol || DEFAULT_SYMBOL,
      })
    } catch (error) {
      console.error("Failed to connect wallet:", error)
      setState((prev) => ({ ...prev, isConnecting: false }))
    }
  }

  const disconnect = () => {
    setState({
      address: null,
      balance: null,
      usdcBalance: null,
      isConnected: false,
      isConnecting: false,
      chainId: null,
      symbol: DEFAULT_SYMBOL,
    })
  }

  const refreshBalances = async () => {
    try {
      const response = await fetch(BALANCE_ENDPOINT, { cache: "no-store" })
      const data = await response.json()
      
      // Log any warnings or errors for debugging
      if (data?.warning) {
        console.warn("Balance API warning:", data.warning)
      }
      if (data?.error) {
        console.error("Balance API error:", data.error, data.details)
      }
      
      // Update state even if there's an error, using zero balances as fallback
      setState((prev) => ({
        ...prev,
        address: data.address || prev.address,
        balance: data.wrappedSolBalance?.toString?.() ?? String(data.wrappedSolBalance ?? "0"),
        usdcBalance: data.usdcBalance?.toString?.() ?? String(data.usdcBalance ?? "0"),
        isConnected: !!data.address,
        chainId: data.chainId || DEFAULT_CHAIN_ID,
        symbol: data.symbol || DEFAULT_SYMBOL,
      }))
    } catch (error) {
      console.error("Failed to refresh balances:", error)
      // Don't crash, just log the error
    }
  }

  useEffect(() => {
    connect()
    const interval = window.setInterval(refreshBalances, 15000)
    return () => window.clearInterval(interval)
  }, [])

  return {
    ...state,
    connect,
    disconnect,
    refreshBalances,
    shortAddress: state.address
      ? `${state.address.slice(0, 6)}...${state.address.slice(-4)}`
      : null,
    chainId: state.chainId || DEFAULT_CHAIN_ID,
    symbol: state.symbol || DEFAULT_SYMBOL,
  }
}
