import { describe, expect, it } from "vitest";
import { normalizeWindowsText, stripUtf8Bom, trimNonEmpty } from "./string";

describe("trimNonEmpty", () => {
	it("returns trimmed strings and omits empty values", () => {
		expect(trimNonEmpty("  session-id  ")).toBe("session-id");
		expect(trimNonEmpty("   ")).toBeUndefined();
		expect(trimNonEmpty("")).toBeUndefined();
		expect(trimNonEmpty(undefined)).toBeUndefined();
		expect(trimNonEmpty(null)).toBeUndefined();
	});
});

describe("stripUtf8Bom", () => {
	it("removes a leading BOM character", () => {
		expect(stripUtf8Bom("\uFEFF---\nname: foo\n---\n")).toBe(
			"---\nname: foo\n---\n",
		);
	});

	it("leaves text without a BOM unchanged", () => {
		expect(stripUtf8Bom("---\nname: foo\n---\n")).toBe("---\nname: foo\n---\n");
	});

	it("only strips a BOM at the start of the string", () => {
		expect(stripUtf8Bom("a\uFEFFb")).toBe("a\uFEFFb");
	});

	it("handles empty strings", () => {
		expect(stripUtf8Bom("")).toBe("");
	});
});

describe("normalizeWindowsText", () => {
	it("strips a leading BOM and converts CRLF line endings to LF", () => {
		expect(
			normalizeWindowsText("\uFEFF---\r\nname: foo\r\n---\r\nbody\r\n"),
		).toBe("---\nname: foo\n---\nbody\n");
	});

	it("leaves LF text without a BOM unchanged", () => {
		expect(normalizeWindowsText("---\nname: foo\n---\n")).toBe(
			"---\nname: foo\n---\n",
		);
	});

	it("keeps interior BOMs and lone carriage returns", () => {
		expect(normalizeWindowsText("a\uFEFFb\rc")).toBe("a\uFEFFb\rc");
	});

	it("handles empty strings", () => {
		expect(normalizeWindowsText("")).toBe("");
	});
});
