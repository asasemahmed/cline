import { beforeEach, describe, expect, it, vi } from "vitest";

const outputMocks = vi.hoisted(() => ({
	write: vi.fn(),
	writeErr: vi.fn(),
	emitJsonLine: vi.fn(),
	getCurrentOutputMode: vi.fn(() => "text"),
	getActiveCliSession: vi.fn(() => undefined),
}));

vi.mock("./output", () => ({
	c: {
		reset: "",
		dim: "",
		cyan: "",
	},
	emitJsonLine: outputMocks.emitJsonLine,
	getActiveCliSession: outputMocks.getActiveCliSession,
	getCurrentOutputMode: outputMocks.getCurrentOutputMode,
	write: outputMocks.write,
	writeErr: outputMocks.writeErr,
}));

const eventMocks = vi.hoisted(() => ({
	closeInlineStreamIfNeeded: vi.fn(),
}));

vi.mock("./events", () => ({
	closeInlineStreamIfNeeded: eventMocks.closeInlineStreamIfNeeded,
}));

import { createRuntimeHooks } from "./hooks";

async function emitRunStartAndPrompt(
	hooks: NonNullable<ReturnType<typeof createRuntimeHooks>["hooks"]>,
): Promise<void> {
	const snapshot = {
		agentId: "agent-1",
		conversationId: "conversation-1",
		runId: "run-1",
		parentAgentId: null,
		status: "running" as const,
		iteration: 0,
		messages: [],
		pendingToolCalls: [],
		usage: {
			inputTokens: 0,
			outputTokens: 0,
			cacheReadTokens: 0,
			cacheWriteTokens: 0,
		},
	};
	await hooks.beforeRun?.({ snapshot });
	await hooks.onEvent?.({
		type: "message-added",
		snapshot,
		message: {
			id: "msg-1",
			role: "user",
			content: [{ type: "text", text: "hello" }],
			createdAt: 0,
		},
	});
}

async function emitToolResult(
	hooks: NonNullable<ReturnType<typeof createRuntimeHooks>["hooks"]>,
	output: unknown = "ok",
): Promise<void> {
	await hooks.afterTool?.({
		snapshot: {
			agentId: "agent-1",
			conversationId: "conversation-1",
			runId: "run-1",
			parentAgentId: null,
			status: "running",
			iteration: 1,
			messages: [],
			pendingToolCalls: [],
			usage: {
				inputTokens: 0,
				outputTokens: 0,
				cacheReadTokens: 0,
				cacheWriteTokens: 0,
			},
		},
		tool: {
			name: "read_file",
			description: "",
			inputSchema: {},
			execute: async () => "ok",
		},
		toolCall: {
			type: "tool-call",
			toolCallId: "call-1",
			toolName: "read_file",
			input: { path: "README.md" },
		},
		input: { path: "README.md" },
		result: { output },
		startedAt: new Date("2026-01-01T00:00:00.000Z"),
		endedAt: new Date("2026-01-01T00:00:00.042Z"),
		durationMs: 42,
	});
}

