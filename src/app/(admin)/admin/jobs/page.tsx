'use client';

import { useQuery } from '@tanstack/react-query';
import { authFetch } from '@/lib/api-client';

interface FailedJob {
  id: string;
  type: string;
  payload: unknown;
  attempts: number;
  lastError: string | null;
  processedAt: string | null;
  createdAt: string;
}

interface FailedJobsPage {
  rows: FailedJob[];
  total: number;
}

/** docs/ECOMMERCE_IMPLEMENTATION_PLAN.md §6: "admin can see failed jobs in an admin panel view." */
export default function AdminJobsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'jobs', 'failed'],
    queryFn: () => authFetch<FailedJobsPage>('/api/admin/jobs?limit=50'),
  });

  return (
    <div>
      <h1 className="text-foreground mb-6 text-2xl font-semibold">Failed Jobs</h1>

      {isLoading ? (
        <div className="bg-primary-50 h-64 animate-pulse rounded-[10px]" />
      ) : !data || data.rows.length === 0 ? (
        <p className="border-border bg-surface text-muted rounded-[10px] border px-4 py-16 text-center text-sm">
          No failed jobs.
        </p>
      ) : (
        <div className="border-border bg-surface overflow-x-auto rounded-[10px] border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-border text-muted border-b text-left">
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Payload</th>
                <th className="px-4 py-3 font-medium">Attempts</th>
                <th className="px-4 py-3 font-medium">Last error</th>
                <th className="px-4 py-3 font-medium">Failed at</th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {data.rows.map((job) => (
                <tr key={job.id}>
                  <td className="text-foreground px-4 py-3 font-medium">{job.type}</td>
                  <td className="text-muted max-w-xs truncate px-4 py-3 font-mono text-xs">
                    {JSON.stringify(job.payload)}
                  </td>
                  <td className="text-muted px-4 py-3">{job.attempts}</td>
                  <td className="text-error max-w-sm truncate px-4 py-3 text-xs">
                    {job.lastError ?? '—'}
                  </td>
                  <td className="text-muted px-4 py-3 text-xs">
                    {job.processedAt
                      ? new Date(job.processedAt).toLocaleString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          hour: 'numeric',
                          minute: '2-digit',
                        })
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
