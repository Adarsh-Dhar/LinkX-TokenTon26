"use client";

import LogRatingForm from "./LogRatingForm";
import RatingsChart from "@/components/ratings-chart";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LogRatingClient({ node, ratings }: { node: any; ratings: any[] }) {
  const router = useRouter();
  // Calculate aggregate rating from DB-backed fields
  const userFeedbackRatings = Array.isArray(node.nodePurchases)
    ? node.nodePurchases
        .map((tx: any) => typeof tx.logRating?.rating === "number" ? tx.logRating.rating : null)
        .filter((r: number | null): r is number => r !== null)
    : [];

  const averageFromFeedback = userFeedbackRatings.length > 0
    ? userFeedbackRatings.reduce((sum: number, r: number) => sum + r, 0) / userFeedbackRatings.length
    : 0;

  // Only show calculated average from user feedback, not fallback to node.ratings
  const initialAggregate = averageFromFeedback;

  const [aggregateRating, setAggregateRating] = useState(initialAggregate);

  const parseLogData = (raw: unknown): string => {
    if (raw == null) return "";

    if (typeof raw === "string") {
      try {
        const parsed = JSON.parse(raw);
        // Extract signal value if available
        if (typeof parsed?.signal === "number") {
          return parsed.signal.toString();
        }
        return JSON.stringify(parsed);
      } catch {
        return raw;
      }
    }

    // Handle object directly
    if (typeof raw === "object" && raw !== null) {
      const obj = raw as Record<string, unknown>;
      if (typeof obj.signal === "number") {
        return obj.signal.toString();
      }
    }

    try {
      return JSON.stringify(raw);
    } catch {
      return String(raw);
    }
  };

  const formatTimestamp = (value: string): string => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString("en-GB", {
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  return (
    <div className="p-6 space-y-8">
      <header>
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold">{node.title}</h1>
            <p className="text-muted-foreground">{node.description}</p>
            <div className="mt-2 badge">{node.more_context}</div>
          </div>
          <div className="text-right">
            <div className="text-sm font-medium">Aggregate Rating</div>
            <div className="text-2xl font-bold text-yellow-500">{aggregateRating === 0 ? '0.00' : aggregateRating.toFixed(2)}/10</div>
          </div>
        </div>
      </header>

      {/* Ratings History Graph (only if data exists) */}
      {ratings.length > 0 && (
        <section className="bg-card p-4 rounded-lg border">
          <h2 className="text-xl font-semibold mb-4">Ratings Over Time</h2>
          <RatingsChart ratings={ratings} />
        </section>
      )}

      {/* Node Data Logs with Rating Form */}
      <section>
        <h2 className="text-xl font-semibold mb-4">Node Data Logs</h2>
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted">
              <tr>
                <th className="p-3">Timestamp</th>
                <th className="p-3">Data Point (Signal)</th>
                <th className="p-3">User Feedback (1-10)</th>
              </tr>
            </thead>
            <tbody>
              {node.nodePurchases.map((tx: any) => (
                <tr key={tx.id} className="border-t">
                  <td className="p-3">{formatTimestamp(tx.fetchedAtFormatted ?? new Date(tx.timestamp).toISOString())}</td>
                  <td className="p-3 font-mono text-xs max-w-xs overflow-hidden text-ellipsis">{parseLogData(tx.data)}</td>
                  <td className="p-3">
                    <LogRatingForm
                      logId={tx.id}
                      nodeId={node.id}
                      initialRating={tx.logRating?.rating}
                      initialComment={tx.logRating?.comment}
                      onSaved={newAvg => {
                        setAggregateRating(newAvg);
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}