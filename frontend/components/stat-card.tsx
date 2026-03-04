import type React from "react"

interface StatCardProps {
  label: string
  value: string
  icon: React.ReactNode
}

export default function StatCard({ label, value, icon }: StatCardProps) {
  return (
    <div className="glass glow-primary p-6 rounded-lg border border-border/30">
      <div className="flex items-center justify-between mb-4">
        <span className="text-muted-foreground text-sm">{label}</span>
        {icon}
      </div>
      <p className="text-3xl font-bold text-foreground">{value}</p>
    </div>
  )
}
