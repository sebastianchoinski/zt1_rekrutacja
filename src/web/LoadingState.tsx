import s from './LoadingState.module.scss';

function Rows({ count = 5 }: { count?: number }) {
  return (
    <div className={s.rows}>
      {Array.from({ length: count }, (_, index) => (
        <div className={s.row} key={index}>
          <span className={s.bar} />
          <span className={s.bar} />
          <span className={s.bar} />
        </div>
      ))}
    </div>
  );
}

export function LoadingState({ kind }: { kind: 'calculation' | 'history' }) {
  const calculation = kind === 'calculation';
  return (
    <div className={s.loading} role="status" aria-live="polite" aria-busy="true">
      <div className={s.status}>
        <span className={s.spinner} aria-hidden="true" />
        <p>{calculation ? 'Wczytywanie kalkulacji…' : 'Wczytywanie historii…'}</p>
      </div>
      <div className={s.skeleton} aria-hidden="true">
        {calculation ? (
          <>
            <div className={s.order}>
              <span className={s.bar} />
              <span className={s.bar} />
              <span className={s.bar} />
            </div>
            <div className={s.columns}>
              <div className={s.panel}>
                <span className={`${s.bar} ${s.title}`} />
                <Rows />
              </div>
              <div className={s.panel}>
                <span className={`${s.bar} ${s.title}`} />
                <Rows count={3} />
                <span className={`${s.bar} ${s.subtitle}`} />
                <Rows count={2} />
              </div>
            </div>
          </>
        ) : (
          <div className={s.history}>
            <Rows count={6} />
          </div>
        )}
      </div>
    </div>
  );
}
