#!/usr/bin/env bun
// Status check for all external endpoints used by godot-explorer.
//
// Run:
//   bun scripts/status-check.ts                    # default: org
//   bun scripts/status-check.ts --env=zone
//   bun scripts/status-check.ts --env=org --json   # machine-readable
//   bun scripts/status-check.ts --only=critical    # filter by tier
//   bun scripts/status-check.ts --only=catalyst,comms
//   bun scripts/status-check.ts --timeout=5000
//
// Works with: Bun, Deno, Node 20+ (fetch + WebSocket are global).

type Env = "org" | "zone" | "today";
type Tier = "critical" | "important" | "telemetry" | "cdn" | "external" | "dev";

type Probe = {
  id: string;
  category: string;
  tier: Tier;
  url: string;
  protocol: "https" | "wss";
  method?: "GET" | "HEAD" | "POST" | "OPTIONS";
  acceptStatus?: number[];
  notes?: string;
};

const peerBase = (env: Env) =>
  env === "today" ? "https://peer-testing.decentraland.org" : `https://peer.decentraland.${env}`;

const authApi = (env: Env) =>
  env === "today" ? "https://auth-api.decentraland.zone" : `https://auth-api.decentraland.${env}`;

function buildProbes(env: Env): Probe[] {
  const s = env;
  return [
    // ── Catalyst / content (critical) ──
    { id: "realm-provider-ea", category: "catalyst", tier: "critical",
      url: `https://realm-provider-ea.decentraland.${s}/main/about`, protocol: "https" },
    { id: "realm-provider", category: "catalyst", tier: "critical",
      url: `https://realm-provider.decentraland.${s}/main/about`, protocol: "https" },
    { id: "peer-about", category: "catalyst", tier: "critical",
      url: `${peerBase(env)}/about`, protocol: "https" },
    { id: "peer-content-status", category: "catalyst", tier: "critical",
      url: `${peerBase(env)}/content/status`, protocol: "https" },
    { id: "peer-lambdas-status", category: "catalyst", tier: "critical",
      url: `${peerBase(env)}/lambdas/status`, protocol: "https" },
    { id: "worlds-content-server", category: "catalyst", tier: "critical",
      url: `https://worlds-content-server.decentraland.${s}/status`, protocol: "https" },
    { id: "sdk-team-cdn", category: "catalyst", tier: "critical",
      url: "https://sdk-team-cdn.decentraland.org/", protocol: "https",
      acceptStatus: [200, 403] },

    // ── Auth (critical) ──
    { id: "auth-api-base", category: "auth", tier: "critical",
      url: authApi(env), protocol: "https", acceptStatus: [200, 404] },
    { id: "auth-api-requests", category: "auth", tier: "critical",
      url: `${authApi(env)}/requests`, protocol: "https", method: "OPTIONS",
      acceptStatus: [200, 204, 401, 404, 405] },
    { id: "auth-frontend", category: "auth", tier: "critical",
      url: `https://decentraland.${s}/auth/requests`, protocol: "https" },
    { id: "auth-mobile-frontend", category: "auth", tier: "critical",
      url: `https://decentraland.${s}/auth/mobile`, protocol: "https" },

    // ── Comms (critical) ──
    { id: "comms-gatekeeper", category: "comms", tier: "critical",
      url: `https://comms-gatekeeper.decentraland.${s}/get-scene-adapter`,
      protocol: "https", method: "OPTIONS",
      acceptStatus: [200, 204, 401, 404, 405] },
    { id: "comms-gatekeeper-local", category: "comms", tier: "important",
      url: `https://comms-gatekeeper-local.decentraland.${s}/get-scene-adapter`,
      protocol: "https", method: "OPTIONS",
      acceptStatus: [200, 204, 401, 404, 405] },
    { id: "social-service-rpc", category: "comms", tier: "critical",
      url: `wss://rpc-social-service-ea.decentraland.${s}`, protocol: "wss" },
    { id: "archipelago-stats", category: "comms", tier: "important",
      url: `https://archipelago-ea-stats.decentraland.${s}`, protocol: "https",
      acceptStatus: [200, 401, 404] },
    // LiveKit / Archipelago WS require auth; we probe the host via HTTPS
    // and accept 4xx (server is up but rejected the unauth request).
    { id: "livekit", category: "comms", tier: "critical",
      url: "https://livekit.decentraland.org", protocol: "https",
      acceptStatus: [200, 401, 403, 404, 426] },
    { id: "archipelago-ws", category: "comms", tier: "critical",
      url: "https://archipelago.decentraland.org/ws", protocol: "https",
      acceptStatus: [200, 401, 403, 404, 426] },
    { id: "archipelago-ws-connector", category: "comms", tier: "critical",
      url: "https://archipelago-ws-connector.decentraland.org/ws", protocol: "https",
      acceptStatus: [200, 401, 403, 404, 426] },
    { id: "preview-livekit", category: "comms", tier: "important",
      url: "https://preview.decentraland.org/rooms/test", protocol: "https",
      acceptStatus: [200, 401, 403, 404, 426] },
    { id: "worlds-comms-signed-login", category: "comms", tier: "critical",
      url: "https://worlds.decentraland.org/", protocol: "https",
      acceptStatus: [200, 401, 403, 404] },

    // ── Web3 (critical) ──
    { id: "ethereum-rpc", category: "web3", tier: "critical",
      url: `wss://rpc.decentraland.${s}/mainnet`, protocol: "wss" },

    // ── Discovery (important) ──
    { id: "places-api", category: "discovery", tier: "important",
      url: "https://places.decentraland.org/api/places?limit=1", protocol: "https" },
    { id: "events-api", category: "discovery", tier: "important",
      url: `https://events.decentraland.${s}/api/events?limit=1`, protocol: "https" },
    { id: "jump-events", category: "discovery", tier: "important",
      url: `https://decentraland.${s}/jump/events`, protocol: "https",
      acceptStatus: [200, 301, 302, 404] },

    // ── Mobile BFF (important) ──
    { id: "mobile-bff", category: "mobile", tier: "important",
      url: `https://mobile-bff.decentraland.${s}`, protocol: "https",
      acceptStatus: [200, 401, 404] },
    { id: "mobile-bff-destinations", category: "mobile", tier: "important",
      url: `https://mobile-bff.decentraland.${s}/destinations`, protocol: "https",
      acceptStatus: [200, 401, 404] },
    { id: "mobile-bff-events", category: "mobile", tier: "important",
      url: `https://mobile-bff.decentraland.${s}/events`, protocol: "https",
      acceptStatus: [200, 401, 404] },
    { id: "mobile-bff-deletion", category: "mobile", tier: "important",
      url: `https://mobile-bff.decentraland.${s}/deletion`, protocol: "https",
      method: "OPTIONS", acceptStatus: [200, 204, 401, 404, 405] },

    // ── Notifications / Marketplace / OpenSea (important) ──
    { id: "notifications", category: "notifications", tier: "important",
      url: `https://notifications.decentraland.${s}`, protocol: "https",
      acceptStatus: [200, 401, 404] },
    { id: "frontend-host", category: "frontend", tier: "important",
      url: `https://decentraland.${s}`, protocol: "https" },
    { id: "marketplace", category: "frontend", tier: "important",
      url: `https://decentraland.${s}/marketplace`, protocol: "https" },
    { id: "marketplace-claim-name", category: "frontend", tier: "important",
      url: `https://decentraland.${s}/marketplace/names/claim`, protocol: "https" },
    { id: "opensea-proxy", category: "frontend", tier: "important",
      url: `https://opensea.decentraland.${s}`, protocol: "https",
      acceptStatus: [200, 401, 404] },

    // ── Legal pages ──
    { id: "privacy", category: "legal", tier: "external",
      url: `https://decentraland.${s}/privacy`, protocol: "https" },
    { id: "terms", category: "legal", tier: "external",
      url: `https://decentraland.${s}/terms`, protocol: "https" },
    { id: "content-policy", category: "legal", tier: "external",
      url: `https://decentraland.${s}/content`, protocol: "https" },

    // ── DAO peer servers ──
    { id: "peer-ec1", category: "dao-peers", tier: "external",
      url: "https://peer-ec1.decentraland.org/about", protocol: "https" },
    { id: "peer-ec2", category: "dao-peers", tier: "external",
      url: "https://peer-ec2.decentraland.org/about", protocol: "https" },
    { id: "peer-wc1", category: "dao-peers", tier: "external",
      url: "https://peer-wc1.decentraland.org/about", protocol: "https" },
    { id: "peer-eu1", category: "dao-peers", tier: "external",
      url: "https://peer-eu1.decentraland.org/about", protocol: "https" },
    { id: "peer-ap1", category: "dao-peers", tier: "external",
      url: "https://peer-ap1.decentraland.org/about", protocol: "https" },
    { id: "peer-interconnected", category: "dao-peers", tier: "external",
      url: "https://interconnected.online/about", protocol: "https" },
    { id: "peer-decentral-io", category: "dao-peers", tier: "external",
      url: "https://peer.decentral.io/about", protocol: "https" },
    { id: "peer-melonwave", category: "dao-peers", tier: "external",
      url: "https://peer.melonwave.com/about", protocol: "https" },
    { id: "peer-kyllian", category: "dao-peers", tier: "external",
      url: "https://peer.kyllian.me/about", protocol: "https" },
    { id: "peer-uadevops", category: "dao-peers", tier: "external",
      url: "https://peer.uadevops.com/about", protocol: "https" },
    { id: "peer-dclnodes", category: "dao-peers", tier: "external",
      url: "https://peer.dclnodes.io/about", protocol: "https" },

    // ── Build CDN (dclexplorer) ──
    { id: "godot-engine-releases", category: "build-cdn", tier: "cdn",
      url: "https://godot-engine-releases.dclexplorer.com/", protocol: "https",
      acceptStatus: [200, 403, 404] },
    { id: "files-dclexplorer", category: "build-cdn", tier: "cdn",
      url: "https://files.dclexplorer.com/android_deps.zip", protocol: "https",
      method: "HEAD" },
    { id: "optimized-assets", category: "build-cdn", tier: "cdn",
      url: "https://optimized-assets.dclexplorer.com/v3", protocol: "https",
      acceptStatus: [200, 403, 404] },
    { id: "benchmark-scenes", category: "build-cdn", tier: "cdn",
      url: "https://benchmark-scenes.dclexplorer.com/", protocol: "https",
      acceptStatus: [200, 403, 404] },
    { id: "benchmark-reports", category: "build-cdn", tier: "cdn",
      url: "https://benchmark-reports.dclexplorer.com/", protocol: "https",
      acceptStatus: [200, 403, 404] },
    { id: "mobile-deeplink", category: "build-cdn", tier: "cdn",
      url: "https://mobile.dclexplorer.com/open", protocol: "https",
      acceptStatus: [200, 301, 302, 307, 308, 400] },

    // ── Internal CDN (decentraland.org) ──
    { id: "sdk-test-scenes", category: "internal-cdn", tier: "cdn",
      url: "https://sdk-test-scenes.decentraland.org", protocol: "https",
      acceptStatus: [200, 403, 404] },
    { id: "renderer-artifacts-sdk6-adapter", category: "internal-cdn", tier: "cdn",
      url: "https://renderer-artifacts.decentraland.org/sdk6-adaption-layer/main/index.min.js",
      protocol: "https", method: "HEAD" },
    { id: "install-mobile", category: "internal-cdn", tier: "cdn",
      url: "https://install-mobile.decentraland.org", protocol: "https" },

    // ── Telemetry ──
    { id: "segment", category: "telemetry", tier: "telemetry",
      url: "https://api.segment.io/v1/batch", protocol: "https",
      method: "OPTIONS", acceptStatus: [200, 204, 400, 401, 405] },
    { id: "sentry-ingest", category: "telemetry", tier: "telemetry",
      url: "https://o4510187684298752.ingest.us.sentry.io/api/4510187688361984/envelope/",
      protocol: "https", method: "OPTIONS",
      acceptStatus: [200, 204, 400, 401, 403, 405] },

    // ── External (community / app stores) ──
    { id: "discord-support", category: "external", tier: "external",
      url: "https://discord.com/", protocol: "https" },
    { id: "google-play", category: "external", tier: "external",
      url: "https://play.google.com/store/apps/details?id=org.decentraland.explorer",
      protocol: "https" },
    { id: "opensea-public", category: "external", tier: "external",
      url: "https://opensea.io/", protocol: "https" },
  ];
}

