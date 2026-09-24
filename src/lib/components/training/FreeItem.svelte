<script lang="ts">
	import type { TrainingItem } from '$lib/api/client';
	import { getContext } from 'svelte';
	import { COLLAPSE_KEY } from './collapse-context';
	import { OVERRIDE_KEY, type OverrideMode } from './override-context';
	import Icon from '$lib/components/Icon.svelte';
	import { BLOCK_PRESENTATION } from '$lib/block-presentation';

	interface Props {
		item: TrainingItem;
		onRemove: () => void;
		onDuplicate: () => void;
	}

	let { item = $bindable(), onRemove, onDuplicate }: Props = $props();

	// A program week changes what a block prescribes, and a note prescribes
	// nothing: the text belongs to the training and reads the same in every week
	// it is scheduled in, so it is read there rather than edited.
	const overriding = getContext<OverrideMode | undefined>(OVERRIDE_KEY) !== undefined;

	const NOTE_COLOR = BLOCK_PRESENTATION.free.color;

	// Said out loud rather than left to the missing textarea, the way a group
	// says it about its title.
	const TEXT_FIXED_REASON = 'The note belongs to the training and is the same in every week';

	let collapsed = $state(false);
	let confirmDelete = $state(false);

	// What the card shows of the note once it is closed. The spreadsheet these
	// come from holds paragraphs, so a closed card shows the opening of the text
	// rather than all of it.
	let summary = $derived((item.free_text ?? '').trim().split('\n')[0]);

	const collapseSignals = getContext<{ collapse: number; expand: number } | undefined>(
		COLLAPSE_KEY
	);

	$effect(() => {
		if (collapseSignals?.collapse) collapsed = true;
	});

	$effect(() => {
		if (collapseSignals?.expand) collapsed = false;
	});
</script>

<div
	style="background: #fff; border-radius: var(--rl); border: 1px solid var(--bd); box-shadow: var(--sh); overflow: hidden;"
>
	<div
		style="display: flex; align-items: center; gap: 8px; padding: 8px 14px; cursor: pointer; background: {collapsed
			? '#fff'
			: 'var(--panel2)'};"
		onclick={() => {
			if (!confirmDelete) collapsed = !collapsed;
		}}
		role="button"
		tabindex="0"
		onkeydown={(e) => e.key === 'Enter' && !confirmDelete && (collapsed = !collapsed)}
	>
		<div
			style="width: 4px; height: 20px; background: {NOTE_COLOR}; border-radius: 2px; flex-shrink: 0;"
		></div>
		<div
			style="transform: {collapsed
				? 'rotate(0deg)'
				: 'rotate(90deg)'}; transition: transform 0.15s; flex-shrink: 0;"
		>
			<Icon name="chevron" size={12} color="var(--tx3)" />
		</div>
		<span
			style="font-size: 13px; font-weight: 700; color: var(--tx); flex: 1; display: flex; align-items: center; gap: 8px; min-width: 0; overflow: hidden;"
		>
			Note
			{#if collapsed && summary}
				<span
					style="font-size: 11px; color: var(--tx3-sm); font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"
					>{summary}</span
				>
			{/if}
		</span>
		{#if !overriding}
			<div
				style="display: flex; gap: 3px; flex-shrink: 0;"
				onclick={(e) => e.stopPropagation()}
				role="none"
			>
				{#if confirmDelete}
					<button
						onclick={onRemove}
						style="padding: 3px 8px; border-radius: 4px; border: 1px solid var(--rd); background: #fff; color: var(--rd-tx); font-size: 11px; font-weight: 600; cursor: pointer; font-family: var(--font);"
						>Delete</button
					>
					<button
						onclick={() => (confirmDelete = false)}
						style="padding: 3px 8px; border-radius: 4px; border: 1px solid var(--bd); background: #fff; color: var(--tx3-sm); font-size: 11px; cursor: pointer; font-family: var(--font);"
						>Cancel</button
					>
				{:else}
					<button
						onclick={onDuplicate}
						title="Duplicate"
						style="width: 24px; height: 24px; border-radius: 4px; border: 1px solid var(--bd); background: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center;"
					>
						<Icon name="copy" size={11} color="var(--tx3)" />
					</button>
					<button
						onclick={() => (confirmDelete = true)}
						title="Delete"
						style="width: 24px; height: 24px; border-radius: 4px; border: 1px solid var(--bd); background: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center;"
					>
						<Icon name="trash" size={11} color="var(--tx3)" />
					</button>
				{/if}
			</div>
		{/if}
	</div>

	{#if !collapsed}
		<div style="border-top: 1px solid var(--bd2); padding: 12px 14px;">
			{#if overriding}
				<div style="display: flex; flex-direction: column; gap: 4px;" title={TEXT_FIXED_REASON}>
					<span
						style="font-size: 10px; color: var(--tx3-sm); font-weight: 600; letter-spacing: 0.04em;"
						>FIXED BY THE TRAINING</span
					>
					{#if item.free_text?.trim()}
						<p
							style="margin: 0; font-size: 13px; line-height: 1.5; color: var(--tx); white-space: pre-wrap; overflow-wrap: anywhere;"
						>
							{item.free_text}
						</p>
					{:else}
						<p style="margin: 0; font-size: 13px; color: var(--tx3-sm);">No text</p>
					{/if}
				</div>
			{:else}
				<textarea
					bind:value={item.free_text}
					aria-label="Note text"
					rows="3"
					placeholder="What the athlete reads and confirms (e.g. kilter volume, 40 degrees, ramp up from 6a, aim for 20 problems in 2h)"
					style="width: 100%; resize: vertical; min-height: 60px; padding: 8px 10px; border: 1px solid var(--bd); border-radius: 5px; font-family: var(--font); font-size: 13px; line-height: 1.5; color: var(--tx); outline: none; background: #fff;"
				></textarea>
			{/if}
		</div>
	{/if}
</div>
