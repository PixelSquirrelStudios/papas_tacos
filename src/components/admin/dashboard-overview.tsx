import Link from 'next/link';
import { ArrowRight, CalendarDays, CircleCheck, Clock3, GripVertical, ListOrdered, MapPin, MessageSquare, Settings2, ShoppingBag, SlidersHorizontal, Tags, UtensilsCrossed } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { adminDate } from '@/lib/admin/orders';
import { statusLabels } from '@/lib/account/orders';
import { money } from '@/lib/bag';
import type { AdminRow } from '@/lib/admin/resources';
import { OnlineOrderingControl } from './order-controls';

export function DashboardOverview({ fullName, orders, menu, events, settings, error = '' }: { fullName?: string | null; orders: AdminRow[]; menu: AdminRow[]; events: AdminRow[]; settings?: AdminRow; error?: string }) {
  const stats = [
    { label: 'Active Orders', value: orders.length, icon: ShoppingBag, colour: 'text-brand-yellow', href: '/admin/orders?status=active' },
    { label: 'Ready for Pickup', value: orders.filter((order) => order.status === 'ready_for_pickup').length, icon: CircleCheck, colour: 'text-turquoise', href: '/admin/orders?status=ready_for_pickup' },
    { label: 'Published Dishes', value: menu.filter((item) => item.is_published).length, icon: UtensilsCrossed, colour: 'text-primary', href: '/admin/menu' },
    { label: 'Upcoming Events', value: events.length, icon: CalendarDays, colour: 'text-foreground', href: '/admin/events' },
  ];
  const shortcuts = [
    { label: 'Manage Menu', href: '/admin/menu', icon: UtensilsCrossed },
    { label: 'Manage Categories', href: '/admin/categories', icon: Tags },
    { label: 'Manage Orders', href: '/admin/orders', icon: ShoppingBag },
    { label: 'Manage Events', href: '/admin/events', icon: CalendarDays },
    { label: 'Manage Pickup Slots', href: '/admin/slots', icon: Clock3 },
    { label: 'Manage Modifier Groups', href: '/admin/modifiers', icon: SlidersHorizontal },
    { label: 'Manage Modifier Options', href: '/admin/options', icon: ListOrdered },
    { label: 'Manage Testimonials', href: '/admin/testimonials', icon: MessageSquare },
    { label: 'Reorder Menu', href: '/admin/menu/reorder', icon: GripVertical },
    { label: 'Reorder Categories', href: '/admin/categories/reorder', icon: ListOrdered },
    { label: 'Reorder Events', href: '/admin/events/reorder', icon: CalendarDays },
    { label: 'Reorder Modifier Groups', href: '/admin/modifiers/reorder', icon: SlidersHorizontal },
    { label: 'Reorder Modifier Options', href: '/admin/options/reorder', icon: ListOrdered },
    { label: 'Reorder Testimonials', href: '/admin/testimonials/reorder', icon: MessageSquare },
  ];
  return <main className="min-w-0 px-4 py-8 sm:px-8 lg:px-10">
    <header className="flex flex-wrap items-center justify-between gap-5"><div><p className="mb-2 text-xs font-semibold uppercase text-turquoise">Service Overview</p><h1 className="text-3xl font-semibold">Welcome back{fullName ? `, ${fullName}` : ''}.</h1></div><Button variant="outline" asChild><Link href="/admin/settings"><Settings2 />Settings</Link></Button></header>
    {error ? <p role="alert" className="mt-8 border-l-2 border-destructive bg-destructive/5 p-5 text-destructive">{error}</p> : <>
      <OnlineOrderingControl status={String(settings?.ordering_status ?? 'closed')} updatedAt={settings?.updated_at} />
      <div aria-label="Dashboard Statistics" className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">{stats.map(({ label, value, icon: Icon, colour, href }) => <Link key={label} href={href} aria-label={`${label}: ${value}`} className="group min-w-0 rounded-lg border border-border bg-card p-4 transition-colors hover:border-brand-yellow/60 sm:p-5"><div className="mb-4 flex items-center justify-between gap-2"><Icon className={`size-5 ${colour}`} aria-hidden="true" /><ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-1" aria-hidden="true" /></div><p className="text-3xl font-semibold tabular-nums sm:text-4xl">{value}</p><h2 className="mt-2 text-sm font-medium text-muted-foreground">{label}</h2></Link>)}</div>
      <div className="mt-9 grid gap-9 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <section aria-labelledby="next-pickups-title" className="min-w-0"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 id="next-pickups-title" className="flex items-center gap-2 text-xl font-semibold"><ShoppingBag className="size-5 text-brand-yellow" aria-hidden="true" />Next Pickups</h2><Link href="/admin/orders" className="flex min-h-11 items-center gap-2 text-sm text-turquoise">All Orders<ArrowRight className="size-4" aria-hidden="true" /></Link></div><div className="space-y-3">{orders.slice(0, 8).map((order) => <Link key={order.id} href={`/admin/orders/${order.id}`} className="block rounded-lg border border-border bg-card p-4 transition-colors hover:border-brand-yellow/60"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="min-w-0 break-words font-semibold">#{String(order.order_number)} <span className="ml-2 font-normal">{String(order.customer_name)}</span></h3><Badge variant="outline" className={order.status === 'ready_for_pickup' ? 'border-turquoise/40 bg-turquoise/10 text-turquoise' : 'border-brand-yellow/30 text-brand-yellow'}>{statusLabels[order.status as keyof typeof statusLabels]}</Badge></div><div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-3"><p className="flex items-center gap-2 text-xs text-muted-foreground"><Clock3 className="size-3.5 shrink-0" aria-hidden="true" />{adminDate(order.pickup_starts_at)}</p><span className="font-semibold tabular-nums">{money(Number(order.total_pence))}</span></div></Link>)}{!orders.length && <div className="border-y border-border py-12 text-center"><ShoppingBag className="mx-auto mb-3 size-7 text-muted-foreground" aria-hidden="true" /><p className="text-sm text-muted-foreground">No active orders.</p></div>}</div></section>
        <section aria-labelledby="upcoming-events-title" className="min-w-0"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 id="upcoming-events-title" className="flex items-center gap-2 text-xl font-semibold"><CalendarDays className="size-5 text-turquoise" aria-hidden="true" />Upcoming Events</h2><Link href="/admin/events" className="flex min-h-11 items-center gap-2 text-sm text-turquoise">All Events<ArrowRight className="size-4" aria-hidden="true" /></Link></div><div className="space-y-3">{events.slice(0, 4).map((event) => <Link key={event.id} href="/admin/events" className="block rounded-lg border border-border bg-card p-4 transition-colors hover:border-turquoise/60"><p className="mb-3 text-xs font-semibold text-brand-yellow">{adminDate(event.starts_at)}</p><h3 className="break-words font-semibold">{String(event.title)}</h3><p className="mt-3 flex items-start gap-2 text-sm text-muted-foreground"><MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{String(event.venue_name)}</p></Link>)}{!events.length && <p className="border-y border-border py-12 text-center text-sm text-muted-foreground">No upcoming events.</p>}</div></section>
      </div>
    </>}
    <section aria-labelledby="dashboard-shortcuts-title" className="mt-9 border-t pt-7"><h2 id="dashboard-shortcuts-title" className="mb-5 text-xl font-semibold">Quick Shortcuts</h2><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{shortcuts.map(({ label, href, icon: Icon }) => <Link key={href} href={href} className="flex min-h-20 min-w-0 items-center gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:border-brand-yellow/60"><Icon className="size-5 shrink-0 text-brand-yellow" aria-hidden="true" /><span className="min-w-0 flex-1 text-sm font-semibold">{label}</span><ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" /></Link>)}</div></section>
  </main>;
}