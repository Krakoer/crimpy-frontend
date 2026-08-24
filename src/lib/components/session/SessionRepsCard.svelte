<script lang="ts">
	import type { RepData, SessionResponse } from '$lib/api/client';
	import {
		groupRepsByPrescriptionItem,
		onTargetCount,
		sessionPerformance,
		unmeasuredNote,
		type RepBlock
	} from '$lib/sessions';
	import SessionRepRow from '$lib/components/session/SessionRepRow.svelte';

	interface Props {
		session: SessionResponse;
		reps: RepData[];
		accent: string;
	}

	let { session, reps, accent }: Props = $props();

	const INDIVIDUAL_REPS_PREVIEW = 8;

	const workReps = $derived(reps.filter((rep) => !rep.is_rest));
	const showEdge = $derived(workReps.some((rep) => rep.edge_size_mm));

	// A rep names the block it was played from, so the card reads the run the way
	// it was performed. Null for a session played outside a training, which falls
	// back to the flat list below.
	const blocks = $derived<RepBlock[] | null>(
		groupRepsByPrescriptionItem(workReps, session.prescription)
	);

	const performance = $derived(sessionPerformance(reps, blocks));

	// A stat the session cannot state honestly across its blocks is left out
	// rather than filled with a pooled number, so the row holds three cells
	// instead of four.
	const stats = $derived(
		performance
			? [
					...(performance.avgWeight !== null
						? [{ label: 'Avg load', value: `${formatWeight(performance.avgWeight)} kg` }]
						: []),
					{ label: 'Peak load', value: `${formatWeight(performance.maxWeight)} kg` },
					{ label: 'Work time', value: `${performance.workTime}s` },
					{ label: 'Work reps', value: String(performance.workReps) }
				]
			: []
	);

	let expanded = $state(false);
	const shownReps = $derived(
		expanded ? workReps : workReps.slice(0, Math.min(INDIVIDUAL_REPS_PREVIEW, workReps.length))
	);

	// A block holding a whole repeater is as long as the flat list ever was, so
	// it earns the same cap. Blocks broken into sets keep all of them: the sets
	// are the structure the coach came for.
	const cappedBlocks = $derived(
		blocks?.some((block) => !block.sets && block.reps.length > INDIVIDUAL_REPS_PREVIEW) ?? false
	);
	function shownBlockReps(block: RepBlock): RepData[] {
		if (expanded || block.sets || block.reps.length <= INDIVIDUAL_REPS_PREVIEW) return block.reps;
		return block.reps.slice(0, INDIVIDUAL_REPS_PREVIEW);
	}

	function formatWeight(kg: number): string {
		return kg.toFixed(1);
	}

	function repsSummary(work: RepData[]): string {
		if (work.length === 0) return 'rest only';
		const avg = work.reduce((sum, rep) => sum + rep.average_weight, 0) / work.length;
		// A block can span every load of a repeater, where a set spans one. Naming
		// the first rep's target would read as the whole block's, contradicting the
		// on-target count beside it, so a varying target is left unsaid.
		const targets = new Set(work.map((rep) => rep.target_weight));
		const target = work[0].target_weight;
		if (targets.size === 1 && target > 0) {
			return `avg ${formatWeight(avg)} / ${formatWeight(target)} kg`;
		}
		return `avg ${formatWeight(avg)} kg`;
	}

	// Each block is graded on its own reps, so two blocks of different intensity
	// are no longer read through one pooled ratio. The reps a dropped sensor left
	// unmeasured are named rather than counted as misses.
	function blockOnTarget(block: RepBlock): string | null {
		const count = onTargetCount(block.reps);
		if (!count) return null;
		const unmeasured = unmeasuredNote(count);
		return `${count.onTarget}/${count.total} on target${unmeasured ? ` (${unmeasured})` : ''}`;
	}
</script>

