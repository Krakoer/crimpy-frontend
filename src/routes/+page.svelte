<script lang="ts">
	import { authStore } from '$lib/stores/auth.svelte';
	import { goto } from '$app/navigation';
	import AuthShell from '$lib/components/AuthShell.svelte';
	import { authBanner, authInput, authLabel, authPrimaryButton } from '$lib/components/auth-styles';

	let { data } = $props();

	let activeTab = $state<'login' | 'register'>('login');
	let email = $state('');
	let password = $state('');
	let firstname = $state('');
	let lastname = $state('');
	let error = $state('');
	let loading = $state(false);

	async function handleLogin() {
		error = '';
		loading = true;
		try {
			await authStore.login(email, password);
			authStore.saveUser();
			if (!authStore.isEmailVerified) {
				goto('/verify-email');
			} else if (authStore.isAdmin) {
				goto('/admin');
			} else if (authStore.isCoach && !authStore.isValidatedCoach) {
				goto('/pending-validation');
			} else {
				goto(data.returnUrl || '/dashboard');
			}
		} catch (e) {
			error = e instanceof Error ? e.message : 'Login failed';
		} finally {
			loading = false;
		}
	}

	async function handleRegister() {
		error = '';
		loading = true;
		try {
			await authStore.register(email, password, firstname, lastname, true);
			authStore.saveUser();
			goto('/verify-email');
		} catch (e) {
			error = e instanceof Error ? e.message : 'Registration failed';
		} finally {
			loading = false;
		}
	}

	function resetForm() {
		email = '';
		password = '';
		firstname = '';
		lastname = '';
		error = '';
	}

	function switchTab(tab: 'login' | 'register') {
		activeTab = tab;
		resetForm();
	}

	function tabStyle(tab: 'login' | 'register'): string {
		const active = activeTab === tab;
		return `
			flex: 1; padding: 7px 12px; border-radius: 6px; border: none; cursor: pointer;
			font-family: var(--font); font-size: 12.5px; font-weight: 600;
			background: ${active ? '#fff' : 'transparent'};
			color: ${active ? 'var(--pr)' : 'var(--tx2)'};
			box-shadow: ${active ? 'var(--sh)' : 'none'};
		`;
	}
</script>

<AuthShell title={activeTab === 'login' ? 'Sign in' : 'Register as coach'}>
	<div style="padding: 24px 26px; display: flex; flex-direction: column; gap: 18px;">
		<div
			style="display: flex; gap: 4px; padding: 4px; background: var(--panel2); border: 1px solid var(--bd2); border-radius: var(--rs);"
		>
			<button style={tabStyle('login')} onclick={() => switchTab('login')}>Sign in</button>
			<button style={tabStyle('register')} onclick={() => switchTab('register')}>
				Register as coach
			</button>
		</div>

		{#if error}
			<div style={authBanner('error')}>{error}</div>
		{/if}

		{#if activeTab === 'login'}
			<form
				style="display: flex; flex-direction: column; gap: 16px;"
				onsubmit={(e) => {
					e.preventDefault();
					handleLogin();
				}}
			>
				<div>
					<label for="login-email" style={authLabel}>Email</label>
					<input
						id="login-email"
						bind:value={email}
						required
						style={authInput}
						placeholder="coach@example.com"
					/>
				</div>

				<div>
					<label for="login-password" style={authLabel}>Password</label>
					<input
						id="login-password"
						type="password"
						bind:value={password}
						required
						style={authInput}
					/>
				</div>

				<button
					type="submit"
					disabled={loading}
					style="{authPrimaryButton} opacity: {loading ? 0.5 : 1};"
				>
					{loading ? 'Signing in...' : 'Sign in'}
				</button>
			</form>
		{:else}
			<form
				style="display: flex; flex-direction: column; gap: 16px;"
				onsubmit={(e) => {
					e.preventDefault();
					handleRegister();
				}}
			>
				<div style="display: flex; gap: 12px;">
					<div style="flex: 1; min-width: 0;">
						<label for="reg-firstname" style={authLabel}>First name</label>
						<input
							id="reg-firstname"
							type="text"
							bind:value={firstname}
							required
							style={authInput}
						/>
					</div>
					<div style="flex: 1; min-width: 0;">
						<label for="reg-lastname" style={authLabel}>Last name</label>
						<input id="reg-lastname" type="text" bind:value={lastname} required style={authInput} />
					</div>
				</div>

				<div>
					<label for="reg-email" style={authLabel}>Email</label>
					<input
						id="reg-email"
						type="email"
						bind:value={email}
						required
						style={authInput}
						placeholder="coach@example.com"
					/>
				</div>

				<div>
					<label for="reg-password" style={authLabel}>Password</label>
					<input
						id="reg-password"
						type="password"
						bind:value={password}
						required
						minlength="6"
						style={authInput}
					/>
				</div>

				<div style={authBanner('notice')}>
					You will need to verify your email address and then wait for admin validation before
					access.
				</div>

				<button
					type="submit"
					disabled={loading}
					style="{authPrimaryButton} opacity: {loading ? 0.5 : 1};"
				>
					{loading ? 'Creating account...' : 'Register as coach'}
				</button>
			</form>
		{/if}
	</div>
</AuthShell>
