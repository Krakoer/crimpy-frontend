type SnackbarType = 'success' | 'error';

let message = $state('');
let type = $state<SnackbarType>('success');
let visible = $state(false);
let timer: ReturnType<typeof setTimeout> | null = null;

export const snackbar = {
	get message() { return message; },
	get type() { return type; },
	get visible() { return visible; },
	show(msg: string, t: SnackbarType = 'success') {
		if (timer) clearTimeout(timer);
		message = msg;
		type = t;
		visible = true;
		timer = setTimeout(() => { visible = false; }, 3000);
	},
	dismiss() {
		if (timer) clearTimeout(timer);
		visible = false;
	}
};
