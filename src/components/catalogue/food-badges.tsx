import { CircleAlert, Egg, Fish, Leaf, Milk, MilkOff, Nut, UtensilsCrossed, Vegan, Wheat, WheatOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { choiceLabel } from '@/lib/catalogue/format';

const dietaryIcons = { vegetarian: Leaf, vegan: Vegan, 'gluten-free': WheatOff, 'dairy-free': MilkOff };
const allergenIcons = { milk: Milk, eggs: Egg, fish: Fish, peanuts: Nut, 'tree-nuts': Nut, 'cereals-containing-gluten': Wheat };
const badgeClass = 'max-w-full shrink whitespace-normal rounded-md px-2 py-1 text-left leading-snug [&>svg]:shrink-0';

export function FoodBadges({ category, dietary = [], allergens = [], grouped = false }: { category?: string; dietary?: string[]; allergens?: string[]; grouped?: boolean }) {
  const categoryBadge = category && <Badge variant="outline" className={`${badgeClass} bg-background/50`} aria-label={`Category: ${category}`}><UtensilsCrossed aria-hidden="true" />{category}</Badge>;
  const dietaryBadges = dietary.map((tag) => { const Icon = dietaryIcons[tag as keyof typeof dietaryIcons] ?? Leaf; return <Badge key={tag} variant="outline" className={`${badgeClass} border-turquoise/25 bg-turquoise/10 text-white`} aria-label={`Dietary: ${choiceLabel(tag)}`}><Icon className="text-turquoise" aria-hidden="true" />{choiceLabel(tag)}</Badge>; });
  const allergenBadges = allergens.map((allergen) => { const Icon = allergenIcons[allergen as keyof typeof allergenIcons] ?? CircleAlert; return <Badge key={allergen} variant="outline" className={`${badgeClass} border-primary/25 bg-primary/5 text-foreground`} aria-label={`Contains: ${choiceLabel(allergen)}`}><Icon className="text-primary" aria-hidden="true" />{choiceLabel(allergen)}</Badge>; });
  if (!grouped) return <div className="space-y-3">
    {category && <div className="flex flex-wrap gap-1.5">{categoryBadge}</div>}
    {dietary.length > 0 && <div><p className="mb-1.5 text-xs font-medium text-muted-foreground">Dietary Information</p><div className="flex flex-wrap gap-1.5">{dietaryBadges}</div></div>}
    {allergens.length > 0 && <div><p className="mb-1.5 text-xs font-medium text-muted-foreground">Contains</p><div className="flex flex-wrap gap-1.5">{allergenBadges}</div></div>}
  </div>;
  return <div className="flex flex-wrap items-start gap-x-6 gap-y-4 border-t border-border pt-4">
    {category && <div role="group" aria-label="Category" className="min-w-0 max-w-full"><p className="mb-1.5 text-xs font-medium text-muted-foreground">Category</p><div className="flex flex-wrap gap-1.5">{categoryBadge}</div></div>}
    {dietary.length > 0 && <div role="group" aria-label="Dietary" className="min-w-0 max-w-full basis-40 grow"><p className="mb-1.5 text-xs font-medium text-muted-foreground">Dietary Information</p><div className="flex flex-wrap gap-1.5">{dietaryBadges}</div></div>}
    {allergens.length > 0 && <div role="group" aria-label="Allergens" className="min-w-0 max-w-full basis-48 grow"><p className="mb-1.5 text-xs font-medium text-muted-foreground">Contains</p><div className="flex flex-wrap gap-1.5">{allergenBadges}</div></div>}
  </div>;
}