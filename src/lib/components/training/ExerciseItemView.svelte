<script lang="ts">
	import type { Exercise, TrainingItem, LoadUnit } from '$lib/api/client';
	import { getContext } from 'svelte';
	import { COLLAPSE_KEY } from './collapse-context';
	import Icon from '$lib/components/Icon.svelte';

	interface Props {
		item: TrainingItem;
		exercises: Exercise[];
	}

	let { item, exercises }: Props = $props();

	let collapsed = $state(false);

	const LOAD_UNIT_LABELS: Record<LoadUnit, string> = {
		bw: 'BW',
		percent_bw: '% BW',
		kg: 'kg',
		lbs: 'lbs'
	};

	let exerciseName = $derived(
		exercises.find((e) => e.id === item.exercise_id)?.name ?? 'Unknown exercise'
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

	let collapsedSummary = $derived.by(() => {
		const parts: string[] = [];
		if (isDuration) {
			parts.push(fmtTime(item.duration ?? 0));
		} else {
			parts.push(`${item.reps ?? 1} reps`);
		}
		const rest = item.rest_seconds ?? 0;
		if (rest > 0) parts.push(`${rest}s rest`);
		const load = item.loads?.[0];
		if (load && !(load.unit === 'percent_bw' && load.value === 100)) {
			parts.push(`${load.value} ${LOAD_UNIT_LABELS[load.unit]}`);
		}
		return parts.join(' · ');
	});

	const collapseSignals = getContext<{ collapse: number; expand: number } | undefined>(COLLAPSE_KEY);

	$effect(() => {
		if (collapseSignals?.collapse) collapsed = true;
	});

	$effect(() => {
		if (collapseSignals?.expand) collapsed = false;
	});
</script>

<div style="background: #fff; border-radius: var(--rl); border: 1px solid var(--bd); box-shadow: var(--sh); overflow: hidden;">
	<div
		style="display: flex; align-items: center; gap: 8px; padding: 8px 14px; cursor: pointer; background: {collapsed ? '#fff' : 'var(--panel2)'};"
		onclick={() => (collapsed = !collapsed)}
		role="button"
		tabindex="0"
		onkeydown={(e) => e.key === 'Enter' && (collapsed = !collapsed)}
	>
		<div style="width: 4px; height: 20px; background: var(--pr); border-radius: 2px; flex-shrink: 0;"></div>
		<div style="transform: {collapsed ? 'rotate(0deg)' : 'rotate(90deg)'}; transition: transform 0.15s; flex-shrink: 0;">
			<Icon name="chevron" size={12} color="var(--tx3)" />
		</div>
		<span style="font-size: 13px; font-weight: 700; color: var(--tx); flex: 1; display: flex; align-items: center; gap: 8px; min-width: 0; overflow: hidden;">
			<span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">{exerciseName}</span>
			{#if collapsed && collapsedSummary}
				<span style="font-size: 11px; color: var(--tx3); font-weight: 500; flex-shrink: 0;">{collapsedSummary}</span>
			{/if}
		</span>
	</div>

	{#if !collapsed}
		<div style="padding: 12px 18px; border-top: 1px solid var(--bd2); display: flex; gap: 24px; flex-wrap: wrap;">
			<div style="display: flex; flex-direction: column; gap: 2px; align-items: center;">
				<span style="font-size: 10px; color: var(--tx3); font-weight: 600; letter-spacing: 0.04em;">{isDuration ? 'DURATION' : 'REPS'}</span>
				<span style="font-size: 15px; font-weight: 700; color: var(--tx);">
					{isDuration ? fmtTime(item.duration ?? 0) : item.reps ?? 1}
				</span>
			</div>

			{#if item.loads && item.loads.length > 0}
				<div style="display: flex; flex-direction: column; gap: 2px; align-items: center;">
					<span style="font-size: 10px; color: var(--tx3); font-weight: 600; letter-spacing: 0.04em;">LOAD</span>
					<span style="font-size: 15px; font-weight: 700; color: var(--tx);">
						{item.loads[0].value} {LOAD_UNIT_LABELS[item.loads[0].unit]}
					</span>
				</div>
			{/if}

			<div style="display: flex; flex-direction: column; gap: 2px; align-items: center;">
				<span style="font-size: 10px; color: var(--tx3); font-weight: 600; letter-spacing: 0.04em;">REST</span>
				<span style="font-size: 15px; font-weight: 700; color: var(--tx);">
					{fmtTime(item.rest_seconds ?? 0)}
				</span>
			</div>
		</div>

		{#if item.comment?.trim()}
			<div style="padding: 0 18px 12px;">
				<div style="padding: 8px 12px; background: var(--pr-fog); border-left: 3px solid var(--pr); border-radius: 0 var(--rs) var(--rs) 0;">
					<span style="font-size: 12px; line-height: 1.5; color: var(--tx2); white-space: pre-wrap; overflow-wrap: anywhere;">{item.comment}</span>
				</div>
			</div>
		{/if}
	{/if}
</div>
