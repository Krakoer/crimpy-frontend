<script lang="ts">
	import { onMount } from 'svelte';
	import { apiClient, type AvailabilityReminder } from '$lib/api/client';
	import AppShell from '$lib/components/AppShell.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { authStore } from '$lib/stores/auth.svelte';
	import { snackbar } from '$lib/stores/snackbar.svelte';

	const DAY_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

	let loading = $state(true);
	let saving = $state(false);
	let enabled = $state(false);
	let dayOfWeek = $state(4);
	let time = $state('21:00');

	const labelStyle =
		'font-size: 11.5px; color: var(--tx2); font-weight: 600; display: block; margin-bottom: 5px;';
	// The native date and time controls take no palette of their own, so they are
	// given the same frame as every other field on the portal.
	const controlStyle =
		'padding: 10px 14px; border: 1px solid var(--bd); border-radius: var(--rs); font-family: var(--font); font-size: 13px; color: var(--tx); outline: none; background: var(--panel);';

	onMount(async () => {
		authStore.initialize();
		try {
			const reminder = await apiClient.getAvailabilityReminder();
			if (reminder) applyReminder(reminder);
		} finally {
			loading = false;
		}
	});

	function applyReminder(reminder: AvailabilityReminder) {
		enabled = reminder.enabled;
		dayOfWeek = reminder.day_of_week;
		time = `${String(reminder.hour).padStart(2, '0')}:${String(reminder.minute).padStart(2, '0')}`;
	}

	async function save() {
		const [hour, minute] = time.split(':').map(Number);
		if (Number.isNaN(hour) || Number.isNaN(minute)) {
			snackbar.show('Pick a time for the reminder', 'error');
			return;
		}
		saving = true;
		try {
			applyReminder(
				await apiClient.setAvailabilityReminder({
					enabled,
					day_of_week: dayOfWeek,
					hour,
					minute
				})
			);
			snackbar.show('Reminder saved');
		} catch (e) {
			snackbar.show(e instanceof Error ? e.message : 'Failed to save the reminder', 'error');
		} finally {
			saving = false;
		}
	}
</script>

<AppShell title="Settings" breadcrumbs={[{ label: 'Studio' }, { label: 'Settings' }]}>
	<div style="padding: 24px 32px 40px; max-width: 720px;">
		{#if loading}
			<div style="font-size: 13px; color: var(--tx2);">Loading your settings...</div>
		{:else}
			<div
				style="background: var(--panel); border-radius: var(--rl); border: 1px solid var(--bd); box-shadow: var(--sh); overflow: hidden;"
			>
				<div style="height: 3px; background: linear-gradient(90deg, var(--pr), var(--gd));"></div>
				<div style="padding: 22px 24px;">
					<div class="flex items-center gap-2" style="margin-bottom: 4px;">
						<Icon name="clock" size={16} color="var(--pl)" />
						<h3 style="font-size: 16px; font-weight: 700; color: var(--tx);">
							Availability reminder
						</h3>
					</div>
					<p style="font-size: 13px; color: var(--tx2); margin-bottom: 6px;">
						Nudge every athlete you coach who has not said yet when they can train next week, so you
						write their program around the week they actually have.
					</p>
					<p style="font-size: 12px; color: var(--tx3); margin-bottom: 18px;">
						Their app raises the reminder at this hour in their own timezone, not yours, and only
						reaches an athlete who has the app and allows notifications.
					</p>

					<label
						class="flex items-center gap-2"
						style="margin-bottom: 16px; cursor: pointer; font-size: 13px; color: var(--tx);"
					>
						<input type="checkbox" bind:checked={enabled} style="accent-color: var(--pr);" />
						Send the reminder
					</label>

					<div
						style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 20px;"
					>
						<div>
							<label for="reminder-day" style={labelStyle}>Day</label>
							<select
								id="reminder-day"
								bind:value={dayOfWeek}
								disabled={!enabled}
								style="{controlStyle} width: 100%; opacity: {enabled ? 1 : 0.5};"
							>
								{#each DAY_LABELS as label, index (index)}
									<option value={index}>{label}</option>
								{/each}
							</select>
						</div>
						<div>
							<label for="reminder-time" style={labelStyle}>Time</label>
							<input
								type="time"
								id="reminder-time"
								bind:value={time}
								disabled={!enabled}
								style="{controlStyle} width: 100%; opacity: {enabled ? 1 : 0.5};"
							/>
							<span style="font-size: 11px; color: var(--tx3); display: block; margin-top: 4px;">
								In each athlete's local time.
							</span>
						</div>
					</div>

					<div style="display: flex; justify-content: flex-end;">
						<button
							onclick={save}
							disabled={saving}
							style="display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px; border-radius: var(--rs); background: var(--pr); color: #fff; border: none; font-size: 13px; font-weight: 600; cursor: pointer; font-family: var(--font); opacity: {saving
								? 0.7
								: 1};"
						>
							<Icon name="check" size={14} color="#fff" />
							{saving ? 'Saving...' : 'Save reminder'}
						</button>
					</div>
				</div>
			</div>
		{/if}
	</div>
</AppShell>
