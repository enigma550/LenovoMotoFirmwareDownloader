export const DASHBOARD_NAVIGATION_URL = 'lmfd-auth://dashboard';

const DASHBOARD_BUTTON_LABEL = 'Back to Dashboard';

export function buildDashboardButtonScript() {
  const dashboardUrl = JSON.stringify(DASHBOARD_NAVIGATION_URL);
  const dashboardLabel = JSON.stringify(DASHBOARD_BUTTON_LABEL);

  return `
(() => {
  const buttonId = 'lmfd-auth-dashboard-button';
  const cssId = 'lmfd-auth-dashboard-style';
  const existingButton = document.getElementById(buttonId);
  if (existingButton) return;
  if (!document.body) return;

  if (!document.getElementById(cssId)) {
    const style = document.createElement('style');
    style.id = cssId;
    style.textContent = [
      '#lmfd-auth-dashboard-button {',
      'position: fixed;',
      'top: 18px;',
      'left: 18px;',
      'z-index: 2147483647;',
      'border: 1px solid rgba(255,255,255,.32);',
      'border-radius: 999px;',
      'background: rgba(13,18,28,.88);',
      'color: #fff;',
      'box-shadow: 0 16px 38px rgba(0,0,0,.28);',
      'font: 600 13px/1.2 sans-serif;',
      'letter-spacing: .01em;',
      'padding: 11px 16px;',
      'cursor: pointer;',
      'backdrop-filter: blur(12px);',
      '}',
      '#lmfd-auth-dashboard-button:hover { background: rgba(31,41,55,.95); }',
      '#lmfd-auth-dashboard-button:focus-visible { outline: 2px solid #60a5fa; outline-offset: 3px; }',
    ].join('');
    document.head.appendChild(style);
  }

  const button = document.createElement('button');
  button.id = buttonId;
  button.type = 'button';
  button.textContent = ${dashboardLabel};
  button.addEventListener('click', () => {
    window.location.href = ${dashboardUrl};
  });
  document.body.appendChild(button);
})();
`;
}
