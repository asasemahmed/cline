/**
 * Returns a backtick fence longer than any backtick run in the content, so a
 * line of three backticks inside the content cannot close the fence early.
 */
export function getCodeFence(content?: string): string {
	let longestBacktickRun = 0
	for (const match of (content ?? "").matchAll(/`+/g)) {
		longestBacktickRun = Math.max(longestBacktickRun, match[0].length)
	}
	return "`".repeat(Math.max(3, longestBacktickRun + 1))
}
