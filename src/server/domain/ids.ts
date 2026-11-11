import type { CartId } from "./brand";

// Randomness comes from outside the domain so tests are exact (CQ-26).
export interface IdSource {
  // Returns `count` random bytes.
  randomBytes(count: number): Uint8Array;
  now(): Date;
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

// CART- plus 12 characters from an alphabet with no 0/O or 1/I, so a person can read one aloud (W-05).
export function newCartId(source: IdSource): CartId {
  const bytes = source.randomBytes(12);
  let out = "CART-";
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out as CartId;
}

// A ULID: 48-bit time plus 80 random bits, so IDs sort by creation time (W-05).
export function ulid(source: IdSource): string {
  let time = source.now().getTime();
  let timePart = "";
  for (let i = 0; i < 10; i++) { timePart = CROCKFORD[time % 32] + timePart; time = Math.floor(time / 32); }
  let randomPart = "";
  for (const b of source.randomBytes(16)) randomPart += CROCKFORD[b % 32];
  return timePart + randomPart;
}

export const prefixedId = (prefix: "sel" | "sto" | "pho" | "prd" | "var" | "ord" | "rfd" | "evt" | "key", source: IdSource) => `${prefix}_${ulid(source)}`;

// The production source, used only at the edges.
export const webIdSource: IdSource = {
  randomBytes: (count) => crypto.getRandomValues(new Uint8Array(count)),
  now: () => new Date(),
};
