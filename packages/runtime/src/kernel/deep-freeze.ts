export function deepFreeze<T>(value: T, seen = new WeakSet<object>()): Readonly<T> {
  if ((typeof value !== "object" && typeof value !== "function") || value === null) return value;
  const target = value as object;
  if (seen.has(target)) return value;
  seen.add(target);
  for (const key of Reflect.ownKeys(target)) {
    const descriptor = Object.getOwnPropertyDescriptor(target, key);
    if (descriptor === undefined || descriptor.get !== undefined || descriptor.set !== undefined) continue;
    deepFreeze((target as Record<PropertyKey, unknown>)[key], seen);
  }
  return Object.freeze(value);
}
