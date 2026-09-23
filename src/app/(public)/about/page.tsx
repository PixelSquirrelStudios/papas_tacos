import type { Metadata } from 'next';
import { AboutContent } from '@/components/catalogue/about-content';
import { getSettings } from '@/lib/catalogue/data';

export const metadata: Metadata = { title: "About Papa's", description: "Meet Papa's Tacos: bold flavours and homemade street food for markets, weddings, parties and corporate events across South Wales." };

export default async function AboutPage() {
  return <main id="main-content"><AboutContent settings={await getSettings()} fullPage /></main>;
}