export function assert(condition, message = "Assertion failed") {
  if (!condition) throw new Error(message);
}

function normalize(value) {
  if (typeof value === "bigint") return `${value}n`;
  if (value instanceof Uint8Array) return [...value];
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, normalize(value[key])])
    );
  return value;
}

export function equal(actual, expected) {
  const left = JSON.stringify(normalize(actual));
  const right = JSON.stringify(normalize(expected));
  assert(left === right, `Expected ${right}; received ${left}`);
}

export function throws(fn, code) {
  try {
    fn();
  } catch (error) {
    if (code) equal(error.code, code);
    return error;
  }
  throw new Error(`Expected ${code ?? "an error"}`);
}

export async function rejects(fn, code) {
  try {
    await fn();
  } catch (error) {
    if (code) equal(error.code, code);
    return error;
  }
  throw new Error(`Expected rejection ${code ?? ""}`);
}
