'use client';

import { useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Save, LoaderCircle } from 'lucide-react';
import { toast } from 'sonner';
import { saveRecord } from '@/app/admin/actions';
import { resources, resourceSchema, type AdminRow } from '@/lib/admin/resources';
import { formDefaults, formPayload, slugFromTitle } from '@/lib/admin/form-values';
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
import { ModifierGroupSelection } from './modifier-group-selection';

export function RecordEditor({ resourceKey, row, references, initialValues = {}, initialGroupIds = [], onClose, onSaved }: { resourceKey: string; row: AdminRow | null; references: Record<string, AdminRow[]>; initialValues?: AdminRow; initialGroupIds?: string[]; onClose: () => void; onSaved: () => void }) {
  const resource = resources[resourceKey];
  const titleRef = useRef<HTMLHeadingElement>(null);
  const form = useForm<Record<string, unknown>>({ defaultValues: formDefaults(resource, row ?? initialValues) });
  const maxSelections = useWatch({ control: form.control, name: 'max_selections' });
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [groupIds, setGroupIds] = useState(initialGroupIds);
  const slugEdited = useRef(Boolean(row?.slug));
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
      const result = await saveRecord(resourceKey, row?.id ?? null, row?.updated_at ?? null, payload, resourceKey === 'menu' ? groupIds : undefined);
      if (!result.ok) {
        setError(result.error ?? 'Save failed.');
        for (const [key, message] of Object.entries(result.fields ?? {})) form.setError(key, { message });
        return;
      }
      toast.success(`${resource.singular} saved`);
      onSaved();
    } catch { setError('Unable to save. Check your connection and try again.'); }
  }
  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}><DialogContent className="grid max-h-[90svh] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0 sm:max-w-3xl" showCloseButton={!busy} onOpenAutoFocus={(event) => { event.preventDefault(); titleRef.current?.focus(); }} onPointerDownOutside={(event) => event.preventDefault()}>
    <DialogHeader className="px-6 pb-4 pt-6"><DialogTitle ref={titleRef} tabIndex={-1}>{row ? 'Edit' : 'Add'} {resource.singular}</DialogTitle><DialogDescription>{row ? String(row[resource.label] ?? resource.title) : resource.title}</DialogDescription></DialogHeader>
    <Form {...form}><form onSubmit={form.handleSubmit(submit)} className="grid min-h-0 grid-rows-[minmax(0,1fr)_auto]">
      <div data-admin-form-scroll className="min-h-0 overflow-y-auto px-6 pb-6">
        <fieldset disabled={busy} className="grid min-w-0 gap-5 sm:grid-cols-2">
        {resourceKey === 'modifiers' && <div className="space-y-2 sm:col-span-2"><label htmlFor="modifier-selection-mode" className="text-sm font-medium">Selection Mode</label><Select value={Number(maxSelections) === 1 ? 'single' : 'multiple'} disabled={busy} onValueChange={(mode) => {
          form.setValue('max_selections', mode === 'single' ? 1 : Math.max(2, Number(form.getValues('max_selections'))), { shouldDirty: true });
          if (mode === 'single') form.setValue('min_selections', Math.min(1, Number(form.getValues('min_selections'))), { shouldDirty: true });
        }}><SelectTrigger id="modifier-selection-mode" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="single">Single Choice</SelectItem><SelectItem value="multiple">Multiple Choices</SelectItem></SelectContent></Select></div>}
        {resource.fields.map((definition) => <FormField key={definition.key} control={form.control} name={definition.key} render={({ field }) => <FormItem data-admin-field={definition.key} className={definition.layout === 'full' || ['textarea', 'richtext', 'image', 'tags', 'groups'].includes(definition.type ?? '') ? 'min-w-0 sm:col-span-2' : definition.layout === 'row-start' ? 'min-w-0 sm:col-start-1' : 'min-w-0'}>
          <FormLabel>{definition.label}{definition.required ? ' *' : ''}</FormLabel>
          {definition.type === 'boolean' ? <FormControl><Switch checked={Boolean(field.value)} onCheckedChange={field.onChange} disabled={busy} /></FormControl>
            : definition.type === 'groups' ? <ModifierGroupSelection groups={(references.modifier_groups ?? []).filter((group) => group.id !== row?.id)} selected={(field.value as string[]) ?? []} onChange={field.onChange} disabled={busy} />
            : definition.type === 'tags' ? <div className="flex flex-wrap gap-x-5 gap-y-3">{definition.options?.map((option) => <label key={option} className="flex items-center gap-2 text-sm"><Checkbox checked={(field.value as string[]).includes(option)} disabled={busy} onCheckedChange={(checked) => field.onChange(checked ? [...field.value as string[], option] : (field.value as string[]).filter((value) => value !== option))} />{choiceLabel(option)}</label>)}</div>
            : definition.type === 'image' ? <ImageUpload folder={definition.folder!} value={String(field.value ?? '')} onChange={field.onChange} onBusy={setUploading} />
            : definition.type === 'select' ? <Select value={String(field.value ?? '')} onValueChange={field.onChange} disabled={busy}><FormControl><SelectTrigger className="w-full"><SelectValue placeholder="Select..." /></SelectTrigger></FormControl><SelectContent>{definition.reference ? (references[definition.reference] ?? []).map((reference) => <SelectItem key={reference.id} value={reference.id!}>{String(reference.name ?? reference.title ?? reference.id)}</SelectItem>) : definition.options?.map((option) => <SelectItem key={option} value={option}>{choiceLabel(option)}</SelectItem>)}</SelectContent></Select>
            : definition.type === 'richtext' ? <FormControl><RichTextEditor value={String(field.value ?? '')} onChange={field.onChange} onBlur={field.onBlur} disabled={busy} label={definition.label} maxLength={definition.max} preset={definition.editor} /></FormControl>
            : definition.type === 'textarea' ? <FormControl><Textarea {...field} value={String(field.value ?? '')} rows={4} maxLength={definition.max} /></FormControl>
            : <FormControl><Input {...field} value={String(field.value ?? '')} onChange={(event) => {
              field.onChange(event);
              if (definition.key === 'slug') slugEdited.current = Boolean(event.target.value);
              if (definition.key === resource.label && !slugEdited.current && resource.fields.some((entry) => entry.key === 'slug')) form.setValue('slug', slugFromTitle(event.target.value), { shouldDirty: true });
            }} type={definition.type === 'datetime' ? 'datetime-local' : definition.type === 'date' ? 'date' : ['number', 'money'].includes(definition.type ?? '') ? 'number' : 'text'} step={definition.type === 'money' ? '0.01' : definition.type === 'number' ? '1' : undefined} min={definition.min} max={definition.max} maxLength={definition.max} /></FormControl>}
          <FormMessage />
        </FormItem>} />)}
        {resourceKey === 'menu' && <section aria-labelledby="menu-modifier-groups" className="min-w-0 border-t pt-5 sm:col-span-2"><h3 id="menu-modifier-groups" className="mb-4 text-base font-semibold">Modifier Groups</h3><ModifierGroupSelection groups={references.modifier_groups ?? []} selected={groupIds} onChange={setGroupIds} disabled={busy} /></section>}
        </fieldset>
        {error && <p role="alert" className="mt-6 text-sm text-destructive">{error}</p>}
      </div>
      <div data-admin-form-actions className="flex shrink-0 justify-end gap-3 border-t bg-background px-6 py-4"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? <LoaderCircle className="animate-spin" /> : <Save />}Save Changes</Button></div>
    </form></Form>
  </DialogContent></Dialog>;
}