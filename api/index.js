export const config = {
  runtime: "edge",
};

const TARGET_BASE = (process.env.TARGET_DOMAIN || "").replace(/\/$/, "");

// ساده‌ترین allowlist امنیتی (خیلی مهم برای Vercel)
const ALLOWED_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"]);

// headerهای خطرناک
const HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

// ساده‌ترین in-memory rate limit (Edge محدود ولی کمک‌کننده)
const ipHits = new Map();
const RATE_LIMIT = 30; // requests
const WINDOW_MS = 60_000; // 1 minute

function rateLimit(ip) {
  const now = Date.now();
  const record = ipHits.get(ip) || { count: 0, start: now };

  if (now - record.start > WINDOW_MS) {
    record.count = 0;
    record.start = now;
  }

  record.count++;
  ipHits.set(ip, record);

  return record.count <= RATE_LIMIT;
}

function getClientIp(req) {
  return (
    req.headers.get("x-forwarded-for") ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

export default async function handler(req) {
  if (!TARGET_BASE) {
    return new Response("Server misconfigured", { status: 500 });
  }

  if (!ALLOWED_METHODS.has(req.method)) {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const ip = getClientIp(req);

  if (!rateLimit(ip)) {
    return new Response("Too Many Requests", { status: 429 });
  }

  try {
    const url = new URL(req.url);
    const targetUrl = `${TARGET_BASE}${url.pathname}${url.search}`;

    const headers = new Headers();

    for (const [k, v] of req.headers) {
      const key = k.toLowerCase();

      if (HOP_HEADERS.has(key)) continue;
      if (key.startsWith("x-vercel")) continue;
      if (key === "host") continue;

      headers.set(k, v);
    }

    headers.set("x-forwarded-proto", "https");
    headers.set("x-forwarded-for", ip);

    const isBodyAllowed = !["GET", "HEAD"].includes(req.method);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000); // 8s safety

    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: isBodyAllowed ? req.body : undefined,
      duplex: isBodyAllowed ? "half" : undefined,
      signal: controller.signal,
      redirect: "manual",
    });

    clearTimeout(timeout);

    // cache policy (کم فشار روی Vercel)
    const responseHeaders = new Headers(upstream.headers);

    responseHeaders.set(
      "cache-control",
      "public, max-age=10, stale-while-revalidate=30"
    );

    // حذف headerهای مشکل‌ساز
    responseHeaders.delete("transfer-encoding");
    responseHeaders.delete("content-encoding");

    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });

  } catch (err) {
    return new Response("Bad Gateway", { status: 502 });
  }
}
