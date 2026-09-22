type OrderedRow = { id?: string; sort_order?: unknown };

function compareOrder(first: OrderedRow, second: OrderedRow) {
  return Number(first.sort_order ?? 0) - Number(second.sort_order ?? 0) || String(first.id ?? '').localeCompare(String(second.id ?? ''));
}

export function displayOrder<Row extends OrderedRow>(rows: Row[]): Row[] {
  return [...rows].sort(compareOrder);
}

export function sectionOrder<Row extends OrderedRow>(rows: Row[], sections: OrderedRow[], sectionId: (row: Row) => unknown): Row[] {
  const positions = new Map(displayOrder(sections).map((section, index) => [section.id, index]));
  return [...rows].sort((first, second) => {
    const firstSection = String(sectionId(first));
    const secondSection = String(sectionId(second));
    return (positions.get(firstSection) ?? sections.length) - (positions.get(secondSection) ?? sections.length)
      || firstSection.localeCompare(secondSection) || compareOrder(first, second);
  });
}