<script lang="ts">
	import type { DayActivity, WeekAvailability } from '$lib/api/client';
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

	// The API sends all seven days, each with a list. A day that came back
	// without one is left undefined rather than read as an empty list: the two
	// look the same in a grid of dashes, but only one of them licenses the
	// sentence below, and an API that is not sending lists is not an athlete
	// saying their week is clear.
	const daysByIndex = $derived.by(() => {
		const days: (DayActivity[] | undefined)[] = Array.from({ length: 7 }, () => undefined);
		for (const day of availability?.days ?? []) {
			if (day.day_of_week >= 0 && day.day_of_week <= 6 && Array.isArray(day.activities))
				days[day.day_of_week] = day.activities;
		}
		return days;
	});

	const plannedDayCount = $derived(
		daysByIndex.filter((activities) => activities !== undefined && activities.length > 0).length
	);

	// Every day came back with a list, so what is shown is the whole of what the
	// athlete said. Without it the row can show a day, but cannot count them or
	// call any of them empty.
	const wholeWeekRead = $derived(daysByIndex.every((activities) => activities !== undefined));

	// A week is in the list only because the athlete declared it, so one holding
	// nothing is them saying their week is clear, not them staying silent. The
	// two read differently to a coach about to write the week, which is why this
	// is only claimed when all seven days actually came back with a list.
	const declaredEmpty = $derived(
		Boolean(availability) && !failed && wholeWeekRead && plannedDayCount === 0
	);

	// The same reading as the duration of a run played that day, so the two rows
	// of the same column are compared rather than converted.
	function durationLabel(activity: DayActivity): string {
		return activity.duration_minutes ? formatDuration(activity.duration_minutes * 60) : '';
	}

	// The "when" and the "where" are too long for the column, so they ride in the
	// tooltip with the label rather than being dropped.
	function activityTitle(activity: DayActivity): string {
		const parts = [activity.label];
		const duration = durationLabel(activity);
		if (duration) parts.push(duration);
		if (activity.when?.trim()) parts.push(activity.when.trim());
		if (activity.where?.trim()) parts.push(activity.where.trim());
		return parts.join(' - ');
	}

	function contextLabel(activity: DayActivity): string {
		return [activity.when?.trim(), activity.where?.trim()].filter(Boolean).join(' - ');
	}

	const emptyMessage = $derived(
		failed
			? 'What the athlete declared could not be loaded, so this week says nothing about it.'
			: declaredEmpty
				? 'The athlete declared this week and has nothing on it.'
				: 'The athlete has not said what their week looks like.'
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
				Planned
			</span>
		</div>
		<!-- Hidden on a week declared empty the way it is on a failed read: the
			sentence beside it already says the count, and "0 days" only ever meant
			a grid of dashes before. Hidden too when a day did not come back with a
			list, since "0 days" would then be a claim about the athlete made out of
			a gap in the response. -->
		{#if availability && !failed && !declaredEmpty && wholeWeekRead}
			<div style="font-size: 10px; color: var(--tx3-sm); padding-left: 17px;">
				{plannedDayCount} day{plannedDayCount === 1 ? '' : 's'}
			</div>
		{/if}
	</div>

	{#if !availability || failed || declaredEmpty}
		<div
			style="
				grid-column: span 9; display: flex; align-items: center;
				padding: 8px 12px; font-size: 11.5px;
				color: {failed ? 'var(--rd-tx)' : 'var(--tx3)'};
			"
		>
			{emptyMessage}
		</div>
	{:else}
		{#each daysByIndex as dayActivities, dayIndex (dayIndex)}
			{@const activities = dayActivities ?? []}
			<div
				data-testid="availability:{weekNumber}:{dayIndex}"
				style="
					padding: 5px 3px; min-height: 40px;
					display: flex; flex-direction: column; gap: 3px; justify-content: center;
					border-left: 1px solid var(--bd2);
				"
			>
				{#if activities.length === 0}
					<!-- The dash says the same thing either way, but the tooltip must
						not: a day that came back with an empty list is the athlete
						saying nothing is on, and a day that came back without one says
						nothing at all. -->
					<div
						class="flex items-center justify-center"
						title={dayActivities === undefined ? undefined : 'Nothing planned'}
						style="flex: 1; color: var(--bd); font-size: 14px;"
					>
						-
					</div>
				{:else}
					{#each activities as activity, activityIndex (activityIndex)}
						{@const context = contextLabel(activity)}
						<div title={activityTitle(activity)} style="padding: 0 2px; min-width: 0;">
							<div class="flex items-center gap-1" style="min-width: 0;">
								<div
									style="width: 5px; height: 5px; border-radius: 50%; background: var(--gn); flex-shrink: 0;"
								></div>
								<span
									class="truncate"
									style="font-size: 10.5px; font-weight: 600; color: var(--tx);"
								>
									{activity.label}
								</span>
								{#if activity.duration_minutes}
									<span style="font-size: 10px; color: var(--tx2); flex-shrink: 0;">
										{durationLabel(activity)}
									</span>
								{/if}
							</div>
							{#if context}
								<span
									class="block truncate"
									style="font-size: 10px; color: var(--tx2); padding-left: 8px;"
								>
									{context}
								</span>
							{/if}
						</div>
					{/each}
				{/if}
			</div>
		{/each}
		<div style="border-left: 1px solid var(--bd2);"></div>
		<div style="border-left: 1px solid var(--bd2);"></div>
	{/if}
</div>
