<script lang="ts">
	import type { WeekAvailability } from '$lib/api/client';
	import Icon from '$lib/components/Icon.svelte';
	import { WEEK_GRID_COLUMNS } from '$lib/components/program/weekGrid';
	import { formatDuration } from '$lib/sessions';

	interface Props {
		weekNumber: number;
		// What the athlete declared for the calendar week this program week falls
		// on, or undefined when they have not declared it.
		availability: WeekAvailability | undefined;
		// Set when the declarations could not be read at all, which is not the same
		// statement as an athlete who declared nothing.
		failed: boolean;
	}

	let { weekNumber, availability, failed }: Props = $props();

	// The API sends the days it holds; a week is always written whole, but the
	// row must not assume that when reading one back.
	const daysByIndex = $derived.by(() => {
		const days: (WeekAvailability['days'][number] | undefined)[] = Array.from(
			{ length: 7 },
			() => undefined
		);
		for (const day of availability?.days ?? []) {
			if (day.day_of_week >= 0 && day.day_of_week <= 6) days[day.day_of_week] = day;
		}
		return days;
	});

	const availableCount = $derived(
		(availability?.days ?? []).filter((day) => day.is_available).length
	);

	// The same reading as the duration of a run played that day, so the two rows
	// of the same column are compared rather than converted.
	function label(day: WeekAvailability['days'][number]): string {
		return day.duration_minutes ? formatDuration(day.duration_minutes * 60) : 'Free';
	}

	const emptyMessage = $derived(
		failed
			? 'What the athlete declared could not be loaded, so this week says nothing about it.'
			: 'The athlete has not said when they can train this week.'
	);
</script>

<!-- The same column template as the day grid above, so what the athlete said
	about a day sits under the sessions prescribed for it. The frequency and
	everyday columns stay empty: a declaration is always about a named day. -->
<div
	data-testid="availability:{weekNumber}"
	style="
		display: grid; grid-template-columns: {WEEK_GRID_COLUMNS};
		border-top: 1px solid var(--bd2); background: var(--panel2);
	"
>
	<div style="padding: 8px 12px; display: flex; flex-direction: column; gap: 2px;">
		<div class="flex items-center gap-1.5">
			<Icon name="clock" size={11} color={failed ? 'var(--tx3)' : 'var(--pl)'} />
			<span
				style="font-size: 10.5px; font-weight: 700; color: var(--tx2); letter-spacing: 0.06em; text-transform: uppercase;"
			>
				Available
			</span>
		</div>
		{#if availability && !failed}
			<div style="font-size: 10px; color: var(--tx3); padding-left: 17px;">
				{availableCount} day{availableCount === 1 ? '' : 's'}
			</div>
		{/if}
	</div>

	{#if !availability || failed}
		<div
			style="
				grid-column: span 9; display: flex; align-items: center;
				padding: 8px 12px; font-size: 11.5px;
				color: {failed ? 'var(--rd)' : 'var(--tx3)'};
			"
		>
			{emptyMessage}
		</div>
	{:else}
		{#each daysByIndex as day, dayIndex (dayIndex)}
			<div
				data-testid="availability:{weekNumber}:{dayIndex}"
				style="
					padding: 5px 3px; min-height: 40px;
					display: flex; flex-direction: column; gap: 2px; justify-content: center;
					border-left: 1px solid var(--bd2);
				"
			>
				{#if day?.is_available}
					<div class="flex items-center gap-1" style="padding: 0 2px;">
						<div
							style="width: 5px; height: 5px; border-radius: 50%; background: var(--gn); flex-shrink: 0;"
						></div>
						<span style="font-size: 10.5px; font-weight: 600; color: var(--tx);">
							{label(day)}
						</span>
					</div>
					{#if day.note?.trim()}
						<span
							class="truncate"
							title={day.note}
							style="font-size: 10px; color: var(--tx2); padding-left: 8px;"
						>
							{day.note}
						</span>
					{/if}
				{:else}
					<div
						class="flex items-center justify-center"
						title={day?.note?.trim() ? `Not available - ${day.note}` : 'Not available'}
						style="flex: 1; color: var(--bd); font-size: 14px;"
					>
						{#if day?.note?.trim()}
							<span
								class="truncate"
								style="color: var(--tx3); font-size: 10px; font-style: italic;"
							>
								{day.note}
							</span>
						{:else}
							-
						{/if}
					</div>
				{/if}
			</div>
		{/each}
		<div style="border-left: 1px solid var(--bd2);"></div>
		<div style="border-left: 1px solid var(--bd2);"></div>
	{/if}
</div>
