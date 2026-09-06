# Doorstop CLI Documentation

## Main Command (`doorstop`)

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

## Subcommands

### `doorstop create`

```text
usage: doorstop create [-h] [-j PATH] [--server HOST] [--port NUMBER] [-f]
                       [-V] [-v | -q] [-p PARENT] [-i {yaml,markdown}]
                       [-d DIGITS] [-s SEP]
                       prefix path

Create a new document directory.

positional arguments:
  prefix                            document prefix for new item UIDs
  path                              path to a directory for item files

options:
  -h, --help                        show this help message and exit
  -j, --project PATH                path to the root of the project (default:
                                    C:\Users\mflau\Documents\Projekte\vs_code_
                                    plugin\testdata)
  --server HOST                     IP address or hostname for a running
                                    server (default: None)
  --port NUMBER                     use a custom port for the server (default:
                                    7867)
  -f, --force                       perform the action without the server
                                    (default: False)
  -V, --version                     show program's version number and exit
  -v, --verbose                     enable verbose logging (default: 0)
  -q, --quiet                       only display errors and prompts (default:
                                    None)
  -p, --parent PARENT               prefix of parent document (default: None)
  -i, --itemformat {yaml,markdown}  item file format (default: yaml)
  -d, --digits DIGITS               number of digits in item UIDs (default: 3)
  -s, --separator SEP               separator between the prefix and the
                                    number or name in an item UID; the only
                                    valid separators are '-', '_', and '.'
                                    (default: )

```

### `doorstop delete`

```text
usage: doorstop delete [-h] [-j PATH] [--server HOST] [--port NUMBER] [-f]
                       [-V] [-v | -q]
                       prefix

Delete a document directory.

positional arguments:
  prefix              prefix of document to delete

options:
  -h, --help          show this help message and exit
  -j, --project PATH  path to the root of the project (default: C:\Users\mflau
                      \Documents\Projekte\vs_code_plugin\testdata)
  --server HOST       IP address or hostname for a running server (default:
                      None)
  --port NUMBER       use a custom port for the server (default: 7867)
  -f, --force         perform the action without the server (default: False)
  -V, --version       show program's version number and exit
  -v, --verbose       enable verbose logging (default: 0)
  -q, --quiet         only display errors and prompts (default: None)

```

### `doorstop add`

```text
usage: doorstop add [-h] [-j PATH] [--server HOST] [--port NUMBER] [-f] [-V]
                    [-v | -q] [-l LEVEL] [-n NANU] [-c COUNT] [--edit]
                    [-T PROGRAM] [-d FILE] [--noreorder]
                    prefix

Create an item file in a document directory.

positional arguments:
  prefix                     document prefix for the new item

options:
  -h, --help                 show this help message and exit
  -j, --project PATH         path to the root of the project (default: C:\User
                             s\mflau\Documents\Projekte\vs_code_plugin\testdat
                             a)
  --server HOST              IP address or hostname for a running server
                             (default: None)
  --port NUMBER              use a custom port for the server (default: 7867)
  -f, --force                perform the action without the server (default:
                             False)
  -V, --version              show program's version number and exit
  -v, --verbose              enable verbose logging (default: 0)
  -q, --quiet                only display errors and prompts (default: None)
  -l, --level LEVEL          desired item level (e.g. 1.2.3) (default: None)
  -n, --name, --number NANU  use the specified name or number NANU instead of
                             an automatically generated number for the UID
                             (together with the document prefix and
                             separator); the NANU must be a number or a string
                             which does not contain separator characters
                             (default: None)
  -c, --count COUNT          number of items to create (default: 1)
  --edit                     Open default editor to edit the added item.
                             Default editor can be set using the environment
                             variable EDITOR. (default: False)
  -T, --tool PROGRAM         text editor to open the document item
                             (onlyrequired if $EDITOR is not found
                             inenvironment). Useless option without --edit
                             (default: None)
  -d, --defaults FILE        file in YAML format with default values for
                             attributes of the new item (default: None)
  --noreorder                disable automatic reordering of file (default:
                             True)

```

