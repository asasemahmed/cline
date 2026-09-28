import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	getMcpDescription,
	loadInteractiveConfigData,
} from "./interactive-config";

describe("getMcpDescription", () => {
	it("discloses the default initialize timeout for unconfigured stdio servers", () => {
		expect(
			getMcpDescription({
				name: "local",
				transport: { type: "stdio", command: "node" },
			}),
		).toBe("stdio, local, request timeout 60s, initialize timeout 3s");
	});

	it("shows one configured timeout when it also applies to initialize", () => {
		expect(
			getMcpDescription({
				name: "local",
				transport: { type: "stdio", command: "node" },
				timeoutSeconds: 120,
			}),
		).toBe("stdio, local, timeout 120s");
	});

	it("shows the request default for URL transports", () => {
		expect(
			getMcpDescription({
				name: "remote",
				transport: {
					type: "streamableHttp",
					url: "https://mcp.example.test",
				},
			}),
		).toBe("streamableHttp, no auth, timeout 60s");
	});

	it("reports malformed programmatic timeouts as unconfigured", () => {
		expect(
			getMcpDescription({
				name: "local",
				transport: { type: "stdio", command: "node" },
				timeoutSeconds: Number.NaN,
			}),
		).toBe("stdio, local, request timeout 60s, initialize timeout 3s");
	});
});

describe("loadInteractiveConfigData source labels", () => {
	let root: string;
	let previousClineDir: string | undefined;

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), "cline-config-source-"));
		previousClineDir = process.env.CLINE_DIR;
	});

	afterEach(() => {
		if (previousClineDir === undefined) {
			delete process.env.CLINE_DIR;
		} else {
			process.env.CLINE_DIR = previousClineDir;
		}
		rmSync(root, { recursive: true, force: true });
	});

	function writeAgent(directory: string, name: string): void {
		mkdirSync(directory, { recursive: true });
		writeFileSync(join(directory, `${name}.yml`), `---\nname: ${name}\n---\n`);
	}

	async function loadAgentSources(
		workspaceRoot: string,
	): Promise<Record<string, string>> {
		const data = await loadInteractiveConfigData({
			cwd: workspaceRoot,
			workspaceRoot,
			includePluginTools: false,
		});
		return Object.fromEntries(
			data.agents.map((agent) => [agent.name, agent.source]),
		);
	}

	it("labels items in a sibling directory sharing the workspace prefix as global", async () => {
		const workspaceRoot = join(root, "app");
		process.env.CLINE_DIR = join(root, "app-global");
		writeAgent(join(workspaceRoot, ".cline", "agents"), "local-agent");
		writeAgent(join(root, "app-global", "agents"), "global-agent");

		expect(await loadAgentSources(workspaceRoot)).toEqual({
			"local-agent": "workspace",
			"global-agent": "global",
		});
	});

	it.runIf(process.platform === "win32")(
		"labels workspace items as workspace when the root uses forward slashes",
		async () => {
			// `git rev-parse --show-toplevel` prints C:/... on Windows while
			// discovered paths are joined with backslashes.
			const workspaceRoot = join(root, "app");
			process.env.CLINE_DIR = join(root, "global");
			writeAgent(join(workspaceRoot, ".cline", "agents"), "local-agent");
			writeAgent(join(root, "global", "agents"), "global-agent");

			const forwardSlashRoot = workspaceRoot.replace(/\\/g, "/");

			expect(await loadAgentSources(forwardSlashRoot)).toEqual({
				"local-agent": "workspace",
				"global-agent": "global",
			});
		},
	);
});
