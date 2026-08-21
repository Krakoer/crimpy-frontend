<script lang="ts">
	import type { RepData, SessionResponse } from '$lib/api/client';
	import {
		groupRepsByPrescriptionItem,
		groupRepsIntoSets,
		gripShort,
		isOnTarget,
		repeaterConfigOf,
		sessionPerformance,
		type RepBlock,
		type RepSet
	} from '$lib/sessions';
	import SessionRepRow from '$lib/components/session/SessionRepRow.svelte';

	interface Props {
		session: SessionResponse;
		reps: RepData[];
		accent: string;
	}

	let { session, reps, accent }: Props = $props();

	const INDIVIDUAL_REPS_PREVIEW = 8;

	const performance = $derived(sessionPerformance(reps));
	const workReps = $derived(reps.filter((rep) => !rep.is_rest));
	const showEdge = $derived(workReps.some((rep) => rep.edge_size_mm));

	// What the run itself recorded comes first: a rep names the block it was
	// played from, where the repeater configuration only describes the shape the
	// session was meant to have.
	const blocks = $derived<RepBlock[] | null>(
		groupRepsByPrescriptionItem(workReps, session.prescription)
	);
	const config = $derived(blocks ? null : repeaterConfigOf(session));
	const sets = $derived<RepSet[]>(config ? groupRepsIntoSets(reps, config) : []);

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

	function setSummary(set: RepSet): string {
		return repsSummary(set.reps.filter((rep) => !rep.is_rest));
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
	// are no longer read through one pooled ratio.
	function blockOnTarget(block: RepBlock): string | null {
		if (!block.reps.some((rep) => rep.target_weight > 0)) return null;
		return `${block.reps.filter(isOnTarget).length}/${block.reps.length} on target`;
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
			{#if performance.hasTargets}
				{@const allOnTarget = performance.onTargetReps === performance.workReps}
				<span
					style="
						font-size: 11.5px; font-weight: 700; padding: 3px 10px; border-radius: 999px;
						color: {allOnTarget ? 'var(--gn)' : 'var(--gd)'};
						background: {allOnTarget ? 'var(--gn-lt)' : 'var(--gd-lt)'};
					">{performance.onTargetReps}/{performance.workReps} on target</span
				>
			{/if}
		</div>

		<div
			class="grid grid-cols-4"
			style="border-bottom: {reps.length > 0 ? '1px solid var(--bd2)' : 'none'};"
		>
			{#each [{ k: 'Avg load', v: `${formatWeight(performance.avgWeight)} kg` }, { k: 'Peak load', v: `${formatWeight(performance.maxWeight)} kg` }, { k: 'Work time', v: `${performance.workTime}s` }, { k: 'Work reps', v: String(performance.workReps) }] as stat (stat.k)}
				<div style="padding: 14px 18px;">
					<div
						style="font-size: 10.5px; color: var(--tx3); font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase;"
					>
						{stat.k}
					</div>
					<div style="font-size: 17px; font-weight: 700; color: var(--tx); margin-top: 2px;">
						{stat.v}
					</div>
				</div>
			{/each}
		</div>

		<div style="padding: 16px 18px;">
			<h4
				style="font-size: 11px; color: var(--tx3); font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; margin-bottom: 10px;"
			>
				{blocks ? 'Blocks' : config ? 'Sets' : 'Repetitions'}
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
			{:else if config}
				<div style="display: flex; flex-direction: column; gap: 8px;">
					{#each sets as set (set.label)}
						<div
							style="border: 1px solid var(--bd2); border-radius: var(--rs); padding: 10px 12px; background: var(--panel2);"
						>
							<div
								style="display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 8px;"
							>
								<span style="font-size: 12px; font-weight: 700; color: var(--tx);">{set.label}</span
								>
								<span style="font-size: 11.5px; color: var(--tx2);">{setSummary(set)}</span>
							</div>
							<div style="display: flex; flex-wrap: wrap; gap: 6px;">
								{#each set.reps.filter((rep) => !rep.is_rest) as rep (rep.id)}
									{@const repOnTarget = isOnTarget(rep)}
									<span
										title="{gripShort(rep.grip_position)} - {rep.duration}s{rep.edge_size_mm
											? ` - ${rep.edge_size_mm}mm`
											: ''}"
										style="
											font-size: 11.5px; font-weight: 700; padding: 4px 9px; border-radius: var(--rs);
											color: {repOnTarget ? 'var(--gn)' : 'var(--tx2)'};
											background: {repOnTarget ? 'var(--gn-lt)' : 'var(--panel)'};
											border: 1px solid {repOnTarget ? 'var(--gn-lt)' : 'var(--bd)'};
										">{formatWeight(rep.average_weight)}</span
									>
								{/each}
							</div>
						</div>
					{/each}
				</div>
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
