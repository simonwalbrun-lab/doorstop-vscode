# Introduction and Goals {#section-introduction-and-goals}

The **Doorstop Requirements** provides a lightweight, intuitive desktop/web interface to view, create, and manage requirements stored in the native [Doorstop](https://doorstop.readthedocs.io/en/latest/) format. It bridges the gap between developer-centric text workflows and user-friendly visual tooling.

Doorstop provides a way to manage requirements but lacks a good GUI for most of the users. The GUI should provide a way to have access to the features of Doorstop in a more user friendly way and also to have a better overview of the requirements and their relations. It should support creation and reading of the requirements set.

## Requirements Overview {#_requirements_overview}

**Doorstop Core UI Wrapper**  Translates GUI user actions into native Doorstop commands (e.g., creating, editing, and publishing requirements) without altering the underlying data structure.

**Traceability Visualizer**  Automatically maps, validates, and visualizes parent-child relationships and dependencies between requirements to ensure complete traceability.

**Dense Requirements Matrix**  Provides a high-density tabular or tree overview of all requirement sets, status indicators, and metadata for quick navigation and filtering.

**Document Lifecycle Control**  Supports standard workflows for creating, reviewing, freezing, and reading requirement items directly through the interface.

## Quality Goals {#_quality_goals}

## 1.2 Quality Goals {#_quality_goals}

The following quality goals are of highest importance for the Doorstop GUI architecture and serve as the primary drivers for architectural decisions.

| Priority | Quality Goal (ISO 25010) | Architectural Impact | Scenario |
| :---: | :--- | :--- | :--- |
| **1** | **Intuitive Operation** (Minimal Tool-Knowledge Workflow) | Introduction of a stateful UI controller layer that abstracts away the underlying Doorstop/Git mechanisms. | A non-technical user (e.g., a PM) can open the tool, modify a requirement, and save it using a simple form and a single button click, without needing to know what YAML, Git, or a Doorstop CLI command is. |
| **1** | **Functional Correctness & Integrity** (Data Safety) | Structural decoupling of File-I/O from UI-State and transactional validation layers. | Even if the UI crashes mid-operation, the operating system interrupts the process, or invalid user input is processed, the underlying Git/YAML repository of Doorstop must never be left in a corrupted or unparseable state. |
| **2** | **Modifiability & Analysability** (Maintainability) | Strict Separation of Concerns via clean decoupling layers (e.g., Ports & Adapters / Hexagonal Architecture). | A breaking change in the Doorstop CLI/API or the introduction of a new custom metadata field requires changes *only* in the infrastructure/adapter layer. The core GUI layout, validation, and navigation logic remain completely untouched. |
| **3** | **Time-Behaviour / Responsiveness** (Performance) | Asynchronous, decoupled architecture with background execution and non-blocking I/O. | File system parsing, git synchronization, and traceability graph computations must run in dedicated background worker threads. The main UI thread must remain active and responsive (rendering animations at 60fps), even when loading large specification sets with more than 1,000 items. |
| **4** | **Portability & Adaptability** (Platform Independence) | Use of a cross-platform UI framework and abstraction of operating system-specific path and file handling. | The entire application must compile and run natively on Windows, Linux, and macOS without modifying a single line of the core business logic or UI component code. |

## Stakeholders {#_stakeholders}

## 1.3 Stakeholders {#_stakeholders}

| Role / Name | Contact | Expectations |
| :--- | :--- | :--- |
| **Product Manager/Owner** | *[Name]* | Demands a clean, form-based input mask. Wants to manage and review business requirements without touching YAML files or Git commands. |
| **Software Developers (as Users)** | *[DevTeam]* | Want a fast, keyboard-friendly UI inside their existing IDE (VS Code). They expect the tool to speed up their daily requirements workflows (e.g., viewing links/parents) without leaving the editor context. |
| **Software Developers (as Maintainers)** | *[Dev Team]* | The UI code must be strictly separated from the Doorstop/Python parsing logic so that the extension remains easy to test, maintain, and extend. |
| **Software Architect** | *[Your Name]* | Uses the GUI to review high-level system requirements and verify overall architectural trace links. Expects a lightweight local authoring tool that integrates into the IDE, relying on GitLab to catch infrastructure-level errors. |
| **Testers / QA Engineers** | *[Name]* | Use the GUI to quickly identify changed requirements and trace them down to test specifications. Expect a dense local overview to easily spot gaps in test coverage, without needing to interact with the remote GitLab repository manually. |
| **Quality Management (QM)** | *[QM Team]* | **(Governance)** Expects the GUI to guide users into creating valid traceability links, while trusting the central GitLab CI to run the final compliance checks. |
