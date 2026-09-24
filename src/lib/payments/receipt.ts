import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { orderDate, pickupAddress, type CustomerOrder } from '../account/orders.ts';

export async function createReceipt(order: CustomerOrder, payment: { paidAt: string; refunded: number }) {
  const document = await PDFDocument.create();
  document.setTitle(`Papa's Tacos - Receipt ${order.order_number}`);
  document.setAuthor("Papa's Tacos");
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  let page = document.addPage([595, 842]);
  let position = 790;
  const safeText = (value: string) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7E]/g, '?');
  function text(value: string, size = 11, strong = false) {
    const font = strong ? bold : regular;
    let line = '';
    const draw = () => {
      if (position < 55) { page = document.addPage([595, 842]); position = 790; }
      page.drawText(line, { x: 48, y: position, size, font, color: rgb(0.12, 0.12, 0.12) });
      position -= size + 8;
      line = '';
    };
    for (const character of safeText(value)) {
      if (font.widthOfTextAtSize(line + character, size) > 495) draw();
      line += character;
    }
    draw();
  }
  const amount = (value: number) => `GBP ${(value / 100).toFixed(2)}`;
  text("PAPA'S TACOS", 24, true);
  text(`Payment Receipt #${order.order_number}`, 16, true);
  text(`Paid: ${orderDate(payment.paidAt)}`);
  text(`Customer: ${order.customer_name}`);
  text(`Payment: ${order.payment_method === 'card' ? 'Card via Stripe' : 'Cash'}`);
  text(`Order status: ${order.status.replaceAll('_', ' ')}`);
  position -= 12;
  for (const item of order.order_items) {
    text(`${item.quantity} x ${item.item_name} - ${amount(item.line_total_pence)}`, 11, true);
    for (const modifier of item.order_item_modifiers) text(`${modifier.group_name}: ${modifier.option_name} (+${amount(modifier.unit_price_pence)} each)`, 10);
  }
  position -= 12;
  text(`Subtotal: ${amount(order.subtotal_pence)}`);
  text(`Service fee: ${amount(order.service_fee_pence)}`);
  text(`Packaging: ${amount(order.packaging_fee_pence)}`);
  text(`Total paid: ${amount(order.total_pence)}`, 14, true);
  if (payment.refunded > 0) {
    text(`Refunded: ${amount(payment.refunded)}`);
    text(`Net payment: ${amount(order.total_pence - payment.refunded)}`, 12, true);
  }
  position -= 12;
  text(`Pickup: ${orderDate(order.pickup_starts_at)}`);
  text(pickupAddress(order.pickup_location));
  text('Payment receipt - not a VAT invoice.', 9);
  return document.save();
}