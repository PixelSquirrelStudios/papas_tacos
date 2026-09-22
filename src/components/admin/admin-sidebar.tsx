'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowUpRight, CalendarDays, Clock3, LayoutDashboard, ListOrdered, MessageSquare, Settings2, ShoppingBag, SlidersHorizontal, Tags, UserRound, UtensilsCrossed } from 'lucide-react';
import { Brand } from '@/components/brand';
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import { signOut } from '@/app/auth/actions';
import { SignOutButton } from '@/components/auth/submit-button';

export function AdminSidebar() {
  const pathname = usePathname();
  const sections = [
    { label: 'Operations', links: [
      { href: '/admin', label: 'Overview', icon: LayoutDashboard },
      { href: '/admin/orders', label: 'Orders', icon: ShoppingBag },
      { href: '/admin/events', label: 'Events', icon: CalendarDays },
      { href: '/admin/slots', label: 'Pickup Slots', icon: Clock3 },
    ] },
    { label: 'Catalogue', links: [
      { href: '/admin/menu', label: 'Menu Items', icon: UtensilsCrossed },
      { href: '/admin/categories', label: 'Categories', icon: Tags },
      { href: '/admin/modifiers', label: 'Modifier Groups', icon: SlidersHorizontal },
      { href: '/admin/options', label: 'Modifier Options', icon: ListOrdered },
      { href: '/admin/testimonials', label: 'Testimonials', icon: MessageSquare },
    ] },
    { label: 'Workspace', links: [
      { href: '/admin/settings', label: 'Site Settings', icon: Settings2 },
      { href: '/account', label: 'Your Account', icon: UserRound },
      { href: '/', label: 'View Website', icon: ArrowUpRight },
    ] },
  ];
  return <Sidebar>
    <SidebarHeader className="border-b px-5 py-5"><Brand className="[&_img]:w-48" /></SidebarHeader>
    <SidebarContent>{sections.map((section) => <SidebarGroup key={section.label}><SidebarGroupLabel>{section.label}</SidebarGroupLabel><SidebarGroupContent><SidebarMenu>{section.links.map((link) => <SidebarMenuItem key={link.href}><SidebarMenuButton asChild isActive={pathname === link.href || (link.href !== '/admin' && link.href !== '/' && pathname.startsWith(`${link.href}/`))}><Link href={link.href}><link.icon /><span>{link.label}</span></Link></SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu></SidebarGroupContent></SidebarGroup>)}</SidebarContent>
    <SidebarFooter className="border-t border-sidebar-border p-4"><form action={signOut}><SignOutButton /></form></SidebarFooter>
  </Sidebar>;
}