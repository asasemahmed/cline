import * as childProcess from "node:child_process";
import * as fsPromises from "node:fs/promises";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { getFileIndex, prewarmFileIndex } from "./file-indexer";

vi.mock("node:child_process", async () => {
	const actual =
		await vi.importActual<typeof import("node:child_process")>(
			"node:child_process",
		);
	return {
		...actual,
		spawn: vi.fn(actual.spawn),
	};
});

vi.mock("node:fs/promises", async () => {
	const actual =
		await vi.importActual<typeof import("node:fs/promises")>(
			"node:fs/promises",
		);
	return {
		...actual,
		readdir: vi.fn(actual.readdir),
	};
});

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

async function createTempWorkspace(): Promise<string> {
	return mkdtemp(path.join(os.tmpdir(), "core-file-index-"));
}

describe("file indexer", () => {
	it("indexes files by relative posix path", async () => {
		const cwd = await createTempWorkspace();
		try {
			await mkdir(path.join(cwd, "src"), { recursive: true });
			await writeFile(path.join(cwd, "src", "main.ts"), "export {}\n", "utf8");
			await writeFile(path.join(cwd, "README.md"), "# Demo\n", "utf8");

			const index = await getFileIndex(cwd, { ttlMs: 0 });
			expect(index.has("src/main.ts")).toBe(true);
			expect(index.has("README.md")).toBe(true);
		} finally {
			await rm(cwd, { recursive: true, force: true });
		}
	});

	it("always excludes .git files from index", async () => {
		const cwd = await createTempWorkspace();
		try {
			await mkdir(path.join(cwd, ".git"), { recursive: true });
			await mkdir(path.join(cwd, "node_modules", "pkg"), { recursive: true });
			await writeFile(path.join(cwd, ".git", "config"), "[core]\n", "utf8");
			await writeFile(
				path.join(cwd, "node_modules", "pkg", "index.js"),
				"module.exports = {}\n",
				"utf8",
			);
			await writeFile(
				path.join(cwd, "app.ts"),
				"export const app = 1\n",
				"utf8",
			);

			const index = await getFileIndex(cwd, { ttlMs: 0 });
			expect(index.has("app.ts")).toBe(true);
			expect(index.has(".git/config")).toBe(false);
		} finally {
			await rm(cwd, { recursive: true, force: true });
		}
	});

	it("does not index the home directory", async () => {
		const cwd = await createTempWorkspace();
		const homedir = vi.spyOn(os, "homedir").mockReturnValue(cwd);
		try {
			await writeFile(path.join(cwd, "notes.md"), "# Notes\n", "utf8");

			const index = await getFileIndex(cwd, { ttlMs: 0 });
			expect(index.size).toBe(0);
		} finally {
			homedir.mockRestore();
			await rm(cwd, { recursive: true, force: true });
		}
	});

	it("does not index the filesystem root", async () => {
		const root = path.parse(process.cwd()).root;
		const index = await getFileIndex(root, { ttlMs: 0 });
		expect(index.size).toBe(0);
	});

	it("prewarm rebuilds index and includes new files", async () => {
		const cwd = await createTempWorkspace();
		try {
			await writeFile(
				path.join(cwd, "first.ts"),
				"export const first = 1\n",
				"utf8",
			);
			const firstIndex = await getFileIndex(cwd, { ttlMs: 60_000 });
			expect(firstIndex.has("first.ts")).toBe(true);

			await writeFile(
				path.join(cwd, "second.ts"),
				"export const second = 2\n",
				"utf8",
			);
			await prewarmFileIndex(cwd, { ttlMs: 60_000 });

			const rebuilt = await getFileIndex(cwd, { ttlMs: 60_000 });
			expect(rebuilt.has("second.ts")).toBe(true);
		} finally {
			await rm(cwd, { recursive: true, force: true });
		}
	});

	it("skips unreadable directories during fallback indexing", async () => {
		const cwd = await createTempWorkspace();
		const unreadableDir = path.join(cwd, "private");
		try {
			await mkdir(unreadableDir, { recursive: true });
			await writeFile(
				path.join(cwd, "visible.ts"),
				"export const ok = 1\n",
				"utf8",
			);
			await writeFile(
				path.join(unreadableDir, "hidden.ts"),
				"export const hidden = 1\n",
				"utf8",
			);
			await chmod(unreadableDir, 0o000);

			await expect(
				prewarmFileIndex(cwd, { ttlMs: 0 }),
			).resolves.toBeUndefined();

			const index = await getFileIndex(cwd, { ttlMs: 0 });
			expect(index.has("visible.ts")).toBe(true);
		} finally {
			await chmod(unreadableDir, 0o755).catch(() => undefined);
			await rm(cwd, { recursive: true, force: true });
		}
	});

	it("evicts stale workspace indexes after 10 minutes when multiple workspaces exist", async () => {
		vi.useFakeTimers();
		const firstWorkspace = await createTempWorkspace();
		const secondWorkspace = await createTempWorkspace();
		try {
			await writeFile(
				path.join(firstWorkspace, "first.ts"),
				"export const first = 1\n",
				"utf8",
			);
			await writeFile(
				path.join(secondWorkspace, "second.ts"),
				"export const second = 2\n",
				"utf8",
			);

			const firstIndex = await getFileIndex(firstWorkspace, { ttlMs: 60_000 });
			expect(firstIndex.has("first.ts")).toBe(true);

			await getFileIndex(secondWorkspace, { ttlMs: 60_000 });
			vi.advanceTimersByTime(10 * 60_000 + 1);

			await getFileIndex(secondWorkspace, { ttlMs: 60_000 });
			await writeFile(
				path.join(firstWorkspace, "later.ts"),
				"export const later = 3\n",
				"utf8",
			);

			const rebuiltFirstIndex = await getFileIndex(firstWorkspace, {
				ttlMs: 60_000,
			});
			expect(rebuiltFirstIndex.has("later.ts")).toBe(true);
		} finally {
			vi.useRealTimers();
			await rm(firstWorkspace, { recursive: true, force: true });
			await rm(secondWorkspace, { recursive: true, force: true });
		}
	});

	it("rebuilds index on next call when previous build rejects", async () => {
		const cwd = await createTempWorkspace();
		try {
			await writeFile(
				path.join(cwd, "sample.ts"),
				"export const sample = 1\n",
				"utf8",
			);

			const spawnMock = vi.mocked(childProcess.spawn);
			const readdirMock = vi.mocked(fsPromises.readdir);

			const failure = new Error("EMFILE: too many open files");
			Object.assign(failure, { code: "EMFILE" });

			spawnMock.mockImplementationOnce(() => {
				throw failure;
			});
			readdirMock.mockRejectedValueOnce(failure);

			await expect(getFileIndex(cwd, { ttlMs: 0 })).rejects.toThrow("EMFILE");

			const index = await getFileIndex(cwd, { ttlMs: 0 });
			expect(index.has("sample.ts")).toBe(true);

			spawnMock.mockImplementationOnce(() => {
				throw failure;
			});
			readdirMock.mockRejectedValueOnce(failure);

			await expect(getFileIndex(cwd, { ttlMs: 0 })).rejects.toThrow("EMFILE");

			const cached = await getFileIndex(cwd, { ttlMs: 60_000 });
			expect(cached.has("sample.ts")).toBe(true);
		} finally {
			await rm(cwd, { recursive: true, force: true });
		}
	});
});
