'use client';

import { useState } from 'react';
import { Editor } from '@tinymce/tinymce-react';
import { descriptionHtml } from '@/lib/catalogue/rich-text';
import { Textarea } from '@/components/ui/textarea';

export function RichTextEditor({ id, value, onChange, onBlur, disabled, ...props }: { id?: string; value: string; onChange: (value: string) => void; onBlur: () => void; disabled: boolean; 'aria-describedby'?: string; 'aria-invalid'?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <div><p role="alert" className="mb-2 text-sm text-primary">The rich text editor could not load. Your description is preserved below as HTML.</p><Textarea {...props} id={id} value={value} onChange={(event) => onChange(event.target.value)} onBlur={onBlur} disabled={disabled} rows={8} maxLength={10000} /></div>;
  return <div className="min-w-0" aria-describedby={props['aria-describedby']} aria-invalid={props['aria-invalid']}><Editor
    id={id}
    licenseKey="gpl"
    tinymceScriptSrc="https://cdn.jsdelivr.net/npm/tinymce@8.9.1/tinymce.min.js"
    value={descriptionHtml(value)}
    onEditorChange={onChange}
    onBlur={onBlur}
    onScriptsLoadError={() => setFailed(true)}
    disabled={disabled}
    init={{
      height: 300,
      menubar: false,
      promotion: false,
      resize: false,
      contextmenu: false,
      toolbar_mode: 'wrap',
      plugins: 'lists',
      toolbar: 'undo redo | bold italic underline | bullist numlist',
      skin: 'oxide',
      content_css: 'default',
      iframe_aria_text: 'Menu description editor',
      valid_elements: 'p,br,strong/b,em/i,u,s,ul,ol,li,blockquote,a[href|title]',
      formats: { underline: { inline: 'u', exact: true }, strikethrough: { inline: 's', exact: true } },
      content_style: 'body { font-family: sans-serif; font-size: 14px; line-height: 1.6; } p { margin: 0 0 12px; }',
    }}
  /></div>;
}