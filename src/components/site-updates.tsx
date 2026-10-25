'use client';

import { useEffect, useEffectEvent, useRef, useState, useTransition } from 'react';
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
  const [disconnected, setDisconnected] = useState(false);
  const refreshPage = useEffectEvent(() => {
    if (admin || document.visibilityState === 'hidden' || pathname === '/bag') return;
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
    let active = true;
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
    channel.subscribe((status, error) => {
      if (!active) return;
      if (status === 'SUBSCRIBED') {
        setDisconnected(false);
        update();
      } else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) {
        setDisconnected(true);
        console.error('[realtime] Live updates disconnected', status, error?.message);
      }
    });
    const offline = () => setDisconnected(true);
    window.addEventListener('offline', offline);
    return () => { active = false; clearTimeout(timer); window.removeEventListener('offline', offline); void client.removeChannel(channel); };
  }, [admin]);

  return admin && disconnected ? <p role="status" className="border-b border-brand-yellow/40 bg-brand-yellow/5 px-5 py-3 text-sm">Live updates are disconnected; data may be out of date. Reconnecting automatically. Refresh the page to check the latest data.</p> : null;
}