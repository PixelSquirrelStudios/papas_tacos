'use client';

import { Fragment, useEffect, useState, useTransition, type ComponentProps } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { DndContext, DragOverlay, PointerSensor, KeyboardSensor, closestCenter, pointerWithin, rectIntersection, defaultDropAnimationSideEffects, useDraggable, useSensor, useSensors, type CollisionDetection, type DragOverEvent, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, sortableKeyboardCoordinates, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowDown, ArrowLeft, ArrowUp, GripVertical, Plus, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { saveMenuSet } from '@/app/admin/menu-sets/actions';
import type { AdminRow } from '@/lib/admin/resources';
import type { MenuSet, MenuSection, MenuEntry } from '@/lib/catalogue/menu-sets';
import { money } from '@/lib/bag';
import { notifySiteUpdated } from '@/lib/site-updates';

type Entry = { itemId: string; price: string };
type Section = { id: string; title: string; items: Entry[] };

const menuCollisions: CollisionDetection = (args) => {
  const sectionDrag = String(args.active.id).startsWith('section:');
  const containers = args.droppableContainers.filter((container) => sectionDrag ? String(container.id).startsWith('section:') : container.id !== args.active.id);
  const options = { ...args, droppableContainers: containers };
  if (!args.pointerCoordinates) return closestCenter(options);
  const hits = pointerWithin(options);
  const itemHits = hits.filter((hit) => String(hit.id).startsWith('item:'));
  return itemHits.length ? itemHits : hits.length ? hits : rectIntersection(options);
};

function InsertionMarker() {
  return <li aria-hidden="true" data-drop-marker className="pointer-events-none relative h-0 list-none"><div className="absolute -top-2 inset-x-0 z-10 h-1 rounded-full bg-turquoise shadow-[0_0_12px_var(--color-turquoise)]"><span className="absolute -left-1 -top-1 size-3 rounded-full bg-turquoise" /></div></li>;
}

type LibraryProps = { item: AdminRow; added?: boolean; disabled?: boolean; onAdd?: () => void };

function LibraryItem(props: LibraryProps) {
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({ id: `library:${props.item.id}`, disabled: props.added || props.disabled });
  return <LibraryCard {...props} rootProps={{ ref: setNodeRef, style: { opacity: isDragging ? 0.25 : undefined } }} handleProps={{ ...attributes, ...listeners }} />;
}

function LibraryCard({ item, added, disabled, onAdd, rootProps, handleProps }: LibraryProps & { rootProps?: ComponentProps<'div'>; handleProps?: ComponentProps<typeof Button> }) {
  return <div {...rootProps} className={`flex items-center gap-2 rounded-lg border bg-muted p-2 shadow-sm transition-colors ${added ? 'border-border opacity-50' : 'border-border hover:border-turquoise/50 hover:bg-muted'}`}>
    <Button {...handleProps} variant="ghost" size="icon" aria-label={`Drag ${item.name}`} disabled={added || disabled} className="mr-2 shrink-0 touch-none cursor-grab rounded-md bg-background/60 text-muted-foreground hover:text-turquoise active:cursor-grabbing"><GripVertical /></Button>
    <div className="min-w-0 flex-1"><p className="break-words text-sm font-medium">{String(item.name)}</p>{typeof item.slug === 'string' && <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{item.slug}</p>}<p className="mt-1 text-xs text-muted-foreground">{money(Number(item.price_pence))}{!item.is_published ? ' - Unpublished' : !item.is_available ? ' - Sold Out' : ''}</p></div>
    <Button variant="ghost" size="icon" aria-label={`Add ${item.name} to section`} disabled={added || disabled} onClick={onAdd} className="shrink-0 text-turquoise hover:bg-turquoise/10"><Plus /></Button>
  </div>;
}

type ItemProps = { entry: Entry; item?: AdminRow; disabled?: boolean; onPrice?: (price: string) => void; onRemove?: () => void; onMove?: (direction: number) => void; first?: boolean; last?: boolean };

function SetItem(props: ItemProps) {
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id: `item:${props.entry.itemId}`, disabled: props.disabled });
  return <ItemCard {...props} rootProps={{ ref: setNodeRef, style: { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.2 : undefined } }} handleProps={{ ref: setActivatorNodeRef, ...attributes, ...listeners }} />;
}

