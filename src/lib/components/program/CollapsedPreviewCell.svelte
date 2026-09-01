<script lang="ts" generics="T extends DraftSession">
	import type { TrainingSummary } from '$lib/api/client';
	import type { DraftSession } from '$lib/program-draft';
	import { trainingTypeInfo } from '$lib/trainingTypes';

	interface Props {
		// The sessions of one column of a collapsed week row: a day, the
		// frequency column or the everyday column. Empty is a valid column and
		// still owes the grid a child, so the cell draws a placeholder itself.
		sessions: T[];
		trainings: TrainingSummary[];
		// The frequency column says how many times a week a session was
		// prescribed; the day and everyday columns have nothing to add to the
		// training name. Typed on the column's own session so the frequency call
		// site keeps the times_per_week the plain DraftSession leaves optional.
		prefix?: (session: T) => string;
	}

	let { sessions, trainings, prefix }: Props = $props();

	function trainingOf(id: string): TrainingSummary | undefined {
		return trainings.find((t) => t.id === id);
	}

	// A collapsed row has room for a word per session, so the pill carries the
	// first one and the title is left to the expanded form.
	function pillLabel(session: T, training: TrainingSummary | undefined): string {
		return `${prefix?.(session) ?? ''}${training?.title?.split(' ')[0] ?? '?'}`;
	}
</script>

<div
	style="padding: 4px 2px; display: flex; flex-direction: column; gap: 2px; align-items: center;"
>
	{#each sessions as session (session._id)}
		{@const training = trainingOf(session.training_id)}
		{@const info = trainingTypeInfo(training?.training_type)}
		<div
			style="
				padding: 2px 5px; border-radius: 4px;
				background: {info.tint};
				font-size: 9px; color: {info.color};
				font-weight: 600; max-width: 100%;
				overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
			"
		>
			{pillLabel(session, training)}
		</div>
	{/each}
	{#if sessions.length === 0}
		<span style="font-size: 10px; color: var(--bd);">-</span>
	{/if}
</div>
