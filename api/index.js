export const config = { runtime: "edge" };

const T = [
  ["https://","irancel",".ddns.net",":2025"].join(""),
  ["https://","irancel",".ddns.net",":2025"].join("")
];

const M = new Set(["GET","POST","PUT","PATCH","DELETE","HEAD"]);
const H = new Set(["connection","keep-alive","proxy-authenticate","proxy-authorization","te","trailer","transfer-encoding","upgrade"]);

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
  return req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "0.0.0.0";
}

function h(req){
  const o = new Headers();
  for(const [k,v] of req.headers){
    const x = k.toLowerCase();
    if(H.has(x)) continue;
    if(x === "host") continue;
    if(x.startsWith("x-vercel")) continue;
    o.set(k,v);
  }
  return o;
}

function pick(u){
  let i = 0;
  for(let j=0;j<u.length;j++) i += u.charCodeAt(j);
  return T[i % T.length];
}

async function go(url, opt, tries=2){
  let e;
  for(let i=0;i<tries;i++){
    try{
      const c = new AbortController();
      const t = setTimeout(()=>c.abort(), 8000);
      const r = await fetch(url, {...opt, signal:c.signal});
      clearTimeout(t);
      if(r.status < 500) return r;
      e = r;
    }catch(err){ e = err; }
  }
  throw e;
}

export default async function handler(req){
  if(!M.has(req.method)) return new Response("Method Not Allowed",{status:405});

  const client = ip(req);
  if(!rl(client)) return new Response("Too Many Requests",{status:429});

  try{
    const u = new URL(req.url);
    const base = pick(u.pathname);
    const target = base + u.pathname + u.search;

    const headers = h(req);
    headers.set("x-forwarded-for", client);
    headers.set("x-forwarded-proto", "https");

    const bodyAllowed = !["GET","HEAD"].includes(req.method);

    const upstream = await go(target, {
      method: req.method,
      headers,
      body: bodyAllowed ? req.body : undefined,
      duplex: bodyAllowed ? "half" : undefined,
      redirect: "manual"
    });

    const rh = new Headers(upstream.headers);
    rh.set("cache-control","public, max-age=15, stale-while-revalidate=30");
    rh.delete("transfer-encoding");
    rh.delete("content-encoding");

    if(upstream.status === 404){
      return new Response(JSON.stringify({error:"Not Found"}),{
        status:404,
        headers:{"content-type":"application/json"}
      });
    }

    if(upstream.status >= 500){
      return new Response(JSON.stringify({error:"Upstream Error"}),{
        status:502,
        headers:{"content-type":"application/json"}
      });
    }

    return new Response(upstream.body,{
      status: upstream.status,
      headers: rh
    });

  }catch(e){
    return new Response(JSON.stringify({error:"Bad Gateway"}),{
      status:502,
      headers:{"content-type":"application/json"}
    });
  }
}
