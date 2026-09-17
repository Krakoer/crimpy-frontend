<script lang="ts">
	import { WEEK_NAME_MAX_LENGTH } from '$lib/program-draft';

	interface Props {
		// The week this phase belongs to, for the field's accessible name: a
		// program page carries one of these per week, so "phase" alone would
		// name fourteen of them the same.
		weekNumber: number;
		// The phase the week is in, bound so the field writes straight into the
		// week draft the save reads.
		name: string;
		editMode: boolean;
	}

	let { weekNumber, name = $bindable(), editMode }: Props = $props();
</script>

<!--
	The phase sits under the week number in the week header and shows on a
	collapsed row as well: reading the arc of the program down this column is
	what the name is for. It takes a line of its own rather than the room left
	beside the number, because the phases a coach writes are "max strength,
	3 week block" and not one word.

	data-phase-field is read by the week header, which suppresses its own toggle
	for a click whose gesture began in here. Renaming it means changing
	startedInPhaseField in the program page.
-->
{#if editMode}
	<div data-phase-field style="display: flex; align-items: center; padding-left: 18px;">
		<input
			value={name}
			onclick={(e) => e.stopPropagation()}
			oninput={(e) => (name = e.currentTarget.value)}
			maxlength={WEEK_NAME_MAX_LENGTH}
			placeholder="Phase..."
			aria-label="Week {weekNumber} phase"
			style="
				flex: 1; min-width: 0; border: none; outline: none; background: transparent;
				font-family: var(--font); font-size: 11px; color: var(--tx2);
				font-style: {name ? 'normal' : 'italic'};
			"
		/>
	</div>
{:else if name}
	<div
		title={name}
		style="padding-left: 18px; font-size: 11px; color: var(--tx2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"
	>
		{name}
	</div>
{/if}
