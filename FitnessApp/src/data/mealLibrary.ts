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

  // ── Additional templates — bring every (mealType, diet) cell up to 10
  // options each, so a trainee on the least-restrictive diet (omnivore) sees
  // 40 eligible meals per slot (10 vegan + 10 vegetarian + 10 pescatarian +
  // 10 omnivore, via satisfiesDiet's nesting) instead of just a couple. ──

  // Breakfast — vegetarian (7 more, 10 total with b1–b3)
  { id: 'b6', mealType: 'Breakfast', diet: 'vegetarian', name: 'Ricotta & Honey Toast', baseCalories: 430, baseProtein: 20, baseCarbs: 48, baseFat: 17,
    baseItems: [{ food: 'Ricotta cheese', qty: '150g' }, { food: 'Whole-grain toast', qty: '60g' }, { food: 'Honey', qty: '15g' }, { food: 'Walnuts', qty: '15g' }] },
  { id: 'b7', mealType: 'Breakfast', diet: 'vegetarian', name: 'Cottage Cheese Pancakes', baseCalories: 460, baseProtein: 34, baseCarbs: 48, baseFat: 13,
    baseItems: [{ food: 'Cottage cheese', qty: '150g' }, { food: 'Whole eggs', qty: '2' }, { food: 'Rolled oats', qty: '50g' }, { food: 'Blueberries', qty: '80g' }] },
  { id: 'b8', mealType: 'Breakfast', diet: 'vegetarian', name: 'Caprese Breakfast Wrap', baseCalories: 470, baseProtein: 26, baseCarbs: 36, baseFat: 24,
    baseItems: [{ food: 'Whole eggs', qty: '3' }, { food: 'Mozzarella', qty: '40g' }, { food: 'Tomato', qty: '60g' }, { food: 'Whole-wheat tortilla', qty: '1' }] },
  { id: 'b9', mealType: 'Breakfast', diet: 'vegetarian', name: 'Peanut Butter Banana Oatmeal', baseCalories: 480, baseProtein: 18, baseCarbs: 66, baseFat: 17,
    baseItems: [{ food: 'Rolled oats', qty: '70g' }, { food: 'Milk', qty: '200ml' }, { food: 'Peanut butter', qty: '20g' }, { food: 'Banana', qty: '1' }] },
  { id: 'b10', mealType: 'Breakfast', diet: 'vegetarian', name: 'Shakshuka', baseCalories: 420, baseProtein: 24, baseCarbs: 32, baseFat: 22,
    baseItems: [{ food: 'Whole eggs', qty: '3' }, { food: 'Tomato sauce', qty: '200g' }, { food: 'Feta cheese', qty: '40g' }, { food: 'Crusty bread', qty: '50g' }] },
  { id: 'b11', mealType: 'Breakfast', diet: 'vegetarian', name: 'French Toast with Yogurt', baseCalories: 500, baseProtein: 28, baseCarbs: 62, baseFat: 15,
    baseItems: [{ food: 'Whole-grain bread', qty: '80g' }, { food: 'Whole eggs', qty: '2' }, { food: 'Greek yogurt, plain', qty: '150g' }, { food: 'Mixed berries', qty: '80g' }] },
  { id: 'b12', mealType: 'Breakfast', diet: 'vegetarian', name: 'Spinach & Feta Omelette', baseCalories: 400, baseProtein: 27, baseCarbs: 18, baseFat: 25,
    baseItems: [{ food: 'Whole eggs', qty: '3' }, { food: 'Spinach', qty: '60g' }, { food: 'Feta cheese', qty: '40g' }, { food: 'Whole-grain toast', qty: '40g' }] },

  // Breakfast — vegan (8 more, 10 total with b4–b5)
  { id: 'b13', mealType: 'Breakfast', diet: 'vegan', name: 'Peanut Butter Banana Smoothie Bowl', baseCalories: 440, baseProtein: 14, baseCarbs: 62, baseFat: 17,
    baseItems: [{ food: 'Banana', qty: '2' }, { food: 'Peanut butter', qty: '20g' }, { food: 'Oat milk', qty: '150ml' }, { food: 'Granola', qty: '40g' }] },
  { id: 'b14', mealType: 'Breakfast', diet: 'vegan', name: 'Vegan Breakfast Burrito', baseCalories: 480, baseProtein: 20, baseCarbs: 60, baseFat: 18,
    baseItems: [{ food: 'Firm tofu', qty: '150g' }, { food: 'Black beans, cooked', qty: '100g' }, { food: 'Whole-wheat tortilla', qty: '1' }, { food: 'Avocado', qty: '40g' }] },
  { id: 'b15', mealType: 'Breakfast', diet: 'vegan', name: 'Coconut Quinoa Porridge', baseCalories: 410, baseProtein: 12, baseCarbs: 58, baseFat: 15,
    baseItems: [{ food: 'Quinoa, cooked', qty: '180g' }, { food: 'Coconut milk', qty: '150ml' }, { food: 'Mango', qty: '80g' }, { food: 'Cinnamon', qty: 'to taste' }] },
  { id: 'b16', mealType: 'Breakfast', diet: 'vegan', name: 'Almond Butter Toast & Berries', baseCalories: 390, baseProtein: 13, baseCarbs: 46, baseFat: 18,
    baseItems: [{ food: 'Whole-grain toast', qty: '70g' }, { food: 'Almond butter', qty: '25g' }, { food: 'Mixed berries', qty: '80g' }, { food: 'Flax seeds', qty: '10g' }] },
  { id: 'b17', mealType: 'Breakfast', diet: 'vegan', name: 'Tempeh Breakfast Hash', baseCalories: 450, baseProtein: 26, baseCarbs: 42, baseFat: 19,
    baseItems: [{ food: 'Tempeh', qty: '150g' }, { food: 'Sweet potato', qty: '150g' }, { food: 'Bell pepper', qty: '60g' }, { food: 'Olive oil', qty: '10g' }] },
  { id: 'b18', mealType: 'Breakfast', diet: 'vegan', name: 'Vegan Protein Pancakes', baseCalories: 420, baseProtein: 28, baseCarbs: 52, baseFat: 9,
    baseItems: [{ food: 'Pea protein powder', qty: '1 scoop' }, { food: 'Oat flour', qty: '60g' }, { food: 'Banana', qty: '1' }, { food: 'Maple syrup', qty: '15g' }] },
  { id: 'b19', mealType: 'Breakfast', diet: 'vegan', name: 'Chickpea Flour Omelette', baseCalories: 370, baseProtein: 18, baseCarbs: 40, baseFat: 14,
    baseItems: [{ food: 'Chickpea flour', qty: '80g' }, { food: 'Spinach', qty: '50g' }, { food: 'Tomato', qty: '50g' }, { food: 'Turmeric', qty: 'to taste' }] },
  { id: 'b20', mealType: 'Breakfast', diet: 'vegan', name: 'Green Smoothie & Nuts', baseCalories: 400, baseProtein: 13, baseCarbs: 48, baseFat: 18,
    baseItems: [{ food: 'Spinach', qty: '50g' }, { food: 'Banana', qty: '1' }, { food: 'Oat milk', qty: '250ml' }, { food: 'Mixed nuts', qty: '20g' }] },

  // Breakfast — pescatarian (10, none existed)
  { id: 'b21', mealType: 'Breakfast', diet: 'pescatarian', name: 'Smoked Salmon Bagel', baseCalories: 480, baseProtein: 30, baseCarbs: 52, baseFat: 16,
    baseItems: [{ food: 'Whole-grain bagel', qty: '1' }, { food: 'Smoked salmon', qty: '100g' }, { food: 'Cream cheese', qty: '30g' }, { food: 'Red onion', qty: '20g' }] },
  { id: 'b22', mealType: 'Breakfast', diet: 'pescatarian', name: 'Smoked Salmon Scramble', baseCalories: 420, baseProtein: 32, baseCarbs: 8, baseFat: 28,
    baseItems: [{ food: 'Whole eggs', qty: '3' }, { food: 'Smoked salmon', qty: '80g' }, { food: 'Cream cheese', qty: '20g' }, { food: 'Chives', qty: 'to taste' }] },
  { id: 'b23', mealType: 'Breakfast', diet: 'pescatarian', name: 'Tuna & Avocado Toast', baseCalories: 440, baseProtein: 30, baseCarbs: 36, baseFat: 19,
    baseItems: [{ food: 'Tuna, canned in water', qty: '120g' }, { food: 'Avocado', qty: '60g' }, { food: 'Whole-grain toast', qty: '60g' }, { food: 'Lemon juice', qty: '10ml' }] },
  { id: 'b24', mealType: 'Breakfast', diet: 'pescatarian', name: 'Shrimp & Egg Fried Rice', baseCalories: 490, baseProtein: 34, baseCarbs: 52, baseFat: 15,
    baseItems: [{ food: 'Shrimp', qty: '150g' }, { food: 'Whole eggs', qty: '1' }, { food: 'Brown rice, cooked', qty: '150g' }, { food: 'Peas', qty: '50g' }] },
  { id: 'b25', mealType: 'Breakfast', diet: 'pescatarian', name: 'Kipper & Poached Egg', baseCalories: 430, baseProtein: 33, baseCarbs: 24, baseFat: 22,
    baseItems: [{ food: 'Smoked kipper fillet', qty: '120g' }, { food: 'Whole eggs', qty: '1' }, { food: 'Whole-grain toast', qty: '50g' }] },
  { id: 'b26', mealType: 'Breakfast', diet: 'pescatarian', name: 'Salmon & Sweet Potato Hash', baseCalories: 470, baseProtein: 32, baseCarbs: 40, baseFat: 19,
    baseItems: [{ food: 'Salmon fillet', qty: '140g' }, { food: 'Sweet potato', qty: '150g' }, { food: 'Spinach', qty: '50g' }, { food: 'Olive oil', qty: '8g' }] },
  { id: 'b27', mealType: 'Breakfast', diet: 'pescatarian', name: 'Greek Yogurt with Smoked Trout', baseCalories: 380, baseProtein: 34, baseCarbs: 18, baseFat: 17,
    baseItems: [{ food: 'Greek yogurt, plain', qty: '200g' }, { food: 'Smoked trout', qty: '80g' }, { food: 'Cucumber', qty: '50g' }, { food: 'Dill', qty: 'to taste' }] },
  { id: 'b28', mealType: 'Breakfast', diet: 'pescatarian', name: 'Sardine Toast', baseCalories: 410, baseProtein: 27, baseCarbs: 34, baseFat: 19,
    baseItems: [{ food: 'Sardines in olive oil', qty: '120g' }, { food: 'Whole-grain toast', qty: '60g' }, { food: 'Tomato', qty: '50g' }, { food: 'Lemon juice', qty: '10ml' }] },
  { id: 'b29', mealType: 'Breakfast', diet: 'pescatarian', name: 'Crab & Avocado Omelette', baseCalories: 420, baseProtein: 29, baseCarbs: 12, baseFat: 28,
    baseItems: [{ food: 'Whole eggs', qty: '3' }, { food: 'Crab meat', qty: '90g' }, { food: 'Avocado', qty: '50g' }, { food: 'Chives', qty: 'to taste' }] },
  { id: 'b30', mealType: 'Breakfast', diet: 'pescatarian', name: 'Anchovy & Egg Breakfast Salad', baseCalories: 400, baseProtein: 28, baseCarbs: 14, baseFat: 26,
    baseItems: [{ food: 'Whole eggs', qty: '2' }, { food: 'Anchovies', qty: '30g' }, { food: 'Mixed greens', qty: '80g' }, { food: 'Olive oil', qty: '12g' }] },

  // Breakfast — omnivore (10, none existed)
  { id: 'b31', mealType: 'Breakfast', diet: 'omnivore', name: 'Bacon & Egg Breakfast Sandwich', baseCalories: 480, baseProtein: 30, baseCarbs: 38, baseFat: 22,
    baseItems: [{ food: 'Turkey bacon', qty: '60g' }, { food: 'Whole eggs', qty: '2' }, { food: 'English muffin', qty: '1' }, { food: 'Cheddar cheese', qty: '20g' }] },
  { id: 'b32', mealType: 'Breakfast', diet: 'omnivore', name: 'Chicken Sausage & Veggie Scramble', baseCalories: 440, baseProtein: 34, baseCarbs: 16, baseFat: 26,
    baseItems: [{ food: 'Chicken sausage', qty: '120g' }, { food: 'Whole eggs', qty: '2' }, { food: 'Bell pepper', qty: '50g' }, { food: 'Onion', qty: '30g' }] },
  { id: 'b33', mealType: 'Breakfast', diet: 'omnivore', name: 'Steak & Eggs', baseCalories: 510, baseProtein: 42, baseCarbs: 6, baseFat: 34,
    baseItems: [{ food: 'Lean sirloin steak', qty: '150g' }, { food: 'Whole eggs', qty: '2' }, { food: 'Spinach', qty: '60g' }] },
  { id: 'b34', mealType: 'Breakfast', diet: 'omnivore', name: 'Turkey Bacon & Avocado Toast', baseCalories: 430, baseProtein: 24, baseCarbs: 34, baseFat: 22,
    baseItems: [{ food: 'Turkey bacon', qty: '60g' }, { food: 'Avocado', qty: '60g' }, { food: 'Whole-grain toast', qty: '60g' }, { food: 'Whole eggs', qty: '1' }] },
  { id: 'b35', mealType: 'Breakfast', diet: 'omnivore', name: 'Ham & Cheese Omelette', baseCalories: 420, baseProtein: 30, baseCarbs: 10, baseFat: 28,
    baseItems: [{ food: 'Whole eggs', qty: '3' }, { food: 'Deli ham', qty: '60g' }, { food: 'Cheddar cheese', qty: '30g' }, { food: 'Spinach', qty: '40g' }] },
  { id: 'b36', mealType: 'Breakfast', diet: 'omnivore', name: 'Breakfast Burrito with Ground Beef', baseCalories: 520, baseProtein: 36, baseCarbs: 44, baseFat: 22,
    baseItems: [{ food: 'Lean ground beef', qty: '120g' }, { food: 'Whole eggs', qty: '1' }, { food: 'Black beans, cooked', qty: '80g' }, { food: 'Whole-wheat tortilla', qty: '1' }] },
  { id: 'b37', mealType: 'Breakfast', diet: 'omnivore', name: 'Chicken & Waffles Lite', baseCalories: 500, baseProtein: 38, baseCarbs: 48, baseFat: 16,
    baseItems: [{ food: 'Grilled chicken breast', qty: '150g' }, { food: 'Whole-grain waffle', qty: '1' }, { food: 'Maple syrup', qty: '15g' }] },
  { id: 'b38', mealType: 'Breakfast', diet: 'omnivore', name: 'Pork Sausage & Sweet Potato Hash', baseCalories: 460, baseProtein: 28, baseCarbs: 38, baseFat: 21,
    baseItems: [{ food: 'Lean pork sausage', qty: '130g' }, { food: 'Sweet potato', qty: '150g' }, { food: 'Kale', qty: '50g' }] },
  { id: 'b39', mealType: 'Breakfast', diet: 'omnivore', name: 'Prosciutto & Melon Plate with Eggs', baseCalories: 390, baseProtein: 27, baseCarbs: 22, baseFat: 21,
    baseItems: [{ food: 'Prosciutto', qty: '60g' }, { food: 'Melon', qty: '150g' }, { food: 'Whole eggs', qty: '2' }] },
  { id: 'b40', mealType: 'Breakfast', diet: 'omnivore', name: 'Bison Breakfast Bowl', baseCalories: 480, baseProtein: 38, baseCarbs: 34, baseFat: 20,
    baseItems: [{ food: 'Ground bison', qty: '150g' }, { food: 'Sweet potato', qty: '120g' }, { food: 'Whole eggs', qty: '1' }, { food: 'Spinach', qty: '50g' }] },

  // Lunch — omnivore (8 more, 10 total with l1–l2)
  { id: 'l7', mealType: 'Lunch', diet: 'omnivore', name: 'Chicken Caesar Wrap', baseCalories: 560, baseProtein: 42, baseCarbs: 48, baseFat: 20,
    baseItems: [{ food: 'Grilled chicken breast', qty: '150g' }, { food: 'Romaine lettuce', qty: '60g' }, { food: 'Parmesan', qty: '20g' }, { food: 'Whole-wheat wrap', qty: '1' }] },
  { id: 'l8', mealType: 'Lunch', diet: 'omnivore', name: 'BBQ Pulled Pork & Rice', baseCalories: 610, baseProtein: 40, baseCarbs: 68, baseFat: 17,
    baseItems: [{ food: 'Lean pulled pork', qty: '160g' }, { food: 'Brown rice, cooked', qty: '180g' }, { food: 'Coleslaw', qty: '80g' }] },
  { id: 'l9', mealType: 'Lunch', diet: 'omnivore', name: 'Steak Fajita Bowl', baseCalories: 600, baseProtein: 44, baseCarbs: 58, baseFat: 20,
    baseItems: [{ food: 'Sirloin steak strips', qty: '170g' }, { food: 'Brown rice, cooked', qty: '150g' }, { food: 'Bell peppers', qty: '80g' }, { food: 'Salsa', qty: '40g' }] },
  { id: 'l10', mealType: 'Lunch', diet: 'omnivore', name: 'Turkey Meatball Sub', baseCalories: 580, baseProtein: 40, baseCarbs: 60, baseFat: 18,
    baseItems: [{ food: 'Turkey meatballs', qty: '180g' }, { food: 'Marinara sauce', qty: '100g' }, { food: 'Whole-grain roll', qty: '1' }, { food: 'Mozzarella', qty: '30g' }] },
  { id: 'l11', mealType: 'Lunch', diet: 'omnivore', name: 'Chicken Shawarma Plate', baseCalories: 590, baseProtein: 46, baseCarbs: 55, baseFat: 18,
    baseItems: [{ food: 'Chicken thigh', qty: '170g' }, { food: 'Basmati rice, cooked', qty: '150g' }, { food: 'Cucumber-tomato salad', qty: '100g' }, { food: 'Tahini', qty: '15g' }] },
  { id: 'l12', mealType: 'Lunch', diet: 'omnivore', name: 'Beef & Broccoli', baseCalories: 570, baseProtein: 42, baseCarbs: 52, baseFat: 20,
    baseItems: [{ food: 'Lean beef strips', qty: '160g' }, { food: 'Broccoli', qty: '120g' }, { food: 'Brown rice, cooked', qty: '150g' }, { food: 'Soy-ginger sauce', qty: '15ml' }] },
  { id: 'l13', mealType: 'Lunch', diet: 'omnivore', name: 'Grilled Chicken Pesto Pasta', baseCalories: 610, baseProtein: 44, baseCarbs: 60, baseFat: 20,
    baseItems: [{ food: 'Chicken breast', qty: '160g' }, { food: 'Whole-wheat pasta', qty: '150g' }, { food: 'Pesto', qty: '25g' }, { food: 'Cherry tomatoes', qty: '60g' }] },
  { id: 'l14', mealType: 'Lunch', diet: 'omnivore', name: 'Pork Tenderloin & Quinoa', baseCalories: 560, baseProtein: 44, baseCarbs: 46, baseFat: 18,
    baseItems: [{ food: 'Pork tenderloin', qty: '170g' }, { food: 'Quinoa, cooked', qty: '150g' }, { food: 'Roasted Brussels sprouts', qty: '100g' }] },

  // Lunch — pescatarian (9 more, 10 total with l3)
  { id: 'l15', mealType: 'Lunch', diet: 'pescatarian', name: 'Shrimp Tacos', baseCalories: 540, baseProtein: 40, baseCarbs: 52, baseFat: 16,
    baseItems: [{ food: 'Shrimp', qty: '180g' }, { food: 'Corn tortillas', qty: '3' }, { food: 'Cabbage slaw', qty: '80g' }, { food: 'Lime crema', qty: '20g' }] },
  { id: 'l16', mealType: 'Lunch', diet: 'pescatarian', name: 'Salmon Poke Bowl', baseCalories: 580, baseProtein: 40, baseCarbs: 58, baseFat: 20,
    baseItems: [{ food: 'Salmon', qty: '160g' }, { food: 'Sushi rice, cooked', qty: '150g' }, { food: 'Edamame, shelled', qty: '60g' }, { food: 'Avocado', qty: '40g' }] },
  { id: 'l17', mealType: 'Lunch', diet: 'pescatarian', name: 'Grilled Shrimp & Quinoa Salad', baseCalories: 520, baseProtein: 42, baseCarbs: 46, baseFat: 15,
    baseItems: [{ food: 'Shrimp', qty: '180g' }, { food: 'Quinoa, cooked', qty: '150g' }, { food: 'Cherry tomatoes', qty: '60g' }, { food: 'Feta cheese', qty: '30g' }] },
  { id: 'l18', mealType: 'Lunch', diet: 'pescatarian', name: 'Tuna Niçoise Salad', baseCalories: 500, baseProtein: 38, baseCarbs: 38, baseFat: 20,
    baseItems: [{ food: 'Tuna, canned in water', qty: '150g' }, { food: 'Boiled egg', qty: '1' }, { food: 'Green beans', qty: '80g' }, { food: 'Potatoes', qty: '120g' }] },
  { id: 'l19', mealType: 'Lunch', diet: 'pescatarian', name: 'Fish Taco Bowl', baseCalories: 550, baseProtein: 38, baseCarbs: 62, baseFat: 15,
    baseItems: [{ food: 'White fish fillet', qty: '160g' }, { food: 'Brown rice, cooked', qty: '150g' }, { food: 'Black beans, cooked', qty: '80g' }, { food: 'Pico de gallo', qty: '50g' }] },
  { id: 'l20', mealType: 'Lunch', diet: 'pescatarian', name: 'Crab & Avocado Salad', baseCalories: 480, baseProtein: 34, baseCarbs: 22, baseFat: 28,
    baseItems: [{ food: 'Crab meat', qty: '160g' }, { food: 'Avocado', qty: '80g' }, { food: 'Mixed greens', qty: '80g' }, { food: 'Citrus dressing', qty: '20ml' }] },
  { id: 'l21', mealType: 'Lunch', diet: 'pescatarian', name: 'Shrimp Pad Thai', baseCalories: 590, baseProtein: 36, baseCarbs: 70, baseFat: 17,
    baseItems: [{ food: 'Shrimp', qty: '160g' }, { food: 'Rice noodles', qty: '150g' }, { food: 'Bean sprouts', qty: '60g' }, { food: 'Peanuts', qty: '20g' }] },
  { id: 'l22', mealType: 'Lunch', diet: 'pescatarian', name: 'Baked Tilapia & Sweet Potato', baseCalories: 510, baseProtein: 40, baseCarbs: 48, baseFat: 14,
    baseItems: [{ food: 'Tilapia fillet', qty: '180g' }, { food: 'Sweet potato', qty: '180g' }, { food: 'Green beans', qty: '80g' }] },
  { id: 'l23', mealType: 'Lunch', diet: 'pescatarian', name: 'Scallop & Vegetable Stir-Fry', baseCalories: 500, baseProtein: 36, baseCarbs: 52, baseFat: 15,
    baseItems: [{ food: 'Scallops', qty: '170g' }, { food: 'Brown rice, cooked', qty: '150g' }, { food: 'Snap peas', qty: '70g' }, { food: 'Carrots', qty: '50g' }] },

  // Lunch — vegan (8 more, 10 total with l4–l5)
  { id: 'l24', mealType: 'Lunch', diet: 'vegan', name: 'Falafel & Hummus Bowl', baseCalories: 560, baseProtein: 22, baseCarbs: 70, baseFat: 20,
    baseItems: [{ food: 'Falafel', qty: '180g' }, { food: 'Hummus', qty: '60g' }, { food: 'Quinoa, cooked', qty: '100g' }, { food: 'Cucumber-tomato salad', qty: '80g' }] },
  { id: 'l25', mealType: 'Lunch', diet: 'vegan', name: 'Vegan Buddha Bowl', baseCalories: 540, baseProtein: 24, baseCarbs: 72, baseFat: 17,
    baseItems: [{ food: 'Firm tofu', qty: '150g' }, { food: 'Brown rice, cooked', qty: '150g' }, { food: 'Kale', qty: '60g' }, { food: 'Roasted chickpeas', qty: '50g' }] },
  { id: 'l26', mealType: 'Lunch', diet: 'vegan', name: 'Thai Peanut Tempeh Bowl', baseCalories: 570, baseProtein: 28, baseCarbs: 62, baseFat: 22,
    baseItems: [{ food: 'Tempeh', qty: '180g' }, { food: 'Brown rice, cooked', qty: '150g' }, { food: 'Broccoli', qty: '80g' }, { food: 'Peanut sauce', qty: '30g' }] },
  { id: 'l27', mealType: 'Lunch', diet: 'vegan', name: 'Black Bean & Corn Quesadilla', baseCalories: 530, baseProtein: 22, baseCarbs: 74, baseFat: 15,
    baseItems: [{ food: 'Black beans, cooked', qty: '150g' }, { food: 'Corn', qty: '60g' }, { food: 'Whole-wheat tortilla', qty: '2' }, { food: 'Vegan cheese', qty: '40g' }] },
  { id: 'l28', mealType: 'Lunch', diet: 'vegan', name: 'Vegan Burrito Bowl', baseCalories: 560, baseProtein: 20, baseCarbs: 84, baseFat: 15,
    baseItems: [{ food: 'Black beans, cooked', qty: '150g' }, { food: 'Brown rice, cooked', qty: '150g' }, { food: 'Pico de gallo', qty: '60g' }, { food: 'Guacamole', qty: '40g' }] },
  { id: 'l29', mealType: 'Lunch', diet: 'vegan', name: 'Seitan Stir-Fry', baseCalories: 550, baseProtein: 36, baseCarbs: 56, baseFat: 15,
    baseItems: [{ food: 'Seitan', qty: '160g' }, { food: 'Brown rice, cooked', qty: '150g' }, { food: 'Mixed stir-fry vegetables', qty: '120g' }, { food: 'Soy sauce', qty: '15ml' }] },
  { id: 'l30', mealType: 'Lunch', diet: 'vegan', name: 'Moroccan Chickpea Stew', baseCalories: 520, baseProtein: 20, baseCarbs: 82, baseFat: 12,
    baseItems: [{ food: 'Chickpeas, cooked', qty: '180g' }, { food: 'Couscous', qty: '120g' }, { food: 'Carrots', qty: '70g' }, { food: 'Dried apricots', qty: '30g' }] },
  { id: 'l31', mealType: 'Lunch', diet: 'vegan', name: 'Vegan Sushi Bowl', baseCalories: 510, baseProtein: 16, baseCarbs: 78, baseFat: 15,
    baseItems: [{ food: 'Firm tofu', qty: '140g' }, { food: 'Sushi rice, cooked', qty: '180g' }, { food: 'Avocado', qty: '50g' }, { food: 'Nori', qty: '2 sheets' }] },

  // Lunch — vegetarian (9 more, 10 total with l6)
  { id: 'l32', mealType: 'Lunch', diet: 'vegetarian', name: 'Paneer Tikka & Rice', baseCalories: 570, baseProtein: 28, baseCarbs: 54, baseFat: 25,
    baseItems: [{ food: 'Paneer', qty: '170g' }, { food: 'Basmati rice, cooked', qty: '150g' }, { food: 'Bell peppers', qty: '70g' }, { food: 'Yogurt marinade', qty: '40g' }] },
  { id: 'l33', mealType: 'Lunch', diet: 'vegetarian', name: 'Greek Salad with Feta & Chickpeas', baseCalories: 500, baseProtein: 22, baseCarbs: 44, baseFat: 26,
    baseItems: [{ food: 'Feta cheese', qty: '60g' }, { food: 'Chickpeas, cooked', qty: '120g' }, { food: 'Cucumber', qty: '80g' }, { food: 'Kalamata olives', qty: '30g' }] },
  { id: 'l34', mealType: 'Lunch', diet: 'vegetarian', name: 'Egg Fried Rice with Veggies', baseCalories: 520, baseProtein: 22, baseCarbs: 66, baseFat: 17,
    baseItems: [{ food: 'Whole eggs', qty: '3' }, { food: 'Brown rice, cooked', qty: '180g' }, { food: 'Peas', qty: '60g' }, { food: 'Carrots', qty: '50g' }] },
  { id: 'l35', mealType: 'Lunch', diet: 'vegetarian', name: 'Margherita Flatbread & Side Salad', baseCalories: 540, baseProtein: 24, baseCarbs: 58, baseFat: 22,
    baseItems: [{ food: 'Mozzarella', qty: '80g' }, { food: 'Whole-wheat flatbread', qty: '1' }, { food: 'Tomato', qty: '70g' }, { food: 'Basil', qty: '5g' }] },
  { id: 'l36', mealType: 'Lunch', diet: 'vegetarian', name: 'Veggie & Halloumi Grain Bowl', baseCalories: 550, baseProtein: 26, baseCarbs: 52, baseFat: 24,
    baseItems: [{ food: 'Halloumi', qty: '100g' }, { food: 'Farro, cooked', qty: '150g' }, { food: 'Roasted vegetables', qty: '120g' }] },
  { id: 'l37', mealType: 'Lunch', diet: 'vegetarian', name: 'Spinach & Ricotta Stuffed Shells', baseCalories: 560, baseProtein: 26, baseCarbs: 64, baseFat: 20,
    baseItems: [{ food: 'Ricotta cheese', qty: '150g' }, { food: 'Spinach', qty: '70g' }, { food: 'Whole-wheat pasta shells', qty: '120g' }, { food: 'Marinara sauce', qty: '100g' }] },
  { id: 'l38', mealType: 'Lunch', diet: 'vegetarian', name: 'Egg & Avocado Grain Bowl', baseCalories: 530, baseProtein: 22, baseCarbs: 46, baseFat: 28,
    baseItems: [{ food: 'Whole eggs', qty: '2' }, { food: 'Avocado', qty: '70g' }, { food: 'Quinoa, cooked', qty: '130g' }, { food: 'Mixed greens', qty: '60g' }] },
  { id: 'l39', mealType: 'Lunch', diet: 'vegetarian', name: 'Vegetable & Paneer Curry', baseCalories: 560, baseProtein: 24, baseCarbs: 58, baseFat: 24,
    baseItems: [{ food: 'Paneer', qty: '150g' }, { food: 'Mixed vegetables', qty: '150g' }, { food: 'Basmati rice, cooked', qty: '150g' }] },
  { id: 'l40', mealType: 'Lunch', diet: 'vegetarian', name: 'Caprese Panini with Side Salad', baseCalories: 520, baseProtein: 24, baseCarbs: 48, baseFat: 24,
    baseItems: [{ food: 'Mozzarella', qty: '70g' }, { food: 'Whole-grain bread', qty: '80g' }, { food: 'Tomato', qty: '60g' }, { food: 'Basil', qty: '5g' }] },

  // Dinner — pescatarian (8 more, 10 total with d1, d3)
  { id: 'd7', mealType: 'Dinner', diet: 'pescatarian', name: 'Shrimp Scampi & Zucchini Noodles', baseCalories: 480, baseProtein: 38, baseCarbs: 22, baseFat: 26,
    baseItems: [{ food: 'Shrimp', qty: '200g' }, { food: 'Zucchini noodles', qty: '200g' }, { food: 'Garlic', qty: '10g' }, { food: 'Olive oil', qty: '12g' }] },
  { id: 'd8', mealType: 'Dinner', diet: 'pescatarian', name: 'Grilled Swordfish & Couscous', baseCalories: 560, baseProtein: 42, baseCarbs: 48, baseFat: 20,
    baseItems: [{ food: 'Swordfish steak', qty: '180g' }, { food: 'Couscous', qty: '140g' }, { food: 'Grilled asparagus', qty: '100g' }] },
  { id: 'd9', mealType: 'Dinner', diet: 'pescatarian', name: 'Miso Glazed Salmon & Rice', baseCalories: 600, baseProtein: 42, baseCarbs: 54, baseFat: 24,
    baseItems: [{ food: 'Salmon fillet', qty: '180g' }, { food: 'Brown rice, cooked', qty: '150g' }, { food: 'Bok choy', qty: '100g' }, { food: 'Miso glaze', qty: '20g' }] },
  { id: 'd10', mealType: 'Dinner', diet: 'pescatarian', name: 'Seared Tuna Steak & Vegetables', baseCalories: 530, baseProtein: 46, baseCarbs: 38, baseFat: 20,
    baseItems: [{ food: 'Tuna steak', qty: '180g' }, { food: 'Roasted vegetables', qty: '150g' }, { food: 'Quinoa, cooked', qty: '100g' }] },
  { id: 'd11', mealType: 'Dinner', diet: 'pescatarian', name: 'Shrimp & Grits', baseCalories: 540, baseProtein: 36, baseCarbs: 56, baseFat: 18,
    baseItems: [{ food: 'Shrimp', qty: '180g' }, { food: 'Stone-ground grits', qty: '150g' }, { food: 'Spinach', qty: '60g' }] },
  { id: 'd12', mealType: 'Dinner', diet: 'pescatarian', name: 'Halibut & Roasted Potatoes', baseCalories: 550, baseProtein: 40, baseCarbs: 52, baseFat: 18,
    baseItems: [{ food: 'Halibut fillet', qty: '180g' }, { food: 'Baby potatoes', qty: '200g' }, { food: 'Green beans', qty: '80g' }] },
  { id: 'd13', mealType: 'Dinner', diet: 'pescatarian', name: 'Mussels Marinara with Pasta', baseCalories: 560, baseProtein: 34, baseCarbs: 66, baseFat: 16,
    baseItems: [{ food: 'Mussels', qty: '250g' }, { food: 'Whole-wheat pasta', qty: '140g' }, { food: 'Marinara sauce', qty: '120g' }] },
  { id: 'd14', mealType: 'Dinner', diet: 'pescatarian', name: 'Fish Curry & Rice', baseCalories: 590, baseProtein: 38, baseCarbs: 58, baseFat: 22,
    baseItems: [{ food: 'White fish fillet', qty: '180g' }, { food: 'Coconut curry sauce', qty: '150g' }, { food: 'Basmati rice, cooked', qty: '150g' }] },

  // Dinner — omnivore (9 more, 10 total with d2)
  { id: 'd15', mealType: 'Dinner', diet: 'omnivore', name: 'Grilled Chicken & Roasted Vegetables', baseCalories: 550, baseProtein: 46, baseCarbs: 34, baseFat: 22,
    baseItems: [{ food: 'Chicken breast', qty: '180g' }, { food: 'Roasted vegetables', qty: '180g' }, { food: 'Olive oil', qty: '12g' }] },
  { id: 'd16', mealType: 'Dinner', diet: 'omnivore', name: 'Beef Fajita Bowl', baseCalories: 610, baseProtein: 44, baseCarbs: 58, baseFat: 22,
    baseItems: [{ food: 'Sirloin steak strips', qty: '170g' }, { food: 'Brown rice, cooked', qty: '150g' }, { food: 'Bell peppers', qty: '80g' }, { food: 'Onion', qty: '50g' }] },
  { id: 'd17', mealType: 'Dinner', diet: 'omnivore', name: "Turkey Meatloaf & Mashed Sweet Potato", baseCalories: 560, baseProtein: 42, baseCarbs: 48, baseFat: 20,
    baseItems: [{ food: 'Ground turkey', qty: '180g' }, { food: 'Sweet potato', qty: '200g' }, { food: 'Green beans', qty: '80g' }] },
  { id: 'd18', mealType: 'Dinner', diet: 'omnivore', name: 'Pork Chops & Roasted Brussels Sprouts', baseCalories: 570, baseProtein: 44, baseCarbs: 40, baseFat: 24,
    baseItems: [{ food: 'Pork chop', qty: '180g' }, { food: 'Brussels sprouts', qty: '120g' }, { food: 'Quinoa, cooked', qty: '100g' }] },
  { id: 'd19', mealType: 'Dinner', diet: 'omnivore', name: 'Chicken Tikka Masala & Rice', baseCalories: 610, baseProtein: 44, baseCarbs: 60, baseFat: 20,
    baseItems: [{ food: 'Chicken breast', qty: '180g' }, { food: 'Tikka masala sauce', qty: '150g' }, { food: 'Basmati rice, cooked', qty: '150g' }] },
  { id: 'd20', mealType: 'Dinner', diet: 'omnivore', name: 'Grilled Lamb & Couscous', baseCalories: 600, baseProtein: 40, baseCarbs: 50, baseFat: 26,
    baseItems: [{ food: 'Lamb chop', qty: '180g' }, { food: 'Couscous', qty: '140g' }, { food: 'Grilled zucchini', qty: '100g' }] },
  { id: 'd21', mealType: 'Dinner', diet: 'omnivore', name: 'BBQ Chicken & Sweet Potato', baseCalories: 560, baseProtein: 44, baseCarbs: 52, baseFat: 16,
    baseItems: [{ food: 'Grilled chicken', qty: '180g' }, { food: 'Sweet potato', qty: '180g' }, { food: 'Coleslaw', qty: '70g' }] },
  { id: 'd22', mealType: 'Dinner', diet: 'omnivore', name: 'Beef & Vegetable Skewers', baseCalories: 570, baseProtein: 42, baseCarbs: 48, baseFat: 22,
    baseItems: [{ food: 'Lean beef cubes', qty: '170g' }, { food: 'Bell peppers', qty: '80g' }, { food: 'Onion', qty: '50g' }, { food: 'Brown rice, cooked', qty: '130g' }] },
  { id: 'd23', mealType: 'Dinner', diet: 'omnivore', name: 'Turkey Chili', baseCalories: 550, baseProtein: 42, baseCarbs: 56, baseFat: 15,
    baseItems: [{ food: 'Ground turkey', qty: '170g' }, { food: 'Kidney beans, cooked', qty: '120g' }, { food: 'Tomatoes, canned', qty: '150g' }, { food: 'Brown rice, cooked', qty: '100g' }] },

  // Dinner — vegan (8 more, 10 total with d4–d5)
  { id: 'd24', mealType: 'Dinner', diet: 'vegan', name: "Vegan Shepherd's Pie", baseCalories: 560, baseProtein: 22, baseCarbs: 92, baseFat: 12,
    baseItems: [{ food: 'Lentils, cooked', qty: '200g' }, { food: 'Mashed potato', qty: '200g' }, { food: 'Mixed vegetables', qty: '120g' }] },
  { id: 'd25', mealType: 'Dinner', diet: 'vegan', name: 'Chickpea Coconut Curry', baseCalories: 580, baseProtein: 20, baseCarbs: 78, baseFat: 20,
    baseItems: [{ food: 'Chickpeas, cooked', qty: '200g' }, { food: 'Coconut curry sauce', qty: '150g' }, { food: 'Brown rice, cooked', qty: '150g' }] },
  { id: 'd26', mealType: 'Dinner', diet: 'vegan', name: 'Vegan Stuffed Peppers', baseCalories: 520, baseProtein: 20, baseCarbs: 82, baseFat: 12,
    baseItems: [{ food: 'Bell peppers', qty: '3' }, { food: 'Quinoa, cooked', qty: '150g' }, { food: 'Black beans, cooked', qty: '120g' }, { food: 'Corn', qty: '60g' }] },
  { id: 'd27', mealType: 'Dinner', diet: 'vegan', name: 'Peanut Tofu Noodles', baseCalories: 590, baseProtein: 26, baseCarbs: 70, baseFat: 22,
    baseItems: [{ food: 'Firm tofu', qty: '180g' }, { food: 'Rice noodles', qty: '150g' }, { food: 'Peanut sauce', qty: '30g' }, { food: 'Mixed vegetables', qty: '100g' }] },
  { id: 'd28', mealType: 'Dinner', diet: 'vegan', name: 'Vegan Chili', baseCalories: 540, baseProtein: 24, baseCarbs: 88, baseFat: 10,
    baseItems: [{ food: 'Black beans, cooked', qty: '150g' }, { food: 'Kidney beans, cooked', qty: '150g' }, { food: 'Tomatoes, canned', qty: '150g' }, { food: 'Brown rice, cooked', qty: '100g' }] },
  { id: 'd29', mealType: 'Dinner', diet: 'vegan', name: 'Lentil Bolognese & Pasta', baseCalories: 570, baseProtein: 26, baseCarbs: 90, baseFat: 10,
    baseItems: [{ food: 'Lentils, cooked', qty: '200g' }, { food: 'Whole-wheat pasta', qty: '140g' }, { food: 'Marinara sauce', qty: '120g' }] },
  { id: 'd30', mealType: 'Dinner', diet: 'vegan', name: 'Vegan Pad See Ew', baseCalories: 560, baseProtein: 22, baseCarbs: 76, baseFat: 18,
    baseItems: [{ food: 'Firm tofu', qty: '160g' }, { food: 'Rice noodles', qty: '160g' }, { food: 'Broccoli', qty: '100g' }, { food: 'Soy sauce', qty: '15ml' }] },
  { id: 'd31', mealType: 'Dinner', diet: 'vegan', name: 'Roasted Vegetable & Chickpea Grain Bowl', baseCalories: 550, baseProtein: 22, baseCarbs: 78, baseFat: 16,
    baseItems: [{ food: 'Chickpeas, cooked', qty: '180g' }, { food: 'Farro, cooked', qty: '130g' }, { food: 'Roasted vegetables', qty: '150g' }, { food: 'Tahini', qty: '15g' }] },

  // Dinner — vegetarian (9 more, 10 total with d6)
  { id: 'd32', mealType: 'Dinner', diet: 'vegetarian', name: 'Eggplant Parmesan & Side Salad', baseCalories: 580, baseProtein: 28, baseCarbs: 58, baseFat: 24,
    baseItems: [{ food: 'Eggplant', qty: '200g' }, { food: 'Mozzarella', qty: '80g' }, { food: 'Marinara sauce', qty: '120g' }, { food: 'Whole-wheat pasta', qty: '100g' }] },
  { id: 'd33', mealType: 'Dinner', diet: 'vegetarian', name: 'Paneer Butter Masala & Rice', baseCalories: 610, baseProtein: 26, baseCarbs: 62, baseFat: 28,
    baseItems: [{ food: 'Paneer', qty: '170g' }, { food: 'Tomato curry sauce', qty: '150g' }, { food: 'Basmati rice, cooked', qty: '150g' }] },
  { id: 'd34', mealType: 'Dinner', diet: 'vegetarian', name: 'Vegetable Lasagna', baseCalories: 590, baseProtein: 28, baseCarbs: 62, baseFat: 24,
    baseItems: [{ food: 'Ricotta cheese', qty: '120g' }, { food: 'Mozzarella', qty: '60g' }, { food: 'Mixed vegetables', qty: '150g' }, { food: 'Whole-wheat lasagna sheets', qty: '100g' }] },
  { id: 'd35', mealType: 'Dinner', diet: 'vegetarian', name: 'Stuffed Portobello Mushrooms', baseCalories: 480, baseProtein: 24, baseCarbs: 42, baseFat: 24,
    baseItems: [{ food: 'Portobello mushrooms', qty: '3' }, { food: 'Feta cheese', qty: '50g' }, { food: 'Quinoa, cooked', qty: '120g' }, { food: 'Spinach', qty: '60g' }] },
  { id: 'd36', mealType: 'Dinner', diet: 'vegetarian', name: 'Egg & Vegetable Fried Rice', baseCalories: 520, baseProtein: 22, baseCarbs: 66, baseFat: 17,
    baseItems: [{ food: 'Whole eggs', qty: '3' }, { food: 'Brown rice, cooked', qty: '180g' }, { food: 'Mixed vegetables', qty: '120g' }] },
  { id: 'd37', mealType: 'Dinner', diet: 'vegetarian', name: 'Spinach & Cheese Enchiladas', baseCalories: 560, baseProtein: 26, baseCarbs: 58, baseFat: 24,
    baseItems: [{ food: 'Spinach', qty: '100g' }, { food: 'Cheddar cheese', qty: '70g' }, { food: 'Corn tortillas', qty: '3' }, { food: 'Enchilada sauce', qty: '100g' }] },
  { id: 'd38', mealType: 'Dinner', diet: 'vegetarian', name: 'Margherita Pizza & Side Salad', baseCalories: 570, baseProtein: 26, baseCarbs: 64, baseFat: 22,
    baseItems: [{ food: 'Mozzarella', qty: '90g' }, { food: 'Whole-wheat pizza base', qty: '150g' }, { food: 'Tomato', qty: '80g' }, { food: 'Basil', qty: '5g' }] },
  { id: 'd39', mealType: 'Dinner', diet: 'vegetarian', name: 'Vegetable & Halloumi Skewers', baseCalories: 520, baseProtein: 26, baseCarbs: 44, baseFat: 26,
    baseItems: [{ food: 'Halloumi', qty: '120g' }, { food: 'Zucchini', qty: '80g' }, { food: 'Bell peppers', qty: '80g' }, { food: 'Quinoa, cooked', qty: '110g' }] },
  { id: 'd40', mealType: 'Dinner', diet: 'vegetarian', name: 'Broccoli & Cheddar Stuffed Baked Potato', baseCalories: 540, baseProtein: 22, baseCarbs: 78, baseFat: 16,
    baseItems: [{ food: 'Baked potato', qty: '250g' }, { food: 'Broccoli', qty: '100g' }, { food: 'Cheddar cheese', qty: '60g' }] },

  // Snack — vegetarian (8 more, 10 total with s1–s2)
  { id: 's6', mealType: 'Snack', diet: 'vegetarian', name: 'Greek Yogurt & Honey', baseCalories: 230, baseProtein: 20, baseCarbs: 22, baseFat: 7,
    baseItems: [{ food: 'Greek yogurt, plain', qty: '200g' }, { food: 'Honey', qty: '15g' }, { food: 'Walnuts', qty: '10g' }] },
  { id: 's7', mealType: 'Snack', diet: 'vegetarian', name: 'Cheese & Whole-Grain Crackers', baseCalories: 260, baseProtein: 14, baseCarbs: 24, baseFat: 13,
    baseItems: [{ food: 'Cheddar cheese', qty: '50g' }, { food: 'Whole-grain crackers', qty: '30g' }, { food: 'Grapes', qty: '60g' }] },
  { id: 's8', mealType: 'Snack', diet: 'vegetarian', name: 'Hard-Boiled Eggs & Cherry Tomatoes', baseCalories: 190, baseProtein: 16, baseCarbs: 6, baseFat: 12,
    baseItems: [{ food: 'Hard-boiled eggs', qty: '2' }, { food: 'Cherry tomatoes', qty: '80g' }, { food: 'Salt & pepper', qty: 'to taste' }] },
  { id: 's9', mealType: 'Snack', diet: 'vegetarian', name: 'Cottage Cheese & Berries', baseCalories: 200, baseProtein: 21, baseCarbs: 18, baseFat: 5,
    baseItems: [{ food: 'Cottage cheese', qty: '180g' }, { food: 'Mixed berries', qty: '80g' }] },
  { id: 's10', mealType: 'Snack', diet: 'vegetarian', name: 'String Cheese & Apple', baseCalories: 210, baseProtein: 12, baseCarbs: 22, baseFat: 9,
    baseItems: [{ food: 'String cheese', qty: '2' }, { food: 'Apple', qty: '1' }] },
  { id: 's11', mealType: 'Snack', diet: 'vegetarian', name: 'Yogurt Parfait', baseCalories: 250, baseProtein: 18, baseCarbs: 32, baseFat: 6,
    baseItems: [{ food: 'Greek yogurt, plain', qty: '180g' }, { food: 'Granola', qty: '30g' }, { food: 'Honey', qty: '10g' }] },
  { id: 's12', mealType: 'Snack', diet: 'vegetarian', name: 'Egg & Cheese Roll-Up', baseCalories: 240, baseProtein: 17, baseCarbs: 16, baseFat: 13,
    baseItems: [{ food: 'Whole eggs', qty: '2' }, { food: 'Cheddar cheese', qty: '20g' }, { food: 'Whole-grain tortilla', qty: '1' }] },
  { id: 's13', mealType: 'Snack', diet: 'vegetarian', name: 'Ricotta & Berry Toast', baseCalories: 230, baseProtein: 13, baseCarbs: 28, baseFat: 8,
    baseItems: [{ food: 'Ricotta cheese', qty: '80g' }, { food: 'Whole-grain toast', qty: '30g' }, { food: 'Mixed berries', qty: '50g' }] },

  // Snack — vegan (7 more, 10 total with s3–s5)
  { id: 's14', mealType: 'Snack', diet: 'vegan', name: 'Trail Mix', baseCalories: 260, baseProtein: 8, baseCarbs: 22, baseFat: 17,
    baseItems: [{ food: 'Mixed nuts', qty: '30g' }, { food: 'Raisins', qty: '20g' }, { food: 'Pumpkin seeds', qty: '15g' }] },
  { id: 's15', mealType: 'Snack', diet: 'vegan', name: 'Roasted Chickpeas', baseCalories: 190, baseProtein: 10, baseCarbs: 27, baseFat: 5,
    baseItems: [{ food: 'Chickpeas, cooked', qty: '150g' }, { food: 'Olive oil', qty: '8g' }, { food: 'Spices', qty: 'to taste' }] },
  { id: 's16', mealType: 'Snack', diet: 'vegan', name: 'Rice Cakes & Almond Butter', baseCalories: 210, baseProtein: 6, baseCarbs: 24, baseFat: 11,
    baseItems: [{ food: 'Rice cakes', qty: '2' }, { food: 'Almond butter', qty: '20g' }] },
  { id: 's17', mealType: 'Snack', diet: 'vegan', name: 'Banana & Peanut Butter', baseCalories: 230, baseProtein: 8, baseCarbs: 30, baseFat: 10,
    baseItems: [{ food: 'Banana', qty: '1' }, { food: 'Peanut butter', qty: '20g' }] },
  { id: 's18', mealType: 'Snack', diet: 'vegan', name: 'Vegan Protein Smoothie', baseCalories: 220, baseProtein: 22, baseCarbs: 24, baseFat: 4,
    baseItems: [{ food: 'Pea protein powder', qty: '1 scoop' }, { food: 'Oat milk', qty: '250ml' }, { food: 'Banana', qty: '1' }] },
  { id: 's19', mealType: 'Snack', diet: 'vegan', name: 'Dates & Almonds', baseCalories: 220, baseProtein: 5, baseCarbs: 32, baseFat: 9,
    baseItems: [{ food: 'Dates', qty: '4' }, { food: 'Almonds', qty: '15g' }] },
  { id: 's20', mealType: 'Snack', diet: 'vegan', name: 'Veggie Sticks & Guacamole', baseCalories: 180, baseProtein: 4, baseCarbs: 16, baseFat: 12,
    baseItems: [{ food: 'Carrot sticks', qty: '80g' }, { food: 'Celery', qty: '50g' }, { food: 'Guacamole', qty: '60g' }] },

  // Snack — pescatarian (10, none existed)
  { id: 's21', mealType: 'Snack', diet: 'pescatarian', name: 'Smoked Salmon & Crackers', baseCalories: 240, baseProtein: 17, baseCarbs: 20, baseFat: 11,
    baseItems: [{ food: 'Smoked salmon', qty: '60g' }, { food: 'Whole-grain crackers', qty: '25g' }, { food: 'Cream cheese', qty: '20g' }] },
  { id: 's22', mealType: 'Snack', diet: 'pescatarian', name: 'Tuna & Crackers', baseCalories: 220, baseProtein: 20, baseCarbs: 20, baseFat: 7,
    baseItems: [{ food: 'Tuna, canned in water', qty: '100g' }, { food: 'Whole-grain crackers', qty: '25g' }] },
  { id: 's23', mealType: 'Snack', diet: 'pescatarian', name: 'Shrimp Cocktail', baseCalories: 160, baseProtein: 24, baseCarbs: 10, baseFat: 2,
    baseItems: [{ food: 'Cooked shrimp', qty: '150g' }, { food: 'Cocktail sauce', qty: '30g' }] },
  { id: 's24', mealType: 'Snack', diet: 'pescatarian', name: 'Sardines & Rice Cakes', baseCalories: 230, baseProtein: 18, baseCarbs: 18, baseFat: 10,
    baseItems: [{ food: 'Sardines in olive oil', qty: '80g' }, { food: 'Rice cakes', qty: '2' }] },
  { id: 's25', mealType: 'Snack', diet: 'pescatarian', name: 'Smoked Trout Pâté & Cucumber', baseCalories: 210, baseProtein: 16, baseCarbs: 8, baseFat: 13,
    baseItems: [{ food: 'Smoked trout', qty: '70g' }, { food: 'Cream cheese', qty: '30g' }, { food: 'Cucumber slices', qty: '80g' }] },
  { id: 's26', mealType: 'Snack', diet: 'pescatarian', name: 'Tuna Salad Lettuce Cups', baseCalories: 200, baseProtein: 22, baseCarbs: 6, baseFat: 10,
    baseItems: [{ food: 'Tuna, canned in water', qty: '120g' }, { food: 'Light mayo', qty: '15g' }, { food: 'Lettuce cups', qty: '3' }] },
  { id: 's27', mealType: 'Snack', diet: 'pescatarian', name: 'Anchovy & Tomato Toast', baseCalories: 210, baseProtein: 12, baseCarbs: 22, baseFat: 9,
    baseItems: [{ food: 'Anchovies', qty: '25g' }, { food: 'Tomato', qty: '60g' }, { food: 'Whole-grain toast', qty: '40g' }] },
  { id: 's28', mealType: 'Snack', diet: 'pescatarian', name: 'Crab Salad & Crackers', baseCalories: 220, baseProtein: 18, baseCarbs: 18, baseFat: 9,
    baseItems: [{ food: 'Crab meat', qty: '100g' }, { food: 'Light mayo', qty: '15g' }, { food: 'Whole-grain crackers', qty: '25g' }] },
  { id: 's29', mealType: 'Snack', diet: 'pescatarian', name: 'Pickled Herring & Rye Crisp', baseCalories: 230, baseProtein: 15, baseCarbs: 16, baseFat: 12,
    baseItems: [{ food: 'Pickled herring', qty: '80g' }, { food: 'Rye crispbread', qty: '3' }] },
  { id: 's30', mealType: 'Snack', diet: 'pescatarian', name: 'Smoked Mackerel & Cucumber', baseCalories: 220, baseProtein: 17, baseCarbs: 6, baseFat: 15,
    baseItems: [{ food: 'Smoked mackerel', qty: '80g' }, { food: 'Cucumber', qty: '80g' }, { food: 'Lemon juice', qty: '10ml' }] },

  // Snack — omnivore (10, none existed)
  { id: 's31', mealType: 'Snack', diet: 'omnivore', name: 'Turkey Jerky & Almonds', baseCalories: 220, baseProtein: 20, baseCarbs: 10, baseFat: 11,
    baseItems: [{ food: 'Turkey jerky', qty: '40g' }, { food: 'Almonds', qty: '15g' }] },
  { id: 's32', mealType: 'Snack', diet: 'omnivore', name: 'Deli Turkey Roll-Ups', baseCalories: 190, baseProtein: 22, baseCarbs: 5, baseFat: 9,
    baseItems: [{ food: 'Turkey breast slices', qty: '100g' }, { food: 'Cheese', qty: '20g' }, { food: 'Cucumber', qty: '50g' }] },
  { id: 's33', mealType: 'Snack', diet: 'omnivore', name: 'Chicken Salad Lettuce Cups', baseCalories: 210, baseProtein: 24, baseCarbs: 6, baseFat: 10,
    baseItems: [{ food: 'Shredded chicken', qty: '120g' }, { food: 'Light mayo', qty: '15g' }, { food: 'Lettuce cups', qty: '3' }] },
  { id: 's34', mealType: 'Snack', diet: 'omnivore', name: 'Beef Jerky & Apple', baseCalories: 210, baseProtein: 18, baseCarbs: 22, baseFat: 6,
    baseItems: [{ food: 'Beef jerky', qty: '35g' }, { food: 'Apple', qty: '1' }] },
  { id: 's35', mealType: 'Snack', diet: 'omnivore', name: 'Ham & Cheese Roll-Ups', baseCalories: 200, baseProtein: 19, baseCarbs: 4, baseFat: 12,
    baseItems: [{ food: 'Deli ham', qty: '90g' }, { food: 'Cheddar cheese', qty: '30g' }] },
  { id: 's36', mealType: 'Snack', diet: 'omnivore', name: 'Hard Salami & Cheese', baseCalories: 250, baseProtein: 16, baseCarbs: 12, baseFat: 16,
    baseItems: [{ food: 'Hard salami', qty: '50g' }, { food: 'Cheese cubes', qty: '40g' }, { food: 'Grapes', qty: '50g' }] },
  { id: 's37', mealType: 'Snack', diet: 'omnivore', name: 'Chicken Skewers', baseCalories: 220, baseProtein: 28, baseCarbs: 10, baseFat: 7,
    baseItems: [{ food: 'Grilled chicken breast cubes', qty: '150g' }, { food: 'BBQ sauce', qty: '20g' }] },
  { id: 's38', mealType: 'Snack', diet: 'omnivore', name: 'Prosciutto-Wrapped Melon', baseCalories: 170, baseProtein: 12, baseCarbs: 16, baseFat: 7,
    baseItems: [{ food: 'Prosciutto', qty: '50g' }, { food: 'Cantaloupe', qty: '150g' }] },
  { id: 's39', mealType: 'Snack', diet: 'omnivore', name: 'Mini Meatballs', baseCalories: 240, baseProtein: 22, baseCarbs: 8, baseFat: 14,
    baseItems: [{ food: 'Lean ground beef meatballs', qty: '150g' }, { food: 'Marinara sauce', qty: '50g' }] },
  { id: 's40', mealType: 'Snack', diet: 'omnivore', name: 'Turkey & Cheese Pinwheels', baseCalories: 230, baseProtein: 18, baseCarbs: 18, baseFat: 10,
    baseItems: [{ food: 'Turkey breast', qty: '80g' }, { food: 'Cream cheese', qty: '20g' }, { food: 'Whole-grain tortilla', qty: '1' }] },
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

// Scales a specific template's calories/macros/items to a slot's target —
// shared by both the auto-generator below and the coach's manual meal picker
// (CalorieCalculatorModal), so picking a meal by hand produces the exact same
// shape/scaling as an auto-generated one.
export function scaleTemplateToTarget(template: MealTemplate, target: MealTarget): MealSlot {
  const factor = target.target_calories / template.baseCalories;
  return {
    slot: target.slot,
    label: template.mealType,
    target_calories: target.target_calories,
    target_protein: target.target_protein,
    target_carbs: target.target_carbs,
    target_fat: target.target_fat,
    name: template.name,
    items: template.baseItems.map((i) => scaleItem(i, factor)),
    actual_calories: Math.round(template.baseCalories * factor),
    actual_protein: Math.round(template.baseProtein * factor),
    actual_carbs: Math.round(template.baseCarbs * factor),
    actual_fat: Math.round(template.baseFat * factor),
  };
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

  return scaleTemplateToTarget(best, target);
}
