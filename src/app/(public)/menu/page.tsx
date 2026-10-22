import type { Metadata } from 'next';
import { getCatalogue, getEvents } from '@/lib/catalogue/data';
import { MenuBrowser } from '@/components/catalogue/menu-browser';
import { MenuOrderingProvider } from '@/components/bag/bag-provider';
import { menuCatalogue } from '@/lib/catalogue/menu-sets';

export const metadata: Metadata = { title: 'The Menu', description: "Explore Papa's Tacos, choose your extras and build your bag." };

export default async function MenuPage({ searchParams }: { searchParams: Promise<{ event?: string }> }) {
  const { event } = await searchParams;
  const [catalogue, events] = await Promise.all([getCatalogue(), event ? getEvents() : Promise.resolve(null)]);
  const selected = events?.events.find((candidate) => candidate.id === event);
  const menu = event && !selected ? { categories: [], items: [], available: false } : menuCatalogue(catalogue, selected?.menu_set_id);
  const initial = { categories: menu.categories, items: menu.items, available: menu.available };
  return <main id="main-content" className="page-width py-12 sm:py-16"><p className="eyebrow text-pink">Made for your appetite</p><h1 className="page-title">THE MENU.</h1><p className="mb-8 mt-4 max-w-xl text-muted-foreground">Your favourites. Your vibe. Your way.</p><MenuOrderingProvider key={event || 'public'} eventId={event}><MenuBrowser initial={initial} /></MenuOrderingProvider><p className="mt-10 border-t border-border pt-6 text-sm leading-relaxed text-muted-foreground">Please speak to our team about allergies before ordering. Dietary labels do not guarantee an allergen-free environment.</p></main>;
}