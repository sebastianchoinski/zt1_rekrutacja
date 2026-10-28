import { useCallback, useEffect, useState, type FormEvent } from 'react';
import example from '../../examples/cabinet.json';
import { validateInput } from '../calculator/input.js';
import { buildGraph } from '../calculator/graph.js';
import type { SavedCalculation } from '../calculator/types.js';
import { describeError, request, type ApiError } from './api.js';
import { fieldLocation, toDraft, toInput, unit, type Draft } from './data.js';
import { DataEditor } from './DataEditor.js';
import { DataActions } from './DataActions.js';
import { Dialog } from './Dialog.js';
import { History } from './History.js';
import { LoadingState } from './LoadingState.js';
import { withLoadingPreview } from './loadingPreview.js';
import { NumberInput } from './NumberInput.js';
import { Results } from './Results.js';
import { Select } from './Select.js';
import { Toast } from './Toast.js';
import { calculationPath, useNavigation } from './navigation.js';
import s from './App.module.scss';

const noIssues: ApiError['issues'] = [];

export function App() {
  const [draft, setDraft] = useState(() => toDraft(example));
  const [undo, setUndo] = useState<Draft | null>(null);
  const [editorRevision, setEditorRevision] = useState(0);
  const { route, navigate } = useNavigation();
  const page =
    route.kind === 'history' ? 'history' : route.kind === 'not-found' ? 'not-found' : 'calculator';
  const [calculation, setCalculation] = useState<SavedCalculation | null>(null);
  const [saving, setSaving] = useState(false);
  const [snapshotError, setSnapshotError] = useState<{ id: string; error: ApiError } | null>(null);
  const [snapshotRetry, setSnapshotRetry] = useState(0);
  const [error, setError] = useState<ApiError | null>(null);
  const [dialog, setDialog] = useState<'json' | 'rules' | null>(null);
  const [json, setJson] = useState('');
  const [jsonError, setJsonError] = useState<ApiError | null>(null);
  const [notice, setNotice] = useState<number | null>(null);
  const closeNotice = useCallback(() => setNotice(null), []);
  const routeError =
    route.kind === 'calculation' && snapshotError?.id === route.id ? snapshotError.error : null;
  const loadingSnapshot =
    route.kind === 'calculation' && calculation?.id !== route.id && !routeError;
  const busy = saving || loadingSnapshot;
  // JSONB can reorder object keys. Compare the same input shape on both sides.
  const stale =
    calculation !== null &&
    JSON.stringify(toInput(draft)) !== JSON.stringify(toInput(toDraft(calculation.input)));
  const currentUnit = unit(draft.items.find((item) => item.code === draft.order.item)?.unit ?? '');
  const summaryIssues =
    error?.issues.filter(
      (issue) =>
        !/^(order\.quantity|bom\.\d+\.(quantity|wastePct)|stock\.\d+\.quantity|items\.\d+\.(purchasePack|unit))$/.test(
          issue.path,
        ),
    ) ?? [];

  const change = (next: Draft, reversible = false) => {
    setUndo(reversible ? draft : null);
    setDraft(next);
    setError(null);
    setNotice(null);
  };
  const replace = (next: Draft, reversible = true) => {
    change(next, reversible);
    setEditorRevision((revision) => revision + 1);
  };

  useEffect(() => {
    if (route.kind !== 'calculation') return;
    if (calculation?.id === route.id) {
      // Reopening the saved URL restores its snapshot, including after local edits.
      if (stale) replace(toDraft(calculation.input));
      navigate(calculationPath(calculation), true);
      return;
    }
    const id = route.id;
    let active = true;
    setSnapshotError(null);
    setError(null);
    withLoadingPreview(request<SavedCalculation>(`/calculations/${encodeURIComponent(id)}`))
      .then((saved) => {
        if (!active) return;
        replace(toDraft(saved.input));
        setCalculation(saved);
        navigate(calculationPath(saved), true);
      })
      .catch((cause: unknown) => {
        if (active) setSnapshotError({ id, error: describeError(cause) });
      });
    return () => {
      active = false;
    };
  }, [route, calculation?.id, snapshotRetry, navigate]);

  const calculate = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setSaving(true);
    const submittedPath = window.location.pathname;
    try {
      const input = validateInput(toInput(draft));
      const saved = await request<SavedCalculation>('/calculations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (window.location.pathname !== submittedPath) return;
      setCalculation(saved);
      navigate(calculationPath(saved));
      setNotice(Date.now());
    } catch (cause) {
      if (window.location.pathname === submittedPath) setError(describeError(cause));
    } finally {
      setSaving(false);
    }
  };

  const importJson = () => {
    try {
      const input = validateInput(JSON.parse(json));
      buildGraph(input);
      replace(toDraft(input));
      setDialog(null);
      setJsonError(null);
    } catch (cause) {
      setJsonError(describeError(cause));
    }
  };

  return (
    <div className={s.app}>
      <header className={s.header}>
        <nav aria-label="Główna nawigacja">
          <button
            disabled={saving}
            aria-current={page === 'calculator' ? 'page' : undefined}
            onClick={() => navigate('/')}
          >
            Kalkulator
          </button>
          <button
            disabled={saving}
            aria-current={page === 'history' ? 'page' : undefined}
            onClick={() => navigate('/historia')}
          >
            Historia
          </button>
        </nav>
        <button
          className={s.rulesButton}
          aria-label="Zasady obliczeń"
          title="Zasady obliczeń"
          onClick={() => setDialog('rules')}
        >
          ?
        </button>
      </header>
      <main
        className={`${s.main} ${page === 'calculator' && !calculation && !loadingSnapshot ? s.editing : ''}`}
      >
        {page === 'not-found' ? (
          <section className={s.routeState}>
            <h1>Nie znaleziono strony</h1>
            <p>Sprawdź adres albo wybierz kalkulację z historii.</p>
            <button className="secondary" onClick={() => navigate('/historia')}>
              Przejdź do historii
            </button>
          </section>
        ) : loadingSnapshot ? (
          <LoadingState kind="calculation" />
        ) : routeError ? (
          <section className={s.routeState}>
            <h1>Nie udało się otworzyć kalkulacji</h1>
            <p role="alert">{routeError.message}</p>
            <div>
              <button
                className="secondary"
                onClick={() => {
                  setSnapshotError(null);
                  setSnapshotRetry((retry) => retry + 1);
                }}
              >
                Spróbuj ponownie
              </button>
              <button className="textButton" onClick={() => navigate('/historia')}>
                Wróć do historii
              </button>
            </div>
          </section>
        ) : page === 'calculator' ? (
          <>
            <div className={s.intro}>
              <h1>
                Zapotrzebowanie<span> materiałowe</span>
              </h1>
              <div className={s.dataActions}>
                <DataActions
                  disabled={busy}
                  onRestoreExample={() => replace(toDraft(example))}
                  onEditJson={() => {
                    setJson(JSON.stringify(toInput(draft), null, 2));
                    setJsonError(null);
                    setDialog('json');
                  }}
                />
              </div>
            </div>
            <form onSubmit={(event) => void calculate(event)} noValidate>
              <fieldset className={s.orderBar} disabled={busy}>
                <div className={s.productField}>
                  <span>Produkt</span>
                  <Select
                    label="Produkt"
                    value={draft.order.item}
                    options={draft.items.map((item) => ({
                      value: item.code,
                      label: item.code,
                      detail: unit(item.unit),
                    }))}
                    disabled={busy}
                    onChange={(item) => change({ ...draft, order: { ...draft.order, item } })}
                  />
                </div>
                <div className={s.orderQuantity}>
                  <span>Ilość zamówienia</span>
                  <div>
                    <NumberInput
                      label="Ilość zamówienia"
                      value={draft.order.quantity}
                      onChange={(quantity) =>
                        change({ ...draft, order: { ...draft.order, quantity } })
                      }
                      error={
                        error?.issues.find((issue) => issue.path === 'order.quantity')?.message
                      }
                    />
                    <span>{currentUnit}</span>
                  </div>
                </div>
                <button className="primary" type="submit" disabled={busy}>
                  {busy ? 'Obliczanie…' : 'Oblicz zapotrzebowanie'}
                  <span aria-hidden="true">→</span>
                </button>
              </fieldset>
              {error && (
                <div className={s.error} role="alert">
                  <strong>{error.message}</strong>
                  {summaryIssues.length > 0 && (
                    <ul>
                      {summaryIssues.map((issue, index) => (
                        <li key={index}>
                          <span>{fieldLocation(issue.path, draft)}:</span> {issue.message}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              <div className={`${s.workspace} ${calculation ? s.withResults : ''}`}>
                <DataEditor
                  key={editorRevision}
                  draft={draft}
                  onChange={change}
                  issues={error?.issues ?? noIssues}
                  disabled={busy}
                />
                {calculation && <Results result={calculation.result} stale={stale} busy={busy} />}
              </div>
            </form>
            {undo && (
              <div className={s.undo} role="status">
                <span>Możesz przywrócić poprzednie dane.</span>
                <button disabled={busy} className="textButton" onClick={() => replace(undo, false)}>
                  Cofnij
                </button>
                <button
                  className={s.dismiss}
                  aria-label="Zamknij informację o cofnięciu"
                  onClick={() => setUndo(null)}
                >
                  ×
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            {error && (
              <div className={s.error} role="alert">
                {error.message}
              </div>
            )}
            <History disabled={busy} />
          </>
        )}
      </main>
      {dialog === 'json' && (
        <Dialog title="Dane kalkulacji" onClose={() => setDialog(null)} wide>
          <p className={s.dialogIntro}>Zastosowanie JSON zastąpi bieżące dane.</p>
          <label className="srOnly" htmlFor="json-editor">
            Dane wejściowe JSON
          </label>
          <textarea
            id="json-editor"
            className={s.jsonEditor}
            value={json}
            onChange={(event) => setJson(event.target.value)}
            spellCheck={false}
          />
          {jsonError && (
            <div className={s.error} role="alert">
              <strong>
                {jsonError.code === 'INVALID_INPUT'
                  ? 'Nie udało się wczytać danych.'
                  : jsonError.message}
              </strong>
              <ul>
                {jsonError.issues.map((issue, index) => (
                  <li key={index}>
                    <span>{fieldLocation(issue.path)}:</span> {issue.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className={s.dialogActions}>
            <button type="button" className="secondary" onClick={() => setDialog(null)}>
              Anuluj
            </button>
            <button type="button" className="primary" onClick={importJson}>
              Zastosuj dane
            </button>
          </div>
        </Dialog>
      )}
      {dialog === 'rules' && (
        <Dialog title="Jak liczymy zapotrzebowanie" onClose={() => setDialog(null)}>
          <ol className={s.rules}>
            <li>
              <strong>Najpierw magazyn.</strong> Gotowe wyroby i półprodukty zmniejszają ilość,
              którą trzeba wyprodukować.
            </li>
            <li>
              <strong>Odpad na każdej pozycji.</strong> Ilość składnika mnożymy przez{' '}
              <code>1 + odpad / 100</code>.
            </li>
            <li>
              <strong>Wspólne składniki sumujemy.</strong> Ten sam zapas wykorzystujemy tylko raz,
              niezależnie od liczby gałęzi BOM.
            </li>
            <li>
              <strong>Brutto → netto.</strong> Brutto uwzględnia już zapas półproduktów. Netto to
              brakująca ilość po odjęciu magazynu danego materiału.
            </li>
            <li>
              <strong>Pełne sztuki i opakowania.</strong> Zakup zaokrąglamy w górę. Inne jednostki
              bez opakowania kupujemy w potrzebnej ilości.
            </li>
            <li>
              <strong>Produkcja albo zakup.</strong> Element z recepturą produkujemy. Element bez
              receptury kupujemy.
            </li>
          </ol>
          <p className={s.dialogIntro}>
            Obliczenie zapisuje dane i wynik w historii. Nie rezerwuje ani nie zużywa zapasów.
          </p>
        </Dialog>
      )}
      {notice !== null && <Toast key={notice} onClose={closeNotice} />}
    </div>
  );
}
