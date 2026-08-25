"use client";

import { useEffect, useState } from "react";

interface SettingsStatus {
  paperKeyConfigured: boolean;
  liveKeyConfigured: boolean;
  isLiveMode: boolean;
  tradingPaused: boolean;
}

export function ApiKeysForm() {
  const [status, setStatus] = useState<SettingsStatus | null>(null);
  const [keyId, setKeyId] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [togglingPause, setTogglingPause] = useState(false);

  useEffect(() => {
    fetch("/api/settings/alpaca-keys", { cache: "no-store" })
      .then((res) => res.json())
      .then(setStatus);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setSaving(true);
    const res = await fetch("/api/settings/alpaca-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyId, secretKey }),
    });
    setSaving(false);
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "Something went wrong");
      return;
    }
    setSaved(true);
    setKeyId("");
    setSecretKey("");
    setStatus((prev) => (prev ? { ...prev, paperKeyConfigured: true } : prev));
  }

  async function handleTogglePause() {
    if (!status) return;
    setTogglingPause(true);
    const res = await fetch("/api/settings/trading-paused", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tradingPaused: !status.tradingPaused }),
    });
    setTogglingPause(false);
    if (res.ok) {
      setStatus({ ...status, tradingPaused: !status.tradingPaused });
    }
  }

  return (
    <div className="flex max-w-md flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Alpaca paper trading keys</h2>
        <p className="text-sm text-zinc-500">
          {status?.paperKeyConfigured
            ? "A paper trading key pair is saved."
            : "Not connected yet. Create a free paper trading account at alpaca.markets, then paste your keys below."}
        </p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="keyId" className="text-sm font-medium">
              API Key ID
            </label>
            <input
              id="keyId"
              required
              value={keyId}
              onChange={(e) => setKeyId(e.target.value)}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="secretKey" className="text-sm font-medium">
              Secret Key
            </label>
            <input
              id="secretKey"
              type="password"
              required
              value={secretKey}
              onChange={(e) => setSecretKey(e.target.value)}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {saved && (
            <p className="text-sm text-green-700 dark:text-green-500">
              Saved — connection verified with Alpaca.
            </p>
          )}
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900"
          >
            {saving ? "Verifying..." : "Save & test connection"}
          </button>
        </form>
      </section>

      {status?.paperKeyConfigured && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-medium">Trading kill switch</h2>
          <p className="text-sm text-zinc-500">
            Pausing stops the automated engine from placing any new orders on
            your account, without touching your watchlist.
          </p>
          <button
            onClick={handleTogglePause}
            disabled={togglingPause}
            className="w-fit rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium disabled:opacity-50 dark:border-zinc-700"
          >
            {status.tradingPaused ? "Resume trading" : "Pause trading"}
          </button>
        </section>
      )}

      <section className="flex flex-col gap-2 rounded-md border border-dashed border-zinc-300 p-4 dark:border-zinc-700">
        <h2 className="text-sm font-medium">Live trading</h2>
        <p className="text-sm text-zinc-500">
          Not available yet. Live trading will require its own key pair and an
          explicit typed confirmation before it can place real-money orders.
        </p>
      </section>
    </div>
  );
}
