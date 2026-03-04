
"use client";

import { useEffect, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ArrowUpRight, ArrowDownRight, Zap, TrendingUp, TrendingDown, Flame, Shield, Play, Square } from "lucide-react";

interface Activity {
  id: string;
  type: 'trade' | 'node_purchase' | 'price_movement';
  title: string;
  description: string;
  value: number;
  isPositive: boolean;
  timestamp: Date;
  icon: string;
}

interface ChartPoint {
  time: string;
  value: number;
}

interface ActivityFeedProps {
  chartData?: ChartPoint[];
}

interface TimeWindowSnapshot {
  value: number;
  timestamp: number;
}

export function ActivityFeed({ chartData = [] }: ActivityFeedProps) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [valueOneMinAgo, setValueOneMinAgo] = useState<TimeWindowSnapshot | null>(null);
  const [valueOneHourAgo, setValueOneHourAgo] = useState<TimeWindowSnapshot | null>(null);
  const [valueOneDayAgo, setValueOneDayAgo] = useState<TimeWindowSnapshot | null>(null);

  const savePortfolioChangeEvent = async (current: number, previous: number, percentageChange: number, timeWindow: string) => {
    try {
      const response = await fetch('/api/activity/portfolio-change', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          currentValue: current,
          previousValue: previous,
          percentageChange,
          timeWindow,
          timestamp: new Date().toISOString(),
        }),
      });

      if (!response.ok) {
        console.error('Failed to save portfolio change event');
      } else {
        console.log(`💾 Portfolio change event (${timeWindow}) saved to database: ${Math.abs(percentageChange).toFixed(2)}%`);
      }
    } catch (error) {
      console.error('Error saving portfolio change:', error);
    }
  };

  useEffect(() => {
    // Monitor portfolio value changes from chart data
    if (chartData.length < 1) {
      setLoading(false);
      return;
    }

    const now = Date.now();
    const currentValue = chartData[chartData.length - 1].value;

    // Initialize time windows if not set
    if (valueOneMinAgo === null) {
      setValueOneMinAgo({ value: currentValue, timestamp: now });
    }
    if (valueOneHourAgo === null) {
      setValueOneHourAgo({ value: currentValue, timestamp: now });
    }
    if (valueOneDayAgo === null) {
      setValueOneDayAgo({ value: currentValue, timestamp: now });
    }

    const ONE_MINUTE = 60 * 1000;
    const ONE_HOUR = 60 * 60 * 1000;
    const ONE_DAY = 24 * 60 * 60 * 1000;

    // Check and update 1-minute window (>0.5% threshold)
    if (valueOneMinAgo && now - valueOneMinAgo.timestamp >= ONE_MINUTE) {
      const changePercent = ((currentValue - valueOneMinAgo.value) / valueOneMinAgo.value) * 100;
      if (Math.abs(changePercent) > 0.5) {
        const newActivity: Activity = {
          id: `portfolio-1min-${Date.now()}`,
          type: 'price_movement',
          title: changePercent > 0 ? '📈 Portfolio Increased (1 min)' : '📉 Portfolio Decreased (1 min)',
          description: `Portfolio changed by ${Math.abs(changePercent).toFixed(2)}% in the last minute`,
          value: changePercent,
          isPositive: changePercent > 0,
          timestamp: new Date(),
          icon: changePercent > 0 ? 'trend-up' : 'trend-down',
        };
        
        setActivities((prev) => [newActivity, ...prev].slice(0, 10));
        savePortfolioChangeEvent(currentValue, valueOneMinAgo.value, changePercent, '1-minute');
      }
      setValueOneMinAgo({ value: currentValue, timestamp: now });
    }

    // Check and update 1-hour window (>1% threshold)
    if (valueOneHourAgo && now - valueOneHourAgo.timestamp >= ONE_HOUR) {
      const changePercent = ((currentValue - valueOneHourAgo.value) / valueOneHourAgo.value) * 100;
      if (Math.abs(changePercent) > 1) {
        const newActivity: Activity = {
          id: `portfolio-1hour-${Date.now()}`,
          type: 'price_movement',
          title: changePercent > 0 ? '📈 Portfolio Increased (1 hr)' : '📉 Portfolio Decreased (1 hr)',
          description: `Portfolio changed by ${Math.abs(changePercent).toFixed(2)}% in the last hour`,
          value: changePercent,
          isPositive: changePercent > 0,
          timestamp: new Date(),
          icon: changePercent > 0 ? 'trend-up' : 'trend-down',
        };
        
        setActivities((prev) => [newActivity, ...prev].slice(0, 10));
        savePortfolioChangeEvent(currentValue, valueOneHourAgo.value, changePercent, '1-hour');
      }
      setValueOneHourAgo({ value: currentValue, timestamp: now });
    }

    // Check and update 1-day window (>2% threshold)
    if (valueOneDayAgo && now - valueOneDayAgo.timestamp >= ONE_DAY) {
      const changePercent = ((currentValue - valueOneDayAgo.value) / valueOneDayAgo.value) * 100;
      if (Math.abs(changePercent) > 2) {
        const newActivity: Activity = {
          id: `portfolio-1day-${Date.now()}`,
          type: 'price_movement',
          title: changePercent > 0 ? '📈 Portfolio Increased (1 day)' : '📉 Portfolio Decreased (1 day)',
          description: `Portfolio changed by ${Math.abs(changePercent).toFixed(2)}% in the last day`,
          value: changePercent,
          isPositive: changePercent > 0,
          timestamp: new Date(),
          icon: changePercent > 0 ? 'trend-up' : 'trend-down',
        };
        
        setActivities((prev) => [newActivity, ...prev].slice(0, 10));
        savePortfolioChangeEvent(currentValue, valueOneDayAgo.value, changePercent, '1-day');
      }
      setValueOneDayAgo({ value: currentValue, timestamp: now });
    }

    setLoading(false);
  }, [chartData, valueOneMinAgo, valueOneHourAgo, valueOneDayAgo]);

  const getIcon = (activity: Activity) => {
    switch (activity.icon) {
      case 'trade':
        return activity.isPositive ? (
          <ArrowUpRight className="h-5 w-5 text-green-500" />
        ) : (
          <ArrowDownRight className="h-5 w-5 text-red-500" />
        );
      case 'node':
        return <Zap className="h-5 w-5 text-blue-500" />;
      case 'score':
        return <Flame className="h-5 w-5 text-orange-500" />;
      case 'signal':
        return <TrendingUp className="h-5 w-5 text-purple-500" />;
      case 'shield':
        return <Shield className="h-5 w-5 text-yellow-500" />;
      case 'play':
        return <Play className="h-5 w-5 text-gray-400" />;
      case 'stop':
        return <Square className="h-5 w-5 text-gray-400" />;
      case 'trend-up':
        return <TrendingUp className="h-5 w-5 text-green-500" />;
      case 'trend-down':
        return <TrendingDown className="h-5 w-5 text-red-500" />;
      default:
        return <Zap className="h-5 w-5 text-zinc-500" />;
    }
  };

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading activity...</div>;
  }

  if (activities.length === 0) {
    return <div className="text-sm text-muted-foreground">No recent activity.</div>;
  }

  return (
    <div className="space-y-3">
      {activities.map((activity) => (
        <div 
          key={activity.id} 
          className={`flex items-center gap-3 p-4 rounded-lg glass glow-primary transition-all border ${
            activity.isPositive ? "border-green-500/30 hover:border-green-500/50" : "border-red-500/30 hover:border-red-500/50"
          } hover:shadow-lg cursor-default`}
        >
          <div className="flex-shrink-0">
            {getIcon(activity)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">
              {activity.title}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {activity.description}
            </p>
          </div>
          <div className="flex-shrink-0 text-right">
            <p className={`text-sm font-bold ${activity.isPositive ? "text-green-500" : "text-red-500"}`}>
              {activity.isPositive ? "+" : ""}{(activity.value ?? 0).toFixed(2)}%
            </p>
            <p className="text-xs text-muted-foreground">
              {activity.timestamp.toLocaleTimeString()}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
