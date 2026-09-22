import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import { ScrollToTop } from '@/components/scroll-to-top';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-svh flex-col"><SiteHeader /><div className="flex-1">{children}</div><SiteFooter /><ScrollToTop /></div>;
}