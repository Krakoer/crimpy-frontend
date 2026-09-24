<script lang="ts">
	import { getContext } from 'svelte';
	import {
		ITEM_RESULTS_KEY,
		achievedNotes,
		needsPassLabels,
		type ItemResultsByItem
	} from './results-context';

	interface Props {
		// The prescription item the notes were written against.
		itemId: string | undefined;
		// The card padding the block lays itself out with. A card body that is
		// already padded, such as the hangboard one, passes null; the whole block
		// disappears with the notes either way, which is why the padding lives
		// here rather than on a wrapper the caller would leave behind empty.
		inset?: string | null;
	}

	let { itemId, inset = '0 18px 12px' }: Props = $props();

	// Read off the context rather than taken as a prop, so an item view drops
	// this in without the lists and containers above it carrying results down.
	// Absent in the training editor, where there is no run to have annotated.
	const results = getContext<ItemResultsByItem | undefined>(ITEM_RESULTS_KEY);
	let notes = $derived(achievedNotes(results, itemId));

	// Named by pass only when the order no longer says which is which: an
	// athlete who wrote on the first and the fourth set would otherwise read as
	// having written on the first two.
	let labelled = $derived(needsPassLabels(notes));
</script>

{#if notes.length > 0}
	<div
		data-testid="achieved-notes"
		style="display: flex; flex-direction: column; gap: 6px;{inset ? ` padding: ${inset};` : ''}"
	>
		<div
			style="font-size: 10.5px; color: var(--tx3-sm); font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase;"
		>
			What the athlete said
		</div>
		{#each notes as entry (entry.occurrence)}
			<div
				style="
					padding: 8px 12px; background: var(--panel2);
					border-left: 3px solid var(--gd);
					border-radius: 0 var(--rs) var(--rs) 0;
				"
			>
				{#if labelled}
					<span
						style="font-size: 10px; color: var(--tx3-sm); font-weight: 700; letter-spacing: 0.04em; margin-right: 6px;"
						>#{entry.occurrence + 1}</span
					>
				{/if}
				<span
					style="font-size: 12px; line-height: 1.5; color: var(--tx2); white-space: pre-wrap; overflow-wrap: anywhere;"
					>{entry.note}</span
				>
			</div>
		{/each}
	</div>
{/if}
