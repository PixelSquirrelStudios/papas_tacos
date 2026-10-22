'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ArrowDownToLine, Boxes, LoaderCircle, Package, RotateCcw, Search, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import { changeStock, returnEventStock } from '@/app/admin/stock/actions';
import { heldQuantity, trackingLabels, type InventoryItem, type StockAllocation, type OrderStock, type StockMovement, type InventorySale } from '@/lib/inventory';
import { notifySiteUpdated } from '@/lib/site-updates';
import { adminDate } from '@/lib/admin/orders';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

type MenuStockItem = { id: string; name: string; slug?: string; is_available: boolean; archived_at: string | null; item_kind?: 'product' | 'group' };
type StockEvent = { id: string; title: string; starts_at: string; ends_at: string; ordering_status: string };
type Props = {
  items: MenuStockItem[]; events: StockEvent[]; inventory: InventoryItem[];
  allocations: StockAllocation[]; orders: OrderStock[]; movements: StockMovement[];
  sales: InventorySale[];
  uses?: { menu_item_id: string; parent_id: string; parent_name: string }[];
  initialEvent: string; initialItem: string; now: number;
};
type StockAction = 'configure' | 'receive' | 'correct' | 'allocate' | 'return' | 'waste' | 'sale';
const actionLabels: Record<StockAction, string> = {
  configure: 'Stock Settings', receive: 'Receive Stock', correct: 'Correct Global Count',
  allocate: 'Set Event Allocation', return: 'Return Unused Stock', waste: 'Record Waste / Damage', sale: 'Record Walk-up Sale',
};
const actionReasons: Record<StockAction, string> = {
  configure: 'Stock tracking settings updated',
  receive: 'New stock received',
  correct: 'Physical stock count correction',
  allocate: 'Event stock allocation updated',
  return: 'Unused event stock returned',
  waste: 'Stock removed due to waste or damage',
  sale: 'Walk-up sale recorded',
};
const actionHelp: Record<StockAction, string> = {
  configure: 'Choose how this item is counted. New tracking starts at zero. Receive global stock or allocate event portions after saving.',
  receive: 'Add newly purchased stock to the global count. This does not allocate it to an event.',
  correct: 'Enter the actual total still owned, including stock at events. You cannot reduce this below existing allocations.',
  allocate: 'Enter the target unsold quantity for this event, not an amount to add. Checkout holds are included and cannot be removed.',
  return: 'Release this quantity from the event. Global stock does not increase: it is already counted. For portions, this removes unused capacity.',
  waste: 'Remove stock that can no longer be sold. Select an event for event stock, or use unallocated global stock.',
  sale: 'Record a sale taken outside this website. This reduces event stock and, for globally tracked items, global stock too. It does not create an order or payment record.',
};

