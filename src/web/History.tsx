import { useEffect, useState } from 'react';
import type { CalculationSummary } from '../calculator/types.js';
import { describeError, request } from './api.js';
import { format } from './data.js';
import { calculationPath } from './navigation.js';
import { LoadingState } from './LoadingState.js';
import { withLoadingPreview } from './loadingPreview.js';
import s from './App.module.scss';

export function History({ disabled }: { disabled: boolean }) {
  const [records, setRecords] = useState<CalculationSummary[] | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setError('');
    withLoadingPreview(request<CalculationSummary[]>('/calculations'))
      .then((data) => {
        if (active) setRecords(data);
      })
      .catch((cause: unknown) => {
        if (active) setError(describeError(cause).message);
      });
    return () => {
      active = false;
    };
  }, [retry]);
  const date = new Intl.DateTimeFormat('pl-PL', { dateStyle: 'short', timeStyle: 'short' });
  return (
    <section className={s.history}>
      <h1>Historia kalkulacji</h1>
      <p>Ostatnie 20 wyników wraz z danymi, na podstawie których powstały.</p>
      {error ? (
        <div role="alert" className={s.error}>
          <p>{error}</p>
          <button type="button" className="textButton" onClick={() => setRetry(retry + 1)}>
            Spróbuj ponownie
          </button>
        </div>
      ) : records === null ? (
        <LoadingState kind="history" />
      ) : !records.length ? (
        <p className={s.historyEmpty}>Po pierwszym obliczeniu znajdziesz tu zapisane zamówienie.</p>
      ) : (
        <div className={s.historyScroll}>
          <table>
            <caption className="srOnly">Zapisane kalkulacje</caption>
            <thead>
              <tr>
                <th>Zamówienie</th>
                <th>Ilość</th>
                <th>Materiały do zakupu</th>
                <th>Utworzono</th>
                <th>
                  <span className="srOnly">Akcje</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr key={record.id}>
                  <th scope="row">{record.orderItem}</th>
                  <td>{format(record.orderQuantity)}</td>
                  <td>{record.materialCount}</td>
                  <td>
                    <time dateTime={record.createdAt}>
                      {date.format(new Date(record.createdAt))}
                    </time>
                  </td>
                  <td>
                    <a
                      href={calculationPath(record)}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-disabled={disabled || undefined}
                      tabIndex={disabled ? -1 : undefined}
                      className={`textButton ${s.historyLink}`}
                      onClick={(event) => {
                        if (disabled) event.preventDefault();
                      }}
                      aria-label={`Otwórz kalkulację ${record.orderItem} z ${date.format(new Date(record.createdAt))} w nowej karcie`}
                    >
                      Otwórz <span aria-hidden="true">↗</span>
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
