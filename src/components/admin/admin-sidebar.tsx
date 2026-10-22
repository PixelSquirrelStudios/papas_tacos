'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useFormStatus } from 'react-dom';
import { ArrowUpRight, CalendarDays, Clock3, LayoutDashboard, ListOrdered, LoaderCircle, LogOut, MessageSquare, Package, Settings2, ShoppingBag, SlidersHorizontal, Tags, UserRound, UtensilsCrossed } from 'lucide-react';
import { Brand } from '@/components/brand';
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from '@/components/ui/sidebar';
import { signOut } from '@/app/auth/actions';

function SidebarSignOut() {
  const { pending } = useFormStatus();
  const label = pending ? 'Signing Out...' : 'Sign Out';
  return <SidebarMenuButton type="submit" tooltip={label} aria-label={label} disabled={pending}>
    {pending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <LogOut aria-hidden="true" />}
    <span className="group-data-[collapsible=icon]:sr-only">{label}</span>
  </SidebarMenuButton>;
}

export function AdminSidebar() {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  const sections = [
    { label: 'Operations', links: [
      { href: '/admin', label: 'Overview', icon: LayoutDashboard },
      { href: '/admin/orders', label: 'Orders', icon: ShoppingBag },
      { href: '/admin/stock', label: 'Stock', icon: Package },
      { href: '/admin/events', label: 'Events', icon: CalendarDays },
      { href: '/admin/slots', label: 'Pickup Slots', icon: Clock3 },
    ] },
    { label: 'Catalogue', links: [
      { href: '/admin/menu', label: 'Menu Items', icon: UtensilsCrossed },
      { href: '/admin/menu-sets', label: 'Menu Sets', icon: ListOrdered },
      { href: '/admin/categories', label: 'Categories', icon: Tags },
      { href: '/admin/modifiers', label: 'Modifier Groups', icon: SlidersHorizontal },
      { href: '/admin/options', label: 'Modifier Options', icon: ListOrdered },
    ] },
    { label: 'Content', links: [
      { href: '/admin/testimonials', label: 'Testimonials', icon: MessageSquare },
    ] },
    { label: 'Workspace', links: [
      { href: '/admin/settings', label: 'Site Settings', icon: Settings2 },
      { href: '/account', label: 'Your Account', icon: UserRound },
      { href: '/', label: 'View Website', icon: ArrowUpRight },
    ] },
  ];
  return <Sidebar collapsible="icon">
    <SidebarHeader className="h-20 shrink-0 justify-center border-b px-5 py-0 group-data-[collapsible=icon]:px-2">
      <Brand className="group-data-[collapsible=icon]:hidden [&_img]:w-48" />
      <SidebarMenu className="hidden group-data-[collapsible=icon]:flex"><SidebarMenuItem><SidebarMenuButton asChild tooltip="Papa's Tacos Home" className="group-data-[collapsible=icon]:p-0!"><Link href="/" aria-label="Papa's Tacos Home"><Image src="/favicon.ico" alt="" width={32} height={32} unoptimized className="size-8 shrink-0 object-contain" /></Link></SidebarMenuButton></SidebarMenuItem></SidebarMenu>
    </SidebarHeader>
    <SidebarContent className="group-data-[collapsible=icon]:overflow-y-auto">{sections.map((section) => <SidebarGroup key={section.label}><SidebarGroupLabel>{section.label}</SidebarGroupLabel><SidebarGroupContent><SidebarMenu>{section.links.map((link) => <SidebarMenuItem key={link.href}><SidebarMenuButton asChild tooltip={link.label} isActive={pathname === link.href || (link.href !== '/admin' && link.href !== '/' && pathname.startsWith(`${link.href}/`))}><Link href={link.href} aria-label={link.label} onClick={() => setOpenMobile(false)}><link.icon aria-hidden="true" /><span className="group-data-[collapsible=icon]:sr-only">{link.label}</span></Link></SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu></SidebarGroupContent></SidebarGroup>)}</SidebarContent>
    <SidebarFooter className="border-t border-sidebar-border p-4 group-data-[collapsible=icon]:p-2"><form action={signOut}><SidebarMenu><SidebarMenuItem><SidebarSignOut /></SidebarMenuItem></SidebarMenu></form></SidebarFooter>
  </Sidebar>;
}