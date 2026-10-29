import { useEffect, useState, type ReactNode } from 'react';
import { api } from '../api.js';
import { kinds, outcomes, type Entry, type ServerRecord } from '../../shared/model.js';

type Filters = {
  server: string;
  kind: string;
  outcome: string;
  from: string;
  to: string;
  search: string;
};
type Page = { items: Entry[]; total: number; nextCursor: string | null };
const names: Record<keyof Filters, string> = {
  server: 'journalServer',
  kind: 'journalKind',
  outcome: 'journalOutcome',
  from: 'journalFrom',
  to: 'journalTo',
  search: 'journalSearch',
};
const labels: Record<string, string> = {
  maintenance: 'Maintenance',
  incident: 'Incident',
  backup: 'Backup',
  restore: 'Restore drill',
  completed: 'Completed',
  planned: 'Planned',
  failed: 'Failed',
};
function readFilters(): Filters {
  const params = new URLSearchParams(location.search);
  return Object.fromEntries(
    Object.entries(names).map(([key, name]) => [key, params.get(name) || '']),
  ) as Filters;
}
export function Journal({
  servers,
  serverId,
  backupsOnly = false,
  revision,
  renderEntries,
}: {
  servers: ServerRecord[];
  serverId?: string;
  backupsOnly?: boolean;
  revision: number;
  renderEntries: (entries: Entry[]) => ReactNode;
}) {
  const [filters, setFilters] = useState(readFilters);
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const [page, setPage] = useState<Page | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const kind = backupsOnly && !['backup', 'restore'].includes(filters.kind) ? '' : filters.kind;
  useEffect(() => {
    const pop = () => {
      setFilters(readFilters());
      setCursors([null]);
    };
    window.addEventListener('popstate', pop);
    return () => window.removeEventListener('popstate', pop);
  }, []);
  const parameters = new URLSearchParams({
    limit: '25',
    scope: backupsOnly ? 'backups' : 'all',
  });
  if (serverId || filters.server) parameters.set('serverId', serverId || filters.server);
  if (kind) parameters.set('kind', kind);
  if (filters.outcome) parameters.set('outcome', filters.outcome);
  if (filters.search) parameters.set('q', filters.search);
  let dateError = '';
  for (const [field, value] of [
    ['from', filters.from],
    ['to', filters.to],
  ] as const) {
    if (!value) continue;
    const day = new Date(`${value}T00:00:00`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(day.getTime())) {
      dateError = 'Choose valid dates.';
      continue;
    }
    if (field === 'to') day.setDate(day.getDate() + 1);
    parameters.set(field, day.toISOString());
  }
  if (filters.from && filters.to && filters.from > filters.to)
    dateError = 'The end date must not be before the start date.';
  const query = parameters.toString();
  const cursor = cursors.at(-1);
  useEffect(() => {
    setCursors([null]);
  }, [revision]);
  useEffect(() => {
    let current = true;
    setLoading(true);
    setError('');
    if (dateError) {
      setPage(null);
      setLoading(false);
      return;
    }
    const params = new URLSearchParams(query);
    if (cursor) params.set('cursor', cursor);
    const timeout = setTimeout(() => {
      void api<Page>(`/entries/page?${params}`)
        .then((result) => {
          if (current) setPage(result);
        })
        .catch((e) => {
          if (current) {
            setError(e.message);
            setPage(null);
          }
        })
        .finally(() => {
          if (current) setLoading(false);
        });
    }, 150);
    return () => {
      current = false;
      clearTimeout(timeout);
    };
  }, [query, cursor, dateError, revision, retry]);
  function change(next: Filters) {
    const url = new URL(location.href);
    for (const [key, name] of Object.entries(names)) {
      const value = next[key as keyof Filters];
      if (value) url.searchParams.set(name, value);
      else url.searchParams.delete(name);
    }
    // Typing refines the current view; Back returns to the previous view/server.
    history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    setFilters(next);
    setCursors([null]);
  }
  const field = (key: keyof Filters, value: string) => change({ ...filters, [key]: value });
  return (
    <div className="journal-browser">
      <div className="journal-filters">
        {!serverId && (
          <label>
            Filter by server
            <select
              aria-label="Filter by server"
              value={filters.server}
              onChange={(e) => field('server', e.target.value)}
            >
              <option value="">All servers</option>
              {servers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.archived ? ' (archived)' : ''}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Event kind
          <select
            aria-label="Event kind"
            value={kind}
            onChange={(e) => field('kind', e.target.value)}
          >
            <option value="">All kinds</option>
            {kinds
              .filter((k) => !backupsOnly || ['backup', 'restore'].includes(k))
              .map((k) => (
                <option key={k} value={k}>
                  {labels[k]}
                </option>
              ))}
          </select>
        </label>
        <label>
          Result
          <select
            aria-label="Result"
            value={filters.outcome}
            onChange={(e) => field('outcome', e.target.value)}
          >
            <option value="">All results</option>
            {outcomes.map((o) => (
              <option key={o} value={o}>
                {labels[o]}
              </option>
            ))}
          </select>
        </label>
        <label>
          From date
          <input type="date" value={filters.from} onChange={(e) => field('from', e.target.value)} />
        </label>
        <label>
          Through date
          <input type="date" value={filters.to} onChange={(e) => field('to', e.target.value)} />
        </label>
        <label className="journal-search">
          Search journal
          <input
            maxLength={200}
            value={filters.search}
            onChange={(e) => field('search', e.target.value)}
            placeholder="Title, notes, or server…"
          />
        </label>
        <button
          className="text-button"
          onClick={() =>
            change({
              server: '',
              kind: '',
              outcome: '',
              from: '',
              to: '',
              search: '',
            })
          }
        >
          Clear filters
        </button>
      </div>
      {(error || dateError) && (
        <p className="error" role="alert">
          {error || dateError}
          {error && <button onClick={() => setRetry((value) => value + 1)}>Try again</button>}
        </p>
      )}
      {loading ? (
        <p className="subtle" role="status">
          Loading journal…
        </p>
      ) : (
        page && (
          <>
            <p className="journal-summary" role="status">
              {page.total} matching {page.total === 1 ? 'record' : 'records'} · Page{' '}
              {cursors.length}
            </p>
            {renderEntries(page.items)}
          </>
        )
      )}
      <nav className="journal-pagination" aria-label="Journal pages">
        <button
          disabled={loading || cursors.length === 1}
          onClick={() => setCursors((values) => values.slice(0, -1))}
        >
          Previous page
        </button>
        <button
          disabled={loading || !page?.nextCursor || !!dateError || !!error}
          onClick={() => setCursors((values) => [...values, page!.nextCursor])}
        >
          Next page
        </button>
      </nav>
    </div>
  );
}
