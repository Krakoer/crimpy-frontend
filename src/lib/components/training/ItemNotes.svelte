<script lang="ts">
	import type { TrainingItem } from '$lib/api/client';
	import Icon from '$lib/components/Icon.svelte';
	import ItemComment from './ItemComment.svelte';
	import ItemGoal from './ItemGoal.svelte';
	import ItemProtocol from './ItemProtocol.svelte';

	interface Props {
		item: TrainingItem;
		overriding: boolean;
	}

	let { item, overriding }: Props = $props();

	// Three always-open prose fields added about 260px to every card, most of it
	// empty on most blocks, which is what pushed the drag handles off the screen.
	// A field the coach has written in is always open, so nothing a block carries
	// can hide behind the affordance; an empty one is a button until it is asked
	// for.
	let opened = $state({ goal: false, protocol: false, comment: false });

	const showsGoal = $derived(opened.goal || !!item.goal?.trim());
	const showsProtocol = $derived(opened.protocol || !!item.protocol?.trim());
	const showsComment = $derived(opened.comment || !!item.comment?.trim());

	// A program week reads the notes rather than edits them, so a block with no
	// prose has nothing to render there and takes no room in the card.
	const showsSomething = $derived(!overriding || showsGoal || showsProtocol || showsComment);

	const offers = $derived(
		[
			{ field: 'goal' as const, label: 'Add a goal', hidden: showsGoal },
			{ field: 'protocol' as const, label: 'Add a protocol', hidden: showsProtocol },
			{ field: 'comment' as const, label: 'Add a comment', hidden: showsComment }
		].filter((offer) => !offer.hidden)
	);
</script>

{#if showsSomething}
	<div
		style="flex-basis: 100%; width: 100%; display: flex; flex-direction: column; gap: 14px; min-width: 0;"
	>
		{#if showsGoal}
			<ItemGoal {item} {overriding} focusOnMount={opened.goal} />
		{/if}

		{#if showsProtocol}
			<ItemProtocol {item} {overriding} focusOnMount={opened.protocol} />
		{/if}

		{#if showsComment}
			<ItemComment {item} {overriding} focusOnMount={opened.comment} />
		{/if}

		{#if !overriding && offers.length > 0}
			<div style="display: flex; flex-wrap: wrap; gap: 6px;">
				{#each offers as offer (offer.field)}
					<button
						onclick={(e) => {
							e.stopPropagation();
							opened[offer.field] = true;
						}}
						style="
						display: flex; align-items: center; gap: 5px;
						padding: 5px 10px; border-radius: var(--rs);
						border: 1px dashed var(--bd); background: transparent;
						color: var(--tx3); cursor: pointer;
						font-family: var(--font); font-size: 11px; font-weight: 600;
					"
					>
						<Icon name="plus" size={11} color="currentColor" />
						{offer.label}
					</button>
				{/each}
			</div>
		{/if}
	</div>
{/if}
