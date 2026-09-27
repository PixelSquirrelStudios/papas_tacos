import type { ModifierGroup } from './types';

export function expandModifierGroups(rootIds: string[], groups: ModifierGroup[]): ModifierGroup[] {
  const result: ModifierGroup[] = [];
  function visit(id: string, path: string[], names: string[]) {
    if (path.includes(id) || path.length >= 3 || result.length >= 100) throw new Error('Invalid modifier nesting');
    const group = groups.find((candidate) => candidate.id === id);
    if (!group) return;
    const nextPath = [...path, id];
    const key = nextPath.join('/');
    const nextNames = [...names, group.name];
    result.push({ ...group, id: key, parentId: path.length ? path.join('/') : undefined, depth: path.length, label: group.name, name: nextNames.join(' / '),
      options: group.options.map((option) => ({ ...option, id: path.length ? `${key}:${option.id}` : option.id, modifier_group_id: key })),
    });
    for (const child of group.child_group_ids ?? []) visit(child, nextPath, nextNames);
  }
  for (const id of rootIds) visit(id, [], []);
  return result;
}