# Runtime View {#section-runtime-view}

## \<Runtime Scenario 1\> {#_runtime_scenario_1}

-   *\<insert runtime diagram or textual description of the scenario\>*

-   *\<insert description of the notable aspects of the interactions
    between the building block instances depicted in this diagram.\>*

## \<Runtime Scenario 2\> {#_runtime_scenario_2}

## ...​

## \<Runtime Scenario n\> {#_runtime_scenario_n}


### Adding something to the diagramm

```mermaid
sequenceDiagram
    participant User
    participant Tree as Doorstop TreeView
    participant Webview as Diagram Webview
    participant Host as Extension Host
    participant FS as File System
    participant Vis as vis-network

    User->>Tree: Drag requirement
    Tree->>Tree: handleDrag()
    Tree->>Tree: Create TreeView payload
    Tree->>Webview: Drop event

    Webview->>Webview: Read drag data
    Webview->>Webview: Calculate canvas coordinates

    alt TreeView MIME payload available
        Webview->>Webview: Parse JSON payload
        Webview->>Host: resolveDroppedItem(fileUri, pointer)
    else Standard URI or text payload
        Webview->>Host: resolveDroppedItem(path, pointer)
    end

    Host->>Host: Validate payload
    Host->>Host: Normalize file path
    Host->>FS: Read requirement file
    FS-->>Host: YAML/Markdown content

    Host->>Host: Parse title and links
    Host->>Webview: addNode(uid, fileUri, title, links, pointer)

    Webview->>Vis: Add node at pointer position
    Webview->>Vis: Add existing links
    Webview->>Vis: Redraw graph
    Webview->>Webview: Save webview state
    Webview->>Host: diagramChanged(updated diagram)
```