// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import example from '../examples/cabinet.json';
import { calculateRequirements } from '../src/calculator/calculateRequirements.js';
import { App } from '../src/web/App.js';
import { calculationPath } from '../src/web/navigation.js';

const saved = {
  id: '8a88e65d-24c2-4524-9951-3c0e210fba15',
  createdAt: '2026-01-01T12:00:00Z',
  orderItem: 'SZAFKA',
  orderQuantity: 10,
  materialCount: 3,
  input: { stock: example.stock, bom: example.bom, items: example.items, order: example.order },
  result: calculateRequirements(example),
};
const fetchMock = vi.fn();
const response = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

async function openJsonEditor(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Dane' }));
  await user.click(screen.getByRole('button', { name: 'Edytuj JSON' }));
}

function visit(path: string) {
  act(() => {
    window.history.pushState(null, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
}

beforeAll(() => {
  // jsdom does not implement native dialog methods; browser focus behaviour is checked manually.
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
});
beforeEach(() => {
  window.history.replaceState(null, '', '/');
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('groups data actions, closes them with Escape and lets the example reset be undone', async () => {
  const user = userEvent.setup();
  render(<App />);
  const trigger = screen.getByRole('button', { name: 'Dane' });
  await user.click(trigger);
  expect(screen.getByRole('button', { name: 'Edytuj JSON' })).toBeInTheDocument();
  await user.keyboard('{Escape}');
  expect(screen.getByText('Edytuj JSON')).not.toBeVisible();
  expect(trigger).toHaveFocus();
  fireEvent.change(screen.getByRole('textbox', { name: 'Ilość zamówienia' }), {
    target: { value: '12' },
  });
  await user.click(trigger);
  await user.click(screen.getByRole('button', { name: 'Przywróć przykład' }));
  expect(screen.getByRole('textbox', { name: 'Ilość zamówienia' })).toHaveValue('10');
  expect(screen.getByText('Edytuj JSON')).not.toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Cofnij' }));
  expect(screen.getByRole('textbox', { name: 'Ilość zamówienia' })).toHaveValue('12');
  expect(fetchMock).not.toHaveBeenCalled();
});

it('calculates the example, explains the result and marks it stale after an edit', async () => {
  const user = userEvent.setup();
  fetchMock.mockResolvedValue(response(saved));
  render(<App />);
  await user.click(screen.getByRole('button', { name: /Oblicz zapotrzebowanie/ }));
  expect(await screen.findByRole('status')).toHaveTextContent('Obliczono zapotrzebowanie');
  const table = screen.getByRole('table', {
    name: 'Zapotrzebowanie materiałowe i ilości do zakupu',
  });
  const row = within(table).getByRole('rowheader', { name: /PLYTA/ }).closest('tr')!;
  expect(within(row).getByText('15,4')).toBeInTheDocument();
  expect(within(row).getByText('12,4')).toBeInTheDocument();
  expect(within(row).getByText('17,4')).toBeInTheDocument();
  await user.click(within(row).getByRole('button'));
  expect(screen.getByText('3 opak.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Pobierz CSV/ })).toBeEnabled();
  await user.clear(screen.getByRole('textbox', { name: 'Ilość zamówienia' }));
  await user.type(screen.getByRole('textbox', { name: 'Ilość zamówienia' }), '12');
  expect(screen.getByText(/Dane zostały zmienione/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Pobierz CSV/ })).toBeDisabled();
  expect(fetchMock).toHaveBeenCalledOnce();
  expect(window.location.pathname).toBe(calculationPath(saved));
});

it('does not silently interpret an empty quantity as zero', async () => {
  const user = userEvent.setup();
  render(<App />);
  const quantity = screen.getByRole('textbox', { name: 'Ilość zamówienia' });
  await user.clear(quantity);
  await user.click(screen.getByRole('button', { name: /Oblicz zapotrzebowanie/ }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Popraw zaznaczone dane.');
  expect(quantity).toHaveAttribute('aria-invalid', 'true');
  expect(fetchMock).not.toHaveBeenCalled();
});

it('accepts a decimal comma in material stock', async () => {
  const user = userEvent.setup();
  const input = {
    ...example,
    stock: example.stock.map((entry) =>
      entry.item === 'PLYTA' ? { ...entry, quantity: 3.5 } : entry,
    ),
  };
  fetchMock.mockResolvedValue(response({ ...saved, input, result: calculateRequirements(input) }));
  render(<App />);
  await user.click(screen.getByRole('tab', { name: /Magazyn/ }));
  const stock = screen.getByRole('textbox', { name: 'Stan PLYTA' });
  await user.clear(stock);
  await user.type(stock, '3,5');
  await user.click(screen.getByRole('button', { name: /Oblicz zapotrzebowanie/ }));
  await screen.findByText('Obliczono zapotrzebowanie');
  const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
  expect(body.stock.find((entry: { item: string }) => entry.item === 'PLYTA').quantity).toBe(3.5);
});

it('keeps current data when JSON contains a cycle', async () => {
  const user = userEvent.setup();
  render(<App />);
  await openJsonEditor(user);
  const input = structuredClone(example);
  input.bom.push({ parent: 'KORPUS', component: 'SZAFKA', quantity: 1, wastePct: 0 });
  fireEvent.change(screen.getByRole('textbox', { name: 'Dane wejściowe JSON' }), {
    target: { value: JSON.stringify(input) },
  });
  await user.click(screen.getByRole('button', { name: 'Zastosuj dane' }));
  expect(screen.getByRole('alert')).toHaveTextContent(/cykl/i);
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Anuluj' }));
  expect(screen.getByRole('textbox', { name: 'Ilość zamówienia' })).toHaveValue('10');
  expect(fetchMock).not.toHaveBeenCalled();
});

it('restores a deleted BOM line with undo', async () => {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('button', { name: 'Usuń KORPUS → OBRZEZE' }));
  expect(screen.queryByRole('textbox', { name: 'Ilość KORPUS → OBRZEZE' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Cofnij' }));
  expect(screen.getByRole('textbox', { name: 'Ilość KORPUS → OBRZEZE' })).toHaveValue('6');
});

it('opens a history snapshot in a new tab and leaves the original draft in place', async () => {
  const user = userEvent.setup();
  fetchMock.mockResolvedValueOnce(response([saved])).mockResolvedValueOnce(response(saved));
  render(<App />);
  await user.clear(screen.getByRole('textbox', { name: 'Ilość zamówienia' }));
  await user.type(screen.getByRole('textbox', { name: 'Ilość zamówienia' }), '99');
  await user.click(screen.getByRole('button', { name: 'Historia' }));
  const link = await screen.findByRole('link', { name: /Otwórz/ });
  expect(link).toHaveAttribute('href', calculationPath(saved));
  expect(link).toHaveAttribute('target', '_blank');
  expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  await user.click(link);
  expect(window.location.pathname).toBe('/historia');
  expect(fetchMock).toHaveBeenCalledOnce();
  await user.click(screen.getByRole('button', { name: 'Kalkulator' }));
  expect(screen.getByRole('textbox', { name: 'Ilość zamówienia' })).toHaveValue('99');

  // A new tab mounts its own application at the saved URL.
  cleanup();
  window.history.replaceState(null, '', calculationPath(saved));
  render(<App />);
  await screen.findByRole('table', { name: 'Zapotrzebowanie materiałowe i ilości do zakupu' });
  expect(screen.getByRole('textbox', { name: 'Ilość zamówienia' })).toHaveValue('10');
  expect(screen.queryByText(/Dane zostały zmienione/)).not.toBeInTheDocument();
  expect(window.location.pathname).toBe(calculationPath(saved));
});

it('loads a calculation opened directly by its slug', async () => {
  window.history.replaceState(null, '', calculationPath(saved));
  fetchMock.mockResolvedValue(response(saved));
  render(<App />);
  await screen.findByRole('table', { name: 'Zapotrzebowanie materiałowe i ilości do zakupu' });
  expect(screen.getByRole('textbox', { name: 'Ilość zamówienia' })).toHaveValue('10');
  expect(fetchMock).toHaveBeenCalledWith(`/api/calculations/${saved.id}`, undefined);
  expect(fetchMock).toHaveBeenCalledOnce();
});

it('reopens the saved snapshot when its draft was edited before visiting history', async () => {
  const user = userEvent.setup();
  fetchMock.mockResolvedValueOnce(response(saved)).mockResolvedValueOnce(response([saved]));
  render(<App />);
  await user.click(screen.getByRole('button', { name: /Oblicz zapotrzebowanie/ }));
  await screen.findByRole('table', { name: 'Zapotrzebowanie materiałowe i ilości do zakupu' });
  fireEvent.change(screen.getByRole('textbox', { name: 'Ilość zamówienia' }), {
    target: { value: '99' },
  });
  await user.click(screen.getByRole('button', { name: 'Historia' }));
  await screen.findByRole('link', { name: /Otwórz/ });
  visit(calculationPath(saved));
  await waitFor(() =>
    expect(screen.getByRole('textbox', { name: 'Ilość zamówienia' })).toHaveValue('10'),
  );
  expect(screen.queryByText(/Dane zostały zmienione/)).not.toBeInTheDocument();
  expect(window.location.pathname).toBe(calculationPath(saved));
});

it('returns to history when the browser goes back from a calculation', async () => {
  const user = userEvent.setup();
  fetchMock
    .mockResolvedValueOnce(response([saved]))
    .mockResolvedValueOnce(response(saved))
    .mockResolvedValue(response([saved]));
  render(<App />);
  await user.click(screen.getByRole('button', { name: 'Historia' }));
  await screen.findByRole('link', { name: /Otwórz/ });
  visit(calculationPath(saved));
  await screen.findByRole('table', { name: 'Zapotrzebowanie materiałowe i ilości do zakupu' });
  act(() => window.history.back());
  expect(await screen.findByRole('heading', { name: 'Historia kalkulacji' })).toBeInTheDocument();
  expect(window.location.pathname).toBe('/historia');
});

it('shows a recoverable error when a saved calculation cannot be loaded', async () => {
  const user = userEvent.setup();
  window.history.replaceState(null, '', calculationPath(saved));
  fetchMock
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          code: 'REQUEST_ERROR',
          message: 'Nie znaleziono zasobu.',
          issues: [],
        }),
        { status: 404 },
      ),
    )
    .mockResolvedValueOnce(response(saved));
  render(<App />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Nie znaleziono zasobu.');
  await user.click(screen.getByRole('button', { name: 'Spróbuj ponownie' }));
  await screen.findByRole('table', { name: 'Zapotrzebowanie materiałowe i ilości do zakupu' });
  expect(window.location.pathname).toBe(calculationPath(saved));
});

it('does not overwrite the calculator when an abandoned history request finishes', async () => {
  const user = userEvent.setup();
  let finish!: (value: Response) => void;
  fetchMock.mockResolvedValueOnce(response([saved])).mockImplementationOnce(
    () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
  );
  render(<App />);
  fireEvent.change(screen.getByRole('textbox', { name: 'Ilość zamówienia' }), {
    target: { value: '99' },
  });
  await user.click(screen.getByRole('button', { name: 'Historia' }));
  await screen.findByRole('link', { name: /Otwórz/ });
  visit(calculationPath(saved));
  expect(screen.getByRole('status')).toHaveTextContent('Wczytywanie kalkulacji');
  await user.click(screen.getByRole('button', { name: 'Kalkulator' }));
  await act(async () => {
    finish(response(saved));
  });
  await waitFor(() => expect(window.location.pathname).toBe('/'));
  expect(screen.getByRole('textbox', { name: 'Ilość zamówienia' })).toHaveValue('99');
  expect(
    screen.queryByRole('table', { name: 'Zapotrzebowanie materiałowe i ilości do zakupu' }),
  ).not.toBeInTheDocument();
});

it('handles an invalid calculation address without requesting a different resource', () => {
  window.history.replaceState(null, '', '/historia/niepoprawny-slug');
  render(<App />);
  expect(screen.getByRole('heading', { name: 'Nie znaleziono strony' })).toBeInTheDocument();
  expect(fetchMock).not.toHaveBeenCalled();
});

it('keeps browser navigation when a calculation finishes saving after going back', async () => {
  const user = userEvent.setup();
  let finish!: (value: Response) => void;
  window.history.replaceState(null, '', '/historia');
  fetchMock
    .mockResolvedValueOnce(response([saved]))
    .mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValue(response([saved]));
  render(<App />);
  await screen.findByRole('link', { name: /Otwórz/ });
  await user.click(screen.getByRole('button', { name: 'Kalkulator' }));
  await user.click(screen.getByRole('button', { name: /Oblicz zapotrzebowanie/ }));
  act(() => window.history.back());
  await screen.findByRole('heading', { name: 'Historia kalkulacji' });
  await act(async () => {
    finish(response(saved));
  });
  expect(window.location.pathname).toBe('/historia');
  expect(screen.getByRole('heading', { name: 'Historia kalkulacji' })).toBeInTheDocument();
});

it('shows a recoverable message when the server cannot be reached', async () => {
  const user = userEvent.setup();
  fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
  render(<App />);
  await user.click(screen.getByRole('button', { name: /Oblicz zapotrzebowanie/ }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Nie można połączyć się z serwerem.');
  expect(screen.getByRole('button', { name: /Oblicz zapotrzebowanie/ })).toBeEnabled();
});

it('uses a custom product selector with keyboard navigation', async () => {
  const user = userEvent.setup();
  render(<App />);
  const product = screen.getByRole('combobox', { name: 'Produkt' });
  product.focus();
  await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');
  expect(product).toHaveTextContent('KORPUS');
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  await user.keyboard('ply');
  expect(screen.getByRole('listbox')).toBeInTheDocument();
  await user.keyboard('{Enter}');
  expect(product).toHaveTextContent('PLYTA');
  await user.click(product);
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  expect(product).toHaveFocus();
});

it('shows one inline error for a negative package size', async () => {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('tab', { name: 'Katalog' }));
  await user.type(screen.getByRole('textbox', { name: 'Opakowanie OBRZEZE' }), '-2');
  await user.click(screen.getByRole('button', { name: /Oblicz zapotrzebowanie/ }));
  expect(screen.getAllByText('Wartość musi być większa od zera.')).toHaveLength(1);
  expect(screen.queryByText('Wartość nie może być ujemna.')).not.toBeInTheDocument();
  expect(screen.getByRole('alert')).not.toHaveTextContent('wiersz');
  expect(fetchMock).not.toHaveBeenCalled();
});

it('explains both factors with units and dismisses the success notification', async () => {
  const user = userEvent.setup();
  const input = { ...example, order: { item: 'SZAFKA', quantity: 8 } };
  fetchMock.mockResolvedValue(response({ ...saved, input, result: calculateRequirements(input) }));
  render(<App />);
  fireEvent.change(screen.getByRole('textbox', { name: 'Ilość zamówienia' }), {
    target: { value: '8' },
  });
  await user.click(screen.getByRole('button', { name: /Oblicz zapotrzebowanie/ }));
  await screen.findByText('Obliczono zapotrzebowanie');
  await user.click(screen.getByRole('button', { name: 'ZAWIAS szt' }));
  expect(screen.getByRole('heading', { name: 'Skąd wynika 16 szt ZAWIAS?' })).toBeInTheDocument();
  expect(screen.getByText('8 szt')).toBeInTheDocument();
  expect(screen.getByText('2 szt / szt')).toBeInTheDocument();
  expect(screen.getByText('ZAWIAS / SZAFKA')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Zamknij powiadomienie' }));
  expect(screen.queryByText('Obliczono zapotrzebowanie')).not.toBeInTheDocument();
});

it('adds a material with a selected unit and stores its code rather than its display label', async () => {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('tab', { name: 'Katalog' }));
  await user.type(screen.getByRole('textbox', { name: 'Kod nowego elementu' }), 'LAMINAT');
  await user.click(screen.getByRole('combobox', { name: 'Jednostka nowego elementu' }));
  await user.click(screen.getByRole('option', { name: 'm²' }));
  await user.click(screen.getByRole('button', { name: 'Dodaj' }));
  expect(screen.getByRole('combobox', { name: 'Jednostka LAMINAT' })).toHaveTextContent('m²');
  expect(screen.getByRole('combobox', { name: 'Jednostka nowego elementu' })).toHaveTextContent(
    'm²',
  );
  await openJsonEditor(user);
  const input = JSON.parse(
    (screen.getByRole('textbox', { name: 'Dane wejściowe JSON' }) as HTMLTextAreaElement).value,
  );
  expect(input.items.find((item: { code: string }) => item.code === 'LAMINAT').unit).toBe('m2');
});

it('requires a custom unit and makes it available for the next material', async () => {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('tab', { name: 'Katalog' }));
  await user.type(screen.getByRole('textbox', { name: 'Kod nowego elementu' }), 'KLEJ');
  const selector = screen.getByRole('combobox', { name: 'Jednostka nowego elementu' });
  await user.click(selector);
  await user.click(screen.getByRole('option', { name: 'Własna' }));
  expect(screen.getByRole('combobox', { name: 'Jednostka nowego elementu' })).toHaveValue('');
  expect(screen.getByRole('combobox', { name: 'Jednostka nowego elementu' })).toHaveFocus();
  await user.click(screen.getByRole('button', { name: 'Dodaj' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Wpisz własną jednostkę.');
  expect(screen.queryByRole('combobox', { name: 'Jednostka KLEJ' })).not.toBeInTheDocument();
  await user.type(screen.getByRole('combobox', { name: 'Jednostka nowego elementu' }), ' opak ');
  await user.click(screen.getByRole('button', { name: 'Dodaj' }));
  expect(screen.getByRole('combobox', { name: 'Jednostka KLEJ' })).toHaveValue('opak');
  const restoredSelector = screen.getByRole('combobox', { name: 'Jednostka nowego elementu' });
  expect(restoredSelector).toHaveValue('opak');
  await user.click(
    within(restoredSelector.parentElement!).getByRole('button', {
      name: 'Wybierz jednostkę z listy',
    }),
  );
  expect(screen.getByRole('option', { name: 'opak' })).toBeInTheDocument();
});

it('returns from custom unit entry to the list without adding an item', async () => {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('tab', { name: 'Katalog' }));
  await user.click(screen.getByRole('combobox', { name: 'Jednostka nowego elementu' }));
  await user.click(screen.getByRole('option', { name: 'Własna' }));
  await user.type(screen.getByRole('combobox', { name: 'Jednostka nowego elementu' }), 'opak');
  await user.click(screen.getByRole('button', { name: 'Wybierz jednostkę z listy' }));
  await user.click(screen.getByRole('option', { name: 'kg' }));
  expect(screen.getByRole('combobox', { name: 'Jednostka nowego elementu' })).toHaveTextContent(
    'kg',
  );
  expect(screen.getByRole('combobox', { name: 'Jednostka nowego elementu' })).toHaveFocus();
  expect(
    screen.queryByRole('button', { name: 'Wybierz jednostkę z listy' }),
  ).not.toBeInTheDocument();
});

it('edits an existing unit through the dropdown and lets Escape undo custom entry', async () => {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('tab', { name: 'Katalog' }));
  await user.click(screen.getByRole('combobox', { name: 'Jednostka OBRZEZE' }));
  await user.click(screen.getByRole('option', { name: 'kg' }));
  await user.click(screen.getByRole('combobox', { name: 'Jednostka OBRZEZE' }));
  await user.click(screen.getByRole('option', { name: 'Własna' }));
  await user.type(screen.getByRole('combobox', { name: 'Jednostka OBRZEZE' }), 'rolka');
  await user.keyboard('{Escape}');
  expect(screen.getByRole('combobox', { name: 'Jednostka OBRZEZE' })).toHaveTextContent('kg');
  expect(screen.getByRole('combobox', { name: 'Jednostka OBRZEZE' })).toHaveFocus();
  await user.click(screen.getByRole('combobox', { name: 'Jednostka OBRZEZE' }));
  await user.click(screen.getByRole('option', { name: 'Własna' }));
  await user.type(screen.getByRole('combobox', { name: 'Jednostka OBRZEZE' }), 'rolka');
  await user.click(screen.getByRole('tab', { name: 'Magazyn' }));
  const row = screen.getByRole('rowheader', { name: /OBRZEZE/ }).closest('tr')!;
  expect(within(row).getByText('rolka')).toBeInTheDocument();
});

it('keeps a custom unit editable after leaving the field and reopening the catalog', async () => {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('tab', { name: 'Katalog' }));
  await user.click(screen.getByRole('combobox', { name: 'Jednostka OBRZEZE' }));
  await user.click(screen.getByRole('option', { name: 'Własna' }));
  await user.type(screen.getByRole('combobox', { name: 'Jednostka OBRZEZE' }), 'rolka');
  await user.click(screen.getByRole('textbox', { name: 'Kod nowego elementu' }));
  expect(screen.getByRole('combobox', { name: 'Jednostka OBRZEZE' })).toHaveValue('rolka');
  await user.click(screen.getByRole('tab', { name: 'Magazyn' }));
  await user.click(screen.getByRole('tab', { name: 'Katalog' }));
  const field = screen.getByRole('combobox', { name: 'Jednostka OBRZEZE' });
  expect(field).toHaveValue('rolka');
  await user.clear(field);
  await user.type(field, 'opak');
  await user.click(screen.getByRole('tab', { name: 'Magazyn' }));
  const row = screen.getByRole('rowheader', { name: /OBRZEZE/ }).closest('tr')!;
  expect(within(row).getByText('opak')).toBeInTheDocument();
});

it('explains an invalid stock list and accepts an empty warehouse after correction', async () => {
  const user = userEvent.setup();
  render(<App />);
  await openJsonEditor(user);
  const editor = screen.getByRole('textbox', { name: 'Dane wejściowe JSON' });
  fireEvent.change(editor, {
    target: { value: JSON.stringify({ ...example, stock: { item: 'PLYTA', quantity: 3 } }) },
  });
  await user.click(screen.getByRole('button', { name: 'Zastosuj dane' }));
  const error = screen.getByRole('alert');
  expect(error).toHaveTextContent('Nie udało się wczytać danych.');
  expect(error).toHaveTextContent('Magazyn: Podaj listę stanów magazynowych');
  expect(error).toHaveTextContent('[{"item":"PLYTA","quantity":3}]');
  expect(error).toHaveTextContent('Jeśli nie masz zapasów, wpisz [].');
  expect(error).not.toHaveTextContent('tablicą');
  fireEvent.change(editor, { target: { value: JSON.stringify({ ...example, stock: [] }) } });
  await user.click(screen.getByRole('button', { name: 'Zastosuj dane' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  await user.click(screen.getByRole('tab', { name: 'Magazyn' }));
  expect(screen.getByRole('textbox', { name: 'Stan PLYTA' })).toHaveValue('0');
});

it('identifies the row and field of an invalid stock quantity in JSON', async () => {
  const user = userEvent.setup();
  render(<App />);
  await openJsonEditor(user);
  fireEvent.change(screen.getByRole('textbox', { name: 'Dane wejściowe JSON' }), {
    target: { value: JSON.stringify({ ...example, stock: [{ item: 'PLYTA', quantity: 'trzy' }] }) },
  });
  await user.click(screen.getByRole('button', { name: 'Zastosuj dane' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Magazyn · wiersz 1 · ilość: Podaj liczbę.');
  expect(screen.getByRole('alert')).not.toHaveTextContent('stock.0.quantity');
});

it('adds a catalog item on Enter instead of calculating the existing order', async () => {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('tab', { name: 'Katalog' }));
  await user.type(screen.getByRole('textbox', { name: 'Kod nowego elementu' }), 'WKRET{Enter}');
  expect(screen.getByRole('combobox', { name: 'Jednostka WKRET' })).toHaveTextContent('szt');
  expect(fetchMock).not.toHaveBeenCalled();
});

it('does not let an old undo snapshot overwrite later edits', async () => {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('button', { name: 'Usuń KORPUS → OBRZEZE' }));
  expect(screen.getByRole('button', { name: 'Cofnij' })).toBeInTheDocument();
  fireEvent.change(screen.getByRole('textbox', { name: 'Ilość zamówienia' }), {
    target: { value: '12' },
  });
  expect(screen.queryByRole('button', { name: 'Cofnij' })).not.toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'Ilość zamówienia' })).toHaveValue('12');
});

it('resets custom unit editing when a complete dataset is imported', async () => {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('tab', { name: 'Katalog' }));
  await user.click(screen.getByRole('combobox', { name: 'Jednostka OBRZEZE' }));
  await user.click(screen.getByRole('option', { name: 'Własna' }));
  await user.type(screen.getByRole('combobox', { name: 'Jednostka OBRZEZE' }), 'rolka');
  await openJsonEditor(user);
  fireEvent.change(screen.getByRole('textbox', { name: 'Dane wejściowe JSON' }), {
    target: { value: JSON.stringify(example) },
  });
  await user.click(screen.getByRole('button', { name: 'Zastosuj dane' }));
  await user.click(screen.getByRole('tab', { name: 'Katalog' }));
  expect(screen.getByRole('combobox', { name: 'Jednostka OBRZEZE' })).toHaveTextContent('mb');
  await user.keyboard('{Escape}');
  expect(screen.getByRole('combobox', { name: 'Jednostka OBRZEZE' })).toHaveTextContent('mb');
});

it('shows a numeric error even if its BOM row is outside the selected product tree', async () => {
  const user = userEvent.setup();
  const input = structuredClone(example);
  input.items.push({ code: 'UNUSED', unit: 'szt' });
  input.bom.push({ parent: 'UNUSED', component: 'PLYTA', quantity: 1, wastePct: 0 });
  render(<App />);
  await openJsonEditor(user);
  fireEvent.change(screen.getByRole('textbox', { name: 'Dane wejściowe JSON' }), {
    target: { value: JSON.stringify(input) },
  });
  await user.click(screen.getByRole('button', { name: 'Zastosuj dane' }));
  await user.click(screen.getByRole('button', { name: 'Tabela' }));
  await user.clear(screen.getByRole('textbox', { name: 'Ilość UNUSED → PLYTA' }));
  await user.click(screen.getByRole('button', { name: 'Drzewo' }));
  expect(screen.queryByRole('textbox', { name: 'Ilość UNUSED → PLYTA' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /Oblicz zapotrzebowanie/ }));
  expect(await screen.findByRole('textbox', { name: 'Ilość UNUSED → PLYTA' })).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  expect(fetchMock).not.toHaveBeenCalled();
});

it('marks an empty custom unit with one accessible inline error', async () => {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('tab', { name: 'Katalog' }));
  await user.click(screen.getByRole('combobox', { name: 'Jednostka OBRZEZE' }));
  await user.click(screen.getByRole('option', { name: 'Własna' }));
  await user.click(screen.getByRole('button', { name: /Oblicz zapotrzebowanie/ }));
  const field = screen.getByRole('combobox', { name: 'Jednostka OBRZEZE' });
  expect(field).toHaveAttribute('aria-invalid', 'true');
  expect(field).toHaveAccessibleDescription('Wartość jest wymagana.');
  expect(screen.getAllByText('Wartość jest wymagana.')).toHaveLength(1);
  expect(fetchMock).not.toHaveBeenCalled();
});

it('shows a friendly message for an unexpected JSON error response', async () => {
  const user = userEvent.setup();
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ message: 'Bad gateway' }), { status: 502 }),
  );
  render(<App />);
  await user.click(screen.getByRole('button', { name: /Oblicz zapotrzebowanie/ }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Serwer zwrócił niepoprawną odpowiedź.',
  );
});

it('renders arbitrary item codes without encoding them into DOM identifiers', async () => {
  const user = userEvent.setup();
  const input = {
    order: { item: 'ITEM🪵', quantity: 1 },
    items: [{ code: 'ITEM🪵', unit: 'kg' }],
    bom: [],
    stock: [],
  };
  fetchMock.mockResolvedValue(response({ ...saved, input, result: calculateRequirements(input) }));
  render(<App />);
  await openJsonEditor(user);
  fireEvent.change(screen.getByRole('textbox', { name: 'Dane wejściowe JSON' }), {
    target: { value: JSON.stringify(input) },
  });
  await user.click(screen.getByRole('button', { name: 'Zastosuj dane' }));
  await user.click(screen.getByRole('button', { name: /Oblicz zapotrzebowanie/ }));
  const material = await screen.findByRole('button', { name: /ITEM/ });
  expect(material).not.toHaveAttribute('aria-controls');
  await user.click(material);
  expect(document.getElementById(material.getAttribute('aria-controls')!)).toBeInTheDocument();
});
