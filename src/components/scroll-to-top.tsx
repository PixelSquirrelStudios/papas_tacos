'use client';

import { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';

export function ScrollToTop() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    const onScroll = () => {
      clearTimeout(hideTimer);
      setVisible(window.scrollY > window.innerHeight);
      hideTimer = setTimeout(() => setVisible(false), 5000);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      clearTimeout(hideTimer);
    };
  }, []);
  return <button type="button" aria-label="Scroll to top" title="Scroll to top" aria-hidden={!visible} tabIndex={visible ? 0 : -1} onClick={() => window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })} className={`fixed bottom-[max(1.5rem,env(safe-area-inset-bottom))] right-6 z-40 flex size-11 items-center justify-center rounded-md border border-brand-yellow/40 bg-background/95 text-brand-yellow shadow-lg transition-opacity duration-300 hover:bg-accent motion-reduce:transition-none sm:bottom-8 sm:right-10 ${visible ? 'opacity-100' : 'pointer-events-none opacity-0'}`}><ArrowUp className="size-5" aria-hidden="true" /></button>;
}