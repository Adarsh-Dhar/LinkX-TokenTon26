// Simple in-memory rate limiter for chat API
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 5;

const userTimestamps: Record<string, number[]> = {};

export function isRateLimited(userId: string): boolean {
  const now = Date.now();
  if (!userTimestamps[userId]) userTimestamps[userId] = [];
  // Remove timestamps older than window
  userTimestamps[userId] = userTimestamps[userId].filter(ts => now - ts < RATE_LIMIT_WINDOW_MS);
  if (userTimestamps[userId].length >= MAX_REQUESTS_PER_WINDOW) return true;
  userTimestamps[userId].push(now);
  return false;
}
