import assert from 'node:assert/strict';
import test from 'node:test';
import { customerOrderQuery, orderPage, orderSummarySchema, orderDetailSchema, pickupWindow, pickupAddress } from '../src/lib/account/orders.ts';

const customer = '00000000-0000-0000-0000-000000000001';
const order = '00000000-0000-0000-0000-000000000002';
const summary = {
  id: order, order_number: 12, status: 'preparing', payment_method: 'cash', payment_status: 'unpaid', total_pence: 1000,
  created_at: '2026-06-01T10:00:00+00:00', pickup_starts_at: '2026-06-01T12:00:00+00:00', pickup_ends_at: '2026-06-01T12:15:00+00:00',
  pickup_location: { venue_name: 'Market', address_line_1: 'High Street', town: 'Town', postcode: 'AB1 2CD' },
};

test('every order query is customer scoped and selects only customer-facing fields', () => {
  for (const options of [{}, { page: 2, filter: 'active' }, { filter: 'past' }, { id: order }]) {
    const query = customerOrderQuery(customer, options);
    assert.equal(query.get('customer_id'), `eq.${customer}`);
    assert.ok(!query.get('select').includes('*'));
    assert.ok(!query.get('select').includes('payments('));
    assert.ok(!query.get('select').includes('changed_by'));
    assert.ok(!query.get('select').includes('checkout_key'));
  }
  const detail = customerOrderQuery(customer, { id: order });
  assert.equal(detail.get('id'), `eq.${order}`);
  assert.equal(detail.get('limit'), '1');
  assert.throws(() => customerOrderQuery('bad-id'));
  assert.throws(() => customerOrderQuery(customer, { id: 'bad-id' }));
});

test('order filters and pagination remain bounded and separate terminal states', () => {
  assert.equal(customerOrderQuery(customer, { page: 2 }).get('offset'), '10');
  assert.equal(customerOrderQuery(customer, { filter: 'past' }).get('status'), 'in.(collected,cancelled)');
  assert.equal(customerOrderQuery(customer, { filter: 'active' }).get('status'), 'in.(pending_payment,ordered,preparing,ready_for_pickup)');
  for (const value of [undefined, '0', '-1', '1.5', 'NaN', ['2'], 'Infinity']) assert.equal(orderPage(value), 1);
  assert.equal(orderPage('2'), 2);
  assert.equal(orderPage('100001'), 100000);
});

test('order snapshots validate amounts and format pickup in UK local time', () => {
  assert.deepEqual(orderSummarySchema.parse(summary), summary);
  assert.equal(orderSummarySchema.safeParse({ ...summary, total_pence: -1 }).success, false);
  assert.equal(orderSummarySchema.safeParse({ ...summary, status: 'unknown' }).success, false);
  const detail = orderDetailSchema.parse({ ...summary, customer_name: 'Customer', customer_phone: '07700900123', customer_note: '', subtotal_pence: 1000, service_fee_pence: 0, packaging_fee_pence: 0, cancellation_reason: null, reservation_expires_at: null, order_items: [{ id: order, item_name: 'Tacos', quantity: 1, line_total_pence: 1000, allergen_snapshot: ['milk'], order_item_modifiers: [{ id: customer, group_name: 'Filling', option_name: 'Chicken', unit_price_pence: 0 }] }], order_status_history: [{ id: customer, status: 'preparing', created_at: summary.created_at }] });
  assert.equal(detail.order_items[0].order_item_modifiers[0].option_name, 'Chicken');
  assert.equal(pickupWindow(summary), '1 Jun 2026, 13:00 - 13:15');
  assert.equal(pickupWindow({ ...summary, pickup_starts_at: '2026-12-01T12:00:00+00:00', pickup_ends_at: '2026-12-01T12:15:00+00:00' }), '1 Dec 2026, 12:00 - 12:15');
  assert.equal(pickupAddress(summary.pickup_location), 'Market, High Street, Town, AB1 2CD');
});