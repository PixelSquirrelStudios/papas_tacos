'use client';

import { ArrowDown, ArrowUp } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import type { AdminRow } from '@/lib/admin/resources';

export function ModifierGroupSelection({ groups, selected, onChange, disabled = false }: { groups: AdminRow[]; selected: string[]; onChange: (ids: string[]) => void; disabled?: boolean }) {
  function move(index: number, direction: number) {
    const next = [...selected];
    [next[index], next[index + direction]] = [next[index + direction], next[index]];
    onChange(next);
  }
  const ordered = [...selected.flatMap((id) => groups.filter((group) => group.id === id)), ...groups.filter((group) => !selected.includes(group.id!))];
  return <div className="space-y-3">
    {!ordered.length && <p className="text-sm text-muted-foreground">No modifier groups available.</p>}
    {ordered.map((group) => {
      const index = selected.indexOf(group.id!);
      return <div key={group.id} className="flex min-w-0 items-center gap-3 border-b pb-3">
        <label className="flex min-w-0 flex-1 items-center gap-3 text-sm"><Checkbox disabled={disabled || (index < 0 && selected.length >= 30)} checked={index >= 0} onCheckedChange={(checked) => onChange(checked ? [...selected, group.id!] : selected.filter((id) => id !== group.id))} /><span className="min-w-0 break-words">{String(group.name)}{group.is_published === false && <span className="ml-2 text-xs text-muted-foreground">{' '}Draft</span>}</span></label>
        {index >= 0 && <div className="flex shrink-0 gap-1"><Button type="button" variant="ghost" size="icon-sm" title="Move Group Up" aria-label={`Move ${group.name} up`} disabled={disabled || index === 0} onClick={() => move(index, -1)}><ArrowUp /></Button><Button type="button" variant="ghost" size="icon-sm" title="Move Group Down" aria-label={`Move ${group.name} down`} disabled={disabled || index === selected.length - 1} onClick={() => move(index, 1)}><ArrowDown /></Button></div>}
      </div>;
    })}
  </div>;
}