import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { resolveTimeframe, type Timeframe } from './timeframe';

const execAsync = promisify(exec);

const ARM = 'https://management.azure.com';
const API_VERSION_MONITOR = '2024-02-01';
const API_VERSION_COG = '2023-05-01';

const TOKEN_TTL_MS = 50 * 60 * 1000;

let cachedToken: { value: string; expiresAt: number } | null = null;
let tokenPromise: Promise<{ value: string; expiresAt: number }> | null = null;

async function fetchTokenFromAz(): Promise<{ value: string; expiresAt: number }> {
  const { stdout } = await execAsync(
    'az account get-access-token --resource https://management.azure.com -o json',
    { maxBuffer: 10 * 1024 * 1024 },
  );
  const parsed = JSON.parse(stdout);
  if (!parsed.accessToken) throw new Error('az CLI returned no accessToken');
  return { value: parsed.accessToken, expiresAt: Date.now() + TOKEN_TTL_MS };
}

async function getToken(): Promise<string> {
  const override = process.env.AZURE_TOKEN;
  if (override) return override;
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value;
  if (!tokenPromise) {
    tokenPromise = fetchTokenFromAz().finally(() => {
      tokenPromise = null;
    });
  }
  cachedToken = await tokenPromise;
  return cachedToken.value;
}

function getSubscription(): string {
  const sub = process.env.AZURE_SUBSCRIPTION_ID;
  if (!sub) throw new Error('AZURE_SUBSCRIPTION_ID is not set');
  return sub;
}

async function armFetch(path: string, params: Record<string, string>): Promise<any> {
  const token = await getToken();
  const url = new URL(ARM + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Azure ${res.status} ${res.statusText}: ${text.slice(0, 500)}`);
  }
  return res.json();
}

export interface FoundryAccount {
  id: string;
  name: string;
  kind: string;
  location: string;
}

export async function listFoundryAccounts(): Promise<FoundryAccount[]> {
  const sub = getSubscription();
  const rg = process.env.AZURE_RESOURCE_GROUP;
  const path = rg
    ? `/subscriptions/${sub}/resourceGroups/${rg}/providers/Microsoft.CognitiveServices/accounts`
    : `/subscriptions/${sub}/providers/Microsoft.CognitiveServices/accounts`;
  const data = await armFetch(path, { 'api-version': API_VERSION_COG });
  return (data.value || [])
    .filter((a: any) => ['OpenAI', 'AIServices'].includes(a.kind))
    .map((a: any) => ({ id: a.id, name: a.name, kind: a.kind, location: a.location }));
}

export interface UsagePoint {
  t: string;
  model: string;
  modelVersion: string | null;
  deployment: string;
  region: string;
  inputTokens: number;
  outputTokens: number;
}

export interface UsageResponse {
  timeframe: Timeframe;
  start: string;
  end: string;
  interval: string;
  accounts: FoundryAccount[];
  points: UsagePoint[];
}

interface DeploymentInfo {
  model: string;
  version: string | null;
}

async function listDeployments(accountId: string): Promise<Map<string, DeploymentInfo>> {
  const map = new Map<string, DeploymentInfo>();
  try {
    const data = await armFetch(`${accountId}/deployments`, {
      'api-version': API_VERSION_COG,
    });
    for (const d of data.value || []) {
      const name: string | undefined = d.name;
      const modelName: string | undefined = d.properties?.model?.name;
      const version: string | undefined = d.properties?.model?.version;
      if (name && modelName) {
        map.set(name, { model: modelName, version: version ?? null });
      }
    }
  } catch (err) {
    console.error(`[azure] failed to list deployments for ${accountId}:`, err);
  }
  return map;
}

async function getAccountPoints(
  account: FoundryAccount,
  tf: Timeframe,
): Promise<UsagePoint[]> {
  const { start, end, interval } = resolveTimeframe(tf);
  const deployments = await listDeployments(account.id);

  const data = await armFetch(`${account.id}/providers/Microsoft.Insights/metrics`, {
    'api-version': API_VERSION_MONITOR,
    metricnames: 'ProcessedPromptTokens,GeneratedTokens',
    metricnamespace: 'Microsoft.CognitiveServices/accounts',
    timespan: `${start.toISOString()}/${end.toISOString()}`,
    interval,
    aggregation: 'Total',
    $filter: "ModelDeploymentName eq '*'",
  });

  const points = new Map<string, UsagePoint>();

  for (const metric of data.value || []) {
    const metricName: string = metric.name?.value ?? '';
    const kind: 'input' | 'output' =
      metricName === 'ProcessedPromptTokens' ? 'input' : 'output';
    for (const ts of metric.timeseries || []) {
      const deployment =
        (ts.metadatavalues || []).find(
          (m: any) => m.name?.value === 'ModelDeploymentName',
        )?.value || 'unknown';
      const info = deployments.get(deployment);
      const model = info?.model ?? deployment;
      const modelVersion = info?.version ?? null;
      for (const d of ts.data || []) {
        const total = d.total ?? 0;
        if (!total) continue;
        const key = `${d.timeStamp}|${deployment}|${account.location}`;
        const existing =
          points.get(key) ||
          {
            t: d.timeStamp,
            model,
            modelVersion,
            deployment,
            region: account.location,
            inputTokens: 0,
            outputTokens: 0,
          };
        if (kind === 'input') existing.inputTokens += total;
        else existing.outputTokens += total;
        points.set(key, existing);
      }
    }
  }

  return Array.from(points.values());
}

export async function getUsage(tf: Timeframe): Promise<UsageResponse> {
  const { start, end, interval } = resolveTimeframe(tf);
  const accounts = await listFoundryAccounts();

  const results = await Promise.allSettled(
    accounts.map((a) => getAccountPoints(a, tf)),
  );

  const points: UsagePoint[] = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      points.push(...r.value);
    } else {
      console.error(`[azure] ${accounts[i].name} metrics failed:`, r.reason);
    }
  });

  return {
    timeframe: tf,
    start: start.toISOString(),
    end: end.toISOString(),
    interval,
    accounts,
    points,
  };
}
