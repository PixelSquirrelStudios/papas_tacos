import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth/session';
import { adminRows, adminError } from '@/lib/admin/data';
import { getResource, type AdminRow } from '@/lib/admin/resources';
import { ResourceReorder } from '@/components/admin/resource-reorder';
import { Button } from '@/components/ui/button';

export default async function ReorderPage({ params, searchParams }: { params: Promise<{ resource: string }>; searchParams: Promise<{ scope?: string }> }) {
  await requireAdmin();
  const { resource: key } = await params;
  const resource = getResource(key);
  if (!resource?.sortable) notFound();
  const { scope: requestedScope } = await searchParams;
  let rows: AdminRow[] = [];
  let scopes: AdminRow[] = [];
  let scope = '';
  let error = '';
  try {
    const field = resource.fields.find((entry) => entry.key === resource.scope);
    if (field?.reference) {
      scopes = await adminRows(field.reference, { select: 'id,name,sort_order', order: 'sort_order.asc,id.asc' });
      scope = scopes.some((entry) => entry.id === requestedScope) ? requestedScope! : scopes[0]?.id ?? '';
    }
    if (!resource.scope || scope) rows = await adminRows(resource.table, { order: resource.order, ...(resource.scope ? { [resource.scope]: `eq.${scope}` } : {}) });
  } catch (failure) { error = adminError(failure); }
  if (error) return <main className="p-8"><h1 className="text-2xl font-semibold">Reorder {resource.title}</h1><p role="alert" className="my-5 text-destructive">{error}</p><Button asChild><Link href={`/admin/${key}`}>Back to {resource.title}</Link></Button></main>;
  return <ResourceReorder key={JSON.stringify([key, scope, rows.map((row) => [row.id, row.updated_at, row.sort_order])])} resourceKey={key} rows={rows} scopes={scopes} scope={scope} />;
}