### `doorstop remove`

```text
usage: doorstop remove [-h] [-j PATH] [--server HOST] [--port NUMBER] [-f]
                       [-V] [-v | -q]
                       uid

Remove an item file from a document directory.

positional arguments:
  uid                 item UID to remove from its document

options:
  -h, --help          show this help message and exit
  -j, --project PATH  path to the root of the project (default: C:\Users\mflau
                      \Documents\Projekte\vs_code_plugin\testdata)
  --server HOST       IP address or hostname for a running server (default:
                      None)
  --port NUMBER       use a custom port for the server (default: 7867)
  -f, --force         perform the action without the server (default: False)
  -V, --version       show program's version number and exit
  -v, --verbose       enable verbose logging (default: 0)
  -q, --quiet         only display errors and prompts (default: None)

```

### `doorstop edit`

```text
usage: doorstop edit [-h] [-j PATH] [--server HOST] [--port NUMBER] [-f] [-V]
                     [-v | -q] [-a] [-i | -d] [-y | -c | -t | -x] [-T PROGRAM]
                     label

Open an existing item or document for editing.

positional arguments:
  label               item UID or document prefix to open for editing

options:
  -h, --help          show this help message and exit
  -j, --project PATH  path to the root of the project (default: C:\Users\mflau
                      \Documents\Projekte\vs_code_plugin\testdata)
  --server HOST       IP address or hostname for a running server (default:
                      None)
  --port NUMBER       use a custom port for the server (default: 7867)
  -f, --force         perform the action without the server (default: False)
  -V, --version       show program's version number and exit
  -v, --verbose       enable verbose logging (default: 0)
  -q, --quiet         only display errors and prompts (default: None)
  -a, --all           Edit the whole item with all its attributes. Without
                      this option, only its text is opened for edition.
                      Useless when editing a whole document. (default: False)
  -i, --item          indicates the 'label' is an item UID (default: False)
  -d, --document      indicates the 'label' is a document prefix (default:
                      False)
  -y, --yaml          edit document as exported YAML (default) (default:
                      False)
  -c, --csv           edit document as exported CSV (default: False)
  -t, --tsv           edit document as exported TSV (default: False)
  -x, --xlsx          edit document as exported XLSX (default: False)

required arguments:
  -T, --tool PROGRAM  text editor to open the document item (only required if
                      $EDITOR is not found in environment) (default: None)

```

### `doorstop reorder`

```text
usage: doorstop reorder [-h] [-j PATH] [--server HOST] [--port NUMBER] [-f]
                        [-V] [-v | -q] [-a | -m] [-T PROGRAM]
                        prefix

Organize the outline structure of a document.

positional arguments:
  prefix              prefix of document to reorder

options:
  -h, --help          show this help message and exit
  -j, --project PATH  path to the root of the project (default: C:\Users\mflau
                      \Documents\Projekte\vs_code_plugin\testdata)
  --server HOST       IP address or hostname for a running server (default:
                      None)
  --port NUMBER       use a custom port for the server (default: 7867)
  -f, --force         perform the action without the server (default: False)
  -V, --version       show program's version number and exit
  -v, --verbose       enable verbose logging (default: 0)
  -q, --quiet         only display errors and prompts (default: None)
  -a, --auto          only perform automatic item reordering (default: False)
  -m, --manual        do not automatically reorder the items (default: False)
  -T, --tool PROGRAM  text editor to open the document index (default: None)

```

### `doorstop link`

```text
usage: doorstop link [-h] [-j PATH] [--server HOST] [--port NUMBER] [-f] [-V]
                     [-v | -q]
                     child parent

Add a new link between two items.

positional arguments:
  child               child item UID to link to the parent
  parent              parent item UID to link from the child

options:
  -h, --help          show this help message and exit
  -j, --project PATH  path to the root of the project (default: C:\Users\mflau
                      \Documents\Projekte\vs_code_plugin\testdata)
  --server HOST       IP address or hostname for a running server (default:
                      None)
  --port NUMBER       use a custom port for the server (default: 7867)
  -f, --force         perform the action without the server (default: False)
  -V, --version       show program's version number and exit
  -v, --verbose       enable verbose logging (default: 0)
  -q, --quiet         only display errors and prompts (default: None)

```

