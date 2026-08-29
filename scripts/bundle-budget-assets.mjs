const LOCAL_ASSET_REFERENCE = /^\/?assets\//;
const GOOGLE_TAG_REFERENCE = "https://www.googletagmanager.com/";

/**
 * Return only local Vite asset references from the document shell.
 *
 * The HTML shell also contains the legitimate non-bundle Google tag loader.
 * It is deliberately excluded from the Vite bundle graph; unexpected local
 * references still fail closed.
 */
export function readAssetsIndex(html) {
  const urls = [];

  const addAssetReference = (reference) => {
    if (LOCAL_ASSET_REFERENCE.test(reference)) {
      if (!urls.includes(reference)) urls.push(reference);
      return;
    }

    if (reference.startsWith(GOOGLE_TAG_REFERENCE)) {
      return;
    }

    throw new Error(`invalid non-assets reference: ${reference}`);
  };

  // Parse each <link>/<script> tag as a unit and extract attributes
  // independently — attribute ORDER must not matter.
  for (const tag of html.matchAll(/<script\b[^>]*>/g)) {
    const src = tag[0].match(/\bsrc="([^"]+)"/);
    if (src) addAssetReference(src[1]);
  }
  for (const tag of html.matchAll(/<link\b[^>]*>/g)) {
    const attrs = tag[0];
    if (/\brel="modulepreload"/.test(attrs)) {
      const href = attrs.match(/\bhref="([^"]+)"/);
      if (href) addAssetReference(href[1]);
    }
  }

  if (urls.length === 0) {
    throw new Error(
      "no entry script or modulepreload assets found in dist/index.html",
    );
  }

  return urls;
}
