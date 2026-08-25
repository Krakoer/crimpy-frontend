<script lang="ts">
	import type { AssessmentCatalog } from '$lib/assessments';
	import type { Exercise, TrainingItem } from '$lib/api/client';
	import { assessmentLabel, formatLoad } from '$lib/assessments';
	import { getContext } from 'svelte';
	import { COLLAPSE_KEY } from './collapse-context';
	import Icon from '$lib/components/Icon.svelte';

	interface Props {
		item: TrainingItem;
		catalog: AssessmentCatalog;
		exercises: Exercise[];
	}

	let { item, exercises, catalog }: Props = $props();

	let collapsed = $state(false);

	// The name joined onto the item is the one the training was saved with, and
	// is all a reader outside the coach's own library has to go on.
	let exerciseName = $derived(
		exercises.find((e) => e.id === item.exercise_id)?.name ??
			item.exercise_name ??
			'Unknown exercise'
	);

	let isDuration = $derived((item.duration ?? 0) > 0);

	function fmtTime(seconds: number): string {
		if (seconds <= 0) return '0s';
		const m = Math.floor(seconds / 60);
		const s = seconds % 60;
		if (m > 0 && s > 0) return `${m}mn ${s}s`;
		if (m > 0) return `${m}mn`;
		return `${s}s`;
	}

	let variableTarget = $derived(item.variable_targets?.[isDuration ? 'duration' : 'reps']);

	let collapsedSummary = $derived.by(() => {
		const parts: string[] = [];
		if (variableTarget) {
			parts.push(
				`${variableTarget.percent}% ${assessmentLabel(variableTarget.assessment_id, catalog)}`
			);
		} else if (isDuration) {
			parts.push(fmtTime(item.duration ?? 0));
		} else {
			parts.push(`${item.reps ?? 1} reps`);
		}
		const rest = item.rest_seconds ?? 0;
		if (rest > 0) parts.push(`${rest}s rest`);
		const load = item.loads?.[0];
		if (load && !(load.unit === 'percent_bw' && load.value === 100)) {
			parts.push(formatLoad(load, catalog));
		}
		return parts.join(' · ');
	});

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
		onclick={() => (collapsed = !collapsed)}
		role="button"
		tabindex="0"
		onkeydown={(e) => e.key === 'Enter' && (collapsed = !collapsed)}
	>
		<div
			style="width: 4px; height: 20px; background: var(--pr); border-radius: 2px; flex-shrink: 0;"
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
			<span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"
				>{exerciseName}</span
			>
			{#if collapsed && collapsedSummary}
				<span style="font-size: 11px; color: var(--tx3); font-weight: 500; flex-shrink: 0;"
					>{collapsedSummary}</span
				>
			{/if}
		</span>
	</div>

	{#if !collapsed}
		<div
			style="padding: 12px 18px; border-top: 1px solid var(--bd2); display: flex; gap: 24px; flex-wrap: wrap;"
		>
			<div style="display: flex; flex-direction: column; gap: 2px; align-items: center;">
				<span style="font-size: 10px; color: var(--tx3); font-weight: 600; letter-spacing: 0.04em;"
					>{isDuration ? 'DURATION' : 'REPS'}</span
				>
				<span style="font-size: 15px; font-weight: 700; color: var(--tx);">
					{#if variableTarget}
						{variableTarget.percent}% {assessmentLabel(variableTarget.assessment_id, catalog)}
					{:else}
						{isDuration ? fmtTime(item.duration ?? 0) : (item.reps ?? 1)}
					{/if}
				</span>
				{#if variableTarget}
					<span style="font-size: 10px; color: var(--tx3);">
						fallback {isDuration ? fmtTime(item.duration ?? 0) : `${item.reps ?? 1} reps`}
					</span>
				{/if}
			</div>

			{#if item.loads && item.loads.length > 0}
				<div style="display: flex; flex-direction: column; gap: 2px; align-items: center;">
					<span
						style="font-size: 10px; color: var(--tx3); font-weight: 600; letter-spacing: 0.04em;"
						>LOAD</span
					>
					<span style="font-size: 15px; font-weight: 700; color: var(--tx);">
						{formatLoad(item.loads[0], catalog)}
					</span>
					{#if item.loads[0].unit === 'percent_assessment'}
						<span style="font-size: 10px; color: var(--tx3);">
							fallback {item.loads[0].fallback ?? 0} kg
						</span>
					{/if}
				</div>
			{/if}

			<div style="display: flex; flex-direction: column; gap: 2px; align-items: center;">
				<span style="font-size: 10px; color: var(--tx3); font-weight: 600; letter-spacing: 0.04em;"
					>REST</span
				>
				<span style="font-size: 15px; font-weight: 700; color: var(--tx);">
					{fmtTime(item.rest_seconds ?? 0)}
				</span>
			</div>
		</div>

		{#if item.comment?.trim()}
			<div style="padding: 0 18px 12px;">
				<div
					style="padding: 8px 12px; background: var(--pr-fog); border-left: 3px solid var(--pr); border-radius: 0 var(--rs) var(--rs) 0;"
				>
					<span
						style="font-size: 12px; line-height: 1.5; color: var(--tx2); white-space: pre-wrap; overflow-wrap: anywhere;"
						>{item.comment}</span
					>
				</div>
			</div>
		{/if}
	{/if}
</div>
