# godot-explorer Endpoint Catalog

A complete inventory of every external HTTP/HTTPS/WSS endpoint that the
**Decentraland Godot Explorer** client (the metaverse client built on a custom
fork of Godot 4.6.2 + Rust) talks to at runtime, plus the endpoints used by its
build pipeline.

This project exists separately from the client repository. Its purpose is to
serve as the canonical reference for what services need to exist for the client
to function, so the list can be fed into uptime monitoring, status pages,
incident response tooling, or simply consulted by anyone debugging connectivity
issues.

- **Source repo (subject of this catalog):** [`decentraland/godot-explorer`](https://github.com/decentraland/godot-explorer)
- **Catalog last derived from:** branch `chore/bump-sentry-godot-1.6.0`, late April 2026
- **Companion script:** [`status-check.ts`](./status-check.ts) — runs every endpoint and reports which ones respond

The catalog should be re-derived periodically. The methodology section below
documents exactly how that is done so the work is reproducible by anyone
running greps against `decentraland/godot-explorer`.

---

## Table of contents

1. [Methodology](#methodology)
2. [Network primitives inventory](#network-primitives-inventory)
3. [Endpoint catalog](#endpoint-catalog)
   - [Tier 1 — Critical (client cannot function without these)](#tier-1--critical)
   - [Tier 2 — Important (features degrade)](#tier-2--important)
   - [Tier 3 — CDN / build artifacts](#tier-3--cdn--build-artifacts)
   - [Tier 4 — Telemetry](#tier-4--telemetry)
   - [Tier 5 — External / community / app stores](#tier-5--external--community--app-stores)
   - [DAO peer servers (community catalysts)](#dao-peer-servers)
   - [Hardcoded comms targets (test fixtures present in code)](#hardcoded-comms-targets)
   - [Local / dev / CI-only endpoints (informational)](#local--dev--ci-only-endpoints)
4. [Environment variants](#environment-variants)
5. [Source-of-truth file map](#source-of-truth-file-map)
6. [Companion script](#companion-script)
7. [Maintenance notes](#maintenance-notes)

---

## Methodology

The catalog was built in two passes against the `godot-explorer` codebase.

### Pass 1 — Identify network primitives

Before grepping URLs, we enumerated every "exit door" through which the client
can produce network traffic. Three runtimes are involved in this client and
each has its own primitives:

- **Rust** (`lib/`): `reqwest::Client`, `tokio_tungstenite::connect_async`,
  `livekit::Room::connect`, `ethers_providers::Provider<Ws>`,
  `hyper::server` (local embedded asset server), and several internal wrappers
  (`HttpQueueRequester`, `ResourceProvider`, `SceneFetcher`, `SignedLogin`,
  `ArchipelagoManager`).
- **GDScript** (`godot/src/`): Godot's built-in `HTTPRequest`, `HTTPClient`,
  and `WebSocketPeer` nodes; calls into Rust via `Global.http_requester` and
  `Global.async_signed_fetch`; URL opens via `OS.shell_open`.
- **JavaScript** (scenes running inside `lib/src/dcl/js/`): no native network
  primitives — instead, all traffic crosses the FFI through three Deno ops:
  `op_fetch_custom`, `op_signed_fetch_headers`, and `op_ws_create` /
  `op_ws_send` / `op_ws_poll` / `op_ws_cleanup`. These ops are themselves
  implemented with `reqwest` and `tokio_tungstenite`, so all JS network traffic
  is captured by the Rust pass.
- **Other channels**: deep-link parser (`lib/src/deep_link.rs`), Sentry
  transport (`src/sentry_metrics.rs`, `godot/project.godot`), Segment HTTP
  transport (`lib/src/analytics/metrics.rs`), `xtask` build-time downloads
  (`src/install_dependency.rs`, `src/consts.rs`).

### Pass 2 — Trace URLs through every primitive

With the entry points known, the catalog was assembled by:

1. Reading the centralized URL module (`lib/src/urls/mod.rs`) — a single Rust
   file that owns ~35 environment-aware URLs and is the source of truth for
   most runtime traffic.
2. Greping for every other protocol scheme and dominant domain pattern that
   could indicate a hardcoded URL outside the centralized module:
   ```
   grep -rn 'https://'                     lib/ godot/ src/
   grep -rn 'http://'                      lib/ godot/ src/
   grep -rn 'wss://'                       lib/ godot/ src/
   grep -rn 'ws://'                        lib/ godot/ src/
   grep -rn 'stun:\|turn:'                 lib/ godot/
   grep -rn 'decentraland\.\(org\|zone\|today\|io\)' lib/ godot/ src/
   grep -rn 'dclexplorer\|dclregenesis'    lib/ godot/ src/
   grep -rn 'github\.com'                  lib/ godot/ src/
   grep -rn 'amazonaws\|cloudfront\|cdn'   lib/ godot/ src/
   grep -rn 'ipfs\.\|ipfs/'                lib/ godot/ src/
   grep -rn 'segment\|sentry\|firebase'    lib/ godot/ src/
   ```
3. For each primitive identified in Pass 1, locating call sites and reading
   surrounding code to extract the URL (whether literal, formatted, or
   composed from `DclUrls::*`).
4. Cross-checking with `lib/src/deep_link.rs` for the list of inbound URL
   patterns the client itself parses.

### Known limitations

- URLs assembled by string concatenation where the base is read from runtime
  config (e.g. URLs returned dynamically by the realm `/about` endpoint) are
  not visible to grep. To capture these, run the client behind a proxy
  (mitmproxy / Charles) for one full session covering: lobby, login, scene
  load, voice chat, friends list, and a marketplace round-trip.
- URLs internal to vendored crates (livekit, deno, ethers) are not enumerated
  here — they are reached through the primitives we list, but the actual
  servers they hit are governed by the configuration we pass to those crates.
- The client honors a per-session `dclenv` parameter, so any single URL in
  this catalog can resolve to one of three suffixes at runtime. See the
  [environment variants](#environment-variants) section.

---

## Network primitives inventory

A quick reference for every "exit door" of network traffic. When validating
that the catalog stays exhaustive, every new call site should funnel through
one of these.

### Rust (`lib/` and `src/`)

| Primitive | File | Purpose |
| --- | --- | --- |
| `HttpQueueRequester::request` | `lib/src/http_request/http_queue_requester.rs:71` | Main wrapper for outbound HTTP. Adds queueing, semaphore, and the network inspector. |
| `reqwest::Client` (direct) | `lib/src/dcl/js/fetch/mod.rs:60`, `lib/src/asset_server/scene_fetcher.rs:88`, `lib/src/content/resource_provider.rs:50`, `src/download_file.rs:18` | Direct uses outside the queue. |
| `tokio_tungstenite::connect_async` | `lib/src/dcl/js/websocket/mod.rs:79` | WebSocket client used by JS scenes. |
| `dcl_rpc::transports::web_sockets::tungstenite::TungsteniteWebSocket` | `lib/src/social/social_service_manager.rs` | RPC over WebSocket for the social service. |
| `livekit::Room::connect` | `lib/src/comms/adapter/livekit.rs:94` | WebRTC voice chat (when `use_livekit` feature is enabled). |
| `ArchipelagoManager` | `lib/src/comms/adapter/archipelago.rs:29` | WebSocket + protobuf for multi-user comms. |
| `WsRoom` adapter | `lib/src/comms/adapter/ws_room.rs` | Generic WS room adapter. |
| `ethers_providers::Provider<Ws>` | `lib/src/auth/ethereum_provider.rs` | JSON-RPC over WebSocket for Ethereum. |
| `op_fetch_custom`, `op_fetch_consume_text`, `op_fetch_consume_bytes` | `lib/src/dcl/js/fetch/mod.rs:77,291` | Implements `fetch()` for JS scenes. |
| `op_signed_fetch_headers` | `lib/src/dcl/js/fetch/signed_fetch.rs:37` | Generates signed headers for `signedFetch` in JS scenes. |
| `op_ws_create` / `op_ws_send` / `op_ws_poll` / `op_ws_cleanup` | `lib/src/dcl/js/websocket/mod.rs:10` | Implements the `WebSocket` API for JS scenes. |
| `hyper::server::conn::http1` | `lib/src/asset_server/server.rs` | Local embedded HTTP server (serves assets to the embedded scene runtime). |
| `_download_file` | `src/download_file.rs:56` | xtask helper: downloads engine binaries, templates, addons, NDK deps. |

### GDScript (`godot/src/`)

| Primitive | File | Purpose |
| --- | --- | --- |
| `Global.http_requester.request_json(url, method, body, headers)` | `godot/src/global.gd:752,769` | Bridge into Rust's `HttpQueueRequester`. |
| `Global.async_signed_fetch(url, method, body)` | `godot/src/global.gd:880-895` | Wrapper that fetches signed identity headers and forwards to `request_json`. |
| `Global.content_provider.fetch_*(url)` | various | Asset/texture/glTF download bridge into Rust. |
| `WebSocketPeer.connect_to_url(url)` | `godot/src/logic/preview_websocket.gd:60`, `godot/src/logic/scene_inspector_websocket.gd` | Hot-reload + scene inspector. |
| `OS.shell_open(url)` | several `*.gd` files | Opens an external URL in the system browser (Discord, app stores, OpenSea, etc.). |
| `DclUrls.*()` | binding for `lib/src/godot_classes/dcl_urls.rs` exposing `lib/src/urls/mod.rs` | Reads the centralized environment-aware URL set. |

### JavaScript (scenes)

JS scenes have no direct network primitives — they call `fetch` / `WebSocket`
which are routed through the Deno ops listed in the Rust table.

### Other channels

| Channel | File | Notes |
| --- | --- | --- |
| Deep-link parser | `lib/src/deep_link.rs:63` | Accepts `decentraland://` plus a whitelist of `https://decentraland.*` and `https://mobile.dclexplorer.com` URLs. |
| `RpcCall::OpenExternalUrl` / `OpenNftDialog` / `ChangeRealm` | `lib/src/dcl/scene_apis.rs` | Allow scenes to request browser opens or realm changes. |
| Sentry transport | `src/sentry_metrics.rs:10`, Sentry addon initialized via `godot/project.godot:245` | DSN baked into project settings. |
| Segment transport | `lib/src/analytics/metrics.rs:577` | POSTs analytics batches. |
| xtask `consts.rs` URLs | `src/consts.rs` | Build/install-time downloads (engine binaries, addons, protoc, NDK). |

---

## Endpoint catalog

Each entry includes a suggested **tier** for monitoring purposes. Tiers are a
recommendation only — operators can re-bucket per their own criteria.

> Format note: `{env}` expands to `org`, `zone`, or `today` per the
> [environment variants](#environment-variants) section. `{peer-base}` expands
> to `peer.decentraland.org` (org), `peer.decentraland.zone` (zone), or
> `peer-testing.decentraland.org` (today) — see `lib/src/urls/mod.rs:81-93`.

### Tier 1 — Critical

The client cannot reach a usable state without these. A failure on any of
these will block login, scene loading, communication, or in-world wallet
features.

#### Catalyst / content

| Endpoint | Source | Purpose |
| --- | --- | --- |
| `https://realm-provider-ea.decentraland.{env}/main` | `lib/src/urls/mod.rs:66-70` | Default early-access realm provider. |
| `https://realm-provider.decentraland.{env}/main/` | `godot/src/logic/realm.gd:21` | Stable realm provider (legacy / fallback). |
| `https://{peer-base}/about` | `lib/src/urls/mod.rs:81-87` | Realm metadata. |
| `https://{peer-base}/content/` | `lib/src/urls/mod.rs:88-89` | Content service entrypoint. |
| `https://{peer-base}/lambdas/` | `lib/src/urls/mod.rs:91-92` | Lambda service (profiles, queries). |
| `https://worlds-content-server.decentraland.{env}/world/` | `lib/src/urls/mod.rs:72-76` | World scenes (DCL ENS worlds). |
| `https://sdk-team-cdn.decentraland.org/` | `lib/src/realm/scene_entity_coordinator.rs:799`, `src/install_dependency.rs:33` | IPFS-backed CDN for scene content and protocol packages. |

#### Authentication

| Endpoint | Source | Purpose |
| --- | --- | --- |
| `https://auth-api.decentraland.{env}` | `lib/src/urls/mod.rs:44-51` | Auth API base. (In `today` env, falls back to `decentraland.zone`.) |
| `https://auth-api.decentraland.{env}/requests` | `lib/src/urls/mod.rs:54-62` | Auth request submission endpoint. |
| `https://decentraland.{env}/auth/requests` | `lib/src/urls/mod.rs:24-33` | Web frontend for desktop auth flow. |
| `https://decentraland.{env}/auth/mobile` | `lib/src/urls/mod.rs:34-42` | Web frontend for mobile auth flow. |

#### Comms / multiplayer / voice

| Endpoint | Source | Purpose |
| --- | --- | --- |
| `https://comms-gatekeeper.decentraland.{env}/get-scene-adapter` | `lib/src/urls/mod.rs:96-100` | Returns which comms adapter (LiveKit, Archipelago, ws-room) a scene should use. |
| `https://comms-gatekeeper-local.decentraland.{env}/get-scene-adapter` | `lib/src/urls/mod.rs:102-106` | Local-realm variant. |
| `wss://rpc-social-service-ea.decentraland.{env}` | `lib/src/urls/mod.rs:108-113` | WebSocket RPC for friends, blocks, social presence. |

LiveKit / Archipelago WSS targets are dynamic — the gatekeeper returns the
specific URL per scene. The hardcoded values found in tests are listed under
[hardcoded comms targets](#hardcoded-comms-targets).

#### Web3

| Endpoint | Source | Purpose |
| --- | --- | --- |
| `wss://rpc.decentraland.{env}/mainnet` | `lib/src/urls/mod.rs:122-127` | Ethereum mainnet RPC over WebSocket. Used for token/NFT lookups, signature verification, marketplace queries. |

### Tier 2 — Important

Features degrade if these are unreachable, but the client still loads and a
user can move around the world.

#### Discovery

| Endpoint | Source | Purpose |
| --- | --- | --- |
| `https://places.decentraland.org/api` | `lib/src/urls/mod.rs:130-140` | Place discovery / metadata. **Hardcoded to `.org`** unless an explicit `Places` override is set. |
| `https://events.decentraland.{env}/api/events` | `lib/src/urls/mod.rs:143-147` | Event listings. |
| `https://decentraland.{env}/jump/events` | `lib/src/urls/mod.rs:149-153` | Jump-to-event redirector. |

#### Mobile BFF (mobile clients)

| Endpoint | Source | Purpose |
| --- | --- | --- |
| `https://mobile-bff.decentraland.{env}` | `lib/src/urls/mod.rs:157-161` | Backend-for-frontend root. |
| `https://mobile-bff.decentraland.{env}/destinations` | `lib/src/urls/mod.rs:163-167` | Mobile destinations / places. |
| `https://mobile-bff.decentraland.{env}/events` | `lib/src/urls/mod.rs:169-173` | Mobile events feed. |
| `https://mobile-bff.decentraland.{env}/deletion` | `lib/src/urls/mod.rs:175-179` | Account deletion flow. |

#### Notifications / marketplace / OpenSea proxy

| Endpoint | Source | Purpose |
| --- | --- | --- |
| `https://notifications.decentraland.{env}` | `lib/src/urls/mod.rs:183-188` | Push / in-app notifications. |
| `https://decentraland.{env}` | `lib/src/urls/mod.rs:191-192` | Frontend root. |
| `https://decentraland.{env}/marketplace` | `lib/src/urls/mod.rs:194-195` | Marketplace web UI. |
| `https://decentraland.{env}/marketplace/names/claim` | `lib/src/urls/mod.rs:197-201` | ENS name claim flow. |
| `https://opensea.decentraland.{env}` | `lib/src/urls/mod.rs:214-215` | OpenSea proxy used to render NFT data without exposing the OpenSea API key. |

#### Legal

| Endpoint | Source | Purpose |
| --- | --- | --- |
| `https://decentraland.{env}/privacy` | `lib/src/urls/mod.rs:203-204` | Privacy policy. |
| `https://decentraland.{env}/terms` | `lib/src/urls/mod.rs:206-207` | Terms of service. |
| `https://decentraland.{env}/content` | `lib/src/urls/mod.rs:209-210` | Content policy. |

#### Comms (Tier 2 supplementary)

| Endpoint | Source | Purpose |
| --- | --- | --- |
| `https://archipelago-ea-stats.decentraland.{env}` | `lib/src/urls/mod.rs:114-119` | Archipelago island statistics. |

### Tier 3 — CDN / build artifacts

CDNs that serve binary assets, build artifacts, or scene packages. Loss of any
of these blocks builds, app updates, or specific scenes — but does not affect
already-installed clients connected to a working realm.

#### `dclexplorer.com` (project-owned CDNs)

| Endpoint | Source | Purpose |
| --- | --- | --- |
| `https://godot-engine-releases.dclexplorer.com/4.6.2.stable/editors/{platform}` | `src/consts.rs:14-15` | Custom Godot editor binaries. |
| `https://godot-engine-releases.dclexplorer.com/4.6.2.stable/compressed-templates/{platform}` | `src/consts.rs:19-20` | Godot export templates. |
| `https://godot-engine-releases.dclexplorer.com/branches/{branch}/...` | `src/consts.rs:31-40` | Per-branch engine builds. |
| `https://files.dclexplorer.com/android_deps.zip` | `src/install_dependency.rs:374` | Android NDK / build dependencies bundle. |
| `https://optimized-assets.dclexplorer.com/v3` | `lib/src/content/content_provider.rs:140` | Optimized asset bundles (CDN of pre-converted GLBs / textures). |
| `https://benchmark-scenes.dclexplorer.com/...` | `godot/src/tools/benchmark_flow_controller.gd:14,21` | Scenes used by automated benchmark runs. |
| `https://benchmark-reports.dclexplorer.com/{branch}/{sha}/benchmark_report.csv` | `.github/workflows/benchmark.yml:139,265` | CI benchmark report storage. |
| `https://mobile.dclexplorer.com/open` | `godot/src/ui/explorer.gd:1458,1466` | Legacy mobile deep-link redirector. |

#### `decentraland.org` subdomains (CDN-style)

| Endpoint | Source | Purpose |
| --- | --- | --- |
| `https://sdk-team-cdn.decentraland.org/@dcl/protocol/...` | `src/install_dependency.rs:33` | Protobuf protocol package. |
| `https://sdk-team-cdn.decentraland.org/ipfs/{hash}` | `lib/src/realm/scene_entity_coordinator.rs:829`, `godot/src/global.gd:54` | IPFS gateway for test realms (e.g. `goerli-plaza-main-latest`, `streaming-world-main`). |
| `https://sdk-test-scenes.decentraland.org` | `godot/src/ui/components/settings/settings.gd:173` | Repository of SDK test scenes. |
| `https://renderer-artifacts.decentraland.org/sdk6-adaption-layer/main/index.min.js` | `godot/src/logic/scene_fetcher.gd:17` | SDK6 compatibility shim loaded into the JS runtime for legacy scenes. |
| `https://install-mobile.decentraland.org` | `godot/src/ui/explorer.gd:1471` (in comment) | Mobile install redirector. May be retired. |

#### Third-party build dependencies

| Endpoint | Source | Purpose |
| --- | --- | --- |
| `https://github.com/getsentry/sentry-godot/releases/download/1.6.0/...` | `src/consts.rs:7` | Sentry Godot addon. |
| `https://github.com/protocolbuffers/protobuf/releases/download/v23.2/...` | `src/consts.rs:9-10` | `protoc` compiler. |
| `https://github.com/dclexplorer/rusty_v8/releases/download` | `src/run.rs:237` | V8 runtime binaries (project fork). |
| `https://github.com/decentraland/rpc-rust` | `lib/Cargo.toml:58,106` | git dependency: RPC library. |
| `https://github.com/robtfm/client-sdk-rust` | `lib/Cargo.toml:63,103` | git dependency: LiveKit Rust SDK fork. |

### Tier 4 — Telemetry

Loss of these causes silent loss of observability data but no user-facing
degradation.

| Endpoint | Source | Purpose |
| --- | --- | --- |
| `https://api.segment.io/v1/batch` | `lib/src/analytics/metrics.rs:577` | Segment batch ingest endpoint. Receives analytics events (move-to-parcel, chat, friend actions, frame metrics, install attribution). Write key in source. |
| `https://o4510187684298752.ingest.us.sentry.io/4510187688361984` | `godot/project.godot:245` | Sentry DSN baked into the Godot project. |
| `https://sentry.io/api/0` | `src/sentry_metrics.rs:10` | Sentry API base referenced by the xtask metrics helper. |

Firebase (`decentraland-b2352`) is configured via `godot/google-services.json`
and reaches `firebase.googleapis.com` and similar endpoints. These are
enumerated by the Firebase SDK and not listed individually here.

### Tier 5 — External / community / app stores

Third-party endpoints the client opens in an external browser or links to.
Monitor only if you want to flag broken outbound links to users.

| Endpoint | Source | Purpose |
| --- | --- | --- |
| `https://discord.com/channels/417796904760639509/1446513533893218465` | `godot/src/ui/components/settings/settings.gd:726` | Decentraland Discord support channel (deep link). |
| `https://play.google.com/store/apps/details?id=org.decentraland.explorer` | `godot/src/ui/components/auth/lobby.gd:520` | Google Play listing. (Package id may need verification — currently returns 404 as of last check.) |
| `https://apps.apple.com/app/decentraland` | `godot/src/ui/components/auth/lobby.gd:517-523` | Apple App Store listing. |
| `https://decentraland.org/download` | `godot/src/ui/components/auth/lobby.gd:517-523` | Web download page. |
| `https://opensea.io/{address}` | `godot/src/ui/dialogs/nft_dialog.gd:37` | OpenSea NFT detail page (composed at runtime per NFT). |
| `https://docs.google.com/forms/d/e/{form_id}/viewform` | `godot/src/ui/components/settings/settings.gd:535,603` | User feedback form. |

### DAO peer servers

Independent catalyst nodes operated by the community. The realm picker in
settings (`godot/src/logic/realm.gd:9-21`) hardcodes this list. None of these
are required for the client to start, but at least one needs to be reachable
for the user to join the default Genesis City realm.

| Endpoint | Source | Operator |
| --- | --- | --- |
| `https://peer-ec1.decentraland.org/` | `godot/src/logic/realm.gd:9` | Decentraland Foundation (EC dc 1) |
| `https://peer-ec2.decentraland.org/` | `godot/src/logic/realm.gd:10` | Decentraland Foundation (EC dc 2) |
| `https://peer-wc1.decentraland.org/` | `godot/src/logic/realm.gd:11` | Decentraland Foundation (WC dc 1) |
| `https://peer-eu1.decentraland.org/` | `godot/src/logic/realm.gd:12` | Decentraland Foundation (EU dc 1) |
| `https://peer-ap1.decentraland.org/` | `godot/src/logic/realm.gd:13` | Decentraland Foundation (AP dc 1) |
| `https://interconnected.online/` | `godot/src/logic/realm.gd:14` | Community |
| `https://peer.decentral.io/` | `godot/src/logic/realm.gd:15` | Community |
| `https://peer.melonwave.com/` | `godot/src/logic/realm.gd:16` | Community |
| `https://peer.kyllian.me/` | `godot/src/logic/realm.gd:17` | Community |
| `https://peer.uadevops.com/` | `godot/src/logic/realm.gd:18` | Community |
| `https://peer.dclnodes.io/` | `godot/src/logic/realm.gd:19` | Community |

### Hardcoded comms targets

These URLs appear in test cases inside `lib/src/comms/communication_manager.rs`.
They are **not** typically reached by a normal session (the gatekeeper picks
the actual room URL dynamically), but they are present in the binary and may
or may not have live infrastructure behind them. Several DNS records were
unresolvable as of last check — operators may want to confirm whether these
should be removed from the codebase.

| Endpoint | Source | Status (last check) |
| --- | --- | --- |
| `wss://livekit.decentraland.org` | `lib/src/comms/communication_manager.rs:2335-2341` | DNS not resolving |
| `wss://archipelago.decentraland.org/ws` | `lib/src/comms/communication_manager.rs:2261-2301` | DNS not resolving |
| `wss://archipelago-ws-connector.decentraland.org/ws` | `lib/src/comms/communication_manager.rs:2276-2282` | Resolves |
| `wss://preview.decentraland.org/rooms/test` | `lib/src/comms/communication_manager.rs:2231-2238` | Subpath unreachable |
| `https://worlds.decentraland.org/comms` | `lib/src/comms/communication_manager.rs:2246-2253` | DNS not resolving |
| `https://worlds-content-server.decentraland.org/worlds/aesironline.dcl.eth/comms` | `lib/src/comms/communication_manager.rs:2320-2326` | Resolves |

### Local / dev / CI-only endpoints

Not part of any monitoring scope — included for completeness so they are not
mistaken for production endpoints.

| Endpoint | Source | Purpose |
| --- | --- | --- |
| `http://localhost:5173/auth/requests` | `lib/src/urls/mod.rs:26` | Local dev fallback for `today` env. |
| `http://localhost:5173/auth/mobile` | `lib/src/urls/mod.rs:36` | Local dev fallback for `today` env. |
| `http://localhost:8000`, `http://127.0.0.1:8000` | `godot/src/ui/components/settings/settings.gd:172`, `godot/src/global.gd:57` | Default local preview/scene server. |
| `http://localhost:7666/scene-explorer-tests` | `src/main.rs:894` | xtask integration-test runner. |
| `http://127.0.0.1:9090/` | `lib/src/content/content_provider.rs:112,1845` | Local asset optimizer for development. |
| `ws://192.168.1.5:9090` | `lib/src/deep_link.rs:600` | Example string used inside the deep-link parser. |
| `https://freetestdata.com/.../500kb.png` | `lib/src/content/resource_provider.rs:691,695,699` | Test fixture for download tests. |
| `https://deno.land/favicon.ico` | `lib/src/dcl/js/inspector.rs:395` | Favicon shown by the embedded scene inspector. |
| `https://leanmendoza.github.io/...`, `https://sdilauro.github.io/...` | `godot/src/ui/components/settings/settings.gd:184,186` | Pre-populated example scenes in dev settings. |
| `https://evil.com/events?id=hack` | `lib/src/deep_link.rs:557` | Negative test case for the deep-link parser. |

---

## Environment variants

The client supports three environments. Most URLs in `lib/src/urls/mod.rs` are
constructed by appending an environment suffix:

| Env | Suffix | Use case |
| --- | --- | --- |
| `org` | `decentraland.org` | Production. Default for all builds. |
| `zone` | `decentraland.zone` | Staging / QA. |
| `today` | `decentraland.today` (with internal exceptions) | Internal dev. |

The `today` environment makes a couple of substitutions:
- Auth frontend → `http://localhost:5173/auth/{requests,mobile}`
- Auth API → `https://auth-api.decentraland.zone` (no `auth-api.decentraland.today` exists)
- Peer base → `https://peer-testing.decentraland.org` (no `.today` peer)

**Always-`.org` exceptions** (do not change with `dclenv`):
- `https://decentraland.org` — used as the `Origin` header for signed fetches
  (`lib/src/urls/mod.rs:219-221`)
- `https://places.decentraland.org/api` — hardcoded to `.org` unless an
  explicit `Places` service-group override is set
  (`lib/src/urls/mod.rs:130-140`)
- `https://sdk-team-cdn.decentraland.org/` — single global CDN

### Per-service-group overrides

The `dclenv` query parameter (passed via deep link or CLI) can target
individual service groups. The groups are defined in
`lib/src/env/mod.rs` (`ServiceGroup` enum):

- `Auth` — auth frontend, auth API
- `Catalyst` — peer base, realm provider, worlds content server
- `Comms` — gatekeeper, social service, archipelago stats
- `Events` — events API, jump-to-event
- `Places` — places API
- `MobileBff` — mobile-bff and all its sub-paths
- `Notifications` — notifications API

Examples:
```
dclenv=zone                          # all groups → zone
dclenv=auth::zone,org                # auth → zone, everything else → org
dclenv=auth::zone,comms::today,org   # auth → zone, comms → today, default → org
```

Status monitoring should cover at minimum `org` (production) and `zone`
(staging). The `today` variant is internal and not user-facing.

---

## Source-of-truth file map

When auditing the catalog, these files in `decentraland/godot-explorer` are
the primary places to look:

| File | What it owns |
| --- | --- |
| `lib/src/urls/mod.rs` | The 35 environment-aware URL functions. Single source of truth for runtime endpoints. |
| `lib/src/env/mod.rs` | `DclEnvironment` enum, `ServiceGroup` enum, and per-group override resolution. |
| `lib/src/godot_classes/dcl_urls.rs` | Godot bindings exposing `urls/mod.rs` to GDScript as the `DclUrls` class. |
| `lib/src/deep_link.rs` | Parser for inbound URLs (which `https://decentraland.*` patterns the client recognizes). |
| `lib/src/comms/communication_manager.rs` | Comms adapter selection. Contains hardcoded URLs in test cases. |
| `lib/src/comms/adapter/livekit.rs`, `archipelago.rs`, `ws_room.rs` | Specific adapter implementations. |
| `lib/src/analytics/metrics.rs` | Segment endpoint and write key. |
| `lib/src/content/content_provider.rs` | Asset download bases (incl. `optimized-assets.dclexplorer.com`). |
| `lib/src/content/resource_provider.rs` | Per-asset download client. |
| `lib/src/asset_server/scene_fetcher.rs` | Scene entity download. |
| `lib/src/realm/scene_entity_coordinator.rs` | IPFS-style content addressing (hits `sdk-team-cdn`). |
| `lib/src/auth/ethereum_provider.rs` | Ethereum RPC connection. |
| `lib/src/dcl/js/fetch/mod.rs` + `signed_fetch.rs` | JS scene `fetch` and `signedFetch` ops. |
| `lib/src/dcl/js/websocket/mod.rs` | JS scene `WebSocket` ops. |
| `src/consts.rs` | xtask download URLs (engine, templates, addons, protoc). |
| `src/install_dependency.rs` | xtask installer (Android deps, protocol packages). |
| `src/sentry_metrics.rs` | Sentry transport reference. |
| `godot/src/global.gd` | `Global.http_requester` / `Global.async_signed_fetch` definitions. |
| `godot/src/logic/realm.gd` | Hardcoded DAO peer realm list. |
| `godot/src/logic/preview_websocket.gd`, `scene_inspector_websocket.gd` | WebSocketPeer usages. |
| `godot/src/logic/scene_fetcher.gd` | SDK6 adaptation layer URL. |
| `godot/src/logic/content/opensea_nft_fetcher.gd` | OpenSea proxy usage. |
| `godot/src/ui/components/settings/settings.gd` | Realm presets, Discord link, feedback forms. |
| `godot/src/ui/components/auth/lobby.gd` | App store / download links. |
| `godot/src/ui/explorer.gd` | Mobile deep-link construction. |
| `godot/src/ui/dialogs/nft_dialog.gd` | OpenSea public link construction. |
| `godot/src/tools/benchmark_flow_controller.gd` | Benchmark scene URLs. |
| `godot/google-services.json` | Firebase config (project `decentraland-b2352`). |
| `godot/project.godot` | Sentry DSN + addon settings. |
| `lib/Cargo.toml` | Git dependencies (URLs to forks). |
| `.github/workflows/benchmark.yml` | CI benchmark report URL. |

---

## Companion script

[`status-check.ts`](./status-check.ts) is a self-contained TypeScript script
that probes every endpoint listed above and reports which ones respond. It has
no external dependencies — it uses the `fetch` and `WebSocket` globals
available in Bun, Deno, and Node 20+.

### Running

```bash
# Default: probes the `org` (production) environment
npx tsx status-check.ts

# Stage / dev environments
npx tsx status-check.ts --env=zone
npx tsx status-check.ts --env=today

# Filter by tier or category
npx tsx status-check.ts --only=critical
npx tsx status-check.ts --only=catalyst,comms,web3

# Machine-readable output
npx tsx status-check.ts --json > report.json

# Custom timeout (default 10000 ms)
npx tsx status-check.ts --timeout=5000
```

The script exits with code `1` if any probe fails — suitable for CI.

### Output format

Default human-readable output is one row per probe:
```
✅  critical   catalyst       peer-about                       200                  317ms
❌  critical   comms          worlds-comms-signed-login        fetch failed         50ms
     https://worlds.decentraland.org/
```

JSON output is an object with `env`, `timestamp`, `total`, `ok`, `fail`, and a
`results` array. Each result has `id`, `category`, `tier`, `url`, `ok`,
`status`, `durationMs`, and (on failure) `error`.

### Probe semantics

- **HTTPS probes** issue the configured method (default `GET`) and accept any
  status code in `acceptStatus` (default: `[200, 201, 202, 204, 301, 302, 303,
  304, 307, 308]`). Some endpoints have customized accept lists — for example,
  CDN buckets that 404 on root, OPTIONS endpoints that 204, or unauthenticated
  endpoints that return 401.
- **WSS probes** open a real WebSocket connection. For endpoints that require
  authentication and reject anonymous opens (LiveKit, Archipelago), the probe
  is configured as an HTTPS probe to the same host with `acceptStatus`
  including 401/403/426 — a 4xx response confirms the server is up even when
  the WebSocket upgrade is rejected.
- All probes run in parallel (concurrency 12 by default).

### When to update the script

Re-derive after any of these changes in `decentraland/godot-explorer`:
- New entries in `lib/src/urls/mod.rs`
- New comms adapters in `lib/src/comms/adapter/`
- New CDN URLs added under `src/consts.rs` or `src/install_dependency.rs`
- New analytics/telemetry providers
- Changes to `godot/src/logic/realm.gd` (DAO peer list)
- Changes to `godot/project.godot` (Sentry DSN rotation)

The probe definitions live in the `buildProbes(env)` function near the top of
`status-check.ts`. Adding a new endpoint is one new object in that array.

---

## Maintenance notes

- This catalog is a snapshot. The `godot-explorer` repo evolves; the
  [methodology](#methodology) section is the recipe to re-derive it.
- The `status-check.ts` script is the executable form of this catalog and
  should be kept in sync. If a URL is added to one, add it to the other.
- For maximum coverage, supplement static analysis with a one-off proxy
  capture of a real client session — the realm `/about` response and the
  comms gatekeeper response both contain dynamic URLs that grep cannot see.
- Endpoints currently failing in `status-check.ts` should be triaged into one
  of: (a) live but the probe is wrong, (b) live but the URL in the source is
  obsolete and should be removed from `godot-explorer`, (c) genuinely down.
  As of last derivation, the candidates for category (b) include several of
  the [hardcoded comms targets](#hardcoded-comms-targets) and
  `peer-wc1.decentraland.org`.
