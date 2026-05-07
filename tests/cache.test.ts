import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Cache } from "../src/cache.js";

describe("Cache", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns undefined when key is absent", () => {
    const c = new Cache<string>();
    expect(c.get("missing")).toBeUndefined();
  });

  it("stores and retrieves a value within TTL", () => {
    const c = new Cache<{ n: number }>();
    c.set("k", { n: 1 }, 60);
    expect(c.get("k")).toEqual({ n: 1 });
  });

  it("expires entries after TTL", () => {
    const c = new Cache<string>();
    c.set("k", "v", 30);
    vi.advanceTimersByTime(30_000 + 1);
    expect(c.get("k")).toBeUndefined();
  });

  it("clear() empties the store", () => {
    const c = new Cache<number>();
    c.set("a", 1, 60);
    c.set("b", 2, 60);
    expect(c.size).toBe(2);
    c.clear();
    expect(c.size).toBe(0);
  });
});

describe("Cache invariant: no disk persistence", () => {
  it("src/cache.ts does not import fs, path, or any persistence library", () => {
    const source = readFileSync(
      join(process.cwd(), "src", "cache.ts"),
      "utf-8",
    );
    const forbidden = [
      /from\s+["']node:fs["']/,
      /from\s+["']fs["']/,
      /from\s+["']node:path["']/,
      /from\s+["']path["']/,
      /from\s+["']sqlite/,
      /from\s+["']better-sqlite3["']/,
      /from\s+["']level/,
      /from\s+["']lowdb["']/,
      /from\s+["']redis["']/,
      /require\(["'](fs|path|sqlite|level|lowdb|redis)/,
    ];
    for (const pattern of forbidden) {
      expect(source).not.toMatch(pattern);
    }
  });
});
