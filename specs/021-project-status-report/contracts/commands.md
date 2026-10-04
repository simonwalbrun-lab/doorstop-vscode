# Contract: commands (user-facing)

## New command

| Id | Title (palette) | Commands panel row | Icon |
| --- | --- | --- | --- |
| `doorstop.statusReport` | `Doorstop: Generate Status Report` | `Generate Status Report` | `graph` |

- Contributed in `package.json` under `contributes.commands`.
- It needs no `menus` entries. The palette shows it by default, and the panel row
  comes from `src/commandsProvider.ts`.

## Changed: `doorstop.publish`

1. The document picker is `chooseDocumentOrAll`, so the choices are the
   document prefixes plus `all`.
2. The format picker is unchanged (Markdown / HTML / LaTeX).
3. The destination depends on the first choice:
   - **a single document**: a save dialog, unchanged;
   - **`all`**: a folder dialog (`showOpenDialog`, folders only, label
     `Publish All`).
4. With `all`, each document is published to `<folder>/<PREFIX><ext>`. The
   `doorstop.publish.template` setting applies as for a single publish.
5. With `all`, success shows one information message with the folder and the
   count. The first failing document stops the run with an error naming it
   and the reason. No document → the message
   `No documents to publish.`

## Changed: every command registered in `registerDoorstopCommands`

- **Busy guard**: when a command reaches its server work while an earlier run
  of the same command is still working, it shows
  `Doorstop: <title> is already running.` and does no work.
- **Progress**: while the command's server work runs, the editor shows a
  progress notification titled `Doorstop: <title>…`. It closes on success,
  error or cancellation.

The server API is unchanged. The endpoints used are `GET /tree`,
`GET /validate` and `POST /documents/{prefix}/publish`.
