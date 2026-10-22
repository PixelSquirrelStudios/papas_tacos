import assert from 'node:assert/strict';
import test from 'node:test';
import { menuCatalogue, menuSetInputSchema } from '../src/lib/catalogue/menu-sets.ts';
import { quoteLine } from '../src/lib/bag.ts';
import { build } from 'esbuild';
import path from 'node:path';

const id = (number) => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const defaultId = id(1), cinemaId = id(2), mainId = id(3), sweetId = id(4), tacoId = id(5), churroId = id(6);
const source = {
  available: true, categories: [{ id: id(7), name: 'Original Category', sort_order: 0 }],
  items: [
    { id: tacoId, category_id: id(7), name: 'Taco', price_pence: 850, sort_order: 0, is_available: true, groups: [] },
    { id: churroId, category_id: id(7), name: 'Churros', price_pence: 400, sort_order: 10, is_available: true, groups: [] },
  ],
  menuSets: {
    sets: [{ id: defaultId, name: 'Public', is_default: true }, { id: cinemaId, name: 'Cinema', is_default: false }],
    sections: [
      { id: id(8), menu_set_id: defaultId, title: 'Tacos', sort_order: 0 },
      { id: mainId, menu_set_id: cinemaId, title: 'THE MAIN EVENT', sort_order: 10 },
      { id: sweetId, menu_set_id: cinemaId, title: 'SOMETHING SWEET', sort_order: 0 },
    ],
    entries: [
      { menu_set_id: defaultId, section_id: id(8), menu_item_id: tacoId, sort_order: 0, price_pence: null },
      { menu_set_id: cinemaId, section_id: mainId, menu_item_id: tacoId, sort_order: 0, price_pence: 1000 },
      { menu_set_id: cinemaId, section_id: sweetId, menu_item_id: churroId, sort_order: 0, price_pence: 0 },
    ],
  },
};

test('menu sets use custom section ordering membership and prices without changing catalogue items', () => {
  const original = structuredClone(source);
  const publicMenu = menuCatalogue(source);
  assert.deepEqual(publicMenu.items.map((item) => item.id), [tacoId]);
  assert.equal(publicMenu.items[0].price_pence, 850);
  const cinema = menuCatalogue(source, cinemaId);
  assert.deepEqual(cinema.categories.map((section) => section.name), ['SOMETHING SWEET', 'THE MAIN EVENT']);
  assert.deepEqual(cinema.items.map((item) => item.id), [churroId, tacoId]);
  assert.equal(cinema.items[0].price_pence, 0);
  assert.equal(quoteLine({ itemId: tacoId, quantity: 2, optionIds: [] }, cinema.items).total, 2000);
  assert.ok(quoteLine({ itemId: churroId, quantity: 1, optionIds: [] }, publicMenu.items).issue);
  assert.equal(menuCatalogue(source, id(99)).available, false);
  assert.deepEqual(source, original);
});

test('menu sets retain sold-out status omit missing global items and use current base prices for blank overrides', () => {
  const changed = structuredClone(source);
  changed.items[0].is_available = false;
  changed.items[0].price_pence = 900;
  changed.items.splice(1);
  assert.equal(menuCatalogue(changed).items[0].price_pence, 900);
  assert.equal(menuCatalogue(changed, cinemaId).items.length, 1);
  assert.equal(menuCatalogue(changed, cinemaId).items[0].is_available, false);
});

test('menu-set saves reject duplicate items invalid prices blank headings and missing concurrency versions', () => {
  const valid = { id: null, updatedAt: null, name: 'Cinema', sections: [{ title: 'THE MAIN EVENT', items: [{ itemId: tacoId, pricePence: null }] }] };
  assert.equal(menuSetInputSchema.safeParse(valid).success, true);
  for (const override of [
    { name: ' ' }, { id: cinemaId }, { sections: [{ title: '', items: [] }] },
    { sections: [{ title: 'Main', items: [{ itemId: tacoId, pricePence: -1 }] }] },
    { sections: [{ title: 'Main', items: [{ itemId: tacoId, pricePence: 1.5 }] }] },
    { sections: [valid.sections[0], valid.sections[0]] },
  ]) assert.equal(menuSetInputSchema.safeParse({ ...valid, ...override }).success, false);
});

test('menu-set save action requires admin authorization validates inputs and preserves conflict errors', async () => {
  const state = { allowed: true, calls: [], conflict: false };
  globalThis.__menuSetAction = state;
  try {
    const bundle = await build({
      entryPoints: ['src/app/admin/menu-sets/actions.ts'], bundle: true, write: false, platform: 'node', format: 'esm',
      plugins: [{ name: 'menu-set-action', setup(builder) {
        builder.onResolve({ filter: /^(next\/cache|@\/lib\/auth\/session|@\/lib\/admin\/data)$/ }, (args) => ({ path: args.path, namespace: 'fixture' }));
        builder.onLoad({ filter: /.*/, namespace: 'fixture' }, (args) => ({ contents: args.path === 'next/cache' ? 'export function revalidatePath() {}'
          : args.path.endsWith('/session') ? 'export async function requireAdmin() { if (!globalThis.__menuSetAction.allowed) throw new Error("Admin access required"); }'
            : 'export function adminError(error) { return error.message; } export async function adminRequest(...args) { const state=globalThis.__menuSetAction; state.calls.push(args); if(state.conflict) throw new Error("Menu set changed; refresh before saving"); return [{id:"00000000-0000-4000-8000-000000000001"}]; }' }));
        builder.onResolve({ filter: /^@\// }, (args) => builder.resolve(path.resolve('src', args.path.slice(2)), { kind: args.kind, resolveDir: process.cwd() }));
      } }],
    });
    const { saveMenuSet } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
    const input = { id: null, updatedAt: null, name: 'Cinema', sections: [{ title: 'Main', items: [{ itemId: tacoId, pricePence: 1200 }] }] };
    state.allowed = false;
    await assert.rejects(saveMenuSet(input), /Admin access required/);
    assert.equal(state.calls.length, 0);
    state.allowed = true;
    assert.equal((await saveMenuSet({ ...input, name: '' })).ok, false);
    assert.equal(state.calls.length, 0);
    assert.equal((await saveMenuSet(input)).ok, true);
    assert.deepEqual(state.calls[0], ['rpc/admin_save_menu_set', {}, 'POST', { set_uuid: null, expected_version: null, set_name: 'Cinema', sections: input.sections }]);
    state.conflict = true;
    assert.match((await saveMenuSet(input)).error, /changed/);
  } finally { delete globalThis.__menuSetAction; }
});
