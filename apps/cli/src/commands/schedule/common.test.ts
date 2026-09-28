import { Command } from "commander";
import { describe, expect, it } from "vitest";
import {
	addAutonomousOptions,
	hasMetadataPatchOpts,
	mergeScheduleAutonomousMetadata,
	mergeScheduleMetadata,
} from "./common";

function parseAutonomousArgs(argv: string[]): Record<string, unknown> {
	const cmd = addAutonomousOptions(new Command("update"));
	cmd.parse(argv, { from: "user" });
	return cmd.opts();
}

describe("schedule autonomous options", () => {
	it("treats an explicit autonomous flag as a metadata patch", () => {
		expect(hasMetadataPatchOpts({ autonomous: false })).toBe(true);
		expect(hasMetadataPatchOpts({ autonomous: true })).toBe(true);
		expect(hasMetadataPatchOpts({ noAutonomous: true })).toBe(true);
		expect(hasMetadataPatchOpts({})).toBe(false);
	});

	it("disables autonomous mode when autonomous is false", () => {
		expect(
			mergeScheduleAutonomousMetadata(
				{ autonomous: { enabled: true, idleTimeoutSeconds: 30 } },
				{ autonomous: false },
			),
		).toEqual({ autonomous: { enabled: false, idleTimeoutSeconds: 30 } });
	});

	it("still disables autonomous mode when noAutonomous is set", () => {
		expect(
			mergeScheduleAutonomousMetadata(
				{ autonomous: { enabled: true } },
				{ noAutonomous: true },
			),
		).toEqual({ autonomous: { enabled: false } });
	});

	it("enables autonomous mode when autonomous is true", () => {
		expect(
			mergeScheduleAutonomousMetadata(
				{ autonomous: { enabled: false } },
				{ autonomous: true },
			),
		).toEqual({ autonomous: { enabled: true } });
	});

	it("disables autonomous mode from parsed --no-autonomous argv", () => {
		const opts = parseAutonomousArgs(["--no-autonomous"]);

		expect(opts.autonomous).toBe(false);
		expect(opts.noAutonomous).toBeUndefined();
		expect(hasMetadataPatchOpts(opts)).toBe(true);
		expect(
			mergeScheduleMetadata({ autonomous: { enabled: true } }, opts),
		).toEqual({ autonomous: { enabled: false } });
	});

	it("enables autonomous mode from parsed --autonomous argv", () => {
		const opts = parseAutonomousArgs(["--autonomous"]);

		expect(opts.autonomous).toBe(true);
		expect(hasMetadataPatchOpts(opts)).toBe(true);
		expect(mergeScheduleMetadata(undefined, opts)).toEqual({
			autonomous: { enabled: true },
		});
	});

	it("leaves metadata untouched when no autonomous flag is passed", () => {
		const opts = parseAutonomousArgs([]);
		const base = { autonomous: { enabled: true } };

		expect(opts.autonomous).toBeUndefined();
		expect(hasMetadataPatchOpts(opts)).toBe(false);
		expect(mergeScheduleMetadata(base, opts)).toBe(base);
	});
});
