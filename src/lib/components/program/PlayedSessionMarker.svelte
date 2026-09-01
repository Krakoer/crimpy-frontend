<script lang="ts">
	import type { SessionResponse } from '$lib/api/client';
	import Icon from '$lib/components/Icon.svelte';
	import { awaitsCoachReply, formatSessionDateShort } from '$lib/sessions';

	interface Props {
		// Every run played from the prescribed row this marker sits on, oldest
		// first. A frequency session is played as many times as it was asked for,
		// so the count is part of what the marker says.
		played: SessionResponse[];
		onOpen: (session: SessionResponse) => void;
	}

	let { played, onOpen }: Props = $props();

	const latest = $derived(played[played.length - 1]);
	const needsReply = $derived(played.some(awaitsCoachReply));

	const title = $derived(
		[
			`Played ${played.map((session) => formatSessionDateShort(session.date)).join(', ')}.`,
			needsReply ? 'The athlete is waiting for an answer.' : null,
			'Open the last run.'
		]
			.filter(Boolean)
			.join(' ')
	);
</script>

<!-- dnd-kit marks the sortable wrapper this sits in role="button" aria-disabled
	while the program is read only, and the wrapper drops its pointer events with
	it, which would take the marker down too. Both are stated back here: the row
	cannot be dragged then, but the run it points at is exactly what a coach
	reading the program came for. -->
<button
	onclick={() => onOpen(latest)}
	onpointerdown={(e) => e.stopPropagation()}
	{title}
	aria-label={title}
	aria-disabled="false"
	style="
		display: flex; align-items: center; gap: 2px; flex-shrink: 0;
		pointer-events: auto; position: relative;
		padding: 0 3px; height: 16px; border-radius: 3px;
		border: none; background: none; cursor: pointer; font-family: var(--font);
		font-size: 9px; font-weight: 700; color: {needsReply ? 'var(--pr)' : 'var(--gn)'};
	"
	onmouseenter={(e) => (e.currentTarget.style.background = 'rgba(0,0,0,0.06)')}
	onmouseleave={(e) => (e.currentTarget.style.background = 'none')}
>
	<Icon name={needsReply ? 'message' : 'check'} size={10} color="currentColor" />
	{#if played.length > 1}
		{played.length}
	{/if}
</button>
