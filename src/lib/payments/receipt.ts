import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { orderDate, pickupAddress, pickupWindow, type CustomerOrder } from '../account/orders.ts';
import { groupOrderChoices } from '../account/order-breakdown.ts';

export type ReceiptContact = { email?: string | null; phone?: string | null; website?: string | null };

export async function createReceipt(order: CustomerOrder, payment: { paidAt: string; refunded: number }, contact: ReceiptContact = {}) {
  const document = await PDFDocument.create();
  document.setTitle(`Papa's Tacos - Receipt ${order.order_number}`);
  document.setAuthor("Papa's Tacos");
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const logo = await document.embedJpg(await readFile(join(process.cwd(), 'public/images/Papas Tacos Logo.jpg')));
  const ink = rgb(0.10, 0.12, 0.11);
  const muted = rgb(0.36, 0.39, 0.37);
  const rule = rgb(0.80, 0.83, 0.81);
  const green = rgb(0.03, 0.48, 0.33);
  const safeText = (value: string) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7E\u00a3]/g, '?');
  const amount = (value: number) => `GBP ${(value / 100).toFixed(2)}`;
  function lines(value: string, width: number, size = 10, strong = false) {
    const font = strong ? bold : regular;
    const result: string[] = [];
    let line = '';
    for (const word of safeText(value).split(' ')) {
      if (line && font.widthOfTextAtSize(`${line} ${word}`, size) > width) { result.push(line); line = ''; }
      for (const character of `${line ? ' ' : ''}${word}`) {
        if (font.widthOfTextAtSize(line + character, size) > width) { result.push(line); line = ''; }
        line += character;
      }
    }
    result.push(line);
    return result;
  }
  let page = document.addPage([595, 842]);
  let position = 705;
  function draw(value: string, x: number, y: number, size = 10, strong = false, color = ink) {
    page.drawText(safeText(value), { x, y, size, font: strong ? bold : regular, color });
  }
  function header() {
    const image = logo.scaleToFit(82, 82);
    page.drawImage(logo, { x: 48, y: 738, ...image });
    draw('PAYMENT RECEIPT', 150, 795, 11, true, green);
    draw(`Order #${order.order_number}`, 150, 766, 23, true);
    draw(`Paid ${orderDate(payment.paidAt)}`, 150, 745, 10, false, muted);
    page.drawLine({ start: { x: 48, y: 724 }, end: { x: 547, y: 724 }, thickness: 1, color: green });
  }
  header();
  function ensure(height: number) {
    if (position - height < 105) { page = document.addPage([595, 842]); position = 705; header(); }
  }
  function text(value: string, size = 10, strong = false) {
    for (const line of lines(value, 499, size, strong)) { ensure(size + 6); draw(line, 48, position, size, strong); position -= size + 6; }
  }
  function pair(label: string, value: string, strong = false, size = 10) {
    const wrapped = lines(label, 375, size, strong);
    ensure(wrapped.length * (size + 6));
    draw(value, 547 - (strong ? bold : regular).widthOfTextAtSize(safeText(value), size), position, size, strong);
    for (const line of wrapped) { draw(line, 48, position, size, strong); position -= size + 6; }
  }
  function divider() {
    ensure(16);
    page.drawLine({ start: { x: 48, y: position }, end: { x: 547, y: position }, thickness: 0.6, color: rule });
    position -= 16;
  }
  text(order.customer_name, 11, true);
  text(`Payment: ${order.payment_method === 'card' ? 'Card via Stripe' : 'Cash'}`);
  position -= 8;
  text('PICKUP', 9, true);
  text(pickupWindow(order));
  text(pickupAddress(order.pickup_location));
  position -= 8;
  divider();
  for (const item of order.order_items) {
    ensure(65);
    pair(item.item_name, amount(item.line_total_pence), true, 12);
    text(`Quantity: ${item.quantity}`, 9);
    for (const { title, groups } of groupOrderChoices(item.order_item_modifiers)) {
      ensure(50);
      position -= 8;
      text(title, 10, true);
      for (const { label, choices } of groups) {
        const labelLines = lines(label, 75, 9);
        const rows = choices.flatMap((choice) => lines(choice.option_name, 280, 10).map((name, index) => ({ name, price: index === 0 && choice.unit_price_pence > 0 ? `+${amount(choice.unit_price_pence)} each` : '' })));
        for (let index = 0; index < Math.max(rows.length, labelLines.length); index++) {
          ensure(18);
          draw(labelLines[index] ?? '', 60, position, 9, false, muted);
          draw(rows[index]?.name ?? '', 155, position);
          const price = rows[index]?.price;
          if (price) draw(price, 547 - regular.widthOfTextAtSize(price, 9), position, 9, false, muted);
          page.drawLine({ start: { x: 144, y: position + 12 }, end: { x: 144, y: position - 6 }, thickness: 0.7, color: rule });
          position -= 18;
        }
      }
    }
    position -= 12;
    divider();
  }
  ensure(130);
  pair('Subtotal:', amount(order.subtotal_pence));
  if (order.service_fee_pence > 0) pair('Service fee:', amount(order.service_fee_pence));
  if (order.packaging_fee_pence > 0) pair('Packaging:', amount(order.packaging_fee_pence));
  position -= 5;
  pair('Total paid:', amount(order.total_pence), true, 14);
  if (payment.refunded > 0) { pair('Refunded:', amount(payment.refunded)); pair('Net payment:', amount(order.total_pence - payment.refunded), true); }
  const pages = document.getPages();
  for (const [index, receiptPage] of pages.entries()) {
    page = receiptPage;
    page.drawLine({ start: { x: 48, y: 89 }, end: { x: 547, y: 89 }, thickness: 0.6, color: rule });
    draw("Papa's Tacos", 48, 73, 9, true);
    const contacts = [contact.email, contact.phone, contact.website].filter(Boolean).join('  |  ');
    for (const [lineIndex, line] of lines(contacts, 499, 8).slice(0, 3).entries()) draw(line, 48, 59 - lineIndex * 11, 8, false, muted);
    draw('Payment receipt - not a VAT invoice.', 48, 20, 8, false, muted);
    draw(`${index + 1} / ${pages.length}`, 515, 20, 8, false, muted);
  }
  return document.save();
}