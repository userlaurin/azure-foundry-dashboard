import {
  CloudWatchClient,
  ListMetricsCommand,
  GetMetricDataCommand,
  type MetricDataQuery,
} from '@aws-sdk/client-cloudwatch';
import { resolveTimeframe, type Timeframe } from './timeframe';

export interface AwsUsagePoint {
  t: string;
  model: string;
  modelVersion: string | null;
  deployment: string;
  region: string;
  inputTokens: number;
  outputTokens: number;
}

export interface AwsUsageResponse {
  timeframe: Timeframe;
  start: string;
  end: string;
  interval: string;
  accounts: Array<{ id: string; name: string; kind: string; location: string }>;
  points: AwsUsagePoint[];
}

function getRegions(): string[] {
  // Use || not ?? so empty strings (e.g. from docker-compose "${VAR:-}") fall through
  const env = process.env.AWS_BEDROCK_REGIONS || process.env.AWS_REGION || 'us-east-1';
  return env
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean);
}

function periodSeconds(tf: Timeframe): number {
  switch (tf) {
    case '24h':
      return 3600;
    case '7d':
      return 21600;
    case '31d':
      return 86400;
  }
}

/**
 * Cross-region inference profiles use an "<region-prefix>." prefix, e.g.
 * "us.anthropic.claude-3-5-sonnet-20241022-v2:0". Strip it so price lookup
 * matches keys like "anthropic.claude-3-5-sonnet".
 */
function stripRegionPrefix(modelId: string): string {
  return modelId.replace(/^(?:us|eu|ap)\./i, '');
}

async function listBedrockModelIds(client: CloudWatchClient): Promise<string[]> {
  const ids = new Set<string>();
  let nextToken: string | undefined;
  do {
    const res = await client.send(
      new ListMetricsCommand({
        Namespace: 'AWS/Bedrock',
        MetricName: 'InputTokenCount',
        NextToken: nextToken,
      }),
    );
    for (const m of res.Metrics ?? []) {
      for (const d of m.Dimensions ?? []) {
        if (d.Name === 'ModelId' && d.Value) ids.add(d.Value);
      }
    }
    nextToken = res.NextToken;
  } while (nextToken);
  return Array.from(ids);
}

async function fetchRegionUsage(region: string, tf: Timeframe): Promise<AwsUsagePoint[]> {
  const client = new CloudWatchClient({ region });
  const { start, end } = resolveTimeframe(tf);
  const period = periodSeconds(tf);

  const modelIds = await listBedrockModelIds(client);
  if (modelIds.length === 0) return [];

  const points: AwsUsagePoint[] = [];
  const BATCH = 50; // 50 models × 2 metrics = 100 queries, well within 500-query limit

  for (let offset = 0; offset < modelIds.length; offset += BATCH) {
    const batch = modelIds.slice(offset, offset + BATCH);
    const queries: MetricDataQuery[] = [];

    for (let i = 0; i < batch.length; i++) {
      const modelId = batch[i];
      queries.push({
        Id: `inp${i}`,
        MetricStat: {
          Metric: {
            Namespace: 'AWS/Bedrock',
            MetricName: 'InputTokenCount',
            Dimensions: [{ Name: 'ModelId', Value: modelId }],
          },
          Period: period,
          Stat: 'Sum',
        },
      });
      queries.push({
        Id: `out${i}`,
        MetricStat: {
          Metric: {
            Namespace: 'AWS/Bedrock',
            MetricName: 'OutputTokenCount',
            Dimensions: [{ Name: 'ModelId', Value: modelId }],
          },
          Period: period,
          Stat: 'Sum',
        },
      });
    }

    const inputMap = new Map<number, Map<string, number>>();
    const outputMap = new Map<number, Map<string, number>>();
    let nextToken: string | undefined;

    do {
      const res = await client.send(
        new GetMetricDataCommand({
          MetricDataQueries: queries,
          StartTime: start,
          EndTime: end,
          ScanBy: 'TimestampAscending',
          NextToken: nextToken,
        }),
      );

      for (const result of res.MetricDataResults ?? []) {
        const m = result.Id?.match(/^(inp|out)(\d+)$/);
        if (!m) continue;
        const isInput = m[1] === 'inp';
        const idx = parseInt(m[2], 10);
        const map = isInput ? inputMap : outputMap;
        if (!map.has(idx)) map.set(idx, new Map());
        const tsMap = map.get(idx)!;
        const timestamps = result.Timestamps ?? [];
        const values = result.Values ?? [];
        for (let k = 0; k < timestamps.length; k++) {
          const ts = timestamps[k].toISOString();
          tsMap.set(ts, (tsMap.get(ts) ?? 0) + (values[k] ?? 0));
        }
      }

      nextToken = res.NextToken;
    } while (nextToken);

    for (let i = 0; i < batch.length; i++) {
      const modelId = batch[i];
      const inp = inputMap.get(i) ?? new Map<string, number>();
      const out = outputMap.get(i) ?? new Map<string, number>();
      const allTs = new Set([...inp.keys(), ...out.keys()]);
      for (const ts of allTs) {
        const inputTokens = inp.get(ts) ?? 0;
        const outputTokens = out.get(ts) ?? 0;
        if (inputTokens === 0 && outputTokens === 0) continue;
        points.push({
          t: ts,
          model: stripRegionPrefix(modelId),
          modelVersion: null,
          deployment: modelId,
          region,
          inputTokens,
          outputTokens,
        });
      }
    }
  }

  return points;
}

export async function getAwsUsage(tf: Timeframe): Promise<AwsUsageResponse> {
  const regions = getRegions();
  const { start, end, interval } = resolveTimeframe(tf);

  const allPoints = (
    await Promise.all(regions.map((r) => fetchRegionUsage(r, tf)))
  ).flat();

  return {
    timeframe: tf,
    start: start.toISOString(),
    end: end.toISOString(),
    interval,
    accounts: regions.map((r) => ({ id: r, name: r, kind: 'Bedrock', location: r })),
    points: allPoints,
  };
}
