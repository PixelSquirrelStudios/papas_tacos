import type { Metadata } from 'next';
import { BagView } from '@/components/bag/bag-view';

export const metadata: Metadata = { title: 'Your Bag', robots: { index: false, follow: false } };

export default function BagPage() {
  return <main id="main-content" className="page-width py-8 sm:py-12"><p className="eyebrow text-turquoise">Fresh from Papa&apos;s</p><h1 className="mb-8 text-3xl font-semibold sm:mb-10 sm:text-4xl">Your Bag</h1><BagView /></main>;
}