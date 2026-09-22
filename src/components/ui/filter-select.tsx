'use client';

import { useId } from 'react';
import Select from 'react-select';

type FilterOption = { value: string; label: string };

export function FilterSelect({ label, placeholder, options, value, onChange }: { label: string; placeholder: string; options: FilterOption[]; value: string[]; onChange: (values: string[]) => void }) {
  const id = useId();
  return <div className="min-w-0 basis-56 flex-1 text-sm">
    <Select<FilterOption, true>
      instanceId={id}
      classNamePrefix="filter-select"
      inputId={`${id}-input`}
      aria-label={label}
      isMulti
      isClearable
      closeMenuOnSelect={false}
      options={options}
      value={options.filter((option) => value.includes(option.value))}
      onChange={(selected) => onChange(selected.map((option) => option.value))}
      placeholder={placeholder}
      unstyled
      classNames={{
        control: () => 'h-11 min-h-11 cursor-pointer rounded-md border border-input bg-transparent px-2 dark:bg-input/30',
        valueContainer: () => 'gap-1 py-1',
        input: () => 'min-w-8 cursor-pointer text-foreground [&_input]:cursor-pointer!',
        placeholder: () => 'truncate text-muted-foreground',
        multiValue: () => 'min-w-0 rounded-sm border border-brand-yellow bg-brand-yellow text-primary-foreground',
        multiValueLabel: () => 'px-2 py-1',
        multiValueRemove: () => 'cursor-pointer rounded-r-sm border-l border-black/20 bg-black/20 px-1.5 hover:bg-black/30',
        indicatorsContainer: () => 'shrink-0 text-muted-foreground',
        clearIndicator: () => 'cursor-pointer p-1.5 hover:text-foreground',
        dropdownIndicator: () => 'cursor-pointer p-1.5 hover:text-foreground',
        menu: () => 'mt-1 overflow-hidden rounded-md border border-border bg-card shadow-lg',
        menuList: () => 'py-1',
        option: ({ isFocused }) => `cursor-pointer break-words px-3 py-2.5 ${isFocused ? 'bg-accent text-foreground' : 'text-foreground'}`,
        noOptionsMessage: () => 'px-3 py-3 text-muted-foreground',
      }}
      styles={{
        control: (base) => ({ ...base, cursor: 'pointer' }),
        valueContainer: (base) => ({ ...base, flexWrap: 'nowrap', overflowX: 'auto', overflowY: 'hidden', scrollbarWidth: 'none' }),
        multiValue: (base) => ({ ...base, flexShrink: 0, maxWidth: 'calc(100% - 12px)' }),
        multiValueRemove: (base) => ({ ...base, backgroundColor: 'rgba(0, 0, 0, 0.2)', ':hover': { backgroundColor: 'rgba(0, 0, 0, 0.3)' } }),
        input: (base) => ({ ...base, minWidth: 20 }),
        menu: (base) => ({ ...base, zIndex: 40 }),
      }}
    />
  </div>;
}