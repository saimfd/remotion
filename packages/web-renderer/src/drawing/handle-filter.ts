import {getBiggestBoundingClientRect} from '../get-biggest-bounding-client-rect';
import {offscreenCanvasSupportsFilter} from './offscreen-canvas-supports-filter';

/**
 * Parses blur() values from a CSS filter string. Like drop-shadow, blur spreads
 * beyond the element bounds, so the precompose rect must be expanded to leave
 * room for the blurred halo. CSS blur-radius is a Gaussian standard deviation;
 * its visible extent is roughly 3σ.
 */
const parseBlurExpansion = (filter: string): number => {
	let maxBlur = 0;
	const blurRegex = /blur\(\s*([+-]?\d*\.?\d+)px\s*\)/gi;
	let match;

	while ((match = blurRegex.exec(filter)) !== null) {
		maxBlur = Math.max(maxBlur, parseFloat(match[1]));
	}

	return maxBlur * 3;
};

/**
 * Parses drop-shadow values from a CSS filter string to calculate
 * how much the precompose rect needs to be expanded.
 */
const parseDropShadowExpansion = (
	filter: string,
): {left: number; right: number; top: number; bottom: number} => {
	const expansion = {left: 0, right: 0, top: 0, bottom: 0};

	// Match drop-shadow function with support for nested parentheses (e.g., rgba() inside drop-shadow())
	// getComputedStyle returns colors as rgb()/rgba(), so we need to handle one level of nesting
	const dropShadowRegex = /drop-shadow\(((?:[^()]+|\([^()]*\))+)\)/gi;
	let match;

	while ((match = dropShadowRegex.exec(filter)) !== null) {
		const params = match[1].trim();

		// Extract numeric values (offsets and blur)
		// The values can be in pixels, and we need to handle negative values
		const numbers: number[] = [];
		const numberRegex = /([+-]?\d*\.?\d+)(?:px)?/g;
		let numMatch;
		while ((numMatch = numberRegex.exec(params)) !== null) {
			// Skip if this is part of a color (like rgb values)
			const beforeMatch = params.slice(0, numMatch.index);
			if (!/(?:rgba?|hsla?)\([^)]*$/i.test(beforeMatch)) {
				numbers.push(parseFloat(numMatch[1]));
			}
		}

		// drop-shadow takes: offset-x, offset-y, [blur-radius]
		// Standard order is: offset-x offset-y blur color
		// or: offset-x offset-y color
		if (numbers.length >= 2) {
			const offsetX = numbers[0];
			const offsetY = numbers[1];
			const blurRadius = numbers.length >= 3 ? numbers[2] : 0;

			// Expand the rect to account for shadow offset and blur
			// CSS drop-shadow blur-radius is a Gaussian standard deviation
			// Visible extent is approximately 3σ, so we multiply by 3
			const blurSpread = blurRadius * 3;

			if (offsetX > 0) {
				expansion.right = Math.max(expansion.right, offsetX + blurSpread);
				expansion.left = Math.max(expansion.left, blurSpread);
			} else {
				expansion.left = Math.max(
					expansion.left,
					Math.abs(offsetX) + blurSpread,
				);
				expansion.right = Math.max(expansion.right, blurSpread);
			}

			if (offsetY > 0) {
				expansion.bottom = Math.max(expansion.bottom, offsetY + blurSpread);
				expansion.top = Math.max(expansion.top, blurSpread);
			} else {
				expansion.top = Math.max(expansion.top, Math.abs(offsetY) + blurSpread);
				expansion.bottom = Math.max(expansion.bottom, blurSpread);
			}
		}
	}

	return expansion;
};

/**
 * Gets the precompose rect for an element with a filter that requires precompositing.
 * Expands the element's bounding rect (including all children) to accommodate drop-shadow spread.
 */
export const getPrecomposeRectForFilter = ({
	element,
	filter,
}: {
	element: HTMLElement | SVGElement;
	filter: string;
}): DOMRect => {
	// Use getBiggestBoundingClientRect to include all children that may overflow
	const elementRect = getBiggestBoundingClientRect(element);
	const dropShadow = parseDropShadowExpansion(filter);
	// blur() spreads symmetrically on all sides.
	const blur = parseBlurExpansion(filter);

	const expansion = {
		left: dropShadow.left + blur,
		right: dropShadow.right + blur,
		top: dropShadow.top + blur,
		bottom: dropShadow.bottom + blur,
	};

	return new DOMRect(
		elementRect.left - expansion.left,
		elementRect.top - expansion.top,
		elementRect.width + expansion.left + expansion.right,
		elementRect.height + expansion.top + expansion.bottom,
	);
};

/**
 * Applies a filter when drawing a precomposed canvas to the main context.
 *
 * On Safari, where `ctx.filter` is a no-op on OffscreenCanvas, the draw is redirected onto
 * an intermediate regular `<canvas>` (which does honor the filter) and the
 * filtered result is composited back — `drawImage` itself needs no filter.
 */
export const applyFilterToDrawOperation = ({
	context,
	filter,
	drawFn,
}: {
	context: OffscreenCanvasRenderingContext2D;
	filter: string;
	drawFn: (
		target: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D,
	) => void;
}) => {
	if (offscreenCanvasSupportsFilter()) {
		const previousFilter = context.filter;
		context.filter = filter;
		drawFn(context);
		context.filter = previousFilter;
		return;
	}

	const temp = document.createElement('canvas');
	temp.width = context.canvas.width;
	temp.height = context.canvas.height;
	const tempCtx = temp.getContext('2d');
	if (!tempCtx) {
		// Should not happen; draw without the filter rather than nothing.
		drawFn(context);
		return;
	}

	const currentTransform = context.getTransform();
	tempCtx.setTransform(currentTransform);
	tempCtx.filter = filter;
	drawFn(tempCtx);

	context.setTransform(new DOMMatrix());
	context.drawImage(temp, 0, 0);
	context.setTransform(currentTransform);
};
