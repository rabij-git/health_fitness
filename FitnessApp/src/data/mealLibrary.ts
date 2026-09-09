import type { MealItem, MealSlot } from '../lib/supabase';
import type { MealTarget } from '../lib/nutritionCalc';

export type MealType = 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack';

// Nested, not exclusive tags: a vegan meal also satisfies vegetarian/
// pescatarian/omnivore eaters, a vegetarian meal also satisfies pescatarian/
// omnivore, etc. Each template is tagged with the single most restrictive
// diet it qualifies for; DIET_RANK below expands that into "is this template
// eligible for a trainee on diet X" at generation time.
export type Diet = 'vegan' | 'vegetarian' | 'pescatarian' | 'omnivore';

const DIET_RANK: Record<Diet, number> = { vegan: 0, vegetarian: 1, pescatarian: 2, omnivore: 3 };

export function satisfiesDiet(templateDiet: Diet, requestedDiet: Diet): boolean {
  return DIET_RANK[templateDiet] <= DIET_RANK[requestedDiet];
}

// Curated meal suggestions the generator scales to fit a slot's calorie
// target — legitimate static app content (same status as mockMedals in
// mockData.ts), not fabricated user/trainee data. Nutrition figures are
// reasonable real-world estimates for the listed ingredients/quantities.
export interface MealTemplate {
  id: string;
  mealType: MealType;
  diet: Diet;
  name: string;
  baseCalories: number;
  baseProtein: number;
  baseCarbs: number;
  baseFat: number;
  baseItems: MealItem[];
}

