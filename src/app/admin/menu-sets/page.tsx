import Link from 'next/link';
import { requireAdmin } from '@/lib/auth/session';
import { adminRows, adminError } from '@/lib/admin/data';
import { Button } from '@/components/ui/button';
import type { AdminRow } from '@/lib/admin/resources';

export default async function MenuSetsPage() {
  await requireAdmin();
  let sets: AdminRow[] = [];
  let error = '';
  try {
    sets = await adminRows('menu_sets', { order: 'is_default.desc,name.asc,id.asc' });
  } catch (failure) { error = adminError(failure); }
  if (error) return <main className="p-8"><h1 className="text-3xl font-semibold">Menu Sets</h1><p role="alert" className="mt-6 text-destructive">{error}</p></main>;
  return <main className="mx-auto max-w-5xl p-4 sm:p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4"><h1 className="text-3xl font-semibold">Menu Sets</h1><Button asChild><Link href="/admin/menu-sets/new">Create Menu Set</Link></Button></div>
      <p className="mb-6 text-sm text-muted-foreground">Build reusable menus with custom sections and optional prices. Events without an assigned set use the Public Menu. Global publication and sold-out controls still apply.</p>
      <div className="space-y-3">{sets.map((set) => <Link key={set.id} href={`/admin/menu-sets/${set.id}`} className="flex min-h-16 items-center justify-between gap-4 rounded-lg border bg-card p-4"><span className="font-semibold">{String(set.name)}</span><span className="text-sm text-brand-yellow">{set.is_default ? 'Default Public Menu' : 'Edit Menu Set'}</span></Link>)}</div>
    </main>;
}
