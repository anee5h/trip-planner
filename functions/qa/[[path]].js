/**
 * KAI-126: /qa — the separate protected internal QA surface.
 * Same server-verifiable Cloudflare Access guard as /e2e (see that file
 * for the full rationale). /qa is intentionally NOT the Allure dashboard;
 * it is a reserved internal QA route with no public content.
 */
import { onRequest as e2eGuard } from "../e2e/[[path]].js";

export const onRequest = e2eGuard;