export const mealTemplates: MealTemplate[] = [
  {
    id: 'b1',
    mealType: 'Breakfast',
    diet: 'vegetarian',
    name: 'Greek Yogurt Power Bowl',
    baseCalories: 480,
    baseProtein: 38,
    baseCarbs: 52,
    baseFat: 14,
    baseItems: [
      { food: 'Greek yogurt, plain', qty: '250g' },
      { food: 'Blueberries', qty: '100g' },
      { food: 'Almonds', qty: '20g' },
      { food: 'Honey', qty: '15g' },
    ],
  },
  {
    id: 'b2',
    mealType: 'Breakfast',
    diet: 'vegetarian',
    name: 'Veggie Egg Scramble & Toast',
    baseCalories: 450,
    baseProtein: 30,
    baseCarbs: 38,
    baseFat: 19,
    baseItems: [
      { food: 'Whole eggs', qty: '3' },
      { food: 'Spinach', qty: '50g' },
      { food: 'Bell pepper', qty: '50g' },
      { food: 'Whole-grain toast', qty: '60g' },
    ],
  },
  {
    id: 'b3',
    mealType: 'Breakfast',
    diet: 'vegetarian',
    name: 'Protein Oats',
    baseCalories: 420,
    baseProtein: 32,
    baseCarbs: 55,
    baseFat: 9,
    baseItems: [
      { food: 'Rolled oats', qty: '70g' },
      { food: 'Whey protein', qty: '1 scoop' },
      { food: 'Banana', qty: '1' },
      { food: 'Peanut butter', qty: '10g' },
    ],
  },
  {
    id: 'b4',
    mealType: 'Breakfast',
    diet: 'vegan',
    name: 'Tofu Scramble & Avocado Toast',
    baseCalories: 410,
    baseProtein: 24,
    baseCarbs: 37,
    baseFat: 20,
    baseItems: [
      { food: 'Firm tofu', qty: '200g' },
      { food: 'Avocado', qty: '60g' },
      { food: 'Whole-grain toast', qty: '60g' },
      { food: 'Cherry tomatoes', qty: '50g' },
    ],
  },
  {
    id: 'b5',
    mealType: 'Breakfast',
    diet: 'vegan',
    name: 'Overnight Chia Oats',
    baseCalories: 400,
    baseProtein: 11,
    baseCarbs: 64,
    baseFat: 11,
    baseItems: [
      { food: 'Rolled oats', qty: '60g' },
      { food: 'Chia seeds', qty: '15g' },
      { food: 'Almond milk, unsweetened', qty: '200ml' },
      { food: 'Mixed berries', qty: '80g' },
      { food: 'Maple syrup', qty: '15g' },
    ],
  },
  {
    id: 'l1',
    mealType: 'Lunch',
    diet: 'omnivore',
    name: 'Grilled Chicken & Rice Bowl',
    baseCalories: 620,
    baseProtein: 48,
    baseCarbs: 65,
    baseFat: 16,
    baseItems: [
      { food: 'Chicken breast', qty: '180g' },
      { food: 'Jasmine rice, cooked', qty: '200g' },
      { food: 'Broccoli', qty: '100g' },
      { food: 'Olive oil', qty: '10g' },
    ],
  },
  {
    id: 'l2',
    mealType: 'Lunch',
    diet: 'omnivore',
    name: 'Turkey & Quinoa Salad',
    baseCalories: 560,
    baseProtein: 42,
    baseCarbs: 50,
    baseFat: 18,
    baseItems: [
      { food: 'Ground turkey', qty: '150g' },
      { food: 'Quinoa, cooked', qty: '150g' },
      { food: 'Mixed greens', qty: '80g' },
      { food: 'Avocado', qty: '50g' },
    ],
  },
  {
    id: 'l3',
    mealType: 'Lunch',
    diet: 'pescatarian',
    name: 'Tuna & Sweet Potato',
    baseCalories: 540,
    baseProtein: 45,
    baseCarbs: 55,
    baseFat: 12,
    baseItems: [
      { food: 'Tuna, canned in water', qty: '160g' },
      { food: 'Sweet potato', qty: '250g' },
      { food: 'Green beans', qty: '100g' },
    ],
  },
  {
    id: 'l4',
    mealType: 'Lunch',
    diet: 'vegan',
    name: 'Chickpea & Quinoa Buddha Bowl',
    baseCalories: 580,
    baseProtein: 25,
    baseCarbs: 81,
    baseFat: 18,
    baseItems: [
      { food: 'Chickpeas, cooked', qty: '150g' },
      { food: 'Quinoa, cooked', qty: '150g' },
      { food: 'Kale', qty: '60g' },
      { food: 'Tahini', qty: '20g' },
    ],
  },
  {
    id: 'l5',
    mealType: 'Lunch',
    diet: 'vegan',
    name: 'Lentil & Veggie Stir-Fry',
    baseCalories: 525,
    baseProtein: 26,
    baseCarbs: 85,
    baseFat: 11,
    baseItems: [
      { food: 'Lentils, cooked', qty: '200g' },
      { food: 'Brown rice, cooked', qty: '150g' },
      { food: 'Mixed stir-fry vegetables', qty: '150g' },
      { food: 'Soy sauce', qty: '15ml' },
      { food: 'Sesame oil', qty: '8g' },
    ],
  },
  {
    id: 'l6',
    mealType: 'Lunch',
    diet: 'vegetarian',
    name: 'Caprese Quinoa Bowl',
    baseCalories: 500,
    baseProtein: 23,
    baseCarbs: 38,
    baseFat: 29,
    baseItems: [
      { food: 'Fresh mozzarella', qty: '80g' },
      { food: 'Quinoa, cooked', qty: '150g' },
      { food: 'Tomato', qty: '100g' },
      { food: 'Basil & olive oil', qty: '10g' },
    ],
  },
  {
    id: 'd1',
    mealType: 'Dinner',
    diet: 'pescatarian',
    name: 'Salmon & Roasted Vegetables',
    baseCalories: 600,
    baseProtein: 44,
    baseCarbs: 42,
    baseFat: 26,
    baseItems: [
      { food: 'Salmon fillet', qty: '180g' },
      { food: 'Zucchini', qty: '100g' },
      { food: 'Carrots', qty: '100g' },
      { food: 'Olive oil', qty: '10g' },
    ],
  },
  {
    id: 'd2',
    mealType: 'Dinner',
    diet: 'omnivore',
    name: 'Lean Beef Stir-Fry',
    baseCalories: 640,
    baseProtein: 46,
    baseCarbs: 58,
    baseFat: 22,
    baseItems: [
      { food: 'Lean beef strips', qty: '170g' },
      { food: 'Brown rice, cooked', qty: '180g' },
      { food: 'Mixed stir-fry vegetables', qty: '150g' },
      { food: 'Soy sauce', qty: '15ml' },
    ],
  },
  {
    id: 'd3',
    mealType: 'Dinner',
    diet: 'pescatarian',
    name: 'Baked Cod & Quinoa',
    baseCalories: 520,
    baseProtein: 42,
    baseCarbs: 48,
    baseFat: 14,
    baseItems: [
      { food: 'Cod fillet', qty: '200g' },
      { food: 'Quinoa, cooked', qty: '150g' },
      { food: 'Asparagus', qty: '100g' },
    ],
  },
  {
    id: 'd4',
    mealType: 'Dinner',
    diet: 'vegan',
    name: 'Black Bean & Sweet Potato Bowl',
    baseCalories: 630,
    baseProtein: 24,
    baseCarbs: 115,
    baseFat: 9,
    baseItems: [
      { food: 'Black beans, cooked', qty: '200g' },
      { food: 'Sweet potato', qty: '200g' },
      { food: 'Brown rice, cooked', qty: '100g' },
      { food: 'Avocado', qty: '50g' },
    ],
  },
  {
    id: 'd5',
    mealType: 'Dinner',
    diet: 'vegan',
    name: 'Tofu & Broccoli Stir-Fry',
    baseCalories: 490,
    baseProtein: 25,
    baseCarbs: 57,
    baseFat: 20,
    baseItems: [
      { food: 'Firm tofu', qty: '200g' },
      { food: 'Broccoli', qty: '150g' },
      { food: 'Brown rice, cooked', qty: '180g' },
      { food: 'Soy sauce & sesame oil', qty: '15ml' },
    ],
  },
  {
    id: 'd6',
    mealType: 'Dinner',
    diet: 'vegetarian',
    name: 'Three-Bean Chili with Cheddar',
    baseCalories: 620,
    baseProtein: 36,
    baseCarbs: 87,
    baseFat: 16,
    baseItems: [
      { food: 'Kidney beans, cooked', qty: '150g' },
      { food: 'Black beans, cooked', qty: '150g' },
      { food: 'Cheddar cheese, shredded', qty: '40g' },
      { food: 'Brown rice, cooked', qty: '100g' },
    ],
  },
  {
    id: 's1',
    mealType: 'Snack',
    diet: 'vegetarian',
    name: 'Cottage Cheese & Fruit',
    baseCalories: 220,
    baseProtein: 22,
    baseCarbs: 20,
    baseFat: 6,
    baseItems: [
      { food: 'Cottage cheese', qty: '200g' },
      { food: 'Pineapple', qty: '100g' },
    ],
  },
  {
    id: 's2',
    mealType: 'Snack',
    diet: 'vegetarian',
    name: 'Protein Shake & Almonds',
    baseCalories: 260,
    baseProtein: 26,
    baseCarbs: 14,
    baseFat: 12,
    baseItems: [
      { food: 'Whey protein', qty: '1 scoop' },
      { food: 'Almonds', qty: '20g' },
      { food: 'Water or milk', qty: '300ml' },
    ],
  },
  {
    id: 's3',
    mealType: 'Snack',
    diet: 'vegan',
    name: 'Apple & Peanut Butter',
    baseCalories: 240,
    baseProtein: 8,
    baseCarbs: 30,
    baseFat: 12,
    baseItems: [
      { food: 'Apple', qty: '1' },
      { food: 'Peanut butter', qty: '20g' },
    ],
  },
  {
    id: 's4',
    mealType: 'Snack',
    diet: 'vegan',
    name: 'Hummus & Veggie Sticks',
    baseCalories: 205,
    baseProtein: 9,
    baseCarbs: 23,
    baseFat: 10,
    baseItems: [
      { food: 'Hummus', qty: '100g' },
      { food: 'Carrot sticks', qty: '80g' },
      { food: 'Cucumber', qty: '80g' },
    ],
  },
  {
    id: 's5',
    mealType: 'Snack',
    diet: 'vegan',
    name: 'Edamame & Rice Cakes',
    baseCalories: 240,
    baseProtein: 18,
    baseCarbs: 29,
    baseFat: 7,
    baseItems: [
      { food: 'Edamame, shelled', qty: '150g' },
      { food: 'Rice cakes', qty: '2' },
      { food: 'Sea salt', qty: 'to taste' },
    ],
  },
];

