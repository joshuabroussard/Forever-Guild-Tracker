import { effectiveSlug } from './config.js';

// Addresses of the public guild and character pages on the website.
// /g/{region}/{guild-slug} and /g/{region}/{guild-slug}/{character-slug}
export function charSlug(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, '-');
}

export function guildPath(server) {
  return `/g/${server.region}/${encodeURIComponent(effectiveSlug(server))}`;
}

export function characterPagePath(server, name) {
  return `${guildPath(server)}/${encodeURIComponent(charSlug(name))}`;
}

// Full link for the embed, or null when the server turned the page off.
export function guildUrl(publicUrl, server) {
  return publicUrl && server.publicPage !== false ? publicUrl + guildPath(server) : null;
}
