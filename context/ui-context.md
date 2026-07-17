# UI Context

## Theme

Dark-first with a full light variant and an "auto" (OS-following) mode,
toggled via `theme.js` and persisted in localStorage under `buffcat-theme`.
The aesthetic is a Robinhood-style dark trading surface: near-black
backgrounds, Robinhood green as the primary accent, gold/amber for
featured/premium accents, and a subtle Shiba/cat glow motif. Tokens are
CSS custom properties on `:root` (and `:root[data-theme="light"]`).

## Colors (source: buffcat-robinhood.css)

| Role                | CSS Variable          | Dark        | Light        |
| ------------------- | --------------------- | ----------- | ------------ |
| Page background     | `--bg`                | `#06080B`   | `#F4F6F3`    |
| Alt background      | `--bg-2`              | (dark)      | `#EAEEE8`    |
| Surface / panel     | `--panel`             | `#0E1519`   | `#FFFFFF`    |
| Hairline / border   | `--line`              | `rgba(0,200,5,.18)` | `rgba(6,120,10,.16)` |
| Primary accent      | `--green`             | `#00C805`   | `#03962C`    |
| Accent soft         | `--green-soft`        | `#3BE477`   | `#0BA83E`    |
| Accent dim          | `--green-dim`         | `#0E4D22`   | `#C7E9CE`    |
| Featured / gold     | `--gold`              | `#E8B33C`   | `#9A6B12`    |
| Gold hot            | `--gold-hot`          | `#FFD97A`   | `#B8841C`    |
| Primary text        | `--text`              | `#EAF2EC`   | `#0C1A10`    |
| Muted text          | `--dim`               | `#93A29A`   | `#4A5A50`    |
| Ink (on-accent)     | `--ink`               | `#04120A`   | `#F4F6F3`    |
| Error / danger      | `--red`               | `#FF5000`   | `#D23A00`    |
| Shiba glow          | `--shiba-glow`        | `rgba(255,172,58,.18)` | `rgba(200,120,20,.10)` |

## Typography

Web-font stack defined in the stylesheets (headings vs UI/body). Keep the
existing font choices — do not introduce new families. Mono is used for
addresses / numeric onchain values.

## Component / layout conventions

- **No component library, no framework.** Plain semantic HTML + hand-written
  CSS classes. Add UI by writing markup in `mining.html` and styling in
  `mining.css` using the tokens above.
- **Never hardcode hex** — always use the `--token` variables so both themes
  work. Adding a color means adding a token in both `:root` blocks.
- Miner UI patterns: a stat strip (TVL / hashpower / lock fee), a lock form
  with a live breakdown panel, a tier picker (7 buttons), and per-position
  cards (amount, tier, countdown, pending, claim + unlock buttons).
- Position card sub-text reuses the `.pp-meta` class; status uses
  `.pp-status.matured` / `.pp-status.locked`.

## Icons

Emoji + CSS art (e.g. theme toggle uses 🌙/☀️/🌗). No icon library.
