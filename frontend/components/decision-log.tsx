"use client";

import { useEffect, useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export function DecisionLog() {
  const [decisions, setDecisions] = useState<any[]>([]);

  useEffect(() => {
    const fetchDecisions = async () => {
      try {
        const res = await fetch("/api/transactions?limit=50");
        const data = await res.json();
        const rows = Array.isArray(data?.transactions) ? data.transactions : [];

        // Filter out X402_PAYMENT (node purchase) transactions
        const swapTransactions = rows.filter((tx: any) => tx?.txType !== "X402_PAYMENT");

        const logData = swapTransactions.map((tx: any) => {
          const tokenIn = tx?.tokenIn || "";
          const tokenOut = tx?.tokenOut || "";
          const amountIn = typeof tx?.amountIn === "number" ? tx.amountIn : null;
          // Ensure txHash is properly extracted
          const txHash = tx?.txHash || tx?.hash || tx?.tx_hash;

          let action = tx?.txType || "TRANSACTION";
          let amount = amountIn != null ? `${amountIn} ${tokenIn}`.trim() : "N/A";

          if (tx?.txType === "SWAP") {
            action = `${tokenIn || "TOKEN"} -> ${tokenOut || "TOKEN"}`;
          } else if (tx?.txType === "X402_PAYMENT") {
            action = "X402_PAYMENT";
            amount = amountIn != null ? `${amountIn} USDC` : "N/A";
          }

          return {
            id: tx?.id || txHash,
            txHash,
            decidedAt: tx?.createdAt,
            action,
            amount,
            context: tx?.metadata || "",
          };
        });

        setDecisions(logData);
      } catch (e) {
        console.error("Error fetching decisions:", e);
        setDecisions([]);
      }
    };
    fetchDecisions();
    const interval = setInterval(fetchDecisions, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleActionClick = (txHash: string) => {
    console.log("Action clicked with txHash:", txHash);
    if (txHash && String(txHash).trim()) {
      const url = `https://solscan.io/tx/${String(txHash).toLowerCase()}?cluster=devnet`;
      console.log("Opening URL:", url);
      window.open(url, "_blank");
    } else {
      console.warn("No valid txHash provided:", txHash);
    }
  };

  return (
    <div className="rounded-md border">
      <div className="max-h-[400px] overflow-y-auto">
        <Table>
          <TableHeader className="sticky top-0 bg-background z-10">
            <TableRow>
              <TableHead>Action</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead className="text-right">Date and Time</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
          {decisions.length === 0 ? (
            <TableRow key="empty-row">
              <TableCell colSpan={3} className="text-center py-4 text-muted-foreground">
                No decisions yet.
              </TableCell>
            </TableRow>
          ) : (
            decisions.map((d, idx) => {
              let details = {
                action: typeof d.action === "string" && d.action.trim() ? d.action : "TRADE",
                amount: typeof d.amount === "string" && d.amount.trim() ? d.amount : "N/A",
              };
              try {
                if (d.context && d.context.trim().startsWith('{')) {
                  const parsed = JSON.parse(d.context);
                  details.action = parsed.action || details.action;
                  details.amount = parsed.amount || details.amount;
                } else if ((!d.amount || d.amount === "N/A") && d.context) {
                  details.amount = d.context; // Fallback for old string logs
                }
              } catch (e) {}

              // Use d.id if present and stable, otherwise fallback to decidedAt+idx
              const key = d.id ? d.id : `${d.decidedAt || 'unknown'}-${idx}`;

              return (
                <TableRow key={key}>
                  <TableCell
                    className="font-bold text-primary cursor-pointer hover:underline"
                    onClick={() => handleActionClick(d.txHash)}
                  >
                    {details.action}
                  </TableCell>
                  <TableCell>{details.amount}</TableCell>
                  <TableCell className="text-right text-muted-foreground text-xs">
                    {new Date(d.decidedAt).toLocaleString()}
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