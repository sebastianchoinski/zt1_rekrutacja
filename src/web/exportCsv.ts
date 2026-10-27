import type { CalculationResult } from '../calculator/types.js';

function cell(value: string | number | null): string {
  let text =
    value === null ? '' : typeof value === 'number' ? String(value).replace('.', ',') : value;
  if (typeof value === 'string' && /^[\s]*[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function createCsv(result: CalculationResult): string {
  const rows: (string | number | null)[][] = [
    [
      'Materiał',
      'Jednostka',
      'Brutto',
      'Stan',
      'Netto',
      'Wielkość opakowania',
      'Liczba opakowań',
      'Do zakupu',
      'Nadwyżka zakupu',
    ],
    ...result.requirements.map((entry) => [
      entry.item,
      entry.unit,
      entry.gross,
      entry.stock,
      entry.net,
      entry.purchasePack,
      entry.packages,
      entry.purchaseQuantity,
      entry.surplus,
    ]),
  ];
  return '\uFEFF' + rows.map((row) => row.map(cell).join(';')).join('\r\n');
}

export function downloadCsv(result: CalculationResult): void {
  const url = URL.createObjectURL(
    new Blob([createCsv(result)], { type: 'text/csv;charset=utf-8' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = 'zapotrzebowanie.csv';
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