### `doorstop unlink`

```text
usage: doorstop unlink [-h] [-j PATH] [--server HOST] [--port NUMBER] [-f]
                       [-V] [-v | -q]
                       child parent

Remove a link between two items.

positional arguments:
  child               child item UID to unlink from parent
  parent              parent item UID child is linked to

options:
  -h, --help          show this help message and exit
  -j, --project PATH  path to the root of the project (default: C:\Users\mflau
                      \Documents\Projekte\vs_code_plugin\testdata)
  --server HOST       IP address or hostname for a running server (default:
                      None)
  --port NUMBER       use a custom port for the server (default: 7867)
  -f, --force         perform the action without the server (default: False)
  -V, --version       show program's version number and exit
  -v, --verbose       enable verbose logging (default: 0)
  -q, --quiet         only display errors and prompts (default: None)

```

### `doorstop clear`

```text
usage: doorstop clear [-h] [-j PATH] [--server HOST] [--port NUMBER] [-f] [-V]
                      [-v | -q] [-i | -d]
                      label [parents ...]

Absolve items of their suspect link status.

positional arguments:
  label               item UID, document prefix, or 'all'
  parents             only clear links with these parent item UIDs (default:
                      None)

options:
  -h, --help          show this help message and exit
  -j, --project PATH  path to the root of the project (default: C:\Users\mflau
                      \Documents\Projekte\vs_code_plugin\testdata)
  --server HOST       IP address or hostname for a running server (default:
                      None)
  --port NUMBER       use a custom port for the server (default: 7867)
  -f, --force         perform the action without the server (default: False)
  -V, --version       show program's version number and exit
  -v, --verbose       enable verbose logging (default: 0)
  -q, --quiet         only display errors and prompts (default: None)
  -i, --item          indicates the 'label' is an item UID (default: False)
  -d, --document      indicates the 'label' is a document prefix (default:
                      False)

```

### `doorstop review`

```text
usage: doorstop review [-h] [-j PATH] [--server HOST] [--port NUMBER] [-f]
                       [-V] [-v | -q] [-i | -d]
                       label

Absolve items of their unreviewed status.

positional arguments:
  label               item UID, document prefix, or 'all'

options:
  -h, --help          show this help message and exit
  -j, --project PATH  path to the root of the project (default: C:\Users\mflau
                      \Documents\Projekte\vs_code_plugin\testdata)
  --server HOST       IP address or hostname for a running server (default:
                      None)
  --port NUMBER       use a custom port for the server (default: 7867)
  -f, --force         perform the action without the server (default: False)
  -V, --version       show program's version number and exit
  -v, --verbose       enable verbose logging (default: 0)
  -q, --quiet         only display errors and prompts (default: None)
  -i, --item          indicates the 'label' is an item UID (default: False)
  -d, --document      indicates the 'label' is a document prefix (default:
                      False)

```

### `doorstop import`

```text
usage: doorstop import [-h] [-j PATH] [--server HOST] [--port NUMBER] [-f]
                       [-V] [-v | -q] [-d ARG ARG | -i ARG ARG] [-p PREFIX]
                       [-a DICT] [-m DICT]
                       [path] [prefix]

Import an existing document or item.

positional arguments:
  path                    path to previously exported document file (default:
                          None)
  prefix                  prefix of document for import (default: None)

options:
  -h, --help              show this help message and exit
  -j, --project PATH      path to the root of the project (default: C:\Users\m
                          flau\Documents\Projekte\vs_code_plugin\testdata)
  --server HOST           IP address or hostname for a running server
                          (default: None)
  --port NUMBER           use a custom port for the server (default: 7867)
  -f, --force             perform the action without the server (default:
                          False)
  -V, --version           show program's version number and exit
  -v, --verbose           enable verbose logging (default: 0)
  -q, --quiet             only display errors and prompts (default: None)
  -d, --document ARG ARG  import an existing document by: PREFIX PATH
                          (default: None)
  -i, --item ARG ARG      import an existing item by: PREFIX UID (default:
                          None)
  -p, --parent PREFIX     parent document prefix for imported document
                          (default: None)
  -a, --attrs DICT        dictionary of item attributes to import (default:
                          None)
  -m, --map DICT          dictionary of custom item attribute names (default:
                          None)

```