// ── Runner ────────────────────────────────────────────────────────────────

type Result = {
  id: string;
  category: string;
  tier: Tier;
  url: string;
  ok: boolean;
  status?: number;
  durationMs: number;
  error?: string;
};

async function probeHttp(p: Probe, timeoutMs: number): Promise<Result> {
  const accept = p.acceptStatus ?? [200, 201, 202, 204, 301, 302, 303, 304, 307, 308];
  const start = performance.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(p.url, {
      method: p.method ?? "GET",
      redirect: "manual",
      signal: ctrl.signal,
      headers: { "user-agent": "godot-explorer-status-check/1.0" },
    });
    return {
      id: p.id, category: p.category, tier: p.tier, url: p.url,
      ok: accept.includes(res.status),
      status: res.status,
      durationMs: Math.round(performance.now() - start),
    };
  } catch (e) {
    return {
      id: p.id, category: p.category, tier: p.tier, url: p.url,
      ok: false,
      durationMs: Math.round(performance.now() - start),
      error: e instanceof Error ? e.message : String(e),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function probeWss(p: Probe, timeoutMs: number): Promise<Result> {
  const start = performance.now();
  return new Promise((resolve) => {
    let settled = false;
    const finish = (r: Omit<Result, "category" | "tier" | "url" | "id">) => {
      if (settled) return;
      settled = true;
      try { ws.close(); } catch {}
      resolve({ id: p.id, category: p.category, tier: p.tier, url: p.url, ...r });
    };
    const ws = new WebSocket(p.url);
    const timer = setTimeout(() => {
      finish({ ok: false, durationMs: Math.round(performance.now() - start), error: "timeout" });
    }, timeoutMs);
    ws.onopen = () => {
      clearTimeout(timer);
      finish({ ok: true, durationMs: Math.round(performance.now() - start) });
    };
    ws.onerror = (ev: Event) => {
      clearTimeout(timer);
      const msg = (ev as ErrorEvent).message ?? "ws error";
      finish({ ok: false, durationMs: Math.round(performance.now() - start), error: msg });
    };
  });
}

async function runAll(probes: Probe[], timeoutMs: number, concurrency = 12): Promise<Result[]> {
  const results: Result[] = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (i < probes.length) {
        const p = probes[i++];
        results.push(p.protocol === "https" ? await probeHttp(p, timeoutMs) : await probeWss(p, timeoutMs));
      }
    })
  );
  return results.sort((a, b) => a.id.localeCompare(b.id));
}

