import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ERROR_CODES, ERROR_INFO } from "@/server/domain/errors";

describe("Error codes (CQ-32)", () => {
  it("ERROR_INFO matches api/error-codes.yaml line for line", () => {
    const yaml = readFileSync("api/error-codes.yaml", "utf8");
    const fromYaml = Object.fromEntries(
      [...yaml.matchAll(/^ {2}([a-z_.]+): \{ status: (\d+), message: "(.*)" \}$/gm)].map((m) => [m[1], { status: Number(m[2]), message: m[3] }]),
    );
    expect(ERROR_INFO).toEqual(fromYaml);
    expect(Object.keys(fromYaml)).toEqual([...ERROR_CODES]);
  });
});
