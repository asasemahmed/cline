import { describe, expect, it } from "vitest"
import { getCodeFence } from "../codeFence"

describe("getCodeFence", () => {
	it("returns three backticks when the content has no backticks", () => {
		expect(getCodeFence("echo hello")).toBe("```")
	})

	it("returns three backticks for empty or missing content", () => {
		expect(getCodeFence("")).toBe("```")
		expect(getCodeFence(undefined)).toBe("```")
	})

	it("returns four backticks when the content contains a line of three", () => {
		expect(getCodeFence("# Title\n```bash\nnpm install\n```\n")).toBe("````")
	})

	it("returns five backticks when the content contains a run of four", () => {
		expect(getCodeFence("````md\n```js\n```\n````")).toBe("`````")
	})

	it("keeps three backticks for shorter inline runs", () => {
		expect(getCodeFence("run `npm test` or ``a`b``")).toBe("```")
	})
})
