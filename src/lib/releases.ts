import { readEvaListing } from "./http";

const BASE = "https://ftp.ebi.ac.uk/pub/databases/eva/rs_releases";

function invalid(message: string): never {
  throw Object.assign(new Error(message), { status: 400 });
}

function selection(path: string, params: Record<string, unknown>) {
  const match = /^\/releases\/([1-9]\d{0,5})\/files$/.exec(path);
  if (path !== "/releases" && !match) invalid("Use /releases or /releases/{release}/files with a numeric release");
  const allowed = match ? ["directory", "expected_listing_sha256"] : ["expected_listing_sha256"];
  if (Object.keys(params).some(key => !allowed.includes(key))) invalid("Unsupported release discovery parameter");
  const directory = params.directory ?? "";
  if (typeof directory !== "string" || !/^(?:by_assembly\/(?:GC[AF]_\d+\.\d+\/(?:[A-Za-z0-9][A-Za-z0-9_.-]*\/)?)?|by_species\/(?:[A-Za-z0-9][A-Za-z0-9_.-]*\/(?:[A-Za-z0-9][A-Za-z0-9_.-]*\/)?)?)?$/.test(directory)) {
    invalid("directory must be an observed by_assembly/ or by_species/ directory, with trailing slash");
  }
  const expected = params.expected_listing_sha256;
  if (expected !== undefined && (typeof expected !== "string" || !/^[a-f0-9]{64}$/.test(expected))) invalid("expected_listing_sha256 must be a lowercase SHA-256");
  return { release: match?.[1] ?? null, suffix: match ? `/release_${match[1]}/${directory}` : "/", expected };
}

/** Only immediate child links are discovery results; never follow arbitrary listing URLs. */
function children(html: string, source: string) {
  const base = new URL(source);
  const links = new Map<string, { name: string; url: string; kind: string }>();
  for (const match of html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi)) {
    let url: URL;
    try { url = new URL(match[1], base); } catch { continue; }
    if (url.origin !== base.origin || url.username || url.password || url.search || url.hash || !url.pathname.startsWith(base.pathname)) continue;
    const name = url.pathname.slice(base.pathname.length);
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*\/?$/.test(name)) continue;
    links.set(url.href, { name, url: url.href, kind: name.endsWith("/") ? "directory" : "file" });
  }
  return [...links.values()];
}

/** Listing hashes pin the observed text, not artifact bytes or an immutable release. */
export async function readReleases(path: string, params: Record<string, unknown> = {}) {
  const selected = selection(path, params);
  const source = BASE + selected.suffix;
  const result = await readEvaListing(source);
  if (typeof result.data !== "string" || !/<(?:title|h1)\b[^>]*>\s*(?:Index of|Directory listing for)\b/i.test(result.data)) {
    throw Object.assign(new Error("EVA release source did not return a recognized directory listing"), { status: 502, data: result.data });
  }
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(result.data));
  const hash = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, "0")).join("");
  const links = children(result.data, source);
  const data = {
    data: selected.release ? links : links.filter(link => /^release_[1-9]\d*\/$/.test(link.name)),
    native_listing: result.data,
    provenance: { source_url: source, requested_release: selected.release, retrieved_at: new Date().toISOString(),
      listing_text_sha256: hash, immutable_snapshot: false, artifact_contents_validated: false,
      interpretation: "Observed immediate links only. Retain README/known issues and identifier change files. Assembly and species directories are distinct from browser codes. RS VCFs do not contain study genotypes or annotations; validate selected artifacts separately." },
  };
  if (selected.expected !== undefined && selected.expected !== hash) {
    throw Object.assign(new Error("EVA release directory changed from expected_listing_sha256"), { status: 409, data });
  }
  return { status: result.status, data };
}
