import { describe, expect, it } from "vitest";
import { resolveQuestionAnswer } from "./approval";

const OPTIONS = ["Yes", "No"];

describe("resolveQuestionAnswer", () => {
	it("maps a bare option number to that option", () => {
		expect(resolveQuestionAnswer("2", OPTIONS)).toBe("No");
		expect(resolveQuestionAnswer(" 1 ", OPTIONS)).toBe("Yes");
	});

	it("keeps custom answers that start with a number", () => {
		expect(resolveQuestionAnswer("2 files are enough", OPTIONS)).toBe(
			"2 files are enough",
		);
		expect(resolveQuestionAnswer("1.5", OPTIONS)).toBe("1.5");
	});

	it("keeps out-of-range numbers as custom answers", () => {
		expect(resolveQuestionAnswer("3", OPTIONS)).toBe("3");
		expect(resolveQuestionAnswer("0", OPTIONS)).toBe("0");
	});

	it("falls back to the first option for an empty answer", () => {
		expect(resolveQuestionAnswer("   ", OPTIONS)).toBe("Yes");
	});
});
