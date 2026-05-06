<script lang="ts">
	import type { SessionItem, LoadUnit } from '$lib/api/client';
	import { getContext } from 'svelte';
	import { COLLAPSE_KEY } from './collapse-context';

	interface Props {
		item: SessionItem;
	}

	let { item }: Props = $props();

	let collapsed = $state(false);

	const LOAD_UNIT_LABELS: Record<LoadUnit, string> = {
		bw: 'BW',
		percent_bw: '% BW',
		kg: 'kg',
		lbs: 'lbs'
	};

	let perRep = $derived((item.edge_sizes_mm?.length ?? 0) > 1);

	function fmtLoad(value: number, unit: LoadUnit): string {
		return `${value} ${LOAD_UNIT_LABELS[unit]}`;
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
	class="border border-black bg-white"
	style="border-left: 3px solid #4A7C8C; border-radius: 4px;"
>
	<div class="flex items-center gap-2 px-3 py-2">
		<button
			onclick={() => (collapsed = !collapsed)}
			class="w-4 shrink-0 text-center text-gray-400 transition-colors hover:text-black"
			style="font-family: monospace; font-size: 15px;"
			aria-label="Toggle collapse"
		>
			{collapsed ? '>' : 'V'}
		</button>
		<span
			class="shrink-0 font-bold"
			style="font-family: monospace; font-size: 14px; color: #4A7C8C; letter-spacing: 0.5px;"
		>
			HANGBOARD
		</span>
	</div>

	{#if !collapsed}
		<div class="border-t border-gray-100">
			<div class="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-3">
				<div class="flex items-center gap-1.5">
					<span style="font-family: monospace; font-size: 14px; color: #999;">Sets</span>
					<span style="font-family: monospace; font-size: 14px;">{item.cycles ?? 1}</span>
				</div>
				<span style="color: #ccc; font-size: 15px;">x</span>
				<div class="flex items-center gap-1.5">
					<span style="font-family: monospace; font-size: 14px; color: #999;">Reps</span>
					<span style="font-family: monospace; font-size: 14px;">{item.reps ?? 1}</span>
				</div>
				<div class="h-3 w-px bg-gray-200"></div>
				<div class="flex items-center gap-1.5">
					<span style="font-family: monospace; font-size: 14px; color: #999;">Work</span>
					<span style="font-family: monospace; font-size: 14px;">{item.hb_worktime_seconds ?? 0}</span>
					<span style="font-family: monospace; font-size: 14px; color: #aaa;">s</span>
				</div>
				<div class="flex items-center gap-1.5">
					<span style="font-family: monospace; font-size: 14px; color: #999;">Rep rest</span>
					<span style="font-family: monospace; font-size: 14px;">{item.rest_seconds ?? 0}</span>
					<span style="font-family: monospace; font-size: 14px; color: #aaa;">s</span>
				</div>
				<div class="flex items-center gap-1.5">
					<span style="font-family: monospace; font-size: 14px; color: #999;">Set rest</span>
					<span style="font-family: monospace; font-size: 14px;">{item.cycle_rest_seconds ?? 0}</span>
					<span style="font-family: monospace; font-size: 14px; color: #aaa;">s</span>
				</div>
				<div class="h-3 w-px bg-gray-200"></div>
				<div class="flex items-center gap-1.5">
					<span style="font-family: monospace; font-size: 14px; color: #999;">Both hands</span>
					<span
						class="border px-2 py-0.5 text-center"
						style="font-family: monospace; font-size: 15px; width: 2.6rem; border-color: {item.both_hands
							? '#C6613F'
							: '#ddd'}; color: {item.both_hands ? '#C6613F' : '#aaa'};"
					>
						{item.both_hands ? 'yes' : 'no'}
					</span>
				</div>
			</div>

			<div class="border-t border-gray-200 px-3 py-2">
				<div class="mb-2 flex items-center justify-between">
					<span style="font-family: monospace; font-size: 14px; color: #999;">REP PARAMETERS</span>
					<span
						class="border px-2 py-0.5"
						style="font-family: monospace; font-size: 15px; border-color: {perRep
							? '#C6613F'
							: '#ccc'}; color: {perRep ? '#C6613F' : '#999'};"
					>
						{perRep ? 'PER-REP ON' : 'PER-REP OFF'}
					</span>
				</div>

				{#if !perRep}
					<div class="grid grid-cols-3 gap-2">
						<div>
							<p
								class="mb-0.5"
								style="font-family: monospace; font-size: 14px; color: #999;"
							>
								EDGE (mm)
							</p>
							<span style="font-family: monospace; font-size: 14px;"
								>{item.edge_sizes_mm?.[0] ?? '-'}</span
							>
						</div>
						<div>
							<p
								class="mb-0.5"
								style="font-family: monospace; font-size: 14px; color: #999;"
							>
								LOAD
							</p>
							{#if item.both_hands}
								<span style="font-family: monospace; font-size: 14px;">
									{item.loads?.[0] ? fmtLoad(item.loads[0].value, item.loads[0].unit) : '-'}
								</span>
							{:else}
								<div class="flex flex-col gap-0.5">
									<div class="flex items-center gap-1">
										<span
											style="font-family: monospace; font-size: 11px; color: #999; width: 10px;"
											>L</span
										>
										<span style="font-family: monospace; font-size: 14px;">
											{item.loads?.[0] ? fmtLoad(item.loads[0].value, item.loads[0].unit) : '-'}
										</span>
									</div>
									<div class="flex items-center gap-1">
										<span
											style="font-family: monospace; font-size: 11px; color: #999; width: 10px;"
											>R</span
										>
										<span style="font-family: monospace; font-size: 14px;">
											{item.loads?.[1] ? fmtLoad(item.loads[1].value, item.loads[1].unit) : '-'}
										</span>
									</div>
								</div>
							{/if}
						</div>
						<div>
							<p
								class="mb-0.5"
								style="font-family: monospace; font-size: 14px; color: #999;"
							>
								GRIP
							</p>
							<span style="font-family: monospace; font-size: 14px;"
								>{item.hand_positions?.[0]?.[0] ?? '-'}</span
							>
						</div>
					</div>
				{:else}
					<div class="overflow-x-auto">
						<table
							class="w-full border-collapse"
							style="font-family: monospace; font-size: 15px;"
						>
							<thead>
								<tr class="bg-gray-50">
									<th
										class="border border-gray-200 px-2 py-1 text-left font-medium"
										style="color: #999;">REP</th
									>
									<th
										class="border border-gray-200 px-2 py-1 text-center font-medium"
										style="color: #999;">EDGE (mm)</th
									>
									{#if item.both_hands}
										<th
											class="border border-gray-200 px-2 py-1 text-center font-medium"
											style="color: #999;">LOAD</th
										>
										<th
											class="border border-gray-200 px-2 py-1 text-center font-medium"
											style="color: #999;">GRIP</th
										>
									{:else}
										<th
											class="border border-gray-200 px-2 py-1 text-center font-medium"
											style="color: #999;">L LOAD</th
										>
										<th
											class="border border-gray-200 px-2 py-1 text-center font-medium"
											style="color: #999;">R LOAD</th
										>
										<th
											class="border border-gray-200 px-2 py-1 text-center font-medium"
											style="color: #999;">L GRIP</th
										>
										<th
											class="border border-gray-200 px-2 py-1 text-center font-medium"
											style="color: #999;">R GRIP</th
										>
									{/if}
								</tr>
							</thead>
							<tbody>
								{#each Array.from({ length: item.reps ?? 1 }, (_, i) => i) as repIdx}
									<tr>
										<td class="border border-gray-200 px-2 py-1 text-center font-bold"
											>{repIdx + 1}</td
										>
										<td class="border border-gray-200 px-2 py-1 text-center">
											{item.edge_sizes_mm?.[repIdx] ?? '-'}
										</td>
										{#if item.both_hands}
											<td class="border border-gray-200 px-2 py-1 text-center">
												{item.loads?.[repIdx]
													? fmtLoad(item.loads[repIdx].value, item.loads[repIdx].unit)
													: '-'}
											</td>
											<td class="border border-gray-200 px-2 py-1 text-center">
												{item.hand_positions?.[0]?.[repIdx] ?? '-'}
											</td>
										{:else}
											<td class="border border-gray-200 px-2 py-1 text-center">
												{item.loads?.[2 * repIdx]
													? fmtLoad(
															item.loads[2 * repIdx].value,
															item.loads[2 * repIdx].unit
														)
													: '-'}
											</td>
											<td class="border border-gray-200 px-2 py-1 text-center">
												{item.loads?.[2 * repIdx + 1]
													? fmtLoad(
															item.loads[2 * repIdx + 1].value,
															item.loads[2 * repIdx + 1].unit
														)
													: '-'}
											</td>
											<td class="border border-gray-200 px-2 py-1 text-center">
												{item.hand_positions?.[0]?.[repIdx] ?? '-'}
											</td>
											<td class="border border-gray-200 px-2 py-1 text-center">
												{item.hand_positions?.[1]?.[repIdx] ?? '-'}
											</td>
										{/if}
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			</div>
		</div>
	{/if}
</div>
