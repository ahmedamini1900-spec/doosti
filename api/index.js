export const config = { runtime: "edge" };

const T = [
  ["https://","irancel",".ddns.net",":2025"].join("")
];

const FIXED_PATH = "/oliv";

const M = new Set(["GET","POST","PUT","PATCH","DELETE","HEAD"]);

const H = new Set([
  "connection","keep-alive","proxy-authenticate","proxy-authorization",
  "te","trailer","transfer-encoding","upgrade"
]);

const S = new Map();
const L = 40;
const W = 60000;

function rl(ip){
  const n = Date.now();
  const r = S.get(ip) || {c:0,t:n};
  if(n - r.t > W){ r.c = 0; r.t = n; }
  r.c++; S.set(ip,r);
  return r.c <= L;
}

function ip(req){
  return req.headers.get("x-forwarded-for") ||
         req.headers.get("x-real-ip") ||
         "0.0.0.0";
}

function cleanHeaders(req){
  const o = new Headers();
  for(const [k,v] of req.headers){
    const x = k.toLowerCase();
    if(H.has(x)) continue;
    if(x.startsWith("x-vercel")) continue;
    if(x === "host") continue;
    o.set(k,v);
  }
  return o;
}

async function go(url, opt){
  const c = new AbortController();
  const t = setTimeout(()=>c.abort(), 8000);

  try{
    const r = await fetch(url, {...opt, signal:c.signal});
    clearTimeout(t);
    return r;
  }catch(e){
    clearTimeout(t);
    throw e;
  }
}

export default async function handler(req){

  if(!M.has(req.method)){
    return new Response("Method Not Allowed",{status:405});
  }

  const client = ip(req);

  if(!rl(client)){
    return new Response("Too Many Requests",{status:429});
  }

  try{
    const u = new URL(req.url);
    const base = T[0];

    const target = base + FIXED_PATH + u.search;

    const headers = cleanHeaders(req);

    headers.set("host","irancel.ddns.net");
    headers.set("x-forwarded-for", client);
    headers.set("x-forwarded-proto", "https");

    const bodyAllowed = !["GET","HEAD"].includes(req.method);

    const upstream = await go(target,{
      method: req.method,
      headers,
      body: bodyAllowed ? req.body : undefined,
      duplex: bodyAllowed ? "half" : undefined,
      redirect: "manual"
    });

    const rh = new Headers(upstream.headers);

    rh.set("cache-control","public, max-age=10, stale-while-revalidate=20");

    rh.delete("transfer-encoding");
    rh.delete("content-encoding");

    return new Response(upstream.body,{
      status: upstream.status,
      headers: rh
    });

  }catch(e){
    return new Response("Bad Gateway",{status:502});
  }
}
