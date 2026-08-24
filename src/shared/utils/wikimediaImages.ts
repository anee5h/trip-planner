/**
 * KAI-129: responsive-image URL variants for Wikimedia-hosted hero images.
 *
 * Meguruto destination cards render at ~177-308px CSS width but the
 * catalogue's heroImage values can be multi-megapixel Wikimedia originals
 * or already-thumbnailized URLs (1280/1920/3840px), causing ~35 MiB of
 * image transfer on a cold homepage load. This helper generates
 * appropriately-sized /thumb/ variants so cards can use srcSet + sizes.
 *
 * Supported input shapes (all normalized to an upload.wikimedia.org
 * original, then re-thumbed at the requested widths):
 *   - Original:   https://upload.wikimedia.org/wikipedia/commons/a/ae/File.jpg
 *   - Thumb:      https://upload.wikimedia.org/wikipedia/commons/thumb/a/ae/File.jpg/1280px-File.jpg
 *   - Special:    https://commons.wikimedia.org/wiki/Special:Redirect/file/File.jpg?width=1600
 *
 * Non-Wikimedia URLs and malformed/unsupported inputs are returned
 * unchanged (passthrough) so nothing breaks for other providers
 * (Unsplash, iStock, etc.).
 *
 * Escaped filenames (%28, %2C, %C5%8D ...) are preserved: the original
 * filename is decoded once, re-encoded only for the characters Wikimedia
 * requires, and never double-encoded.
 */

const UPLOAD_HOST = "upload.wikimedia.org";
const COMMONS_HOST = "commons.wikimedia.org";
const WIKIPEDIA_PREFIX = "/wikipedia/";
const COMMONS_REDIRECT_RE =
  /^https:\/\/commons\.wikimedia\.org\/wiki\/Special:Redirect\/file\/([^?]+)(?:\?.*)?$/;

/** Decode a filename that may carry percent-escapes. */
function decodeFilename(name: string): string {
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
}

/**
 * Encode a filename for use in a Wikimedia /thumb/ URL path segment.
 * Wikimedia encodes space -> _ and reserved chars in %XX form. We encode
 * only chars that MUST be escaped in a URL path (space, %, parentheses,
 * comma, ?, #, controls), preserving already-escaped sequences.
 */
function encodeFilename(name: string): string {
  return name
    .split(/(%[0-9A-Fa-f]{2})/g)
    .map((part) => {
      if (/^%[0-9A-Fa-f]{2}$/.test(part)) return part;
      return part.replace(
        /[%() ,?#\u0000-\u001f\u007f]/g,
        (c) =>
          "%" + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0"),
      );
    })
    .join("");
}

interface WikimediaFile {
  /** hash dirs "h1/h2" (e.g. "a/ae"); "" for Special:Redirect (unknowable) */
  hash: string;
  /** original (decoded) filename, e.g. "Lake_Saroma.jpg" */
  filename: string;
  /** true when the input was a /thumb/ URL (filename was thumb-stripped) */
  wasThumb: boolean;
  /** Declared thumbnail width, when the input already identifies one. */
  sourceWidth: number | null;
}

/**
 * Parse a Wikimedia (upload or commons-redirect) URL into its canonical
 * file parts. Returns null for non-Wikimedia / malformed.
 *
 * upload path shapes (after /wikipedia/):
 *   original: <lang>/<h1>/<h2>/<File>
 *   thumb:    <lang>/thumb/<h1>/<h2>/<File>/<Wpx>-<File>
 * where <lang> is typically "commons".
 */
function parseWikimediaUrl(url: string): WikimediaFile | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.host === COMMONS_HOST) {
      const m = url.match(COMMONS_REDIRECT_RE);
      if (!m) return null;
      const requestedWidth = Number(u.searchParams.get("width"));
      return {
        hash: "",
        filename: decodeFilename(m[1]),
        wasThumb: false,
        sourceWidth:
          Number.isInteger(requestedWidth) && requestedWidth > 0
            ? requestedWidth
            : null,
      };
    }
    if (u.host !== UPLOAD_HOST) return null;
    const path = u.pathname;
    if (!path.includes(WIKIPEDIA_PREFIX)) return null;
    const afterLang = path.split(WIKIPEDIA_PREFIX)[1] ?? "";
    const segs = afterLang.split("/").filter(Boolean);
    // segs[0] = language ("commons")
    if (segs.length < 4) return null;
    let i = 1;
    let wasThumb = false;
    if (segs[i] === "thumb") {
      wasThumb = true;
      i++;
    }
    const h1 = segs[i++];
    const h2 = segs[i++];
    const file = segs[i++];
    if (!h1 || !h2 || !file) return null;
    let filename = file;
    const declaredWidth = wasThumb
      ? /^([0-9]+)px-/.exec(segs[i] ?? "")?.[1]
      : undefined;
    if (wasThumb && /^\d+px-/.test(file)) {
      // strip "<Wpx>-" prefix to recover the original filename
      filename = file.replace(/^\d+px-/, "");
    }
    return {
      hash: `${h1}/${h2}`,
      filename: decodeFilename(filename),
      wasThumb,
      sourceWidth: declaredWidth ? Number(declaredWidth) : null,
    };
  } catch {
    return null;
  }
}

