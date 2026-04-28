<script lang="ts">
	import { onMount } from 'svelte';
	import { authStore } from '$lib/stores/auth.svelte';
	import { apiClient } from '$lib/api/client';
	import { goto } from '$app/navigation';
	import type { EnrolledUser, UserEnrollment, EnrollmentTokenResponse } from '$lib/api/client';

	let enrolledUsers = $state<EnrolledUser[]>([]);
	let userEnrollment = $state<UserEnrollment | null>(null);
	let enrollmentToken = $state<EnrollmentTokenResponse | null>(null);

	let loadingTrainees = $state(false);
	let loadingEnrollment = $state(false);
	let generatingToken = $state(false);
	let removingUserId = $state<string | null>(null);
	let confirmRemoveUserId = $state<string | null>(null);
	let confirmLeave = $state(false);
	let leavingEnrollment = $state(false);

	let tokenError = $state('');
	let traineesError = $state('');
	let enrollmentError = $state('');
	let copyConfirmed = $state(false);

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
			loadTrainees();
		} else {
			loadUserEnrollment();
		}
	});

	async function loadTrainees() {
		loadingTrainees = true;
		traineesError = '';
		try {
			enrolledUsers = await apiClient.getEnrollments();
		} catch (e) {
			traineesError = e instanceof Error ? e.message : 'Failed to load trainees.';
		} finally {
			loadingTrainees = false;
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
		const link = buildEnrollLink(enrollmentToken.token);
		await navigator.clipboard.writeText(link);
		copyConfirmed = true;
		setTimeout(() => (copyConfirmed = false), 2000);
	}

	async function handleRemoveTrainee(userId: string) {
		removingUserId = userId;
		try {
			await apiClient.removeEnrollment(userId);
			enrolledUsers = enrolledUsers.filter((u) => u.user_id !== userId);
		} catch (e) {
			traineesError = e instanceof Error ? e.message : 'Failed to remove trainee.';
		} finally {
			removingUserId = null;
			confirmRemoveUserId = null;
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

	function buildEnrollLink(token: string): string {
		return `${window.location.origin}/enroll/${token}`;
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
			<div class="space-y-6">
				<div class="border-2 border-black bg-white p-6">
					<h2 class="mb-4 text-xl font-bold" style="font-family: monospace;">COACH PORTAL</h2>
					<div class="border border-gray-300 bg-gray-50 p-4">
						<div class="space-y-1" style="font-family: monospace; font-size: 12px; color: #666;">
							<p><span class="font-medium">Email:</span> {authStore.user?.email}</p>
							<p>
								<span class="font-medium">Name:</span>
								{authStore.user?.firstname}
								{authStore.user?.lastname}
							</p>
							<p><span class="font-medium">Role:</span> Validated Coach</p>
						</div>
					</div>
				</div>

				<!-- Enrollment link generator -->
				<div class="border-2 border-black bg-white p-6">
					<h2 class="mb-1 text-xl font-bold" style="font-family: monospace;">ENROLLMENT LINK</h2>
					<p class="mb-4" style="font-family: monospace; font-size: 13px; color: #666;">
						Generate a one-time link to send to a new trainee. The link expires after 7 days.
					</p>

					{#if tokenError}
						<div
							class="mb-4 border border-red-600 bg-red-50 p-3"
							style="font-family: monospace; font-size: 12px; color: #B85450;"
						>
							{tokenError}
						</div>
					{/if}

					{#if enrollmentToken}
						<div class="mb-4">
							<p
								class="mb-2 font-medium"
								style="font-family: monospace; font-size: 12px; color: #666; letter-spacing: 0.5px;"
							>
								LINK (expires {formatDate(enrollmentToken.expires_at)})
							</p>
							<div class="flex gap-2">
								<input
									readonly
									value={buildEnrollLink(enrollmentToken.token)}
									class="flex-1 border border-black bg-gray-50 px-3 py-2"
									style="font-family: monospace; font-size: 12px;"
								/>
								<button
									onclick={handleCopyLink}
									class="border border-black px-4 py-2 font-medium transition-colors hover:bg-gray-100"
									style="font-family: monospace; font-size: 12px; min-width: 80px;"
								>
									{copyConfirmed ? 'COPIED' : 'COPY'}
								</button>
							</div>
						</div>
					{/if}

					<button
						onclick={handleGenerateToken}
						disabled={generatingToken}
						class="px-4 py-2 font-medium transition-opacity"
						style="font-family: monospace; font-size: 13px; background-color: #C6613F; color: white; opacity: {generatingToken
							? 0.6
							: 1};"
					>
						{generatingToken ? 'GENERATING...' : enrollmentToken ? 'GENERATE NEW LINK' : 'GENERATE LINK'}
					</button>
				</div>

				<!-- Trainees list -->
				<div class="border-2 border-black bg-white p-6">
					<h2 class="mb-4 text-xl font-bold" style="font-family: monospace;">TRAINEES</h2>

					{#if traineesError}
						<div
							class="mb-4 border border-red-600 bg-red-50 p-3"
							style="font-family: monospace; font-size: 12px; color: #B85450;"
						>
							{traineesError}
						</div>
					{/if}

					{#if loadingTrainees}
						<div class="flex items-center gap-3 py-4">
							<div
								class="animate-spin"
								style="width: 16px; height: 16px; border: 2px solid black; border-top-color: transparent; border-radius: 50%;"
							></div>
							<span style="font-family: monospace; font-size: 13px; color: #666;">Loading...</span>
						</div>
					{:else if enrolledUsers.length === 0}
						<p style="font-family: monospace; font-size: 13px; color: #666;">
							No trainees enrolled yet.
						</p>
					{:else}
						<div class="space-y-3">
							{#each enrolledUsers as user (user.user_id)}
								<div class="flex items-center justify-between border border-gray-300 bg-gray-50 p-4">
									<div>
										<p class="font-bold" style="font-family: monospace; font-size: 13px;">
											{user.user_firstname}
											{user.user_lastname}
										</p>
										<p style="font-family: monospace; font-size: 12px; color: #666;">
											{user.user_email} - enrolled {formatDate(user.enrolled_at)}
										</p>
									</div>

									{#if confirmRemoveUserId === user.user_id}
										<div class="flex gap-2">
											<button
												onclick={() => handleRemoveTrainee(user.user_id)}
												disabled={removingUserId === user.user_id}
												class="border border-red-600 px-3 py-1 text-red-600 transition-colors hover:bg-red-50"
												style="font-family: monospace; font-size: 12px;"
											>
												{removingUserId === user.user_id ? 'REMOVING...' : 'CONFIRM'}
											</button>
											<button
												onclick={() => (confirmRemoveUserId = null)}
												class="border border-black px-3 py-1 transition-colors hover:bg-gray-100"
												style="font-family: monospace; font-size: 12px;"
											>
												CANCEL
											</button>
										</div>
									{:else}
										<button
											onclick={() => (confirmRemoveUserId = user.user_id)}
											class="border border-black px-3 py-1 transition-colors hover:bg-gray-100"
											style="font-family: monospace; font-size: 12px;"
										>
											REMOVE
										</button>
									{/if}
								</div>
							{/each}
						</div>
					{/if}
				</div>
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
