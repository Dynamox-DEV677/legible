/**
 * Turn a script into a `javascript:` address that can be saved as a bookmark.
 *
 * When a browser runs such an address it first undoes percent-encoding. So anything in
 * the script that looks like an encoding must itself be encoded, or the script would be
 * altered before it ran. Four things need it:
 *
 *   %           or "100%25" in the styles would decode to something else
 *   #           or the browser may treat the rest as a page fragment and drop it
 *   line breaks and tabs, which browsers strip out of addresses
 *   anything outside plain ASCII, which browsers re-encode in their own way
 *
 * Everything else is left as it is, which keeps the bookmark about a third smaller than
 * encodeURIComponent would make it.
 */
export function toBookmarklet(script) {
  const body = script.replace(/[%#\u0000-\u001f\u007f-￿]/gu, (ch) => encodeURIComponent(ch));
  return `javascript:${body}`;
}

/** The inverse, as a browser does it. Used by the tests to prove the round trip. */
export function fromBookmarklet(address) {
  if (!address.startsWith('javascript:')) throw new Error('not a javascript: address');
  return decodeURIComponent(address.slice('javascript:'.length));
}
