<script lang="ts">
	import { goto } from '$app/navigation';
	import { type CoachTodo, type EmptyProgramWeek } from '$lib/api/client';
	import { formatDayMonth } from '$lib/date';
	import { DAY_LABELS_LONG } from '$lib/program-draft';
	import { sessionActivityInfo } from '$lib/sessions';
	import Icon from '$lib/components/Icon.svelte';

	// The list is loaded by the page rather than here, since the same response
	// carries the session count the page shows above it.
	let {
		todo,
		loading = false,
		failed = false
	}: { todo: CoachTodo | null; loading?: boolean; failed?: boolean } = $props();

	// pending_feedback is capped by the API, so the badge counts the total it
	// reports rather than the rows that came back.
	const count = $derived(todo ? todo.pending_feedback_total + todo.empty_weeks.length : 0);

	// A coach who has let the answers pile up would otherwise push everything
	// under this panel off the screen. The badge still counts them all.
	const SHOWN_PER_GROUP = 5;
	const shownFeedback = $derived(todo?.pending_feedback.slice(0, SHOWN_PER_GROUP) ?? []);
	const hiddenFeedback = $derived((todo?.pending_feedback_total ?? 0) - shownFeedback.length);

	// A week the athlete is already training reads as more urgent than one that
	// has not started, and the API never holds it back, so the two are their own
	// groups rather than one list.
	const currentWeeks = $derived(todo?.empty_weeks.filter((w) => w.scope === 'current') ?? []);
	// Anything not scoped to the current week falls in here, so an API that does
	// not send a scope yet degrades to the single list this panel used to show
	// rather than to a badge counting rows nothing renders.
	const nextWeeks = $derived(todo?.empty_weeks.filter((w) => w.scope !== 'current') ?? []);
	const shownCurrentWeeks = $derived(currentWeeks.slice(0, SHOWN_PER_GROUP));
	const shownNextWeeks = $derived(nextWeeks.slice(0, SHOWN_PER_GROUP));
	const hiddenCurrentWeeks = $derived(currentWeeks.length - shownCurrentWeeks.length);
	const hiddenNextWeeks = $derived(nextWeeks.length - shownNextWeeks.length);

	const checkMoment = $derived.by(() => {
		const check = todo?.empty_week_check;
		if (!check) return '';
		const time = `${String(check.hour).padStart(2, '0')}:${String(check.minute).padStart(2, '0')}`;
		return `${DAY_LABELS_LONG[check.day_of_week]} at ${time}`;
	});

	const formatDate = formatDayMonth;
</script>

