'use client';

import { Fragment, useDeferredValue, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowDown, ArrowUp, ArrowLeft, ArrowRight, Archive, ArchiveRestore, CircleCheck, CircleX, GripVertical, Pencil, Plus, RotateCcw, Search, SlidersHorizontal, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { assignGroups, removeRecord, setMenuAvailability, unarchiveMenuItem } from '@/app/admin/actions';
import { resources, type AdminRow } from '@/lib/admin/resources';
import { sectionOrder } from '@/lib/catalogue/ordering';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FilterSelect } from '@/components/ui/filter-select';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { RecordEditor } from './record-editor';
import { RecordCard } from './record-card';

export function ResourceManager({ resourceKey, rows, references, associations = [] }: { resourceKey: string; rows: AdminRow[]; references: Record<string, AdminRow[]>; associations?: AdminRow[] }) {
  const resource = resources[resourceKey];
  const router = useRouter();
  const [search, setSearch] = useState('');
  const deferred = useDeferredValue(search).toLowerCase();
  const [scope, setScope] = useState<string[]>([]);
  const [status, setStatus] = useState<string[]>([]);
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<AdminRow | null | undefined>(undefined);
  const [removing, setRemoving] = useState<{ row: AdminRow; archive: boolean; restore?: boolean } | null>(null);
  const [assigning, setAssigning] = useState<AdminRow | null>(null);
  const [pending, startTransition] = useTransition();
  const scopeField = resource.fields.find((field) => field.key === resource.scope);
  const ordered = resource.scope && scopeField?.reference ? sectionOrder(rows, references[scopeField.reference] ?? [], (row) => row[resource.scope!]) : rows;
  const scoped = ordered.filter((row) => !resource.scope || !scope.length || scope.includes(String(row[resource.scope])));
  const filtered = scoped.filter((row) => {
    const matchesSearch = [row[resource.label], row.slug, row.description, row.body].some((value) => String(value ?? '').toLowerCase().includes(deferred));
    const matchesStatus = !status.length || status.includes(row.archived_at ? 'archived' : row.is_published ? 'published' : 'draft');
    return matchesSearch && matchesStatus;
  });
  const lastPage = Math.max(0, Math.ceil(filtered.length / 20) - 1);
  const currentPage = Math.min(page, lastPage);
  const visible = filtered.slice(currentPage * 20, (currentPage + 1) * 20);
  function resetFilters() { setSearch(''); setScope([]); setStatus([]); setPage(0); }
  function refresh() { startTransition(() => router.refresh()); }
  function toggleAvailability(row: AdminRow) {
    startTransition(async () => {
      try {
        const available = !row.is_available;
        const result = await setMenuAvailability(row.id!, row.updated_at!, available);
        if (!result.ok) { toast.error(result.error); return; }
        toast.success(available ? 'Item Set As Available' : 'Item Set As Sold Out');
        router.refresh();
      } catch { toast.error('Unable to update availability.'); }
    });
  }
  function remove() {
    if (!removing) return;
    startTransition(async () => {
      try {
        const result = removing.restore ? await unarchiveMenuItem(removing.row.id!, removing.row.updated_at!) : await removeRecord(resourceKey, removing.row.id!, removing.row.updated_at!, removing.archive);
        if (!result.ok) { toast.error(result.error); return; }
        toast.success(removing.restore ? 'Item Restored as a Draft' : removing.archive ? 'Item Archived' : 'Record Deleted');
        setRemoving(null); router.refresh();
      } catch { toast.error('Unable to complete the request.'); }
    });
  }
  return <main className="min-w-0 px-4 py-8 sm:px-8 lg:px-10">
    <div className="mb-7 flex flex-wrap items-center justify-between gap-4"><div><p className="mb-2 text-xs font-semibold uppercase text-turquoise">Content & Operations</p><h1 className="text-3xl font-semibold">{resource.title}</h1><p className="mt-2 text-sm text-muted-foreground">{rows.length} {rows.length === 1 ? 'record' : 'records'}</p></div><div className="flex flex-wrap gap-2">{resource.sortable && <Button asChild><Link href={`/admin/${resourceKey}/reorder${scope.length === 1 ? `?scope=${scope[0]}` : ''}`}><GripVertical />Reorder</Link></Button>}<Button disabled={pending || (resource.singleton && !rows.length)} onClick={() => setEditing(resource.singleton ? rows[0] : null)}>{resource.singleton ? <Pencil /> : <Plus />}{resource.singleton ? 'Edit Settings' : `Add ${resource.singular}`}</Button></div></div>
    {!resource.singleton && <div className="relative z-30 mb-6 flex flex-wrap items-start gap-3 border-y py-4"><div className="relative min-w-0 basis-56 flex-1"><Search className="absolute left-3 top-3 size-5 text-muted-foreground" aria-hidden="true" /><Input aria-label={`Search ${resource.title}`} placeholder={`Search ${resource.title}...`} value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} className="h-11 pl-10" /></div>{scopeField?.reference && <FilterSelect label={scopeField.label} placeholder={`All ${scopeField.reference === 'menu_categories' ? 'Categories' : 'Groups'}`} options={(references[scopeField.reference] ?? []).map((reference) => ({ value: reference.id!, label: String(reference.name) }))} value={scope} onChange={(values) => { setScope(values); setPage(0); }} />}{resource.fields.some((field) => field.key === 'is_published') && <FilterSelect label="Publication Status" placeholder="All Statuses" options={[{ value: 'published', label: 'Published' }, { value: 'draft', label: 'Draft' }, ...(resourceKey === 'menu' ? [{ value: 'archived', label: 'Archived' }] : [])]} value={status} onChange={(values) => { setStatus(values); setPage(0); }} />}<Button className="h-11" disabled={!search && !scope.length && !status.length} onClick={resetFilters}><RotateCcw />Reset Filters</Button></div>}
    <div className={resource.singleton ? 'max-w-2xl' : 'grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4'}>
      {visible.map((row, index) => <Fragment key={row.id ?? 'settings'}>
        {resource.scope && scopeField?.reference && scope.length !== 1 && (index === 0 || visible[index - 1][resource.scope] !== row[resource.scope]) && <h2 className="col-span-full border-b pb-3 text-xl font-semibold">{String(references[scopeField.reference]?.find((entry) => entry.id === row[resource.scope!])?.name ?? 'Unassigned')}</h2>}
        <RecordCard resourceKey={resourceKey} row={row} references={references}>
        <Button size="sm" disabled={pending} aria-label={`Edit ${String(row[resource.label])}`} onClick={() => setEditing(row)}><Pencil />Edit</Button>
        <div className="flex gap-1">{resourceKey === 'menu' && <><Button variant="ghost" size="icon" title="Modifier Groups" aria-label={`Modifier Groups for ${row.name}`} disabled={pending} onClick={() => setAssigning(row)}><SlidersHorizontal /></Button><Button variant="ghost" size="icon" title={row.is_available ? 'Set As Sold Out' : 'Set As Available'} aria-label={`${row.is_available ? 'Set As Sold Out' : 'Set As Available'}: ${row.name}`} disabled={pending || Boolean(row.archived_at)} onClick={() => toggleAvailability(row)}>{row.is_available ? <CircleCheck className="text-turquoise" /> : <CircleX className="text-primary" />}</Button>{row.archived_at ? <Button variant="ghost" size="icon" title="Unarchive" aria-label={`Unarchive ${row.name}`} disabled={pending} onClick={() => setRemoving({ row, archive: false, restore: true })}><ArchiveRestore /></Button> : <Button variant="ghost" size="icon" title="Archive" aria-label={`Archive ${row.name}`} disabled={pending} onClick={() => setRemoving({ row, archive: true })}><Archive /></Button>}</>}{!resource.singleton && <Button variant="ghost" size="icon" title="Delete" aria-label={`Delete ${String(row[resource.label])}`} disabled={pending} onClick={() => setRemoving({ row, archive: false })}><Trash2 className="text-destructive" /></Button>}</div>
      </RecordCard></Fragment>)}
    </div>
    {!visible.length && <div className="flex min-h-64 flex-col items-center justify-center gap-4 rounded-lg border border-dashed px-5 text-center"><Search className="size-8 text-muted-foreground" aria-hidden="true" /><h2 className="text-lg font-semibold">{rows.length ? 'No Matching Records' : 'No Records Yet'}</h2></div>}
    {!resource.singleton && <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t pt-5 text-sm"><span role="status" className="text-muted-foreground">{filtered.length} results / Page {currentPage + 1} of {lastPage + 1}</span><div className="flex gap-2"><Button variant="ghost" size="icon" title="Previous Page" aria-label="Previous Page" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}><ArrowLeft /></Button><Button variant="ghost" size="icon" title="Next Page" aria-label="Next Page" disabled={currentPage === lastPage} onClick={() => setPage(currentPage + 1)}><ArrowRight /></Button></div></div>}
    {editing !== undefined && <RecordEditor resourceKey={resourceKey} row={editing} references={references} onClose={() => setEditing(undefined)} onSaved={() => { setEditing(undefined); refresh(); }} />}
    <AlertDialog open={Boolean(removing)} onOpenChange={(open) => { if (!open && !pending) setRemoving(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{removing?.restore ? 'Unarchive' : removing?.archive ? 'Archive' : 'Delete'} {String(removing?.row[resource.label] ?? 'record')}?</AlertDialogTitle><AlertDialogDescription>{removing?.restore ? 'This item will return as an unpublished, unavailable draft. Review it before publishing and making it available.' : removing?.archive ? 'This item will be hidden and unavailable. Existing order history is retained.' : 'This cannot be undone. Referenced records may be protected from deletion.'}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel><Button variant={removing?.restore ? 'default' : 'destructive'} disabled={pending} onClick={remove}>{pending ? 'Working...' : removing?.restore ? 'Unarchive' : removing?.archive ? 'Archive' : 'Delete'}</Button></AlertDialogFooter></AlertDialogContent></AlertDialog>
    {assigning && <GroupAssignment item={assigning} groups={references.modifier_groups ?? []} initial={associations.filter((link) => link.menu_item_id === assigning.id).map((link) => String(link.modifier_group_id))} onClose={() => setAssigning(null)} onSaved={() => { setAssigning(null); refresh(); }} />}
  </main>;
}

function GroupAssignment({ item, groups, initial, onClose, onSaved }: { item: AdminRow; groups: AdminRow[]; initial: string[]; onClose: () => void; onSaved: () => void }) {
  const [selected, setSelected] = useState(initial);
  const [pending, startTransition] = useTransition();
  function move(index: number, direction: number) { const next = [...selected]; [next[index], next[index + direction]] = [next[index + direction], next[index]]; setSelected(next); }
  return <Dialog open onOpenChange={(open) => { if (!open && !pending) onClose(); }}><DialogContent className="max-h-[85svh] overflow-y-auto" showCloseButton={!pending}><DialogHeader><DialogTitle>Modifier Groups</DialogTitle><DialogDescription>{String(item.name)}</DialogDescription></DialogHeader><div className="space-y-3">{[...selected.map((id) => groups.find((group) => group.id === id)!).filter(Boolean), ...groups.filter((group) => !selected.includes(group.id!))].map((group) => { const index = selected.indexOf(group.id!); return <div key={group.id} className="flex items-center gap-3 border-b pb-3"><label className="flex min-w-0 flex-1 items-center gap-3 text-sm"><Checkbox disabled={pending} checked={index >= 0} onCheckedChange={(checked) => setSelected(checked ? [...selected, group.id!] : selected.filter((id) => id !== group.id))} />{String(group.name)}</label>{index >= 0 && <><Button variant="ghost" size="icon-sm" title="Move Group Up" aria-label={`Move ${group.name} up`} disabled={pending || index === 0} onClick={() => move(index, -1)}><ArrowUp /></Button><Button variant="ghost" size="icon-sm" title="Move Group Down" aria-label={`Move ${group.name} down`} disabled={pending || index === selected.length - 1} onClick={() => move(index, 1)}><ArrowDown /></Button></>}</div>; })}</div><Button disabled={pending} onClick={() => startTransition(async () => { try { const result = await assignGroups(item.id!, selected, item.updated_at!); if (!result.ok) toast.error(result.error); else { toast.success('Modifier groups saved'); onSaved(); } } catch { toast.error('Unable to save modifier groups.'); } })}>{pending ? 'Saving...' : 'Save Groups'}</Button></DialogContent></Dialog>;
}