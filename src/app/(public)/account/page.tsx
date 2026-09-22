import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { ArrowLeft, ArrowRight, ArrowUpRight, LayoutDashboard, ReceiptText, UserRound, UtensilsCrossed } from 'lucide-react';
import { requireAccount } from '@/lib/auth/session';
import { getCustomerOrder, getCustomerOrders } from '@/lib/account/data';
import { orderPage, ordersPerPage, type CustomerOrder, type OrderFilter } from '@/lib/account/orders';
import { signOut } from '@/app/auth/actions';
import { ProfileForm } from '@/components/auth/profile-form';
import { SignOutButton } from '@/components/auth/submit-button';
import { AccountRefresh } from '@/components/account/account-refresh';
import { OrderDetails, OrderList } from '@/components/account/order-views';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Your Account', robots: { index: false, follow: false } };

type AccountParams = { error?: string; view?: string; filter?: string; page?: string; order?: string };
const navigation = [
  { view: 'overview', label: 'Overview', icon: LayoutDashboard, href: '/account' },
  { view: 'orders', label: 'Orders', icon: ReceiptText, href: '/account?view=orders' },
  { view: 'details', label: 'Your Details', icon: UserRound, href: '/account?view=details' },
];

export default async function AccountPage({ searchParams }: { searchParams: Promise<AccountParams> }) {
  const viewer = await requireAccount();
  const params = await searchParams;
  const view = params.order ? 'orders' : params.view === 'orders' || params.view === 'details' ? params.view : 'overview';
  const filter: OrderFilter = params.filter === 'active' || params.filter === 'past' ? params.filter : 'all';
  const page = orderPage(params.page);
  let list: Awaited<ReturnType<typeof getCustomerOrders>> | null = null;
  let active: Awaited<ReturnType<typeof getCustomerOrders>> | null = null;
  let order: CustomerOrder | null = null;
  let unavailable = false;
  if (params.order && !z.guid().safeParse(params.order).success) notFound();
  try {
    if (params.order) order = await getCustomerOrder(params.order);
    else if (view === 'overview') [list, active] = await Promise.all([getCustomerOrders(), getCustomerOrders({ filter: 'active' })]);
    else if (view === 'orders') list = await getCustomerOrders({ page, filter });
  } catch { unavailable = true; }
  if (params.order && !unavailable && !order) notFound();
  const name = viewer.profile?.full_name.trim().split(/\s+/)[0];
  const pages = list ? Math.max(1, Math.ceil(list.total / ordersPerPage)) : 1;
  return <main id="main-content" className="mx-auto max-w-[1440px] px-5 py-8 sm:px-10 lg:px-16">
    <div className="grid min-h-[65svh] gap-8 md:grid-cols-[256px_minmax(0,1fr)] lg:grid-cols-[288px_minmax(0,1fr)] lg:gap-10">
      <aside aria-label="Account Navigation" className="min-w-0 border-b pb-5 md:border-b-0 md:border-r md:pr-6 lg:pr-8">
        <p className="mb-5 text-xs font-bold uppercase text-turquoise">Your Account</p>
        <nav aria-label="Customer dashboard" className="grid grid-cols-3 gap-1 md:grid-cols-1 md:gap-2">{navigation.map((item) => <Link key={item.view} href={item.href} aria-current={view === item.view ? 'page' : undefined} className={`flex min-h-11 min-w-0 flex-col items-center justify-center gap-1 rounded-md px-2 py-3 text-xs font-medium sm:text-sm md:flex-row md:justify-start md:gap-3 md:px-4 ${view === item.view ? 'bg-brand-yellow/10 text-brand-yellow' : 'text-muted-foreground hover:bg-accent hover:text-foreground'}`}><item.icon className="size-4 shrink-0" aria-hidden="true" /><span className="whitespace-nowrap">{item.label}</span></Link>)}</nav>
        <div className="mt-8 hidden space-y-5 border-t pt-6 md:block"><p className="text-sm leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">{viewer.user.email}</p><form action={signOut}><SignOutButton /></form>{viewer.profile?.role === 'admin' && <Link href="/admin" className="flex items-center gap-2 text-sm text-brand-yellow">Admin Dashboard<ArrowUpRight className="size-4" aria-hidden="true" /></Link>}</div>
      </aside>
      <div className="min-w-0">
        <header className="mb-8 flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-semibold sm:text-3xl">{view === 'overview' ? 'Dashboard' : view === 'orders' ? 'Your Orders' : 'Your Details'}</h1><p className="mt-2 text-sm text-muted-foreground">{view === 'overview' ? name ? `Welcome back, ${name}.` : 'Welcome back.' : view === 'orders' ? 'Pickup orders and order history' : 'Personal information and sign-in details'}</p></div>{view !== 'details' && <AccountRefresh auto={!order || !['collected', 'cancelled'].includes(order.status)} />}</header>
        {params.error === 'signout' && <p role="alert" className="mb-6 text-sm text-destructive">We could not sign you out. Please try again.</p>}
        {unavailable ? <div role="alert" className="border-l-2 border-primary bg-primary/5 p-5"><h2 className="font-semibold">Orders are unavailable right now</h2><p className="mt-2 text-sm text-muted-foreground">Refresh to try again. Your account details are still available.</p></div> : order ? <OrderDetails order={order} /> : view === 'overview' && list && active ? <>
          <dl className="mb-8 grid grid-cols-2 divide-x border-y py-5"><div className="pr-4"><dt className="text-sm text-muted-foreground">Active Orders</dt><dd className="mt-2 text-3xl font-semibold tabular-nums text-turquoise">{active.total}</dd></div><div className="pl-5"><dt className="text-sm text-muted-foreground">Orders Placed</dt><dd className="mt-2 text-3xl font-semibold tabular-nums">{list.total}</dd></div></dl>
          <section aria-labelledby="active-orders"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 id="active-orders" className="text-lg font-semibold">Active Orders</h2><Link href="/account?view=orders&filter=active" className="flex items-center gap-1 text-sm text-brand-yellow">View All<ArrowRight className="size-4" aria-hidden="true" /></Link></div><OrderList orders={active.orders} emptyTitle="No Active Orders" /></section>
          {list.total > 0 && <section aria-labelledby="recent-orders" className="mt-10"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 id="recent-orders" className="text-lg font-semibold">Recent Orders</h2><Link href="/account?view=orders" className="text-sm text-brand-yellow">Order History</Link></div><OrderList orders={list.orders.slice(0, 3)} /></section>}
          <div className="mt-8 flex flex-wrap gap-3"><Button asChild><Link href="/menu"><UtensilsCrossed aria-hidden="true" />The Menu</Link></Button><Button asChild variant="outline"><Link href="/account?view=details"><UserRound aria-hidden="true" />Edit Your Details</Link></Button></div>
        </> : view === 'orders' && list ? <>
          <nav aria-label="Filter orders" className="mb-6 flex flex-wrap gap-1 border-b">{(['all', 'active', 'past'] as const).map((value) => <Link key={value} href={`/account?view=orders&filter=${value}`} aria-current={filter === value ? 'page' : undefined} className={`border-b-2 px-4 py-3 text-sm font-medium ${filter === value ? 'border-brand-yellow text-brand-yellow' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>{value === 'all' ? 'All Orders' : value === 'active' ? 'Active' : 'Past Orders'}</Link>)}</nav>
          <OrderList orders={list.orders} emptyTitle={page > pages ? 'No Orders on This Page' : filter === 'active' ? 'No Active Orders' : filter === 'past' ? 'No Past Orders' : 'No Orders Yet'} />
          {(pages > 1 || page > 1) && <nav aria-label="Order pages" className="mt-6 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted-foreground">{page <= pages ? `Page ${page} of ${pages}` : 'Page Unavailable'}</p><div className="flex gap-2">{page > 1 && <Button asChild variant="outline" size="icon"><Link href={`/account?view=orders&filter=${filter}&page=${Math.min(page - 1, pages)}`} aria-label="Previous Page" title="Previous Page"><ArrowLeft /></Link></Button>}{page < pages && <Button asChild variant="outline" size="icon"><Link href={`/account?view=orders&filter=${filter}&page=${page + 1}`} aria-label="Next Page" title="Next Page"><ArrowRight /></Link></Button>}</div></nav>}
        </> : view === 'details' ? <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)]"><section aria-labelledby="profile-title"><h2 id="profile-title" className="mb-6 text-lg font-semibold">Personal Details</h2>{viewer.profile ? <ProfileForm fullName={viewer.profile.full_name} phone={viewer.profile.phone} /> : <p role="status" className="text-sm text-muted-foreground">Your profile is unavailable right now. Please try again shortly.</p>}</section><section className="border-t pt-6 xl:border-l xl:border-t-0 xl:pl-8 xl:pt-0"><h2 className="mb-3 text-lg font-semibold">Sign-In Details</h2><p className="text-xs text-muted-foreground">Email Address</p><p className="mt-2 break-all text-sm">{viewer.user.email}</p><p className="mt-4 text-sm text-muted-foreground">Email and Google sign-in. No password to manage.</p><form action={signOut} className="mt-6"><SignOutButton /></form></section></div> : null}
        <div className="mt-10 border-t pt-6 md:hidden"><p className="mb-4 break-all text-xs text-muted-foreground">{viewer.user.email}</p><form action={signOut}><SignOutButton /></form></div>
      </div>
    </div>
  </main>;
}