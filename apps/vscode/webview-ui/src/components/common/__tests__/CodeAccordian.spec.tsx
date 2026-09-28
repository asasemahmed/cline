import { render } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import CodeAccordian from "../CodeAccordian"

vi.mock("@/components/common/CodeBlock", () => ({
	default: ({ source }: { source: string }) => <pre>{source}</pre>,
}))

describe("CodeAccordian", () => {
	it("uses a longer fence when the code contains a three-backtick line", () => {
		const code = "# Usage\n\n```bash\nnpm install\n```"
		const { container } = render(<CodeAccordian code={code} isExpanded={true} onToggleExpand={vi.fn()} path="README.md" />)

		const source = container.querySelector("pre")?.textContent
		expect(source).toBe(`\`\`\`\`markdown\n${code}\n\`\`\`\``)
	})
})
