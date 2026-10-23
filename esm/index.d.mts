export type { IP2RegionOpts, IP2RegionResult } from "../dist/lib/index.js";

type IP2Region = import("../dist/lib/index.js").default;
declare const IP2Region: typeof import("../dist/lib/index.js").default & {
  /** @deprecated Use the default import directly. Kept for the pre-fix ESM workaround. */
  readonly default: typeof import("../dist/lib/index.js").default;
};
export default IP2Region;
