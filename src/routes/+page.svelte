<script lang="ts">
	import { authStore } from '$lib/stores/auth.svelte';
	import { goto } from '$app/navigation';

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

		<div class="border-2 border-black bg-white">
			<div class="flex border-b-2 border-black">
				<button
					class="flex-1 px-4 py-3 font-medium transition-colors"
					style="font-family: monospace; font-size: 13px; background-color: {activeTab === 'login'
						? '#C6613F'
						: 'white'}; color: {activeTab === 'login' ? 'white' : 'black'};"
					onclick={() => switchTab('login')}
				>
					LOGIN
				</button>
				<div class="w-0.5 bg-black"></div>
				<button
					class="flex-1 px-4 py-3 font-medium transition-colors"
					style="font-family: monospace; font-size: 13px; background-color: {activeTab ===
					'register'
						? '#C6613F'
						: 'white'}; color: {activeTab === 'register' ? 'white' : 'black'};"
					onclick={() => switchTab('register')}
				>
					REGISTER AS COACH
				</button>
			</div>

			<div class="p-6">
				{#if error}
					<div
						class="mb-4 border border-red-600 bg-red-50 p-3"
						style="font-family: monospace; font-size: 12px; color: #B85450;"
					>
						{error}
					</div>
				{/if}

				{#if activeTab === 'login'}
					<form
						onsubmit={(e) => {
							e.preventDefault();
							handleLogin();
						}}
					>
						<div class="mb-4">
							<label
								class="mb-2 block font-medium"
								style="font-family: monospace; font-size: 12px; color: #666; letter-spacing: 0.5px;"
							>
								EMAIL
							</label>
							<input
								bind:value={email}
								required
								class="w-full border border-black bg-white px-3 py-2"
								style="font-family: monospace; font-size: 14px;"
								placeholder="coach@example.com"
							/>
						</div>

						<div class="mb-6">
							<label
								class="mb-2 block font-medium"
								style="font-family: monospace; font-size: 12px; color: #666; letter-spacing: 0.5px;"
							>
								PASSWORD
							</label>
							<input
								type="password"
								bind:value={password}
								required
								class="w-full border border-black bg-white px-3 py-2"
								style="font-family: monospace; font-size: 14px;"
							/>
						</div>

						<button
							type="submit"
							disabled={loading}
							class="w-full px-4 py-3 font-medium transition-opacity"
							style="font-family: monospace; font-size: 13px; background-color: #C6613F; color: white; opacity: {loading
								? 0.6
								: 1};"
						>
							{loading ? 'LOGGING IN...' : 'LOGIN'}
						</button>
					</form>
				{:else}
					<form
						onsubmit={(e) => {
							e.preventDefault();
							handleRegister();
						}}
					>
						<div class="mb-4">
							<label
								class="mb-2 block font-medium"
								style="font-family: monospace; font-size: 12px; color: #666; letter-spacing: 0.5px;"
							>
								FIRST NAME
							</label>
							<input
								type="text"
								bind:value={firstname}
								required
								class="w-full border border-black bg-white px-3 py-2"
								style="font-family: monospace; font-size: 14px;"
							/>
						</div>

						<div class="mb-4">
							<label
								class="mb-2 block font-medium"
								style="font-family: monospace; font-size: 12px; color: #666; letter-spacing: 0.5px;"
							>
								LAST NAME
							</label>
							<input
								type="text"
								bind:value={lastname}
								required
								class="w-full border border-black bg-white px-3 py-2"
								style="font-family: monospace; font-size: 14px;"
							/>
						</div>

						<div class="mb-4">
							<label
								class="mb-2 block font-medium"
								style="font-family: monospace; font-size: 12px; color: #666; letter-spacing: 0.5px;"
							>
								EMAIL
							</label>
							<input
								type="email"
								bind:value={email}
								required
								class="w-full border border-black bg-white px-3 py-2"
								style="font-family: monospace; font-size: 14px;"
								placeholder="coach@example.com"
							/>
						</div>

						<div class="mb-4">
							<label
								class="mb-2 block font-medium"
								style="font-family: monospace; font-size: 12px; color: #666; letter-spacing: 0.5px;"
							>
								PASSWORD
							</label>
							<input
								type="password"
								bind:value={password}
								required
								minlength="6"
								class="w-full border border-black bg-white px-3 py-2"
								style="font-family: monospace; font-size: 14px;"
							/>
						</div>

						<div class="mb-6 border border-yellow-600 bg-yellow-50 p-3">
							<p
								class="text-yellow-700"
								style="font-family: monospace; font-size: 12px; font-weight: 500;"
							>
								You will need to verify your email address and then wait for admin validation before
								access.
							</p>
						</div>

						<button
							type="submit"
							disabled={loading}
							class="w-full px-4 py-3 font-medium transition-opacity"
							style="font-family: monospace; font-size: 13px; background-color: #C6613F; color: white; opacity: {loading
								? 0.6
								: 1};"
						>
							{loading ? 'REGISTERING...' : 'REGISTER AS COACH'}
						</button>
					</form>
				{/if}
			</div>
		</div>
	</div>
</div>
