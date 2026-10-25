import { z } from 'zod';
import { descriptionHtml } from '../catalogue/rich-text.ts';
import { aboutDefaults } from '../catalogue/about.ts';

export type Field = { key: string; label: string; type?: 'text' | 'textarea' | 'richtext' | 'number' | 'money' | 'boolean' | 'select' | 'tags' | 'groups' | 'image' | 'datetime' | 'date'; required?: boolean; max?: number; min?: number; options?: string[]; optionLabels?: Record<string, string>; reference?: string; nullable?: boolean; emptyLabel?: string; folder?: 'menu' | 'events' | 'testimonials' | 'about'; editor?: 'basic' | 'full'; initial?: string | number | boolean; layout?: 'full' | 'row-start' };
export type Resource = { title: string; singular: string; table: string; label: string; order: string; fields: Field[]; sortable?: boolean; scope?: string; singleton?: boolean };
export type AdminRow = Record<string, unknown> & { id?: string; updated_at?: string };
const text = (key: string, label: string, max = 160, required = false): Field => ({ key, label, max, required });
const flag = (key: string, label: string, initial = false): Field => ({ key, label, type: 'boolean', initial });
const number = (key: string, label: string, max: number, initial = 0, min = 0): Field => ({ key, label, type: 'number', max, min, initial });
const money = (key: string, label: string, max = 1000): Field => ({ key, label: `${label} (GBP)`, type: 'money', min: 0, max, initial: 0 });
const reference = (key: string, label: string, table: string): Field => ({ key, label, type: 'select', reference: table, required: true });
const published = flag('is_published', 'Published');
const featured = flag('is_featured', 'Featured');
const description: Field = { key: 'description', label: 'Description', type: 'textarea', max: 10000 };
const slug = text('slug', 'URL Slug', 160, true);
const ordering: Field = { key: 'ordering_status', label: 'Ordering', type: 'select', options: ['closed', 'paused', 'open'], initial: 'closed' };
const message: Field = { key: 'ordering_message', label: 'Ordering Message', nullable: true, max: 300 };
const image = (key: string, folder: Field['folder']): Field => ({ key, label: 'Image', type: 'image', folder, nullable: true });
const datetime = (key: string, label: string, nullable = false): Field => ({ key, label: `${label} (Europe/London)`, type: 'datetime', nullable, required: !nullable });
const full = (field: Field): Field => ({ ...field, layout: 'full' });
const rowStart = (field: Field): Field => ({ ...field, layout: 'row-start' });
export const allergens = ['celery', 'cereals-containing-gluten', 'crustaceans', 'eggs', 'fish', 'lupin', 'milk', 'molluscs', 'mustard', 'peanuts', 'sesame', 'soya', 'sulphur-dioxide-sulphites', 'tree-nuts'];
const allergenField: Field = { key: 'allergens', label: 'Confirmed Allergens', type: 'tags', options: allergens };
const menuKindFields: Field[] = [
  full({ key: 'item_kind', label: 'Menu Item Kind', type: 'select', options: ['product', 'group'], optionLabels: { product: 'Product / Meal (Can Have Its Own Stock)', group: 'Grouped Listing (Stock Comes from Linked Choices)' }, initial: 'product' }),
  full(flag('show_standalone', 'Show as a Standalone Menu Item', true)),
];
const linkedOptionFields: Field[] = [
  full({ key: 'linked_menu_item_id', label: 'Linked Menu Item', type: 'select', reference: 'menu_items', nullable: true, emptyLabel: 'Standard Modifier (No Linked Product)' }),
  full({ key: 'pricing_mode', label: 'Choice Pricing', type: 'select', options: ['extra', 'item'], optionLabels: { extra: 'Included / Fixed Surcharge', item: "Use Linked Item's Price" }, initial: 'extra' }),
  full(number('linked_quantity', 'Units of Linked Item per Choice', 99, 1, 1)),
];

