import { money } from '../bag.ts';

export type SavedChoice = { group_name: string; option_name: string; unit_price_pence?: number };

export function groupOrderChoices<Choice extends SavedChoice>(modifiers: Choice[]) {
  const roots = new Map<string, Map<string, Choice[]>>();
  for (const modifier of modifiers) {
    const [root, ...children] = modifier.group_name.split(' / ');
    const label = children.join(' / ') || (/ filling$/i.test(root) ? 'Filling' : 'Choices');
    if (!roots.has(root)) roots.set(root, new Map());
    const groups = roots.get(root)!;
    groups.set(label, [...(groups.get(label) ?? []), modifier]);
  }
  return [...roots].sort(([first], [second]) => first.localeCompare(second, 'en', { numeric: true })).map(([root, groups]) => ({
    root, title: root.replace(/ filling$/i, ''),
    groups: [...groups].sort(([first], [second]) => Number(['Filling', 'Choices'].includes(second)) - Number(['Filling', 'Choices'].includes(first)))
      .map(([label, choices]) => ({ label, choices })),
  }));
}

export function orderChoicesText(modifiers: SavedChoice[], formatAmount = money) {
  return groupOrderChoices(modifiers).flatMap(({ title, groups }) => [title, ...groups.flatMap(({ label, choices }) =>
    choices.map((choice) => `  ${label}: ${choice.option_name}${(choice.unit_price_pence ?? 0) > 0 ? ` (+${formatAmount(choice.unit_price_pence!)} each)` : ''}`))]).join('\n');
}