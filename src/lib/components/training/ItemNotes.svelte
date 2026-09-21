<script lang="ts">
	import { untrack } from 'svelte';
	import type { TrainingItem } from '$lib/api/client';
	import GhostAddButton from './GhostAddButton.svelte';
	import ItemComment from './ItemComment.svelte';
	import ItemGoal from './ItemGoal.svelte';
	import ItemProtocol from './ItemProtocol.svelte';

	interface Props {
		item: TrainingItem;
		overriding: boolean;
	}

	let { item, overriding }: Props = $props();

	type NoteField = 'goal' | 'protocol' | 'comment';

	// Three always-open prose fields added about 260px to every card, most of it
	// empty on most blocks, which is what pushed the drag handles into dnd-kit's
	// autoscroll band. An empty one is a button until it is asked for.
	//
	// A field opens because the block already carries text in it or because the
	// coach pressed its button, and then it stays open for as long as the card
	// is. Reading the text instead would take the field away mid edit, the moment
	// a coach rewriting a note deletes its last character.
	let opened = $state(
		untrack(() => ({
			goal: !!item.goal?.trim(),
			protocol: !!item.protocol?.trim(),
			comment: !!item.comment?.trim()
		}))
	);

	// The field the coach has just asked for, which is the one the caret belongs
	// in. A field opened because the block came with text takes no focus.
	let asked = $state<NoteField | null>(null);

	function open(field: NoteField) {
		opened[field] = true;
		asked = field;
	}

	// A program week reads the notes rather than edits them, so there is nothing
	// to open there: the fields carrying text are drawn, the rest are not, and a
	// block with no prose at all renders nothing and takes no room in the card.
	const showsGoal = $derived(overriding ? !!item.goal?.trim() : opened.goal);
	const showsProtocol = $derived(overriding ? !!item.protocol?.trim() : opened.protocol);
	const showsComment = $derived(overriding ? !!item.comment?.trim() : opened.comment);
	const showsSomething = $derived(!overriding || showsGoal || showsProtocol || showsComment);

	const offers = $derived(
		[
			{ field: 'goal' as const, label: 'Add a goal', shown: showsGoal },
			{ field: 'protocol' as const, label: 'Add a protocol', shown: showsProtocol },
			{ field: 'comment' as const, label: 'Add a comment', shown: showsComment }
		].filter((offer) => !offer.shown)
	);
</script>

{#if showsSomething}
	<div
		style="flex-basis: 100%; width: 100%; display: flex; flex-direction: column; gap: 14px; min-width: 0;"
	>
		{#if showsGoal}
			<ItemGoal {item} {overriding} focusOnMount={asked === 'goal'} />
		{/if}

		{#if showsProtocol}
			<ItemProtocol {item} {overriding} focusOnMount={asked === 'protocol'} />
		{/if}

		{#if showsComment}
			<ItemComment {item} {overriding} focusOnMount={asked === 'comment'} />
		{/if}

		{#if !overriding && offers.length > 0}
			<div style="display: flex; flex-wrap: wrap; gap: 6px;">
				{#each offers as offer (offer.field)}
					<GhostAddButton label={offer.label} onAdd={() => open(offer.field)} />
				{/each}
			</div>
		{/if}
	</div>
{/if}
