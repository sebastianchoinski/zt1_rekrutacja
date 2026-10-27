import { useEffect, useState } from 'react';
import type { InputIssue } from '../calculator/errors.js';
import { unit, type Draft } from './data.js';
import { NumberInput } from './NumberInput.js';
import { Chevron } from './Chevron.js';
import { Select } from './Select.js';
import s from './DataEditor.module.scss';

type Tab = 'bom' | 'stock' | 'items';
interface Props {
  draft: Draft;
  onChange: (draft: Draft, reversible?: boolean) => void;
  issues: InputIssue[];
  disabled: boolean;
}
interface TreeRow {
  code: string;
  depth: number;
  index?: number;
  cycle: boolean;
  children: boolean;
  continuations: boolean[];
}

function treeRows(draft: Draft, collapsed: Set<string>) {
  const children = new Map<string, number[]>();
  draft.bom.forEach((line, index) => {
    const entries = children.get(line.parent) ?? [];
    entries.push(index);
    children.set(line.parent, entries);
  });
  const stack = [
    {
      code: draft.order.item,
      depth: 0,
      index: undefined as number | undefined,
      ancestors: new Set<string>(),
      continuations: [] as boolean[],
    },
  ];
  const rows: TreeRow[] = [];
  while (stack.length && rows.length < 500) {
    const node = stack.pop()!;
    const edges = children.get(node.code) ?? [];
    const cycle = node.ancestors.has(node.code);
    rows.push({
      code: node.code,
      depth: node.depth,
      index: node.index,
      cycle,
      children: edges.length > 0,
      continuations: node.continuations,
    });
    if (!cycle && !collapsed.has(node.code)) {
      const ancestors = new Set([...node.ancestors, node.code]);
      for (let i = edges.length - 1; i >= 0; i--) {
        const index = edges[i]!;
        stack.push({
          code: draft.bom[index]!.component,
          depth: node.depth + 1,
          index,
          ancestors,
          continuations: [...node.continuations, i < edges.length - 1],
        });
      }
    }
  }
  return { rows, truncated: stack.length > 0 };
}

