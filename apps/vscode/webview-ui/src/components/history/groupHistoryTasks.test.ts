import { describe, expect, it } from "vitest"
import { groupHistoryTasks } from "./groupHistoryTasks"

describe("groupHistoryTasks", () => {
	const now = new Date()
	const todayTask = { id: "task-today", ts: now.getTime() }

	const lastMonthDate = new Date(now)
	lastMonthDate.setDate(now.getDate() - 35)
	const lastMonthTask = { id: "task-last-month", ts: lastMonthDate.getTime() }

	const lastYearDate = new Date(now)
	lastYearDate.setFullYear(now.getFullYear() - 1)
	const lastYearTask = { id: "task-last-year", ts: lastYearDate.getTime() }

	it('with tasks from today, last month and last year and sort "oldest", the first group is the oldest bucket', () => {
		const tasks = [lastYearTask, lastMonthTask, todayTask]
		const result = groupHistoryTasks(tasks, "oldest")

		expect(result.groupLabels).toEqual(["Older", "Today"])
		expect(result.groups[0].label).toBe("Older")
		expect(result.groups[0].tasks).toEqual([lastYearTask, lastMonthTask])
		expect(result.groups[1].label).toBe("Today")
		expect(result.groups[1].tasks).toEqual([todayTask])
		expect(result.groupedTasks).toEqual([lastYearTask, lastMonthTask, todayTask])
		expect(result.groupCounts).toEqual([2, 1])
	})

	it("with the default newest sort the order is unchanged", () => {
		const tasks = [todayTask, lastMonthTask, lastYearTask]
		const result = groupHistoryTasks(tasks, "newest")

		expect(result.groupLabels).toEqual(["Today", "Older"])
		expect(result.groups[0].label).toBe("Today")
		expect(result.groups[0].tasks).toEqual([todayTask])
		expect(result.groups[1].label).toBe("Older")
		expect(result.groups[1].tasks).toEqual([lastMonthTask, lastYearTask])
		expect(result.groupedTasks).toEqual([todayTask, lastMonthTask, lastYearTask])
		expect(result.groupCounts).toEqual([1, 2])

		// Also check when sort option defaults to newest
		const defaultResult = groupHistoryTasks(tasks)
		expect(defaultResult).toEqual(result)
	})

	it("handles only tasks from today", () => {
		const tasks = [todayTask]
		const resultOldest = groupHistoryTasks(tasks, "oldest")
		expect(resultOldest.groupLabels).toEqual(["Today"])
		expect(resultOldest.groups[0].tasks).toEqual([todayTask])

		const resultNewest = groupHistoryTasks(tasks, "newest")
		expect(resultNewest.groupLabels).toEqual(["Today"])
		expect(resultNewest.groups[0].tasks).toEqual([todayTask])
	})

	it("handles only older tasks", () => {
		const tasks = [lastYearTask, lastMonthTask]
		const resultOldest = groupHistoryTasks(tasks, "oldest")
		expect(resultOldest.groupLabels).toEqual(["Older"])
		expect(resultOldest.groups[0].tasks).toEqual([lastYearTask, lastMonthTask])

		const resultNewest = groupHistoryTasks(tasks, "newest")
		expect(resultNewest.groupLabels).toEqual(["Older"])
		expect(resultNewest.groups[0].tasks).toEqual([lastYearTask, lastMonthTask])
	})

	it("handles empty tasks list", () => {
		const result = groupHistoryTasks([], "oldest")
		expect(result.groupedTasks).toEqual([])
		expect(result.groupCounts).toEqual([])
		expect(result.groupLabels).toEqual([])
		expect(result.groups).toEqual([])
	})

	it("does not group tasks for non-date sort options", () => {
		const tasks = [todayTask, lastMonthTask]
		const result = groupHistoryTasks(tasks, "mostExpensive")

		expect(result.groupedTasks).toEqual(tasks)
		expect(result.groupCounts).toEqual([2])
		expect(result.groupLabels).toEqual([])
		expect(result.groups).toEqual([])
	})
})
