"use client"

import { useEffect, useCallback } from "react"
import { useWallet } from "./use-wallet"

interface PortfolioData {
  wrappedSolBalance: number
  usdcBalance: number
  wrappedSolPrice: number
  totalValueUsd: number
}

export function usePortfolioSync() {
  const wallet = useWallet()

  const fetchServerBalances = useCallback(async () => {
    try {
      const res = await fetch("/api/wallet/balances", { cache: "no-store" })
      if (res.ok) {
        const data = await res.json()
        return {
          wrappedSolBalance: Number(data.wrappedSolBalance || 0),
          usdcBalance: Number(data.usdcBalance || 0),
        }
      }
    } catch (error) {
      console.warn("Could not fetch server Solana wallet balances:", error)
    }
    return null
  }, [])

  // Fetch current Wrapped SOL/USDC price
  const fetchWrappedSolPrice = useCallback(async (): Promise<number> => {
    try {
      // Try to get price from price endpoint
      const res = await fetch("/api/market/price/SOL-USDC", {
        cache: "no-store",
      })
      if (res.ok) {
        const data = await res.json()
        return data.price || 0.06
      }
    } catch (error) {
      console.warn("Could not fetch Wrapped SOL price:", error)
    }

    // Try to get latest price from chart data
    try {
      const res = await fetch("/api/dashboard/chart", {
        cache: "no-store",
      })
      if (res.ok) {
        const data = await res.json()
        if (data.length > 0) {
          const latest = data[data.length - 1]
          if (latest.wrappedSolBalance > 0 && latest.usdcBalance > 0) {
            return latest.usdcBalance / latest.wrappedSolBalance
          }
        }
      }
    } catch (error) {
      console.warn("Could not get price from chart:", error)
    }

    // Fallback
    return 0.06
  }, [])

  // Save portfolio snapshot
  const savePortfolioSnapshot = useCallback(
    async (wrappedSolBalance: number, usdcBalance: number, wrappedSolPrice: number) => {
      try {
        const res = await fetch("/api/dashboard/save-snapshot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            wrappedSolBalance,
            usdcBalance,
            wrappedSolPrice,
          }),
        })

        if (res.ok) {
          const data = await res.json()
          return data.snapshot
        }
      } catch (error) {
        console.error("Failed to save portfolio snapshot:", error)
      }
      return null
    },
    []
  )

  // Sync portfolio data and save snapshots
  const syncPortfolio = useCallback(async (): Promise<PortfolioData | null> => {
    try {
      let wrappedSolBalance = 0
      let usdcBalance = 0
      let hasReliableBalances = false

      const walletWrappedSol = wallet.balance ? parseFloat(wallet.balance) : 0
      const walletUsdc = wallet.usdcBalance ? parseFloat(wallet.usdcBalance) : 0

      if (wallet.isConnected && (walletWrappedSol > 0 || walletUsdc > 0)) {
        wrappedSolBalance = walletWrappedSol
        usdcBalance = walletUsdc
        hasReliableBalances = true
      } else {
        const serverBalances = await fetchServerBalances()
        if (serverBalances) {
          wrappedSolBalance = serverBalances.wrappedSolBalance
          usdcBalance = serverBalances.usdcBalance
          hasReliableBalances = true
        }
      }

      if (!hasReliableBalances) {
        return null
      }

      const wrappedSolPrice = await fetchWrappedSolPrice()
      if (!Number.isFinite(wrappedSolPrice) || wrappedSolPrice <= 0) {
        return null
      }

      // Prevent transient zero spikes from failed balance reads
      if (wrappedSolBalance === 0 && usdcBalance === 0) {
        return null
      }

      const totalValueUsd = wrappedSolBalance * wrappedSolPrice + usdcBalance

      // Save snapshot to database
      await savePortfolioSnapshot(wrappedSolBalance, usdcBalance, wrappedSolPrice)

      return {
        wrappedSolBalance,
        usdcBalance,
        wrappedSolPrice,
        totalValueUsd,
      }
    } catch (error) {
      console.error("Portfolio sync error:", error)
      return null
    }
  }, [wallet, fetchWrappedSolPrice, savePortfolioSnapshot, fetchServerBalances])

  // Set up periodic sync every minute
  useEffect(() => {
    // Sync immediately on mount if wallet connected
    if (wallet.isConnected) {
      syncPortfolio()
    }

    // Then sync every 60 seconds
    const interval = setInterval(() => {
      if (wallet.isConnected) {
        syncPortfolio()
      }
    }, 60000)

    return () => clearInterval(interval)
  }, [wallet.isConnected, syncPortfolio])

  return { syncPortfolio }
}