describe("createRuntimeHooks", () => {
	beforeEach(() => {
		outputMocks.write.mockReset();
		outputMocks.writeErr.mockReset();
		outputMocks.emitJsonLine.mockReset();
		outputMocks.getCurrentOutputMode.mockReset();
		outputMocks.getCurrentOutputMode.mockReturnValue("text");
		outputMocks.getActiveCliSession.mockReset();
		outputMocks.getActiveCliSession.mockReturnValue(undefined);
		eventMocks.closeInlineStreamIfNeeded.mockReset();
	});

	it("disables runtime hooks in yolo mode", async () => {
		const runtimeHooks = createRuntimeHooks({
			yolo: true,
			dispatchHookEvent: vi.fn(),
		});

		expect(runtimeHooks.hooks).toBeUndefined();
		await expect(runtimeHooks.shutdown()).resolves.toBeUndefined();
	});

	it("returns in-process hooks when dispatch is available", async () => {
		const dispatchHookEvent = vi.fn().mockResolvedValue(undefined);
		const runtimeHooks = createRuntimeHooks({
			yolo: false,
			cwd: "/workspace",
			workspaceRoot: "/workspace",
			dispatchHookEvent,
		});

		expect(runtimeHooks.hooks).toBeDefined();
		await emitRunStartAndPrompt(runtimeHooks.hooks!);

		expect(dispatchHookEvent).toHaveBeenCalledTimes(2);
		expect(dispatchHookEvent).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({
				hookName: "agent_start",
				taskId: "conversation-1",
				workspaceRoots: ["/workspace"],
			}),
		);
		expect(dispatchHookEvent).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({
				hookName: "prompt_submit",
				taskId: "conversation-1",
				workspaceRoots: ["/workspace"],
			}),
		);
	});

	it("does not dispatch prompt_submit for injected hook-context messages", async () => {
		const dispatchHookEvent = vi.fn().mockResolvedValue(undefined);
		const runtimeHooks = createRuntimeHooks({
			yolo: false,
			cwd: "/workspace",
			workspaceRoot: "/workspace",
			verbose: false,
			dispatchHookEvent,
		});

		await runtimeHooks.hooks?.onEvent?.({
			type: "message-added",
			snapshot: {
				agentId: "agent-1",
				conversationId: "conversation-1",
				runId: "run-1",
				parentAgentId: null,
				status: "running",
				iteration: 0,
				messages: [],
				pendingToolCalls: [],
				usage: {
					inputTokens: 0,
					outputTokens: 0,
					cacheReadTokens: 0,
					cacheWriteTokens: 0,
				},
			},
			message: {
				id: "msg-hook-context",
				role: "user",
				content: [
					{
						type: "text",
						text: '<hook_context source="RunStart">note</hook_context>',
					},
				],
				createdAt: 0,
				metadata: { userRunSpan: 0, displayRole: "system" },
			},
		});

		expect(dispatchHookEvent).not.toHaveBeenCalled();
	});

	it("forwards runtime tool timing to tool_result hook payloads", async () => {
		const dispatchHookEvent = vi.fn().mockResolvedValue(undefined);
		const runtimeHooks = createRuntimeHooks({
			yolo: false,
			cwd: "/workspace",
			workspaceRoot: "/workspace",
			dispatchHookEvent,
		});

		await emitToolResult(runtimeHooks.hooks!);

		expect(dispatchHookEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				hookName: "tool_result",
				tool_result: expect.objectContaining({
					durationMs: 42,
					startedAt: new Date("2026-01-01T00:00:00.000Z"),
					endedAt: new Date("2026-01-01T00:00:00.042Z"),
				}),
				postToolUse: expect.objectContaining({
					executionTimeMs: 42,
				}),
			}),
		);
	});

	it("suppresses text hook output when verbose is disabled", async () => {
		const dispatchHookEvent = vi.fn().mockResolvedValue(undefined);
		const runtimeHooks = createRuntimeHooks({
			yolo: false,
			cwd: "/workspace",
			workspaceRoot: "/workspace",
			verbose: false,
			dispatchHookEvent,
		});

		await emitRunStartAndPrompt(runtimeHooks.hooks!);

		expect(dispatchHookEvent).toHaveBeenCalledTimes(2);
		expect(outputMocks.write).not.toHaveBeenCalled();
		expect(eventMocks.closeInlineStreamIfNeeded).not.toHaveBeenCalled();
	});

	it("prints text hook output when verbose is enabled", async () => {
		const dispatchHookEvent = vi.fn().mockResolvedValue(undefined);
		const runtimeHooks = createRuntimeHooks({
			yolo: false,
			cwd: "/workspace",
			workspaceRoot: "/workspace",
			verbose: true,
			dispatchHookEvent,
		});

		await emitRunStartAndPrompt(runtimeHooks.hooks!);

		expect(outputMocks.write).toHaveBeenCalledWith("\n[hook:agent_start]\n");
		expect(outputMocks.write).toHaveBeenCalledWith("\n[hook:prompt_submit]\n");
		expect(eventMocks.closeInlineStreamIfNeeded).toHaveBeenCalledTimes(2);
	});

	it("does not dispatch hooks after shutdown", async () => {
		const dispatchHookEvent = vi.fn().mockResolvedValue(undefined);
		const runtimeHooks = createRuntimeHooks({
			yolo: false,
			cwd: "/workspace",
			workspaceRoot: "/workspace",
			verbose: true,
			dispatchHookEvent,
		});

		await runtimeHooks.shutdown();
		await emitRunStartAndPrompt(runtimeHooks.hooks!);

		expect(dispatchHookEvent).not.toHaveBeenCalled();
		expect(outputMocks.write).not.toHaveBeenCalled();
	});

	it("truncates oversized tool output in tool_result hook payloads", async () => {
		const dispatchHookEvent = vi.fn().mockResolvedValue(undefined);
		const runtimeHooks = createRuntimeHooks({
			yolo: false,
			cwd: "/workspace",
			workspaceRoot: "/workspace",
			dispatchHookEvent,
		});

		await emitToolResult(runtimeHooks.hooks!, [
			{ type: "text", text: "Successfully read image" },
			{
				type: "image",
				data: "A".repeat(9 * 1024 * 1024),
				mediaType: "image/jpeg",
			},
		]);

		expect(dispatchHookEvent).toHaveBeenCalledTimes(1);
		const dispatchedPayload = dispatchHookEvent.mock.calls[0][0];
		const serializedPayload = JSON.stringify(dispatchedPayload);

		expect(serializedPayload.length).toBeLessThan(1024 * 1024);
		expect(serializedPayload).toContain("[truncated ");
		expect(dispatchedPayload.tool_result.output).toBe(
			dispatchedPayload.postToolUse.result,
		);
		expect(dispatchedPayload.tool_result.output).toMatch(
			/\n\[truncated \d+ characters\]$/,
		);
	});

	it("keeps small tool output unchanged in tool_result hook payloads", async () => {
		const dispatchHookEvent = vi.fn().mockResolvedValue(undefined);
		const runtimeHooks = createRuntimeHooks({
			yolo: false,
			cwd: "/workspace",
			workspaceRoot: "/workspace",
			dispatchHookEvent,
		});

		const smallString = "small output content";
		await emitToolResult(runtimeHooks.hooks!, smallString);

		expect(dispatchHookEvent).toHaveBeenCalledTimes(1);
		const stringPayload = dispatchHookEvent.mock.calls[0][0];
		expect(stringPayload.tool_result.output).toBe(smallString);
		expect(stringPayload.postToolUse.result).toBe(smallString);

		const smallObject = { text: "small object content", count: 1 };
		await emitToolResult(runtimeHooks.hooks!, smallObject);

		expect(dispatchHookEvent).toHaveBeenCalledTimes(2);
		const objectPayload = dispatchHookEvent.mock.calls[1][0];
		expect(objectPayload.tool_result.output).toBe(smallObject);
		expect(objectPayload.postToolUse.result).toBe(JSON.stringify(smallObject));
	});
});
