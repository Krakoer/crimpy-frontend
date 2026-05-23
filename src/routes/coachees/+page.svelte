<script lang="ts">
	import { onMount } from 'svelte';
	import { authStore } from '$lib/stores/auth.svelte';
	import { apiClient } from '$lib/api/client';
	import { goto } from '$app/navigation';
	import type { EnrolledUser, EnrollmentTokenResponse } from '$lib/api/client';
	import AppShell from '$lib/components/AppShell.svelte';
	import Icon from '$lib/components/Icon.svelte';

	let coachees = $state<EnrolledUser[]>([]);
	let search = $state('');
	let loading = $state(false);
	let error = $state('');

	let enrollmentToken = $state<EnrollmentTokenResponse | null>(null);
	let showEnrollmentPanel = $state(false);
	let generatingToken = $state(false);
	let tokenError = $state('');
	let copyConfirmed = $state(false);

	let filtered = $derived(
		search.trim()
			? coachees.filter((c) =>
					`${c.user_firstname} ${c.user_lastname}`
						.toLowerCase()
						.includes(search.trim().toLowerCase())
				)
			: coachees
	);

	onMount(async () => {
		authStore.initialize();
		loading = true;
		try {
			coachees = await apiClient.getEnrollments();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load coachees.';
		} finally {
			loading = false;
		}
	});

	async function handleGenerateToken() {
		generatingToken = true;
		tokenError = '';
		try {
			enrollmentToken = await apiClient.generateEnrollmentToken();
		} catch (e) {
			tokenError = e instanceof Error ? e.message : 'Failed to generate link.';
		} finally {
			generatingToken = false;
		}
	}

	async function handleCopyLink() {
		if (!enrollmentToken) return;
		await navigator.clipboard.writeText(`${window.location.origin}/enroll/${enrollmentToken.token}`);
		copyConfirmed = true;
		setTimeout(() => (copyConfirmed = false), 2000);
	}
</script>

<AppShell
	title="Coachees"
	breadcrumbs={[{ label: 'Studio' }, { label: 'Coachees' }]}
