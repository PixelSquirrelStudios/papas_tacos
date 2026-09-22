'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Uppy from '@uppy/core';
import Tus from '@uppy/tus';
import Dashboard from '@uppy/react/dashboard';
import { ImagePlus, X } from 'lucide-react';
import { createBrowserSupabase } from '@/lib/supabase/client';
import { supabaseConfig } from '@/lib/supabase/config';
import { publicImageUrl } from '@/lib/catalogue/format';
import { Button } from '@/components/ui/button';
import '@uppy/core/css/style.min.css';
import '@uppy/dashboard/css/style.min.css';

export function ImageUpload({ folder, value, onChange, onBusy }: { folder: 'menu' | 'events' | 'testimonials'; value: string; onChange: (value: string) => void; onBusy: (busy: boolean) => void }) {
  const [uppy] = useState(() => new Uppy({ autoProceed: false, restrictions: { maxNumberOfFiles: 1, maxFileSize: 5 * 1024 * 1024, allowedFileTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'] } }));
  const [error, setError] = useState('');
  const [replacing, setReplacing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const config = supabaseConfig();
  const preview = publicImageUrl(value, config?.url ?? null);
  useEffect(() => {
    const settings = supabaseConfig();
    if (!settings) return;
    const client = createBrowserSupabase();
    const uploader = uppy;
    uploader.use(Tus, {
      endpoint: `${settings.url}/storage/v1/upload/resumable`,
      chunkSize: 6 * 1024 * 1024,
      removeFingerprintOnSuccess: true,
      allowedMetaFields: ['bucketName', 'objectName', 'contentType', 'cacheControl'],
      onBeforeRequest: async (request) => {
        const { data: { session } } = await client.auth.getSession();
        if (!session) throw new Error('Sign in again to upload.');
        request.setHeader('Authorization', `Bearer ${session.access_token}`);
        request.setHeader('apikey', settings.key);
      },
    });
    const added = (file: ReturnType<Uppy['getFile']>) => {
      const extensions: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif' };
      uploader.setFileMeta(file.id, { bucketName: 'images', objectName: `${folder}/${crypto.randomUUID()}.${extensions[file.type]}`, contentType: file.type, cacheControl: '3600' });
    };
    uploader.on('file-added', added);
    return () => {
      uploader.cancelAll();
      uploader.off('file-added', added);
      const plugin = uploader.getPlugin('Tus');
      if (plugin) uploader.removePlugin(plugin);
    };
  }, [folder, uppy]);
  useEffect(() => {
    if (!uppy) return;
    const started = () => { setError(''); setUploading(true); onBusy(true); };
    const stopped = () => { setUploading(false); onBusy(false); };
    const complete = (result: { successful?: ReturnType<Uppy['getFile']>[]; failed?: ReturnType<Uppy['getFile']>[] }) => {
      const file = result.successful?.[0];
      if (file && !result.failed?.length) {
        onChange(`images/${String(file.meta.objectName)}`);
        setReplacing(false);
        setError('');
      }
      setUploading(false);
      onBusy(false);
    };
    const failed = (_file: ReturnType<Uppy['getFile']> | undefined, cause: Error) => {
      stopped();
      setError(cause.message.includes('row-level security')
        ? 'Supabase denied this upload (403). Check the admin session and the images bucket policies.'
        : `Upload failed: ${cause.message}`);
    };
    uppy.on('upload', started).on('complete', complete).on('upload-error', failed).on('cancel-all', stopped);
    return () => { uppy.off('upload', started).off('complete', complete).off('upload-error', failed).off('cancel-all', stopped); };
  }, [uppy, onChange, onBusy]);
  return <div className="min-w-0 space-y-3">
    {preview && <div className="space-y-2"><div className="relative h-36 w-48 max-w-full overflow-hidden rounded-md border"><Image src={preview} alt="Current image" fill unoptimized className="object-cover" /></div><div className="flex gap-2"><Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => { uppy.clear(); setError(''); setReplacing(true); }}><ImagePlus />Replace Image</Button><Button type="button" variant="ghost" size="icon-sm" disabled={uploading} aria-label="Remove image from record" title="Remove image from record" onClick={() => { uppy.clear(); setError(''); setReplacing(false); onChange(''); }}><X /></Button></div></div>}
    {(!preview || replacing) && (config ? <><Dashboard uppy={uppy} theme="dark" width="100%" height={280} proudlyDisplayPoweredByUppy={false} />{preview && <Button type="button" variant="ghost" disabled={uploading} onClick={() => { uppy.clear(); setError(''); setReplacing(false); }}>Cancel Replacement</Button>}</> : <p className="text-sm text-destructive">Storage is not configured.</p>)}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>;
}