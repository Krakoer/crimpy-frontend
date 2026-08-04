<script lang="ts">
	import { onMount } from 'svelte';
	import { authStore } from '$lib/stores/auth.svelte';
	import { apiClient } from '$lib/api/client';
	import { goto } from '$app/navigation';
	import type { UserEnrollment, EnrolledUser, SessionResponse } from '$lib/api/client';
	import AppShell from '$lib/components/AppShell.svelte';
	import Icon from '$lib/components/Icon.svelte';

	type SessionWithUser = SessionResponse & { coachee: EnrolledUser };

	let coacheesCount = $state(0);
	let exercisesCount = $state(0);
	let trainingsCount = $state(0);
	let coachees = $state<EnrolledUser[]>([]);
	let userEnrollment = $state<UserEnrollment | null>(null);
	let thisWeekCount = $state<number | null>(null);
	let recentSessions = $state<SessionWithUser[]>([]);

	let loadingCoachees = $state(false);
	let loadingEnrollment = $state(false);
	let confirmLeave = $state(false);
	let leavingEnrollment = $state(false);
	let enrollmentError = $state('');

	const today = new Date().toLocaleDateString('en-GB', {
		weekday: 'long',
		day: 'numeric',
		month: 'long'
	});

	onMount(() => {
		authStore.initialize();

		if (!authStore.isAuthenticated) {
			goto('/');
			return;
		}
		if (!authStore.isEmailVerified) {
			goto('/verify-email');
			return;
		}
		if (authStore.isCoach && !authStore.isValidatedCoach) {
			goto('/pending-validation');
			return;
		}

		if (authStore.isValidatedCoach) {
			loadDashboard();
		} else {
			loadUserEnrollment();
		}
	});

	async function loadDashboard() {
		loadingCoachees = true;
		try {
			const [users, exPage, trainings] = await Promise.all([
				apiClient.getEnrollments().catch(() => []),
				apiClient.getExercises({ limit: 1, offset: 0 }).catch(() => null),
				apiClient.getTrainings().catch(() => [])
			]);
			coachees = users;
			coacheesCount = users.length;
			exercisesCount = exPage?.total ?? 0;
			trainingsCount = trainings.length;

			if (users.length > 0) {
				const allSessions = await Promise.all(
					users.map((u) =>
						apiClient
							.getClientSessions(u.user_id)
							.then((ss) => ss.map((s) => ({ ...s, coachee: u })))
							.catch(() => [])
					)
				);
				const flat = allSessions.flat();
				const now = new Date();
				const startOfWeek = new Date(now);
				startOfWeek.setDate(now.getDate() - ((now.getDay() + 6) % 7));
				startOfWeek.setHours(0, 0, 0, 0);
				const endOfWeek = new Date(startOfWeek);
				endOfWeek.setDate(startOfWeek.getDate() + 7);
				const weekSessions = flat.filter((s) => {
					const d = new Date(s.Date);
					return d >= startOfWeek && d < endOfWeek;
				});
				thisWeekCount = weekSessions.length;
				recentSessions = flat
					.sort((a, b) => new Date(b.Date).getTime() - new Date(a.Date).getTime())
					.slice(0, 8);
			} else {
				thisWeekCount = 0;
			}
		} finally {
			loadingCoachees = false;
		}
	}

	async function loadUserEnrollment() {
		loadingEnrollment = true;
		enrollmentError = '';
		try {
			userEnrollment = await apiClient.getUserEnrollment();
		} catch (e) {
			enrollmentError = e instanceof Error ? e.message : 'Failed to load enrollment.';
		} finally {
			loadingEnrollment = false;
		}
	}

	async function handleLeaveEnrollment() {
		leavingEnrollment = true;
		enrollmentError = '';
		try {
			await apiClient.leaveEnrollment();
			userEnrollment = null;
			confirmLeave = false;
		} catch (e) {
			enrollmentError = e instanceof Error ? e.message : 'Failed to leave enrollment.';
		} finally {
			leavingEnrollment = false;
		}
	}

	function formatDate(iso: string): string {
		return new Date(iso).toLocaleDateString('en-GB', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}

	const stats = $derived([
		{
			id: 'coachees',
			label: 'Active coachees',
			value: coacheesCount,
			icon: 'users',
			color: 'var(--pr)',
			href: '/coachees'
		},
		{
			id: 'trainings',
			label: 'Trainings built',
			value: trainingsCount,
			icon: 'calendar',
			color: 'var(--gd)',
			href: '/trainings'
		},
		{
			id: 'exercises',
			label: 'Exercise library',
			value: exercisesCount,
			icon: 'dumbbell',
			color: 'var(--gn)',
			href: '/exercises'
		}
	]);
</script>

{#if authStore.isValidatedCoach}
	<AppShell
		title="Welcome back, {authStore.user?.firstname ?? 'Coach'}"
		documentTitle="Dashboard"
		breadcrumbs={[{ label: 'Studio' }, { label: 'Dashboard' }]}
	>
		{#snippet actions()}
			<button
				onclick={() => goto('/trainings/new')}
				style="
					display: inline-flex; align-items: center; gap: 7px;
					padding: 9px 16px; border-radius: var(--rs);
					background: var(--pr); color: #fff;
					border: 1px solid var(--pr);
					font-size: 13.5px; font-weight: 600;
					cursor: pointer; font-family: var(--font);
				"
			>
				<Icon name="plus" size={14} color="#fff" />
				New training
			</button>
		{/snippet}

		<div style="padding: 24px 32px 40px; display: flex; flex-direction: column; gap: 24px;">
			<!-- Greeting strip -->
			<div
				style="
					background: #fff; border-radius: var(--rl);
					padding: 20px 24px;
					border: 1px solid var(--bd);
					box-shadow: var(--sh);
					display: flex; align-items: center; gap: 24px;
					background-image: linear-gradient(135deg, var(--pr-fog) 0%, transparent 55%);
				"
			>
				<div style="flex: 1;">
					<div
						style="font-size: 12px; color: var(--pr); font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 4px;"
					>
						{today}
					</div>
					<div style="font-size: 18px; font-weight: 600; color: var(--tx); margin-bottom: 4px;">
						{coacheesCount} coachee{coacheesCount !== 1 ? 's' : ''} enrolled
					</div>
					<div style="font-size: 13px; color: var(--tx2);">
						Manage your coachees, trainings, and exercise library from the sidebar.
					</div>
				</div>
				<div
					style="background: #fff; border: 1px solid var(--bd); border-radius: var(--rs); padding: 10px 14px; min-width: 96px;"
				>
					<div
						style="font-size: 11px; color: var(--tx3); letter-spacing: 0.06em; text-transform: uppercase; font-weight: 600;"
					>
						This week
					</div>
					<div style="font-size: 22px; font-weight: 700; color: var(--pr); margin-top: 2px;">
						{loadingCoachees ? '-' : (thisWeekCount ?? '-')}
					</div>
					<div style="font-size: 10px; color: var(--tx3); margin-top: 1px;">sessions</div>
				</div>
			</div>

			<!-- Stat cards -->
			<div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px;">
				{#each stats as s (s.id)}
					<button
						onclick={() => goto(s.href)}
						style="
							background: #fff; border-radius: var(--rl);
							padding: 18px 18px 14px;
							border: 1px solid var(--bd); box-shadow: var(--sh);
							cursor: pointer; text-align: left;
							display: flex; flex-direction: column; gap: 4px;
						"
					>
						<div style="display: flex; align-items: center; justify-content: space-between;">
							<div
								style="
									width: 32px; height: 32px; border-radius: var(--rs);
									background: {s.color}18; color: {s.color};
									display: flex; align-items: center; justify-content: center;
								"
							>
								<Icon name={s.icon} size={16} color={s.color} />
							</div>
						</div>
						<div
							style="font-size: 30px; font-weight: 700; color: var(--tx); letter-spacing: -0.02em; line-height: 1.1; margin-top: 6px;"
						>
							{s.value}
						</div>
						<div style="font-size: 12.5px; color: var(--tx2);">{s.label}</div>
					</button>
				{/each}
			</div>

			<!-- Recent sessions + coachees side by side -->
			{#if !loadingCoachees && (recentSessions.length > 0 || coachees.length > 0)}
				<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px; align-items: start;">
					<!-- Recent sessions -->
					{#if recentSessions.length > 0}
						<div
							style="background: #fff; border-radius: var(--rl); border: 1px solid var(--bd); box-shadow: var(--sh); overflow: hidden;"
						>
							<div style="padding: 16px 20px 12px; border-bottom: 1px solid var(--bd2);">
								<h3 style="font-size: 14.5px; font-weight: 700; color: var(--tx);">
									Recent sessions
								</h3>
							</div>
							{#each recentSessions as s, i (s.ID)}
								<button
									onclick={() => goto(`/coachees/${s.coachee.user_id}`)}
									style="
									display: flex; align-items: center; gap: 12px;
									padding: 10px 16px; width: 100%; text-align: left;
									border-bottom: {i < recentSessions.length - 1 ? '1px solid var(--bd2)' : 'none'};
									background: none; border-top: none; border-left: none; border-right: none;
									cursor: pointer; font-family: var(--font);
								"
								>
									<div
										style="
										width: 30px; height: 30px; border-radius: 50%;
										background: var(--pr-lt); color: var(--pr);
										display: flex; align-items: center; justify-content: center;
										font-size: 11px; font-weight: 600; flex-shrink: 0;
									"
									>
										{(s.coachee.user_firstname?.[0] ?? '').toUpperCase()}{(
											s.coachee.user_lastname?.[0] ?? ''
										).toUpperCase()}
									</div>
									<div style="flex: 1; min-width: 0;">
										<div
											style="font-size: 12.5px; font-weight: 600; color: var(--tx); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"
										>
											{s.coachee.user_firstname}
											{s.coachee.user_lastname}
										</div>
										<div
											style="font-size: 11.5px; color: var(--tx3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"
										>
											{s.Name || 'Training session'}
										</div>
									</div>
									<div style="font-size: 11.5px; color: var(--tx3); white-space: nowrap;">
										{formatDate(s.Date)}
									</div>
								</button>
							{/each}
						</div>
					{/if}

					<!-- Coachees quick list -->
					{#if coachees.length > 0}
						<div
							style="background: #fff; border-radius: var(--rl); border: 1px solid var(--bd); box-shadow: var(--sh); overflow: hidden;"
						>
							<div
								style="padding: 16px 20px 12px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--bd2);"
							>
								<h3 style="font-size: 14.5px; font-weight: 700; color: var(--tx);">Coachees</h3>
								<button
									onclick={() => goto('/coachees')}
									style="font-size: 12.5px; color: var(--pr); font-weight: 600; cursor: pointer; background: none; border: none; font-family: var(--font);"
								>
									All coachees
								</button>
							</div>
							{#each coachees.slice(0, 8) as coachee, i (coachee.user_id)}
								<button
									onclick={() => goto(`/coachees/${coachee.user_id}`)}
									style="
									display: flex; align-items: center; gap: 12px;
									padding: 10px 16px; width: 100%; text-align: left;
									border-bottom: {i < Math.min(coachees.length, 8) - 1 ? '1px solid var(--bd2)' : 'none'};
									background: none; border-top: none; border-left: none; border-right: none;
									cursor: pointer; font-family: var(--font);
								"
								>
									<div
										style="
										width: 30px; height: 30px; border-radius: 50%;
										background: var(--pr); color: #fff;
										display: flex; align-items: center; justify-content: center;
										font-size: 11px; font-weight: 600; flex-shrink: 0;
									"
									>
										{(coachee.user_firstname?.[0] ?? '').toUpperCase()}{(
											coachee.user_lastname?.[0] ?? ''
										).toUpperCase()}
									</div>
									<div style="flex: 1; min-width: 0;">
										<div style="font-size: 12.5px; font-weight: 600; color: var(--tx);">
											{coachee.user_firstname}
											{coachee.user_lastname}
										</div>
										<div style="font-size: 11.5px; color: var(--tx3);">
											{coachee.user_email ?? ''}
										</div>
									</div>
									<Icon name="chevron" size={16} color="var(--tx3)" />
								</button>
							{/each}
						</div>
					{/if}
				</div>
			{/if}

			{#if loadingCoachees}
				<div
					style="display: flex; align-items: center; gap: 12px; padding: 24px 0; color: var(--tx3); font-size: 13px;"
				>
					<div
						style="width: 16px; height: 16px; border: 2px solid var(--bd); border-top-color: var(--pr); border-radius: 50%; animation: spin 0.8s linear infinite;"
					></div>
					Loading...
				</div>
			{/if}
		</div>
	</AppShell>
{:else}
	<!-- User (non-coach) view -->
	<AppShell title="Dashboard" breadcrumbs={[{ label: 'Studio' }, { label: 'Dashboard' }]}>
		<div style="padding: 24px 32px 40px; display: flex; flex-direction: column; gap: 18px;">
			<!-- User info card -->
			<div
				style="background: #fff; border-radius: var(--rl); border: 1px solid var(--bd); padding: 24px; box-shadow: var(--sh);"
			>
				<div
					style="font-size: 11px; color: var(--tx3); letter-spacing: 0.08em; text-transform: uppercase; font-weight: 600; margin-bottom: 12px;"
				>
					Your profile
				</div>
				<div style="display: flex; flex-direction: column; gap: 6px;">
					<div style="font-size: 13.5px; color: var(--tx2);">
						<span style="font-weight: 600; color: var(--tx);">Email:</span>
						{authStore.user?.email}
					</div>
					<div style="font-size: 13.5px; color: var(--tx2);">
						<span style="font-weight: 600; color: var(--tx);">Name:</span>
						{authStore.user?.firstname}
						{authStore.user?.lastname}
					</div>
					<div style="font-size: 13.5px; color: var(--tx2);">
						<span style="font-weight: 600; color: var(--tx);">Role:</span> User
					</div>
				</div>
			</div>

			<!-- Coach enrollment card -->
			<div
				style="background: #fff; border-radius: var(--rl); border: 1px solid var(--bd); padding: 24px; box-shadow: var(--sh);"
			>
				<div style="font-size: 14px; font-weight: 700; color: var(--tx); margin-bottom: 16px;">
					My coach
				</div>

				{#if enrollmentError}
					<div
						style="margin-bottom: 12px; border: 1px solid var(--rd); background: #fff5f5; border-radius: var(--rs); padding: 12px; font-size: 12.5px; color: var(--rd);"
					>
						{enrollmentError}
					</div>
				{/if}

				{#if loadingEnrollment}
					<div
						style="display: flex; align-items: center; gap: 10px; color: var(--tx3); font-size: 13px; padding: 8px 0;"
					>
						<div
							style="width: 16px; height: 16px; border: 2px solid var(--bd); border-top-color: var(--pr); border-radius: 50%; animation: spin 0.8s linear infinite;"
						></div>
						Loading...
					</div>
				{:else if !userEnrollment}
					<p style="font-size: 13.5px; color: var(--tx3);">You are not enrolled with any coach.</p>
				{:else}
					<div
						style="margin-bottom: 16px; border: 1px solid var(--bd); background: var(--panel2); border-radius: var(--rs); padding: 16px;"
					>
						<div
							style="font-size: 11px; color: var(--tx3); letter-spacing: 0.06em; text-transform: uppercase; font-weight: 600; margin-bottom: 4px;"
						>
							Coach
						</div>
						<div style="font-size: 16px; font-weight: 700; color: var(--tx); margin-bottom: 2px;">
							{userEnrollment.coach_firstname}
							{userEnrollment.coach_lastname}
						</div>
						<div style="font-size: 12.5px; color: var(--tx3);">
							Enrolled since {formatDate(userEnrollment.enrolled_at)}
						</div>
					</div>

					{#if confirmLeave}
						<div
							style="margin-bottom: 12px; border: 1px solid var(--gd); background: #fffbf0; border-radius: var(--rs); padding: 16px; font-size: 13px;"
						>
							<p style="font-weight: 600; color: var(--tx); margin-bottom: 12px;">
								Are you sure you want to leave your current coach? This cannot be undone.
							</p>
							<div style="display: flex; gap: 10px;">
								<button
									onclick={handleLeaveEnrollment}
									disabled={leavingEnrollment}
									style="
										padding: 8px 16px; border-radius: var(--rs);
										border: 1px solid var(--rd); color: var(--rd);
										background: #fff; font-size: 12.5px; font-weight: 600;
										cursor: pointer; font-family: var(--font);
										opacity: {leavingEnrollment ? 0.6 : 1};
									"
								>
									{leavingEnrollment ? 'Leaving...' : 'Confirm leave'}
								</button>
								<button
									onclick={() => (confirmLeave = false)}
									style="
										padding: 8px 16px; border-radius: var(--rs);
										border: 1px solid var(--bd); color: var(--tx);
										background: #fff; font-size: 12.5px; font-weight: 600;
										cursor: pointer; font-family: var(--font);
									"
								>
									Cancel
								</button>
							</div>
						</div>
					{:else}
						<button
							onclick={() => (confirmLeave = true)}
							style="
								padding: 8px 16px; border-radius: var(--rs);
								border: 1px solid var(--bd); color: var(--tx);
								background: #fff; font-size: 13px; font-weight: 600;
								cursor: pointer; font-family: var(--font);
							"
						>
							Leave coach
						</button>
					{/if}
				{/if}
			</div>
		</div>
	</AppShell>
{/if}

<style>
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
