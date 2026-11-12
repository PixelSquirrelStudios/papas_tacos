'use client';

import { Fragment, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCenter, defaultDropAnimationSideEffects, pointerWithin, rectIntersection, useSensor, useSensors, type CollisionDetection, type DragEndEvent, type DragOverEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowDown, ArrowUp, GripVertical, Plus, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { saveHomepageFeaturedMenu } from '@/app/admin/homepage-menu/actions';
import { Button } from '@/components/ui/button';
import { notifySiteUpdated } from '@/lib/site-updates';

export type HomepageMenuItem = { id: string; name: string; section: string; eligible: boolean; available: boolean };
type SectionKey = 'papasChoiceIds' | 'crowdFavouriteIds';

const sortableCollisions: CollisionDetection = (args) => {
  const options = { ...args, droppableContainers: args.droppableContainers.filter((container) => container.id !== args.active.id) };
  if (!args.pointerCoordinates) return closestCenter(options);
  const hits = pointerWithin(options);
  return hits.length ? hits : rectIntersection(options);
};

function InsertionMarker() {
  return <li aria-hidden="true" data-drop-marker className="pointer-events-none relative h-0 list-none"><div className="absolute -top-2 inset-x-0 z-10 h-1 rounded-full bg-turquoise shadow-[0_0_12px_var(--color-turquoise)]"><span className="absolute -left-1 -top-1 size-3 rounded-full bg-turquoise" /></div></li>;
}

function SortableHomepageItem({ id, label, sectionTitle, detail, disabled, first, last, onMove, onRemove }: {
  id: string;
  label: string;
  sectionTitle: string;
  detail: string;
  disabled: boolean;
  first: boolean;
  last: boolean;
  onMove: (direction: number) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
  return <li
    ref={setNodeRef}
    style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.2 : undefined }}
    className="flex min-w-0 items-center gap-2 rounded-lg border border-l-4 border-l-turquoise/60 bg-background p-3 shadow-md shadow-black/10 transition-colors hover:border-turquoise/50"
  >
    <Button ref={setActivatorNodeRef} {...attributes} {...listeners} variant="ghost" size="icon" aria-label={`Reorder ${label}`} title={`Reorder ${label}`} disabled={disabled} className="shrink-0 touch-none cursor-grab rounded-md border border-border bg-background/70 text-muted-foreground hover:text-turquoise active:cursor-grabbing"><GripVertical /></Button>
    <span className="min-w-0 flex-1"><span className="block break-words text-sm font-medium">{label}</span><span className="mt-1 block text-xs text-muted-foreground">{detail}</span></span>
    <Button variant="ghost" size="icon" aria-label={`Move ${label} up in ${sectionTitle}`} disabled={disabled || first} onClick={() => onMove(-1)}><ArrowUp /></Button>
    <Button variant="ghost" size="icon" aria-label={`Move ${label} down in ${sectionTitle}`} disabled={disabled || last} onClick={() => onMove(1)}><ArrowDown /></Button>
    <Button variant="ghost" size="icon" aria-label={`Remove ${label}`} disabled={disabled} onClick={onRemove}><Trash2 /></Button>
  </li>;
}

function isValidIds(ids: string[], items: Map<string, HomepageMenuItem>) {
  return ids.every((id) => items.get(id)?.eligible === true);
}

