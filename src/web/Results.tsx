import { Fragment, useId, useState } from 'react';
import type { CalculationResult, Contribution } from '../calculator/types.js';
import { format, unit } from './data.js';
import { downloadCsv } from './exportCsv.js';
import { Chevron } from './Chevron.js';
import s from './Results.module.scss';

function SourceCalculation({
  source,
  item,
  itemUnit,
  result,
}: {
  source: Contribution;
  item: string;
  itemUnit: string;
  result: CalculationResult;
}) {
  const parentUnit = unit(result.plan.find((entry) => entry.item === source.parent)!.unit);
  return (
    <div className={s.source}>
      <span>
        <strong>
          {format(source.productionQuantity)} {parentUnit}
        </strong>
        <small>{source.parent}</small>
      </span>
      <span className={s.operator}>×</span>
      <span>
        <strong>
          {format(source.quantityPerParent)} {itemUnit} / {parentUnit}
        </strong>
        <small>
          {item} / {source.parent}
        </small>
      </span>
      {source.wastePct > 0 && (
        <>
          <span className={s.operator}>×</span>
          <span>
            <strong>{format(1 + source.wastePct / 100)}</strong>
            <small>odpad {format(source.wastePct)}%</small>
          </span>
        </>
      )}
      <span className={s.operator}>=</span>
      <span>
        <strong>
          {format(source.gross)} {itemUnit}
        </strong>
        <small>{item}</small>
      </span>
    </div>
  );
}

export function Results({
  result,
  stale,
  busy,
}: {
  result: CalculationResult;
  stale: boolean;
  busy: boolean;
}) {
  const id = useId();
  const [expanded, setExpanded] = useState<string | null>(null);
  const production = result.plan.filter((entry) => entry.type === 'manufactured');
  return (
    <section className={s.results} aria-labelledby="results-title" aria-busy={busy}>
      <div className={s.heading}>
        <div>
          <h2 id="results-title">
            Lista zakupów <span>{result.requirements.length}</span>
          </h2>
          <p>
            {result.order.item} <span>·</span> {format(result.order.quantity)}{' '}
            {unit(result.order.unit)}
          </p>
        </div>
        <button
          className="textButton"
          disabled={!result.requirements.length || stale || busy}
          onClick={() => downloadCsv(result)}
          type="button"
        >
          Pobierz CSV
        </button>
      </div>
      {stale && (
        <p className={s.stale} role="status">
          Dane zostały zmienione. Przelicz wynik.
        </p>
      )}
      {result.requirements.length > 0 ? (
        <>
          <div className={s.scroll}>
            <table className={s.purchaseTable}>
              <caption className="srOnly">Zapotrzebowanie materiałowe i ilości do zakupu</caption>
              <thead>
                <tr>
                  <th>Materiał</th>
                  <th title="Po uwzględnieniu półproduktów, przed odjęciem stanu materiału">
                    Brutto
                  </th>
                  <th>Stan</th>
                  <th>Netto</th>
                  <th>Opak.</th>
                  <th>Zakup</th>
                </tr>
              </thead>
              <tbody>
                {result.requirements.map((entry, index) => {
                  const sources =
                    result.plan.find((item) => item.item === entry.item)?.sources ?? [];
                  const itemUnit = unit(entry.unit);
                  const detailId = `${id}-${index}`;
                  return (
                    <Fragment key={entry.item}>
                      <tr>
                        <th scope="row">
                          <button
                            type="button"
                            className={s.material}
                            aria-expanded={expanded === entry.item}
                            aria-controls={expanded === entry.item ? detailId : undefined}
                            onClick={() => setExpanded(expanded === entry.item ? null : entry.item)}
                          >
                            <Chevron className={s.chevron} />
                            <span>
                              {entry.item}
                              <small>{itemUnit}</small>
                            </span>
                          </button>
                        </th>
                        <td title={String(entry.gross)}>{format(entry.gross)}</td>
                        <td title={String(entry.stock)} className={s.stock}>
                          {format(entry.stock)}
                        </td>
                        <td title={String(entry.net)} className={s.net}>
                          {format(entry.net)}
                        </td>
                        <td>
                          {entry.packages === null ? (
                            <span className={s.muted} title="Zakup w jednostce materiału">
                              —
                            </span>
                          ) : (
                            <span
                              title={`Opakowania: ${format(entry.packages)} × ${format(entry.purchasePack!)} ${itemUnit}`}
                            >
                              {format(entry.packages)}
                            </span>
                          )}
                        </td>
                        <td className={s.purchase} title={String(entry.purchaseQuantity)}>
                          {format(entry.purchaseQuantity)}
                        </td>
                      </tr>
                      {expanded === entry.item && (
                        <tr id={detailId} className={s.detailRow}>
                          <td colSpan={6}>
                            <h3>
                              Skąd wynika {format(entry.gross)} {itemUnit} {entry.item}?
                            </h3>
                            {sources.map((source, index) => (
                              <SourceCalculation
                                key={index}
                                source={source}
                                item={entry.item}
                                itemUnit={itemUnit}
                                result={result}
                              />
                            ))}
                            {!sources.length && (
                              <p>
                                Z zamówienia: {format(entry.gross)} {itemUnit} {entry.item}.
                              </p>
                            )}
                            <dl className={s.breakdown}>
                              <div>
                                <dt>Netto</dt>
                                <dd>
                                  {format(entry.gross)} {itemUnit} − {format(entry.stockUsed)}{' '}
                                  {itemUnit} z magazynu ={' '}
                                  <strong>
                                    {format(entry.net)} {itemUnit}
                                  </strong>
                                </dd>
                              </div>
                              {entry.packages !== null && (
                                <div>
                                  <dt>Opakowania</dt>
                                  <dd>
                                    {format(entry.net)} {itemUnit} ÷ {format(entry.purchasePack!)}{' '}
                                    {itemUnit}/opak. →{' '}
                                    <strong>{format(entry.packages)} opak.</strong>
                                  </dd>
                                </div>
                              )}
                              <div>
                                <dt>Zakup</dt>
                                <dd>
                                  <strong>
                                    {format(entry.purchaseQuantity)} {itemUnit}
                                  </strong>
                                  {entry.surplus > 0 && (
                                    <span>
                                      {' '}
                                      · nadwyżka {format(entry.surplus)} {itemUnit}
                                    </span>
                                  )}
                                </dd>
                              </div>
                            </dl>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className={s.covered}>
          <span aria-hidden="true">✓</span>
          <h3>Zakupy nie są potrzebne</h3>
          <p>
            {result.order.quantity === 0
              ? 'Zamówienie ma zerową ilość.'
              : 'Zapasy pokrywają zamówienie.'}
          </p>
        </div>
      )}
      {!!production.length && (
        <details className={s.production} open>
          <summary>
            <h2>
              <Chevron className={s.chevron} />
              <span>Plan produkcji</span>
              <span className={s.productionCount}>{production.length}</span>
            </h2>
          </summary>
          <div className={s.scroll}>
            <table>
              <caption className="srOnly">Plan produkcji</caption>
              <thead>
                <tr>
                  <th>Element</th>
                  <th>Potrzeba</th>
                  <th>Z magazynu</th>
                  <th>Do produkcji</th>
                </tr>
              </thead>
              <tbody>
                {production.map((entry) => (
                  <tr key={entry.item}>
                    <th scope="row">
                      {entry.item}
                      <small>{unit(entry.unit)}</small>
                    </th>
                    <td>{format(entry.gross)}</td>
                    <td className={s.stock}>{format(entry.stockUsed)}</td>
                    <td>
                      <strong>{format(entry.productionQuantity)}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );
}
