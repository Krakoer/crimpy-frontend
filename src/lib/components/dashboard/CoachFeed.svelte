<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { apiClient, type FeedEvent } from '$lib/api/client';
	import { timeAgo } from '$lib/date';
	import { sessionActivityInfo } from '$lib/sessions';
	import Icon from '$lib/components/Icon.svelte';

	const PAGE_SIZE = 12;

	let events = $state<FeedEvent[]>([]);
	let loading = $state(true);
	let loadingMore = $state(false);
	let reachedEnd = $state(false);
	let failed = $state(false);

	onMount(async () => {
		try {
			events = await apiClient.getCoachFeed({ limit: PAGE_SIZE });
			reachedEnd = events.length < PAGE_SIZE;
		} catch {
			failed = true;
		} finally {
			loading = false;
		}
	});

	async function loadMore() {
		const oldest = events[events.length - 1];
		if (!oldest) return;
		loadingMore = true;
		try {
			const next = await apiClient.getCoachFeed({ limit: PAGE_SIZE, before: oldest.occurred_at });
			events = [...events, ...next];
			reachedEnd = next.length < PAGE_SIZE;
		} catch {
			failed = true;
		} finally {
			loadingMore = false;
		}
	}

	function initials(event: FeedEvent): string {
		return `${event.user_firstname?.[0] ?? ''}${event.user_lastname?.[0] ?? ''}`.toUpperCase();
	}

	function accent(event: FeedEvent): { icon: string; color: string; tint: string } {
		if (event.kind === 'session_completed') {
			const activity = sessionActivityInfo(event.activity ?? -1);
			return { icon: activity.icon, color: activity.color, tint: activity.tint };
		}
		if (event.kind === 'availability_declared') {
			return { icon: 'calendar', color: 'var(--bl)', tint: 'var(--bl-lt)' };
		}
		return { icon: 'users', color: 'var(--gn)', tint: 'var(--gn-lt)' };
	}

	function headline(event: FeedEvent): string {
		if (event.kind === 'session_completed') {
			const verb = event.origin === 'played' ? 'played' : 'logged';
			return `${verb} ${event.title || 'a session'}`;
		}
		if (event.kind === 'availability_declared') {
			return `declared their availability for the week of ${formatWeek(event.week_start)}`;
		}
		return 'joined your coachees';
	}

	function formatWeek(weekStart?: string): string {
		if (!weekStart) return '';
		return new Date(`${weekStart}T00:00:00`).toLocaleDateString('en-GB', {
			day: 'numeric',
			month: 'short'
		});
	}
</script>

<div
	style="background: var(--panel); border-radius: var(--rl); border: 1px solid var(--bd); box-shadow: var(--sh); overflow: hidden;"
>
	<div
		style="padding: 16px 20px 12px; border-bottom: 1px solid var(--bd2); display: flex; align-items: center; gap: 8px;"
	>
		<Icon name="spark" size={16} color="var(--gd)" />
		<h3 style="font-size: 14.5px; font-weight: 700; color: var(--tx);">Activity</h3>
	</div>

	{#if loading}
		<div style="padding: 18px 20px; font-size: 12.5px; color: var(--tx3);">Loading activity...</div>
	{:else if failed && events.length === 0}
		<div style="padding: 18px 20px; font-size: 12.5px; color: var(--tx2);">
			The activity feed could not be read. Reload to try again.
		</div>
	{:else if events.length === 0}
		<div style="padding: 18px 20px; font-size: 12.5px; color: var(--tx3);">
			Nothing has happened yet. Your coachees' sessions and declared weeks land here.
		</div>
	{:else}
		{#each events as event, index (event.kind + event.occurred_at + event.user_id + (event.session_id ?? event.week_start ?? ''))}
			{@const style = accent(event)}
			<button
				onclick={() => goto(`/coachees/${event.user_id}`)}
				style="
					display: flex; align-items: flex-start; gap: 11px;
					padding: 11px 16px; width: 100%; text-align: left;
					border: none;
					border-bottom: {index < events.length - 1 ? '1px solid var(--bd2)' : 'none'};
					background: none; cursor: pointer; font-family: var(--font);
				"
			>
				<div
					style="
						width: 30px; height: 30px; border-radius: 50%;
						background: {style.tint}; color: {style.color};
						display: flex; align-items: center; justify-content: center;
						flex-shrink: 0; margin-top: 1px;
					"
				>
					<Icon name={style.icon} size={15} color={style.color} />
				</div>
				<div style="flex: 1; min-width: 0;">
					<div style="font-size: 12.5px; color: var(--tx2); line-height: 1.45;">
						<span style="font-weight: 600; color: var(--tx);">
							{event.user_firstname}
							{event.user_lastname}
						</span>
						{headline(event)}
					</div>
					{#if event.note}
						<div
							style="
								margin-top: 5px; padding: 6px 9px;
								background: var(--panel2); border-left: 2px solid {style.color};
								border-radius: 0 var(--rs) var(--rs) 0;
								font-size: 12px; color: var(--tx2); font-style: italic;
								overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
							"
						>
							{event.note}
						</div>
					{/if}
				</div>
				<div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0; margin-top: 2px;">
					<span style="font-size: 11.5px; color: var(--tx3); white-space: nowrap;">
						{timeAgo(event.occurred_at)}
					</span>
					<span
						style="
							width: 22px; height: 22px; border-radius: 50%;
							background: var(--pr-lt); color: var(--pr);
							display: flex; align-items: center; justify-content: center;
							font-size: 9.5px; font-weight: 700;
						"
					>
						{initials(event)}
					</span>
				</div>
			</button>
		{/each}

		{#if !reachedEnd}
			<div style="padding: 10px 16px 14px; display: flex; justify-content: center;">
				<button
					onclick={loadMore}
					disabled={loadingMore}
					style="
						padding: 7px 16px; border-radius: var(--rs);
						border: 1px solid var(--bd); background: var(--panel);
						color: var(--tx2); font-size: 12.5px; font-weight: 600;
						cursor: pointer; font-family: var(--font);
						opacity: {loadingMore ? 0.6 : 1};
					"
				>
					{loadingMore ? 'Loading...' : 'Show older'}
				</button>
			</div>
		{/if}
	{/if}
</div>
