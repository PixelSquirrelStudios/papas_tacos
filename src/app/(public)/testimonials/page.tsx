import type { Metadata } from 'next';
import { getTestimonials } from '@/lib/catalogue/data';
import { ReviewList } from '@/components/catalogue/public-content';

export const metadata: Metadata = { title: 'Customer Testimonials' };

export default async function TestimonialsPage() {
  const data = await getTestimonials();
  return <main id="main-content" className="page-width py-12 sm:py-16"><p className="eyebrow text-turquoise">From the familia</p><h1 className="page-title">GOOD FOOD.<br />GOOD WORDS.</h1><p className="mb-10 mt-4 text-muted-foreground">A little love from the people who pull up hungry.</p><ReviewList {...data} /></main>;
}