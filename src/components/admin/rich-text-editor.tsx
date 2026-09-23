'use client';

import { useState } from 'react';
import { Editor } from '@tinymce/tinymce-react';
import { descriptionHtml } from '@/lib/catalogue/rich-text';
import { Textarea } from '@/components/ui/textarea';

export function RichTextEditor({ id, value, onChange, onBlur, disabled, label = 'Rich text', maxLength = 10000, preset = 'basic', ...props }: { id?: string; value: string; onChange: (value: string) => void; onBlur: () => void; disabled: boolean; label?: string; maxLength?: number; preset?: 'basic' | 'full'; 'aria-describedby'?: string; 'aria-invalid'?: boolean }) {
  const [failed, setFailed] = useState(false);
  const full = preset === 'full';
  if (failed) return <div><p role="alert" className="mb-2 text-sm text-primary">The rich text editor could not load. Your content is preserved below as HTML.</p><Textarea {...props} id={id} value={value} onChange={(event) => onChange(event.target.value)} onBlur={onBlur} disabled={disabled} rows={8} maxLength={maxLength} /></div>;
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
      plugins: full ? 'lists link' : 'lists',
      toolbar: full ? 'undo redo | blocks | bold italic underline strikethrough | blockquote | bullist numlist | link | removeformat' : 'undo redo | bold italic underline | bullist numlist',
      block_formats: full ? 'Paragraph=p; Heading 2=h2; Heading 3=h3; Heading 4=h4' : 'Paragraph=p',
      skin: 'oxide',
      content_css: 'default',
      iframe_aria_text: `${label} editor`,
      valid_elements: full ? 'p,h2,h3,h4,br,strong/b,em/i,u,s,ul,ol,li,blockquote,a[href|title]' : 'p,br,strong/b,em/i,u,s,ul,ol,li,blockquote,a[href|title]',
      formats: { underline: { inline: 'u', exact: true }, strikethrough: { inline: 's', exact: true } },
      content_style: 'body { font-family: sans-serif; font-size: 14px; line-height: 1.6; } p { margin: 0 0 12px; }',
    }}
  /></div>;
}