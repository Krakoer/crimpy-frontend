<script lang="ts">
	import { page } from '$app/stores';
	import { apiClient } from '$lib/api/client';
	import AuthShell from '$lib/components/AuthShell.svelte';
	import {
		authBanner,
		authInput,
		authLabel,
		authPrimaryButton,
		authSecondaryButton
	} from '$lib/components/auth-styles';

	let email = $state($page.url.searchParams.get('email') ?? '');
	let error = $state('');
	let sent = $state(false);
	let loading = $state(false);

	async function handleSubmit() {
		error = '';
		loading = true;
		try {
			await apiClient.forgotPassword(email);
			sent = true;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Could not send the reset link';
		} finally {
			loading = false;
		}
	}
</script>

<AuthShell title="Forgot password">
	<div style="padding: 24px 26px; display: flex; flex-direction: column; gap: 18px;">
		<div>
			<h1 style="font-size: 17px; font-weight: 700; color: var(--tx);">Forgot your password?</h1>
			<p style="font-size: 13px; color: var(--tx2); margin-top: 6px; line-height: 1.5;">
				Enter the email you signed up with and we will send you a link to choose a new password. The
				link is valid for one hour.
			</p>
		</div>

		{#if error}
			<div style={authBanner('error')}>{error}</div>
		{/if}

		{#if sent}
			<div style={authBanner('success')}>
				If an account exists for {email}, a reset link is on its way. Check your inbox, and your
				spam folder if it does not show up within a few minutes.
			</div>
		{:else}
			<form
				style="display: flex; flex-direction: column; gap: 16px;"
				onsubmit={(e) => {
					e.preventDefault();
					handleSubmit();
				}}
			>
				<div>
					<label for="forgot-email" style={authLabel}>Email</label>
					<input
						id="forgot-email"
						type="email"
						bind:value={email}
						required
						style={authInput}
						placeholder="coach@example.com"
					/>
				</div>

				<button
					type="submit"
					disabled={loading}
					style="{authPrimaryButton} opacity: {loading ? 0.5 : 1};"
				>
					{loading ? 'Sending...' : 'Send reset link'}
				</button>
			</form>
		{/if}

		<div style="text-align: center;">
			<a href="/" style="{authSecondaryButton} display: inline-block; text-decoration: none;">
				Back to sign in
			</a>
		</div>
	</div>
</AuthShell>
