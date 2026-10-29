import type { Session } from '../types.js';
import { type ServerRecord } from '../../shared/model.js';
import type { View } from '../navigation.js';
import { Icon } from '../components/Icon.js';
import type { ReactNode } from 'react';
export function Workspace({
  session,
  view,
  navigate,
  setQuery,
  active,
  logout,
  children,
}: {
  session: Session;
  view: View;
  navigate: (view: View, id?: string | null) => void;
  setQuery: (value: string) => void;
  active: ServerRecord[];
  logout: () => Promise<void>;
  children: ReactNode;
}) {
  return (
    <div className="app-shell">
      <a className="skip" href="#content">
        Skip to content
      </a>
      <aside className="sidebar">
        <a className="logo" href={import.meta.env.BASE_URL} aria-label="ANQ Server Ops home">
          <span>
            <Icon name="server" size={22} />
          </span>
          <strong>
            ANQ Server<span className="logo-light">Ops</span>
            <small>THE OPERATIONS JOURNAL</small>
          </strong>
        </a>
        <p className="nav-label">WORKSPACE</p>
        <nav aria-label="Workspace">
          {(
            [
              ['inventory', 'server', 'Inventory'],
              ['journal', 'journal', 'Activity journal'],
              ['backups', 'backup', 'Backup records'],
            ] as const
          ).map(([id, icon, label]) => (
            <button
              key={id}
              className={view === id ? 'nav-item active' : 'nav-item'}
              aria-current={view === id ? 'page' : undefined}
              onClick={() => {
                navigate(id);
                setQuery('');
              }}
            >
              <Icon name={icon} />
              {label}
              {id === 'inventory' && (
                <span className="nav-count" aria-hidden="true">
                  {active.length}
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <Icon name="journal" />
          <strong>A record of your work.</strong>
          <p>Inventory and human-recorded events. No remote commands. No automatic monitoring.</p>
        </div>
        <div className="workspace-user">
          <span className="avatar">
            {session.demo ? 'D' : session.username.slice(0, 1).toUpperCase()}
          </span>
          <div>
            <strong>{session.demo ? 'Demo workspace' : session.username}</strong>
            <small>{session.demo ? 'Fictional data · read-only' : 'Workspace owner'}</small>
          </div>
          {!session.demo && (
            <button className="logout" onClick={logout}>
              Sign out
            </button>
          )}
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span>
            Workspace <span className="breadcrumb">/</span>{' '}
            <strong>
              {view === 'inventory'
                ? 'Server inventory'
                : view === 'journal'
                  ? 'Activity journal'
                  : 'Backup records'}
            </strong>
          </span>
          <a className="export" href={`${import.meta.env.BASE_URL}api/export`}>
            <Icon name="download" size={16} />
            Export JSON
          </a>
        </header>
        <main id="content" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
