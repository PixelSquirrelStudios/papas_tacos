import assert from 'node:assert/strict';
import test from 'node:test';
import { lineKey, mergeLine, parseBag, quoteLine } from '../src/lib/bag.ts';
import { canOrder, choiceLabel, eventOrderingNotice, eventTime, pickupState, publicImageUrl } from '../src/lib/catalogue/format.ts';
import { displayOrder, sectionOrder } from '../src/lib/catalogue/ordering.ts';
import { descriptionHtml, descriptionText } from '../src/lib/catalogue/rich-text.ts';
import { expandModifierGroups } from '../src/lib/catalogue/modifiers.ts';
import { applyStock, bagStockIssue, heldQuantity, inventoryActionSchema, publicStockSchema, maximumLineQuantity } from '../src/lib/inventory.ts';
import { resolveLinkedItems, minimumItemPrice } from '../src/lib/catalogue/linked-items.ts';
import { menuCatalogue } from '../src/lib/catalogue/menu-sets.ts';

test('removals preserve price, portion demand, allergens and distinct editable bag lines', () => {
  const item = { id: 'nachos', name: 'Nachos', price_pence: 850, is_available: true, allergens: ['milk'], stock_quantity: 10,
    groups: [{ id: 'remove', name: 'Nachos removals', group_type: 'removal', min_selections: 0, max_selections: 30,
      options: ['No Cheese', 'Extra Onions'].map((name, index) => ({ id: `ingredient-${index}`, modifier_group_id: 'remove', name, price_pence: 0, allergens: [], is_available: true })) }] };
  const regular = { itemId: item.id, optionIds: [], quantity: 1 };
  const customised = { ...regular, optionIds: ['ingredient-0', 'ingredient-1'], quantity: 2 };
  assert.equal(quoteLine(regular, [item]).total, 850);
  const quote = quoteLine(customised, [item]);
  assert.equal(quote.total, 1700);
  assert.equal(quote.issue, '');
  assert.deepEqual(item.allergens, ['milk']);
  assert.deepEqual(quote.options.map(option => option.name), ['No Cheese', 'Extra Onions']);
  assert.equal(mergeLine([regular], customised).length, 2);
  assert.equal(mergeLine([customised], { ...customised, optionIds: [...customised.optionIds].reverse() })[0].quantity, 4);
  const catalogue = { items: [item], available: true, categories: [] };
  assert.equal(maximumLineQuantity(customised, [regular], catalogue), 9);
  item.groups[0].options[0].is_available = false;
  assert.match(quoteLine(customised, [item]).issue, /unavailable/);
  assert.match(quoteLine({ ...regular, optionIds: ['removed-id'] }, [item]).issue, /unavailable/);
});

function linkedCatalogue() {
  const product = { id: 'fanta', name: 'Fanta Orange', price_pence: 200, is_available: true, show_standalone: false, item_kind: 'product', description: 'Orange drink', image_path: 'fanta.jpg', image_alt: 'Fanta', imageUrl: '/fanta.jpg', allergens: ['milk'], groups: [] };
  const parent = { id: 'pop', name: 'Cans of Pop', price_pence: 0, is_available: true, item_kind: 'group', groups: [{
    id: 'drinks', name: 'Choose a drink', min_selections: 1, max_selections: 1,
    options: [{ id: 'choice', name: 'Old label', price_pence: 0, is_available: true, allergens: [], linked_menu_item_id: 'fanta', linked_quantity: 1, pricing_mode: 'item' }],
  }] };
  return { available: true, categories: [], items: [parent, product] };
}