{#if performance}
	<div
		style="background: var(--panel); border: 1px solid var(--bd); border-radius: var(--rl); box-shadow: var(--sh); overflow: hidden;"
	>
		<div
			style="display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; border-bottom: 1px solid var(--bd2);"
		>
			<h3 style="font-size: 13px; font-weight: 700; color: var(--tx);">Performance</h3>
			{#if performance.onTarget}
				{@const count = performance.onTarget}
				{@const allOnTarget = count.onTarget === count.total}
				{@const unmeasured = unmeasuredNote(count)}
				<span
					style="
						font-size: 11.5px; font-weight: 700; padding: 3px 10px; border-radius: 999px;
						color: {allOnTarget ? 'var(--gn)' : 'var(--gd)'};
						background: {allOnTarget ? 'var(--gn-lt)' : 'var(--gd-lt)'};
					">{count.onTarget}/{count.total} on target{unmeasured ? ` (${unmeasured})` : ''}</span
				>
			{/if}
		</div>

		<div
			class="grid {stats.length === 4 ? 'grid-cols-4' : 'grid-cols-3'}"
			style="border-bottom: {reps.length > 0 ? '1px solid var(--bd2)' : 'none'};"
		>
			{#each stats as stat (stat.label)}
				<div style="padding: 14px 18px;">
					<div
						style="font-size: 10.5px; color: var(--tx3); font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase;"
					>
						{stat.label}
					</div>
					<div style="font-size: 17px; font-weight: 700; color: var(--tx); margin-top: 2px;">
						{stat.value}
					</div>
				</div>
			{/each}
		</div>

		<div style="padding: 16px 18px;">
			<h4
				style="font-size: 11px; color: var(--tx3); font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; margin-bottom: 10px;"
			>
				{blocks ? 'Blocks' : 'Repetitions'}
			</h4>

			{#if blocks}
				<div style="display: flex; flex-direction: column; gap: 10px;">
					{#each blocks as block, blockIndex (blockIndex)}
						{@const onTarget = blockOnTarget(block)}
						<div
							style="border: 1px solid var(--bd2); border-radius: var(--rs); padding: 10px 12px; background: var(--panel2);"
						>
							<div
								style="display: flex; align-items: baseline; justify-content: space-between; gap: 10px; margin-bottom: 8px;"
							>
								<span style="font-size: 12px; font-weight: 700; color: var(--tx);">
									{block.label}
								</span>
								<span
									style="font-size: 11.5px; color: var(--tx2); flex-shrink: 0; white-space: nowrap;"
								>
									{repsSummary(block.reps)}{onTarget ? ` - ${onTarget}` : ''}
								</span>
							</div>
							{#if block.sets}
								<div style="display: flex; flex-direction: column; gap: 8px;">
									{#each block.sets as set (set.label)}
										{@const setWork = set.reps.filter((rep) => !rep.is_rest)}
										{#if setWork.length > 0}
											<div>
												<div
													style="display: flex; align-items: baseline; justify-content: space-between; gap: 10px; margin-bottom: 6px;"
												>
													<span style="font-size: 11.5px; font-weight: 600; color: var(--tx2);">
														{set.label}
													</span>
													<span
														style="font-size: 11px; color: var(--tx3); flex-shrink: 0; white-space: nowrap;"
													>
														{repsSummary(setWork)}
													</span>
												</div>
												<div style="display: flex; flex-direction: column; gap: 6px;">
													{#each setWork as rep, position (rep.id)}
														<SessionRepRow
															{rep}
															position={position + 1}
															{accent}
															{showEdge}
															reference={performance.maxWeight}
														/>
													{/each}
												</div>
											</div>
										{/if}
									{/each}
								</div>
							{:else}
								<div style="display: flex; flex-direction: column; gap: 6px;">
									{#each shownBlockReps(block) as rep, position (rep.id)}
										<SessionRepRow
											{rep}
											position={position + 1}
											{accent}
											{showEdge}
											reference={performance.maxWeight}
										/>
									{/each}
								</div>
							{/if}
						</div>
					{/each}
				</div>

				{#if cappedBlocks}
					<button
						onclick={() => (expanded = !expanded)}
						style="margin-top: 12px; font-size: 12.5px; font-weight: 600; color: var(--pr); background: none; border: none; cursor: pointer; font-family: var(--font); padding: 0;"
					>
						{expanded ? 'Show less' : `Show all ${workReps.length} reps`}
					</button>
				{/if}
			{:else}
				<div style="display: flex; flex-direction: column; gap: 6px;">
					{#each shownReps as rep, position (rep.id)}
						<SessionRepRow
							{rep}
							position={position + 1}
							{accent}
							{showEdge}
							reference={performance.maxWeight}
						/>
					{/each}
				</div>

				{#if workReps.length > INDIVIDUAL_REPS_PREVIEW}
					<button
						onclick={() => (expanded = !expanded)}
						style="margin-top: 12px; font-size: 12.5px; font-weight: 600; color: var(--pr); background: none; border: none; cursor: pointer; font-family: var(--font); padding: 0;"
					>
						{expanded ? 'Show less' : `Show all ${workReps.length} reps`}
					</button>
				{/if}
			{/if}
		</div>
	</div>
{/if}
