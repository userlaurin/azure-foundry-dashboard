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

## Notes / caveats

- Azure Monitor metrics have a few minutes of latency — the last few polls may show zeros for the current bucket until the metric pipeline catches up.
- Price matching is heuristic: it normalizes the model name (lowercase, strips `-_` ), filters Cognitive Services retail prices to ones containing that name with an `input`/`output` keyword, and prefers region-match over `Global`. If a model can't be matched, its cost is counted as `$0` (totals will still show tokens correctly).
- The dashboard only covers token-based meters (chat / completion / embedding). Image, audio, and fine-tuning meters are excluded from price matching.
- Polling the Azure Monitor API every 5s is fine for one user, but if you run this behind shared infra, add a server-side cache in [lib/azure.ts](lib/azure.ts).
# azure-foundry-dashboard
