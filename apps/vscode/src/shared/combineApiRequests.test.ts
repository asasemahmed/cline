import { describe, it } from "bun:test"
import { strict as assert } from "node:assert"
import { combineApiRequests } from "./combineApiRequests"
import type { ClineMessage } from "./ExtensionMessage"

function started(ts: number, text: string) {
	return { ts, type: "say", say: "api_req_started", text } as ClineMessage
}

function finished(ts: number, text: string) {
	return { ts, type: "say", say: "api_req_finished", text } as ClineMessage
}

describe("combineApiRequests", () => {
	it("merges a started request with its following finished payload", () => {
		const messages: ClineMessage[] = [
			started(1, JSON.stringify({ request: "GET /api/data" })),
			finished(2, JSON.stringify({ cost: 0.005, tokensIn: 10, tokensOut: 5 })),
		]

		const combined = combineApiRequests(messages)

		assert.equal(combined.length, 1)
		assert.equal(combined[0]?.say, "api_req_started")
		assert.deepEqual(JSON.parse(combined[0]?.text ?? "{}"), {
			request: "GET /api/data",
			cost: 0.005,
			tokensIn: 10,
			tokensOut: 5,
		})
	})

	it("keeps an api_req_started without a matching finished payload", () => {
		const messages: ClineMessage[] = [started(1, JSON.stringify({ request: "A" }))]

		const combined = combineApiRequests(messages)

		assert.equal(combined.length, 1)
		assert.deepEqual(JSON.parse(combined[0]?.text ?? "{}"), { request: "A" })
	})

	it("does not throw on a malformed api_req_started payload and keeps the row", () => {
		const messages: ClineMessage[] = [
			started(1, "{not-json"),
			{ ts: 2, type: "say", say: "text", text: "hello" } as ClineMessage,
		]

		const combined = combineApiRequests(messages)

		assert.equal(combined[0]?.text, "{not-json")
		assert.equal(combined[1]?.text, "hello")
	})

	it("does not throw on a malformed api_req_finished payload", () => {
		const messages: ClineMessage[] = [started(1, JSON.stringify({ request: "A", cost: 0.1 })), finished(2, "{not-json")]

		const combined = combineApiRequests(messages)

		// Pair is still consumed; the started row survives with its own payload.
		assert.equal(combined.length, 1)
		assert.deepEqual(JSON.parse(combined[0]?.text ?? "{}"), { request: "A", cost: 0.1 })
	})

	it("leaves earlier started request unpaired when another started request appears before finished", () => {
		const messages: ClineMessage[] = [
			started(1, JSON.stringify({ request: "GET /api/first" })),
			started(2, JSON.stringify({ request: "GET /api/second" })),
			finished(3, JSON.stringify({ cost: 0.005, tokensIn: 10, tokensOut: 5 })),
		]

		const combined = combineApiRequests(messages)

		assert.equal(combined.length, 2)
		assert.equal(combined[0]?.say, "api_req_started")
		assert.equal(combined[0]?.ts, 1)
		assert.deepEqual(JSON.parse(combined[0]?.text ?? "{}"), {
			request: "GET /api/first",
		})
		assert.equal(combined[1]?.say, "api_req_started")
		assert.equal(combined[1]?.ts, 2)
		assert.deepEqual(JSON.parse(combined[1]?.text ?? "{}"), {
			request: "GET /api/second",
			cost: 0.005,
			tokensIn: 10,
			tokensOut: 5,
		})
	})

	it("leaves earlier started request unpaired when intermediate messages exist before another started request", () => {
		const messages: ClineMessage[] = [
			started(1, JSON.stringify({ request: "GET /api/first" })),
			{ ts: 2, type: "say", say: "text", text: "retrying" } as ClineMessage,
			started(3, JSON.stringify({ request: "GET /api/second" })),
			finished(4, JSON.stringify({ cost: 0.005 })),
		]

		const combined = combineApiRequests(messages)

		assert.equal(combined.length, 3)
		assert.deepEqual(JSON.parse(combined[0]?.text ?? "{}"), {
			request: "GET /api/first",
		})
		assert.equal(combined[1]?.text, "retrying")
		assert.deepEqual(JSON.parse(combined[2]?.text ?? "{}"), {
			request: "GET /api/second",
			cost: 0.005,
		})
	})
})
