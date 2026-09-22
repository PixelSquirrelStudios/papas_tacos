'use client';

import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Save, LoaderCircle } from 'lucide-react';
import { toast } from 'sonner';
import { saveRecord } from '@/app/admin/actions';
import { resources, resourceSchema, type AdminRow } from '@/lib/admin/resources';
import { formDefaults, formPayload } from '@/lib/admin/form-values';
import { choiceLabel } from '@/lib/catalogue/format';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { ImageUpload } from './image-upload';
import { RichTextEditor } from './rich-text-editor';

export function RecordEditor({ resourceKey, row, references, onClose, onSaved }: { resourceKey: string; row: AdminRow | null; references: Record<string, AdminRow[]>; onClose: () => void; onSaved: () => void }) {
  const resource = resources[resourceKey];
  const titleRef = useRef<HTMLHeadingElement>(null);
  const form = useForm<Record<string, unknown>>({ defaultValues: formDefaults(resource, row ?? {}) });
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const busy = form.formState.isSubmitting || uploading;
  async function submit(values: Record<string, unknown>) {
    setError('');
    const payload = formPayload(resource, values);
    const parsed = resourceSchema(resource).safeParse(payload);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) form.setError(String(issue.path[0]), { message: issue.message });
      return;
    }
    try {
      const result = await saveRecord(resourceKey, row?.id ?? null, row?.updated_at ?? null, payload);
      if (!result.ok) {
        setError(result.error ?? 'Save failed.');
        for (const [key, message] of Object.entries(result.fields ?? {})) form.setError(key, { message });
        return;
      }
      toast.success(`${resource.singular} saved`);
      onSaved();
    } catch { setError('Unable to save. Check your connection and try again.'); }
  }
  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}><DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-3xl" showCloseButton={!busy} onOpenAutoFocus={(event) => { event.preventDefault(); titleRef.current?.focus(); }} onPointerDownOutside={(event) => event.preventDefault()}>
    <DialogHeader><DialogTitle ref={titleRef} tabIndex={-1}>{row ? 'Edit' : 'Add'} {resource.singular}</DialogTitle><DialogDescription>{row ? String(row[resource.label] ?? resource.title) : resource.title}</DialogDescription></DialogHeader>
    <Form {...form}><form onSubmit={form.handleSubmit(submit)} className="space-y-6">
      <fieldset disabled={busy} className="grid min-w-0 gap-5 sm:grid-cols-2">
        {resource.fields.map((definition) => <FormField key={definition.key} control={form.control} name={definition.key} render={({ field }) => <FormItem className={['textarea', 'richtext', 'image', 'tags'].includes(definition.type ?? '') ? 'min-w-0 sm:col-span-2' : 'min-w-0'}>
          <FormLabel>{definition.label}{definition.required ? ' *' : ''}</FormLabel>
          {definition.type === 'boolean' ? <FormControl><Switch checked={Boolean(field.value)} onCheckedChange={field.onChange} disabled={busy} /></FormControl>
            : definition.type === 'tags' ? <div className="flex flex-wrap gap-x-5 gap-y-3">{definition.options?.map((option) => <label key={option} className="flex items-center gap-2 text-sm"><Checkbox checked={(field.value as string[]).includes(option)} disabled={busy} onCheckedChange={(checked) => field.onChange(checked ? [...field.value as string[], option] : (field.value as string[]).filter((value) => value !== option))} />{choiceLabel(option)}</label>)}</div>
            : definition.type === 'image' ? <ImageUpload folder={definition.folder!} value={String(field.value ?? '')} onChange={field.onChange} onBusy={setUploading} />
            : definition.type === 'select' ? <Select value={String(field.value ?? '')} onValueChange={field.onChange} disabled={busy}><FormControl><SelectTrigger className="w-full"><SelectValue placeholder="Select..." /></SelectTrigger></FormControl><SelectContent>{definition.reference ? (references[definition.reference] ?? []).map((reference) => <SelectItem key={reference.id} value={reference.id!}>{String(reference.name ?? reference.title ?? reference.id)}</SelectItem>) : definition.options?.map((option) => <SelectItem key={option} value={option}>{choiceLabel(option)}</SelectItem>)}</SelectContent></Select>
            : definition.type === 'richtext' ? <FormControl><RichTextEditor value={String(field.value ?? '')} onChange={field.onChange} onBlur={field.onBlur} disabled={busy} /></FormControl>
            : definition.type === 'textarea' ? <FormControl><Textarea {...field} value={String(field.value ?? '')} rows={4} maxLength={definition.max} /></FormControl>
            : <FormControl><Input {...field} value={String(field.value ?? '')} type={definition.type === 'datetime' ? 'datetime-local' : definition.type === 'date' ? 'date' : ['number', 'money'].includes(definition.type ?? '') ? 'number' : 'text'} step={definition.type === 'money' ? '0.01' : definition.type === 'number' ? '1' : undefined} min={definition.min} max={definition.max} maxLength={definition.max} /></FormControl>}
          <FormMessage />
        </FormItem>} />)}
      </fieldset>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="sticky bottom-0 flex justify-end gap-3 border-t bg-background py-4"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? <LoaderCircle className="animate-spin" /> : <Save />}Save Changes</Button></div>
    </form></Form>
  </DialogContent></Dialog>;
}