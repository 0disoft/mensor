export function renderRsvpPage(template, responses) {
  const items = responses
    .map(
      (response) =>
        `<li data-rsvp-id="${response.id}"><span>${escapeHtml(response.name)}</span> <span>${escapeHtml(response.email)}</span> <span>${escapeHtml(response.attendance)}</span></li>`,
    )
    .join("");
  return template.replace("{{responses}}", items);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
