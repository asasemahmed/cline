import type {
	AgentModelEvent,
	GatewayProviderContext,
	GatewayStreamRequest,
} from "@cline/shared";
import { describe, expect, it } from "vitest";
import { createClineProvider } from "./ai-sdk";

const chunk = (delta: unknown, finish: string | null = null) =>
	`data: ${JSON.stringify({
		id: "cmpl-1",
		object: "chat.completion.chunk",
		created: 1,
		model: "test-model",
		choices: [{ index: 0, delta, finish_reason: finish }],
	})}\n\n`;

const usageChunk = (usage: Record<string, unknown>) =>
	`data: ${JSON.stringify({
		id: "cmpl-1",
		object: "chat.completion.chunk",
		created: 1,
		model: "test-model",
		choices: [],
		usage,
	})}\n\n`;

const textTurn = (text: string, usage: Record<string, unknown>) =>
	chunk({ role: "assistant", content: text }) +
	chunk({}, "stop") +
	usageChunk(usage) +
	"data: [DONE]\n\n";

const webSearchTurn = (usage: Record<string, unknown>) =>
	chunk({
		role: "assistant",
		tool_calls: [
			{
				index: 0,
				id: "call_search",
				type: "function",
				function: { name: "web_search", arguments: '{"query":"cline"}' },
			},
		],
	}) +
	chunk({}, "tool_calls") +
	usageChunk(usage) +
	"data: [DONE]\n\n";

function sse(body: string): Response {
	return new Response(body, {
		headers: { "content-type": "text/event-stream" },
	});
}

async function streamUsage(
	fetchImpl: typeof fetch,
	request: Partial<GatewayStreamRequest> = {},
) {
	const config = {
		providerId: "cline",
		apiKey: "test-key",
		baseUrl: "http://fake.local/v1",
		fetch: fetchImpl,
	};
	const model = {
		id: "test-model",
		providerId: "cline",
		name: "test-model",
		// Catalog pricing that differs from the provider-reported cost, so the
		// assertions show which one was used.
		metadata: { pricing: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0 } },
	};
	const context = {
		provider: {
			id: "cline",
			name: "cline",
			defaultModelId: model.id,
			models: [model],
		},
		model,
		config,
	} as unknown as GatewayProviderContext;
	const provider = await createClineProvider(config);
	const events: AgentModelEvent[] = [];
	for await (const event of await provider.stream(
		{
			providerId: "cline",
			modelId: model.id,
			messages: [
				{
					id: "msg_user",
					role: "user",
					content: [{ type: "text", text: "hi" }],
					createdAt: new Date(),
				},
			],
			tools: [],
			...request,
		} as unknown as GatewayStreamRequest,
		context,
	)) {
		events.push(event);
	}
	return events.filter(
		(event): event is Extract<AgentModelEvent, { type: "usage" }> =>
			event.type === "usage",
	);
}

describe("AI SDK usage reporting", () => {
	it("keeps the provider-reported cost from the streamed usage", async () => {
		const usage = await streamUsage((async () =>
			sse(
				textTurn("hello", {
					prompt_tokens: 1000,
					completion_tokens: 100,
					cost: 0.5,
				}),
			)) as typeof fetch);

		expect(usage).toHaveLength(1);
		expect(usage[0]?.usage).toMatchObject({
			inputTokens: 1000,
			outputTokens: 100,
			totalCost: 0.5,
		});
	});

	it("keeps cache writes that only the raw provider usage reports", async () => {
		const usage = await streamUsage((async () =>
			sse(
				textTurn("hello", {
					prompt_tokens: 1000,
					completion_tokens: 100,
					prompt_tokens_details: { cached_tokens: 200, cache_write_tokens: 50 },
				}),
			)) as typeof fetch);

		expect(usage[0]?.usage).toMatchObject({
			cacheReadTokens: 200,
			cacheWriteTokens: 50,
		});
	});

	it("sums usage and provider cost across client-executed web_search steps", async () => {
		let chatCalls = 0;
		const usage = await streamUsage(
			(async (input: RequestInfo | URL) => {
				if (String(input).endsWith("/search/websearch")) {
					return Response.json({ data: { results: [] } });
				}
				chatCalls++;
				return sse(
					chatCalls === 1
						? webSearchTurn({
								prompt_tokens: 1000,
								completion_tokens: 50,
								cost: 0.25,
							})
						: textTurn("done", {
								prompt_tokens: 2000,
								completion_tokens: 100,
								cost: 0.5,
							}),
				);
			}) as typeof fetch,
			{ modelTools: [{ name: "web_search" }] },
		);

		expect(chatCalls).toBe(2);
		expect(usage).toHaveLength(1);
		expect(usage[0]?.usage).toMatchObject({
			inputTokens: 3000,
			outputTokens: 150,
			totalCost: 0.75,
		});
	});
});
