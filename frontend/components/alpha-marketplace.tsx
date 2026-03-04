"use client";

import { useEffect, useState } from "react";
import { Search, Activity, ShoppingCart, Check } from "lucide-react";
import { Input } from "./ui/input";
import { Skeleton } from "./ui/skeleton";
import AlphaProductCard from "./alpha-product-card";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { toast } from "../hooks/use-toast";

// Temporary IconMap fallback (customize as needed)
const IconMap: Record<string, any> = {
  // Example: 'sentiment': SomeIconComponent,
  // Add your icon mappings here
};

export default function AlphaMarketplace() {
  const [nodes, setNodes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [purchasing, setPurchasing] = useState<string | null>(null);

  useEffect(() => {
    async function fetchMarket() {
      try {
        const res = await fetch("/api/market/nodes");
        if (res.ok) {
          const data = await res.json();
          setNodes(data);
        } else {
          console.error("Failed to fetch nodes");
        }
      } catch (e) {
        console.error("Market offline", e);
      } finally {
        setLoading(false);
      }
    }
    fetchMarket();
  }, []);


  // 2. Handle Purchase Action
  const handlePurchase = async (nodeId: string, nodeName: string) => {
    setPurchasing(nodeId);
    try {
      const res = await fetch("/api/market/nodes", {
        method: "POST",
        body: JSON.stringify({ nodeId }),
      });

      if (res.ok) {
        setNodes(nodes.map(n => n.id === nodeId ? { ...n, isPurchased: true } : n));
        toast({
          title: "Access Granted",
          description: `Successfully subscribed to ${nodeName} feed.`,
        });
      }
    } catch (error) {
      toast({
        title: "Purchase Failed",
        description: "Could not verify transaction on Solana.",
        variant: "destructive"
      });
    } finally {
      setPurchasing(null);
    }
  };

  // 2b. Handle Whitelist/Blacklist
  const handleWhitelist = async (nodeId: string, whitelisted: boolean) => {
    try {
      const res = await fetch("/api/market/nodes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodeId, whitelisted }),
      });
      if (res.ok) {
        const data = await res.json();
        setNodes(nodes.map(n => n.id === nodeId ? { ...n, whitelisted: data.node.whitelisted } : n));
        toast({
          title: whitelisted ? "Node Whitelisted" : "Node Blacklisted",
          description: `Node has been ${whitelisted ? "whitelisted" : "blacklisted"}.`,
        });
      } else {
        toast({
          title: "Update Failed",
          description: "Could not update whitelist status.",
          variant: "destructive"
        });
      }
    } catch (error) {
      toast({
        title: "Update Failed",
        description: "Could not update whitelist status.",
        variant: "destructive"
      });
    }
  };

  // 3. Filter Logic
  const filteredNodes = nodes.filter(n => {
    const title = n.title || "";
    const category = n.category || "";
    return (
      title.toLowerCase().includes(search.toLowerCase()) ||
      category.toLowerCase().includes(search.toLowerCase())
    );
  });

  return (
    <div className="space-y-6 h-full flex flex-col">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white">Alpha Node Market</h2>
          <p className="text-muted-foreground">
            Acquire high-value data streams via the x402 Protocol.
          </p>
        </div>
        <div className="flex w-full max-w-sm items-center space-x-2 bg-zinc-900/50 p-1 rounded-lg border border-zinc-800">
          <Search className="h-4 w-4 ml-2 text-zinc-500" />
          <Input 
            placeholder="Search providers..." 
            className="border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Grid Content */}
      <div className="flex-1 overflow-y-auto pr-2">
        {loading ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-[280px] w-full rounded-xl bg-zinc-900" />
            ))}
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 pb-10">
            {filteredNodes.map((node) => (
              <AlphaProductCard
                key={node.id}
                product={{
                  id: node.id,
                  title: node.title,
                  description: node.description,
                  price: node.price?.toString() || "0",
                  category: node.category,
                  provider: node.provider,
                  bullish: node.bullish,
                }}
                whitelisted={!!node.whitelisted}
                onToggleWhitelist={() => handleWhitelist(node.id, !node.whitelisted)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