export function StockManager({ items, events, inventory, allocations, orders, movements, sales, uses = [], initialEvent, initialItem, now }: Props) {
  const router = useRouter();
  const [eventId, setEventId] = useState(events.some((event) => event.id === initialEvent) ? initialEvent : '');
  const [search, setSearch] = useState(items.find((item) => item.id === initialItem)?.name ?? '');
  const [filter, setFilter] = useState('all');
  const [editing, setEditing] = useState<MenuStockItem | null>(null);
  const [reconciling, setReconciling] = useState<StockAllocation[] | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();
  const selectedEvent = events.find((event) => event.id === eventId);
  const selectedAllocations = allocations.filter((row) => row.event_id === eventId && row.remaining > 0);
  const eventHolds = selectedAllocations.reduce((sum, row) => sum + heldQuantity(orders, row.menu_item_id, eventId, now), 0);
  const canReconcile = Boolean(selectedEvent && (selectedEvent.ordering_status === 'closed' || Date.parse(selectedEvent.ends_at) <= now) && !eventHolds && selectedAllocations.length);
  const visible = items.filter((item) => {
    if (item.item_kind === 'group') return false;
    const stock = inventory.find((row) => row.menu_item_id === item.id);
    if (item.archived_at && !allocations.some((row) => row.menu_item_id === item.id && row.remaining > 0)) return false;
    if (![item.name, item.slug ?? ''].some((value) => value.toLowerCase().includes(search.toLowerCase()))) return false;
    if (filter === 'tracked' && stock?.tracking_mode === 'none') return false;
    if (filter === 'attention') {
      if (!stock || stock.tracking_mode === 'none') return false;
      const remaining = eventId ? allocations.find((row) => row.menu_item_id === item.id && row.event_id === eventId)?.remaining ?? 0 : stock.tracking_mode === 'global' ? stock.on_hand : null;
      if (remaining === null || remaining - heldQuantity(orders, item.id, eventId || undefined, now) > 5) return false;
    }
    return true;
  });
  function refresh() { router.refresh(); notifySiteUpdated(); }
  return <main className="min-w-0 px-4 py-8 sm:px-8">
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div><p className="mb-2 text-xs font-semibold uppercase text-turquoise">Inventory & Portions</p><h1 className="text-3xl font-semibold">Stock</h1><p className="mt-2 max-w-3xl text-sm text-muted-foreground">Allocate stock without treating it as sold. Sales deplete it; returning unused stock makes it available to assign again.</p></div>
    </div>
    <div className="mb-6 grid gap-3 sm:grid-cols-3">
      {[
        { label: 'Globally Tracked Items', value: inventory.filter((row) => row.tracking_mode === 'global').length, Icon: Package },
        { label: 'Event-Portion Items', value: inventory.filter((row) => row.tracking_mode === 'event').length, Icon: Boxes },
        { label: 'Items with Checkout Holds', value: new Set(orders.filter((row) => row.state === 'held' && row.expires_at && Date.parse(row.expires_at) > now).map((row) => row.menu_item_id)).size, Icon: AlertTriangle },
      ].map(({ label, value, Icon }) => <div key={label} className="rounded-lg border bg-card p-4"><div className="flex items-center justify-between gap-3"><p className="text-sm text-muted-foreground">{label}</p><Icon className="size-5 text-turquoise" /></div><p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p></div>)}
    </div>
    <div className="mb-5 grid gap-3 border-y py-4 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
      <div className="relative min-w-0"><Search className="absolute left-3 top-3 size-4 text-muted-foreground" /><Input aria-label="Search Stock" placeholder="Search Stock..." value={search} onChange={(event) => setSearch(event.target.value)} className="h-11 pl-10" /></div>
      <Select value={eventId || '__all'} onValueChange={(value) => setEventId(value === '__all' ? '' : value)}><SelectTrigger aria-label="Stock Event" className="w-full min-w-0 data-[size=default]:h-11 [&>[data-slot=select-value]]:min-w-0 [&>[data-slot=select-value]]:overflow-hidden"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__all">All Events / Global Overview</SelectItem>{events.map((event) => <SelectItem key={event.id} value={event.id}>{event.title} · {adminDate(event.starts_at)}</SelectItem>)}</SelectContent></Select>
      <Select value={filter} onValueChange={setFilter}><SelectTrigger aria-label="Stock Filter" className="w-full min-w-0 data-[size=default]:h-11 [&>[data-slot=select-value]]:min-w-0 [&>[data-slot=select-value]]:overflow-hidden"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All Menu Items</SelectItem><SelectItem value="tracked">Tracked Items</SelectItem><SelectItem value="attention">Low / No Stock (5 or Fewer)</SelectItem></SelectContent></Select>
      <Button className="h-11" disabled={!search && !eventId && filter === 'all'} onClick={() => { setSearch(''); setEventId(''); setFilter('all'); }}><RotateCcw />Reset Filters</Button>
    </div>
    {selectedEvent && <section aria-label="Event Stock Reconciliation" className="mb-6 rounded-lg border border-turquoise/25 bg-turquoise/5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="font-semibold">{selectedEvent.title}</h2><p className="mt-1 text-sm text-muted-foreground">{adminDate(selectedEvent.starts_at)} · {selectedAllocations.length} items with unused allocations{eventHolds > 0 ? ` · ${eventHolds} units held in checkout` : ''}</p></div>
        <Button variant="outline" disabled={!canReconcile} onClick={() => { setReconciling(selectedAllocations.map((row) => ({ ...row }))); setReason('Event closing stock reconciliation'); setError(''); }}><ArrowDownToLine />Return All Unused Stock</Button></div>
      <p className="mt-3 text-xs text-muted-foreground">Close event ordering and wait for active checkouts before reconciling. Record waste first. This returns global products to circulation and closes unused portion capacity; it never assumes leftovers sold.</p>
    </section>}
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[850px] text-left text-sm">
        <caption className="sr-only">Stock balances, event allocations and quantities available to sell</caption>
        <thead className="bg-muted/50"><tr>{['Menu Item', 'Global On Hand', 'Allocated Remaining', 'Checkout Holds', eventId ? 'Event Available' : 'Unallocated', 'Sold (Net)', 'Actions'].map((label) => <th key={label} scope="col" className="px-4 py-3 font-medium">{label}</th>)}</tr></thead>
        <tbody>{visible.map((item) => {
          const stock = inventory.find((row) => row.menu_item_id === item.id);
          const itemAllocations = allocations.filter((row) => row.menu_item_id === item.id && row.remaining > 0);
          const allocated = itemAllocations.reduce((sum, row) => sum + row.remaining, 0);
          const held = heldQuantity(orders, item.id, eventId || undefined, now);
          const remaining = eventId ? (itemAllocations.find((row) => row.event_id === eventId)?.remaining ?? 0) - held : stock?.tracking_mode === 'global' ? stock.on_hand - allocated : null;
          const tracked = stock && stock.tracking_mode !== 'none';
          const itemSales = sales.filter((row) => row.menu_item_id === item.id && (!eventId || row.event_id === eventId));
          return <tr key={item.id} className="border-t align-top">
            <th scope="row" className="max-w-64 px-4 py-4 font-normal"><span className="block font-semibold">{item.name}</span>{item.slug && <span className="mt-1 block break-all font-mono text-xs text-muted-foreground">{item.slug}</span>}<span className="mt-1 block text-xs text-muted-foreground">{stock ? trackingLabels[stock.tracking_mode] : 'Stock Record Missing'}{tracked ? ` · ${stock.unit_label}` : ''}</span>{!item.is_available && <Badge variant="outline" className="mt-2">Manually Unavailable</Badge>}{item.archived_at && <Badge variant="outline" className="ml-1 mt-2">Archived</Badge>}{uses.some((use) => use.menu_item_id === item.id) && <details className="mt-2 text-xs"><summary className="cursor-pointer text-brand-yellow">Used in Linked Choices</summary><ul className="mt-2 space-y-1">{[...new Map(uses.filter((use) => use.menu_item_id === item.id).map((use) => [use.parent_id, use])).values()].map((use) => <li key={use.parent_id}>{use.parent_name}</li>)}</ul></details>}</th>
            <td className="px-4 py-4 tabular-nums">{stock?.tracking_mode === 'global' ? stock.on_hand : '—'}</td>
            <td className="max-w-72 px-4 py-4">{tracked ? <><span className="tabular-nums">{allocated}</span>{itemAllocations.length > 0 && <details className="mt-2"><summary className="cursor-pointer text-xs text-brand-yellow">By Event ({itemAllocations.length})</summary><ul className="mt-2 space-y-2">{itemAllocations.map((row) => <li key={row.event_id} className="text-xs"><Link className="underline underline-offset-2" href={`/admin/stock?event=${row.event_id}`}>{events.find((event) => event.id === row.event_id)?.title ?? 'Event'}</Link>: <strong>{row.remaining}</strong>{row.event_id === eventId ? ' (selected)' : ''}</li>)}</ul></details>}</> : '—'}</td>
            <td className="px-4 py-4 tabular-nums">{tracked ? held : '—'}</td>
            <td className="px-4 py-4">{tracked && remaining !== null ? <><strong className={`tabular-nums ${remaining <= 0 ? 'text-destructive' : remaining <= 5 ? 'text-brand-yellow' : 'text-turquoise'}`}>{remaining}</strong><span className="mt-1 block text-xs text-muted-foreground">{remaining === 0 ? eventId ? 'Sold Out / Not Allocated' : 'Fully Allocated or Depleted' : remaining <= 5 ? 'Low Stock' : 'Available'}</span></> : stock?.tracking_mode === 'event' ? 'Not Applicable' : 'Not Limited'}</td>
            <td className="max-w-64 px-4 py-4"><span className="tabular-nums">{itemSales.reduce((sum, row) => sum + row.sold_quantity, 0)}</span>{!eventId && itemSales.length > 0 && <details className="mt-2"><summary className="cursor-pointer text-xs text-brand-yellow">Sales by Event</summary><ul className="mt-2 space-y-2">{itemSales.map((row) => <li key={row.event_id} className="text-xs"><Link className="underline underline-offset-2" href={`/admin/stock?event=${row.event_id}`}>{events.find((event) => event.id === row.event_id)?.title ?? 'Event'}</Link>: <strong>{row.sold_quantity}</strong></li>)}</ul></details>}</td>
            <td className="px-4 py-4"><Button variant="outline" size="sm" disabled={!stock} aria-label={`Manage stock for ${item.name}`} onClick={() => setEditing(item)}><Settings2 />Manage</Button></td>
          </tr>;
        })}</tbody>
      </table>
      {!visible.length && <p role="status" className="p-8 text-sm text-muted-foreground">No stock items match these filters.</p>}
    </div>
    <p className="mt-3 text-xs text-muted-foreground">Global on hand includes unsold event allocations. Allocated remaining includes temporary checkout holds. Event available excludes holds. Net sold includes online and recorded walk-up sales, less explicit stock returns from orders; refunds alone do not reduce it. Untracked sales and sales before tracking began are not included. Counts are per item, not shared ingredients. Balances refresh every 15 seconds; checkout rechecks them atomically.</p>
    <section className="mt-10"><h2 className="text-xl font-semibold">Recent Stock Activity</h2><p className="mb-4 mt-1 text-xs text-muted-foreground">Latest 100 changes. Quantities describe the action, not necessarily an addition to global stock.</p>
      <div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[700px] text-left text-sm"><thead className="bg-muted/50"><tr>{['When', 'Item / Event', 'Action', 'Quantity', 'Reason / Order'].map((label) => <th key={label} scope="col" className="px-4 py-3 font-medium">{label}</th>)}</tr></thead><tbody>{movements.filter((row) => !eventId || row.event_id === eventId).map((row) => <tr key={row.id} className="border-t align-top"><td className="whitespace-nowrap px-4 py-3 text-xs">{adminDate(row.created_at)}</td><td className="px-4 py-3">{items.find((item) => item.id === row.menu_item_id)?.name ?? 'Menu Item'}<span className="mt-1 block text-xs text-muted-foreground">{events.find((event) => event.id === row.event_id)?.title ?? 'Global Stock'}</span></td><td className="px-4 py-3 capitalize">{row.action.replaceAll('_', ' ')}</td><td className="px-4 py-3 tabular-nums">{row.quantity}</td><td className="max-w-80 px-4 py-3"><span className="whitespace-pre-wrap">{row.reason}</span>{row.order_id && <Link href={`/admin/orders/${row.order_id}`} className="mt-1 block text-brand-yellow underline">View Order</Link>}</td></tr>)}</tbody></table>{!movements.some((row) => !eventId || row.event_id === eventId) && <p className="p-5 text-sm text-muted-foreground">No stock activity to show.</p>}</div>
    </section>
    {editing && <StockEditor key={editing.id} item={editing} stock={inventory.find((row) => row.menu_item_id === editing.id)!} events={events} allocations={allocations.filter((row) => row.menu_item_id === editing.id)} orders={orders} now={now} initialEvent={eventId} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); }} />}
    {reconciling && selectedEvent && <Dialog open onOpenChange={(open) => { if (!open && !pending) setReconciling(null); }}><DialogContent showCloseButton={!pending}><DialogHeader><DialogTitle>Return Unused Stock</DialogTitle><DialogDescription>{selectedEvent.title}. Review leftovers before confirming. No sales or payments will be created.</DialogDescription></DialogHeader>
      <ul className="max-h-56 space-y-2 overflow-y-auto text-sm">{reconciling.map((row) => <li key={row.menu_item_id} className="flex justify-between gap-4"><span>{items.find((item) => item.id === row.menu_item_id)?.name}</span><strong>{row.remaining}</strong></li>)}</ul>
      <Label htmlFor="reconciliation-reason">Reconciliation Note</Label><Textarea id="reconciliation-reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} disabled={pending} />
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap justify-end gap-3"><Button variant="outline" disabled={pending} onClick={() => { setReconciling(null); refresh(); }}>Cancel / Refresh</Button><Button disabled={pending || !reason.trim()} onClick={() => startTransition(async () => {
        setError('');
        try {
          const result = await returnEventStock({ eventId, allocations: reconciling, reason });
          if (!result.ok) { setError(result.error ?? 'Reconciliation failed. Refresh before trying again.'); return; }
          toast.success('Unused event stock returned');
          setReconciling(null); refresh();
        } catch { setError('The result could not be confirmed. Refresh balances before repeating this action.'); }
      })}>{pending && <LoaderCircle className="animate-spin" />}Confirm Return</Button></div>
    </DialogContent></Dialog>}
  </main>;
}

