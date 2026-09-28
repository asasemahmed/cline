import type {
	AgentMessage,
	AgentModelEvent,
	AgentToolDefinition,
	GatewayProviderContext,
	GatewayStreamRequest,
} from "@cline/shared";
import { describe, expect, it } from "vitest";
import { createAnthropicProvider } from "./ai-sdk";

const sse = (events: Array<Record<string, unknown>>) =>
	events
		.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
		.join("");

const messageStart = {
	type: "message_start",
	message: {
		id: "msg_1",
		type: "message",
		role: "assistant",
		model: "claude-sonnet-4-5",
		content: [],
		stop_reason: null,
		stop_sequence: null,
		usage: { input_tokens: 10, output_tokens: 0 },
	},
};

const toolUse = (index: number) => [
	{
		type: "content_block_start",
		index,
		content_block: {
			type: "tool_use",
			id: "toolu_1",
			name: "read_files",
			input: {},
		},
	},
	{
		type: "content_block_delta",
		index,
		delta: { type: "input_json_delta", partial_json: '{"files":["a.ts"]}' },
	},
	{ type: "content_block_stop", index },
	{
		type: "message_delta",
		delta: { stop_reason: "tool_use", stop_sequence: null },
		usage: { output_tokens: 5 },
	},
	{ type: "message_stop" },
];

const signedThinkingTurn = sse([
	messageStart,
	{
		type: "content_block_start",
		index: 0,
		content_block: { type: "thinking", thinking: "", signature: "" },
	},
	{
		type: "content_block_delta",
		index: 0,
		delta: { type: "thinking_delta", thinking: "I should read a.ts." },
	},
	{
		type: "content_block_delta",
		index: 0,
		delta: { type: "signature_delta", signature: "sig-abc" },
	},
	{ type: "content_block_stop", index: 0 },
	...toolUse(1),
]);

const redactedThinkingTurn = sse([
	messageStart,
	{
		type: "content_block_start",
		index: 0,
		content_block: { type: "redacted_thinking", data: "redacted-xyz" },
	},
	{ type: "content_block_stop", index: 0 },
	...toolUse(1),
]);

const textTurn = sse([
	messageStart,
	{
		type: "content_block_start",
		index: 0,
		content_block: { type: "text", text: "" },
	},
	{
		type: "content_block_delta",
		index: 0,
		delta: { type: "text_delta", text: "ok" },
	},
	{ type: "content_block_stop", index: 0 },
	{
		type: "message_delta",
		delta: { stop_reason: "end_turn", stop_sequence: null },
		usage: { output_tokens: 1 },
	},
	{ type: "message_stop" },
]);

const READ_FILES: AgentToolDefinition = {
	name: "read_files",
	description: "Read files",
	inputSchema: {
		type: "object",
		properties: { files: { type: "array", items: { type: "string" } } },
		required: ["files"],
	},
};

const userMessage: AgentMessage = {
	id: "u1",
	role: "user",
	content: [{ type: "text", text: "read a.ts" }],
	createdAt: 0,
};

/**
 * Streams a thinking + tool_use turn, folds its events into an assistant
 * message the way AgentRuntime does, replays the tool loop, and returns the
 * turn-1 events plus the Anthropic request body of the replay.
 */
async function runToolLoop(firstTurn: string) {
	const bodies: Array<{
		messages: Array<{ role: string; content: unknown[] }>;
	}> = [];
	const responses = [firstTurn, textTurn];
	const config = {
		providerId: "anthropic",
		apiKey: "test-key",
		fetch: (async (_url: RequestInfo | URL, init?: RequestInit) => {
			bodies.push(JSON.parse(String(init?.body)));
			return new Response(responses[bodies.length - 1], {
				headers: { "content-type": "text/event-stream" },
			});
		}) as typeof fetch,
	};
	const model = {
		id: "claude-sonnet-4-5",
		providerId: "anthropic",
		name: "Claude Sonnet 4.5",
		capabilities: ["tools", "reasoning"],
	};
	const context = {
		provider: {
			id: "anthropic",
			name: "Anthropic",
			defaultModelId: model.id,
			models: [model],
		},
		model,
		config,
	} as unknown as GatewayProviderContext;
	const provider = await createAnthropicProvider(config);
	const request = (messages: AgentMessage[]) =>
		({
			providerId: "anthropic",
			modelId: model.id,
			messages,
			tools: [READ_FILES],
			reasoning: { enabled: true, budgetTokens: 2048 },
		}) as unknown as GatewayStreamRequest;

	const events: AgentModelEvent[] = [];
	for await (const event of await provider.stream(
		request([userMessage]),
		context,
	)) {
		events.push(event);
	}

	const content: AgentMessage["content"] = [];
	for (const event of events) {
		const last = content.at(-1);
		if (event.type === "reasoning-delta") {
			if (last?.type === "reasoning") {
				last.text += event.text;
				last.redacted = event.redacted ?? last.redacted;
				last.metadata = event.metadata ?? last.metadata;
			} else {
				content.push({
					type: "reasoning",
					text: event.text,
					redacted: event.redacted,
					metadata: event.metadata,
				});
			}
		} else if (event.type === "tool-call-delta") {
			content.push({
				type: "tool-call",
				toolCallId: event.toolCallId ?? "",
				toolName: event.toolName ?? "",
				input: event.input,
			});
		}
	}

	for await (const _event of await provider.stream(
		request([
			userMessage,
			{ id: "a1", role: "assistant", content, createdAt: 0 },
			{
				id: "t1",
				role: "tool",
				content: [
					{
						type: "tool-result",
						toolCallId: "toolu_1",
						toolName: "read_files",
						output: "body",
					},
				],
				createdAt: 0,
			},
		]),
		context,
	)) {
		// drain
	}
	const assistant = bodies[1]?.messages.find((m) => m.role === "assistant");
	return { events, replayedAssistant: assistant?.content };
}

describe("Anthropic thinking replay", () => {
	it("keeps the thinking signature so the tool loop replays a signed thinking block", async () => {
		const { events, replayedAssistant } = await runToolLoop(signedThinkingTurn);

		expect(
			events.some(
				(event) =>
					event.type === "reasoning-delta" &&
					(event.metadata as { signature?: string } | undefined)?.signature ===
						"sig-abc",
			),
		).toBe(true);
		expect(replayedAssistant?.[0]).toEqual({
			type: "thinking",
			thinking: "I should read a.ts.",
			signature: "sig-abc",
		});
	});

	it("keeps redacted thinking blocks for the replay", async () => {
		const { replayedAssistant } = await runToolLoop(redactedThinkingTurn);

		expect(replayedAssistant?.[0]).toEqual({
			type: "redacted_thinking",
			data: "redacted-xyz",
		});
	});
});
