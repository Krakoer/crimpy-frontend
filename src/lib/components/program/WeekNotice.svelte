<script lang="ts">
	import Icon from '$lib/components/Icon.svelte';

	interface Props {
		week: number;
		editMode: boolean;
		// Counted by session rather than by override, since a session is what the
		// coach opens to clear one.
		staleSessions: number;
		// Whether any of them can still be opened and cleared. A played session
		// refuses a change to its overrides, so a week whose only stale override
		// sits on one has nothing to point the coach at.
		staleClearable: boolean;
		lockedSessions: boolean;
	}

	let { week, editMode, staleSessions, staleClearable, lockedSessions }: Props = $props();

	let staleCount = $derived(
		staleSessions === 1
			? 'One session of this week asks for something its training no longer takes.'
			: `${staleSessions} sessions of this week ask for something their training no longer takes.`
	);

	let staleRemedy = $derived(
		!staleClearable
			? 'Those sessions have already been played, so what they ask cannot be changed here.'
			: editMode
				? 'Open the marked session to clear it.'
				: 'Turn Edit on to open the marked session and clear it.'
	);
</script>

{#if staleSessions > 0}
	<div
		data-testid="stale-week-{week}"
		style="padding: 6px 12px; background: var(--gd-lt); color: var(--tx2); font-size: 11.5px; border-bottom: 1px solid var(--bd2); display: flex; align-items: center; gap: 6px;"
	>
		<Icon name="alert" size={11} color="var(--gd)" />
		{staleCount} The athlete is handed the training as it is written there, and the week cannot be saved
		until that is cleared. {staleRemedy}
	</div>
{/if}

{#if editMode && lockedSessions}
	<div
		style="padding: 6px 12px; background: var(--pr-fog); color: var(--tx2); font-size: 11.5px; border-bottom: 1px solid var(--bd2); display: flex; align-items: center; gap: 6px;"
	>
		<Icon name="lock" size={11} color="var(--tx3)" />
		Sessions already played are locked: their training and their overrides cannot be changed and they
		cannot leave the week. Rescheduling them inside it is still fine.
	</div>
{/if}
