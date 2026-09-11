import { describe, expect, it } from 'vitest';
import { videoLinkHref } from './video-link';

describe('videoLinkHref', () => {
	it('takes an http and an https address as written', () => {
		expect(videoLinkHref('https://example.com/pull-up')).toBe('https://example.com/pull-up');
		expect(videoLinkHref('http://example.com/pull-up')).toBe('http://example.com/pull-up');
	});

	it('trims what the coach typed', () => {
		expect(videoLinkHref('  https://example.com/x  ')).toBe('https://example.com/x');
	});

	// What a coach actually types. The app reads it this way too, and the two
	// surfaces have to agree about the same stored value.
	it('reads a scheme-less address as https', () => {
		expect(videoLinkHref('www.youtube.com/watch?v=abc')).toBe(
			'https://www.youtube.com/watch?v=abc'
		);
		expect(videoLinkHref('youtu.be/dQw4w9WgXcQ')).toBe('https://youtu.be/dQw4w9WgXcQ');
	});

	it('takes a scheme-less address that carries a port', () => {
		expect(videoLinkHref('example.com:8080/v')).toBe('https://example.com:8080/v');
		expect(videoLinkHref('192.168.1.5:8080/demo.mp4')).toBe('https://192.168.1.5:8080/demo.mp4');
	});

	it('refuses prose, with or without a full stop in it', () => {
		expect(videoLinkHref('ask me for the video')).toBeNull();
		expect(videoLinkHref('Ask me. I will show you')).toBeNull();
		expect(videoLinkHref('3 series de 10. Cf. la video')).toBeNull();
		expect(videoLinkHref('e.g. slowly')).toBeNull();
	});

	// The reason this function exists: a coach's value reaches another coach
	// through a session's frozen prescription.
	it('refuses a scheme a browser should not be handed', () => {
		expect(videoLinkHref("javascript:alert('xss')")).toBeNull();
		expect(videoLinkHref("JavaScript:alert('xss')")).toBeNull();
		expect(videoLinkHref('javascript:void(0)//example.com/x')).toBeNull();
		expect(videoLinkHref('data:text/html,<script>alert(1)</script>')).toBeNull();
		expect(videoLinkHref('file:///etc/passwd')).toBeNull();
		expect(videoLinkHref('intent://example.com/x')).toBeNull();
		expect(videoLinkHref('//evil.com/x')).toBeNull();
	});

	it('refuses an empty or missing value, and an address with no host', () => {
		expect(videoLinkHref(null)).toBeNull();
		expect(videoLinkHref(undefined)).toBeNull();
		expect(videoLinkHref('   ')).toBeNull();
		expect(videoLinkHref('https://')).toBeNull();
	});
});
