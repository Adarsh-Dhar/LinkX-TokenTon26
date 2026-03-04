"use client"

import { useState } from "react"
import { X, Zap, CheckCircle, AlertCircle } from "lucide-react"
import { ethers } from "ethers"

interface Product {
  id: string
  name: string
  price: string
  provider: string
  ticker?: string
}

interface X402ModalProps {
  product: Product
  onClose: () => void
  onSuccess?: (data: any) => void
}

export default function X402Modal({ product, onClose, onSuccess }: X402ModalProps) {
  const [isProcessing, setIsProcessing] = useState(false)
  const [paymentSuccess, setPaymentSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [alphaData, setAlphaData] = useState<any>(null)

  const handlePayment = async () => {
    setIsProcessing(true)
    setError(null)

    try {
      // 1. Check if MetaMask is installed
      if (!window.ethereum) {
        throw new Error("Please install MetaMask to make payments!")
      }


      // 2. Request x402 challenge from server (HTTP 402)
      const ticker = product.ticker || product.id
      // For demo, use node1 (microstructure) endpoint
      const invoiceResponse = await fetch(`http://localhost:4001/api/microstructure`, {
        method: "GET",
      })

      if (invoiceResponse.status !== 402) {
        throw new Error("Expected HTTP 402 response from server")
      }

      const challenge = await invoiceResponse.json()
      if (!challenge || !challenge.eip712) {
        throw new Error("Invalid x402 challenge received")
      }


      // 3. Connect wallet and prepare signing
      const provider = new ethers.BrowserProvider(window.ethereum)
      const signer = await provider.getSigner()
      const signerAddress = await signer.getAddress()

      // 4. Prepare EIP-712 typed data from challenge
      const domain = challenge.eip712.domain
      const types = challenge.eip712.types
      // Copy message and fill in 'from' with user address
      const message = {
        ...challenge.eip712.message,
        from: signerAddress
      }

      // 5. Sign the typed data with MetaMask
      const signature = await signer.signTypedData(domain, types, message)


      // 6. Submit payment proof to /api/settle endpoint
      const paymentResponse = await fetch(
        `http://localhost:4001/api/settle`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            typedData: {
              domain,
              types,
              message,
            },
            signature,
          }),
        }
      )

      if (!paymentResponse.ok) {
        const errorData = await paymentResponse.json()
        throw new Error(errorData.error || "Payment verification failed")
      }

      const result = await paymentResponse.json()

      // 7. Success! Show the unlocked alpha data (for demo, just show address)
      setPaymentSuccess(true)
      setAlphaData(result)
      if (onSuccess) {
        onSuccess(result)
      }
      // Auto-close after 3 seconds
      setTimeout(() => {
        onClose()
      }, 3000)
    } catch (err: any) {
      console.error("Payment error:", err)
      setError(err.message || "Payment failed. Please try again.")
    } finally {
      setIsProcessing(false)
    }
  }

  if (paymentSuccess && alphaData) {
    return (
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
        <div className="glass border border-green-500/50 rounded-lg max-w-md w-full mx-4 p-8 glow-secondary">
          <div className="text-center mb-6">
            <CheckCircle size={64} className="text-green-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-foreground">Payment Successful!</h2>
            <p className="text-sm text-muted-foreground">Alpha data unlocked</p>
          </div>

          <div className="bg-black/40 p-4 rounded-lg border border-secondary/30 mb-6">
            <pre className="text-xs font-mono text-foreground whitespace-pre-wrap">
              {JSON.stringify(alphaData, null, 2)}
            </pre>
          </div>

          <button
            onClick={onClose}
            className="w-full px-6 py-3 rounded-lg bg-gradient-to-r from-primary to-accent text-white font-semibold"
          >
            Close
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="glass border border-accent/50 rounded-lg max-w-md w-full mx-4 p-8 glow-accent">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-foreground">HTTP 402</h2>
            <p className="text-sm text-muted-foreground">Payment Required</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-card/50 rounded-lg transition-all">
            <X size={20} className="text-muted-foreground" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-destructive/20 border border-destructive/50 rounded-lg flex items-start gap-2">
            <AlertCircle size={18} className="text-destructive mt-0.5 flex-shrink-0" />
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        <div className="space-y-4 mb-6">
          <div className="border-b border-border/30 pb-4">
            <p className="text-xs text-muted-foreground mb-1">Product</p>
            <p className="font-mono text-foreground">{product.name}</p>
          </div>

          <div className="border-b border-border/30 pb-4">
            <p className="text-xs text-muted-foreground mb-1">Amount</p>
            <p className="text-2xl font-bold text-secondary">{product.price} USDC</p>
          </div>

          <div className="border-b border-border/30 pb-4">
            <p className="text-xs text-muted-foreground mb-1">Recipient Address</p>
            <p className="font-mono text-foreground text-sm break-all">
              {product.provider || "0x999...7d3a"}
            </p>
          </div>

          <div>
            <p className="text-xs text-muted-foreground mb-1">Protocol</p>
            <p className="font-mono text-secondary">x402 Payment Protocol (EIP-3009)</p>
          </div>
        </div>

        <button
          onClick={handlePayment}
          disabled={isProcessing}
          className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-gradient-to-r from-primary to-accent hover:shadow-lg hover:shadow-primary/30 disabled:opacity-50 transition-all text-white font-semibold"
        >
          <Zap size={18} />
          {isProcessing ? "Processing..." : "Sign & Pay with MetaMask"}
        </button>

        <p className="text-xs text-muted-foreground mt-4 text-center">
          MetaMask will prompt you to sign the EIP-712 payment authorization
        </p>
      </div>
    </div>
  )
}