test('linked product choices inherit canonical details and price without creating duplicate menu cards', () => {
  const raw = linkedCatalogue();
  const items = resolveLinkedItems(raw.items);
  const option = items[0].groups[0].options[0];
  assert.equal(option.name, 'Fanta Orange');
  assert.equal(option.description, 'Orange drink');
  assert.equal(option.imageUrl, '/fanta.jpg');
  assert.deepEqual(option.allergens, ['milk']);
  assert.equal(option.price_pence, 200);
  const menu = menuCatalogue({ ...raw, items });
  assert.deepEqual(menu.items.map((item) => item.id), ['pop']);
  assert.equal(menu.stockItems.length, 2);
  assert.equal(minimumItemPrice(menu.items[0]), 200);
  assert.equal(quoteLine({ itemId: 'pop', optionIds: ['choice'], quantity: 2 }, menu.items).total, 400);
  assert.equal(raw.items[0].groups[0].options[0].name, 'Old label');
});

test('linked pricing supports included fixed surcharges and per-unit product pricing', () => {
  const raw = linkedCatalogue();
  const choice = raw.items[0].groups[0].options[0];
  choice.linked_quantity = 2;
  assert.equal(resolveLinkedItems(raw.items)[0].groups[0].options[0].price_pence, 400);
  choice.pricing_mode = 'extra';
  choice.price_pence = 50;
  assert.equal(resolveLinkedItems(raw.items)[0].groups[0].options[0].price_pence, 50);
  choice.price_pence = 0;
  assert.equal(resolveLinkedItems(raw.items)[0].groups[0].options[0].price_pence, 0);
});

test('shared product demand combines standalone sales, multiple parents and repeated group paths', () => {
  const raw = linkedCatalogue();
  raw.items[1].show_standalone = true;
  const meal = structuredClone(raw.items[0]);
  Object.assign(meal, { id: 'meal', name: 'Meal', item_kind: 'product', price_pence: 800 });
  meal.groups[0].options[0].id = 'meal-drink';
  const catalogue = applyStock({ ...raw, items: resolveLinkedItems([...raw.items, meal]) }, [
    { menu_item_id: 'pop', tracking_mode: 'none', available_quantity: null },
    { menu_item_id: 'meal', tracking_mode: 'event', available_quantity: 10 },
    { menu_item_id: 'fanta', tracking_mode: 'global', available_quantity: 3 },
  ]);
  const lines = [
    { itemId: 'fanta', optionIds: [], quantity: 1 },
    { itemId: 'pop', optionIds: ['choice'], quantity: 1 },
    { itemId: 'meal', optionIds: ['meal-drink'], quantity: 2 },
  ];
  assert.match(bagStockIssue(lines, catalogue), /Fanta Orange: only 3/);
  assert.equal(maximumLineQuantity(lines[2], lines.slice(0, 2), catalogue), 1);
  assert.equal(bagStockIssue([...lines.slice(0, 2), { ...lines[2], quantity: 1 }], catalogue), '');
});

test('linked sold-out choices and unavailable required groups prevent ordering while unrelated products remain available', () => {
  const raw = linkedCatalogue();
  const menu = applyStock({ ...raw, items: resolveLinkedItems(raw.items) }, [
    { menu_item_id: 'pop', tracking_mode: 'none', available_quantity: null },
    { menu_item_id: 'fanta', tracking_mode: 'global', available_quantity: 0 },
  ]);
  assert.equal(menu.items[0].groups[0].options[0].is_available, false);
  assert.equal(menu.items[0].is_available, false);
  const missing = resolveLinkedItems([raw.items[0]]);
  assert.equal(missing[0].groups[0].options[0].is_available, false);
  raw.items[1].groups = [{ id: 'extras', options: [] }];
  assert.equal(resolveLinkedItems(raw.items)[0].groups[0].options[0].is_available, false);
});

test('stock availability preserves manual controls and fails closed for missing item records', () => {
  const catalogue = { available: true, categories: [], items: [
    { id: 'one', name: 'Sweets', is_available: true },
    { id: 'two', name: 'Coke', is_available: false },
    { id: 'three', name: 'Tacos', is_available: true },
    { id: 'four', name: 'Missing', is_available: true },
  ] };
  const applied = applyStock(catalogue, [
    { menu_item_id: 'one', tracking_mode: 'global', available_quantity: 0 },
    { menu_item_id: 'two', tracking_mode: 'none', available_quantity: null },
    { menu_item_id: 'three', tracking_mode: 'event', available_quantity: 8 },
  ]);
  assert.deepEqual(applied.items.map((item) => item.is_available), [false, false, true, false]);
  assert.deepEqual(applied.items.map((item) => item.stock_quantity), [0, null, 8, null]);
  assert.equal(catalogue.items[0].is_available, true);
});

