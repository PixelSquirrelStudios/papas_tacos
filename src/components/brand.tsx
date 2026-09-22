import Image from 'next/image';
import Link from 'next/link';
import { cn } from '@/lib/utils';

export function Brand({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn('inline-flex shrink-0 items-center gap-3', className)} aria-label="Papa's Tacos home">
      <Image src="/images/Papas_Tacos_Logo_Horizontal.svg" alt="" width={1110} height={290} className="h-auto w-32 brightness-90 min-[380px]:w-44 sm:w-56 md:w-64" unoptimized />
    </Link>
  );
}