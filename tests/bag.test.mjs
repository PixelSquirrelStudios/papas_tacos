import assert from 'node:assert/strict';
import test from 'node:test';
import { lineKey, mergeLine, parseBag, quoteLine } from '../src/lib/bag.ts';
import { choiceLabel, eventTime, pickupState, publicImageUrl } from '../src/lib/catalogue/format.ts';
import { displayOrder, sectionOrder } from '../src/lib/catalogue/ordering.ts';
import { descriptionHtml, descriptionText } from '../src/lib/catalogue/rich-text.ts';

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
  assert.equal(pickupState(event, null, now), 'Pickup orders closed');
  assert.equal(pickupState(event, { ordering_status: 'paused' }, now), 'Pickup orders paused');
  assert.equal(pickupState({ ...event, pickup_enabled: false }, { ordering_status: 'open' }, now), 'No pickup orders at this event');
  assert.equal(pickupState(event, { ordering_status: 'open' }, now), 'Pickup enabled for this event');
  assert.equal(pickupState({ ...event, orders_close_at: '2026-09-15T11:00:00Z' }, { ordering_status: 'open' }, now), 'Pickup orders ended');
  assert.equal(eventTime('2026-09-15T12:00:00Z'), '13:00');
  assert.equal(eventTime('2026-12-15T12:00:00Z'), '12:00');
});