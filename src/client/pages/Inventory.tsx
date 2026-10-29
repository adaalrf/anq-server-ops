import type { Session, Modal } from '../types.js';
import { backupState, statuses, type ServerRecord } from '../../shared/model.js';
import type { View } from '../navigation.js';
import { Icon } from '../components/Icon.js';
import { Badge } from '../components/Badge.js';
import { Empty } from '../components/Empty.js';
import { Timeline } from '../components/Timeline.js';
import { labels, date, relative } from '../lib/presentation.js';
import { Journal } from './Journal.js';
export function Inventory({
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
}: {
  selectedId: string | null;
  selected?: ServerRecord;
  loading: boolean;
  error: string;
  navigate: (view: View, id?: string | null) => void;
  session: Session;
  setError: (value: string) => void;
  setModal: (value: Modal) => void;
  servers: ServerRecord[];
  journalRevision: number;
  view: View;
  visible: ServerRecord[];
  query: string;
  setQuery: (value: string) => void;
  filter: string;
  setFilter: (value: string) => void;
  reload: () => Promise<void>;
}) {
  return (
    <>
      {selectedId && !selected ? (
        <section className="inventory-panel">
          {loading || error ? (
            <p className="subtle">
              {loading ? 'Loading server…' : 'Unable to load this server. Use Reload to try again.'}
            </p>
          ) : (
            <>
              <Empty
                title="Server not found"
                text="This server link does not match a record in this workspace."
              />
              <div className="missing-actions">
                <button onClick={() => navigate('inventory')}>Back to inventory</button>
              </div>
            </>
          )}
        </section>
      ) : selected ? (
        <section className="detail" aria-labelledby="detail-title">
          <button className="back-button" onClick={() => navigate('inventory')}>
            ← Back to inventory
          </button>
          <div className="detail-heading">
            <div>
              <p className="eyebrow">
                {selected.game || 'SERVER'} · {selected.region || 'NO REGION'}
              </p>
              <h2 id="detail-title">{selected.name}</h2>
              <code>{selected.hostname || 'No hostname recorded'}</code>
            </div>
            <Badge value={selected.status} />
          </div>
          <div className="detail-actions">
            <button
              disabled={session.demo}
              onClick={() => {
                setError('');
                setModal({ kind: 'server', server: selected });
              }}
            >
              Edit server
            </button>
            <button
              disabled={session.demo || selected.archived}
              onClick={() => {
                setError('');
                setModal({ kind: 'entry', server: selected });
              }}
            >
              <Icon name="plus" size={16} />
              Record work
            </button>
            {selected.archived && <Badge value="Archived" />}
          </div>
          <dl className="facts">
            <div>
              <dt>Provider</dt>
              <dd>{selected.provider || 'Not recorded'}</dd>
            </div>
            <div>
              <dt>Backup target</dt>
              <dd>Every {selected.backupIntervalHours}h</dd>
            </div>
            <div>
              <dt>Last completed backup</dt>
              <dd>
                {date(selected.lastBackupAt)} <Badge value={backupState(selected)} />
              </dd>
            </div>
            <div>
              <dt>Last completed restore drill</dt>
              <dd>{date(selected.lastRestoreAt)}</dd>
            </div>
          </dl>
          {selected.notes && (
            <div className="server-notes">
              <h3>Notes</h3>
              <p>{selected.notes}</p>
            </div>
          )}
          <div className="section-title">
            <h3>Server journal</h3>
            <span>Newest event first · local time</span>
          </div>
          <Journal
            key={selected.id}
            serverId={selected.id}
            servers={servers}
            revision={journalRevision}
            renderEntries={(items) => <Timeline entries={items} />}
          />
        </section>
      ) : (
        <section className="inventory-panel">
          {view === 'inventory' && (
            <div className="panel-toolbar">
              <div className="panel-title">
                <h2>Your servers</h2>
                <span>{visible.length}</span>
              </div>
              <div className="filters">
                <label className="search">
                  <Icon name="search" size={17} />
                  <input
                    aria-label="Search servers"
                    placeholder="Search servers…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
                <select
                  aria-label="Filter server status"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  <option value="all">All active statuses</option>
                  {statuses.map((s) => (
                    <option key={s} value={s}>
                      {labels[s]}
                    </option>
                  ))}
                  <option value="archived">Archived</option>
                </select>
              </div>
            </div>
          )}
          {loading && (
            <p className="subtle" role="status">
              Refreshing workspace…
            </p>
          )}
          {view === 'inventory' ? (
            visible.length ? (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">SERVER</th>
                      <th scope="col">RECORDED STATUS</th>
                      <th scope="col">BACKUP RECORD</th>
                      <th scope="col">LAST RESTORE DRILL</th>
                      <th scope="col">
                        <span className="sr-only">Details</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((s) => (
                      <tr key={s.id}>
                        <td>
                          <button
                            className="server-link"
                            onClick={() => navigate('inventory', s.id)}
                          >
                            <span className={`server-avatar ${s.game.toLowerCase()}`}>
                              {s.name.slice(0, 1)}
                            </span>
                            <span>
                              <strong>{s.name}</strong>
                              <small>
                                {s.game || 'Unspecified game'}
                                <span className="separator">·</span>
                                {s.region || s.provider || 'No region'}
                              </small>
                            </span>
                          </button>
                        </td>
                        <td>
                          <Badge value={s.status} />
                          <small className="cell-note">Updated {date(s.updatedAt, true)}</small>
                        </td>
                        <td>
                          <Badge value={backupState(s)} />
                          <small className="cell-note">{relative(s.lastBackupAt)}</small>
                        </td>
                        <td>
                          <span className="date-text">{date(s.lastRestoreAt, true)}</span>
                          <small className="cell-note">
                            {s.lastRestoreAt ? 'Completed drill' : 'No completed drill'}
                          </small>
                        </td>
                        <td>
                          <button
                            className="icon-button"
                            aria-label={`View ${s.name}`}
                            onClick={() => navigate('inventory', s.id)}
                          >
                            <Icon name="arrow" size={18} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty
                title={
                  query || filter !== 'all' ? 'No matching servers' : 'Your inventory starts here'
                }
                text={
                  query || filter !== 'all'
                    ? 'Try a different search or status filter.'
                    : 'Add a server, then record maintenance and backups as you go.'
                }
              />
            )
          ) : (
            <Journal
              key={view}
              servers={servers}
              backupsOnly={view === 'backups'}
              revision={journalRevision}
              renderEntries={(items) => (
                <Timeline entries={items} showServer onServer={(id) => navigate('inventory', id)} />
              )}
            />
          )}
          <div className="panel-footer">
            <span>
              <Icon name="clock" size={14} />
              Manually recorded · not live monitoring
            </span>
            <button className="text-button" onClick={reload} disabled={loading}>
              Refresh records
            </button>
          </div>
        </section>
      )}
    </>
  );
}
