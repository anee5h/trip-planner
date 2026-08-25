/**
 * KAI-198: keep the Japanese QA mirror behind the same Cloudflare Access
 * guard as /qa. The app shell is localized, but the surface is still private.
 */
import { onRequest as qaGuard } from "../../e2e/[[path]].js";

export const onRequest = qaGuard;
