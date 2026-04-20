# Azure Foundry Dashboard

A Next.js dashboard that pulls Azure Foundry / OpenAI token usage from Azure Monitor and multiplies it by Azure Retail Prices to compute live spend. Auto-refreshes every 5 seconds. Timeframe switcher: 24h / 7d / 31d.

## How it works

- **Server (`/api/usage`)**: lists your Cognitive Services accounts (kind `OpenAI` or `AIServices`) in the subscription, then calls Azure Monitor for `ProcessedPromptTokens` and `GeneratedTokens` split by `ModelName`. Needs a bearer token — either set `AZURE_TOKEN`, or just be logged in with `az login` and the server shells out to `az account get-access-token` and caches it.
- **Client**: fetches the Azure Retail Prices API directly (it's public + CORS-friendly), matches each model to its input/output unit price, and multiplies by tokens. Polls the server every 5s.

## Setup

```bash
npm install
az login                     # once
cp .env.example .env.local
# then edit .env.local:
#   AZURE_SUBSCRIPTION_ID=<your sub id>
#   AZURE_RESOURCE_GROUP=    (optional filter)
npm run dev
```

Open http://localhost:3000.

## Environment variables

| Var | Required | Notes |
|---|---|---|
| `AZURE_SUBSCRIPTION_ID` | yes | Subscription to list Cognitive Services accounts from. |
| `AZURE_RESOURCE_GROUP` | no | Restrict to one resource group. |
| `AZURE_TOKEN` | no | Paste a raw bearer token to skip the `az` CLI path. Expires in ~1h. |
| `NEXT_PUBLIC_REFRESH_MS` | no | Poll interval for the browser. Default `5000`. |

If `AZURE_TOKEN` is unset, the server runs `az account get-access-token --resource https://management.azure.com` and caches the result for 50 min.

## Run with Docker Compose

One-command deployment using a stock `node:22-bookworm` image — no Dockerfile needed.

```bash
az login                     # on the host, once
cp .env.example .env         # or set vars inline
docker compose up -d
docker compose logs -f       # watch first-boot install (~1–2 min)
```

Open http://localhost:3000.

### How it's wired

- **Image**: stock `node:22-bookworm`, no custom build.
- **Startup command**: installs the Azure CLI (unless `AZURE_TOKEN` is set), then runs `npm install && npm run build && npm run start`.
- **Source bind-mount**: the repo is mounted at `/app`, so code edits appear inside the container — restart with `docker compose restart dashboard` to rebuild.
- **Auth mount**: `~/.azure` is bind-mounted to `/root/.azure` so the container reuses your existing `az login` session and refreshes tokens transparently.
- **Manual prices**: [data/manual-prices.json](data/manual-prices.json) is part of the bind-mount, so edits take effect on the next `/api/prices` call (1 h server cache).

### Variables used by compose

`docker-compose.yml` reads these from your shell or a `.env` file next to it:

| Var | Required | Purpose |
|---|---|---|
| `AZURE_SUBSCRIPTION_ID` | yes | Passed into the container. |
| `AZURE_RESOURCE_GROUP` | no | Optional RG filter. |
| `AZURE_TOKEN` | no | If set, the container skips the `az` CLI install and uses this bearer token directly (expires in ~1 h). |
| `NEXT_PUBLIC_REFRESH_MS` | no | Client poll interval. Default `5000`. |

### Deploying on a server (no host `az login`)

For headless hosts, set `AZURE_TOKEN` to a pre-fetched bearer token and drop the `~/.azure` mount. You'll need to refresh the token before it expires (~1 h) — easiest path is a service principal that generates tokens on the host and writes them into the container env, or extending [lib/azure.ts](lib/azure.ts) to support client-credentials auth directly.

## Notes / caveats

- Azure Monitor metrics have a few minutes of latency — the last few polls may show zeros for the current bucket until the metric pipeline catches up.
- Price matching is heuristic: it normalizes the model name (lowercase, strips `-_` ), filters Cognitive Services retail prices to ones containing that name with an `input`/`output` keyword, and prefers region-match over `Global`. If a model can't be matched, its cost is counted as `$0` (totals will still show tokens correctly).
- The dashboard only covers token-based meters (chat / completion / embedding). Image, audio, and fine-tuning meters are excluded from price matching.
- Polling the Azure Monitor API every 5s is fine for one user, but if you run this behind shared infra, add a server-side cache in [lib/azure.ts](lib/azure.ts).
# azure-foundry-dashboard
