<script lang="ts">
	import type { RepData, SessionResponse } from '$lib/api/client';
	import {
		groupRepsIntoSets,
		gripShort,
		isOnTarget,
		repeaterConfigOf,
		sessionPerformance,
		type RepSet
	} from '$lib/sessions';

	interface Props {
		session: SessionResponse;
		reps: RepData[];
		accent: string;
	}

	let { session, reps, accent }: Props = $props();

	const INDIVIDUAL_REPS_PREVIEW = 8;

	const config = $derived(repeaterConfigOf(session));
	const performance = $derived(sessionPerformance(reps));
	const sets = $derived<RepSet[]>(config ? groupRepsIntoSets(reps, config) : []);

	let expanded = $state(false);
	const workReps = $derived(reps.filter((rep) => !rep.IsRest));
	const shownReps = $derived(
		expanded ? workReps : workReps.slice(0, Math.min(INDIVIDUAL_REPS_PREVIEW, workReps.length))
	);

	function formatWeight(kg: number): string {
		return kg.toFixed(1);
	}

	function fillRatio(rep: RepData): number {
		if (rep.TargetWeight <= 0) return 1;
		return Math.min(1, rep.AverageWeight / rep.TargetWeight);
	}

	function setSummary(set: RepSet): string {
		const work = set.reps.filter((rep) => !rep.IsRest);
		if (work.length === 0) return 'rest only';
		const avg = work.reduce((sum, rep) => sum + rep.AverageWeight, 0) / work.length;
		const target = work[0].TargetWeight;
		if (target > 0) return `avg ${formatWeight(avg)} / ${formatWeight(target)} kg`;
		return `avg ${formatWeight(avg)} kg`;
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
				{config ? 'Sets' : 'Repetitions'}
			</h4>

			{#if config}
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
								{#each set.reps.filter((rep) => !rep.IsRest) as rep (rep.ID)}
									{@const onTarget = isOnTarget(rep)}
									<span
										title="{gripShort(rep.GripPosition)} - {rep.Duration}s"
										style="
											font-size: 11.5px; font-weight: 700; padding: 4px 9px; border-radius: var(--rs);
											color: {onTarget ? 'var(--gn)' : 'var(--tx2)'};
											background: {onTarget ? 'var(--gn-lt)' : 'var(--panel)'};
											border: 1px solid {onTarget ? 'var(--gn-lt)' : 'var(--bd)'};
										">{formatWeight(rep.AverageWeight)}</span
									>
								{/each}
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<div style="display: flex; flex-direction: column; gap: 6px;">
					{#each shownReps as rep (rep.ID)}
						<div style="display: flex; align-items: center; gap: 10px;">
							<span
								style="font-size: 11px; color: var(--tx3); font-weight: 600; width: 28px; flex-shrink: 0;"
								>#{rep.Index + 1}</span
							>
							<span
								style="font-size: 11px; font-weight: 700; color: {accent}; width: 16px; flex-shrink: 0;"
								>{rep.RightHand ? 'R' : 'L'}</span
							>
							<span
								style="font-size: 11px; color: var(--tx3); width: 32px; flex-shrink: 0;"
								title={gripShort(rep.GripPosition)}>{gripShort(rep.GripPosition)}</span
							>
							<div
								style="flex: 1; height: 6px; border-radius: 999px; background: var(--bd2); overflow: hidden;"
							>
								<div
									style="height: 100%; width: {fillRatio(rep) * 100}%; background: {isOnTarget(rep)
										? 'var(--gn)'
										: accent};"
								></div>
							</div>
							<span
								style="font-size: 12px; font-weight: 600; color: var(--tx); width: 92px; text-align: right; flex-shrink: 0;"
							>
								{formatWeight(rep.AverageWeight)}{rep.TargetWeight > 0
									? ` / ${formatWeight(rep.TargetWeight)}`
									: ''} kg
							</span>
						</div>
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
