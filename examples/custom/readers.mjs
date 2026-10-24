import { IP2RegionError, parseIP } from "ip2region";

/** @typedef {import('ip2region').LookupResult} LookupResult */
/** @typedef {import('ip2region').AsyncLookupFunction} AsyncLookupFunction */
/** @typedef {import('ip2region').Adapter} Adapter */
/** @typedef {import('ip2region').AsyncAdapter} AsyncAdapter */

/**
 * A class source uses its own state; the wrapper preserves `this`.
 * @implements {Adapter}
 */
export class MapReader {
  /** @type {import('ip2region').Capabilities} */
  capabilities = { families: [4, 6] };
  metadata = { id: "example-map" };

  /** @param {Iterable<[string, LookupResult]>} records */
  constructor(records) {
    /** @type {Map<string, LookupResult>} */
    this.records = new Map();
    for (const [ip, record] of records) this.records.set(parseIP(ip).address, record);
    this.closed = false;
  }

  /** @param {string} ip */
  lookup(ip) {
    if (this.closed) throw new IP2RegionError("CLOSED", "The source is closed");
    return this.records.get(ip) ?? null;
  }

  close() {
    this.closed = true;
    this.records.clear();
  }
}

/**
 * Inject a transport function; tests use a deterministic fake, with no network.
 * @implements {AsyncAdapter}
 */
export class ServiceReader {
  metadata = { id: "example-service" };

  /** @param {AsyncLookupFunction} request @param {() => Promise<void>} [release] */
  constructor(request, release = async () => {}) {
    this.request = request;
    this.release = release;
  }

  /** @param {string} ip @param {import('ip2region').ParsedIP} parsed */
  lookupAsync(ip, parsed) {
    return this.request(ip, parsed);
  }

  closeAsync() {
    return this.release();
  }
}

/**
 * Example of a custom byte format: [{ ip, country, city? }].
 * Convert vendor fields into the public result shape before returning them.
 */
export class JSONReader extends MapReader {
  /** @param {Uint8Array} bytes */
  constructor(bytes) {
    if (!(bytes instanceof Uint8Array))
      throw new IP2RegionError("INVALID_ARGUMENT", "JSONReader requires a Uint8Array");
    /** @type {[string, LookupResult][]} */
    const records = [];
    try {
      const input = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
      if (!Array.isArray(input)) throw new Error("Expected an array of records");
      const addresses = new Set();
      for (const record of input) {
        if (
          !record ||
          typeof record.ip !== "string" ||
          typeof record.country !== "string" ||
          (record.city !== undefined && typeof record.city !== "string")
        )
          throw new Error("Invalid record fields");
        const ip = parseIP(record.ip).address;
        if (addresses.has(ip)) throw new Error("Duplicate address");
        addresses.add(ip);
        records.push([
          ip,
          {
            country: { name: record.country },
            ...(record.city === undefined ? {} : { city: { name: record.city } }),
          },
        ]);
      }
    } catch (cause) {
      throw new IP2RegionError("INVALID_DATABASE", "Invalid custom JSON database", {
        cause,
        details: { format: "example-json" },
      });
    }
    super(records);
    this.metadata = { id: "example-json" };
  }
}
