"use client";

import { useCachedData } from "@/hooks/use-cached-data";
import { cacheKeys } from "@/lib/cache-keys";
import { DataUnavailable } from "@/components/data-unavailable";
import { StaleDataBanner } from "@/components/stale-data-banner";
import type { AuditData } from "@/app/api/audit/route";
import { AuditTable } from "./audit-table";
import AuditLoading from "./loading";

export default function AuditClient() {
  const { data, cachedAt, isStale, loading, refresh } = useCachedData<AuditData>(
    cacheKeys.audit,
    "/api/audit"
  );

  if (loading && !data) return <AuditLoading />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Audit Logs</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Every important action recorded — last 200 entries
        </p>
      </div>

      {isStale && <StaleDataBanner cachedAt={cachedAt} />}

      {data ? (
        <AuditTable logs={data.logs} />
      ) : (
        <DataUnavailable
          title="Audit logs are temporarily unavailable"
          onRetry={refresh}
        />
      )}
    </div>
  );
}
