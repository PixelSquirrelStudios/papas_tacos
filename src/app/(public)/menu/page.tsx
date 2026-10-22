import type { Metadata } from 'next';
import { getCatalogue, getEvents, getSettings } from '@/lib/catalogue/data';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { MenuBrowser } from '@/components/catalogue/menu-browser';
import { MenuOrderingProvider } from '@/components/bag/bag-provider';
import { menuCatalogue } from '@/lib/catalogue/menu-sets';

export const metadata: Metadata = { title: 'The Menu', description: "Explore Papa's Tacos, choose your extras and build your bag." };

export default async function MenuPage({ searchParams }: { searchParams: Promise<{ event?: string }> }) {
  const { event } = await searchParams;
  const settings = await getSettings();
  if (!event && settings?.public_menu_enabled !== true) {
    return <main id="main-content" className="page-width py-16"><h1 className="page-title">{settings ? 'Public Menu Unavailable' : 'Menu Temporarily Unavailable'}</h1><p className="mt-5 max-w-xl text-muted-foreground">{settings ? 'Our public menu is not currently displayed. Event menus remain available through their event links and QR codes.' : 'We could not check menu availability. Please try again shortly.'}</p><div className="mt-8 flex flex-wrap gap-3"><Button asChild><Link href="/events">Find the Truck</Link></Button><Button asChild variant="outline"><Link href="/contact">Contact Us</Link></Button></div></main>;
  }
  const [catalogue, events] = await Promise.all([getCatalogue(), event ? getEvents() : Promise.resolve(null)]);
  const selected = events?.events.find((candidate) => candidate.id === event);
  const menu = event && !selected ? { categories: [], items: [], available: false } : menuCatalogue(catalogue, selected?.menu_set_id);
  const initial = { categories: menu.categories, items: menu.items, available: menu.available };
  return <main id="main-content" className="page-width py-12 sm:py-16"><p className="eyebrow text-pink">Made for Your Appetite</p><h1 className="page-title">THE MENU.</h1><p className="mb-8 mt-4 max-w-xl text-muted-foreground">Your favourites. Your vibe. Your way.</p><MenuOrderingProvider key={event || 'public'} eventId={event}><MenuBrowser initial={initial} /></MenuOrderingProvider><p className="mt-10 border-t border-border pt-6 text-sm leading-relaxed text-muted-foreground">Please speak to our team about allergies before ordering. Dietary labels do not guarantee an allergen-free environment.</p></main>;
}