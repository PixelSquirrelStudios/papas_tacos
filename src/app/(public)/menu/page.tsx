import type { Metadata } from 'next';
import { getCatalogue } from '@/lib/catalogue/data';
import { MenuBrowser } from '@/components/catalogue/menu-browser';

export const metadata: Metadata = { title: 'The Menu', description: "Explore Papa's Tacos, choose your extras and build your bag." };

export default async function MenuPage() {
  const catalogue = await getCatalogue();
  return <main id="main-content" className="page-width py-12 sm:py-16"><p className="eyebrow text-pink">Made for your appetite</p><h1 className="page-title">THE MENU.</h1><p className="mb-8 mt-4 max-w-xl text-muted-foreground">Your favourites. Your vibe. Your way.</p><MenuBrowser initial={catalogue} /><p className="mt-10 border-t border-border pt-6 text-sm leading-relaxed text-muted-foreground">Please speak to our team about allergies before ordering. Dietary labels do not guarantee an allergen-free environment.</p></main>;
}