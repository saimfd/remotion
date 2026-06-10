import {test, vi} from 'vitest';

// Force the Safari code path (where `ctx.filter` on OffscreenCanvas is treated as
// unsupported, so filters are precomposited and applied via a regular <canvas>)
// on every engine. Chromium and Firefox honor `ctx.filter` on a regular <canvas>,
// so they actually render the fallback and we can screenshot it. Playwright's
// WebKit can't paint a canvas filter at all, so the test is skipped there (real
// Safari renders it correctly — that path just isn't reachable headlessly).
vi.mock('../drawing/offscreen-canvas-supports-filter', () => ({
	offscreenCanvasSupportsFilter: () => false,
}));

import {renderStillOnWeb} from '../render-still-on-web';
import '../symbol-dispose';
import {filterText} from './fixtures/text/filter-text';
import {testImage} from './utils';

// The fallback paints onto a regular <canvas>, so this test only means something
// on engines that honor `ctx.filter` there. Real Safari does; Playwright's
// headless WebKit does not — skip it there rather than assert a false negative.
const regularCanvasFilterWorks = (): boolean => {
	const canvas = document.createElement('canvas');
	canvas.width = 9;
	canvas.height = 9;
	const ctx = canvas.getContext('2d');
	if (!ctx) {
		return false;
	}

	ctx.filter = 'blur(3px)';
	ctx.fillStyle = 'white';
	ctx.fillRect(3, 3, 3, 3);
	return ctx.getImageData(0, 4, 1, 1).data[3] > 0;
};

test.skipIf(!regularCanvasFilterWorks())(
	'renders filters through the Safari (regular-canvas) fallback path',
	async () => {
		const blob = await (
			await renderStillOnWeb({
				licenseKey: 'free-license',
				composition: filterText,
				frame: 0,
				inputProps: {},
			})
		).blob({format: 'png'});

		await testImage({blob, testId: 'filter-safari-fallback'});
	},
);
