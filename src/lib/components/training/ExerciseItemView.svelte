<script lang="ts">
	import type { Exercise, TrainingItem, LoadUnit } from '$lib/api/client';
	import { getContext } from 'svelte';
	import { COLLAPSE_KEY } from './collapse-context';

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

	const collapseSignals = getContext<{ collapse: number; expand: number } | undefined>(COLLAPSE_KEY);

	$effect(() => {
		if (collapseSignals?.collapse) collapsed = true;
	});

	$effect(() => {
		if (collapseSignals?.expand) collapsed = false;
	});
</script>

<div
	class="bg-white"
	style="border-left: 3px solid #C6613F; border-top: 1px solid #1d1d1d; border-right: 1px solid #1d1d1d; border-bottom: 1px solid #1d1d1d; box-shadow: 2px 2px 0 0 rgba(29,29,29,0.1);"
>
	<div class="flex items-center gap-2 px-3 py-2">
		<button
			onclick={() => (collapsed = !collapsed)}
			class="w-4 shrink-0 text-center text-gray-400 transition-colors hover:text-black"
			style="font-family: monospace; font-size: 13px;"
			aria-label="Toggle collapse"
		>
			{collapsed ? '>' : 'v'}
		</button>
		<span class="flex-1 truncate font-bold" style="font-family: monospace; font-size: 14px;">
			{exerciseName}
		</span>
	</div>

	{#if !collapsed}
		<div class="space-y-3 border-t border-gray-100 px-3 py-3">
			<div class="grid grid-cols-3">
				<div class="flex flex-col items-center">
					<p
						style="font-family: monospace; font-size: 11px; color: #999; letter-spacing: 0.5px; text-transform: uppercase; margin-bottom: 4px;"
					>
						{isDuration ? 'DURATION' : 'REPS'}
					</p>
					<span style="font-family: monospace; font-size: 15px;">
						{isDuration ? fmtTime(item.duration ?? 0) : item.reps ?? 1}
					</span>
				</div>

				{#if item.loads && item.loads.length > 0}
					<div class="flex flex-col items-center">
						<p
							style="font-family: monospace; font-size: 11px; color: #999; letter-spacing: 0.5px; text-transform: uppercase; margin-bottom: 4px;"
						>
							Load
						</p>
						<span style="font-family: monospace; font-size: 15px;">
							{item.loads[0].value}
							{LOAD_UNIT_LABELS[item.loads[0].unit]}
						</span>
					</div>
				{/if}

				<div class="flex flex-col items-center">
					<p
						style="font-family: monospace; font-size: 11px; color: #999; letter-spacing: 0.5px; text-transform: uppercase; margin-bottom: 4px;"
					>
						Rest
					</p>
					<span style="font-family: monospace; font-size: 15px;">
						{fmtTime(item.rest_seconds ?? 0)}
					</span>
				</div>
			</div>
		</div>
	{/if}
</div>
