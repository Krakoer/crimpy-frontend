<script lang="ts">
	import { page } from '$app/stores';
	import { apiClient } from '$lib/api/client';
	import AuthShell from '$lib/components/AuthShell.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import {
		authBadge,
		authBanner,
		authInput,
		authLabel,
		authPrimaryButton,
		authSecondaryButton
	} from '$lib/components/auth-styles';

	const MIN_PASSWORD_LENGTH = 6;

	const token = $page.url.searchParams.get('token') ?? '';

	let password = $state('');
	let confirmation = $state('');
	let error = $state('');
	let loading = $state(false);
	let done = $state(false);
	let isCoach = $state(false);

	async function handleSubmit() {
		error = '';
		if (password !== confirmation) {
			error = 'The two passwords do not match.';
			return;
		}
		loading = true;
		try {
			const response = await apiClient.resetPassword(token, password);
			isCoach = response.is_coach;
			done = true;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Could not reset your password';
		} finally {
			loading = false;
		}
	}
</script>

<AuthShell title="Reset password">
	<div style="padding: 24px 26px; display: flex; flex-direction: column; gap: 18px;">
		{#if done}
			<div style="text-align: center;">
				<div style={authBadge('success')}>
					<Icon name="check" size={24} color="var(--gn-tx)" />
				</div>
				<h1 style="font-size: 17px; font-weight: 700; color: var(--tx); margin-top: 14px;">
					Password updated
				</h1>
				<p style="font-size: 13px; color: var(--tx2); margin-top: 6px; line-height: 1.5;">
					{isCoach
						? 'You can now sign in with your new password.'
						: 'Go back to the Crimpy app to sign in with your new password.'}
				</p>
			</div>
			{#if isCoach}
				<div style="text-align: center;">
					<a href="/" style="{authSecondaryButton} display: inline-block; text-decoration: none;">
						Go to sign in
					</a>
				</div>
			{/if}
		{:else if !token}
			<div style={authBanner('error')}>
				This link is missing its reset token. Open the complete link from your email, or request a
				new one.
			</div>
			<div style="text-align: center;">
				<a
					href="/forgot-password"
					style="{authSecondaryButton} display: inline-block; text-decoration: none;"
				>
					Request a new link
				</a>
			</div>
		{:else}
			<div>
				<h1 style="font-size: 17px; font-weight: 700; color: var(--tx);">Choose a new password</h1>
				<p style="font-size: 13px; color: var(--tx2); margin-top: 6px; line-height: 1.5;">
					At least {MIN_PASSWORD_LENGTH} characters. Every device signed in to your account will be signed
					out.
				</p>
			</div>

			{#if error}
				<div style={authBanner('error')}>{error}</div>
			{/if}

			<form
				style="display: flex; flex-direction: column; gap: 16px;"
				onsubmit={(e) => {
					e.preventDefault();
					handleSubmit();
				}}
			>
				<div>
					<label for="reset-password" style={authLabel}>New password</label>
					<input
						id="reset-password"
						type="password"
						autocomplete="new-password"
						bind:value={password}
						required
						minlength={MIN_PASSWORD_LENGTH}
						style={authInput}
					/>
				</div>

				<div>
					<label for="reset-confirmation" style={authLabel}>Confirm new password</label>
					<input
						id="reset-confirmation"
						type="password"
						autocomplete="new-password"
						bind:value={confirmation}
						required
						minlength={MIN_PASSWORD_LENGTH}
						style={authInput}
					/>
				</div>

				<button
					type="submit"
					disabled={loading}
					style="{authPrimaryButton} opacity: {loading ? 0.5 : 1};"
				>
					{loading ? 'Saving...' : 'Set new password'}
				</button>
			</form>

			<div style="text-align: center;">
				<a
					href="/forgot-password"
					style="font-size: 12.5px; color: var(--pr-tx); font-weight: 600; text-decoration: none;"
				>
					Request a new link
				</a>
			</div>
		{/if}
	</div>
</AuthShell>
