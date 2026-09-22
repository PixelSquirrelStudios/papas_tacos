import type { Metadata } from 'next';
import { requireAdmin } from '@/lib/auth/session';
import { AdminSidebar } from '@/components/admin/admin-sidebar';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { Toaster } from '@/components/ui/sonner';
import { AdminRefresh } from '@/components/admin/order-controls';

export const metadata: Metadata = { title: 'Admin', robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return <SidebarProvider><AdminRefresh /><AdminSidebar /><div className="min-w-0 flex-1"><header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-border bg-card px-5"><SidebarTrigger /><span className="text-sm font-medium">Dashboard</span></header>{children}</div><Toaster theme="dark" richColors closeButton /></SidebarProvider>;
}