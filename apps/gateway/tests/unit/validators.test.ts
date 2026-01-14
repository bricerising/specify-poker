import { describe, it, expect } from "vitest";
import { parseTableId, parseSeatId, parseActionType, parseChatMessage } from "../../src/ws/validators";

describe("Validators", () => {
  it("should parse tableId", () => {
    expect(parseTableId("table-1")).toBe("table-1");
    expect(parseTableId("  table-1  ")).toBe("table-1");
    expect(parseTableId("")).toBe(null);
    expect(parseTableId(null)).toBe(null);
  });

  it("should parse seatId", () => {
    expect(parseSeatId("0")).toBe(0);
    expect(parseSeatId(5)).toBe(5);
    expect(parseSeatId(8)).toBe(8);
    expect(parseSeatId(-1)).toBe(null);
    expect(parseSeatId(9)).toBe(null);
  });

  it("should parse actionType", () => {
    expect(parseActionType("Fold")).toBe("FOLD");
    expect(parseActionType('Check')).toBe('CHECK');
    expect(parseActionType("Invalid")).toBe(null);
  });

  it("should parse chatMessage", () => {
    expect(parseChatMessage("Hello").ok).toBe(true);
    expect(parseChatMessage("").ok).toBe(false);
    expect(parseChatMessage("a".repeat(501)).ok).toBe(false);
  });
});
