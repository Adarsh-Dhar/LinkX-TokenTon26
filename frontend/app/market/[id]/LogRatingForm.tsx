"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LogRatingForm({ logId, nodeId, initialRating, initialComment, onSaved }: {
  logId: string;
  nodeId: string;
  initialRating?: number;
  initialComment?: string;
  onSaved?: (newAverage: number) => void;
}) {
  const router = useRouter();
  const [rating, setRating] = useState(initialRating || "");
  const [comment, setComment] = useState(initialComment || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);
    try {
      const res = await fetch("/api/nodes/rate-log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logId, nodeId, rating: Number(rating), comment }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save rating");
      setSuccess(true);
      if (onSaved && typeof data.newAverage === "number") onSaved(data.newAverage);
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="flex gap-2 items-center" onSubmit={handleSubmit}>
      <input
        type="number"
        min="1" max="10"
        placeholder="Rating"
        value={rating}
        onChange={e => setRating(e.target.value)}
        className="w-16 p-1 border rounded bg-background"
        required
      />
      <input
        type="text"
        placeholder="Notes..."
        value={comment}
        onChange={e => setComment(e.target.value)}
        className="flex-1 p-1 border rounded bg-background"
      />
      <button type="submit" className="text-xs bg-primary p-1 rounded text-white" disabled={loading}>
        {loading ? "Saving..." : "Save"}
      </button>
      {success && <span className="text-green-600 text-xs ml-2">Saved!</span>}
      {error && <span className="text-red-600 text-xs ml-2">{error}</span>}
    </form>
  );
}
