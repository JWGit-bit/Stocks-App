"use client";

import { useEffect, useState } from "react";

interface MarketStatus {
  isOpen: boolean;
  nextOpen: string;
  nextClose: string;
}

function formatDuration(ms: number): string {
  if (ms <= 0) return "0m";
  const totalMinutes = Math.floor(ms / 60_000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (days > 0 || hours > 0) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);
  return parts.join(" ");
}

export function MarketStatusBanner() {
  const [status, setStatus] = useState<MarketStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    fetch("/api/market-status")
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return;
        if (json.error) setError(json.error);
        else setStatus(json as MarketStatus);
      })
      .catch(() => !cancelled && setError("Could not load market status"));
    return () => {
      cancelled = true;
    };
  }, []);

  // Recompute the countdown locally rather than re-polling the API every
  // few seconds; a fresh fetch on load is enough to know the two target
  // timestamps, and open/closed itself only flips right at one of them.
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(interval);
  }, []);

  if (error || !status) return null;

  const target = new Date(status.isOpen ? status.nextClose : status.nextOpen).getTime();
  const remaining = formatDuration(target - now);

  return (
    <div className="flex items-center gap-2 text-sm">
      <span
        className={`h-2 w-2 rounded-full ${status.isOpen ? "bg-green-500" : "bg-zinc-400"}`}
      />
      <span className="text-zinc-600 dark:text-zinc-400">
        {status.isOpen ? `Market open — closes in ${remaining}` : `Market closed — opens in ${remaining}`}
      </span>
    </div>
  );
}
