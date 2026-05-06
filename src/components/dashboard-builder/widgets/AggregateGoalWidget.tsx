import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Droplet, Target, Calendar, TrendingUp, TrendingDown, CheckCircle2, MoreVertical } from 'lucide-react';
import { WidgetConfig } from '../../../store/useBuilderStore';

export function AggregateGoalWidget({
  config,
  nodeId,
  pollIntervalMs = 60000,
  isEditMode,
  w,
  h,
}: {
  config: WidgetConfig;
  nodeId?: string;
  pollIntervalMs?: number;
  isEditMode?: boolean;
  w?: number;
  h?: number;
}) {
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deviceKey = config.config.deviceKey;
  const unit = config.config.unit || "";
  const goalValue = config.config.goalValue ? Number(config.config.goalValue) : 300;

  const fetchData = useCallback(async () => {
    if (isEditMode || !nodeId || !deviceKey) return;

    setIsLoading(true);
    try {
      const apiKey = import.meta.env.VITE_ANEDYA_API_KEY;
      
      // Align to start of current day in UTC to ensure consistent buckets
      const now = new Date();
      const to = Math.floor(now.getTime() / 1000);
      
      const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      const from = Math.floor(startOfToday.getTime() / 1000) - (86400 * 7);

      const res = await fetch("https://api.anedya.io/v1/aggregates/variable/byTime", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          variable: deviceKey,
          from: from,
          to: to,
          config: {
            aggregation: {
              compute: config.config.compute || "deltasum",
              forEachNode: false
            },
            interval: {
              measure: "day",
              interval: 1
            },
            responseOptions: {
              timezone: "UTC"
            },
            filter: {
              nodes: [nodeId],
              type: "include"
            }
          }
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to fetch aggregate data");
      }

      const pjson = await res.json();
      if (pjson?.data && Array.isArray(pjson.data)) {
        const sorted = pjson.data.sort((a: any, b: any) => a.timestamp - b.timestamp);

        let todayVal = 0;
        let yesterdayVal = 0;
        let weekSum = 0;

        if (sorted.length > 0) {
          todayVal = sorted[sorted.length - 1].aggregate;
        }
        if (sorted.length > 1) {
          yesterdayVal = sorted[sorted.length - 2].aggregate;
        }

        let weekCount = 0;
        for (const item of sorted) {
          weekSum += item.aggregate;
          weekCount++;
        }
        const weekAvg = weekCount > 0 ? weekSum / weekCount : 0;

        setData({
          today: Number(todayVal.toFixed(1)),
          yesterday: Number(yesterdayVal.toFixed(1)),
          weekAvg: Number(weekAvg.toFixed(1))
        });
      } else {
        setData({ today: 0, yesterday: 0, weekAvg: 0 });
      }
      setError(null);
    } catch (err: any) {
      setError(err.message);
      setData(null);
    } finally {
      setIsLoading(false);
    }
  }, [nodeId, deviceKey, isEditMode, config.config.compute]);

  useEffect(() => {
    fetchData();
    if (pollIntervalMs > 0 && !isEditMode) {
      const interval = setInterval(fetchData, pollIntervalMs);
      return () => clearInterval(interval);
    }
  }, [fetchData, pollIntervalMs, isEditMode]);

  const displayData = isEditMode ? { today: 245, yesterday: 219, weekAvg: 232 } : data;
  const isReady = isEditMode || (displayData !== null);

  const percentage = isReady && goalValue > 0 ? Math.min(100, Math.round((displayData.today / goalValue) * 100)) : 0;

  const diffPercent = isReady && displayData.yesterday > 0
    ? Math.round(((displayData.today - displayData.yesterday) / displayData.yesterday) * 100)
    : 0;

  const isUp = diffPercent >= 0;

  // Circular progress math
  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  const isSmall = isEditMode && w !== undefined && h !== undefined && (w < 8 || h < 3);

  return (
    <Card className="w-full h-full flex flex-col bg-white overflow-hidden border border-slate-100 shadow-sm rounded-2xl relative">
      <div className="flex flex-col h-full">
        {/* Always show small header in Edit Mode if small */}
        {isSmall && (
          <div className="px-4 py-3 border-b border-slate-50 flex items-center gap-2 shrink-0">
            <Droplet className="w-4 h-4 text-blue-500" />
            <h3 className="font-semibold text-slate-800 text-sm truncate">{config.title || "Goal Tracker"}</h3>
          </div>
        )}

        {isSmall ? (
          <div className="flex-1 m-4 flex items-center justify-center bg-muted/30 text-muted-foreground text-sm rounded outline-dashed outline-2 outline-border text-center px-2">
            Preview Placeholder
          </div>
        ) : (
          <>
          {!isReady && isLoading && !isEditMode && (
            <div className="absolute inset-0 p-6 z-10 bg-white">
              <Skeleton className="w-full h-full rounded-xl" />
            </div>
          )}

          <CardContent className="p-3 sm:p-6 flex flex-col h-full overflow-y-auto overflow-x-hidden">
        {/* Header */}
        <div className="flex justify-between items-start mb-3 sm:mb-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
              <Droplet className="w-4 h-4 sm:w-5 sm:h-5 text-blue-500" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-800 text-sm sm:text-base leading-tight">{config.title || "Goal Tracker"}</h3>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-slate-500">{new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex flex-wrap justify-between items-center mb-4 sm:mb-8 gap-4">
          <div className="flex flex-col min-w-[120px]">
            <span className="text-xs sm:text-sm font-medium text-slate-500 mb-1">Total Consumed</span>
            <div className="flex items-baseline gap-1 flex-wrap">
              <span className="text-3xl sm:text-5xl font-bold text-blue-600 tracking-tight">{isReady ? displayData.today : '--'}</span>
              <span className="text-lg sm:text-2xl font-bold text-blue-600">{unit}</span>
            </div>
            <span className="text-[10px] sm:text-xs text-slate-500 mt-1">Liters consumed today</span>

            {isReady && (
              <div className={`mt-2 sm:mt-4 inline-flex items-center gap-1.5 px-2 py-1 sm:px-2.5 sm:py-1.5 rounded-lg text-[10px] sm:text-xs font-semibold w-max ${isUp ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                {isUp ? <TrendingUp className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> : <TrendingDown className="w-3 h-3 sm:w-3.5 sm:h-3.5" />}
                {Math.abs(diffPercent)}% {isUp ? 'more' : 'less'} than yesterday
              </div>
            )}
          </div>

          <div className="relative w-24 h-24 sm:w-36 sm:h-36 flex items-center justify-center shrink-0">
            <svg className="w-full h-full -rotate-90 transform" viewBox="0 0 140 140">
              {/* Background circle */}
              <circle
                cx="70"
                cy="70"
                r={radius}
                className="stroke-slate-100"
                strokeWidth="12"
                fill="none"
              />
              {/* Progress circle */}
              <circle
                cx="70"
                cy="70"
                r={radius}
                className="stroke-blue-600 transition-all duration-1000 ease-in-out"
                strokeWidth="12"
                fill="none"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <Droplet className="w-4 h-4 sm:w-6 sm:h-6 text-blue-400 mb-0 sm:mb-0.5 fill-blue-400/20" />
              <span className="text-lg sm:text-2xl font-bold text-slate-800 leading-none mb-0.5 sm:mb-1">{percentage}%</span>
              <span className="text-[8px] sm:text-[10px] text-slate-500 font-medium leading-tight">of daily goal</span>
            </div>
          </div>
        </div>

        {/* Stats Row */}
        <div className="flex flex-wrap gap-3 sm:gap-4 pt-4 sm:pt-6 border-t border-slate-100 mt-auto">
          <div className="flex flex-1 min-w-[80px] items-center gap-2 sm:gap-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-blue-50/50 flex items-center justify-center shrink-0">
              <Target className="w-4 h-4 sm:w-5 sm:h-5 text-blue-500" />
            </div>
            <div className="flex flex-col">
              <span className="text-[9px] sm:text-[10px] font-medium text-slate-500">Daily Goal</span>
              <span className="text-xs sm:text-sm font-bold text-slate-800 truncate">{goalValue} {unit}</span>
            </div>
          </div>

          <div className="flex flex-1 min-w-[80px] items-center gap-2 sm:gap-3 sm:border-l sm:border-slate-100 sm:pl-4">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-blue-50/50 flex items-center justify-center shrink-0">
              <Droplet className="w-4 h-4 sm:w-5 sm:h-5 text-blue-500" />
            </div>
            <div className="flex flex-col">
              <span className="text-[9px] sm:text-[10px] font-medium text-slate-500">Yesterday</span>
              <span className="text-xs sm:text-sm font-bold text-slate-800 truncate">{isReady ? displayData.yesterday : '--'} {unit}</span>
            </div>
          </div>

          <div className="flex flex-1 min-w-[80px] items-center gap-2 sm:gap-3 sm:border-l sm:border-slate-100 sm:pl-4">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-blue-50/50 flex items-center justify-center shrink-0">
              <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-blue-500" />
            </div>
            <div className="flex flex-col">
              <span className="text-[9px] sm:text-[10px] font-medium text-slate-500">This Week Avg.</span>
              <span className="text-xs sm:text-sm font-bold text-slate-800 truncate">{isReady ? displayData.weekAvg : '--'} {unit}</span>
            </div>
          </div>
        </div>

        {/* Footer Alert */}
        {config.config.showFooter !== false && (
          <div className="mt-4 sm:mt-6 bg-blue-50/80 rounded-xl p-3 sm:p-4 flex items-center gap-3 relative overflow-hidden shrink-0">
            <div className="bg-blue-600 rounded-full w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center shrink-0 z-10">
              <CheckCircle2 className="w-3 h-3 sm:w-4 sm:h-4 text-white" />
            </div>
            <div className="z-10">
              <p className="text-xs sm:text-sm font-bold text-blue-800">Great job!</p>
              <p className="text-[10px] sm:text-xs text-blue-600/80 mt-0 sm:mt-0.5">You're staying hydrated and on track.</p>
            </div>
            {/* Decorative waves */}
            <div className="absolute right-0 bottom-0 opacity-40">
              <svg width="120" height="40" viewBox="0 0 120 40" fill="none">
                <path d="M0 40C0 40 15 25 35 25C55 25 65 35 85 35C105 35 120 20 120 20V40H0Z" fill="#3B82F6" />
                <path d="M20 40C20 40 30 30 50 30C70 30 80 35 100 35C120 35 120 40 120 40H20Z" fill="#60A5FA" />
              </svg>
            </div>
          </div>
        )}
          </CardContent>
        </>
      )}
      </div>
    </Card>
  );
}
