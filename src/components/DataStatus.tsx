export default function DataStatus({ error, fetching, empty, retry, label = 'Information' }: {
  error?: boolean; fetching?: boolean; empty?: boolean; retry?: () => void; label?: string;
}) {
  if (!error && !fetching && !empty) return null;
  return <div role="status" className="my-3 rounded-xl border border-border bg-secondary/20 px-4 py-3 text-sm text-muted-foreground">
    {error ? `${label} could not refresh. Any saved results remain visible.` : fetching ? `Refreshing ${label.toLowerCase()}…` : `No ${label.toLowerCase()} found for this selection.`}
    {error && retry && <button type="button" onClick={retry} disabled={fetching} className="ml-2 min-h-9 font-semibold text-primary underline disabled:opacity-50">Retry</button>}
  </div>;
}
