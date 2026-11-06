import type { SupportContext } from "./support.api";

/**
 * What goes with a support message besides what was typed (#428): where it
 * came from, which build, which browser. The form says these are sent.
 */
export function supportContext(page: string): SupportContext {
  return {
    page,
    appVersion: process.env.NEXT_PUBLIC_APP_VERSION,
    userAgent: typeof navigator === "undefined" ? undefined : navigator.userAgent,
  };
}
