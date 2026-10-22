export const siteUpdateEvent = 'papas:site-updated';
export const siteUpdateStorageKey = 'papas-tacos:site-update';
export const catalogueUpdateEvent = 'papas:catalogue-refreshed';
export const catalogueRequestEvent = 'papas:catalogue-request';

export const publicUpdateTables = ['business_settings', 'events', 'pickup_slots', 'menu_categories', 'menu_items', 'menu_sets', 'menu_set_sections', 'menu_set_items', 'modifier_groups', 'modifier_options', 'menu_item_modifier_groups', 'testimonials'];
export const adminUpdateTables = ['orders', 'order_items', 'order_item_modifiers', 'payments', 'order_status_history', 'pickup_schedules', 'inventory_items', 'inventory_allocations', 'inventory_order_stock', 'inventory_movements'];

export function notifySiteUpdated() {
  window.dispatchEvent(new CustomEvent(siteUpdateEvent, { detail: { localSave: true } }));
  try { localStorage.setItem(siteUpdateStorageKey, crypto.randomUUID()); } catch {}
}