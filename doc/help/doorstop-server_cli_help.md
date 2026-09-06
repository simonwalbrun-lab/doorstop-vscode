# Doorstop CLI Documentation

## Main Command (`doorstop`)

```text
usage: doorstop-server [-h] [-V] [--debug] [--launch] [-j PROJECT] [-P NUM]
                       [-H HOST] [-w] [-b BASEURL]

REST server to display content and reserve item numbers.

options:
  -h, --help             show this help message and exit
  -V, --version          show program's version number and exit
  --debug                run the server in debug mode (default: False)
  --launch               open the server UI in a browser (default: False)
  -j, --project PROJECT  path to the root of the project (default: None)
  -P, --port NUM         use a custom port for the server (default: 7867)
  -H, --host HOST        IP address to listen (default: 127.0.0.1)
  -w, --wsgi             Run as a WSGI process (default: False)
  -b, --baseurl BASEURL  Base URL this is served at (Usually only necessary
                         for WSGI) (default: )

```

## Subcommands

### `doorstop --debug`

```text
usage: doorstop [-h] [-j PATH] [--server HOST] [--port NUMBER] [-f] [-V] [-v |
                -q] [-F] [-r] [-L] [-R] [-C] [-Z] [-S] [-W] [-s PREFIX] [-w]
                [-e]
                <command> ...

Requirements management using version control.

positional arguments:
  <command>
    create                  create a new document directory
    delete                  delete a document directory
    add                     create an item file in a document directory
    remove                  remove an item file from a document directory
    edit                    open an existing item or document for editing
    reorder                 organize the outline structure of a document
    link                    add a new link between two items
    unlink                  remove a link between two items
    clear                   absolve items of their suspect link status
    review                  absolve items of their unreviewed status
    import                  import an existing document or item
    export                  export a document as YAML or another format
    publish                 publish a document as text or another format

options:
  -h, --help                show this help message and exit
  -j, --project PATH        path to the root of the project (default: C:\Users
                            \mflau\Documents\Projekte\vs_code_plugin\testdata)
  --server HOST             IP address or hostname for a running server
                            (default: None)
  --port NUMBER             use a custom port for the server (default: 7867)
  -f, --force               perform the action without the server (default:
                            False)
  -V, --version             show program's version number and exit
  -v, --verbose             enable verbose logging (default: 0)
  -q, --quiet               only display errors and prompts (default: None)
  -F, --no-reformat         do not reformat item files during validation
                            (default: False)
  -r, --reorder             reorder document levels during validation
                            (default: False)
  -L, --no-level-check      do not validate document levels (default: False)
  -R, --no-ref-check        do not validate external file references (default:
                            False)
  -C, --no-child-check      do not validate child (reverse) links (default:
                            False)
  -Z, --strict-child-check  require child (reverse) links from every document
                            (default: False)
  -S, --no-suspect-check    do not check for suspect links (default: False)
  -W, --no-review-check     do not check item review status (default: False)
  -s, --skip PREFIX         skip a document during validation (default: None)
  -w, --warn-all            display all info-level issues as warnings
                            (default: False)
  -e, --error-all           display all warning-level issues as errors
                            (default: False)

```

### `doorstop --launch`

```text
usage: doorstop [-h] [-j PATH] [--server HOST] [--port NUMBER] [-f] [-V] [-v |
                -q] [-F] [-r] [-L] [-R] [-C] [-Z] [-S] [-W] [-s PREFIX] [-w]
                [-e]
                <command> ...

Requirements management using version control.

positional arguments:
  <command>
    create                  create a new document directory
    delete                  delete a document directory
    add                     create an item file in a document directory
    remove                  remove an item file from a document directory
    edit                    open an existing item or document for editing
    reorder                 organize the outline structure of a document
    link                    add a new link between two items
    unlink                  remove a link between two items
    clear                   absolve items of their suspect link status
    review                  absolve items of their unreviewed status
    import                  import an existing document or item
    export                  export a document as YAML or another format
    publish                 publish a document as text or another format

options:
  -h, --help                show this help message and exit
  -j, --project PATH        path to the root of the project (default: C:\Users
                            \mflau\Documents\Projekte\vs_code_plugin\testdata)
  --server HOST             IP address or hostname for a running server
                            (default: None)
  --port NUMBER             use a custom port for the server (default: 7867)
  -f, --force               perform the action without the server (default:
                            False)
  -V, --version             show program's version number and exit
  -v, --verbose             enable verbose logging (default: 0)
  -q, --quiet               only display errors and prompts (default: None)
  -F, --no-reformat         do not reformat item files during validation
                            (default: False)
  -r, --reorder             reorder document levels during validation
                            (default: False)
  -L, --no-level-check      do not validate document levels (default: False)
  -R, --no-ref-check        do not validate external file references (default:
                            False)
  -C, --no-child-check      do not validate child (reverse) links (default:
                            False)
  -Z, --strict-child-check  require child (reverse) links from every document
                            (default: False)
  -S, --no-suspect-check    do not check for suspect links (default: False)
  -W, --no-review-check     do not check item review status (default: False)
  -s, --skip PREFIX         skip a document during validation (default: None)
  -w, --warn-all            display all info-level issues as warnings
                            (default: False)
  -e, --error-all           display all warning-level issues as errors
                            (default: False)

```

