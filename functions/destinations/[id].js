/**
 * Cloudflare Pages Function: /destinations/[id] (English, canonical locale).
 * Locale routing logic lives in functions/_destination-handler.js.
 */
import { createDestinationHandler } from "../_destination-handler.js";

export const onRequest = createDestinationHandler("en");
