import normalizeUrl from "normalize-url";

// §6: tracking params are stripped (blocklist), everything else is kept.
const TRACKING_PARAMS = [/^utm_/i, "fbclid", "gclid", "ref", "mc_cid", "_ga"];

/**
 * Produce the canonical URL used as the dedup key for an article (§6).
 *
 * Safe normalizations: strip leading `www.`, strip `#fragment`, strip trailing
 * slash, lowercase host, blocklist tracking params, sort remaining params.
 * Left untouched (content-bearing): scheme (no http→https), path casing,
 * non-www subdomains.
 */
export function canonicalize(rawUrl) {
  return normalizeUrl(rawUrl, {
    stripWWW: true,
    stripHash: true,
    removeTrailingSlash: true,
    removeQueryParameters: TRACKING_PARAMS,
    sortQueryParameters: true,
  });
}
