'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
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
  const [dialogContent, setDialogContent] = useState<HTMLDivElement | null>(null);
  const form = useForm<Record<string, unknown>>({ defaultValues: formDefaults(resource, row ?? initialValues) });
  const [customMapUrl, setCustomMapUrl] = useState(() => Boolean(form.getValues('map_url')));
  const maxSelections = useWatch({ control: form.control, name: 'max_selections' });
  const linkedId = useWatch({ control: form.control, name: 'linked_menu_item_id' });
  const pricingMode = useWatch({ control: form.control, name: 'pricing_mode' });
  const itemKind = useWatch({ control: form.control, name: 'item_kind' });
  const groupType = useWatch({ control: form.control, name: 'group_type' });
  const modifierGroupId = useWatch({ control: form.control, name: 'modifier_group_id' });
  const serviceMode = useWatch({ control: form.control, name: 'service_mode' });
  const walkUpOnly = resourceKey === 'events' && serviceMode === 'walkup';
  const removalGroup = resourceKey === 'modifiers' && groupType === 'removal';
  const removalOption = resourceKey === 'options' && references.modifier_groups?.some((group) => group.id === modifierGroupId && group.group_type === 'removal');
  const linkedItem = references.menu_items?.find((item) => item.id === linkedId);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [groupIds, setGroupIds] = useState(initialGroupIds);
  const slugEdited = useRef(Boolean(row?.slug));
  const busy = form.formState.isSubmitting || uploading;
  useEffect(() => {
    if (!dialogContent) return;
    const moveAuxiliaryUi = (node: Node) => {
      if (!(node instanceof Element)) return;
      if (node.matches('.tox-tinymce-aux') && !dialogContent.contains(node)) dialogContent.append(node);
      node.querySelectorAll('.tox-tinymce-aux').forEach((auxiliaryUi) => {
        if (!dialogContent.contains(auxiliaryUi)) dialogContent.append(auxiliaryUi);
      });
    };
    const observer = new MutationObserver((records) => {
      records.forEach((record) => record.addedNodes.forEach(moveAuxiliaryUi));
    });
    observer.observe(document.body, { childList: true, subtree: true });
    document.querySelectorAll('.tox-tinymce-aux').forEach(moveAuxiliaryUi);
    return () => observer.disconnect();
  }, [dialogContent]);
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
  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}><DialogContent ref={setDialogContent} className="grid max-h-[90svh] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0 sm:max-w-3xl" showCloseButton={!busy} onOpenAutoFocus={(event) => { event.preventDefault(); titleRef.current?.focus(); }} onPointerDownOutside={(event) => event.preventDefault()}>
    <DialogHeader className="px-6 pb-4 pt-6"><DialogTitle ref={titleRef} tabIndex={-1}>{row ? 'Edit' : 'Add'} {resource.singular}</DialogTitle><DialogDescription>{row ? String(row[resource.label] ?? resource.title) : resource.title}</DialogDescription></DialogHeader>
    <Form {...form}><form onSubmit={form.handleSubmit(submit)} className="grid min-h-0 grid-rows-[minmax(0,1fr)_auto]">
      <div data-admin-form-scroll className="min-h-0 overflow-y-auto px-6 pb-6">
        {resourceKey === 'menu' && <div className="mb-5 space-y-2 text-sm text-muted-foreground"><p>Products and meals can have their own stock. A grouped listing such as Cans of Pop has no base price or stock: attach a required choice group containing linked products instead.</p><p>Turn off standalone visibility for products sold only through other listings. Keep them published and allocate their own stock at each event.</p><Link href="/admin/options" className="inline-block text-brand-yellow underline">Manage Standard Modifiers and Linked Product Choices</Link></div>}
        {resourceKey === 'options' && (removalOption ? <p className="mb-5 text-sm text-muted-foreground">Enter the exact option title customers and staff should see, such as No Cheese or Extra Salsa. No prefix is added. Extra Cost is optional and charged per item; leave blank or 0 for no price change. Choices do not change stock, allergen warnings or dietary labels. Available controls whether this option can be requested.</p> : <div className="mb-5 space-y-2 rounded-lg border border-turquoise/25 bg-turquoise/5 p-4 text-sm"><p>Link a simple menu item to share its stock across drinks listings, meal deals and standalone sales. Its name, description, image and allergens are used automatically.</p><p className="text-muted-foreground">Only products without their own choice groups can be linked. Create the product in Menu Items first. Use a required single-choice group for drinks and sweets. Extra Cost is optional; leave blank or 0 for no surcharge.</p>{linkedItem && <p className="font-medium">{String(linkedItem.name)} · {linkedItem.is_published ? 'Published' : 'Draft: unavailable to customers'} · {pricingMode === 'item' ? 'Uses the product price per unit; no extra surcharge' : 'Included in parent price, plus the fixed surcharge below'}</p>}</div>)}
        {resourceKey === 'modifiers' && <p className="mb-5 text-sm text-muted-foreground">Removals and Other Options lets customers personalise their order with optional requests such as No Cheese or Extra Salsa, with an optional extra cost. Attach to a menu item or nest under each taco&apos;s group for separate choices. Add up to 30 options using the exact wording customers and staff should see.</p>}
        {resourceKey === 'events' && <p className="mb-5 text-sm text-muted-foreground">{walkUpOnly ? 'Walk-Up Only events are listed for their location and times. Customers must visit the truck to order and buy on site; delivery, pickup and event QR ordering are unavailable.' : 'Pickup uses scheduled slots. Table/car service aims to deliver as soon as possible, with no guaranteed time. Private events remain visible publicly, but ordering requires the secret QR code provided at the event. Download the QR again after changing privacy. Anyone given that QR link can order; it does not verify attendance. Service type cannot change after orders or a pickup schedule exist. Orders Open and Orders Close set your serving window independently of the event dates: accept orders before the event starts, and close earlier or later. Leave either blank to use the corresponding event time.'}</p>}
        {resourceKey === 'settings' && <p className="mb-5 text-sm text-muted-foreground">Event Ordering and Delivery Ordering cannot be open at the same time. Opening either one closes the other. Show Public Menu controls the generic menu page, homepage menu sections and public navigation links; it does not disable event menus or QR ordering.</p>}
        <fieldset disabled={busy} className={`grid min-w-0 gap-5 ${resourceKey === 'settings' ? 'sm:grid-cols-6' : 'sm:grid-cols-2'}`}>
        {resourceKey === 'modifiers' && !removalGroup && <div className="space-y-2 sm:col-span-2"><label htmlFor="modifier-selection-mode" className="text-sm font-medium">Selection Mode</label><Select value={Number(maxSelections) === 1 ? 'single' : 'multiple'} disabled={busy} onValueChange={(mode) => {
          form.setValue('max_selections', mode === 'single' ? 1 : Math.max(2, Number(form.getValues('max_selections'))), { shouldDirty: true });
          if (mode === 'single') form.setValue('min_selections', Math.min(1, Number(form.getValues('min_selections'))), { shouldDirty: true });
        }}><SelectTrigger id="modifier-selection-mode" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="single">Single Choice</SelectItem><SelectItem value="multiple">Multiple Choices</SelectItem></SelectContent></Select></div>}
        {resource.fields.filter((definition) => {
          if (removalGroup && ['min_selections', 'max_selections', 'child_group_ids'].includes(definition.key)) return false;
          if (removalOption && ['linked_menu_item_id', 'pricing_mode', 'linked_quantity', 'allergens'].includes(definition.key)) return false;
          if (walkUpOnly && ['is_private', 'pickup_enabled', 'ordering_status', 'orders_open_at', 'orders_close_at'].includes(definition.key)) return false;
          if (resourceKey === 'options') {
            if (linkedId && ['name', 'description', 'image_path', 'image_alt', 'allergens'].includes(definition.key)) return false;
            if (!linkedId && ['pricing_mode', 'linked_quantity'].includes(definition.key)) return false;
            if (linkedId && pricingMode === 'item' && definition.key === 'price_pence') return false;
          }
          return !(resourceKey === 'menu' && itemKind === 'group' && definition.key === 'price_pence');
        }).map((definition) => <FormField key={definition.key} control={form.control} name={definition.key} render={({ field }) => <FormItem data-admin-field={definition.key} className={resourceKey === 'settings'
          ? ['ordering_status', 'online_ordering_enabled', 'maintenance_enabled'].includes(definition.key) ? 'min-w-0 sm:col-span-2' : definition.layout === 'full' || ['textarea', 'richtext', 'image', 'tags', 'groups'].includes(definition.type ?? '') ? 'min-w-0 sm:col-span-6' : definition.layout === 'row-start' ? 'min-w-0 sm:col-start-1 sm:col-span-3' : 'min-w-0 sm:col-span-3'
          : definition.layout === 'full' || ['textarea', 'richtext', 'image', 'tags', 'groups'].includes(definition.type ?? '') ? 'min-w-0 sm:col-span-2' : definition.layout === 'row-start' ? 'min-w-0 sm:col-start-1' : 'min-w-0'}>
          {resourceKey === 'events' && definition.key === 'map_url' ? <>
            <label className="flex items-start gap-3 text-sm">
              <Checkbox checked={customMapUrl} disabled={busy} onCheckedChange={(checked) => {
                const enabled = checked === true;
                setCustomMapUrl(enabled);
                if (!enabled) form.setValue('map_url', '', { shouldDirty: true, shouldValidate: true });
              }} />
              <span><span className="font-medium">Use a custom Google Maps directions URL</span><span className="mt-1 block text-muted-foreground">By default, the Directions button uses the event address above. Turn this on only if you need a specific map pin or destination.</span></span>
            </label>
            {customMapUrl && <>
              <FormLabel>Google Maps URL Override</FormLabel>
              <FormControl><Input {...field} value={String(field.value ?? '')} type="url" maxLength={definition.max} placeholder="https://maps.google.com/..." /></FormControl>
              <FormMessage />
            </>}
          </> : <>
          <FormLabel>{walkUpOnly && definition.key === 'ordering_message' ? 'Event Notes' : definition.label}{definition.required ? ' *' : ''}</FormLabel>
          {resourceKey === 'settings' && definition.key === 'ordering_status' ? <><FormControl><Switch checked={field.value === 'open'} onCheckedChange={(checked) => {
            field.onChange(checked ? 'open' : 'closed');
            if (checked) form.setValue('online_ordering_enabled', false, { shouldDirty: true });
          }} disabled={busy} /></FormControl>{field.value === 'paused' && <p role="status" className="text-xs text-muted-foreground">Currently paused</p>}</>
            : definition.type === 'boolean' ? <FormControl><Switch checked={Boolean(field.value)} onCheckedChange={(checked) => {
            field.onChange(checked);
            if (resourceKey === 'settings' && definition.key === 'online_ordering_enabled' && checked) form.setValue('ordering_status', 'closed', { shouldDirty: true });
          }} disabled={busy} /></FormControl>
            : definition.type === 'groups' ? <ModifierGroupSelection groups={(references.modifier_groups ?? []).filter((group) => group.id !== row?.id)} selected={(field.value as string[]) ?? []} onChange={field.onChange} disabled={busy} />
            : definition.type === 'tags' ? <div className="flex flex-wrap gap-x-5 gap-y-3">{definition.options?.map((option) => <label key={option} className="flex items-center gap-2 text-sm"><Checkbox checked={(field.value as string[]).includes(option)} disabled={busy} onCheckedChange={(checked) => field.onChange(checked ? [...field.value as string[], option] : (field.value as string[]).filter((value) => value !== option))} />{choiceLabel(option)}</label>)}</div>
            : definition.type === 'image' ? <ImageUpload folder={definition.folder!} value={String(field.value ?? '')} onChange={field.onChange} onBusy={setUploading} />
            : definition.type === 'select' ? <Select value={String(field.value || (definition.nullable ? '__default' : ''))} onValueChange={(value) => {
              const next = value === '__default' ? '' : value;
              field.onChange(next);
              if (definition.key === 'group_type' && next === 'removal') {
                form.setValue('min_selections', 0, { shouldDirty: true });
                form.setValue('max_selections', 30, { shouldDirty: true });
                form.setValue('child_group_ids', [], { shouldDirty: true });
              }
              if (definition.key === 'service_mode' && next === 'walkup') form.setValue('pickup_enabled', false, { shouldDirty: true });
              if (resourceKey === 'settings' && definition.key === 'ordering_status' && next === 'open') form.setValue('online_ordering_enabled', false, { shouldDirty: true });
              if (definition.key === 'modifier_group_id' && references.modifier_groups?.some((group) => group.id === next && group.group_type === 'removal')) {
                form.setValue('linked_menu_item_id', '');
                form.setValue('pricing_mode', 'extra');
                form.setValue('linked_quantity', 1);
                form.setValue('allergens', []);
              }
              if (definition.key === 'item_kind' && next === 'group') form.setValue('price_pence', 0, { shouldDirty: true });
              if (definition.key === 'pricing_mode' && next === 'item') form.setValue('price_pence', 0, { shouldDirty: true });
              if (definition.key === 'linked_menu_item_id') {
                const linked = references.menu_items?.find((item) => item.id === next);
                if (linked) form.setValue('name', String(linked.name).slice(0, 100), { shouldDirty: true });
                else { form.setValue('pricing_mode', 'extra'); form.setValue('linked_quantity', 1); }
              }
            }} disabled={busy}><FormControl><SelectTrigger className="w-full min-w-0 [&>[data-slot=select-value]]:min-w-0 [&>[data-slot=select-value]]:flex-1 [&>[data-slot=select-value]]:overflow-hidden"><SelectValue placeholder="Select..." /></SelectTrigger></FormControl><SelectContent>{definition.nullable && <SelectItem value="__default">{definition.emptyLabel ?? 'Default Public Menu'}</SelectItem>}{definition.reference ? (references[definition.reference] ?? []).map((reference) => <SelectItem key={reference.id} value={reference.id!}>{String(reference.name ?? reference.title ?? reference.id)}{definition.key === 'linked_menu_item_id' ? ` (${String(reference.slug ?? '')})${reference.is_published ? '' : ' - Draft'}` : ''}</SelectItem>) : definition.options?.map((option) => <SelectItem key={option} value={option}>{definition.optionLabels?.[option] ?? choiceLabel(option)}</SelectItem>)}</SelectContent></Select>
            : definition.type === 'richtext' ? <FormControl><RichTextEditor value={String(field.value ?? '')} onChange={field.onChange} onBlur={field.onBlur} disabled={busy} label={definition.label} maxLength={definition.max} preset={definition.editor} /></FormControl>
            : definition.type === 'textarea' ? <FormControl><Textarea {...field} value={String(field.value ?? '')} rows={4} maxLength={definition.max} /></FormControl>
            : <FormControl><Input {...field} value={String(field.value ?? '')} onChange={(event) => {
              field.onChange(event);
              if (definition.key === 'slug') slugEdited.current = Boolean(event.target.value);
              if (definition.key === resource.label && !slugEdited.current && resource.fields.some((entry) => entry.key === 'slug')) form.setValue('slug', slugFromTitle(event.target.value), { shouldDirty: true });
            }} type={definition.type === 'datetime' ? 'datetime-local' : definition.type === 'date' ? 'date' : ['number', 'money'].includes(definition.type ?? '') ? 'number' : 'text'} step={definition.type === 'money' ? '0.01' : definition.type === 'number' ? '1' : undefined} min={definition.min} max={definition.max} maxLength={definition.max} /></FormControl>}
          <FormMessage />
          </>}
        </FormItem>} />)}
        {resourceKey === 'menu' && <section aria-labelledby="menu-modifier-groups" className="min-w-0 border-t pt-5 sm:col-span-2"><h3 id="menu-modifier-groups" className="mb-4 text-base font-semibold">Modifier Groups</h3><ModifierGroupSelection groups={references.modifier_groups ?? []} selected={groupIds} onChange={setGroupIds} disabled={busy} showNested /></section>}
        </fieldset>
        {error && <p role="alert" className="mt-6 text-sm text-destructive">{error}</p>}
      </div>
      <div data-admin-form-actions className="flex shrink-0 justify-end gap-3 border-t bg-background px-6 py-4"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? <LoaderCircle className="animate-spin" /> : <Save />}Save Changes</Button></div>
    </form></Form>
  </DialogContent></Dialog>;
}