<script lang="ts">
	import { onMount } from 'svelte';
	import { apiClient } from '$lib/api/client';
	import { page } from '$app/stores';
	import AuthShell from '$lib/components/AuthShell.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import { authBadge, authBanner, authSecondaryButton } from '$lib/components/auth-styles';

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
			successMessage = response.message || 'Email verified successfully.';
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

<AuthShell maxWidth={480}>
	<div style="padding: 28px 26px; display: flex; flex-direction: column; gap: 18px;">
		<div style="text-align: center;">
			{#if verifying}
				<div style={authBadge('primary')}>
					<div class="spinner"></div>
				</div>
				<h1 style="font-size: 17px; font-weight: 700; color: var(--tx); margin-top: 14px;">
					Verifying your email
				</h1>
				<p style="font-size: 13px; color: var(--tx2); margin-top: 6px;">
					Please wait while we verify your email address.
				</p>
			{:else if success}
				<div style={authBadge('success')}>
					<Icon name="check" size={24} color="var(--gn)" />
				</div>
				<h1 style="font-size: 17px; font-weight: 700; color: var(--tx); margin-top: 14px;">
					Email verified
				</h1>
				<p style="font-size: 13px; color: var(--tx2); margin-top: 6px; line-height: 1.5;">
					{isCoach
						? 'An admin will validate your account soon.'
						: 'Go back to the Crimpy app to sign in.'}
				</p>
			{:else}
				<div style={authBadge('error')}>
					<Icon name="x" size={24} color="var(--rd)" />
				</div>
				<h1 style="font-size: 17px; font-weight: 700; color: var(--tx); margin-top: 14px;">
					Verification failed
				</h1>
			{/if}
		</div>

		{#if !verifying}
			{#if success}
				<div style={authBanner('success')}>{successMessage}</div>
			{:else}
				<div style={authBanner('error')}>{errorMessage}</div>
				<div
					style="background: var(--panel2); border: 1px solid var(--bd2); border-radius: var(--rs); padding: 14px 16px;"
				>
					<p
						style="font-size: 11px; color: var(--tx3); letter-spacing: 0.06em; text-transform: uppercase; font-weight: 600; margin-bottom: 8px;"
					>
						What to try
					</p>
					<ul
						style="font-size: 12.5px; color: var(--tx2); line-height: 1.7; padding-left: 18px; list-style: disc;"
					>
						<li>Check that you used the complete link from your email</li>
						<li>Request a new verification email if the link has expired</li>
						<li>Contact support if the problem persists</li>
					</ul>
				</div>
			{/if}

			{#if isCoach}
				<div style="text-align: center;">
					<a href="/" style="{authSecondaryButton} display: inline-block; text-decoration: none;">
						{success ? 'Go to sign in' : 'Back to home'}
					</a>
				</div>
			{/if}
		{/if}
	</div>
</AuthShell>

<style>
	.spinner {
		width: 22px;
		height: 22px;
		border: 2px solid var(--pr-lt);
		border-top-color: var(--pr);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