function ItemCard({ entry, item, disabled, onPrice, onRemove, onMove, first, last, rootProps, handleProps }: ItemProps & { rootProps?: ComponentProps<'li'>; handleProps?: ComponentProps<typeof Button> }) {
  const label = String(item?.name || 'Removed or archived item');
  return <li {...rootProps} className="flex min-w-0 flex-wrap items-center gap-3 rounded-lg border border-l-4 border-border border-l-turquoise/60 bg-muted p-3 shadow-md shadow-black/10 transition-colors hover:border-turquoise/50 sm:p-4">
    <Button {...handleProps} variant="ghost" size="icon" aria-label={`Reorder ${label}`} disabled={disabled} className="mr-2 shrink-0 touch-none cursor-grab rounded-md border border-border bg-background/70 text-muted-foreground hover:text-turquoise active:cursor-grabbing"><GripVertical /></Button>
    <div className="min-w-32 flex-1"><p className="break-words text-sm font-semibold">{label}</p>{typeof item?.slug === 'string' && <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{item.slug}</p>}<p className="mt-1 text-xs text-muted-foreground">{item ? `Catalogue price ${money(Number(item.price_pence))}${!item.is_published ? ' - Unpublished' : !item.is_available ? ' - Sold Out' : ''}` : 'Remove this item before saving'}</p></div>
    <label className="w-44 shrink-0 text-xs text-muted-foreground">Set Price (GBP)<Input aria-label={`Set price for ${label}`} type="number" min="0" max="1000" step="0.01" value={entry.price} placeholder="Use item price" disabled={disabled} onChange={(event) => onPrice?.(event.target.value)} className="mt-1 bg-background/80" /></label>
    <div className="flex"><Button variant="ghost" size="icon" aria-label={`Move ${label} up`} disabled={disabled || first} onClick={() => onMove?.(-1)}><ArrowUp /></Button><Button variant="ghost" size="icon" aria-label={`Move ${label} down`} disabled={disabled || last} onClick={() => onMove?.(1)}><ArrowDown /></Button><Button variant="ghost" size="icon" aria-label={`Remove ${label} from set`} disabled={disabled} onClick={onRemove}><Trash2 /></Button></div>
  </li>;
}

function SetSection({ section, children, disabled, onTitle, onRemove, onMove, first, last, receiving }: { section: Section; children: React.ReactNode; disabled: boolean; onTitle: (title: string) => void; onRemove: () => void; onMove: (direction: number) => void; first: boolean; last: boolean; receiving?: boolean }) {
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, transform, transition, isDragging, isOver } = useSortable({ id: `section:${section.id}`, disabled });
  return <section ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} aria-label={section.title || 'Untitled Section'} data-drop-target={receiving || undefined} className={`min-w-0 rounded-xl border bg-card p-3 shadow-sm transition-colors sm:p-5 ${receiving ? 'border-turquoise ring-2 ring-turquoise/30' : isOver ? 'border-brand-yellow ring-2 ring-brand-yellow/20' : 'border-border'} ${isDragging ? 'opacity-30' : ''}`}>
    <div className="mb-4 flex flex-wrap items-center gap-2 border-b border-brand-yellow/20 pb-4"><Button ref={setActivatorNodeRef} {...attributes} {...listeners} variant="ghost" size="icon" aria-label={`Reorder section ${section.title}`} disabled={disabled} className="touch-none cursor-grab text-brand-yellow active:cursor-grabbing"><GripVertical /></Button><Input aria-label="Section Title" value={section.title} maxLength={120} disabled={disabled} onChange={(event) => onTitle(event.target.value)} className="min-w-32 flex-1 border-transparent bg-brand-yellow/5 font-semibold text-brand-yellow focus-visible:border-brand-yellow/40" /><div className="flex"><Button variant="ghost" size="icon" aria-label={`Move section ${section.title} up`} disabled={disabled || first} onClick={() => onMove(-1)}><ArrowUp /></Button><Button variant="ghost" size="icon" aria-label={`Move section ${section.title} down`} disabled={disabled || last} onClick={() => onMove(1)}><ArrowDown /></Button><Button variant="ghost" size="icon" aria-label={`Remove section ${section.title}`} disabled={disabled} onClick={onRemove}><Trash2 /></Button></div><p className="w-full pl-2 text-xs text-muted-foreground">{section.items.length} {section.items.length === 1 ? 'item' : 'items'} in this section</p></div>
    {children}
    {!section.items.length && <p className="rounded-lg border-2 border-dashed border-turquoise/25 bg-turquoise/5 px-4 py-10 text-center text-sm text-muted-foreground">Drag items here, or use the + buttons in the item library.</p>}
  </section>;
}