test('bag stock checks aggregate different modifier choices of the same menu item', () => {
  const catalogue = { available: true, categories: [], items: [{ id: 'taco', name: 'Tacos', stock_quantity: 3 }] };
  const lines = [{ itemId: 'taco', optionIds: ['chicken'], quantity: 2 }, { itemId: 'taco', optionIds: ['beef'], quantity: 2 }];
  assert.match(bagStockIssue(lines, catalogue), /only 3.*across your choices/);
  assert.equal(bagStockIssue([{ ...lines[0], quantity: 1 }, lines[1]], catalogue), '');
  assert.equal(bagStockIssue(lines, { ...catalogue, items: [{ ...catalogue.items[0], stock_quantity: null }] }), '');
});

test('checkout hold totals exclude expired, sold and unrelated event quantities', () => {
  const now = Date.parse('2026-10-22T12:00:00Z');
  const held = { menu_item_id: 'taco', event_id: 'market', quantity: 2, state: 'held', expires_at: '2026-10-22T12:01:00Z' };
  const rows = [held, { ...held, expires_at: '2026-10-22T12:00:00Z' }, { ...held, state: 'sold' }, { ...held, event_id: 'cinema' }];
  assert.equal(heldQuantity(rows, 'taco', 'market', now), 2);
  assert.equal(heldQuantity(rows, 'taco', undefined, now), 4);
});

test('stock payloads reject negative, fractional, oversized or unaudited admin changes', () => {
  const id = '00000000-0000-4000-8000-000000000001';
  const input = { itemId: id, eventId: null, action: 'receive', quantity: 40, expectedVersion: 0, reason: 'Opening stock', trackingMode: null, unitLabel: null, requestId: id };
  assert.equal(inventoryActionSchema.safeParse(input).success, true);
  for (const quantity of [-1, 1.5, 1000001, NaN, Infinity]) assert.equal(inventoryActionSchema.safeParse({ ...input, quantity }).success, false);
  assert.equal(inventoryActionSchema.safeParse({ ...input, reason: '  ' }).success, false);
  assert.equal(inventoryActionSchema.safeParse({ ...input, expectedVersion: -1 }).success, false);
  assert.equal(publicStockSchema.safeParse([{ menu_item_id: id, tracking_mode: 'global', available_quantity: -1 }]).success, false);
});

test('menu descriptions preserve paragraphs and formatting while stripping unsafe HTML', () => {
  assert.equal(descriptionHtml('Fresh & spicy\nWith salsa\n\nMade daily.'), '<p>Fresh &amp; spicy<br />With salsa</p><p>Made daily.</p>');
  assert.equal(descriptionHtml(''), '');
  const formatted = '<p><strong>Fresh</strong> tacos with <em>salsa</em>.</p><p><u>Choose</u> a filling.</p><ul><li>Beans</li></ul>';
  assert.equal(descriptionHtml(formatted), formatted);
  assert.equal(descriptionText(formatted), 'Fresh tacos with salsa. Choose a filling. Beans');
  assert.equal(descriptionText('<p>Fresh &amp; <strong>spicy</strong></p><p>Made daily</p>'), 'Fresh & spicy Made daily');
  for (const unsafe of ['<script>alert(1)</script>', '<img src=x onerror=alert(1)>', '<svg onload=alert(1)></svg>', '<iframe src="https://evil.example"></iframe>', '<style>body{display:none}</style>']) {
    assert.equal(descriptionHtml(`<p>Safe</p>${unsafe}`), '<p>Safe</p>');
  }
  assert.equal(descriptionHtml('<p onclick="alert(1)" style="color:red">Safe</p><a href="javascript:alert(1)">Link</a>'), '<p>Safe</p><a>Link</a>');
  assert.equal(descriptionHtml('<a href="https://example.com" title="Menu">Link</a>'), '<a href="https://example.com" title="Menu">Link</a>');
  assert.equal(descriptionHtml('<h2>Our Story</h2><h3>Street Food</h3><blockquote>Made fresh.</blockquote>'), '<h2>Our Story</h2><h3>Street Food</h3><blockquote>Made fresh.</blockquote>');
  assert.equal(descriptionText('<h2>Our Story</h2><p>Made fresh.</p>'), 'Our Story Made fresh.');
  assert.equal(descriptionHtml(descriptionHtml('Original\n\nParagraph')), descriptionHtml('Original\n\nParagraph'));
});

