import { Icon } from './Icon.js';
export function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty">
      <Icon name="journal" size={28} />
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
