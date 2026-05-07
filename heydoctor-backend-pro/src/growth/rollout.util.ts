/** Bucket estable 0..99 desde userId UUID (determinístico). */
export function rolloutBucketPercent(userId: string): number {
  let h = 2166136261;
  const s = userId.trim();
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h >>> 0) % 100;
}
