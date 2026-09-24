import { GlobalProgressBar } from '@/components/global-progress';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export default function UserManagementLoading() {
  return (
    <div className="space-y-6">
      <GlobalProgressBar />
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">User management</h1>
      <Card>
        <CardHeader><Skeleton className="h-8 w-full max-w-sm" /></CardHeader>
        <CardContent className="space-y-1 px-0">
          <div className="grid grid-cols-[1fr_90px_90px] gap-6 border-y bg-muted/40 px-4 py-3"><Skeleton className="h-3 w-16" /><Skeleton className="h-3 w-10" /><Skeleton className="h-3 w-12" /></div>
          {Array.from({ length: 10 }, (_, index) => index + 1).map((row) => (
            <div key={row} className="flex items-center gap-3 border-b px-4 py-4">
              <Skeleton className="size-8 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2"><Skeleton className="h-3 w-32" /><Skeleton className="h-2.5 w-48 max-w-full" /></div>
              <Skeleton className="h-5 w-16 rounded-full" /><Skeleton className="h-5 w-16 rounded-full" /><Skeleton className="size-7" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
