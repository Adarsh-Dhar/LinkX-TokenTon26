"use client";
import Dashboard from "@/components/dashboard";
import { TradingView } from "@/components/trading-view";
import { DataStreamWidget } from "@/components/data-stream-widget";
import {DecisionLog} from "@/components/decision-log";

export default function DashboardPage() {
  return (
    <>
      <Dashboard />
      <div className="mt-8 w-full grid grid-cols-4 gap-4">
        <TradingView />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8">
        <div className="bg-card border border-border rounded-lg shadow p-6 text-foreground [&>*]:bg-transparent">
          <DataStreamWidget />
        </div>
        <div className="bg-card border border-border rounded-lg shadow p-6 text-foreground [&>*]:bg-transparent">
          <DecisionLog />
        </div>
      </div>
    </>
  );
}
