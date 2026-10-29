import type { ServerRecord } from '../shared/model.js';
export type Session = {
  demo: boolean;
  authenticated: boolean;
  username: string;
};
export type Modal =
  | { kind: 'server'; server?: ServerRecord }
  | { kind: 'entry'; server?: ServerRecord; backupsOnly?: boolean }
  | null;
