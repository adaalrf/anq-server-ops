import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import { useNavigation } from './navigation.js';
import type { FormEvent } from 'react';
import type { Session, Modal } from './types.js';
import { backupState, type Entry, type ServerRecord } from '../shared/model.js';
import { Icon } from './components/Icon.js';
import { Journal } from './pages/Journal.js';
import { Inventory } from './pages/Inventory.js';
import { SignIn } from './pages/SignIn.js';
import { Workspace } from './layouts/Workspace.js';
import { RecordDialog } from './components/RecordDialog.js';
export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [servers, setServers] = useState<ServerRecord[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [journalRevision, setJournalRevision] = useState(0);
  const { view, serverId: selectedId, navigate } = useNavigation();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [modal, setModal] = useState<Modal>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const current = await api<Session>('/session');
      if (current.demo || current.authenticated) {
        const [inventory, journal] = await Promise.all([
          api<ServerRecord[]>('/servers'),
          api<Entry[]>('/entries?limit=500'),
        ]);
        setServers(inventory);
        setEntries(journal);
        setJournalRevision((value) => value + 1);
      }
      setSession(current);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [load]);
  const active = servers.filter((s) => !s.archived);
  const selected = servers.find((s) => s.id === selectedId);
  const visible = servers.filter(
    (s) =>
      (filter === 'archived'
        ? s.archived
        : !s.archived && (filter === 'all' || s.status === filter)) &&
      `${s.name} ${s.hostname} ${s.game} ${s.provider} ${s.region}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  useEffect(() => {
    document.title = [
      selected?.name ||
        (view === 'inventory'
          ? 'Server inventory'
          : view === 'journal'
            ? 'Activity journal'
            : 'Backup records'),
      'ANQ Server Ops',
    ].join(' · ');
  }, [view, selected]);
  async function reload() {
    setError('');
    setLoading(true);
    try {
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setBusy(true);
    const data = new FormData(event.currentTarget);
    try {
      await api('/login', {
        username: data.get('username'),
        password: data.get('password'),
      });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!modal) return;
    setBusy(true);
    setError('');
    const data = new FormData(event.currentTarget);
    try {
      if (modal.kind === 'server') {
        const input = {
          name: data.get('name'),
          hostname: data.get('hostname'),
          provider: data.get('provider'),
          region: data.get('region'),
          game: data.get('game'),
          status: data.get('status'),
          notes: data.get('notes'),
          backupIntervalHours: Number(data.get('backupIntervalHours')),
        };
        const server = await api<ServerRecord>(
          modal.server ? `/servers/${modal.server.id}` : '/servers',
          modal.server
            ? {
                ...input,
                version: modal.server.version,
                archived: data.get('archived') === 'on',
              }
            : input,
          modal.server ? 'PUT' : 'POST',
        );
        navigate('inventory', server.id);
        setNotice(modal.server ? 'Server updated.' : 'Server added.');
      } else {
        const serverId = modal.server?.id || String(data.get('serverId') || '');
        if (!active.some((server) => server.id === serverId))
          throw new Error('Choose an active server before recording work.');
        await api(`/servers/${serverId}/entries`, {
          kind: data.get('kind'),
          outcome: data.get('outcome'),
          title: data.get('title'),
          notes: data.get('notes'),
          occurredAt: new Date(String(data.get('occurredAt'))).toISOString(),
        });
        setNotice('Journal entry recorded.');
      }
      setModal(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    setError('');
    try {
      await api('/logout', {});
      setServers([]);
      setEntries([]);
      navigate('inventory');
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  if (!session && loading)
    return (
      <div className="loading" role="status">
        Opening the operations journal…
      </div>
    );
  if (!session)
    return (
      <div className="login">
        <h1>Couldn’t open the journal</h1>
        <p role="alert">{error}</p>
        <button onClick={reload}>Try again</button>
      </div>
    );
  if (!session.demo && !session.authenticated)
    return <SignIn {...{ session, login, error, busy }} />;
  return (
    <>
      <Workspace {...{ session, view, navigate, setQuery, active, logout }}>
        {session.demo && (
          <div className="demo-banner">
            <span className="demo-tag">DEMO</span>
            {session.relativeDates && <span>Sample dates are relative to today.</span>}
            <span>You’re exploring fictional servers. This workspace is read-only.</span>
            <a className="demo-end" href="https://adaalrf.dev/work/anq-server-ops/">
              A project by Martin Røed Flyum
            </a>
          </div>
        )}
        <div className="page-heading">
          <div>
            <p className="eyebrow">YOUR FLEET, DOCUMENTED.</p>
            <h1>
              {view === 'inventory'
                ? 'Server inventory'
                : view === 'journal'
                  ? 'Activity journal'
                  : 'Backup records'}
            </h1>
            <p>
              {view === 'inventory'
                ? 'Know what’s running, what changed, and what needs attention.'
                : view === 'journal'
                  ? 'A chronological record of the work behind your servers.'
                  : 'Recorded backups and restore drills. Evidence, without assumptions.'}
            </p>
          </div>
          <button
            className="primary"
            disabled={session.demo || (view !== 'inventory' && !active.length)}
            title={session.demo ? 'Changes are disabled in the public demo' : undefined}
            onClick={() => {
              setError('');
              setModal(
                view === 'inventory'
                  ? { kind: 'server' }
                  : { kind: 'entry', backupsOnly: view === 'backups' },
              );
            }}
          >
            <Icon name="plus" size={18} />
            {view === 'inventory'
              ? 'Add server'
              : view === 'journal'
                ? 'Record work'
                : 'Record backup'}
            {session.demo && ' · Disabled in demo'}
          </button>
        </div>
        {view !== 'inventory' && !active.length && !loading && (
          <div className="notice">
            <span>Add an active server before recording work.</span>
            <button
              className="text-button"
              disabled={session.demo}
              onClick={() => {
                navigate('inventory');
                setError('');
                setModal({ kind: 'server' });
              }}
            >
              Add a server first
            </button>
          </div>
        )}
        {error && !modal && (
          <div className="error" role="alert">
            {error}{' '}
            <button className="text-button" onClick={reload}>
              Reload
            </button>
          </div>
        )}
        {notice && (
          <div className="notice" role="status">
            {notice}
            <button className="text-button" onClick={() => setNotice('')}>
              Dismiss
            </button>
          </div>
        )}
        <div className="stats">
          <div>
            <span className="stat-icon">
              <Icon name="server" />
            </span>
            <span>
              Active inventory
              <strong>
                {active.length}
                <small>{active.length === 1 ? 'server' : 'servers'}</small>
              </strong>
            </span>
          </div>
          <div>
            <span className="stat-icon green">
              <Icon name="server" />
            </span>
            <span>
              Recorded operational
              <strong>
                {active.filter((s) => s.status === 'operational').length}
                <small>
                  {active.filter((s) => s.status === 'operational').length === 1
                    ? 'server'
                    : 'servers'}
                </small>
              </strong>
            </span>
          </div>
          <div>
            <span className="stat-icon amber">
              <Icon name="backup" />
            </span>
            <span>
              Backup attention
              <strong>
                {active.filter((s) => backupState(s) !== 'recorded').length}
                <small>overdue or missing</small>
              </strong>
            </span>
          </div>
          <div>
            <span className="stat-icon">
              <Icon name="journal" />
            </span>
            <span>
              Journal entries
              <strong>
                {entries.length}
                {entries.length === 500 && '+'}
                <small>recent records</small>
              </strong>
            </span>
          </div>
        </div>
        <Inventory
          {...{
            selectedId,
            selected,
            loading,
            error,
            navigate,
            session,
            setError,
            setModal,
            servers,
            journalRevision,
            view,
            visible,
            query,
            setQuery,
            filter,
            setFilter,
            reload,
          }}
        />
        <div className="bottom-note">
          <Icon name="backup" size={17} />
          <p>
            <strong>A backup record isn’t a recovery guarantee.</strong> Keep encrypted copies
            off-server and record a restore drill after testing one.
          </p>
        </div>
        <footer>
          <span>
            ANQ Server Ops <span className="separator">/</span> A practical little tool by adaalrf
          </span>
          <span>All dates shown in your local time</span>
        </footer>
      </Workspace>
      <RecordDialog {...{ modal, busy, setModal, setError, save, active, error }} />
    </>
  );
}
