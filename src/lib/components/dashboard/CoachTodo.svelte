<script lang="ts">
	import { goto } from '$app/navigation';
	import { type CoachTodo } from '$lib/api/client';
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

	const count = $derived(todo ? todo.pending_feedback.length + todo.empty_weeks.length : 0);

	const checkMoment = $derived.by(() => {
		const check = todo?.empty_week_check;
		if (!check) return '';
		const time = `${String(check.hour).padStart(2, '0')}:${String(check.minute).padStart(2, '0')}`;
		return `${DAY_LABELS_LONG[check.day_of_week]} at ${time}`;
	});

	function formatDate(iso: string): string {
		return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
	}
</script>

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
			{#each todo.pending_feedback as item (item.session_id)}
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
		{/if}

		{#if todo.empty_weeks.length > 0}
			<div
				style="padding: 11px 20px 6px; font-size: 11px; color: var(--tx3); letter-spacing: 0.06em; text-transform: uppercase; font-weight: 700; border-top: 1px solid var(--bd2);"
			>
				Weeks left to program
			</div>
			{#each todo.empty_weeks as week (week.program_id)}
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
							background: var(--gd-lt);
							display: flex; align-items: center; justify-content: center;
							flex-shrink: 0;
						"
					>
						<Icon name="calendar" size={14} color="var(--gd)" />
					</div>
					<div style="flex: 1; min-width: 0;">
						<div style="font-size: 12.5px; color: var(--tx); font-weight: 600;">
							{week.user_firstname}
							{week.user_lastname}
						</div>
						<div
							style="font-size: 11.5px; color: var(--tx3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"
						>
							{week.program_name} - week {week.week_number} starts {formatDate(
								`${week.week_start}T00:00:00`
							)}
						</div>
					</div>
					<Icon name="chevron" size={15} color="var(--tx3)" />
				</button>
			{/each}
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
				Programs with an empty week of {formatDate(`${todo.empty_week_check.week_start}T00:00:00`)}
				are listed from {checkMoment}.
			</div>
		{/if}
	{/if}
</div>