function StockEditor({ item, stock, events, allocations, orders, initialEvent, now, onClose, onSaved }: {
  item: MenuStockItem; stock: InventoryItem; events: StockEvent[]; allocations: StockAllocation[];
  orders: OrderStock[]; initialEvent: string; now: number; onClose: () => void; onSaved: () => void;
}) {
  const [action, setAction] = useState<StockAction>(stock.tracking_mode === 'none' ? 'configure' : initialEvent ? 'allocate' : stock.tracking_mode === 'global' ? 'receive' : 'allocate');
  const [eventId, setEventId] = useState(initialEvent);
  const [quantity, setQuantity] = useState(() => action === 'allocate' && initialEvent
    ? String(allocations.find((row) => row.event_id === initialEvent)?.remaining ?? 0) : '');
  const [mode, setMode] = useState(stock.tracking_mode);
  const [unit, setUnit] = useState(stock.unit_label);
  const [reason, setReason] = useState(actionReasons[action]);
  const [error, setError] = useState('');
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [pending, startTransition] = useTransition();
  const eventAction = ['allocate', 'return', 'sale'].includes(action) || (action === 'waste' && stock.tracking_mode === 'event');
  const allocation = allocations.find((row) => row.event_id === eventId);
  const usesEvent = eventAction || (action === 'waste' && Boolean(eventId));
  const selectedEventId = usesEvent ? eventId : null;
  const held = heldQuantity(orders, item.id, eventId || undefined, now);
  const availableActions: StockAction[] = stock.tracking_mode === 'none' ? ['configure'] : stock.tracking_mode === 'global'
    ? ['receive', 'allocate', 'return', 'sale', 'waste', 'correct', 'configure'] : ['allocate', 'return', 'sale', 'waste', 'configure'];
  const amount = action === 'configure' ? 0 : Number(quantity);
  const valid = (action === 'configure' || (quantity.trim() !== '' && Number.isInteger(amount) && amount >= (['allocate', 'correct'].includes(action) ? 0 : 1) && amount <= 1000000))
    && (!eventAction || Boolean(eventId)) && reason.trim().length > 0 && (action !== 'configure' || Boolean(unit.trim()));
  const preview = action === 'receive' ? `Global on hand: ${stock.on_hand} → ${stock.on_hand + amount}`
    : action === 'correct' ? `Global on hand: ${stock.on_hand} → ${amount}`
    : action === 'allocate' ? `Event remaining: ${allocation?.remaining ?? 0} → ${amount}`
    : action !== 'configure' && usesEvent ? `Event remaining: ${allocation?.remaining ?? 0} → ${(allocation?.remaining ?? 0) - amount}`
    : action === 'waste' ? `Global on hand: ${stock.on_hand} → ${stock.on_hand - amount}` : '';
  return <Dialog open onOpenChange={(open) => { if (!open && !pending) onClose(); }}><DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg" showCloseButton={!pending} onPointerDownOutside={(event) => event.preventDefault()}>
    <DialogHeader><DialogTitle>{item.name}</DialogTitle><DialogDescription>{item.slug && <span className="mb-2 block break-all font-mono text-xs">{item.slug}</span>}Stock changes are audited. {trackingLabels[stock.tracking_mode]}.</DialogDescription></DialogHeader>
    <form onSubmit={(event) => {
      event.preventDefault();
      if (!valid || pending) return;
      setError('');
      startTransition(async () => {
        try {
          const result = await changeStock({
            itemId: item.id, eventId: selectedEventId, action, quantity: amount,
            expectedVersion: usesEvent ? allocation?.version ?? null : stock.version,
            reason, trackingMode: action === 'configure' ? mode : null,
            unitLabel: action === 'configure' ? unit : null, requestId,
          });
          if (!result.ok) { setError(result.error ?? 'Stock change failed. Refresh balances before retrying.'); return; }
          toast.success(actionLabels[action] === 'Stock Settings' ? 'Stock settings saved' : `${actionLabels[action]} saved`);
          onSaved();
        } catch { setError('The result could not be confirmed. Close and refresh balances before repeating this action.'); }
      });
    }} onChange={() => { if (error) { setError(''); setRequestId(crypto.randomUUID()); } }} className="space-y-5">
      <fieldset disabled={pending} className="space-y-5">
        <div className="space-y-2"><Label htmlFor="stock-action">Action</Label><Select value={action} onValueChange={(value: StockAction) => { setReason((current) => current === actionReasons[action] ? actionReasons[value] : current); setAction(value); setQuantity(value === 'allocate' && eventId ? String(allocation?.remaining ?? 0) : ''); setError(''); setRequestId(crypto.randomUUID()); }}><SelectTrigger id="stock-action" className="w-full"><SelectValue /></SelectTrigger><SelectContent>{availableActions.map((value) => <SelectItem key={value} value={value}>{actionLabels[value]}</SelectItem>)}</SelectContent></Select><p className="text-xs leading-relaxed text-muted-foreground">{actionHelp[action]}</p></div>
        {action === 'configure' ? <>
          <div className="space-y-2"><Label htmlFor="stock-mode">Stock Tracking</Label><Select value={mode} onValueChange={(value: InventoryItem['tracking_mode']) => setMode(value)}><SelectTrigger id="stock-mode" className="w-full"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(trackingLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-2"><Label htmlFor="stock-unit">Unit Label</Label><Input id="stock-unit" value={unit} onChange={(event) => setUnit(event.target.value)} placeholder="e.g. packets, cans, portions" maxLength={30} required /></div>
          {mode !== stock.tracking_mode && <p className="rounded-md border border-brand-yellow/30 bg-brand-yellow/5 p-3 text-sm">{stock.tracking_mode === 'none'
            ? `After saving, ${mode === 'global' ? 'receive your opening global stock, then allocate quantities to events' : 'set the portions available at each event'}. Tracked items remain sold out until stock is assigned. Any outstanding orders for this product must be completed or cancelled before enabling tracking.`
            : 'Before changing tracking, reconcile existing stock and allocations and resolve outstanding orders. Saving will check for conflicts; this notice does not mean a conflict has been found.'}</p>}
        </> : <>
          {(eventAction || action === 'waste') && <div className="space-y-2"><Label htmlFor="stock-event">Event{eventAction ? ' (Required)' : ' / Source'}</Label><Select value={eventId || '__none'} onValueChange={(value) => { const nextEvent = value === '__none' ? '' : value; setEventId(nextEvent); setQuantity(action === 'allocate' && nextEvent ? String(allocations.find((row) => row.event_id === nextEvent)?.remaining ?? 0) : ''); setRequestId(crypto.randomUUID()); }}><SelectTrigger id="stock-event" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__none">{eventAction ? 'Choose an Event' : 'Unallocated Global Stock'}</SelectItem>{events.map((event) => <SelectItem key={event.id} value={event.id}>{event.title} · {adminDate(event.starts_at)}</SelectItem>)}</SelectContent></Select>{eventId && <p className="text-xs text-muted-foreground">Remaining: {allocation?.remaining ?? 0} · Active Checkout Holds: {held}</p>}</div>}
          <div className="space-y-2"><Label htmlFor="stock-quantity">{action === 'allocate' ? 'Target Unsold Event Quantity' : action === 'correct' ? 'Actual Global Count' : 'Quantity'} ({stock.unit_label})</Label><Input id="stock-quantity" type="number" inputMode="numeric" min={['allocate', 'correct'].includes(action) ? 0 : 1} max={1000000} step={1} value={quantity} onChange={(event) => setQuantity(event.target.value)} required /></div>
          {quantity !== '' && Number.isInteger(amount) && <p role="status" className="rounded-md border bg-muted/40 p-3 text-sm tabular-nums">{preview}</p>}
        </>}
        <div className="space-y-2"><Label htmlFor="stock-reason">Reason / Reference (Required)</Label><Textarea id="stock-reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} required placeholder={action === 'receive' ? 'e.g. Supplier delivery / invoice reference' : 'Why is this stock changing?'} /><p className="text-xs text-muted-foreground">A reason is filled in for you. Edit it to add details or a reference if needed.</p></div>
      </fieldset>
      {error && <div role="alert" className="rounded-md border border-destructive/30 p-3 text-sm text-destructive"><p>{error}</p><p className="mt-2">If balances changed, close this window and refresh before submitting a new change.</p></div>}
      <div className="flex justify-end gap-3"><Button type="button" variant="outline" disabled={pending} onClick={onClose}>Cancel</Button><Button type="submit" disabled={!valid || pending}>{pending && <LoaderCircle className="animate-spin" />}Save Stock Change</Button></div>
    </form>
  </DialogContent></Dialog>;
}
