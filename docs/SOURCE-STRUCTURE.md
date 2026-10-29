# ANQ Server Ops editing guide

```text
src/client/
  App.tsx             Authenticated data loading, mutation orchestration and page composition
  pages/              Main views, details and sign-in
  components/         Small reusable controls, dialog, field labels and record forms
  layouts/Workspace.tsx Shared sidebar, topbar, export and main reading area
  navigation.ts       View/record links and browser history
  lib/presentation.ts App-local display labels and dates
  types.ts            Client session/modal/view types
  *.css               Semantic tokens and responsive styles
src/server/           Authentication, validation and persistence
src/shared/model.ts   Shared validation and domain rules
```

`pages/Inventory.tsx` renders inventory and selected-server details;
`pages/Journal.tsx` owns journal filtering and paging. Shared Timeline and Badge
components keep inventory/detail/journal rendering consistent. The operation
journal remains a record of human-entered work, not a monitoring/control agent.

For setup, test commands, extension points and contribution conventions, read
[CONTRIBUTING.md](../CONTRIBUTING.md). Keep generated output, private configuration
and credentials out of source. Page/component separation does not move authority
from the API to the browser. Use isolated test schemas for behaviour changes.