test('combined menu follows category order before item order without interleaving', () => {
  const categories = [{ id: 'desserts', sort_order: 20 }, { id: 'tacos', sort_order: 10 }];
  const items = [
    { id: 'churros', category_id: 'desserts', sort_order: 0 },
    { id: 'beef', category_id: 'tacos', sort_order: 20 },
    { id: 'ice-cream', category_id: 'desserts', sort_order: 10 },
    { id: 'chicken', category_id: 'tacos', sort_order: 10 },
  ];
  const sorted = sectionOrder(items, categories, (item) => item.category_id);
  assert.deepEqual(sorted.map((item) => item.id), ['chicken', 'beef', 'churros', 'ice-cream']);
  assert.deepEqual(sectionOrder(items, [...categories].reverse(), (item) => item.category_id), sorted);
  assert.deepEqual(sectionOrder(items, [{ ...categories[0], sort_order: 0 }, categories[1]], (item) => item.category_id).map((item) => item.id), ['churros', 'ice-cream', 'chicken', 'beef']);
  assert.equal(items[0].id, 'churros');
  assert.deepEqual(displayOrder(categories).map((category) => category.id), ['tacos', 'desserts']);
});

const itemId = '00000000-0000-4000-8000-000000000001';
const optionId = '00000000-0000-4000-8000-000000000002';
const groupId = '00000000-0000-4000-8000-000000000003';
const item = { id: itemId, price_pence: 850, is_available: true, groups: [{ id: groupId, name: 'Salsa', min_selections: 1, max_selections: 1, options: [{ id: optionId, modifier_group_id: groupId, price_pence: 150, is_available: true }] }] };
const line = { itemId, optionIds: [optionId], quantity: 2 };

test('event ordering notices distinguish opening, closure, pauses and QR access without allowing orders', () => {
  const opens = Date.parse('2030-09-25T16:00:00Z');
  const closes = Date.parse('2030-09-25T22:00:00Z');
  const settings = { ordering_status: 'open' };
  for (const service_mode of ['car', 'table', 'pickup']) {
    const event = { service_mode, pickup_enabled: true, ordering_status: 'open', starts_at: '2030-09-25T17:00:00Z', ends_at: '2030-09-25T21:00:00Z', orders_open_at: new Date(opens).toISOString(), orders_close_at: new Date(closes).toISOString(), is_private: true, ordering_access: true };
    const early = eventOrderingNotice(event, settings, opens - 1);
    assert.equal(early.title, 'Orders Open Later');
    assert.match(early.message, /17:00 on Wed, 25 September 2030/);
    assert.equal(canOrder([event], settings, opens - 1), false);
    assert.equal(eventOrderingNotice(event, settings, opens), null);
    assert.equal(eventOrderingNotice(event, settings, closes - 1), null);
    assert.equal(eventOrderingNotice(event, settings, closes).title, 'Orders Closed');
    assert.match(eventOrderingNotice(event, settings, closes).message, /already ordered/);
    assert.equal(canOrder([event], settings, closes), false);
    for (const status of ['paused', 'closed']) {
      const expected = status === 'paused' ? 'Orders Paused' : 'Orders Closed';
      assert.equal(eventOrderingNotice({ ...event, ordering_status: status }, settings, opens).title, expected);
      assert.equal(eventOrderingNotice(event, { ordering_status: status }, opens).title, expected);
    }
    assert.equal(eventOrderingNotice({ ...event, ordering_access: false }, settings, opens).title, 'Scan Event QR to Order');
    assert.equal(eventOrderingNotice(event, null, opens).title, 'Ordering Unavailable');
    assert.equal(eventOrderingNotice({ ...event, pickup_enabled: false }, settings, opens).title, 'Ordering Unavailable');
  }
});

