import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import type { AgentToolContext } from "@cline/shared";
import { describe, expect, it, vi } from "vitest";
import { createSearchExecutor } from "./search";

const ctx: AgentToolContext = {
	agentId: "agent-1",
	conversationId: "conv-1",
	iteration: 1,
};

const RG_JSON_OUTPUT = `${[
	{
		type: "match",
		data: {
			path: { text: "docs/caf\u00e9.md" },
			line_number: 1,
			submatches: [{ start: 0, match: { text: "\u65e5\u672c" } }],
		},
	},
	{
		type: "context",
		data: {
			path: { text: "docs/caf\u00e9.md" },
			line_number: 2,
			lines: { text: "\u{1F600} na\u00efve\n" },
		},
	},
]
	.map((event) => JSON.stringify(event))
	.join("\n")}\n`;

// Stands in for ripgrep. The search output is written one byte per chunk, so
// every 2-, 3- and 4-byte character arrives split across `data` events.
vi.mock("node:child_process", () => ({
	spawn: (_command: string, args: string[]) => {
		const child = Object.assign(new EventEmitter(), {
			stdout: new PassThrough(),
			stderr: new PassThrough(),
			killed: false,
			kill: () => true,
		});
		setImmediate(() => {
			if (args.includes("--version")) {
				child.emit("close", 0);
				return;
			}
			const bytes = Buffer.from(RG_JSON_OUTPUT, "utf8");
			child.stdout.once("end", () => child.emit("close", 0));
			for (let i = 0; i < bytes.length; i++) {
				child.stdout.write(bytes.subarray(i, i + 1));
			}
			child.stdout.end();
		});
		return child;
	},
}));

describe("createSearchExecutor with ripgrep", () => {
	it("keeps multibyte characters split across ripgrep output chunks", async () => {
		const result = await createSearchExecutor()("\u65e5\u672c", ".", ctx);

		expect(result).toContain("docs/caf\u00e9.md:1:1");
		expect(result).toContain("2: \u{1F600} na\u00efve");
		expect(result).not.toContain("\uFFFD");
	});
});
