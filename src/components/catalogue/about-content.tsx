import Image from 'next/image';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { aboutDefaults } from '@/lib/catalogue/about';
import { publicImage } from '@/lib/catalogue/data';
import type { Settings } from '@/lib/catalogue/types';
import { Button } from '@/components/ui/button';
import { RichDescription } from '@/components/catalogue/rich-description';

export function AboutContent({ settings, fullPage = false }: { settings: Settings | null; fullPage?: boolean }) {
  const content = { ...aboutDefaults, ...settings };
  const Heading = fullPage ? 'h1' : 'h2';
  const heading = fullPage ? content.about_page_heading : content.about_heading;
  const storyImages = [
    { src: publicImage(content.about_page_image_1_path), alt: content.about_page_image_1_alt },
    { src: publicImage(content.about_page_image_2_path), alt: content.about_page_image_2_alt },
    { src: publicImage(content.about_page_image_3_path), alt: content.about_page_image_3_alt },
  ].filter((image): image is { src: string; alt: string } => Boolean(image.src));
  return <section aria-labelledby="about-title" className="border-b border-border bg-card">
    <div className={`page-width grid gap-10 py-16 sm:py-20 lg:gap-16 ${fullPage && storyImages.length === 0 ? 'items-start' : `lg:grid-cols-2 ${fullPage ? 'items-start' : 'items-center'}`}`}>
    {fullPage ? storyImages.length > 0 && <div data-about-media data-about-story-images className="space-y-6">
      {storyImages.map((image, index) => <div key={`${image.src}-${index}`} className={`relative aspect-4/3 overflow-hidden border-b-8 ${index === 0 ? 'border-turquoise' : 'border-brand-yellow'}`}><Image src={image.src} alt={image.alt} fill unoptimized sizes="(max-width: 1023px) 100vw, 50vw" className="object-cover" /><span className="sr-only">Story image {index + 1}</span></div>)}
    </div> : <div data-about-media className="relative aspect-4/5 max-h-160 overflow-hidden border-b-8 border-turquoise sm:aspect-5/4 lg:aspect-4/5">
      <Image src={publicImage(content.about_image_path) || '/images/tacos.jpg'} alt={content.about_image_alt} fill unoptimized sizes="(max-width: 1023px) 100vw, 50vw" className="object-cover" />
    </div>}
    <div data-about-copy className={`min-w-0 ${fullPage && storyImages.length === 0 ? 'max-w-4xl' : ''}`}>
      {!fullPage && <p className="eyebrow wrap-break-word text-turquoise">{content.about_eyebrow}</p>}
      <Heading id="about-title" className="section-title wrap-break-word">{heading}</Heading>
      {fullPage ? <RichDescription content={content.about_full_story} className="mt-6 text-base leading-relaxed text-muted-foreground sm:text-lg" /> : <div className="mt-6 space-y-5 wrap-break-word text-base leading-relaxed text-muted-foreground sm:text-lg">{content.about_content.split(/\r?\n\s*\r?\n/).filter(Boolean).map((paragraph, index) => <p key={index} className="whitespace-pre-line">{paragraph}</p>)}</div>}
      <div className={`mt-8 grid w-full gap-3 ${fullPage ? 'grid-cols-1' : 'grid-cols-2'}`}>
        {!fullPage && <Button asChild variant="outline" className="h-11 w-full min-w-0 gap-1 px-1 text-xs min-[380px]:gap-2 min-[380px]:px-3 min-[380px]:text-sm"><Link href="/about">More About Papa&apos;s<ArrowUpRight className="size-3.5" aria-hidden="true" /></Link></Button>}
        <Button asChild className={`h-11 w-full ${fullPage ? '' : 'min-w-0 gap-1 px-1 text-xs min-[380px]:gap-2 min-[380px]:px-3 min-[380px]:text-sm'}`}><Link href={fullPage ? '/#contact' : '#contact'}>Book Papa&apos;s<ArrowUpRight className="size-3.5" aria-hidden="true" /></Link></Button>
      </div>
    </div>
    </div>
  </section>;
}