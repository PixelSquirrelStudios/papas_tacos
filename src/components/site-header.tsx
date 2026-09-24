import Link from 'next/link';
import { LogIn, UtensilsCrossed, UserRound } from 'lucide-react';
import { Brand } from '@/components/brand';
import { SiteMenu } from '@/components/site-menu';
import { Button } from '@/components/ui/button';
import { getViewer } from '@/lib/auth/session';
import { BagButton } from '@/components/bag/bag-button';

export async function SiteHeader() {
  const viewer = await getViewer();
  return <>
    <a href="#main-content" className="sr-only fixed left-4 top-4 z-50 rounded bg-primary p-3 text-primary-foreground focus:not-sr-only">Skip to content</a>
    <header className="sticky top-0 z-40 border-b border-border bg-background">
      <div className="mx-auto flex h-24 max-w-[1440px] items-center justify-between gap-2 px-5 sm:gap-4 sm:px-10 lg:px-16">
        <Brand className="[&_img]:w-28 min-[380px]:[&_img]:w-36 sm:[&_img]:w-56 md:[&_img]:w-64" />
        <nav className="flex items-center gap-1 min-[380px]:gap-2 lg:gap-3" aria-label="Account navigation">
          <Button asChild className="size-9 p-0 sm:size-11 lg:w-auto lg:px-4"><Link href="/menu" aria-label="The Menu" title="The Menu"><UtensilsCrossed aria-hidden="true" /><span className="hidden lg:inline">The Menu</span></Link></Button>
          {viewer ? <Button asChild className="size-9 p-0 sm:size-11 lg:w-auto lg:px-4"><Link href={viewer.profile?.role === 'admin' ? '/admin' : '/account'} aria-label={viewer.profile?.role === 'admin' ? 'Admin Dashboard' : 'Your Account'} title={viewer.profile?.role === 'admin' ? 'Admin Dashboard' : 'Your Account'}><UserRound className="size-4" aria-hidden="true" /><span className="hidden lg:inline">{viewer.profile?.role === 'admin' ? 'Dashboard' : 'Your Account'}</span></Link></Button> : <>
            <Button asChild className="size-9 p-0 sm:size-11 lg:w-auto lg:px-4"><Link href="/sign-in" aria-label="Sign In" title="Sign In"><LogIn aria-hidden="true" /><span className="hidden lg:inline">Sign In</span></Link></Button>
            <Button asChild className="hidden h-11 md:inline-flex"><Link href="/sign-in?mode=signup">Create an Account</Link></Button>
          </>}
          <BagButton /><SiteMenu signedIn={Boolean(viewer)} admin={viewer?.profile?.role === 'admin'} />
        </nav>
      </div>
    </header>
  </>;
}