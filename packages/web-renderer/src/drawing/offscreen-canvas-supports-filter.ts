/**
 * WebKit (Safari) implements `ctx.filter` on `CanvasRenderingContext2D` but not
 * on `OffscreenCanvasRenderingContext2D` — setting it is a silent no-op. We use
 * an OffscreenCanvas for compositing, so we need to know at runtime whether the
 * filter property actually takes effect. If not, filters are routed through an
 * intermediate regular canvas instead (see `handle-filter.ts`).
 *
 * Detection is done by capability (drawing a blurred block and checking that it
 * bleeds), not by user-agent sniffing, consistent with the rest of the package.
 */
let cache: boolean | null = null;

export const offscreenCanvasSupportsFilter = (): boolean => {
	if (cache !== null) {
		return cache;
	}

	try {
		const size = 9;
		const canvas = new OffscreenCanvas(size, size);
		const ctx = canvas.getContext('2d', {willReadFrequently: true});
		if (!ctx) {
			cache = false;
			return cache;
		}

		ctx.filter = 'blur(3px)';
		ctx.fillStyle = 'white';
		// Fill only the center; a working blur bleeds opacity to the edges.
		ctx.fillRect(3, 3, 3, 3);

		const edgePixel = ctx.getImageData(0, 4, 1, 1).data;
		cache = edgePixel[3] > 0;
	} catch {
		// If detection fails for any reason, fall back to the intermediate-canvas
		// path, which is always correct (just slightly slower).
		cache = false;
	}

	return cache;
};