### `doorstop export`

```text
usage: doorstop export [-h] [-j PATH] [--server HOST] [--port NUMBER] [-f]
                       [-V] [-v | -q] [-y | -c | -t | -x] [-w WIDTH]
                       prefix [path]

Export a document as yaml or another format.

positional arguments:
  prefix              prefix of document to export or 'all'
  path                path to exported file or directory for 'all' (default:
                      None)

options:
  -h, --help          show this help message and exit
  -j, --project PATH  path to the root of the project (default: C:\Users\mflau
                      \Documents\Projekte\vs_code_plugin\testdata)
  --server HOST       IP address or hostname for a running server (default:
                      None)
  --port NUMBER       use a custom port for the server (default: 7867)
  -f, --force         perform the action without the server (default: False)
  -V, --version       show program's version number and exit
  -v, --verbose       enable verbose logging (default: 0)
  -q, --quiet         only display errors and prompts (default: None)
  -y, --yaml          output YAML (default when no path) (default: False)
  -c, --csv           output CSV (default for 'all') (default: False)
  -t, --tsv           output TSV (default: False)
  -x, --xlsx          output XLSX (default: False)
  -w, --width WIDTH   limit line width on text output (default: None)

```

### `doorstop publish`

```text
usage: doorstop publish [-h] [-j PATH] [--server HOST] [--port NUMBER] [-f]
                        [-V] [-v | -q] [-t | -m | -l | -H] [-w WIDTH] [-C]
                        [--no-levels {all,body}] [--template TEMPLATE]
                        [--index]
                        prefix [path]

Publish a document as text or another format.

positional arguments:
  prefix                  prefix of document to publish or 'all'
  path                    path to published file or directory for 'all'
                          (default: None)

options:
  -h, --help              show this help message and exit
  -j, --project PATH      path to the root of the project (default: C:\Users\m
                          flau\Documents\Projekte\vs_code_plugin\testdata)
  --server HOST           IP address or hostname for a running server
                          (default: None)
  --port NUMBER           use a custom port for the server (default: 7867)
  -f, --force             perform the action without the server (default:
                          False)
  -V, --version           show program's version number and exit
  -v, --verbose           enable verbose logging (default: 0)
  -q, --quiet             only display errors and prompts (default: None)
  -t, --text              output text (default when no path) (default: False)
  -m, --markdown          output Markdown (default: False)
  -l, --latex             output LaTeX (default: False)
  -H, --html              output HTML (default for 'all') (default: False)
  -w, --width WIDTH       limit line width on text output (default: None)
  -C, --no-child-links    do not include child links on items (default: False)
  --no-levels {all,body}  do not include levels on heading and non-heading or
                          non-heading items (default: None)
  --template TEMPLATE     template file (default: None)
  --index                 Generate top level index (when producing markdown).
                          (default: False)

```

### `doorstop --server`

```text
usage: doorstop [-h] [-j PATH] [--server HOST] [--port NUMBER] [-f] [-V] [-v |
                -q] [-F] [-r] [-L] [-R] [-C] [-Z] [-S] [-W] [-s PREFIX] [-w]
                [-e]
                <command> ...
doorstop: error: argument --server: expected one argument

```

### `doorstop --port`

```text
usage: doorstop [-h] [-j PATH] [--server HOST] [--port NUMBER] [-f] [-V] [-v |
                -q] [-F] [-r] [-L] [-R] [-C] [-Z] [-S] [-W] [-s PREFIX] [-w]
                [-e]
                <command> ...
doorstop: error: argument --port: expected one argument

```
