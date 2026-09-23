const attempts = new Map<string, { count: number; expires: number }>();
const windowMs = 10 * 60 * 1000;

export function allowEnquiry(key: string, now = Date.now()) {
  for (const [entry, value] of attempts) if (value.expires <= now) attempts.delete(entry);
  const current = attempts.get(key);
  if (current) {
    if (current.count >= 5) return false;
    current.count += 1;
  } else {
    if (attempts.size >= 10000) return false;
    attempts.set(key, { count: 1, expires: now + windowMs });
  }
  return true;
}