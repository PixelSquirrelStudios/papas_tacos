import { z } from 'zod';
import type { CatalogueItem } from './catalogue/types';

export const bagSchema = z.object({ version: z.literal(1), lines: z.array(z.object({
  itemId: z.guid(), optionIds: z.array(z.guid()).max(100), quantity: z.number().int().min(1).max(99),
})).max(100) });
export type BagLine = z.infer<typeof bagSchema>['lines'][number];

export function lineKey(line: Pick<BagLine, 'itemId' | 'optionIds'>) {
  return `${line.itemId}:${[...line.optionIds].sort().join(',')}`;
}

export function parseBag(raw: string | null): BagLine[] {
  if (!raw || raw.length > 100000) return [];
  try {
    const result = bagSchema.safeParse(JSON.parse(raw));
    if (!result.success) return [];
    return result.data.lines.reduce<BagLine[]>((lines, line) => mergeLine(lines, line), []);
  } catch { return []; }
}

export function mergeLine(lines: BagLine[], incoming: BagLine): BagLine[] {
  const clean = { ...incoming, optionIds: [...new Set(incoming.optionIds)].sort() };
  const key = lineKey(clean);
  const existing = lines.find((line) => lineKey(line) === key);
  if (existing) return lines.map((line) => lineKey(line) === key ? { ...line, quantity: Math.min(99, line.quantity + clean.quantity) } : line);
  if (lines.length >= 100) return lines;
  return [...lines, clean];
}

export function quoteLine(line: BagLine, items: CatalogueItem[]) {
  const item = items.find((candidate) => candidate.id === line.itemId);
  if (!item) return { item: null, options: [], total: 0, issue: 'This item is no longer on the menu.' };
  const options = item.groups.flatMap((group) => group.options).filter((option) => line.optionIds.includes(option.id));
  let issue = item.is_available ? '' : 'This item is sold out.';
  if (options.length !== line.optionIds.length || options.some((option) => !option.is_available)) issue = 'One or more extras are unavailable. Please edit this item.';
  for (const group of item.groups) {
    const count = options.filter((option) => option.modifier_group_id === group.id).length;
    if (count < group.min_selections || count > group.max_selections) issue = `Please check your choices for ${group.name}.`;
  }
  if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 99) issue = 'Choose a quantity between 1 and 99.';
  const unitPrice = item.price_pence + options.reduce((total, option) => total + option.price_pence, 0);
  return { item, options, total: unitPrice * line.quantity, issue };
}

export function money(pence: number) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(pence / 100);
}