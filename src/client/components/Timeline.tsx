import type { Entry } from '../../shared/model.js';
import { Icon } from './Icon.js';
import { Badge } from './Badge.js';
import { Empty } from './Empty.js';
import { labels, date } from '../lib/presentation.js';
export function Timeline({
  entries,
  showServer,
  onServer,
}: {
  entries: Entry[];
  showServer?: boolean;
  onServer?: (id: string) => void;
}) {
  if (!entries.length)
    return (
      <Empty
        title="Nothing recorded yet"
        text="Maintenance, incidents, backups, and restore drills will appear here."
      />
    );
  return (
    <ol className="timeline">
      {entries.map((entry) => (
        <li key={entry.id}>
          <span className={`event-icon ${entry.kind}`}>
            <Icon
              name={['backup', 'restore'].includes(entry.kind) ? 'backup' : 'journal'}
              size={18}
            />
          </span>
          <div className="event-body">
            <div className="event-title">
              <h3>{entry.title}</h3>
              <Badge value={entry.outcome} />
            </div>
            <p className="event-meta">
              {showServer && (
                <>
                  <button className="text-button" onClick={() => onServer?.(entry.serverId)}>
                    {entry.serverName}
                  </button>
                  <span> · </span>
                </>
              )}
              {labels[entry.kind]}
              <span> · </span>
              <time dateTime={entry.occurredAt}>{date(entry.occurredAt)}</time>
            </p>
            {entry.notes && <p className="event-notes">{entry.notes}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}
