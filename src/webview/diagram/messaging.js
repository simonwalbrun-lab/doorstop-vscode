(function () {
  const handlers = new Map();

  function send(command, payload) {
    const { vscode } = window.DoorstopDiagram.state;
    return vscode.postMessage({ command, ...payload });
  }

  function on(command, handler) {
    handlers.set(command, handler);
  }

  function init(network) {
    window.addEventListener('message', (event) => {
      const message = event.data;
      const handler = handlers.get(message.command);
      if (handler) {
        handler(message, network);
      }
    });
  }

  window.DoorstopDiagram = window.DoorstopDiagram || {};
  window.DoorstopDiagram.messaging = { send, on, init };
})();