test('ordering requires an open business and an active published event ordering window', () => {
  const now = Date.parse('2026-09-23T12:00:00Z');
  const event = { pickup_enabled: true, ordering_status: 'open', starts_at: '2026-09-23T11:00:00Z', ends_at: '2026-09-23T18:00:00Z', orders_open_at: null, orders_close_at: null };
  assert.equal(canOrder([event], { ordering_status: 'open' }, now), true);
  for (const settings of [null, { ordering_status: 'closed' }, { ordering_status: 'paused' }]) assert.equal(canOrder([event], settings, now), false);
  assert.equal(canOrder([], { ordering_status: 'open' }, now), false);
  for (const override of [{ pickup_enabled: false }, { ordering_status: 'closed' }, { ordering_status: 'paused' }, { starts_at: '2026-09-24T11:00:00Z' }, { ends_at: '2026-09-23T12:00:00Z' }, { orders_open_at: '2026-09-23T13:00:00Z' }, { orders_close_at: '2026-09-23T12:00:00Z' }, { starts_at: 'invalid' }]) {
    assert.equal(canOrder([{ ...event, ...override }], { ordering_status: 'open' }, now), false);
  }
  assert.equal(canOrder([{ ...event, starts_at: '2026-09-24T11:00:00Z', ends_at: '2026-09-24T18:00:00Z', orders_open_at: '2026-09-23T10:00:00Z' }], { ordering_status: 'open' }, now), true);
  assert.equal(canOrder([{ ...event, is_private: true }], { ordering_status: 'open' }, now), false);
  assert.equal(canOrder([{ ...event, is_private: true, ordering_access: false }], { ordering_status: 'open' }, now), false);
  assert.equal(canOrder([{ ...event, is_private: true, ordering_access: true }], { ordering_status: 'open' }, now), true);
  const early = { ...event, starts_at: '2026-09-23T13:00:00Z', orders_open_at: '2026-09-23T11:00:00Z' };
  const late = { ...event, ends_at: '2026-09-23T11:30:00Z', orders_close_at: '2026-09-23T13:00:00Z' };
  assert.equal(canOrder([early], { ordering_status: 'open' }, now), true);
  assert.equal(canOrder([late], { ordering_status: 'open' }, now), true);
  assert.equal(canOrder([late], { ordering_status: 'open' }, Date.parse(late.orders_close_at)), false);
  assert.equal(canOrder([{ ...event, orders_close_at: '2026-09-23T11:30:00Z' }], { ordering_status: 'open' }, now), false);
});

test('ordering status is independent of maintenance access and still respects event gates', () => {
  const now = Date.parse('2026-09-26T12:00:00Z');
  const settings = { ordering_status: 'open', maintenance_enabled: true };
  const event = { pickup_enabled: true, ordering_status: 'open', starts_at: '2026-09-26T09:00:00Z', ends_at: '2026-09-26T18:00:00Z', orders_open_at: null, orders_close_at: null };
  assert.equal(canOrder([event], settings, now), true);
  assert.equal(pickupState(event, settings, now), 'Pickup Enabled for This Event');
  for (const ordering_status of ['closed', 'paused']) {
    assert.equal(canOrder([event], { ...settings, ordering_status }, now), false);
    assert.equal(canOrder([{ ...event, ordering_status }], settings, now), false);
  }
  assert.equal(canOrder([{ ...event, orders_close_at: '2026-09-25T16:00:00Z' }], settings, now), false);
  assert.equal(canOrder([{ ...event, pickup_enabled: false }], settings, now), false);
  assert.equal(canOrder([], settings, now), false);
  assert.equal(canOrder([event], null, now), false);
});

