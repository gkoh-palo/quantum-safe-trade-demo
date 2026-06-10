import { describe, it, expect } from "vitest";
import { parseSchemeBody } from "./admin.js";

describe("admin: parseSchemeBody", () => {
  it("accepts a valid scheme + break mode", () => {
    expect(parseSchemeBody({ scheme: "hybrid-mlkem", breakMode: "projected" })).toEqual({
      scheme: "hybrid-mlkem",
      breakMode: "projected",
    });
    expect(parseSchemeBody({ scheme: "rsa-oaep", breakMode: "genuine" })).not.toBeNull();
  });

  it("rejects unknown schemes, bad modes, and non-objects", () => {
    expect(parseSchemeBody({ scheme: "rot13", breakMode: "projected" })).toBeNull();
    expect(parseSchemeBody({ scheme: "rsa-oaep", breakMode: "telepathy" })).toBeNull();
    expect(parseSchemeBody({ scheme: "rsa-oaep" })).toBeNull();
    expect(parseSchemeBody(null)).toBeNull();
    expect(parseSchemeBody("nope")).toBeNull();
  });
});
