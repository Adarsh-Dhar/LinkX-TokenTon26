"use client";

import { useEffect, useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export function DataStreamWidget() {
  const [nodePurchases, setNodePurchases] = useState<any[]>([]);

  useEffect(() => {
    let isMounted = true;
    const fetchNodePurchases = async () => {
      try {
        const res = await fetch("/api/node-purchases?limit=50");
        if (!res.ok) return;
        const json = await res.json();
        if (isMounted) {
          const purchases = json.nodePurchaseTransactions || [];
          // Ensure txHash is properly set
          const enriched = purchases.map((p: any) => ({
            ...p,
            txHash: p.txHash || p.hash || p.tx_hash,
          }));
          setNodePurchases(enriched);
        }
      } catch (e) {
        console.error("Error fetching node purchases:", e);
      }
    };
    fetchNodePurchases();
    const interval = setInterval(fetchNodePurchases, 5000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const handleNodeNameClick = (txHash: string) => {
    console.log("Node clicked with txHash:", txHash);
    if (txHash && String(txHash).trim()) {
      const url = `https://solscan.io/tx/${String(txHash).toLowerCase()}?cluster=devnet`;
      console.log("Opening URL:", url);
      window.open(url, "_blank");
    } else {
      console.warn("No valid txHash provided:", txHash);
    }
  };

  return (
    <div className="w-full border border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 rounded-lg">
      <div className="max-h-[400px] overflow-y-auto">
        <Table>
          <TableHeader className="sticky top-0 bg-background z-10">
            <TableRow>
              <TableHead>Node Name</TableHead>
              <TableHead>Price Paid</TableHead>
              <TableHead className="text-right">Date and Time</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {nodePurchases.length === 0 ? (
              <TableRow key="empty-row">
                <TableCell colSpan={3} className="text-center py-4 text-muted-foreground">
                  No node purchases yet.
                </TableCell>
              </TableRow>
            ) : (
              nodePurchases.map((purchase, idx) => {
                const key = purchase.txHash || idx;
                return (
                  <TableRow key={key}>
                    <TableCell
                      className="font-bold text-primary cursor-pointer hover:underline"
                      onClick={() => handleNodeNameClick(purchase.txHash)}
                    >
                      {purchase.nodeName || "N/A"}
                    </TableCell>
                    <TableCell>{purchase.pricePaid ? `${purchase.pricePaid} USDC` : "N/A"}</TableCell>
                    <TableCell className="text-right text-muted-foreground text-xs">
                      {new Date(purchase.timestamp).toLocaleString()}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}