'use client';

import { useEffect, useEffectEvent, useRef, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { createBrowserSupabase } from '@/lib/supabase/client';
import { supabaseConfig } from '@/lib/supabase/config';
import { adminUpdateTables, catalogueRequestEvent, catalogueUpdateEvent, publicUpdateTables, siteUpdateEvent, siteUpdateStorageKey } from '@/lib/site-updates';

export function SiteUpdates() {
  const pathname = usePathname();
  const router = useRouter();
  const admin = pathname.startsWith('/admin');
  const [pending, startTransition] = useTransition();
  const queued = useRef(false);
  const refreshPage = useEffectEvent(() => {
    if (admin || document.visibilityState === 'hidden' || ['/menu', '/bag'].includes(pathname)) return;
    if (pending) { queued.current = true; return; }
    queued.current = false;
    startTransition(() => router.refresh());
  });

  useEffect(() => {
    window.dispatchEvent(new Event(catalogueRequestEvent));
  }, [pathname]);

  useEffect(() => {
    if (!pending && queued.current) refreshPage();
  }, [pending]);

  useEffect(() => {
    const update = () => refreshPage();
    const storage = (event: StorageEvent) => {
      if (event.key === siteUpdateStorageKey) window.dispatchEvent(new Event(siteUpdateEvent));
    };
    window.addEventListener(siteUpdateEvent, update);
    window.addEventListener(catalogueUpdateEvent, update);
    window.addEventListener('storage', storage);
    return () => {
      window.removeEventListener(siteUpdateEvent, update);
      window.removeEventListener(catalogueUpdateEvent, update);
      window.removeEventListener('storage', storage);
    };
  }, []);

  useEffect(() => {
    if (!supabaseConfig()) return;
    const client = createBrowserSupabase();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const update = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = undefined;
        if (document.visibilityState === 'visible') window.dispatchEvent(new Event(siteUpdateEvent));
      }, 200);
    };
    const channel = client.channel(admin ? 'admin-site-updates' : 'public-site-updates');
    for (const table of [...publicUpdateTables, ...(admin ? adminUpdateTables : [])]) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, update);
    }
    channel.subscribe((status) => { if (status === 'SUBSCRIBED') update(); });
    return () => { clearTimeout(timer); void client.removeChannel(channel); };
  }, [admin]);

  return null;
}