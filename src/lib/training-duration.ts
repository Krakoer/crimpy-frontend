import type { TrainingItem } from '$lib/api/client';

// How long a training runs, counted the way the app counts it when it lays the
// training out for the run screen (crimpy-app lib/utils/training_expander.dart,
// trainingDurationSeconds), so the portal and the athlete's list card agree.
//
// Only the clock is counted: timed work, rests and what an emom leaves of its
// interval. A self paced step (reps, a note to read) counts for nothing, so a
// training that mixes the two is an estimate on both sides alike.
//
// A duration the coach set as a percentage of an assessment is read here the
// way the app reads it outside any athlete's results: as the fallback the coach
// entered beside it. The portal reads a training from the coach's library, which
// belongs to no athlete.

type StepKind = 'timed' | 'self-paced' | 'rest' | 'interval-rest';

interface Step {
	kind: StepKind;
	seconds: number;
}

const selfPaced: Step = { kind: 'self-paced', seconds: 0 };

// A rest, which a circuit's own rest can stand in for. An emom's interval rest
// is one too: the app models it as a kind of rest.
function isRest(step: Step): boolean {
	return step.kind === 'rest' || step.kind === 'interval-rest';
}

// The timed length of an exercise or a note, or null when it is self paced.
// A duration read against an assessment wins over a plain one, the way the app
// resolves it, and falls back to the number the coach entered beside it. The
// app drops a target that names no assessment or no percentage, so the plain
// duration applies then.
function effectiveDuration(item: TrainingItem): number | null {
	const target = item.variable_targets?.duration;
	if (target?.assessment_id && typeof target.percent === 'number') {
		const resolved = Math.round(target.fallback ?? 0);
		return resolved > 0 ? resolved : null;
	}
	const duration = item.duration ?? 0;
	return duration > 0 ? duration : null;
}

function expandItem(item: TrainingItem, out: Step[]): void {
	switch (item.type) {
		case 'repeater':
			return expandRepeater(item, out);
		case 'hangboard_rep':
			return expandHangboardRep(item, out);
		case 'circuit':
			return expandCircuit(item, out);
		case 'emom':
			return expandEmom(item, out);
		case 'group':
			for (const child of item.items ?? []) expandItem(child, out);
			return;
		case 'exercise':
			return expandExercise(item, out);
		case 'free':
			return expandFree(item, out);
	}
}

function pushRest(out: Step[], seconds: number): void {
	if (seconds > 0) out.push({ kind: 'rest', seconds });
}

function expandCircuit(item: TrainingItem, out: Step[]): void {
	const cycles = item.cycles ?? 1;
	const cycleRest = item.cycle_rest_seconds ?? 0;
	const childRest = item.rest_seconds ?? 0;
	const children = item.items ?? [];
	for (let cycle = 0; cycle < cycles; cycle++) {
		children.forEach((child, index) => {
			const lengthBeforeChild = out.length;
			expandItem(child, out);
			const isLastChild = index === children.length - 1;
			const rest = isLastChild ? (cycle < cycles - 1 ? cycleRest : 0) : childRest;
			if (rest <= 0) return;
			// The circuit's rest stands for the whole gap it names, so the rest
			// the child ends on gives way to it rather than the two adding up.
			const childEndsOnRest = out.length > lengthBeforeChild && isRest(out[out.length - 1]);
			if (childEndsOnRest) out.pop();
			out.push({ kind: 'rest', seconds: rest });
		});
	}
}

// Every round runs its items back to back, then rests for whatever is left of
// the interval, so the next round starts on the clock.
function expandEmom(item: TrainingItem, out: Step[]): void {
	const rounds = item.cycles ?? 1;
	const interval = item.interval_seconds ?? 60;
	for (let round = 0; round < rounds; round++) {
		const lengthBeforeRound = out.length;
		for (const child of item.items ?? []) expandItem(child, out);
		const worked = sumSeconds(out.slice(lengthBeforeRound));
		const left = Math.min(Math.max(interval - worked, 0), interval);
		out.push({ kind: 'interval-rest', seconds: left });
	}
}

