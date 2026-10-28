// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import example from '../examples/cabinet.json';
import { calculateRequirements } from '../src/calculator/calculateRequirements.js';
import { App } from '../src/web/App.js';
import { calculationPath } from '../src/web/navigation.js';

beforeEach(() => {
  window.history.replaceState(null, '', '/');
  document.documentElement.lang = 'pl';
  document.title = 'Materiał';
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function expectAccessible() {
  // jsdom has no layout engine; contrast and real keyboard focus need browser review.
  const result = await axe.run(document.documentElement, {
    rules: { 'color-contrast': { enabled: false } },
  });
  expect(
    result.violations.map(({ id, nodes }) => ({ id, elements: nodes.map((node) => node.html) })),
  ).toEqual([]);
}

it.each(['Receptura', 'Magazyn', 'Katalog'])('has accessible semantics in %s', async (tab) => {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('tab', { name: tab }));
  await expectAccessible();
});

it('has accessible data actions when expanded', async () => {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('button', { name: 'Dane' }));
  await expectAccessible();
});

it('has accessible result details and production tables', async () => {
  const user = userEvent.setup();
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: '8a88e65d-24c2-4524-9951-3c0e210fba15',
          orderItem: 'SZAFKA',
          input: example,
          result: calculateRequirements(example),
        }),
        { status: 201 },
      ),
    ),
  );
  render(<App />);
  await user.click(screen.getByRole('button', { name: /Oblicz zapotrzebowanie/ }));
  await user.click(await screen.findByRole('button', { name: 'PLYTA m²' }));
  await expectAccessible();
});

it('has accessible history table headers and actions', async () => {
  const user = userEvent.setup();
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            id: '8a88e65d-24c2-4524-9951-3c0e210fba15',
            createdAt: '2026-01-01T12:00:00Z',
            orderItem: 'SZAFKA',
            orderQuantity: 10,
            materialCount: 3,
          },
        ]),
      ),
    ),
  );
  render(<App />);
  await user.click(screen.getByRole('button', { name: 'Historia' }));
  await screen.findByRole('link', { name: /Otwórz/ });
  await expectAccessible();
});

it.each(['history', 'calculation'])('has an accessible %s loading state', async (kind) => {
  window.history.replaceState(
    null,
    '',
    kind === 'history'
      ? '/historia'
      : calculationPath({ id: '8a88e65d-24c2-4524-9951-3c0e210fba15', orderItem: 'SZAFKA' }),
  );
  vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => {})));
  render(<App />);
  expect(screen.getByRole('status').getAttribute('aria-busy')).toBe('true');
  await expectAccessible();
});

it('has accessible unit choices and inline validation', async () => {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('tab', { name: 'Katalog' }));
  await user.click(screen.getByRole('combobox', { name: 'Jednostka OBRZEZE' }));
  await expectAccessible();
  await user.click(screen.getByRole('option', { name: 'Własna' }));
  await user.click(screen.getByRole('button', { name: /Oblicz zapotrzebowanie/ }));
  await expectAccessible();
});
