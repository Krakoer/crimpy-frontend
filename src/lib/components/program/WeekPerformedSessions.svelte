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
		// The rows this program prescribes. A run pointing outside them was played
		// from another program, and is marked off program like a free run.
		programSessionIDs: Set<string>;
		// Set when the sessions could not be read at all, which is not the same
		// statement as a week the athlete skipped.
		failed: boolean;
		startsInTheFuture: boolean;
		onOpen: (session: SessionResponse) => void;
	}

	let { weekNumber, sessions, programSessionIDs, failed, startsInTheFuture, onOpen }: Props =
		$props();

	// Under the day it was played, in the column the prescription for that day
	// sits in. Monday first, like the grid above, where the Date constructor
	// counts from Sunday.
	const sessionsByDay = $derived.by(() => {
		const days: SessionResponse[][] = Array.from({ length: 7 }, () => []);
		for (const session of sessions) {
			days[(new Date(session.date).getDay() + 6) % 7].push(session);
		}
		return days;
	});

	// The card is one line wide enough for a name, so what it drops goes here. The
	// session itself is one click away, and this is what a coach scanning the week
	// needs before deciding to open it.
	function summary(session: SessionResponse): string {
		return [
			session.name,
			`${formatSessionTime(session.date)} - ${formatDuration(session.duration)}`,
			session.notes?.trim() ? `"${session.notes.trim()}"` : null,
			awaitsCoachReply(session) ? 'Waiting for an answer.' : null
		]
			.filter(Boolean)
			.join('\n');
	}

	function isOffProgram(session: SessionResponse): boolean {
		return !session.program_session_id || !programSessionIDs.has(session.program_session_id);
	}

	const emptyMessage = $derived(
		failed
			? 'What the athlete played could not be loaded, so this week says nothing about it.'
			: startsInTheFuture
				? 'This week has not started yet.'
				: 'Nothing played this week yet.'
	);
</script>

<!-- The same column template as the day grid above, so a run sits under the
	session that prescribed it and a coach reads the two down one column. The
	frequency and everyday columns stay empty: they say when a session may be
	played, which a run that happened has already answered with its date. -->
<div
	data-testid="performed:{weekNumber}"
	style="
		display: grid; grid-template-columns: 128px repeat(7, minmax(0, 1fr)) 130px 130px;
		border-top: 1px solid var(--bd2); background: var(--panel2);
	"
>
	<div style="padding: 8px 12px; display: flex; flex-direction: column; gap: 2px;">
		<div class="flex items-center gap-1.5">
			<Icon name="check" size={11} color={failed ? 'var(--tx3)' : 'var(--gn)'} />
			<span
				style="font-size: 10.5px; font-weight: 700; color: var(--tx2); letter-spacing: 0.06em; text-transform: uppercase;"
			>
				Performed
			</span>
		</div>
		{#if !failed}
			<div style="font-size: 10px; color: var(--tx3); padding-left: 17px;">
				{sessions.length} session{sessions.length === 1 ? '' : 's'}
			</div>
		{/if}
	</div>

	{#if sessions.length === 0}
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
		{#each sessionsByDay as daySessions, dayIndex (dayIndex)}
			<div
				data-testid="performed:{weekNumber}:{dayIndex}"
				style="
					padding: 5px 3px; min-height: 44px;
					display: flex; flex-direction: column; gap: 3px;
					border-left: 1px solid var(--bd2);
				"
			>
				{#each daySessions as session (session.id)}
					{@const type = sessionActivityInfo(session.activity)}
					{@const needsReply = awaitsCoachReply(session)}
					<button
						onclick={() => onOpen(session)}
						aria-label="Open {session.name}"
						title={summary(session)}
						style="
							display: flex; align-items: center; gap: 4px; width: 100%;
							padding: 4px 5px; border-radius: 5px; text-align: left;
							background: var(--panel); border: 1px solid var(--bd);
							cursor: pointer; font-family: var(--font); font-size: 10.5px;
							transition: border-color 0.15s;
						"
						onmouseenter={(e) => (e.currentTarget.style.borderColor = 'var(--pr)')}
						onmouseleave={(e) => (e.currentTarget.style.borderColor = 'var(--bd)')}
					>
						<div
							style="width: 5px; height: 5px; border-radius: 50%; background: {type.color}; flex-shrink: 0;"
						></div>
						<span
							class="truncate"
							style="flex: 1; min-width: 0; font-weight: 500; color: var(--tx);"
						>
							{session.name}
						</span>
						{#if isOffProgram(session)}
							<span
								title="Played outside this program"
								style="font-size: 8px; font-weight: 700; color: var(--tx3); letter-spacing: 0.04em; flex-shrink: 0;"
								>OFF</span
							>
						{/if}
						{#if session.is_assessment}
							<div title="Assessment" class="flex" style="flex-shrink: 0;">
								<Icon name="spark" size={9} color="var(--pl)" />
							</div>
						{/if}
						{#if session.notes?.trim()}
							<div
								title={needsReply
									? 'The athlete is waiting for an answer'
									: 'The athlete left notes, already answered'}
								class="flex"
								style="flex-shrink: 0;"
							>
								<Icon name="message" size={10} color={needsReply ? 'var(--pr)' : 'var(--tx3)'} />
							</div>
						{/if}
					</button>
				{/each}
				{#if daySessions.length === 0}
					<div
						class="flex items-center justify-center"
						style="flex: 1; color: var(--bd); font-size: 14px;"
					>
						-
					</div>
				{/if}
			</div>
		{/each}
		<div style="border-left: 1px solid var(--bd2);"></div>
		<div style="border-left: 1px solid var(--bd2);"></div>
	{/if}
</div>
