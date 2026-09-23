import { z } from 'zod';
import { aboutDefaults } from './about.ts';

const id = z.guid();
export const categorySchema = z.object({ id, name: z.string(), slug: z.string(), sort_order: z.number() });
export const itemSchema = z.object({
  id, category_id: id, name: z.string(), slug: z.string(), description: z.string(),
  price_pence: z.number().int().nonnegative(), image_path: z.string().nullable(), image_alt: z.string(),
  dietary_tags: z.array(z.string()), allergens: z.array(z.string()), allergen_note: z.string(),
  is_available: z.boolean(), is_featured: z.boolean(), sort_order: z.number(),
  is_crowd_favourite: z.boolean().default(false),
});
export const groupSchema = z.object({ id, name: z.string(), min_selections: z.number().int(), max_selections: z.number().int() });
export const optionSchema = z.object({ id, modifier_group_id: id, name: z.string(), price_pence: z.number().int().nonnegative(), allergens: z.array(z.string()), is_available: z.boolean(), sort_order: z.number() });
export const associationSchema = z.object({ menu_item_id: id, modifier_group_id: id, sort_order: z.number() });
export const settingsSchema = z.object({
  about_eyebrow: z.string().default(aboutDefaults.about_eyebrow),
  about_heading: z.string().default(aboutDefaults.about_heading),
  about_page_heading: z.string().default(aboutDefaults.about_page_heading),
  about_content: z.string().default(aboutDefaults.about_content),
  about_full_story: z.string().default(aboutDefaults.about_full_story),
  about_image_path: z.string().nullable().default(null),
  about_image_alt: z.string().default(aboutDefaults.about_image_alt),
  about_page_image_1_path: z.string().nullable().default(null),
  about_page_image_1_alt: z.string().default(aboutDefaults.about_page_image_1_alt),
  about_page_image_2_path: z.string().nullable().default(null),
  about_page_image_2_alt: z.string().default(aboutDefaults.about_page_image_2_alt),
  about_page_image_3_path: z.string().nullable().default(null),
  about_page_image_3_alt: z.string().default(aboutDefaults.about_page_image_3_alt),
  business_name: z.string(), ordering_status: z.enum(['open', 'paused', 'closed']), ordering_message: z.string().nullable(),
  service_fee_pence: z.number().int().nonnegative(), packaging_fee_pence: z.number().int().nonnegative(), minimum_order_pence: z.number().int().nonnegative(),
  contact_email: z.string().nullable(), contact_phone: z.string().nullable(), instagram_url: z.string().nullable(), facebook_url: z.string().nullable(),
});
export const eventSchema = z.object({
  sort_order: z.number().default(0),
  id, slug: z.string(), title: z.string(), description: z.string(), featured_image_path: z.string().nullable(), image_alt: z.string(),
  venue_name: z.string(), address_line_1: z.string(), address_line_2: z.string().nullable(), town: z.string(), postcode: z.string(), map_url: z.string().nullable(),
  starts_at: z.string().datetime({ offset: true }), ends_at: z.string().datetime({ offset: true }), pickup_enabled: z.boolean(),
  ordering_status: z.enum(['open', 'paused', 'closed']), ordering_message: z.string().nullable(), orders_open_at: z.string().nullable(), orders_close_at: z.string().nullable(),
});
export const testimonialSchema = z.object({ id, author_name: z.string(), body: z.string(), rating: z.number().nullable(), source_name: z.string().nullable(), source_url: z.string().nullable(), review_date: z.string().nullable(), is_featured: z.boolean(), sort_order: z.number(), image_path: z.string().nullable().default(null), image_alt: z.string().default('') });

export type Category = z.infer<typeof categorySchema>;
export type MenuItem = z.infer<typeof itemSchema>;
export type ModifierGroup = z.infer<typeof groupSchema> & { options: z.infer<typeof optionSchema>[] };
export type CatalogueItem = MenuItem & { groups: ModifierGroup[]; imageUrl: string | null };
export type Settings = z.infer<typeof settingsSchema>;
export type TruckEvent = z.infer<typeof eventSchema> & { imageUrl: string | null };
export type Testimonial = z.infer<typeof testimonialSchema> & { imageUrl: string | null };
export type Catalogue = { categories: Category[]; items: CatalogueItem[]; available: boolean };