// ── CLI ───────────────────────────────────────────────────────────────────

async function main() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((a) => {
      const [k, v] = a.replace(/^--/, "").split("=");
      return [k, v ?? "true"];
    })
  );

  const env = (args.env ?? "org") as Env;
  if (!["org", "zone", "today"].includes(env)) {
    console.error(`Invalid --env: ${env}. Use org | zone | today.`);
    process.exit(2);
  }

  const timeoutMs = parseInt(args.timeout ?? "10000", 10);
  const onlyFilter = args.only?.split(",").map((s: string) => s.trim()).filter(Boolean) ?? [];
  const asJson = args.json === "true";

  let probes = buildProbes(env);
  if (onlyFilter.length) {
    probes = probes.filter((p) => onlyFilter.includes(p.tier) || onlyFilter.includes(p.category));
  }

  if (!asJson) {
    console.log(`▸ godot-explorer status-check (env=${env}, probes=${probes.length}, timeout=${timeoutMs}ms)\n`);
  }

  const results = await runAll(probes, timeoutMs);

  if (asJson) {
    const summary = {
      env,
      timestamp: new Date().toISOString(),
      total: results.length,
      ok: results.filter((r) => r.ok).length,
      fail: results.filter((r) => !r.ok).length,
      results,
    };
    console.log(JSON.stringify(summary, null, 2));
  } else {
    const pad = (s: string, n: number) => s.padEnd(n);
    for (const r of results) {
      const icon = r.ok ? "✅" : "❌";
      const status = r.status?.toString() ?? r.error?.slice(0, 30) ?? "—";
      console.log(`${icon}  ${pad(r.tier, 10)} ${pad(r.category, 14)} ${pad(r.id, 32)} ${pad(status, 20)} ${r.durationMs}ms`);
      if (!r.ok) console.log(`     ${r.url}`);
    }
    const ok = results.filter((r) => r.ok).length;
    const fail = results.length - ok;
    console.log(`\n  ${ok} ok · ${fail} fail · ${results.length} total`);
    if (fail) process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
