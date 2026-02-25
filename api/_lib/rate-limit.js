const rateMap = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateMap) {
    if (now - record.start > record.windowMs) rateMap.delete(key);
  }
}, 60000);

function checkRateLimit(key, maxRequests, windowMs) {
  const now = Date.now();
  const record = rateMap.get(key);

  if (!record || now - record.start > windowMs) {
    rateMap.set(key, { start: now, count: 1, windowMs });
    return { allowed: true, remaining: maxRequests - 1 };
  }

  record.count++;
  if (record.count > maxRequests) {
    const retryAfter = Math.ceil((record.start + windowMs - now) / 1000);
    return { allowed: false, remaining: 0, retryAfter };
  }

  return { allowed: true, remaining: maxRequests - record.count };
}

module.exports = { checkRateLimit };