/** Extension of the original filename (lowercased), or "" if none. */
function fileExt(filename: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(filename);
  return m ? m[1].toLowerCase() : "";
}

/** SVG thumbnails are rendered as PNG on Wikimedia: <w>px-<file>.svg.png */
function thumbFilename(origFilename: string, width: number): string {
  const encoded = encodeFilename(origFilename);
  if (fileExt(origFilename) === "svg") {
    // The encoded name ends in ".svg"; Wikimedia's thumb is
    // "<w>px-<name>.svg.png" (the ".svg.png" suffix, not ".svg.svg.png").
    const base = encoded.replace(/\.svg$/i, "");
    return `${width}px-${base}.svg.png`;
  }
  return `${width}px-${encoded}`;
}

/**
 * Generate a srcSet for a Wikimedia hero URL at the given widths.
 * Returns the srcSet string, or null if the URL is not a supported
 * Wikimedia shape (caller keeps the plain src as fallback).
 *
 * @param url   the heroImage URL (any supported Wikimedia shape, or other)
 * @param widths pixel widths to generate (default [250, 330, 500, 960]).
 *   MUST be Wikimedia-valid thumb widths — arbitrary sizes (e.g. 320/480)
 *   return HTTP 400 from upload.wikimedia.org. Verified valid on the
 *   catalogue's files: 250, 330, 500, 960, 1280, 1920.
 */
export function getWikimediaSrcSet(
  url: string,
  widths: number[] = [250, 330, 500, 960],
): string | null {
  if (!url) return null;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.host !== UPLOAD_HOST && u.host !== COMMONS_HOST) return null;
  const parsed = parseWikimediaUrl(url);
  if (!parsed) return null;

  if (u.host === COMMONS_HOST) {
    // Special:Redirect/file/<file>?width=N — the hash dirs are not
    // statically knowable, so each variant uses the redirect form, which
    // Wikimedia resolves server-side to the right thumb.
    const enc = encodeFilename(parsed.filename);
    return widths
      .map(
        (w) =>
          `https://${COMMONS_HOST}/wiki/Special:Redirect/file/${enc}?width=${w} ${w}w`,
      )
      .join(", ");
  }

  // upload.wikimedia.org: build /thumb/<hash>/<file>/<Wpx>-<file>
  const enc = encodeFilename(parsed.filename);
  const thumbBase = `https://${UPLOAD_HOST}/wikipedia/commons/thumb/${parsed.hash}/`;
  return widths
    .map((w) => `${thumbBase}${enc}/${thumbFilename(parsed.filename, w)} ${w}w`)
    .join(", ");
}

/**
 * Best single thumbnail for a Wikimedia URL at a target CSS width.
 * Returns null for non-Wikimedia URLs so the caller falls back to the
 * original src (no multi-megapixel download for cards).
 */
