'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowLeft, GripVertical, Package, RotateCcw, Save } from 'lucide-react';
import { toast } from 'sonner';
import { reorderRecords } from '@/app/admin/actions';
import { resources, type AdminRow } from '@/lib/admin/resources';
import { publicImageUrl } from '@/lib/catalogue/format';
import { supabaseConfig } from '@/lib/supabase/config';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RecordStatus } from './record-card';

function ReorderIdentity({ row, label }: { row: AdminRow; label: string }) {
  const path = row.image_path ?? row.featured_image_path;
  const image = publicImageUrl(typeof path === 'string' ? path : null, supabaseConfig()?.url ?? null);
  return <>{image ? <Image src={image} alt="" width={48} height={48} unoptimized className="hidden size-12 shrink-0 rounded-md object-cover sm:block" /> : <Package className="hidden size-6 shrink-0 text-muted-foreground sm:block" aria-hidden="true" />}<div className="min-w-0 flex-1"><p className="break-words text-sm font-semibold sm:text-base">{label}</p><div className="mt-2"><RecordStatus row={row} /></div></div></>;
}

function SortableRecord({ row, label, position, disabled }: { row: AdminRow; label: string; position: number; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: row.id!, disabled });
  return <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={`flex min-w-0 items-center gap-3 rounded-lg border bg-card p-3 sm:gap-4 sm:p-4 ${isDragging ? 'border-brand-yellow opacity-30' : 'border-border'}`}>
    <Button ref={setActivatorNodeRef} {...attributes} {...listeners} variant="ghost" size="icon" aria-label={`Reorder ${label}`} title={`Reorder ${label}`} disabled={disabled} className="shrink-0 touch-none cursor-grab text-muted-foreground active:cursor-grabbing"><GripVertical aria-hidden="true" /></Button>
    <span className="w-6 shrink-0 text-center text-xs font-semibold tabular-nums text-muted-foreground">{position}</span><ReorderIdentity row={row} label={label} />
  </li>;
}

export function ResourceReorder({ resourceKey, rows, scopes, scope }: { resourceKey: string; rows: AdminRow[]; scopes: AdminRow[]; scope: string }) {
  const resource = resources[resourceKey];
  const router = useRouter();
  const [baseline, setBaseline] = useState(() => rows.map((row) => row.id!));
  const [ids, setIds] = useState(baseline);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();
  const dirty = ids.some((id, index) => id !== baseline[index]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const byId = new Map(rows.map((row) => [row.id!, row]));
  const active = activeId ? byId.get(activeId) : undefined;
  const scopeLabel = resource.fields.find((field) => field.key === resource.scope)?.label;

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  function finishDrag({ active, over }: DragEndEvent) {
    setActiveId(null);
    if (!over || active.id === over.id || pending) return;
    setIds((current) => {
      const from = current.indexOf(String(active.id));
      const to = current.indexOf(String(over.id));
      return from < 0 || to < 0 ? current : arrayMove(current, from, to);
    });
  }

  function save() {
    const next = [...ids];
    setError('');
    startTransition(async () => {
      try {
        const result = await reorderRecords(resourceKey, next, baseline, resource.scope ? scope : null);
        if (!result.ok) { setError(result.error || 'Unable to save the order.'); return; }
        setBaseline(next);
        toast.success('Order Saved');
        router.refresh();
      } catch { setError('Unable to save the order. Your changes are still here. Try again.'); }
    });
  }

  return <main data-admin-editing={dirty || Boolean(activeId) || pending ? 'true' : undefined} className="mx-auto max-w-5xl px-4 py-8 sm:px-8 lg:px-10">
    <Button asChild variant="ghost" className="mb-6"><Link href={`/admin/${resourceKey}`} onClick={(event) => { if (pending || (dirty && !window.confirm('Discard your unsaved order changes?'))) event.preventDefault(); }}><ArrowLeft />{resource.title}</Link></Button>
    <div className="mb-7 flex flex-wrap items-center justify-between gap-4"><div><p className="mb-2 text-xs font-semibold uppercase text-turquoise">Display Order</p><h1 className="text-2xl font-semibold sm:text-3xl">Reorder {resource.title}</h1></div><span className="text-sm text-muted-foreground">{rows.length} {rows.length === 1 ? 'record' : 'records'}</span></div>
    {['menu', 'categories'].includes(resourceKey) && <nav aria-label="Menu Ordering" className="mb-6 flex gap-6 border-b text-sm font-medium">{[['categories', 'Category Order'], ['menu', 'Item Order']].map(([key, label]) => <Link key={key} href={`/admin/${key}/reorder`} aria-current={key === resourceKey ? 'page' : undefined} className={`border-b-2 pb-3 ${key === resourceKey ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`} onClick={(event) => { if (pending || (dirty && !window.confirm('Discard your unsaved order changes?'))) event.preventDefault(); }}>{label}</Link>)}</nav>}
    {resource.scope && <div className="mb-6 max-w-sm"><label className="mb-2 block text-sm font-medium" htmlFor="reorder-scope">{scopeLabel}</label><Select value={scope} disabled={pending || dirty || !scopes.length} onValueChange={(value) => router.push(`/admin/${resourceKey}/reorder?scope=${encodeURIComponent(value)}`)}><SelectTrigger id="reorder-scope" className="w-full"><SelectValue placeholder={`No ${scopeLabel?.toLowerCase()} available`} /></SelectTrigger><SelectContent>{scopes.map((entry) => <SelectItem key={entry.id} value={entry.id!}>{String(entry.name)}</SelectItem>)}</SelectContent></Select></div>}
    <div className="sticky top-16 z-10 mb-5 flex flex-wrap items-center justify-between gap-3 border-y bg-background/95 py-4 backdrop-blur-sm"><p role="status" className={`text-sm ${dirty ? 'text-brand-yellow' : 'text-muted-foreground'}`}>{pending ? 'Saving...' : dirty ? 'Unsaved Changes' : 'Saved Order'}</p><div className="flex gap-2"><Button variant="ghost" size="icon" title="Reset Changes" aria-label="Reset Changes" disabled={!dirty || pending} onClick={() => { setIds([...baseline]); setError(''); }}><RotateCcw /></Button><Button onClick={save} disabled={!dirty || pending || Boolean(activeId)}><Save />Save Order</Button></div></div>
    {error && <p role="alert" className="mb-5 rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">{error}</p>}
    {rows.length ? <DndContext id={`reorder-${resourceKey}`} sensors={sensors} collisionDetection={closestCenter} onDragStart={({ active }) => setActiveId(String(active.id))} onDragEnd={finishDrag} onDragCancel={() => setActiveId(null)}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}><ol aria-label={`${resource.title} Display Order`} className="space-y-3">{ids.map((id, index) => <SortableRecord key={id} row={byId.get(id)!} label={String(byId.get(id)![resource.label])} position={index + 1} disabled={pending || rows.length < 2} />)}</ol></SortableContext>
      <DragOverlay>{active && <div className="flex items-center gap-4 rounded-lg border border-brand-yellow bg-card p-4 shadow-xl"><GripVertical className="size-5 shrink-0 text-brand-yellow" aria-hidden="true" /><ReorderIdentity row={active} label={String(active[resource.label])} /></div>}</DragOverlay>
    </DndContext> : <div className="rounded-lg border border-dashed py-16 text-center"><Package className="mx-auto mb-4 size-8 text-muted-foreground" aria-hidden="true" /><p className="font-medium">No Records to Reorder</p></div>}
  </main>;
}