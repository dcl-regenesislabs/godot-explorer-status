# [📈 Live Status](https://dcl-regenesislabs.github.io/godot-explorer-status)

Uptime monitoring of every external endpoint the **Decentraland Godot Explorer** client depends on, powered by [Upptime](https://upptime.js.org).

- 🌐 Status page: <https://dcl-regenesislabs.github.io/godot-explorer-status>
- 📚 Endpoint catalog and methodology: [`docs/CATALOG.md`](./docs/CATALOG.md)
- 🛠 Companion local probe script: [`scripts/status-check.ts`](./scripts/status-check.ts) — `node --experimental-strip-types scripts/status-check.ts`

The probe definitions live in [`.upptimerc.yml`](./.upptimerc.yml). GitHub Actions runs them every 5 minutes; when an endpoint goes down an issue is opened automatically and closed on recovery.

<!-- This file is overwritten by the Upptime `summary` workflow with the live status table. -->
