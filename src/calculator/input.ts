import { z } from 'zod';
import { CalculationError, type InputIssue } from './errors.js';

const finiteAmount = z
  .number({ error: 'Podaj liczbę.' })
  .finite('Liczba musi być skończona.')
  .max(Number.MAX_SAFE_INTEGER, 'Liczba przekracza obsługiwany zakres.');
const quantity = finiteAmount.min(0, 'Wartość nie może być ujemna.');
const positiveQuantity = finiteAmount.gt(0, 'Wartość musi być większa od zera.');
const label = z
  .string({ error: 'Podaj tekst.' })
  .min(1, 'Wartość jest wymagana.')
  .max(80, 'Maksymalna długość to 80 znaków.')
  .refine((value) => value.trim() === value, 'Usuń spacje z początku i końca wartości.')
  .refine(
    (value) => !/\u0000|\p{Surrogate}/u.test(value),
    'Usuń niedozwolone lub uszkodzone znaki z tekstu.',
  );

export const inputSchema = z
  .object(
    {
      order: z
        .object(
          { item: label, quantity },
          { error: 'Podaj zamawiany produkt i ilość, np. {"item":"SZAFKA","quantity":10}.' },
        )
        .strict(),
      items: z
        .array(
          z
            .object(
              {
                code: label,
                unit: label,
                purchasePack: positiveQuantity.optional(),
              },
              {
                error:
                  'Każdy element katalogu opisz kodem „code” i jednostką „unit”, np. {"code":"PLYTA","unit":"m2"}.',
              },
            )
            .strict(),
          { error: 'Podaj listę elementów, np. [{"code":"PLYTA","unit":"m2"}].' },
        )
        .min(1, 'Dodaj przynajmniej jeden element do katalogu.'),
      bom: z.array(
        z
          .object(
            {
              parent: label,
              component: label,
              quantity: positiveQuantity,
              wastePct: z
                .number({ error: 'Podaj liczbę.' })
                .min(0, 'Odpad musi mieścić się w zakresie 0–100%.')
                .max(100, 'Odpad musi mieścić się w zakresie 0–100%.'),
            },
            {
              error: 'Każda pozycja receptury powinna zawierać rodzica, składnik, zużycie i odpad.',
            },
          )
          .strict(),
        { error: 'Podaj listę składników receptury. Jeśli nie ma receptur, wpisz [].' },
      ),
      stock: z.array(
        z
          .object(
            { item: label, quantity },
            { error: 'Każdy stan zapisz jako kod i ilość, np. {"item":"PLYTA","quantity":3}.' },
          )
          .strict(),
        {
          error:
            'Podaj listę stanów magazynowych, np. [{"item":"PLYTA","quantity":3}]. Jeśli nie masz zapasów, wpisz [].',
        },
      ),
    },
    { error: 'Wklej jeden zestaw danych w nawiasach {...}, z polami order, items, bom i stock.' },
  )
  .strict();

export type CalculationInput = z.infer<typeof inputSchema>;
export type Item = CalculationInput['items'][number];
export type BomLine = CalculationInput['bom'][number];

export function validateInput(value: unknown): CalculationInput {
  const parsed = inputSchema.safeParse(value);
  if (!parsed.success) {
    throw new CalculationError(
      'INVALID_INPUT',
      'Popraw zaznaczone dane.',
      parsed.error.issues.map((issue) => ({
        path: issue.path.join('.') || 'input',
        message:
          issue.code === 'unrecognized_keys'
            ? `Usuń nieznane pola: ${issue.keys.join(', ')}.`
            : issue.message,
      })),
    );
  }

  const input = parsed.data;
  const issues: InputIssue[] = [];
  const items = new Map(input.items.map((item) => [item.code, item]));
  const manufactured = new Set(input.bom.map((line) => line.parent));
  const itemCodes = new Set<string>();
  const stockCodes = new Set<string>();
  const bomPairs = new Set<string>();
  const add = (path: string, message: string) => issues.push({ path, message });
  const reference = (code: string, path: string) => {
    if (!items.has(code)) add(path, `Element „${code}” nie istnieje w katalogu.`);
  };
  const wholePieces = (code: string, amount: number, path: string) => {
    if (items.get(code)?.unit === 'szt' && !Number.isInteger(amount)) {
      add(path, `Element „${code}” w jednostce szt wymaga całkowitej ilości.`);
    }
  };

  input.items.forEach((item, index) => {
    if (itemCodes.has(item.code)) add(`items.${index}.code`, `Powtórzony kod „${item.code}”.`);
    itemCodes.add(item.code);
    if (item.purchasePack !== undefined) {
      wholePieces(item.code, item.purchasePack, `items.${index}.purchasePack`);
      if (manufactured.has(item.code))
        add(
          `items.${index}.purchasePack`,
          `„${item.code}” ma recepturę. Usuń opakowanie zakupu albo recepturę.`,
        );
    }
  });
  reference(input.order.item, 'order.item');
  wholePieces(input.order.item, input.order.quantity, 'order.quantity');
  input.bom.forEach((line, index) => {
    reference(line.parent, `bom.${index}.parent`);
    reference(line.component, `bom.${index}.component`);
    const pair = JSON.stringify([line.parent, line.component]);
    if (bomPairs.has(pair))
      add(`bom.${index}`, `Powtórzona pozycja: ${line.parent} → ${line.component}.`);
    bomPairs.add(pair);
  });
  input.stock.forEach((entry, index) => {
    reference(entry.item, `stock.${index}.item`);
    wholePieces(entry.item, entry.quantity, `stock.${index}.quantity`);
    if (stockCodes.has(entry.item))
      add(`stock.${index}.item`, `Powtórzony stan magazynowy „${entry.item}”.`);
    stockCodes.add(entry.item);
  });
  if (issues.length) throw new CalculationError('INVALID_INPUT', 'Popraw zaznaczone dane.', issues);
  return input;
}
