<script lang="ts">
	import { onMount } from 'svelte';
	import { authStore } from '$lib/stores/auth.svelte';
	import { apiClient } from '$lib/api/client';
	import { goto } from '$app/navigation';
	import type { UserEnrollment } from '$lib/api/client';

	let coacheesCount = $state(0);
	let exercisesCount = $state(0);
	let trainingsCount = $state(0);
	let userEnrollment = $state<UserEnrollment | null>(null);

	let loadingCoachees = $state(false);
	let loadingEnrollment = $state(false);
	let confirmLeave = $state(false);
	let leavingEnrollment = $state(false);

	let enrollmentError = $state('');

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
			loadCoacheesCount();
			loadExercisesCount();
			loadTrainingsCount();
		} else {
			loadUserEnrollment();
		}
	});

	async function loadCoacheesCount() {
		loadingCoachees = true;
		try {
			const users = await apiClient.getEnrollments();
			coacheesCount = users.length;
		} finally {
			loadingCoachees = false;
		}
	}

	async function loadExercisesCount() {
		const exercises = await apiClient.getExercises().catch(() => []);
		exercisesCount = exercises.length;
	}

	async function loadTrainingsCount() {
		const trainings = await apiClient.getCoachTrainings().catch(() => []);
		trainingsCount = trainings.length;
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

	function handleLogout() {
		authStore.logout();
		goto('/');
	}
</script>

<div class="min-h-screen bg-white p-6">
	<div class="mx-auto max-w-6xl">
		<div class="mb-8 flex items-center justify-between border-b-2 border-black pb-4">
			<div>
				<h1
					class="mb-2 text-4xl font-black"
					style="font-family: monospace; letter-spacing: -0.5px;"
				>
					DASHBOARD
				</h1>
				<p style="font-family: monospace; font-size: 13px; color: #666;">
					Welcome, {authStore.user?.firstname || 'User'}
				</p>
			</div>
			<button
				onclick={handleLogout}
				class="border border-black px-4 py-2 font-medium transition-colors hover:bg-gray-100"
				style="font-family: monospace; font-size: 13px;"
			>
				LOGOUT
			</button>
		</div>

		{#if authStore.isValidatedCoach}
			<!-- Coach portal -->
			<div class="grid grid-cols-3 gap-4">
				<button
					onclick={() => goto('/coachees')}
					class="border-2 border-black bg-white p-6 text-left transition-colors hover:bg-gray-50"
				>
					<p class="mb-1 text-4xl font-black" style="font-family: monospace;">
						{loadingCoachees ? '-' : coacheesCount}
					</p>
					<p style="font-family: monospace; font-size: 13px; color: #666;">Coachees</p>
				</button>

				<button
					onclick={() => goto('/exercises')}
					class="border-2 border-black bg-white p-6 text-left transition-colors hover:bg-gray-50"
				>
					<p class="mb-1 text-4xl font-black" style="font-family: monospace;">
						{exercisesCount}
					</p>
					<p style="font-family: monospace; font-size: 13px; color: #666;">Exercises</p>
				</button>

				<button
					onclick={() => goto('/trainings')}
					class="border-2 border-black bg-white p-6 text-left transition-colors hover:bg-gray-50"
				>
					<p class="mb-1 text-4xl font-black" style="font-family: monospace;">
						{trainingsCount}
					</p>
					<p style="font-family: monospace; font-size: 13px; color: #666;">Trainings</p>
				</button>
			</div>

		{:else}
			<!-- User portal -->
			<div class="space-y-6">
				<div class="border-2 border-black bg-white p-6">
					<h2 class="mb-4 text-xl font-bold" style="font-family: monospace;">USER PORTAL</h2>
					<div class="border border-gray-300 bg-gray-50 p-4">
						<div class="space-y-1" style="font-family: monospace; font-size: 12px; color: #666;">
							<p><span class="font-medium">Email:</span> {authStore.user?.email}</p>
							<p>
								<span class="font-medium">Name:</span>
								{authStore.user?.firstname}
								{authStore.user?.lastname}
							</p>
							<p><span class="font-medium">Role:</span> User</p>
						</div>
					</div>
				</div>

				<!-- My coach section -->
				<div class="border-2 border-black bg-white p-6">
					<h2 class="mb-4 text-xl font-bold" style="font-family: monospace;">MY COACH</h2>

					{#if enrollmentError}
						<div
							class="mb-4 border border-red-600 bg-red-50 p-3"
							style="font-family: monospace; font-size: 12px; color: #B85450;"
						>
							{enrollmentError}
						</div>
					{/if}

					{#if loadingEnrollment}
						<div class="flex items-center gap-3 py-4">
							<div
								class="animate-spin"
								style="width: 16px; height: 16px; border: 2px solid black; border-top-color: transparent; border-radius: 50%;"
							></div>
							<span style="font-family: monospace; font-size: 13px; color: #666;">Loading...</span>
						</div>
					{:else if !userEnrollment}
						<p style="font-family: monospace; font-size: 13px; color: #666;">
							You are not enrolled with any coach.
						</p>
					{:else}
						<div class="mb-4 border border-gray-300 bg-gray-50 p-4">
							<p
								class="mb-1 font-medium"
								style="font-family: monospace; font-size: 12px; color: #666; letter-spacing: 0.5px;"
							>
								COACH
							</p>
							<p class="text-lg font-bold" style="font-family: monospace;">
								{userEnrollment.coach_firstname}
								{userEnrollment.coach_lastname}
							</p>
							<p style="font-family: monospace; font-size: 12px; color: #666;">
								Enrolled since {formatDate(userEnrollment.enrolled_at)}
							</p>
						</div>

						{#if confirmLeave}
							<div
								class="mb-4 border border-yellow-600 bg-yellow-50 p-4"
								style="font-family: monospace; font-size: 13px;"
							>
								<p class="mb-3 font-medium">
									Are you sure you want to leave your current coach? This cannot be undone.
								</p>
								<div class="flex gap-3">
									<button
										onclick={handleLeaveEnrollment}
										disabled={leavingEnrollment}
										class="border border-red-600 px-4 py-2 text-red-600 transition-colors hover:bg-red-50"
										style="font-family: monospace; font-size: 12px;"
									>
										{leavingEnrollment ? 'LEAVING...' : 'CONFIRM LEAVE'}
									</button>
									<button
										onclick={() => (confirmLeave = false)}
										class="border border-black px-4 py-2 transition-colors hover:bg-gray-100"
										style="font-family: monospace; font-size: 12px;"
									>
										CANCEL
									</button>
								</div>
							</div>
						{:else}
							<button
								onclick={() => (confirmLeave = true)}
								class="border border-black px-4 py-2 font-medium transition-colors hover:bg-gray-100"
								style="font-family: monospace; font-size: 13px;"
							>
								LEAVE COACH
							</button>
						{/if}
					{/if}
				</div>
			</div>
		{/if}
	</div>
</div>
