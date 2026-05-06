<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { authStore } from '$lib/stores/auth.svelte';
	import { apiClient } from '$lib/api/client';
	import type { EnrollmentTokenInfo } from '$lib/api/client';

	let { data } = $props();

	type PageState = 'loading' | 'invalid' | 'confirm' | 'accepted' | 'error';

	let pageState = $state<PageState>('loading');
	let tokenInfo = $state<EnrollmentTokenInfo | null>(null);
	let errorMessage = $state('');
	let accepting = $state(false);

	onMount(async () => {
		authStore.initialize();

		if (!authStore.isAuthenticated) {
			goto(`/?return=/enroll/${data.token}`);
			return;
		}

		try {
			const info = await apiClient.getEnrollmentTokenInfo(data.token);
			tokenInfo = info;
			pageState = 'confirm';
		} catch {
			errorMessage = 'This enrollment link is invalid, expired, or has already been used.';
			pageState = 'invalid';
		}
	});

	async function handleAccept() {
		accepting = true;
		try {
			await apiClient.acceptEnrollment(data.token);
			pageState = 'accepted';
		} catch (e) {
			errorMessage = e instanceof Error ? e.message : 'Failed to accept enrollment.';
			pageState = 'error';
		} finally {
			accepting = false;
		}
	}

	function handleDecline() {
		goto('/dashboard');
	}
</script>

<div class="flex min-h-screen items-center justify-center bg-white p-4">
	<div class="w-full max-w-md">
		<div class="mb-8 text-center">
			<h1 class="mb-2 text-4xl font-black" style="font-family: monospace; letter-spacing: -0.5px;">
				CRIMPY
			</h1>
			<p class="text-gray-600" style="font-family: monospace; font-size: 13px;">
				Climbing Training Platform
			</p>
		</div>

		<div class="border-2 border-black bg-white p-8">
			{#if pageState === 'loading'}
				<div class="flex items-center justify-center py-8">
					<div
						class="animate-spin"
						style="width: 24px; height: 24px; border: 2px solid black; border-top-color: transparent; border-radius: 50%;"
					></div>
				</div>

			{:else if pageState === 'invalid' || pageState === 'error'}
				<div>
					<h2 class="mb-4 text-xl font-bold" style="font-family: monospace;">
						ENROLLMENT UNAVAILABLE
					</h2>
					<div
						class="mb-6 border border-red-600 bg-red-50 p-4"
						style="font-family: monospace; font-size: 13px; color: #B85450;"
					>
						{errorMessage}
					</div>
					<button
						onclick={() => goto('/dashboard')}
						class="w-full border border-black px-4 py-3 font-medium transition-colors hover:bg-gray-100"
						style="font-family: monospace; font-size: 13px;"
					>
						GO TO DASHBOARD
					</button>
				</div>

			{:else if pageState === 'confirm' && tokenInfo}
				<div>
					<h2 class="mb-2 text-xl font-bold" style="font-family: monospace;">
						ENROLLMENT REQUEST
					</h2>
					<p class="mb-6" style="font-family: monospace; font-size: 13px; color: #666;">
						You have been invited to train with a coach.
					</p>

					<div class="mb-6 border border-gray-300 bg-gray-50 p-4">
						<p class="mb-1 font-bold" style="font-family: monospace; font-size: 12px; color: #666;">
							COACH
						</p>
						<p class="text-lg font-bold" style="font-family: monospace;">
							{tokenInfo.coach_firstname}
							{tokenInfo.coach_lastname}
						</p>
					</div>

					<p class="mb-6" style="font-family: monospace; font-size: 13px; color: #666;">
						Do you want to be enrolled by this coach? They will be able to assign training plans,
						view your trainings, and send feedback.
					</p>

					<div class="flex gap-3">
						<button
							onclick={handleAccept}
							disabled={accepting}
							class="flex-1 px-4 py-3 font-medium transition-opacity"
							style="font-family: monospace; font-size: 13px; background-color: #C6613F; color: white; opacity: {accepting
								? 0.6
								: 1};"
						>
							{accepting ? 'ACCEPTING...' : 'ACCEPT'}
						</button>
						<button
							onclick={handleDecline}
							disabled={accepting}
							class="flex-1 border border-black px-4 py-3 font-medium transition-colors hover:bg-gray-100"
							style="font-family: monospace; font-size: 13px;"
						>
							DECLINE
						</button>
					</div>
				</div>

			{:else if pageState === 'accepted'}
				<div>
					<h2 class="mb-4 text-xl font-bold" style="font-family: monospace;">ENROLLED</h2>
					<div
						class="mb-6 border border-green-600 bg-green-50 p-4"
						style="font-family: monospace; font-size: 13px; color: #4A7C4A;"
					>
						You are now enrolled with {tokenInfo?.coach_firstname}
						{tokenInfo?.coach_lastname}. Your coach can now assign you training plans and track your
						trainings.
					</div>
					<button
						onclick={() => goto('/dashboard')}
						class="w-full px-4 py-3 font-medium transition-opacity"
						style="font-family: monospace; font-size: 13px; background-color: #C6613F; color: white;"
					>
						GO TO DASHBOARD
					</button>
				</div>
			{/if}
		</div>
	</div>
</div>
