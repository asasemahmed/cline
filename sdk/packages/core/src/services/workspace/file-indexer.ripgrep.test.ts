import { EventEmitter } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { getFileIndex } from "./file-indexer";

const RG_FILES = ["docs/caf\u00e9.md", "src/\u65e5\u672c.ts", "\u{1F600}.txt"];

vi.mock("node:worker_threads", async () => {
	const actual = await vi.importActual<typeof import("node:worker_threads")>(
		"node:worker_threads",
	);
	return {
		...actual,
		isMainThread: false,
		parentPort: null,
	};
});

// Stands in for `rg --files`, writing its stdout one byte per chunk so every
// 2-, 3- and 4-byte character arrives split across `data` events.
vi.mock("node:child_process", () => ({
	spawn: () => {
		const child = Object.assign(new EventEmitter(), {
			stdout: new PassThrough(),
			stderr: new PassThrough(),
		});
		setImmediate(() => {
			const bytes = Buffer.from(`${RG_FILES.join("\n")}\n`, "utf8");
			child.stdout.once("end", () => child.emit("close", 0));
			for (let i = 0; i < bytes.length; i++) {
				child.stdout.write(bytes.subarray(i, i + 1));
			}
			child.stdout.end();
		});
		return child;
	},
}));

describe("file indexer with ripgrep", () => {
	it("keeps multibyte file names split across ripgrep output chunks", async () => {
		const cwd = await mkdtemp(path.join(os.tmpdir(), "core-file-index-"));
		try {
			const index = await getFileIndex(cwd, { ttlMs: 0 });
			expect([...index].sort()).toEqual([...RG_FILES].sort());
		} finally {
			await rm(cwd, { recursive: true, force: true });
		}
	});
});
