export type CapacityWaveReport = {
  name: string;
  concurrency: number;
  ok: number;
  fail: number;
  durationMs: number;
  rps: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
  statusCounts: Record<string, number>;
  errors: string[];
};

export type CapacityTestReport = {
  concurrency: number;
  origin: string;
  startedAt: string;
  finishedAt: string;
  waves: CapacityWaveReport[];
  userAgent?: string;
};

export type PrepareLoadTestResult = {
  eventId: string;
  redeemCouponId: string;
  tokens: string[];
  concurrency: number;
};
