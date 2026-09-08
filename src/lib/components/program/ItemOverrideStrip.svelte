<script lang="ts">
	import { getContext } from 'svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { STALE_OVERRIDE_RESET_WARNING } from '$lib/program-overrides';
	import {
		OVERRIDE_HISTORY_KEY,
		OVERRIDE_KEY,
		type OverrideHistoryContext,
		type OverrideMode
	} from '$lib/components/training/override-context';

	interface Props {
		itemId?: string;
	}

	let { itemId }: Props = $props();

	// Both are absent outside a program week, which is what keeps the same list
	// usable in the training editor.
	const mode = getContext<OverrideMode | undefined>(OVERRIDE_KEY);
	const history = getContext<OverrideHistoryContext | undefined>(OVERRIDE_HISTORY_KEY);

	let weeks = $derived(itemId ? (history?.byItem[itemId] ?? []) : []);
	let overridden = $derived(itemId ? (mode?.isOverridden(itemId) ?? false) : false);
	let staleNotice = $derived(itemId ? (mode?.staleNotice(itemId) ?? null) : null);
	// Only worth a strip once a week has actually asked for something: an item no
	// week has ever touched would otherwise carry a row of "as written" under
	// every block of the training.
	let showsWeeks = $derived(weeks.length > 1 && weeks.some((entry) => entry.summary !== ''));
</script>

{#if itemId && mode && (showsWeeks || overridden || staleNotice)}
	<div style="display: flex; flex-direction: column; gap: 4px; padding: 6px 4px 2px 4px;">
		{#if staleNotice}
			<!-- What the week asks of this block no longer reaches the athlete, and
				the same override is what the next save is refused for, so the coach is
				told here and given the one gesture that unblocks it. -->
			<div
				data-testid="stale-override"
				style="
					display: flex; align-items: flex-start; gap: 7px;
					padding: 7px 9px; border-radius: var(--rs);
					border: 1px solid var(--gd); background: var(--gd-lt);
				"
			>
				<div style="padding-top: 1px;"><Icon name="alert" size={13} color="var(--gd)" /></div>
				<div style="flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px;">
					<span style="font-size: 11.5px; color: var(--tx2);">{staleNotice}</span>
					<!-- The reset is judged as one row, so the coach is told what else
						goes with it before they press it rather than after. -->
					<span style="font-size: 11px; color: var(--tx3);">
						{mode.readOnly ? mode.readOnlyReason : STALE_OVERRIDE_RESET_WARNING}
					</span>
				</div>
				{#if mode.locked}
					<!-- A played session refuses a change to its overrides too, so a
						control here would only promise what the save cannot do. -->
					<span
						data-testid="stale-override-blocked"
						style="font-size: 11px; font-weight: 600; color: var(--tx3); flex-shrink: 0;"
						>Cannot be cleared here</span
					>
				{:else if mode.readOnly}
					<!-- Not played, only being read: the control is one click away rather
						than out of reach, and saying it cannot be cleared here would be a
						lie the coach can disprove. -->
					<span
						data-testid="stale-override-blocked"
						style="font-size: 11px; font-weight: 600; color: var(--tx3); flex-shrink: 0;"
						>Turn Edit on to clear it</span
					>
				{:else}
					<!-- Clearing is putting the block back to the training: what the
						server refused is the whole of what this week asks of the item, and
						it stores it as one row, so there is nothing narrower to drop. -->
					<button
						onclick={() => mode.resetItem(itemId)}
						style="
							flex-shrink: 0; padding: 3px 9px; border-radius: var(--rs);
							border: 1px solid var(--gd); background: var(--panel);
							font-family: var(--font); font-size: 11px; font-weight: 700;
							color: var(--tx2); cursor: pointer;
						">Reset this block to the training</button
					>
				{/if}
			</div>
		{/if}
		<div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
			{#if showsWeeks}
				<span
					style="font-size: 10px; font-weight: 700; letter-spacing: 0.04em; color: var(--tx3); flex-shrink: 0;"
					>PER WEEK</span
				>
				{#each weeks as entry (entry.key)}
					<span
						title={entry.summary
							? `${entry.label} asks for ${entry.summary}`
							: `${entry.label} runs this as the training writes it`}
						style="
							display: inline-flex; align-items: baseline; gap: 4px;
							padding: 2px 7px; border-radius: 999px; font-size: 10.5px;
							border: 1px solid {entry.current ? 'var(--pr)' : 'var(--bd)'};
							background: {entry.current ? 'var(--pr-fog)' : 'var(--panel)'};
							color: {entry.summary ? 'var(--tx2)' : 'var(--tx3)'};
						"
					>
						<span style="font-weight: 700; color: {entry.current ? 'var(--pr)' : 'var(--tx3)'};"
							>{entry.label}</span
						>
						{entry.summary || 'as written'}
					</span>
				{/each}
			{/if}
			<div style="flex: 1;"></div>
			<!-- Reset and clear are the same act on the same block, so the notice
				above owns it while it stands rather than naming it twice. -->
			{#if overridden && !mode.readOnly && !staleNotice}
				<button
					onclick={() => mode.resetItem(itemId)}
					style="border: none; background: transparent; padding: 2px 4px; font-family: var(--font); font-size: 10.5px; font-weight: 600; color: var(--tx3); cursor: pointer;"
					>Reset to the training</button
				>
			{/if}
		</div>
	</div>
{/if}
