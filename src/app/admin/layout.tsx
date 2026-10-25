import type { Metadata } from 'next';
import { requireAdmin } from '@/lib/auth/session';
import { AdminSidebar } from '@/components/admin/admin-sidebar';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AdminRefresh } from '@/components/admin/order-controls';

export const metadata: Metadata = { title: 'Admin', robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return <SidebarProvider><AdminRefresh /><AdminSidebar /><div className="min-w-0 flex-1"><header className="sticky top-0 z-40 flex h-20 items-center gap-1 border-b border-border bg-card px-5"><SidebarTrigger className="size-10 [&_svg]:size-6" /><span className="text-lg font-semibold">Dashboard</span></header>{children}</div></SidebarProvider>;
}