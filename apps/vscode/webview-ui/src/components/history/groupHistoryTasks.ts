export type SortOption = "newest" | "oldest" | "mostExpensive" | "mostTokens" | "mostRelevant"

export interface HistoryGroup<T> {
	tasks: T[]
	label: string
}

export interface GroupedHistoryTasks<T> {
	groupedTasks: T[]
	groupCounts: number[]
	groupLabels: string[]
	groups: HistoryGroup<T>[]
}

export const isToday = (timestamp: number): boolean => {
	const date = new Date(timestamp)
	const today = new Date()
	return today.toDateString() === date.toDateString()
}

export function groupHistoryTasks<T extends { ts: number }>(
	tasks: T[],
	sortOption: SortOption | string = "newest",
): GroupedHistoryTasks<T> {
	const isDateSort = sortOption === "newest" || sortOption === "oldest"

	if (!isDateSort) {
		// No grouping for non-date sorts
		return {
			groupedTasks: tasks,
			groupCounts: [tasks.length],
			groupLabels: [],
			groups: [],
		}
	}

	const todayTasks: T[] = []
	const olderTasks: T[] = []

	tasks.forEach((task) => {
		if (isToday(task.ts)) {
			todayTasks.push(task)
		} else {
			olderTasks.push(task)
		}
	})

	const groups: HistoryGroup<T>[] = []
	if (sortOption === "oldest") {
		if (olderTasks.length > 0) {
			groups.push({ tasks: olderTasks, label: "Older" })
		}
		if (todayTasks.length > 0) {
			groups.push({ tasks: todayTasks, label: "Today" })
		}
	} else {
		if (todayTasks.length > 0) {
			groups.push({ tasks: todayTasks, label: "Today" })
		}
		if (olderTasks.length > 0) {
			groups.push({ tasks: olderTasks, label: "Older" })
		}
	}

	return {
		groupedTasks: groups.flatMap((g) => g.tasks),
		groupCounts: groups.map((g) => g.tasks.length),
		groupLabels: groups.map((g) => g.label),
		groups,
	}
}
