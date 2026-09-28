import { afterEach, describe, expect, it, vi } from "vitest";
import { createRemoteConfigBlobStorageAdapter } from "./blob-storage";

async function writeAndCaptureUrl(
	endpoint: string | undefined,
): Promise<string> {
	const fetchMock = vi.fn(
		async (_input: RequestInfo | URL) => new Response(null, { status: 200 }),
	);
	vi.stubGlobal("fetch", fetchMock);
	const adapter = createRemoteConfigBlobStorageAdapter({
		adapterType: "r2",
		bucket: "prompts",
		accessKeyId: "key",
		secretAccessKey: "secret",
		accountId: "acct",
		endpoint,
	});
	await adapter?.write("sessions/u/s/messages.json", "{}");
	const request = fetchMock.mock.calls[0]?.[0];
	return request instanceof Request ? request.url : String(request);
}

describe("createRemoteConfigBlobStorageAdapter", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("uses the R2 account endpoint when the endpoint is blank", async () => {
		await expect(writeAndCaptureUrl("")).resolves.toBe(
			"https://acct.r2.cloudflarestorage.com/prompts/sessions/u/s/messages.json",
		);
	});

	it("uses an explicit R2 endpoint when one is set", async () => {
		await expect(writeAndCaptureUrl("https://r2.example.com")).resolves.toBe(
			"https://r2.example.com/prompts/sessions/u/s/messages.json",
		);
	});
});