function BomEditor({ draft, onChange, issues }: Props) {
  const [view, setView] = useState<'tree' | 'table'>('tree');
  const [collapsed, setCollapsed] = useState(new Set<string>());
  const [adding, setAdding] = useState(false);
  const [parent, setParent] = useState(draft.order.item);
  const [component, setComponent] = useState('');
  const [addError, setAddError] = useState('');
  useEffect(() => {
    if (issues.some((issue) => issue.path === 'bom' || issue.path.startsWith('bom.')))
      setView('table');
  }, [issues]);
  const visible = treeRows(draft, collapsed);
  const codes = draft.items.map((item) => item.code);
  const issue = (index: number, field: string) =>
    issues.find((item) => item.path === `bom.${index}.${field}`)?.message;
  const update = (index: number, field: 'quantity' | 'wastePct', value: string) =>
    onChange({
      ...draft,
      bom: draft.bom.map((line, i) => (i === index ? { ...line, [field]: value } : line)),
    });
  const remove = (index: number) =>
    onChange({ ...draft, bom: draft.bom.filter((_, i) => i !== index) }, true);
  const fields = (index: number) => {
    const line = draft.bom[index]!;
    return (
      <>
        <td
          title={`Zużycie ${line.component} na 1 ${unit(draft.items.find((item) => item.code === line.parent)?.unit ?? '')} ${line.parent}.`}
        >
          <NumberInput
            label={`Ilość ${line.parent} → ${line.component}`}
            value={line.quantity}
            onChange={(value) => update(index, 'quantity', value)}
            error={issue(index, 'quantity')}
          />
        </td>
        <td>
          <span className={s.withUnit}>
            <NumberInput
              label={`Odpad ${line.parent} → ${line.component}`}
              value={line.wastePct}
              onChange={(value) => update(index, 'wastePct', value)}
              error={issue(index, 'wastePct')}
            />
            <span>%</span>
          </span>
        </td>
        <td>
          <button
            type="button"
            className={s.remove}
            aria-label={`Usuń ${line.parent} → ${line.component}`}
            onClick={() => remove(index)}
          >
            ×
          </button>
        </td>
      </>
    );
  };
  const add = () => {
    if (!codes.includes(parent) || !codes.includes(component)) {
      setAddError('Wybierz element, dla którego tworzysz recepturę, oraz składnik z katalogu.');
      return;
    }
    if (parent === component) {
      setAddError('Element nie może być swoim składnikiem.');
      return;
    }
    if (draft.bom.some((line) => line.parent === parent && line.component === component)) {
      setAddError('Ta pozycja jest już w recepturze.');
      return;
    }
    onChange({
      ...draft,
      bom: [...draft.bom, { parent, component, quantity: '1', wastePct: '0' }],
    });
    setAdding(false);
    setComponent('');
    setAddError('');
  };

  return (
    <>
      <div className={s.viewBar}>
        <p>Zużycie na 1 produkt lub półprodukt</p>
        <div role="group" aria-label="Widok receptury">
          <button type="button" aria-pressed={view === 'tree'} onClick={() => setView('tree')}>
            Drzewo
          </button>
          <button type="button" aria-pressed={view === 'table'} onClick={() => setView('table')}>
            Tabela
          </button>
        </div>
      </div>
      <div className={s.scroll}>
        <table className={s.bomTable}>
          <caption className="srOnly">Receptura produktu {draft.order.item}</caption>
          <thead>
            <tr>
              <th>{view === 'tree' ? 'Element' : 'Element → składnik'}</th>
              <th>Ilość</th>
              <th>Odpad</th>
              <th>
                <span className="srOnly">Akcje</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {view === 'tree'
              ? visible.rows.map((row, rowIndex) => (
                  <tr
                    key={`${row.index}-${rowIndex}`}
                    className={
                      row.index === undefined ? s.rootRow : row.children ? s.assemblyRow : undefined
                    }
                  >
                    <th scope="row" className={s.treeCell}>
                      <span className={s.treeGuides} aria-hidden="true">
                        {row.continuations.map((continues, level) => {
                          const branch = level === row.depth - 1;
                          if (!continues && !branch) return null;
                          return (
                            <span
                              key={level}
                              className={s.treeGuide}
                              data-last={branch && !continues}
                              style={{ left: level * 24 + 14 }}
                            />
                          );
                        })}
                        {row.depth > 0 && (
                          <span
                            className={s.treeBranch}
                            style={{ left: (row.depth - 1) * 24 + 14 }}
                          />
                        )}
                        {row.children && !row.cycle && !collapsed.has(row.code) && (
                          <span className={s.treeStem} style={{ left: row.depth * 24 + 14 }} />
                        )}
                      </span>
                      <span className={s.treeLabel} style={{ paddingLeft: row.depth * 24 }}>
                        {row.children && !row.cycle ? (
                          <button
                            type="button"
                            className={s.expand}
                            aria-label={`${collapsed.has(row.code) ? 'Rozwiń' : 'Zwiń'} ${row.code}`}
                            aria-expanded={!collapsed.has(row.code)}
                            onClick={() =>
                              setCollapsed((previous) => {
                                const next = new Set(previous);
                                if (next.has(row.code)) next.delete(row.code);
                                else next.add(row.code);
                                return next;
                              })
                            }
                          >
                            <Chevron />
                          </button>
                        ) : (
                          <span className={s.leafMark} aria-hidden="true" />
                        )}
                        <span>
                          <span className={s.code}>{row.code}</span>
                          <small>
                            {row.cycle
                              ? 'Cykl w recepturze'
                              : row.index === undefined
                                ? 'Produkt zamawiany'
                                : `${row.children ? 'Półprodukt' : 'Materiał'} · ${unit(draft.items.find((item) => item.code === row.code)?.unit ?? '')}`}
                          </small>
                        </span>
                      </span>
                    </th>
                    {row.index === undefined ? (
                      <>
                        <td>{draft.order.quantity}</td>
                        <td className={s.muted}>—</td>
                        <td />
                      </>
                    ) : (
                      fields(row.index)
                    )}
                  </tr>
                ))
              : draft.bom.map((line, index) => (
                  <tr key={index}>
                    <th scope="row">
                      <span className={s.code}>{line.parent}</span>
                      <span className={s.relation}>→ {line.component}</span>
                    </th>
                    {fields(index)}
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
      {view === 'tree' && visible.truncated && (
        <p className={s.footnote}>Pierwsze 500 elementów. Pozostałe znajdziesz w tabeli.</p>
      )}
      {view === 'table' && !draft.bom.length && (
        <p className={s.empty}>Brak receptur. Elementy bez BOM są kupowane.</p>
      )}
      {adding ? (
        <div className={s.addLine}>
          <div className={s.addField}>
            <span>Receptura dla</span>
            <Select
              label="Receptura dla"
              value={parent}
              onChange={setParent}
              options={codes.map((code) => ({ value: code, label: code }))}
            />
          </div>
          <div className={s.addField}>
            <span>Składnik</span>
            <Select
              label="Składnik"
              value={component}
              onChange={setComponent}
              options={codes
                .filter((code) => code !== parent)
                .map((code) => ({ value: code, label: code }))}
            />
          </div>
          <button type="button" className="secondary" onClick={add}>
            Dodaj
          </button>
          <button type="button" className="textButton" onClick={() => setAdding(false)}>
            Anuluj
          </button>
          {addError && (
            <p role="alert" className={s.fieldError}>
              {addError}
            </p>
          )}
        </div>
      ) : (
        <button
          type="button"
          className={`secondary ${s.addButton}`}
          onClick={() => {
            setParent(draft.order.item);
            setAdding(true);
          }}
        >
          + Dodaj składnik
        </button>
      )}
    </>
  );
}

function StockEditor({ draft, onChange, issues }: Props) {
  const rows = [
    ...draft.items.map((item) => item.code),
    ...draft.stock
      .filter((entry) => !draft.items.some((item) => item.code === entry.item))
      .map((entry) => entry.item),
  ];
  const update = (code: string, value: string) => {
    const exists = draft.stock.some((entry) => entry.item === code);
    onChange({
      ...draft,
      stock: exists
        ? draft.stock.map((entry) => (entry.item === code ? { ...entry, quantity: value } : entry))
        : [...draft.stock, { item: code, quantity: value }],
    });
  };
  return (
    <>
      <div className={s.scroll}>
        <table className={s.stockTable}>
          <caption className="srOnly">Stany magazynowe</caption>
          <thead>
            <tr>
              <th>Element</th>
              <th>Jednostka</th>
              <th>Dostępna ilość</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((code, rowIndex) => {
              const index = draft.stock.findIndex((entry) => entry.item === code);
              const item = draft.items.find((entry) => entry.code === code);
              return (
                <tr key={`${code}-${rowIndex}`}>
                  <th scope="row">
                    <span className={s.code}>{code}</span>
                    <small>
                      {draft.bom.some((line) => line.parent === code) ? 'Produkcja' : 'Zakup'}
                    </small>
                  </th>
                  <td className={s.muted}>{unit(item?.unit ?? '—')}</td>
                  <td>
                    <NumberInput
                      label={`Stan ${code}`}
                      value={draft.stock[index]?.quantity ?? '0'}
                      onChange={(value) => update(code, value)}
                      error={
                        issues.find((issue) => issue.path === `stock.${index}.quantity`)?.message
                      }
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function CatalogEditor({ draft, onChange, issues }: Props) {
  const [code, setCode] = useState('');
  const [newUnit, setNewUnit] = useState('szt');
  const [error, setError] = useState('');
  const standardUnits = ['szt', 'm2', 'm3', 'mb', 'm', 'kg', 'g', 'l'];
  const units = [
    ...new Set([
      ...standardUnits,
      ...draft.items.map((item) => item.unit).filter((value) => value.trim()),
    ]),
  ];
  const unitOptions = units.map((value) => ({
    value,
    label: unit(value),
    custom: !standardUnits.includes(value),
  }));
  const update = (index: number, field: 'unit' | 'purchasePack', value: string) =>
    onChange({
      ...draft,
      items: draft.items.map((item, i) => (i === index ? { ...item, [field]: value } : item)),
    });
  const add = () => {
    if (!code.trim()) {
      setError('Wpisz kod elementu.');
      return;
    }
    const itemUnit = newUnit.trim();
    if (!itemUnit) {
      setError('Wpisz własną jednostkę.');
      return;
    }
    if (draft.items.some((item) => item.code === code.trim())) {
      setError('Ten kod już istnieje w katalogu.');
      return;
    }
    onChange({
      ...draft,
      items: [...draft.items, { code: code.trim(), unit: itemUnit, purchasePack: '' }],
    });
    setCode('');
    setNewUnit(itemUnit);
    setError('');
  };
  return (
    <>
      <div className={s.scroll}>
        <table className={s.catalogTable}>
          <caption className="srOnly">Katalog elementów</caption>
          <thead>
            <tr>
              <th>Kod</th>
              <th>Jednostka</th>
              <th>Wielkość opakowania</th>
              <th>
                <span className="srOnly">Akcje</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {draft.items.map((item, index) => {
              const manufactured = draft.bom.some((line) => line.parent === item.code);
              const used =
                draft.order.item === item.code ||
                draft.bom.some((line) => line.parent === item.code || line.component === item.code);
              return (
                <tr key={item.code}>
                  <th scope="row" className={s.code}>
                    {item.code}
                  </th>
                  <td>
                    <div className={s.unitSelect}>
                      <Select
                        label={`Jednostka ${item.code}`}
                        value={item.unit}
                        onChange={(value) => update(index, 'unit', value)}
                        options={unitOptions}
                        allowCustom
                        align="center"
                        error={
                          issues.find((issue) => issue.path === `items.${index}.unit`)?.message
                        }
                      />
                    </div>
                  </td>
                  <td>
                    {manufactured && item.purchasePack === '' ? (
                      <span
                        className={s.muted}
                        title="Element wytwarzany z receptury, bez opakowania zakupowego."
                        aria-label="Nie dotyczy — element produkowany"
                      >
                        —
                      </span>
                    ) : (
                      <NumberInput
                        label={`Opakowanie ${item.code}`}
                        value={item.purchasePack}
                        onChange={(value) => update(index, 'purchasePack', value)}
                        error={
                          issues.find((issue) => issue.path === `items.${index}.purchasePack`)
                            ?.message
                        }
                      />
                    )}
                  </td>
                  <td>
                    <button
                      type="button"
                      className={s.remove}
                      disabled={used}
                      aria-label={`Usuń ${item.code} z katalogu`}
                      title={
                        used
                          ? 'Element jest używany w zamówieniu lub BOM.'
                          : 'Usuń element i jego stan magazynowy'
                      }
                      onClick={() =>
                        onChange(
                          {
                            ...draft,
                            items: draft.items.filter((_, i) => i !== index),
                            stock: draft.stock.filter((entry) => entry.item !== item.code),
                          },
                          true,
                        )
                      }
                    >
                      ×
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div
        className={s.addLine}
        onKeyDown={(event) => {
          if (
            event.key === 'Enter' &&
            !event.defaultPrevented &&
            event.target instanceof HTMLInputElement
          ) {
            event.preventDefault();
            add();
          }
        }}
      >
        <label>
          Kod nowego elementu
          <input
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="np. WKRĘT"
            maxLength={80}
          />
        </label>
        <div className={`${s.addField} ${s.newUnit}`}>
          <span>Jednostka</span>
          <Select
            label="Jednostka nowego elementu"
            value={newUnit}
            onChange={(value) => {
              setNewUnit(value);
              setError('');
            }}
            options={unitOptions}
            allowCustom
          />
        </div>
        <button type="button" className="secondary" onClick={add}>
          Dodaj
        </button>
        {error && (
          <p role="alert" className={s.fieldError}>
            {error}
          </p>
        )}
      </div>
    </>
  );
}

export function DataEditor(props: Props) {
  const [tab, setTab] = useState<Tab>('bom');
  const tabs: { key: Tab; label: string }[] = [
    { key: 'bom', label: 'Receptura' },
    { key: 'stock', label: 'Magazyn' },
    { key: 'items', label: 'Katalog' },
  ];
  useEffect(() => {
    const group = props.issues[0]?.path.split('.')[0];
    if (group === 'bom' || group === 'stock' || group === 'items') setTab(group);
  }, [props.issues]);

  return (
    <section className={s.editor} aria-label="Dane materiałowe">
      <div className={s.tabs} role="tablist" aria-label="Dane materiałowe">
        {tabs.map((entry, index) => (
          <button
            key={entry.key}
            type="button"
            role="tab"
            id={`tab-${entry.key}`}
            aria-selected={tab === entry.key}
            aria-controls="data-panel"
            tabIndex={tab === entry.key ? 0 : -1}
            onClick={() => setTab(entry.key)}
            onKeyDown={(event) => {
              if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
              event.preventDefault();
              const next =
                tabs[(index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length]!;
              setTab(next.key);
              document.getElementById(`tab-${next.key}`)?.focus();
            }}
          >
            {entry.label}
          </button>
        ))}
      </div>
      <div id="data-panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
        <fieldset disabled={props.disabled}>
          {tab === 'bom' ? (
            <BomEditor {...props} />
          ) : tab === 'stock' ? (
            <StockEditor {...props} />
          ) : (
            <CatalogEditor {...props} />
          )}
        </fieldset>
      </div>
    </section>
  );
}