export const resources: Record<string, Resource> = {
  menu: { title: 'Menu Items', singular: 'Menu Item', table: 'menu_items', label: 'name', order: 'sort_order.asc,id.asc', sortable: true, scope: 'category_id', fields: [text('name', 'Name', 120, true), slug, ...menuKindFields, reference('category_id', 'Category', 'menu_categories'), money('price_pence', 'Price'), { ...description, type: 'richtext' }, image('image_path', 'menu'), full(text('image_alt', 'Image Description', 300)), { key: 'dietary_tags', label: 'Confirmed Dietary Labels', type: 'tags', options: ['vegetarian', 'vegan', 'gluten-free', 'dairy-free'] }, allergenField, { key: 'allergen_note', label: 'Allergen Note', type: 'textarea', max: 3000 }, published, flag('is_available', 'Available', true), flag('is_featured', "Papa's Choice"), flag('is_crowd_favourite', 'Crowd Favourites')] },
  categories: { title: 'Categories', singular: 'Category', table: 'menu_categories', label: 'name', order: 'sort_order.asc,id.asc', sortable: true, fields: [text('name', 'Name', 80, true), slug, description, published] },
  modifiers: { title: 'Modifier Groups', singular: 'Modifier Group', table: 'modifier_groups', label: 'name', order: 'sort_order.asc,id.asc', sortable: true, fields: [full(text('name', 'Name', 100, true)), full({ key: 'group_type', label: 'Group Type', type: 'select', options: ['standard', 'removal'], optionLabels: { standard: 'Standard Choices', removal: 'Removals and Other Options' }, initial: 'standard' }), rowStart(number('min_selections', 'Minimum Choices', 30)), number('max_selections', 'Maximum Choices', 30, 1, 1), { key: 'child_group_ids', label: 'Nested Modifier Groups', type: 'groups', reference: 'modifier_groups' }, published] },
  options: { title: 'Modifier Options', singular: 'Modifier Option', table: 'modifier_options', label: 'name', order: 'sort_order.asc,id.asc', sortable: true, scope: 'modifier_group_id', fields: [reference('modifier_group_id', 'Modifier Group', 'modifier_groups'), ...linkedOptionFields, text('name', 'Name', 100, true), { ...description, type: 'richtext' }, image('image_path', 'menu'), full(text('image_alt', 'Image Description', 300)), { ...money('price_pence', 'Extra Cost'), initial: '' }, flag('is_available', 'Available', true), allergenField] },
  events: { title: 'Events', singular: 'Event', table: 'events', label: 'title', order: 'sort_order.asc,starts_at.asc,id.asc', sortable: true, fields: [text('title', 'Title', 160, true), slug, { ...description, type: 'richtext' }, rowStart(datetime('starts_at', 'Event Starts')), datetime('ends_at', 'Event Ends'), image('featured_image_path', 'events'), full(text('image_alt', 'Image Description', 300)), full(text('venue_name', 'Venue', 160, true)), text('address_line_1', 'Address', 300, true), { ...text('address_line_2', 'Address Line 2', 300), nullable: true }, rowStart(text('town', 'Town', 100, true)), text('postcode', 'Postcode', 20, true), full({ ...text('map_url', 'Map URL', 2000), nullable: true }), full(published), full({ key: 'menu_set_id', label: 'Menu Set', type: 'select', reference: 'menu_sets', nullable: true }), full({ key: 'service_mode', label: 'Service Type', type: 'select', options: ['pickup', 'table', 'car'], initial: 'pickup' }), full(flag('is_private', 'Private Ordering (Event QR Code Required)')), rowStart(flag('pickup_enabled', 'Event Ordering Enabled')), ordering, full(message), rowStart(datetime('orders_open_at', 'Orders Open (Blank Uses Event Start)', true)), datetime('orders_close_at', 'Orders Close (Blank Uses Event End)', true)] },
  slots: { title: 'Pickup Slots', singular: 'Pickup Schedule', table: 'pickup_schedules', label: 'starts_at', order: 'starts_at.asc,id.asc', fields: [full(reference('event_id', 'Event', 'events')), rowStart(datetime('starts_at', 'Pickup Starts')), datetime('ends_at', 'Pickup Ends'), full(number('preparation_minutes', 'Preparation Time (Minutes)', 1440, 20, 1))] },
  testimonials: { title: 'Testimonials', singular: 'Testimonial', table: 'testimonials', label: 'author_name', order: 'sort_order.asc,id.asc', sortable: true, fields: [full(text('author_name', 'Customer Name', 100, true)), { key: 'body', label: 'Review', type: 'textarea', max: 3000, required: true }, { ...number('rating', 'Rating', 5, 5, 1), nullable: true }, { key: 'review_date', label: 'Review Date', type: 'date', nullable: true }, rowStart({ ...text('source_name', 'Source', 160), nullable: true }), { ...text('source_url', 'Source URL', 2000), nullable: true }, image('image_path', 'testimonials'), full(text('image_alt', 'Image Description', 300)), published, featured] },
  settings: { title: 'Site Settings', singular: 'Settings', table: 'business_settings', label: 'business_name', order: 'singleton.asc', singleton: true, fields: [full(text('business_name', 'Business Name', 160, true)), ordering, flag('maintenance_enabled', 'Maintenance Mode'), full(flag('public_menu_enabled', 'Show Public Menu', true)), full(message), rowStart(flag('cash_enabled', 'Cash Payments', true)), flag('card_enabled', 'Card Payments'), rowStart(money('service_fee_pence', 'Service Fee', 100)), money('packaging_fee_pence', 'Packaging Fee', 100), full(money('minimum_order_pence', 'Minimum Order')), rowStart({ ...text('contact_email', 'Contact Email', 254), nullable: true }), { ...text('contact_phone', 'Contact Phone', 40), nullable: true }, rowStart({ ...text('instagram_url', 'Instagram URL', 2000), nullable: true }), { ...text('facebook_url', 'Facebook URL', 2000), nullable: true },
    { ...full(text('about_eyebrow', 'About Eyebrow', 100, true)), initial: aboutDefaults.about_eyebrow },
    { ...text('about_heading', 'About Heading', 160, true), initial: aboutDefaults.about_heading },
    { ...text('about_page_heading', 'About Page Heading', 160, true), initial: aboutDefaults.about_page_heading },
    { key: 'about_content', label: 'About Content', type: 'textarea', max: 10000, required: true, initial: aboutDefaults.about_content },
    { key: 'about_full_story', label: 'About Full Story', type: 'richtext', editor: 'full', max: 20000, required: true, initial: aboutDefaults.about_full_story },
    { ...image('about_image_path', 'about'), label: 'About Featured Image' },
    { ...text('about_image_alt', 'About Image Description', 300, true), initial: aboutDefaults.about_image_alt },
    { ...image('about_page_image_1_path', 'about'), label: 'About Page Story Image 1' },
    { ...text('about_page_image_1_alt', 'About Page Story Image 1 Description', 300, true), initial: aboutDefaults.about_page_image_1_alt },
    { ...image('about_page_image_2_path', 'about'), label: 'About Page Story Image 2' },
    { ...text('about_page_image_2_alt', 'About Page Story Image 2 Description', 300, true), initial: aboutDefaults.about_page_image_2_alt },
    { ...image('about_page_image_3_path', 'about'), label: 'About Page Story Image 3' },
    { ...text('about_page_image_3_alt', 'About Page Story Image 3 Description', 300, true), initial: aboutDefaults.about_page_image_3_alt },
  ] },
};

