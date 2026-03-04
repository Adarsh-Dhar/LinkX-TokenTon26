// Simple event broadcaster for server-side events (SSE)
import { broadcastEvent } from "@/app/api/dashboard/events/route";

export function sendTradeStatusUpdate(status: any) {
  broadcastEvent({ type: "trade_status", ...status });
}
