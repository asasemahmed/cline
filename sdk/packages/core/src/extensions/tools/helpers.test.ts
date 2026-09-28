import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TimeoutError, withTimeout } from "./helpers";

describe("withTimeout", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("clears timer after resolution", async () => {
		const result = await withTimeout(
			Promise.resolve("done"),
			60_000,
			"timed out",
		);
		expect(result).toBe("done");
		expect(vi.getTimerCount()).toBe(0);
	});

	it("clears timer after inner rejection", async () => {
		await expect(
			withTimeout(
				Promise.reject(new Error("inner failure")),
				60_000,
				"timed out",
			),
		).rejects.toThrow("inner failure");
		expect(vi.getTimerCount()).toBe(0);
	});

	it("rejects with TimeoutError after advancing timeout duration", async () => {
		const pending = withTimeout(
			new Promise<string>(() => {}),
			60_000,
			"timed out",
		);
		const assertion = expect(pending).rejects.toThrow(TimeoutError);
		await vi.advanceTimersByTimeAsync(60_000);
		await assertion;
		await expect(pending).rejects.toMatchObject({
			message: "timed out",
			timeoutMs: 60_000,
		});
		expect(vi.getTimerCount()).toBe(0);
	});
});