test('service ordering explains exactly when orders open without overriding closed or paused controls', () => {
  const now = Date.parse('2030-09-25T15:00:00Z');
  const event = { service_mode: 'car', pickup_enabled: true, ordering_status: 'open', starts_at: '2030-09-25T17:00:00Z', ends_at: '2030-09-25T21:00:00Z', orders_open_at: '2030-09-25T16:00:00Z', orders_close_at: null };
  assert.equal(pickupState(event, { ordering_status: 'open' }, now), 'Ordering is not open yet. You can place car delivery orders from 17:00 on Wed, 25 September 2030.');
  assert.equal(pickupState({ ...event, service_mode: 'table' }, { ordering_status: 'open' }, now), 'Ordering is not open yet. You can place table delivery orders from 17:00 on Wed, 25 September 2030.');
  assert.equal(pickupState(event, { ordering_status: 'closed' }, now), 'Car Service Orders Closed');
  assert.equal(pickupState(event, { ordering_status: 'paused' }, now), 'Car Service Orders Paused');
});

test('nested groups keep reused options independent, priced and required per path', () => {
  const second = '00000000-0000-4000-8000-000000000004';
  const sauce = '00000000-0000-4000-8000-000000000005';
  const groups = expandModifierGroups([groupId, second], [
    { id: groupId, name: 'Part One', min_selections: 0, max_selections: 1, options: [], child_group_ids: [sauce] },
    { id: second, name: 'Part Two', min_selections: 0, max_selections: 1, options: [], child_group_ids: [sauce] },
    { id: sauce, name: 'Sauces', min_selections: 1, max_selections: 2, options: [{ id: optionId, modifier_group_id: sauce, name: 'Hot', price_pence: 100, is_available: true }] },
  ]);
  assert.deepEqual(groups.map((group) => group.name), ['Part One', 'Part One / Sauces', 'Part Two', 'Part Two / Sauces']);
  const selections = [groups[1].options[0].id, groups[3].options[0].id];
  assert.notEqual(...selections);
  const nestedLine = { itemId, optionIds: selections, quantity: 2 };
  assert.equal(quoteLine(nestedLine, [{ ...item, groups }]).total, 2100);
  assert.equal(quoteLine(nestedLine, [{ ...item, groups }]).issue, '');
  assert.match(quoteLine({ ...nestedLine, optionIds: selections.slice(0, 1) }, [{ ...item, groups }]).issue, /Part Two/);
  assert.deepEqual(parseBag(JSON.stringify({ version: 1, lines: [nestedLine] }))[0].optionIds, [...selections].sort());
  assert.notEqual(lineKey({ ...nestedLine, optionIds: selections.slice(0, 1) }), lineKey({ ...nestedLine, optionIds: selections.slice(1) }));
  assert.throws(() => expandModifierGroups([groupId], [{ id: groupId, options: [], child_group_ids: [groupId] }]), /nesting/);
});

test('saved bags accommodate bounded nested identifiers without silently losing valid lines', () => {
  const optionIds = Array.from({ length: 100 }, () => `${groupId}/${crypto.randomUUID()}/${crypto.randomUUID()}:${crypto.randomUUID()}`);
  const lines = Array.from({ length: 100 }, () => ({ itemId: crypto.randomUUID(), optionIds, quantity: 1 }));
  const raw = JSON.stringify({ version: 1, lines });
  assert.ok(raw.length > 100000);
  assert.equal(parseBag(raw).length, 100);
  assert.deepEqual(parseBag(' '.repeat(1600001)), []);
});

