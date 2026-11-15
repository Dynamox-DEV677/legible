// Records any Content Security Policy violation on the page, so a test can read them back.
window.violations = [];
document.addEventListener('securitypolicyviolation', (event) => {
  window.violations.push(`${event.violatedDirective}: ${event.blockedURI || event.sample || 'inline'}`);
});
