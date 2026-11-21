import { describe, expect, it } from "vitest";
import { decrypt, encrypt } from "./crypto";

describe("encrypt / decrypt", () => {
  it("round-trips and uses a fresh IV each time", () => {
    const a = encrypt("geheim äöü 🔑");
    expect(decrypt(a)).toBe("geheim äöü 🔑");
    expect(encrypt("x")).not.toBe(encrypt("x"));
  });
  it("refuses tampered or malformed values", () => {
    const [v, iv, tag, data] = encrypt("secret").split(".");
    const flipped = data.slice(0, -1) + (data.endsWith("A") ? "B" : "A");
    expect(decrypt([v, iv, tag, flipped].join("."))).toBeNull();
    expect(decrypt("nonsense")).toBeNull();
  });
});
