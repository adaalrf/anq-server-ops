import { labels } from '../lib/presentation.js';
export function Badge({ value }: { value: string }) {
  return (
    <span className={`badge ${value}`}>
      <span aria-hidden="true" />
      {labels[value] || value}
    </span>
  );
}
