/**
 * Extend React's CSSProperties to include WebkitAppRegion.
 *
 * This is a non-standard CSS property used by Electron for window drag regions.
 * Without this augmentation, every usage requires @ts-expect-error.
 * See: https://developer.mozilla.org/en-US/docs/Web/CSS/-webkit-app-region
 */
import "react";

declare module "react" {
  interface CSSProperties {
    WebkitAppRegion?: "drag" | "no-drag";
  }
}