// Only scales numeric gram/ml quantities — whole-item counts ("1 egg",
// "1 scoop") stay fixed since they can't be fractionally scaled sensibly.
function scaleItem(item: MealItem, factor: number): MealItem {
  const match = item.qty.match(/^(\d+(?:\.\d+)?)(g|ml)$/);
  if (!match) return item;
  const scaled = Math.max(1, Math.round(parseFloat(match[1]) * factor));
  return { food: item.food, qty: `${scaled}${match[2]}` };
}

export function templatesForMealType(mealType: MealType, diet: Diet = 'omnivore'): MealTemplate[] {
  return mealTemplates.filter((t) => t.mealType === mealType && satisfiesDiet(t.diet, diet));
}

// Picks the template whose macro ratio (excluding the currently shown one,
// for "Regenerate") is closest to the slot's target ratio, then scales its
// calories/macros/items to the target.
export function generateMealForSlot(
  target: MealTarget,
  mealType: MealType,
  diet: Diet = 'omnivore',
  excludeId?: string
): MealSlot {
  const pool = templatesForMealType(mealType, diet).filter((t) => t.id !== excludeId);
  const candidates = pool.length > 0 ? pool : templatesForMealType(mealType, diet);

  const targetProteinRatio = target.target_protein / Math.max(1, target.target_calories);
  const best = candidates.reduce((closest, t) => {
    const tRatio = t.baseProtein / t.baseCalories;
    const closestRatio = closest.baseProtein / closest.baseCalories;
    return Math.abs(tRatio - targetProteinRatio) < Math.abs(closestRatio - targetProteinRatio)
      ? t
      : closest;
  }, candidates[0]);

  const factor = target.target_calories / best.baseCalories;

  return {
    slot: target.slot,
    label: mealType,
    target_calories: target.target_calories,
    target_protein: target.target_protein,
    target_carbs: target.target_carbs,
    target_fat: target.target_fat,
    name: best.name,
    items: best.baseItems.map((i) => scaleItem(i, factor)),
    actual_calories: Math.round(best.baseCalories * factor),
    actual_protein: Math.round(best.baseProtein * factor),
    actual_carbs: Math.round(best.baseCarbs * factor),
    actual_fat: Math.round(best.baseFat * factor),
  };
}