export function getResource(key: string): Resource | undefined {
  return Object.hasOwn(resources, key) ? resources[key] : undefined;
}

export function resourceSchema(resource: Resource) {
  const shape: Record<string, z.ZodType> = {};
  for (const field of resource.fields) {
    let schema: z.ZodType;
    if (field.type === 'richtext') schema = z.string().max(field.max ?? 10000).transform(descriptionHtml).pipe(z.string().max(field.max ?? 10000));
    else if (field.type === 'boolean') schema = z.boolean();
    else if (field.type === 'number' || field.type === 'money') {
      const base = z.number().finite().min(field.min ?? 0).max(field.max ?? 100000);
      schema = field.type === 'money' ? base.refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 0.00001, 'Use at most two decimal places').transform((value) => Math.round(value * 100)) : base.int();
    } else if (field.type === 'tags') schema = z.array(z.string().refine((value) => field.options!.includes(value), 'Unknown option')).max(field.options!.length).transform((values) => [...new Set(values)]);
    else if (field.type === 'groups') schema = z.array(z.guid()).max(30).refine((ids) => new Set(ids).size === ids.length, 'Select each group once').default([]);
    else if (field.reference) schema = z.guid();
    else if (field.options) schema = z.string().refine((value) => field.options!.includes(value), 'Select a valid option');
    else if (field.type === 'datetime') schema = z.iso.datetime({ offset: true });
    else if (field.type === 'date') schema = z.iso.date();
    else {
      let value = z.string().trim().max(field.max ?? 2000);
      if (field.required) value = value.min(1, 'Required');
      if (field.key === 'slug') value = value.regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Use lowercase words separated by hyphens');
      schema = value;
      if (field.key.endsWith('_url')) schema = value.refine((input) => { try { const url = new URL(input); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; } }, 'Enter a HTTPS URL');
      if (field.key === 'contact_email') schema = z.email().max(254);
      if (field.type === 'image') schema = value.refine((input) => /^(images\/)?(menu|events|testimonials|about)\/[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp|avif)$/.test(input) || /^https:\/\/images\.unsplash\.com\/photo-[a-zA-Z0-9-]+(?:\?[^\s]*)?$/.test(input), 'Choose an uploaded image or supported stock photo');
    }
    const fieldSchema = field.nullable ? schema.nullable() : schema;
    shape[field.key] = ['item_kind', 'show_standalone', 'pricing_mode', 'linked_quantity', 'group_type'].includes(field.key) ? fieldSchema.default(field.initial) : field.key === 'linked_menu_item_id' ? fieldSchema.default(null) : fieldSchema;
  }
  return z.object(shape).strict().superRefine((value, context) => {
    if (value.group_type === 'removal') {
      if (value.min_selections !== 0) context.addIssue({ code: 'custom', path: ['min_selections'], message: 'Removals must be optional.' });
      if (value.max_selections !== 30) context.addIssue({ code: 'custom', path: ['max_selections'], message: 'Removals must allow all ingredients (maximum 30).' });
      if (Array.isArray(value.child_group_ids) && value.child_group_ids.length) context.addIssue({ code: 'custom', path: ['child_group_ids'], message: 'Removal groups cannot be nested.' });
    }
    if (value.item_kind === 'group' && value.price_pence !== 0) context.addIssue({ code: 'custom', path: ['price_pence'], message: 'Grouped listings have no base charge. Set their price to 0; use linked choice prices.' });
    if (value.pricing_mode === 'item' && (!value.linked_menu_item_id || value.price_pence !== 0)) context.addIssue({ code: 'custom', path: ['price_pence'], message: "Choose a linked item and set the surcharge to 0 when using its price." });
    if ('linked_menu_item_id' in value && !value.linked_menu_item_id && value.linked_quantity !== 1) context.addIssue({ code: 'custom', path: ['linked_quantity'], message: 'Standard modifiers must use quantity 1.' });
    if (typeof value.min_selections === 'number' && typeof value.max_selections === 'number' && value.min_selections > value.max_selections) context.addIssue({ code: 'custom', path: ['min_selections'], message: 'Minimum cannot exceed maximum' });
    if (typeof value.starts_at === 'string' && typeof value.ends_at === 'string' && Date.parse(value.ends_at) <= Date.parse(value.starts_at)) context.addIssue({ code: 'custom', path: ['ends_at'], message: 'End must be after start' });
    const open = value.orders_open_at || value.starts_at;
    const close = value.orders_close_at || value.ends_at;
    if (typeof open === 'string' && typeof close === 'string' && Date.parse(open) >= Date.parse(close)) context.addIssue({ code: 'custom', path: ['orders_open_at'], message: 'Orders must open before closing' });
  });
}