{#snippet emptyWeekRow(week: EmptyProgramWeek, detail: string, color: string, tint: string)}
	<button
		onclick={() => goto(`/coachees/${week.user_id}/programs/${week.program_id}`)}
		style="
			display: flex; align-items: center; gap: 11px;
			padding: 9px 16px 11px; width: 100%; text-align: left;
			border: none; background: none; cursor: pointer; font-family: var(--font);
		"
	>
		<div
			style="
				width: 28px; height: 28px; border-radius: var(--rs);
				background: {tint};
				display: flex; align-items: center; justify-content: center;
				flex-shrink: 0;
			"
		>
			<Icon name="calendar" size={14} {color} />
		</div>
		<div style="flex: 1; min-width: 0;">
			<div style="font-size: 12.5px; color: var(--tx); font-weight: 600;">
				{week.user_firstname}
				{week.user_lastname}
			</div>
			<div
				style="font-size: 11.5px; color: var(--tx3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"
			>
				{week.program_name} - {detail}
			</div>
		</div>
		<Icon name="chevron" size={15} color="var(--tx3)" />
	</button>
{/snippet}

<div
	style="background: var(--panel); border-radius: var(--rl); border: 1px solid var(--bd); box-shadow: var(--sh); overflow: hidden;"
>
	<div
		style="padding: 16px 20px 12px; border-bottom: 1px solid var(--bd2); display: flex; align-items: center; gap: 8px;"
	>
		<Icon name="check" size={16} color="var(--pr)" />
		<h3 style="font-size: 14.5px; font-weight: 700; color: var(--tx);">To do</h3>
		{#if count > 0}
			<span
				style="
					margin-left: auto; min-width: 22px; padding: 1px 7px;
					border-radius: 999px; background: var(--pr); color: #fff;
					font-size: 11px; font-weight: 700; text-align: center;
				"
			>
				{count}
			</span>
		{/if}
	</div>

	{#if loading}
		<div style="padding: 18px 20px; font-size: 12.5px; color: var(--tx3);">
			Loading your list...
		</div>
	{:else if failed || !todo}
		<div style="padding: 18px 20px; font-size: 12.5px; color: var(--tx2);">
			Your list could not be read. Reload to try again.
		</div>
	{:else}
		{#if todo.pending_feedback.length > 0}
			<div
				style="padding: 11px 20px 6px; font-size: 11px; color: var(--tx3); letter-spacing: 0.06em; text-transform: uppercase; font-weight: 700;"
			>
				Waiting on your answer
			</div>
			{#each shownFeedback as item (item.session_id)}
				{@const activity = sessionActivityInfo(item.activity)}
				<button
					onclick={() => goto(`/coachees/${item.user_id}`)}
					style="
						display: flex; align-items: flex-start; gap: 11px;
						padding: 9px 16px 11px; width: 100%; text-align: left;
						border: none; background: none; cursor: pointer; font-family: var(--font);
					"
				>
					<div
						style="
							width: 28px; height: 28px; border-radius: var(--rs);
							background: {activity.tint};
							display: flex; align-items: center; justify-content: center;
							flex-shrink: 0; margin-top: 1px;
						"
					>
						<Icon name="message" size={14} color={activity.color} />
					</div>
					<div style="flex: 1; min-width: 0;">
						<div style="font-size: 12.5px; color: var(--tx); font-weight: 600;">
							{item.user_firstname}
							{item.user_lastname}
						</div>
						<div
							style="font-size: 11.5px; color: var(--tx3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"
						>
							{item.session_name || 'Session'} - {formatDate(item.session_date)}
						</div>
						<div
							style="margin-top: 4px; font-size: 12px; color: var(--tx2); font-style: italic; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"
						>
							{item.notes}
						</div>
					</div>
					<Icon name="chevron" size={15} color="var(--tx3)" />
				</button>
			{/each}
			{#if hiddenFeedback > 0}
				<div style="padding: 2px 20px 12px; font-size: 11.5px; color: var(--tx3);">
					and {hiddenFeedback} more
				</div>
			{/if}
		{/if}

		{#if currentWeeks.length > 0}
			<div
				style="padding: 11px 20px 6px; font-size: 11px; color: var(--tx3); letter-spacing: 0.06em; text-transform: uppercase; font-weight: 700; border-top: 1px solid var(--bd2);"
			>
				Not programmed this week
			</div>
			{#each shownCurrentWeeks as week (week.program_id)}
				{@render emptyWeekRow(
					week,
					`week ${week.week_number} started ${formatDate(`${week.week_start}T00:00:00`)}`,
					'var(--pr)',
					'var(--pr-lt)'
				)}
			{/each}
			{#if hiddenCurrentWeeks > 0}
				<div style="padding: 2px 20px 12px; font-size: 11.5px; color: var(--tx3);">
					and {hiddenCurrentWeeks} more
				</div>
			{/if}
		{/if}

		{#if nextWeeks.length > 0}
			<div
				style="padding: 11px 20px 6px; font-size: 11px; color: var(--tx3); letter-spacing: 0.06em; text-transform: uppercase; font-weight: 700; border-top: 1px solid var(--bd2);"
			>
				Weeks left to program
			</div>
			{#each shownNextWeeks as week (week.program_id)}
				{@render emptyWeekRow(
					week,
					`week ${week.week_number} starts ${formatDate(`${week.week_start}T00:00:00`)}`,
					'var(--gd)',
					'var(--gd-lt)'
				)}
			{/each}
			{#if hiddenNextWeeks > 0}
				<div style="padding: 2px 20px 12px; font-size: 11.5px; color: var(--tx3);">
					and {hiddenNextWeeks} more
				</div>
			{/if}
		{/if}

		{#if count === 0}
			<div style="padding: 18px 20px; font-size: 12.5px; color: var(--tx3);">
				Nothing waiting on you.
			</div>
		{/if}

		{#if !todo.empty_week_check.reached}
			<div
				style="padding: 10px 20px 14px; border-top: 1px solid var(--bd2); font-size: 11.5px; color: var(--tx3);"
			>
				Programs whose week of {formatDate(`${todo.empty_week_check.week_start}T00:00:00`)} holds no session
				are listed from {checkMoment}. A week already being trained is listed whatever the moment
				says.
			</div>
		{/if}
	{/if}
</div>