function expandExercise(item: TrainingItem, out: Step[]): void {
	const duration = effectiveDuration(item);
	out.push(duration === null ? selfPaced : { kind: 'timed', seconds: duration });
	pushRest(out, item.rest_seconds ?? 0);
}

function expandFree(item: TrainingItem, out: Step[]): void {
	const duration = effectiveDuration(item);
	out.push(duration === null ? selfPaced : { kind: 'timed', seconds: duration });
}

function expandHangboardRep(item: TrainingItem, out: Step[]): void {
	out.push({ kind: 'timed', seconds: item.worktime_seconds ?? 7 });
	pushRest(out, item.rest_seconds ?? 3);
}

function expandRepeater(item: TrainingItem, out: Step[]): void {
	const cycles = item.cycles ?? 1;
	const repsPerCycle = item.reps ?? 1;
	const worktime = item.worktime_seconds ?? 7;
	const resttime = item.rest_seconds ?? 3;
	const cycleRest = item.cycle_rest_seconds ?? 0;
	const hang: Step = { kind: 'timed', seconds: worktime };

	switch (item.hand ?? 'both') {
		case 'split': {
			// The cycle rest covers both hands plus the gap between them, so a
			// short one can leave nothing to split.
			const setDuration = repsPerCycle * worktime + (repsPerCycle - 1) * resttime;
			const restBetweenHands = Math.floor((cycleRest - setDuration) / 2);
			for (let cycle = 0; cycle < cycles; cycle++) {
				for (const side of ['right', 'left']) {
					for (let rep = 0; rep < repsPerCycle; rep++) {
						out.push(hang);
						if (rep < repsPerCycle - 1) pushRest(out, resttime);
					}
					const lastHandOfLastCycle = side === 'left' && cycle === cycles - 1;
					if (!lastHandOfLastCycle) pushRest(out, restBetweenHands);
				}
			}
			return;
		}
		case 'alternate':
			for (let cycle = 0; cycle < cycles; cycle++) {
				for (let rep = 0; rep < repsPerCycle; rep++) {
					out.push(hang);
					pushRest(out, resttime);
					out.push(hang);
					if (rep < repsPerCycle - 1) pushRest(out, resttime);
				}
				if (cycle < cycles - 1) pushRest(out, cycleRest);
			}
			return;
		default:
			for (let cycle = 0; cycle < cycles; cycle++) {
				for (let rep = 0; rep < repsPerCycle; rep++) {
					out.push(hang);
					if (rep < repsPerCycle - 1) pushRest(out, resttime);
				}
				if (cycle < cycles - 1) pushRest(out, cycleRest);
			}
	}
}

function sumSeconds(steps: Step[]): number {
	return steps.reduce((sum, step) => sum + step.seconds, 0);
}

/** Total timed length of a training, in seconds, as the app counts it. */
export function trainingDurationSeconds(items: TrainingItem[]): number {
	const out: Step[] = [];
	for (const item of items) expandItem(item, out);
	return sumSeconds(out);
}

function hoursAndMinutes(totalMinutes: number): string {
	const hours = Math.floor(totalMinutes / 60);
	const minutes = totalMinutes % 60;
	if (hours === 0) return `${minutes} min`;
	if (minutes === 0) return `${hours} h`;
	return `${hours} h ${minutes} min`;
}

/**
 * A length read at a glance, to the nearest minute, in the words the app uses
 * for one (crimpy-app formatLength): "25 min", "1 h", "1 h 30 min". Under a
 * minute it keeps its seconds, "45s", so a short training does not read as
 * nothing.
 */
export function formatLength(seconds: number): string {
	const total = Math.max(0, Math.trunc(seconds));
	if (total > 0 && total < 60) return `${total}s`;
	return hoursAndMinutes(Math.round(total / 60));
}