export function HomepageFeaturedMenu({ items, papasChoiceIds: initialPapasIds, crowdFavouriteIds: initialCrowdIds, updatedAt }: {
  items: HomepageMenuItem[];
  papasChoiceIds: string[];
  crowdFavouriteIds: string[];
  updatedAt: string;
}) {
  const router = useRouter();
  const byId = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const [papasChoiceIds, setPapasChoiceIds] = useState(initialPapasIds);
  const [crowdFavouriteIds, setCrowdFavouriteIds] = useState(initialCrowdIds);
  const [version, setVersion] = useState(updatedAt);
  const [papasCandidate, setPapasCandidate] = useState('');
  const [crowdCandidate, setCrowdCandidate] = useState('');
  const [activeDrag, setActiveDrag] = useState<{ key: SectionKey; id: string } | null>(null);
  const [dragWidth, setDragWidth] = useState<number>();
  const [dropTarget, setDropTarget] = useState<{ key: SectionKey; index: number } | null>(null);
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const [baseline, setBaseline] = useState(() => JSON.stringify({ papasChoiceIds: initialPapasIds, crowdFavouriteIds: initialCrowdIds }));
  const current = JSON.stringify({ papasChoiceIds, crowdFavouriteIds });
  const dirty = baseline !== current;
  const selectedIds = new Set([...papasChoiceIds, ...crowdFavouriteIds]);
  const candidates = items.filter((item) => item.eligible && !selectedIds.has(item.id));
  const hasUnavailableSelection = !isValidIds(papasChoiceIds, byId) || !isValidIds(crowdFavouriteIds, byId);

  function setSection(key: SectionKey, ids: string[]) {
    if (key === 'papasChoiceIds') setPapasChoiceIds(ids);
    else setCrowdFavouriteIds(ids);
  }
  function addItem(key: SectionKey, id: string) {
    const ids = key === 'papasChoiceIds' ? papasChoiceIds : crowdFavouriteIds;
    const otherIds = key === 'papasChoiceIds' ? crowdFavouriteIds : papasChoiceIds;
    if (!byId.get(id)?.eligible || ids.length >= 3 || otherIds.includes(id)) return;
    setSection(key, [...ids, id]);
    if (key === 'papasChoiceIds') setPapasCandidate('');
    else setCrowdCandidate('');
    setError('');
  }
  function moveItem(key: SectionKey, index: number, direction: number) {
    const ids = key === 'papasChoiceIds' ? [...papasChoiceIds] : [...crowdFavouriteIds];
    const target = index + direction;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    setSection(key, ids);
  }
  function insertionIndex(event: DragOverEvent, ids: string[]) {
    if (!event.over) return null;
    const targetIndex = ids.indexOf(String(event.over.id));
    if (targetIndex < 0) return null;
    const dragged = event.active.rect.current.translated;
    const after = dragged && dragged.top + dragged.height / 2 > event.over.rect.top + event.over.rect.height / 2;
    return targetIndex + (after ? 1 : 0);
  }
  function finishDrag(key: SectionKey, ids: string[], event: DragEndEvent) {
    const targetIndex = insertionIndex(event, ids);
    setActiveDrag(null);
    setDropTarget(null);
    if (targetIndex === null || pending || event.active.id === event.over?.id) return;
    const sourceIndex = ids.indexOf(String(event.active.id));
    const destinationIndex = targetIndex - (sourceIndex < targetIndex ? 1 : 0);
    if (sourceIndex < 0 || sourceIndex === destinationIndex) return;
    setSection(key, arrayMove(ids, sourceIndex, destinationIndex));
    setError('');
  }
  function save() {
    setError('');
    startTransition(async () => {
      try {
        const result = await saveHomepageFeaturedMenu({ papasChoiceIds, crowdFavouriteIds, updatedAt: version });
        if (!result.ok) { setError(result.error || 'Unable to save the homepage menu.'); return; }
        if (!result.updatedAt) { setError('Homepage menu was saved, but its version could not be refreshed. Reload before editing again.'); return; }
        setBaseline(current);
        setVersion(result.updatedAt);
        toast.success('Homepage Menu Saved');
        notifySiteUpdated();
        router.refresh();
      } catch { setError('Unable to save the homepage menu. Your selections are still here. Please try again.'); }
    });
  }

  function renderSection(title: string, key: SectionKey, ids: string[], candidate: string, setCandidate: (value: string) => void) {
    const activeId = activeDrag?.key === key ? activeDrag.id : null;
    const activeItem = activeId ? byId.get(activeId) : undefined;
    return <section aria-labelledby={`${key}-title`} className="min-w-0 rounded-xl border bg-card p-4 sm:p-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b pb-4">
        <div><h2 id={`${key}-title`} className="text-xl font-semibold">{title}</h2><p className="mt-1 text-sm text-muted-foreground">Choose and order up to three items.</p></div>
        <span className="text-sm font-semibold tabular-nums text-turquoise">{ids.length} / 3</span>
      </div>
      <DndContext
        id={`homepage-menu-${key}`}
        sensors={sensors}
        collisionDetection={sortableCollisions}
        onDragStart={({ active }) => { setActiveDrag({ key, id: String(active.id) }); setDragWidth(active.rect.current.initial?.width); setDropTarget(null); }}
        onDragMove={(event) => { const index = insertionIndex(event, ids); setDropTarget(index === null ? null : { key, index }); }}
        onDragOver={(event) => { const index = insertionIndex(event, ids); setDropTarget(index === null ? null : { key, index }); }}
        onDragEnd={(event) => finishDrag(key, ids, event)}
        onDragCancel={() => { setActiveDrag(null); setDropTarget(null); }}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <ol aria-label={`${title} selections`} className="mb-5 space-y-2">
            {ids.map((id, index) => {
              const item = byId.get(id);
              const label = item?.name ?? 'Unavailable menu item';
              const detail = item ? item.eligible ? `${item.section}${item.available ? '' : ' · Sold Out'}` : 'No longer published for the public catalogue' : 'Remove this item before saving';
              return <Fragment key={id}>
                {dropTarget?.key === key && dropTarget.index === index && <InsertionMarker />}
                <SortableHomepageItem
                  id={id}
                  label={label}
                  sectionTitle={title}
                  detail={detail}
                  disabled={pending}
                  first={index === 0}
                  last={index === ids.length - 1}
                  onMove={(direction) => moveItem(key, index, direction)}
                  onRemove={() => setSection(key, ids.filter((entry) => entry !== id))}
                />
              </Fragment>;
            })}
            {dropTarget?.key === key && dropTarget.index === ids.length && <InsertionMarker />}
            {!ids.length && <li className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">No items selected yet.</li>}
          </ol>
        </SortableContext>
        <DragOverlay adjustScale={false} zIndex={1000} dropAnimation={{ duration: 220, easing: 'ease-out', sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: '0.2' } } }) }}>
          {activeItem && <div data-drag-preview aria-hidden="true" inert style={{ width: dragWidth }} className="pointer-events-none rounded-lg shadow-2xl ring-2 ring-turquoise/70"><div className="flex items-center gap-3 rounded-lg border border-border border-l-4 border-l-turquoise/60 bg-card p-3 shadow-md"><GripVertical className="size-5 shrink-0 text-turquoise" /><span className="min-w-0 flex-1"><span className="block break-words text-sm font-semibold">{activeItem.name}</span><span className="mt-1 block text-xs text-muted-foreground">{activeItem.section}{activeItem.available ? '' : ' · Sold Out'}</span></span></div></div>}
        </DragOverlay>
      </DndContext>
      {ids.length >= 3
        ? <p role="status" className="rounded-md border border-dashed px-3 py-3 text-sm text-muted-foreground">Maximum of 3 items already added.</p>
        : candidates.length === 0
          ? <p role="status" className="rounded-md border border-dashed px-3 py-3 text-sm text-muted-foreground">No other published menu items are available to add.</p>
          : <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <label className="min-w-0 flex-1 text-sm font-medium">Add an item
              <select aria-label={`Add item to ${title}`} value={candidate} disabled={pending} onChange={(event) => setCandidate(event.target.value)} className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="">Choose a published menu item</option>
                {candidates.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.section}{item.available ? '' : ' · Sold Out'}</option>)}
              </select>
            </label>
            <Button className="h-10 shrink-0" disabled={pending || !candidate} onClick={() => addItem(key, candidate)}><Plus />Add Item</Button>
          </div>}
    </section>;
  }

  return <main className="mx-auto max-w-6xl p-4 sm:p-8">
    <div className="mb-6"><p className="mb-2 text-xs font-semibold uppercase text-turquoise">Content &amp; Curation</p><h1 className="text-3xl font-semibold">Homepage Featured Menu</h1><p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">Choose up to three published menu items for each homepage section. Move items to set their display order. Menu-item Papa&apos;s Choice and Crowd Favourites flags remain independent and do not control these selections.</p></div>
    <div className="sticky top-20 z-20 mb-6 flex items-center justify-between gap-3 border-y bg-background/95 py-3"><p role="status" className="text-sm text-muted-foreground">{pending ? 'Saving...' : dirty ? 'Unsaved Changes' : 'Saved'}</p><Button onClick={save} disabled={pending || !dirty || hasUnavailableSelection}><Save />Save Homepage Menu</Button></div>
    {hasUnavailableSelection && <p role="alert" className="mb-5 rounded-md border border-destructive/40 p-4 text-sm text-destructive">Remove items that are no longer public before saving.</p>}
    {error && <p role="alert" className="mb-5 rounded-md border border-destructive/40 p-4 text-sm text-destructive">{error}</p>}
    <div className="grid gap-5 lg:grid-cols-2">
      {renderSection("Papa's Choice", 'papasChoiceIds', papasChoiceIds, papasCandidate, setPapasCandidate)}
      {renderSection('Crowd Favourites', 'crowdFavouriteIds', crowdFavouriteIds, crowdCandidate, setCrowdCandidate)}
    </div>
  </main>;
}