export function getWikimediaThumb(url: string, width: number): string | null {
  if (!url) return null;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.host !== UPLOAD_HOST && u.host !== COMMONS_HOST) return null;
  const parsed = parseWikimediaUrl(url);
  if (!parsed) return null;
  if (u.host === COMMONS_HOST) {
    return `https://${COMMONS_HOST}/wiki/Special:Redirect/file/${encodeFilename(
      parsed.filename,
    )}?width=${width}`;
  }
  return `https://${UPLOAD_HOST}/wikipedia/commons/thumb/${parsed.hash}/${encodeFilename(
    parsed.filename,
  )}/${thumbFilename(parsed.filename, width)}`;
}

/** A media-specific source in the shared destination-hero contract. */
export interface ResponsiveImageSource {
  media: string;
  srcSet: string;
  sizes: string;
}

/**
 * The image attributes used by both the SEO prerender and hydrated detail
 * page. `sources` deliberately caps the mobile and tablet source sets to one
 * Wikimedia-valid thumbnail each: this keeps a high-DPR phone from selecting
 * the 1280px fallback and downloading the same oversized hero that KAI-168
 * measured. The full srcSet remains on the fallback <img> for desktop and
 * user agents without <picture> media-source support.
 */
export interface ResponsiveImageAttributes {
  src: string;
  srcSet?: string;
  sizes?: string;
  sources?: ResponsiveImageSource[];
}

const DESTINATION_HERO_WIDTHS = [500, 960, 1280] as const;
const DESTINATION_HERO_SIZES = "100vw";
const DESTINATION_HERO_MOBILE_MEDIA = "(max-width: 767px)";
const DESTINATION_HERO_TABLET_MEDIA = "(max-width: 1199px)";

/**
 * Build the canonical responsive destination-detail hero contract.
 *
 * Wikimedia thumbnail URLs are generated only for Wikimedia URLs. Other
 * providers, malformed URLs, and missing values pass through unchanged so a
 * non-Wikimedia hero never receives an invalid Wikimedia transformation.
 * When the input is already a thumbnail, no candidate exceeds its declared
 * width; this avoids asking Wikimedia to upscale a known-small source.
 */
export function getWikimediaResponsiveImage(
  url: string,
): ResponsiveImageAttributes {
  if (!url) return { src: url };

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return { src: url };
  }
  if (parsedUrl.host !== UPLOAD_HOST && parsedUrl.host !== COMMONS_HOST) {
    return { src: url };
  }

  const parsed = parseWikimediaUrl(url);
  if (!parsed) return { src: url };

  const widths: number[] = DESTINATION_HERO_WIDTHS.filter(
    (width) => parsed.sourceWidth === null || width <= parsed.sourceWidth,
  );
  // A thumbnail can be narrower than the supported hero ladder. Keep that
  // source usable without upscaling it or crashing the render path.
  if (widths.length === 0 && parsed.sourceWidth !== null) {
    widths.push(parsed.sourceWidth);
  }

  const variants = widths.map((width) => ({
    width,
    url: getWikimediaThumb(url, width) ?? url,
  }));
  const largest = variants.at(-1);
  if (!largest) return { src: url };

  const srcSet = variants
    .map(({ width, url: variantUrl }) => `${variantUrl} ${width}w`)
    .join(", ");
  const mobile = variants.find(({ width }) => width >= 500) ?? largest;
  const tablet = variants.find(({ width }) => width >= 960);
  const sources: ResponsiveImageSource[] = [
    {
      media: DESTINATION_HERO_MOBILE_MEDIA,
      srcSet: `${mobile.url} ${mobile.width}w`,
      sizes: DESTINATION_HERO_SIZES,
    },
  ];
  if (tablet && tablet.width !== mobile.width) {
    sources.push({
      media: DESTINATION_HERO_TABLET_MEDIA,
      srcSet: `${tablet.url} ${tablet.width}w`,
      sizes: DESTINATION_HERO_SIZES,
    });
  }

  return {
    src: largest.url,
    srcSet,
    sizes: DESTINATION_HERO_SIZES,
    sources,
  };
}