export function MenuSetEditor({ set, sections: initialSections, entries, items, categories }: { set: MenuSet | null; sections: MenuSection[]; entries: MenuEntry[]; items: AdminRow[]; categories: AdminRow[] }) {
  const router = useRouter();
  const [name, setName] = useState(set?.name || '');
  const [sections, setSections] = useState<Section[]>(() => initialSections.map((section) => ({
    id: section.id, title: section.title, items: entries.filter((entry) => entry.section_id === section.id).map((entry) => ({ itemId: entry.menu_item_id, price: entry.price_pence === null ? '' : (entry.price_pence / 100).toFixed(2) })),
  })));
  const [baseline, setBaseline] = useState(() => JSON.stringify({ name, sections }));
  const [target, setTarget] = useState(initialSections[0]?.id || '');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [active, setActive] = useState<string | null>(null);
  const [dragWidth, setDragWidth] = useState<number>();
  const [dropTarget, setDropTarget] = useState<{ sectionId: string; index: number } | null>(null);
  const [pending, startTransition] = useTransition();
  const dirty = baseline !== JSON.stringify({ name, sections });
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const assigned = new Set(sections.flatMap((section) => section.items.map((entry) => entry.itemId)));
  const byId = new Map(items.map((item) => [item.id!, item]));
  const activeSection = sections.find((section) => `section:${section.id}` === active);
  const activeEntry = sections.flatMap((section) => section.items).find((entry) => `item:${entry.itemId}` === active);
  const activeLibraryItem = active?.startsWith('library:') ? byId.get(active.slice(8)) : undefined;
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  function updateSection(id: string, update: (section: Section) => Section) { setSections((current) => current.map((section) => section.id === id ? update(section) : section)); }
  function addItem(itemId: string, sectionId = target) {
    if (!sections.some((section) => section.id === sectionId)) { setError('Add or choose a section first.'); return; }
    if (assigned.has(itemId)) return;
    updateSection(sectionId, (section) => ({ ...section, items: [...section.items, { itemId, price: '' }] }));
    setError('');
  }
  function destinationFor({ active, over }: DragOverEvent) {
    if (!over || String(active.id).startsWith('section:')) return null;
    const destination = sections.find((section) => `section:${section.id}` === over.id || section.items.some((entry) => `item:${entry.itemId}` === over.id));
    if (!destination) return null;
    const index = destination.items.findIndex((entry) => `item:${entry.itemId}` === over.id);
    const dragged = active.rect.current.translated;
    const after = dragged && dragged.top + dragged.height / 2 > over.rect.top + over.rect.height / 2;
    return { sectionId: destination.id, index: index < 0 ? destination.items.length : index + (after ? 1 : 0) };
  }
  function finishDrag(event: DragEndEvent) {
    const { active, over } = event;
    const destination = destinationFor(event);
    setActive(null);
    setDropTarget(null);
    if (!over || pending || active.id === over.id) return;
    const from = String(active.id);
    const to = String(over.id);
    if (from.startsWith('section:')) {
      if (to.startsWith('section:')) setSections(arrayMove(sections, sections.findIndex((section) => `section:${section.id}` === from), sections.findIndex((section) => `section:${section.id}` === to)));
      return;
    }
    if (!destination) return;
    const itemId = from.replace(/^(library:|item:)/, '');
    const origin = sections.find((section) => section.items.some((entry) => entry.itemId === itemId));
    const entry = origin?.items.find((entry) => entry.itemId === itemId) || (from.startsWith('library:') ? { itemId, price: '' } : undefined);
    if (!entry || (from.startsWith('library:') && assigned.has(itemId))) return;
    const originIndex = origin?.items.findIndex((entry) => entry.itemId === itemId) ?? -1;
    const index = destination.index - (origin?.id === destination.sectionId && originIndex < destination.index ? 1 : 0);
    setSections(sections.map((section) => {
      const remaining = section.items.filter((candidate) => candidate.itemId !== itemId);
      return { ...section, items: section.id === destination.sectionId ? [...remaining.slice(0, index), entry, ...remaining.slice(index)] : remaining };
    }));
  }
  function save() {
    setError('');
    const invalidPrice = sections.some((section) => section.items.some((entry) => entry.price !== '' && (!/^\d+(\.\d{1,2})?$/.test(entry.price) || Number(entry.price) > 1000)));
    if (invalidPrice) { setError('Use a price between 0 and 1000 GBP with at most two decimal places, or leave it blank to use the item price.'); return; }
    startTransition(async () => {
      try {
        const result = await saveMenuSet({ id: set?.id || null, updatedAt: set?.updated_at || null, name, sections: sections.map((section) => ({ title: section.title, items: section.items.map((entry) => ({ itemId: entry.itemId, pricePence: entry.price === '' ? null : Math.round(Number(entry.price) * 100) })) })) });
        if (!result.ok) { setError(result.error || 'Unable to save the menu set.'); return; }
        setBaseline(JSON.stringify({ name, sections }));
        toast.success('Menu Set Saved');
        notifySiteUpdated();
        if (!set) router.replace(`/admin/menu-sets/${result.id}`);
        router.refresh();
      } catch { setError('Unable to save the menu set. Your changes are still here. Please try again.'); }
    });
  }
  return <main data-admin-editing={dirty || pending || Boolean(active) ? 'true' : undefined} className="w-full min-w-0 p-4 sm:p-6 lg:p-8">
    <Button asChild variant="ghost" className="mb-5"><Link href="/admin/menu-sets" onClick={(event) => { if (pending || (dirty && !window.confirm('Discard unsaved menu set changes?'))) event.preventDefault(); }}><ArrowLeft />Menu Sets</Link></Button>
    <h1 className="mb-3 text-3xl font-semibold">{set?.is_default ? 'Default Public Menu' : set ? 'Edit Menu Set' : 'Create Menu Set'}</h1>
    <p className="mb-5 text-sm text-muted-foreground">Custom sections do not change item categories. Blank prices use the current item price; overrides apply only to this set. Unpublished or archived items stay hidden and sold-out items cannot be ordered.</p>
    <label className="mb-5 block max-w-lg text-sm font-medium">Menu Set Name<Input value={name} maxLength={120} disabled={pending} onChange={(event) => setName(event.target.value)} className="mt-2" /></label>
    <div className="sticky top-16 z-20 mb-5 flex items-center justify-between gap-3 border-y bg-background/95 py-3"><p role="status" className="text-sm text-muted-foreground">{pending ? 'Saving...' : dirty ? 'Unsaved Changes' : 'Saved'}</p><Button onClick={save} disabled={pending || Boolean(active) || (!dirty && Boolean(set))}><Save />Save Menu Set</Button></div>
    {error && <p role="alert" className="mb-5 rounded-md border border-destructive/40 p-4 text-sm text-destructive">{error}</p>}
    <DndContext sensors={sensors} collisionDetection={menuCollisions} onDragStart={({ active }) => { setActive(String(active.id)); setDragWidth(active.rect.current.initial?.width); setDropTarget(null); }} onDragMove={(event) => setDropTarget(destinationFor(event))} onDragOver={(event) => setDropTarget(destinationFor(event))} onDragEnd={finishDrag} onDragCancel={() => { setActive(null); setDropTarget(null); }}>
      <div className="grid min-w-0 gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <aside aria-label="Menu Item Library" className="max-h-[50vh] min-w-0 self-start overflow-y-auto rounded-lg border bg-card p-4 lg:sticky lg:top-36 lg:max-h-[70vh]">
          <h2 className="mb-3 text-lg font-semibold">All Menu Items</h2><Input aria-label="Search Menu Items" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search items..." className="mb-3" />
          <label className="mb-4 block text-sm">Add items to<select aria-label="Target Section" value={sections.some((section) => section.id === target) ? target : ''} onChange={(event) => setTarget(event.target.value)} className="mt-2 h-11 w-full rounded-md border bg-background px-2"><option value="">Choose a section</option>{sections.map((section) => <option key={section.id} value={section.id}>{section.title || 'Untitled Section'}</option>)}</select></label>
          {categories.map((category) => {
            const filtered = items.filter((item) => item.category_id === category.id && `${item.name} ${item.slug ?? ''}`.toLowerCase().includes(search.toLowerCase()));
            return filtered.length ? <section key={category.id} className="mb-5"><h3 className="mb-2 text-sm font-semibold text-brand-yellow">{String(category.name)}</h3><div className="space-y-2">{filtered.map((item) => <LibraryItem key={item.id} item={item} added={assigned.has(item.id!)} disabled={pending} onAdd={() => addItem(item.id!)} />)}</div></section> : null;
          })}
        </aside>
        <div className="min-w-0 space-y-4">
          <SortableContext items={sections.map((section) => `section:${section.id}`)} strategy={verticalListSortingStrategy}>
            {sections.map((section, index) => <SetSection key={section.id} section={section} receiving={dropTarget?.sectionId === section.id} disabled={pending} first={index === 0} last={index === sections.length - 1} onTitle={(title) => updateSection(section.id, (section) => ({ ...section, title }))} onRemove={() => { if (!section.items.length || window.confirm('Remove this section and its items from the set? The catalogue items will not be deleted.')) setSections(sections.filter((candidate) => candidate.id !== section.id)); }} onMove={(direction) => setSections(arrayMove(sections, index, index + direction))}>
              <SortableContext items={section.items.map((entry) => `item:${entry.itemId}`)} strategy={verticalListSortingStrategy}><ol className="space-y-3">{section.items.map((entry, itemIndex) => <Fragment key={entry.itemId}>
                {dropTarget?.sectionId === section.id && dropTarget.index === itemIndex && <InsertionMarker />}
                <SetItem entry={entry} item={byId.get(entry.itemId)} disabled={pending} first={itemIndex === 0} last={itemIndex === section.items.length - 1} onPrice={(price) => updateSection(section.id, (section) => ({ ...section, items: section.items.map((candidate) => candidate.itemId === entry.itemId ? { ...candidate, price } : candidate) }))} onRemove={() => updateSection(section.id, (section) => ({ ...section, items: section.items.filter((candidate) => candidate.itemId !== entry.itemId) }))} onMove={(direction) => updateSection(section.id, (section) => ({ ...section, items: arrayMove(section.items, itemIndex, itemIndex + direction) }))} />
              </Fragment>)}{dropTarget?.sectionId === section.id && dropTarget.index === section.items.length && <InsertionMarker />}</ol></SortableContext>
            </SetSection>)}
          </SortableContext>
          <Button variant="outline" disabled={pending || sections.length >= 50} onClick={() => { const id = crypto.randomUUID(); setSections([...sections, { id, title: 'New Section', items: [] }]); setTarget(id); }}><Plus />Add Section</Button>
        </div>
      </div>
      <DragOverlay adjustScale={false} zIndex={1000} dropAnimation={{ duration: 220, easing: 'ease-out', sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: '0.2' } } }) }}>
        {active && <div data-drag-preview aria-hidden="true" inert style={{ width: dragWidth }} className="pointer-events-none rounded-lg shadow-2xl ring-2 ring-turquoise/70">
          {activeLibraryItem ? <LibraryCard item={activeLibraryItem} /> : activeEntry ? <ol className="list-none"><ItemCard entry={activeEntry} item={byId.get(activeEntry.itemId)} /></ol> : activeSection ? <div className="rounded-xl border border-brand-yellow bg-card p-5"><p className="mb-4 border-b border-brand-yellow/20 pb-4 font-semibold text-brand-yellow">{activeSection.title}</p><ol className="space-y-3">{activeSection.items.map((entry) => <ItemCard key={entry.itemId} entry={entry} item={byId.get(entry.itemId)} />)}</ol></div> : null}
        </div>}
      </DragOverlay>
    </DndContext>
  </main>;
}
