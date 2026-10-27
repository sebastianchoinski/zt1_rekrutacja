// Opt-in preview in Vite only: ?podglad-ladowania=1. Normal requests have no delay.
export async function withLoadingPreview<T>(pending: Promise<T>): Promise<T> {
  if (
    !import.meta.env.DEV ||
    new URLSearchParams(window.location.search).get('podglad-ladowania') !== '1'
  )
    return pending;

  const preview = new Promise<void>((resolve) => window.setTimeout(resolve, 4000));
  try {
    return await pending;
  } finally {
    await preview;
  }
}
