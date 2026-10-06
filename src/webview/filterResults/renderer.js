// Notebook output renderer for filter results (spec 022, contracts/notebook-file.md).
// VS Code ignores file: and most command: links in notebook outputs, so the table
// is drawn here and a UID click is posted back to the extension, which opens the
// item. Payload: { columns: string[], items: [{ uid, path, values: string[] }] }.
// DOM is built with textContent only - item text is never parsed as HTML.

const STYLE = `
  .doorstop-filter-count { margin: 0 0 6px; font-weight: 600; }
  .doorstop-filter-table { border-collapse: collapse; }
  .doorstop-filter-table th, .doorstop-filter-table td {
    border: 1px solid var(--vscode-panel-border, #8884);
    padding: 2px 8px;
    text-align: left;
    vertical-align: top;
  }
  .doorstop-filter-link { color: var(--vscode-textLink-foreground); cursor: pointer; }
  .doorstop-filter-link:hover { text-decoration: underline; }
  .doorstop-filter-link:focus-visible { outline: 1px solid var(--vscode-focusBorder); }
`;

function cell(tag, text) {
  const element = document.createElement(tag);
  element.textContent = text;
  return element;
}

export const activate = (context) => ({
  renderOutputItem(outputItem, element) {
    const { columns, items } = outputItem.json();
    element.replaceChildren();

    const style = document.createElement('style');
    style.textContent = STYLE;
    const count = cell('p', `${items.length} ${items.length === 1 ? 'item' : 'items'} matched`);
    count.className = 'doorstop-filter-count';

    const table = document.createElement('table');
    table.className = 'doorstop-filter-table';
    const head = table.createTHead().insertRow();
    for (const name of ['UID', ...columns]) {
      head.appendChild(cell('th', name));
    }
    const body = table.createTBody();
    for (const item of items) {
      const row = body.insertRow();
      // Not an <a href="#">: VS Code's notebook webview handles clicks on
      // "#" anchors itself and scrolls the notebook to the top.
      const link = cell('span', item.uid);
      link.className = 'doorstop-filter-link';
      link.title = item.path;
      link.role = 'link';
      link.tabIndex = 0;
      const open = () => context.postMessage?.({ type: 'open', path: item.path });
      link.addEventListener('click', open);
      link.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          open();
        }
      });
      row.insertCell().appendChild(link);
      for (const value of item.values) {
        row.insertCell().textContent = value;
      }
    }
    element.append(style, count, table);
  },
});
