<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';

	interface Props {
		// Named for the week rather than the session, since that is what a coach
		// is choosing between when the same training sits in several of them.
		weekNumber: number;
		customised: boolean;
		// One of the things this week asks of the training stopped applying, which
		// is only visible from the grid if the card says so.
		stale: boolean;
		onOpen: () => void;
	}

	let { weekNumber, customised, stale, onOpen }: Props = $props();
</script>

<!-- The whole card opens what the week asks of its training, through a cover
	rather than a control in the row: a day cell is narrow enough that anything in
	flow squeezes the training title out of it entirely.

	It is a div, not a button, because dnd-kit refuses to start a drag from inside
	a button and this covers the card a coach grabs. A press that does not travel
	stays under the eight pixels the sensor needs and opens the parameters, one
	that travels drags the session. The badges beside it are positioned, so they
	are painted over the cover and keep their own clicks.

	It carries no title of its own, so the card's own tooltip, which is how a coach
	reads a name clamped to two lines in a narrow cell, still comes through.

	dnd-kit marks the sortable this covers aria-disabled while the program is read
	only, which reads down onto everything inside it, so the cover states its own
	answer back, as PlayedSessionMarker does: the row cannot be dragged then, but
	what the week asks of the training is exactly what a coach reading the program
	came for, and it opens read only. -->
<div
	role="button"
	tabindex="0"
	onclick={onOpen}
	onkeydown={(e) => {
		if (e.key !== 'Enter' && e.key !== ' ') return;
		e.preventDefault();
		onOpen();
	}}
	aria-label="{customised ? 'Customised training' : 'Training'} parameters, week {weekNumber}{stale
		? ', a change stopped applying'
		: ''}"
	aria-disabled="false"
	style="position: absolute; inset: 0; cursor: pointer;"
></div>
{#if stale || customised}
	<!-- Painted over the cover so it is not dimmed by it, and deaf to the pointer
		so the middle of the card still opens the parameters.

		A session whose override stopped applying is a customised one, and a day
		cell is narrow enough that a second badge would take the training title
		with it, so the warning stands in for the gear rather than beside it. The
		cover says the same thing in its label, since a badge deaf to the pointer
		carries no tooltip of its own. -->
	<div style="display: flex; flex-shrink: 0; position: relative; pointer-events: none;">
		{#if stale}
			<Icon name="alert" size={10} color="var(--gd)" />
		{:else}
			<Icon name="settings" size={9} color="var(--pr)" />
		{/if}
	</div>
{/if}
