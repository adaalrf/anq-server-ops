import type { FormEvent } from 'react';
import type { Modal } from '../types.js';
import { statuses, kinds, outcomes, type ServerRecord } from '../../shared/model.js';
import { Dialog } from '../components/Dialog.js';
import { Field } from '../components/Field.js';
import { labels } from '../lib/presentation.js';
import { Journal } from '../pages/Journal.js';
export function RecordDialog({
  modal,
  busy,
  setModal,
  setError,
  save,
  active,
  error,
}: {
  modal: Modal;
  busy: boolean;
  setModal: (value: Modal) => void;
  setError: (value: string) => void;
  save: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  active: ServerRecord[];
  error: string;
}) {
  return (
    <>
      {modal && (
        <Dialog
          title={
            modal.kind === 'server'
              ? modal.server
                ? 'Edit server'
                : 'Add a server'
              : modal.server
                ? `Record work · ${modal.server.name}`
                : modal.backupsOnly
                  ? 'Record a backup or restore drill'
                  : 'Record work'
          }
          close={() => {
            if (!busy) {
              setModal(null);
              setError('');
            }
          }}
        >
          <form onSubmit={save}>
            {modal.kind === 'server' ? (
              <>
                <div className="form-grid">
                  <Field label="Server name">
                    <input name="name" required maxLength={80} defaultValue={modal.server?.name} />
                  </Field>
                  <Field label="Game / service">
                    <input name="game" maxLength={80} defaultValue={modal.server?.game} />
                  </Field>
                  <Field label="Hostname (reference only)">
                    <input
                      name="hostname"
                      maxLength={253}
                      defaultValue={modal.server?.hostname}
                      placeholder="server.example.com"
                    />
                  </Field>
                  <Field label="Provider">
                    <input name="provider" maxLength={80} defaultValue={modal.server?.provider} />
                  </Field>
                  <Field label="Region">
                    <input name="region" maxLength={80} defaultValue={modal.server?.region} />
                  </Field>
                  <Field label="Recorded status">
                    <select name="status" defaultValue={modal.server?.status || 'unknown'}>
                      {statuses.map((s) => (
                        <option key={s} value={s}>
                          {labels[s]}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Backup interval target (hours)">
                    <input
                      name="backupIntervalHours"
                      type="number"
                      min={1}
                      max={8760}
                      required
                      defaultValue={modal.server?.backupIntervalHours || 24}
                    />
                  </Field>
                </div>
                <Field label="Notes">
                  <textarea
                    name="notes"
                    rows={4}
                    maxLength={4000}
                    defaultValue={modal.server?.notes}
                  />
                </Field>
                {modal.server && (
                  <label className="checkbox">
                    <input type="checkbox" name="archived" defaultChecked={modal.server.archived} />
                    Archive this server (keeps its journal)
                  </label>
                )}
              </>
            ) : (
              <>
                <p className="form-help">
                  Journal entries are append-only. Add a correction entry if something needs
                  clarifying. No command will be sent to the server.
                </p>
                <Field label="Server">
                  {modal.server ? (
                    <input value={modal.server.name} readOnly />
                  ) : (
                    <select name="serverId" required defaultValue="">
                      <option value="" disabled>
                        Choose an active server…
                      </option>
                      {active.map((server) => (
                        <option key={server.id} value={server.id}>
                          {server.name}
                        </option>
                      ))}
                    </select>
                  )}
                </Field>
                <Field label="Title">
                  <input name="title" maxLength={160} required />
                </Field>
                <div className="form-grid">
                  <Field label="Kind">
                    <select name="kind" defaultValue={modal.backupsOnly ? 'backup' : 'maintenance'}>
                      {(modal.backupsOnly
                        ? kinds.filter((k) => k === 'backup' || k === 'restore')
                        : kinds
                      ).map((k) => (
                        <option key={k} value={k}>
                          {labels[k]}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Outcome">
                    <select name="outcome">
                      {outcomes.map((o) => (
                        <option key={o} value={o}>
                          {labels[o]}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <Field label="Event time (your local time)">
                  <input
                    name="occurredAt"
                    type="datetime-local"
                    required
                    defaultValue={new Date(Date.now() - new Date().getTimezoneOffset() * 60_000)
                      .toISOString()
                      .slice(0, 16)}
                  />
                </Field>
                <Field label="Notes / recovery evidence">
                  <textarea
                    name="notes"
                    rows={5}
                    maxLength={8000}
                    placeholder="What changed? What did you verify? Keep passwords and credentials out of the journal."
                  />
                </Field>
              </>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <div className="form-actions">
              <button
                type="button"
                onClick={() => {
                  setModal(null);
                  setError('');
                }}
                disabled={busy}
              >
                Cancel
              </button>
              <button className="primary" disabled={busy}>
                {busy ? 'Saving…' : modal.kind === 'server' ? 'Save server' : 'Record entry'}
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  );
}
