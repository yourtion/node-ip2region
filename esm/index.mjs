import commonjs from "../dist/lib/index.js";

// Share the implementation and constructor identity with require().
const IP2Region = commonjs.default;
// Keep the pre-fix ESM workaround (imported.default) working as an alias.
Object.defineProperty(IP2Region, "default", { value: IP2Region });
export default IP2Region;
