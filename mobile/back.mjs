export function handleBack({ canGoBack, document, history, location, app, root, Event }) {
  const dialogs = [...document.querySelectorAll('dialog[open]')];
  if (dialogs.length) {
    const dialog = dialogs.at(-1);
    if (dialog.dispatchEvent(new Event('cancel', { cancelable: true }))) dialog.close();
    return;
  }
  const closes = [...document.querySelectorAll('[data-close-editor], [data-close-avatar], [data-close-name], [data-close-profile-edit]')];
  const close = closes.filter(button => button.getClientRects().length).at(-1);
  if (close) { close.click(); return; }
  if (canGoBack) history.back();
  else if (location.pathname !== '/index.html' && location.pathname !== '/') location.replace(new URL('index.html', root).href);
  else app.minimizeApp().catch(() => {});
}
