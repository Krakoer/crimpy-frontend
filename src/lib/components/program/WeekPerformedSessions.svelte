<script lang="ts">
	import type { SessionResponse } from '$lib/api/client';
	import Icon from '$lib/components/Icon.svelte';
	import {
		awaitsCoachReply,
		formatDuration,
		formatSessionTime,
		sessionActivityInfo
	} from '$lib/sessions';

	interface Props {
		weekNumber: number;
		// What the athlete played inside this week, oldest first, whether it came
		// from the program or not.
		sessions: SessionResponse[];
		onOpen: (session: SessionResponse) => void;
	}

	let { weekNumber, sessions, onOpen }: Props = $props();

	const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

	function dayLabel(iso: string): string {
		return DAY_NAMES[new Date(iso).getDay()];
	}
</script>

<div
	data-testid="performed:{weekNumber}"
	style="border-top: 1px solid var(--bd2); background: var(--panel2);"
>
	<div class="flex items-center gap-2" style="padding: 8px 12px;">
		<Icon name="play" size={12} color="var(--gn)" />
		<span
			style="font-size: 10.5px; font-weight: 700; color: var(--tx2); letter-spacing: 0.06em; text-transform: uppercase;"
		>
			Performed
		</span>
		<span style="font-size: 11px; color: var(--tx3);">
			{sessions.length} session{sessions.length === 1 ? '' : 's'}
		</span>
	</div>

	{#if sessions.length === 0}
		<div style="padding: 0 12px 10px 30px; font-size: 11.5px; color: var(--tx3);">
			Nothing played this week yet.
		</div>
	{:else}
		<div class="flex flex-wrap" style="gap: 6px; padding: 0 12px 10px;">
			{#each sessions as session (session.id)}
				{@const type = sessionActivityInfo(session.activity)}
				{@const needsReply = awaitsCoachReply(session)}
				<button
					onclick={() => onOpen(session)}
					aria-label="Open {session.name}"
					style="
						display: flex; align-items: center; gap: 8px; text-align: left;
						padding: 7px 10px; border-radius: var(--rs); max-width: 320px;
						background: var(--panel); border: 1px solid var(--bd);
						cursor: pointer; font-family: var(--font);
						transition: border-color 0.15s;
					"
					onmouseenter={(e) => (e.currentTarget.style.borderColor = 'var(--pr)')}
					onmouseleave={(e) => (e.currentTarget.style.borderColor = 'var(--bd)')}
				>
					<div
						class="flex items-center justify-center"
						style="
							width: 26px; height: 26px; border-radius: 5px; flex-shrink: 0;
							background: {type.tint}; color: {type.color};
							font-size: 9px; font-weight: 700;
						"
					>
						{type.short}
					</div>
					<div style="min-width: 0;">
						<div class="flex items-center gap-1.5">
							<span
								class="truncate"
								style="font-size: 12px; font-weight: 600; color: var(--tx); max-width: 190px;"
							>
								{session.name}
							</span>
							{#if session.is_assessment}
								<div title="Assessment" class="flex" style="flex-shrink: 0;">
									<Icon name="spark" size={10} color="var(--pl)" />
								</div>
							{/if}
							{#if !session.program_session_id}
								<span
									title="Played outside the program"
									style="font-size: 9px; font-weight: 700; color: var(--tx3); letter-spacing: 0.04em;"
									>OFF</span
								>
							{/if}
						</div>
						<div style="font-size: 11px; color: var(--tx2);">
							{dayLabel(session.date)}
							{formatSessionTime(session.date)} - {formatDuration(session.duration)}
						</div>
						{#if session.notes?.trim()}
							<div
								class="truncate"
								style="font-size: 11px; color: {needsReply
									? 'var(--pr)'
									: 'var(--tx3)'}; font-style: italic; max-width: 240px; margin-top: 2px;"
							>
								{session.notes}
							</div>
						{/if}
					</div>
					{#if needsReply}
						<div title="The athlete is waiting for an answer" class="flex" style="flex-shrink: 0;">
							<Icon name="message" size={13} color="var(--pr)" />
						</div>
					{/if}
				</button>
			{/each}
		</div>
	{/if}
</div>
