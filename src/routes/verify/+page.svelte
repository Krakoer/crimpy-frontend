<script lang="ts">
	import { onMount } from 'svelte';
	import { apiClient } from '$lib/api/client';
	import { page } from '$app/stores';

	let verifying = $state(true);
	let success = $state(false);
	let errorMessage = $state('');
	let successMessage = $state('');
	let isCoach = $state(false);

	onMount(async () => {
		const token = $page.url.searchParams.get('token');

		if (!token) {
			errorMessage = 'No verification token provided. Please check your email link.';
			verifying = false;
			return;
		}

		try {
			const response = await apiClient.verifyEmail(token);
			success = true;
			successMessage = response.message || 'Email verified successfully!';
			isCoach = response.is_coach;
		} catch (e) {
			success = false;
			errorMessage =
				e instanceof Error
					? e.message
					: 'Email verification failed. The token may be invalid or expired.';
		} finally {
			verifying = false;
		}
	});
</script>

<div class="flex min-h-screen items-center justify-center bg-white p-6">
	<div class="w-full max-w-2xl">
		<div class="mb-8 text-center">
			<h1 class="mb-2 text-4xl font-black" style="font-family: monospace; letter-spacing: -0.5px;">
				CRIMPY
			</h1>
			<p class="text-gray-600" style="font-family: monospace; font-size: 13px;">
				Climbing Training Platform
			</p>
		</div>

		<div class="border-2 border-black bg-white p-8">
			<div class="text-center">
				{#if verifying}
					<div
						class="mb-6 inline-flex h-20 w-20 items-center justify-center border-2 border-gray-400 bg-gray-50"
					>
						<div class="animate-spin">
							<svg class="h-10 w-10" viewBox="0 0 24 24" fill="none" stroke="currentColor">
								<circle
									class="opacity-25"
									cx="12"
									cy="12"
									r="10"
									stroke="currentColor"
									stroke-width="4"
								></circle>
								<path
									class="opacity-75"
									fill="currentColor"
									d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
								></path>
							</svg>
						</div>
					</div>
					<h2 class="mb-4 text-2xl font-bold" style="font-family: monospace;">VERIFYING EMAIL</h2>
					<p class="text-gray-600" style="font-family: monospace; font-size: 14px;">
						Please wait while we verify your email address...
					</p>
				{:else if success}
					<div
						class="mb-6 inline-flex h-20 w-20 items-center justify-center border-2 border-green-600 bg-green-50"
					>
						<svg
							class="h-12 w-12 text-green-600"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="3"
								d="M5 13l4 4L19 7"
							></path>
						</svg>
					</div>
					<h2 class="mb-4 text-2xl font-bold text-green-600" style="font-family: monospace;">
						EMAIL VERIFIED
					</h2>
					<div class="mb-6 border-2 border-green-600 bg-green-50 p-4">
						<p
							class="text-green-800"
							style="font-family: monospace; font-size: 14px; line-height: 1.6;"
						>
							{successMessage}
						</p>
					</div>
					<p class="mb-6 text-gray-600" style="font-family: monospace; font-size: 13px;">
						Your email has been successfully verified. {#if isCoach}
							An admin will validate your account soon.{:else}
							Go back to the Crimpy app to login.{/if}
					</p>
				{:else}
					<div
						class="mb-6 inline-flex h-20 w-20 items-center justify-center border-2 border-red-600 bg-red-50"
					>
						<svg
							class="h-12 w-12 text-red-600"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="3"
								d="M6 18L18 6M6 6l12 12"
							></path>
						</svg>
					</div>
					<h2 class="mb-4 text-2xl font-bold text-red-600" style="font-family: monospace;">
						VERIFICATION FAILED
					</h2>
					<div class="mb-6 border-2 border-red-600 bg-red-50 p-4">
						<p
							class="text-red-800"
							style="font-family: monospace; font-size: 14px; line-height: 1.6;"
						>
							{errorMessage}
						</p>
					</div>
					<div class="space-y-4">
						<p class="text-gray-600" style="font-family: monospace; font-size: 13px;">
							Please try the following:
						</p>
						<ul
							class="list-inside list-disc space-y-2 text-left text-gray-600"
							style="font-family: monospace; font-size: 13px;"
						>
							<li>Check that you clicked the complete link from your email</li>
							<li>Request a new verification email if the link has expired</li>
							<li>Contact support if the problem persists</li>
						</ul>
					</div>
				{/if}
			</div>

			{#if !verifying && isCoach}
				<div class="mt-8 text-center">
					<a
						href="/"
						class="inline-block border-2 border-black px-8 py-3 font-bold transition-colors hover:bg-black hover:text-white"
						style="font-family: monospace; font-size: 14px;"
					>
						{success ? 'GO TO LOGIN' : 'BACK TO HOME'}
					</a>
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.animate-spin {
		animation: spin 1s linear infinite;
	}
</style>
