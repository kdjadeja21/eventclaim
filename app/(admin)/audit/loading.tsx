import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export default function AuditLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <Skeleton className="h-7 w-28" />
        <Skeleton className="h-4 w-52" />
      </div>

      <Card>
        <CardContent className="pt-4 divide-y">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="py-3 flex items-start gap-3">
              <Skeleton className="h-5 w-5 rounded-sm mt-0.5 shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3.5 w-28" />
                </div>
                <Skeleton className="h-3 w-56" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