>
	{#snippet actions()}
		<button
			onclick={() => { showEnrollmentPanel = !showEnrollmentPanel; if (showEnrollmentPanel && !enrollmentToken) handleGenerateToken(); }}
			style="
				display: inline-flex; align-items: center; gap: 7px;
				padding: 6px 12px; border-radius: var(--rs);
				background: #fff; color: var(--tx);
				border: 1px solid var(--bd);
				font-size: 12.5px; font-weight: 600;
				cursor: pointer; font-family: var(--font);
			"
		>
			<Icon name="link" size={14} color="var(--tx2)" />
			Invite
		</button>
	{/snippet}

	<div style="padding: 24px 32px 40px; display: flex; flex-direction: column; gap: 16px;">

		<!-- Enrollment panel -->
		{#if showEnrollmentPanel}
			<div
				style="
					background: #fff; border: 1px solid var(--pr-lt); border-radius: var(--rl);
					padding: 20px; display: flex; gap: 18px; align-items: center;
					background-image: linear-gradient(135deg, var(--pr-fog) 0%, transparent 50%);
				"
			>
				<div
					style="
						width: 44px; height: 44px; border-radius: var(--rs);
						background: var(--pr); color: #fff;
						display: flex; align-items: center; justify-content: center; flex-shrink: 0;
					"
				>
					<Icon name="link" size={20} color="#fff" />
				</div>
				<div style="flex: 1;">
					<div style="font-size: 14px; font-weight: 600; color: var(--tx); margin-bottom: 2px;">
						Enrollment link
					</div>
					<div style="font-size: 12.5px; color: var(--tx2);">
						Share this one-time link with a new coachee. Expires in 7 days.
					</div>
				</div>

				{#if tokenError}
					<div style="font-size: 12px; color: var(--rd);">{tokenError}</div>
				{:else if generatingToken}
					<div style="font-size: 12.5px; color: var(--tx3);">Generating...</div>
				{:else if enrollmentToken}
					<div
						style="
							flex: 1.4; display: flex; gap: 8px; align-items: center;
							background: var(--panel2); border: 1px solid var(--bd); border-radius: var(--rs);
							padding: 9px 12px; font-family: ui-monospace, monospace; font-size: 12px; color: var(--tx2);
							overflow: hidden;
						"
					>
						<span
							style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"
						>
							{window.location.origin}/enroll/{enrollmentToken.token}
						</span>
						<button
							onclick={handleCopyLink}
							style="background: none; border: none; cursor: pointer; display: flex; align-items: center; gap: 4px; color: var(--pr); font-size: 12px; font-family: var(--font); font-weight: 600;"
						>
							<Icon name="copy" size={14} color="var(--pr)" />
							{copyConfirmed ? 'Copied!' : 'Copy'}
						</button>
					</div>
				{/if}

				<button
					onclick={() => (showEnrollmentPanel = false)}
					style="
						display: inline-flex; align-items: center;
						padding: 6px 12px; border-radius: var(--rs);
						background: #fff; color: var(--tx); border: 1px solid var(--bd);
						font-size: 12.5px; font-weight: 600; cursor: pointer; font-family: var(--font);
					"
				>
					Close
				</button>
			</div>
		{/if}

		<!-- Toolbar -->
		<div
			style="
				background: #fff; border: 1px solid var(--bd); border-radius: var(--rl);
				padding: 14px; display: flex; align-items: center; gap: 12px;
			"
		>
			<div
				style="
					flex: 1; display: flex; align-items: center; gap: 8px;
					background: var(--panel2); border: 1px solid var(--bd); border-radius: var(--rs);
					padding: 9px 12px;
				"
			>
				<Icon name="search" size={15} color="var(--tx3)" />
				<input
					bind:value={search}
					placeholder="Search by name..."
					style="
						flex: 1; border: none; outline: none; background: transparent;
						font-family: var(--font); font-size: 13.5px; color: var(--tx);
					"
				/>
			</div>
		</div>

		{#if error}
			<div
				style="border: 1px solid var(--rd); background: #fff5f5; border-radius: var(--rs); padding: 12px; font-size: 12.5px; color: var(--rd);"
			>
				{error}
			</div>
		{/if}

		<!-- Table -->
		<div
			style="background: #fff; border: 1px solid var(--bd); border-radius: var(--rl); overflow: hidden; box-shadow: var(--sh);"
		>
			<div
				style="
					display: grid; grid-template-columns: 2fr 1fr 1fr 32px;
					padding: 12px 20px; border-bottom: 1px solid var(--bd);
					background: var(--panel2);
					font-size: 11px; color: var(--tx3); font-weight: 600;
					letter-spacing: 0.06em; text-transform: uppercase;
				"
			>
				<div>Coachee</div>
				<div>Email</div>
				<div>Status</div>
				<div></div>
			</div>

			{#if loading}
				<div style="display: flex; align-items: center; gap: 12px; padding: 24px 20px; color: var(--tx3); font-size: 13px;">
					<div
						style="width: 16px; height: 16px; border: 2px solid var(--bd); border-top-color: var(--pr); border-radius: 50%; animation: spin 0.8s linear infinite;"
					></div>
					Loading coachees...
				</div>
			{:else if filtered.length === 0}
				<div style="padding: 32px 20px; text-align: center; color: var(--tx3); font-size: 13.5px;">
					{search ? 'No coachees match your search.' : 'No coachees enrolled yet.'}
				</div>
			{:else}
				{#each filtered as coachee, i (coachee.user_id)}
					<button
						onclick={() => goto(`/coachees/${coachee.user_id}`)}
						style="
							display: grid; grid-template-columns: 2fr 1fr 1fr 32px;
							padding: 14px 20px; align-items: center;
							border-bottom: {i < filtered.length - 1 ? '1px solid var(--bd2)' : 'none'};
							border-top: none; border-left: none; border-right: none;
							cursor: pointer; font-size: 13.5px; color: var(--tx);
							background: none; width: 100%; text-align: left;
							font-family: var(--font);
						"
					>
						<div style="display: flex; align-items: center; gap: 12px;">
							<div
								style="
									width: 34px; height: 34px; border-radius: 50%;
									background: var(--pr); color: #fff;
									display: flex; align-items: center; justify-content: center;
									font-size: 12px; font-weight: 600; flex-shrink: 0;
								"
							>
								{(coachee.user_firstname?.[0] ?? '').toUpperCase()}{(coachee.user_lastname?.[0] ?? '').toUpperCase()}
							</div>
							<div>
								<div style="font-weight: 600;">
									{coachee.user_firstname}
									{coachee.user_lastname}
								</div>
							</div>
						</div>
						<div style="color: var(--tx2); font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
							{coachee.user_email ?? ''}
						</div>
						<div>
							<span
								style="
									display: inline-flex; align-items: center;
									background: var(--gn)18; color: var(--gn);
									font-size: 11px; font-weight: 600;
									padding: 3px 9px; border-radius: 999px;
								"
							>
								Active
							</span>
						</div>
						<div style="display: flex; justify-content: flex-end;">
							<Icon name="chevron" size={16} color="var(--tx3)" />
						</div>
					</button>
				{/each}
			{/if}
		</div>

		<div style="display: flex; align-items: center; justify-content: space-between; padding: 0 4px;">
			<div style="font-size: 12.5px; color: var(--tx3);">
				{filtered.length} of {coachees.length} coachees
			</div>
		</div>
	</div>
</AppShell>

<style>
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