test('dietary and allergen display labels are capitalized without changing stored values', () => {
  const values = ['gluten-free', 'dairy-free', 'cereals-containing-gluten', 'tree-nuts', 'milk', 'sulphur-dioxide-sulphites'];
  assert.deepEqual(values.map(choiceLabel), ['Gluten Free', 'Dairy Free', 'Cereals Containing Gluten', 'Tree Nuts', 'Milk', 'Sulphur Dioxide Sulphites']);
  assert.equal(values[0], 'gluten-free');
});

test('catalogue images allow storage paths and trusted HTTPS stock photos only', () => {
  const origin = 'https://project.supabase.co';
  const photo = 'https://images.unsplash.com/photo-1551504734-5ee1c4a1479b?auto=format&fit=crop&w=1000&q=80';
  assert.equal(publicImageUrl(photo, null), photo);
  assert.equal(publicImageUrl('menu/tacos.webp', origin), `${origin}/storage/v1/object/public/public-media/menu/tacos.webp`);
  assert.equal(publicImageUrl('images/menu/tacos.webp', origin), `${origin}/storage/v1/object/public/images/menu/tacos.webp`);
  assert.equal(publicImageUrl('menu/tacos.webp', null), null);
  for (const path of [null, '', '../menu/taco.jpg', '/menu/taco.jpg', '//evil.example/taco.jpg', 'menu/taco.svg', 'javascript:alert(1)', 'data:image/png;base64,abc', 'http://images.unsplash.com/photo-123', 'https://images.unsplash.com.evil.example/photo-123', 'https://user:password@images.unsplash.com/photo-123', 'https://images.unsplash.com:444/photo-123', 'https://images.unsplash.com/other-path', 'https://other.example/taco.jpg']) {
    assert.equal(publicImageUrl(path, origin), null, String(path));
  }
});

test('bag validates persisted data and caps merged quantities', () => {
  for (const raw of ['{', '{}', JSON.stringify({ version: 2, lines: [] }), JSON.stringify({ version: 1, lines: [{ ...line, quantity: -1 }] })]) assert.deepEqual(parseBag(raw), []);
  assert.deepEqual(parseBag(JSON.stringify({ version: 1, lines: [line] })), [line]);
  assert.equal(mergeLine([{ ...line, quantity: 98 }], line)[0].quantity, 99);
  assert.equal(mergeLine([line], { ...line, optionIds: [] }).length, 2);
  assert.equal(lineKey(line), lineKey({ ...line, optionIds: [...line.optionIds].reverse() }));
});

test('bag uses current prices and validates required or removed extras', () => {
  assert.equal(quoteLine(line, [item]).total, 2000);
  assert.equal(quoteLine(line, [{ ...item, price_pence: 950 }]).total, 2200);
  assert.match(quoteLine({ ...line, optionIds: [] }, [item]).issue, /Salsa/);
  assert.match(quoteLine(line, []).issue, /no longer/);
  assert.match(quoteLine(line, [{ ...item, is_available: false }]).issue, /sold out/);
  assert.match(quoteLine(line, [{ ...item, groups: [] }]).issue, /unavailable/);
});

test('event pickup messages follow global and event switches and London daylight saving', () => {
  const now = Date.parse('2026-09-15T12:00:00Z');
  const event = { pickup_enabled: true, ordering_status: 'open', ends_at: '2026-09-15T18:00:00Z', orders_open_at: null, orders_close_at: null };
  assert.equal(pickupState(event, null, now), 'Pickup Orders Closed');
  assert.equal(pickupState(event, { ordering_status: 'paused' }, now), 'Pickup Orders Paused');
  assert.equal(pickupState({ ...event, pickup_enabled: false }, { ordering_status: 'open' }, now), 'No Pickup Orders at This Event');
  assert.equal(pickupState(event, { ordering_status: 'open' }, now), 'Pickup Enabled for This Event');
  assert.equal(pickupState({ ...event, orders_close_at: '2026-09-15T11:00:00Z' }, { ordering_status: 'open' }, now), 'Pickup Orders Ended');
  assert.equal(eventTime('2026-09-15T12:00:00Z'), '13:00');
  assert.equal(eventTime('2026-12-15T12:00:00Z'), '12:00');
});