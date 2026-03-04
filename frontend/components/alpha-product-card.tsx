
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Lock, Unlock, CheckCircle } from "lucide-react"
import { Button } from "@/components/ui/button"

interface Product {
  id: string;
  title: string;
  description: string;
  price: string;
  category?: string;
  provider?: string;
  bullish?: number;
}

interface AlphaProductCardProps {
  product: Product;
  whitelisted: boolean;
  onToggleWhitelist: () => void;
}

export default function AlphaProductCard({ product, whitelisted, onToggleWhitelist }: AlphaProductCardProps) {
  const router = useRouter();

  // Card click handler (except button)
  const handleCardClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Prevent navigation if the click is on a button or inside it
    if ((e.target as HTMLElement).closest("button")) return;
    router.push(`/market/${product.id}`);
  };

  return (
    <div
      className={`relative flex flex-col transition-all hover:border-primary/50 ${whitelisted ? "border-green-500/50 bg-green-500/5" : ""} glass glow-primary p-6 rounded-lg border border-border/30 h-full cursor-pointer`}
      onClick={handleCardClick}
      tabIndex={0}
      role="button"
      aria-label={`View details for ${product.title}`}
    >
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-bold text-foreground flex items-center gap-2">{product.title} {whitelisted && <CheckCircle className="h-5 w-5 text-green-500" />}</h3>
          {product.provider && <p className="text-xs text-muted-foreground mt-1">{product.provider}</p>}
        </div>
        {!whitelisted ? <Lock className="text-accent" size={20} /> : <Unlock className="text-secondary" size={20} />}
      </div>

      <p className="text-sm text-muted-foreground mb-4 flex-1">{product.description}</p>

      {whitelisted && product.bullish !== undefined && (
        <div className="mb-4 p-3 bg-black/40 rounded-lg border border-secondary/30">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground">Bullish Sentiment</span>
            <span className="text-sm font-bold text-secondary">{product.bullish}%</span>
          </div>
          <div className="w-full h-2 bg-black/80 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-secondary to-primary"
              style={{ width: `${product.bullish}%` }}
            ></div>
          </div>
          <p className="text-xs text-secondary mt-2 font-mono">Action: ACCUMULATE</p>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <span className="text-lg font-bold text-foreground">{product.price} USDC</span>
        <Button
          variant={whitelisted ? "destructive" : "secondary"}
          className="px-4 py-2 rounded-lg text-sm font-medium"
          onClick={e => {
            e.stopPropagation();
            onToggleWhitelist();
          }}
        >
          {whitelisted ? "Blacklist" : "Whitelist"}
        </Button>
      </div>
    </div>
  );
}
