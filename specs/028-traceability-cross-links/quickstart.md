# Quickstart: Traceability Cross-Document Links

## Prerequisites

- `pip install -e "./server[dev]"` (installs doorstop too)
- git on PATH (Doorstop needs a VCS root)

## 1. Sample project

```bash
mkdir xlink && cd xlink && git init -q
doorstop create REQ ./req && doorstop create SYS ./sys --parent REQ && doorstop create TST ./tst --parent SYS
doorstop add REQ && doorstop add REQ && doorstop add SYS && doorstop add SYS && doorstop add TST
doorstop link TST1 SYS1 && doorstop link TST1 SYS2 && doorstop link TST1 REQ2
doorstop link SYS1 REQ1 && doorstop link SYS2 REQ1
```

## 2. Command line

```bash
doorstop publish all plain --html                                           # Doorstop only
python -m doorstop_server.publish all complete --html                       # default
python -m doorstop_server.publish --traceability doorstop all dsmatrix --html
python -m doorstop_server.publish all nochild --html --no-child-links
```

Expected (see [contracts/publish-cli.md](contracts/publish-cli.md)):

| Output | `traceability.csv` REQ002 row | REQ002 child links on `REQ.html` |
| ------ | ----------------------------- | -------------------------------- |
| plain | `REQ002,,` | none |
| complete | `REQ002,,TST001` | TST001 |
| dsmatrix | `REQ002,,` (same as plain) | TST001 |
| nochild | `REQ002,,TST001` | no child links; TST001's links are labelled "Links:" |

In every output, TST001 lists REQ002, SYS001 and SYS002 as parents (or as
"Links:" in nochild), and the two SYS rows are the same.

## 3. Extension

1. Publish, then "All documents - combined run", then HTML. Expected:
   - `traceability.html` has the REQ002/TST001 row;
   - PDF output: `traceability.pdf` has it too.
2. Set `doorstop.publish.traceability` to `doorstop` and publish again.
   Expected: the matrix matches "plain", and REQ002 still lists TST001.
3. Check `doorstop.publish.noChildLinks` and publish again. Expected: no
   child links anywhere, and the matrix is unchanged.

## 4. Automated

```bash
pytest server/tests/test_traceability.py
npm test                                   # regressionFixture.test.ts (FR-011/FR-012)
node --test src/test/pdf/exportPdf.test.mjs
```

These tests run in the CI jobs `server-tests`, `extension-integration-tests`
and `pdf-export`.
