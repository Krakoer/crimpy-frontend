<script lang="ts">
	import { onMount } from 'svelte';
	import { authStore } from '$lib/stores/auth.svelte';
	import { apiClient } from '$lib/api/client';
	import { goto } from '$app/navigation';
	import type {
		EnrolledUser,
		EnrollmentTokenResponse,
		SessionResponse,
		Program
	} from '$lib/api/client';
	import AppShell from '$lib/components/AppShell.svelte';
	import Icon from '$lib/components/Icon.svelte';

	type CoacheeExtra = {
		lastActivity: string | null;
		activeProgram: string | null;
	};

	function programStatus(
		startDate: string,
		durationWeeks?: number
	): 'upcoming' | 'active' | 'completed' {
		const diffMs = Date.now() - new Date(startDate).getTime();
		if (diffMs < 0) return 'upcoming';
		const week = Math.ceil(diffMs / (7 * 86400000));
		if (durationWeeks && week > durationWeeks) return 'completed';
		return 'active';
	}

	let coachees = $state<EnrolledUser[]>([]);
	let extras = $state<Record<string, CoacheeExtra>>({});
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

	function formatDateShort(iso: string): string {
		return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
	}

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
		if (coachees.length > 0) {
			await Promise.all(
				coachees.map(async (c) => {
					const [sessions, programs] = await Promise.all([
						apiClient.getClientSessions(c.user_id).catch(() => [] as SessionResponse[]),
						apiClient.listPrograms(c.user_id).catch(() => [] as Program[])
					]);
					const sorted = sessions.sort(
						(a, b) => new Date(b.Date).getTime() - new Date(a.Date).getTime()
					);
					const lastActivity = sorted[0]?.Date ?? null;
					const active =
						programs.find((p) => programStatus(p.start_date, p.duration_weeks) === 'active') ??
						programs.find((p) => programStatus(p.start_date, p.duration_weeks) === 'upcoming');
					extras[c.user_id] = { lastActivity, activeProgram: active?.name ?? null };
				})
			);
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
		await navigator.clipboard.writeText(
			`${window.location.origin}/enroll/${enrollmentToken.token}`
		);
		copyConfirmed = true;
		setTimeout(() => (copyConfirmed = false), 2000);
	}
</script>

<AppShell title="Coachees" breadcrumbs={[{ label: 'Studio' }, { label: 'Coachees' }]}>
	{#snippet actions()}
		<button
			onclick={() => {
				showEnrollmentPanel = !showEnrollmentPanel;
				if (showEnrollmentPanel && !enrollmentToken) handleGenerateToken();
			}}
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
						<span style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
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
					display: grid; grid-template-columns: 1.6fr 1.2fr 1fr 1fr 32px;
					padding: 12px 20px; border-bottom: 1px solid var(--bd);
					background: var(--panel2);
					font-size: 11px; color: var(--tx3); font-weight: 600;
					letter-spacing: 0.06em; text-transform: uppercase;
				"
			>
				<div>Coachee</div>
				<div>Email</div>
				<div>Last activity</div>
				<div>Current program</div>
				<div></div>
			</div>

			{#if loading}
				<div
					style="display: flex; align-items: center; gap: 12px; padding: 24px 20px; color: var(--tx3); font-size: 13px;"
				>
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
					{@const extra = extras[coachee.user_id]}
					<button
						onclick={() => goto(`/coachees/${coachee.user_id}`)}
						style="
							display: grid; grid-template-columns: 1.6fr 1.2fr 1fr 1fr 32px;
							padding: 13px 20px; align-items: center;
							border-bottom: {i < filtered.length - 1 ? '1px solid var(--bd2)' : 'none'};
							border-top: none; border-left: none; border-right: none;
							cursor: pointer; font-size: 13.5px; color: var(--tx);
							background: none; width: 100%; text-align: left;
							font-family: var(--font);
						"
						onmouseenter={(e) => (e.currentTarget.style.background = 'var(--panel2)')}
						onmouseleave={(e) => (e.currentTarget.style.background = '')}
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
								{(coachee.user_firstname?.[0] ?? '').toUpperCase()}{(
									coachee.user_lastname?.[0] ?? ''
								).toUpperCase()}
							</div>
							<div style="font-weight: 600; font-size: 13.5px;">
								{coachee.user_firstname}
								{coachee.user_lastname}
							</div>
						</div>
						<div
							style="color: var(--tx2); font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"
						>
							{coachee.user_email ?? ''}
						</div>
						<div
							style="font-size: 12.5px; color: {extra?.lastActivity ? 'var(--tx2)' : 'var(--tx3)'};"
						>
							{extra === undefined
								? '...'
								: extra.lastActivity
									? formatDateShort(extra.lastActivity)
									: '-'}
						</div>
						<div
							style="font-size: 12.5px; color: {extra?.activeProgram
								? 'var(--tx)'
								: 'var(--tx3)'}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"
						>
							{extra === undefined ? '...' : (extra.activeProgram ?? '-')}
						</div>
						<div style="display: flex; justify-content: flex-end;">
							<Icon name="chevron" size={16} color="var(--tx3)" />
						</div>
					</button>
				{/each}
			{/if}
		</div>

		<div
			style="display: flex; align-items: center; justify-content: space-between; padding: 0 4px;"
		>
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
