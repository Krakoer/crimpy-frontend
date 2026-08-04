export const authLabel =
	'display: block; font-size: 11px; color: var(--tx3); letter-spacing: 0.06em; text-transform: uppercase; font-weight: 600; margin-bottom: 6px;';

export const authInput =
	'width: 100%; border: 1px solid var(--bd); border-radius: var(--rs); padding: 10px 12px; font-family: var(--font); font-size: 13.5px; color: var(--tx); outline: none; background: #fff;';

export const authPrimaryButton =
	'width: 100%; padding: 11px 16px; border-radius: var(--rs); background: var(--pr); color: #fff; border: 1px solid var(--pr); font-size: 13.5px; font-weight: 600; cursor: pointer; font-family: var(--font);';

export const authSecondaryButton =
	'padding: 9px 16px; border-radius: var(--rs); background: #fff; color: var(--tx); border: 1px solid var(--bd); font-size: 13px; font-weight: 600; cursor: pointer; font-family: var(--font);';

const bannerTones = {
	error: 'border-color: var(--rd); background: #fdf3f3; color: var(--rd);',
	success: 'border-color: var(--gn); background: #f3f8f4; color: var(--gn);',
	notice: 'border-color: var(--bd); background: var(--panel2); color: var(--tx2);'
};

export type AuthBannerTone = keyof typeof bannerTones;

export function authBanner(tone: AuthBannerTone): string {
	return `border: 1px solid; border-radius: var(--rs); padding: 11px 13px; font-size: 12.5px; line-height: 1.5; ${bannerTones[tone]}`;
}

const badgeTones = {
	primary: 'background: var(--pr-fog); border-color: var(--pr-lt);',
	success: 'background: #f3f8f4; border-color: #d8e5da;',
	error: 'background: #fdf3f3; border-color: #f0dada;',
	gold: 'background: #fdf7ee; border-color: #f0e3cd;'
};

export type AuthBadgeTone = keyof typeof badgeTones;

export function authBadge(tone: AuthBadgeTone): string {
	return `width: 52px; height: 52px; border-radius: 50%; border: 1px solid; display: inline-flex; align-items: center; justify-content: center; ${badgeTones[tone]}`;
}
