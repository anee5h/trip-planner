/**
 * Cloudflare Pages Function: /ja/destinations/[id] (Japanese locale).
 *
 * Serves the Japanese prerendered page (Japanese OG/Twitter metadata + body)
 * for published destinations and the Japanese SPA shell for other public
 * destinations, so share-preview crawlers fetching /ja/... URLs receive
 * Japanese metadata. Locale routing logic lives in
 * functions/_destination-handler.js.
 */
import { createDestinationHandler } from "../../_destination-handler.js";

export const onRequest = createDestinationHandler("ja");
