# Design

ANQ Server Ops follows the ANQ family system. Engineering decisions live in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md); this file covers the interface.

## This project's settings

- **Blueprint:** workspace. A 15rem `--color-sidebar` beside the working area;
  a sticky top bar with the breadcrumb and export; no hero.
- **Palette:** graphite slate (`--color-brand` #414b52) on neutral grey
  (`--color-canvas` #f6f6f5). Status greens, ambers and reds stay as status.
- **Density:** compact. Body at `--text-base`, ledger rows `--space-4` apart.
- **Signature:** the ledger: hairline rows, server names in serif and every
  record (status, backup age, drill date, journal times) in mono. Each status
  keeps one dot colour wherever it is named.
- **JavaScript:** a React application, so it needs JavaScript. Keep the
  bundle lean and fetch only what the current view shows.

`src/client/tokens.css` owns the contract, the family block and these settings;
`src/client/style.css` owns layout and components, grouped by role, and shares
its frame with ANQ Next Step. The brand name sits at `--text-lg` in the sidebar
so "ANQ Server Ops" holds one line. Counts sit between two rules rather than in
boxes. On phones the ledger's rows stack, with the arrow beside the name. The
server policy is `default-src 'self'`, which already allows the self-hosted
fonts.

## Departures

None.

<!-- One line per broken core rule: the rule, what this project does instead, and why. -->

## Family rules

The full rulebook, blueprints and live components:
https://claude.ai/artifact/AoQLCbGaXeEHqzBuadsihD. Rules are suggestions with
reasons. Overrule a **default** freely. Break a **core** rule only on purpose,
and add it to Departures above.

Core rules, identical in every ANQ project:

1. **Two faces.** Source Serif 4, served as ANQ Serif (`--font-body`, `--font-heading`, optical
   sizing on) for language; IBM Plex Mono (`--font-mono`) for controls:
   navigation, buttons, standalone links, tags, labels, dates, pagination. No
   sans-serif. Self-hosted woff2; the CSP needs `font-src 'self'`.
2. **Sentences stay serif**, even among controls; a link inside a sentence keeps
   the sentence's face.
3. **Accents mark something.** Colour only (`--color-brand`), on a quote, the
   current item or a status; at most one per view, never decoration. No
   italics, bold or underline for emphasis.
4. **Labels** in mono, sentence case: `--text-ui`, `--color-muted`, no forced
   capitals or tracking. A heading that introduces a list of titled entries is a
   label. Number only a real sequence.
5. **Rules before boxes.** 1px `--color-line` hairlines. Three surfaces only:
   Panel, Card, Frame. A shadow only where an element floats over content it
   would otherwise blend into, such as the back-to-top button; never for
   decoration. No coloured side bars.
6. **One scale.** `--text-*`, `--space-*`, `--radius-frame`, `--radius-small`. No
   literal px except 1px borders, component geometry and breakpoints.
7. **Same contract.** Keep the shared token names and the family block in
   `tokens.css`; change the look through the palette and the settings above.
8. **Access** (never a departure): 4.5:1 text in both themes, a solid 3px
   `--color-focus` outline, 44px targets, no motion under
   `prefers-reduced-motion`.

Family defaults:

- Use JavaScript where it earns its place, and load nothing the page does not
  need. Each project's settings say whether it must, or should, work without
  JavaScript.
- An arrow (↗) marks a link to another website; internal links, in-page jumps
  and mail links go without.
- Identity lines are sentences ("Web developer in Norway"), not dot-joined
  fragments. Middle dots belong only inside dense data rows.
