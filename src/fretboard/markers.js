/**
 * SVG note-shape marker drawing. Pure with respect to app state - takes a
 * position, size and shape name, returns a detached SVG element - but does
 * touch the DOM (document.createElementNS) to build that element, so it
 * isn't framework-free the way src/fretboard/geometry.js is.
 *
 * Used by the Scale Position Grid's mini-fretboard renderer and legend
 * (createScalePositionMiniFretboard / its legend in
 * src/fretboard/ui/scalePositionGrid.js) to draw each dot as one of
 * NOTE_SHAPE_TYPES instead of always a circle.
 *
 * Lifted from src/frets.js as part of REFACTOR_PLAN.md Phase 3.
 */

export function createNoteShapeMarker(x, y, radius, shapeType, fill, stroke, strokeWidth, dashed = false) {
    const ns = 'http://www.w3.org/2000/svg';
    let marker;

    switch (shapeType) {
        case 'square': {
            marker = document.createElementNS(ns, 'rect');
            marker.setAttribute('x', String(x - radius));
            marker.setAttribute('y', String(y - radius));
            marker.setAttribute('width', String(radius * 2));
            marker.setAttribute('height', String(radius * 2));
            break;
        }
        case 'diamond': {
            marker = document.createElementNS(ns, 'polygon');
            marker.setAttribute('points', `${x},${y - radius} ${x + radius},${y} ${x},${y + radius} ${x - radius},${y}`);
            break;
        }
        case 'triangle-up': {
            marker = document.createElementNS(ns, 'polygon');
            marker.setAttribute('points', `${x},${y - radius} ${x + radius},${y + radius} ${x - radius},${y + radius}`);
            break;
        }
        case 'triangle-down': {
            marker = document.createElementNS(ns, 'polygon');
            marker.setAttribute('points', `${x - radius},${y - radius} ${x + radius},${y - radius} ${x},${y + radius}`);
            break;
        }
        case 'triangle-right': {
            marker = document.createElementNS(ns, 'polygon');
            marker.setAttribute('points', `${x - radius},${y - radius} ${x - radius},${y + radius} ${x + radius},${y}`);
            break;
        }
        case 'triangle-left': {
            marker = document.createElementNS(ns, 'polygon');
            marker.setAttribute('points', `${x + radius},${y - radius} ${x + radius},${y + radius} ${x - radius},${y}`);
            break;
        }
        case 'pentagon': {
            marker = document.createElementNS(ns, 'polygon');
            const points = [];
            for (let i = 0; i < 5; i++) {
                const a = (-Math.PI / 2) + (i * (2 * Math.PI / 5));
                points.push(`${x + radius * Math.cos(a)},${y + radius * Math.sin(a)}`);
            }
            marker.setAttribute('points', points.join(' '));
            break;
        }
        case 'hexagon': {
            marker = document.createElementNS(ns, 'polygon');
            const points = [];
            for (let i = 0; i < 6; i++) {
                const a = (Math.PI / 6) + (i * (2 * Math.PI / 6));
                points.push(`${x + radius * Math.cos(a)},${y + radius * Math.sin(a)}`);
            }
            marker.setAttribute('points', points.join(' '));
            break;
        }
        case 'star': {
            marker = document.createElementNS(ns, 'polygon');
            const points = [];
            const inner = radius * 0.45;
            for (let i = 0; i < 10; i++) {
                const r = i % 2 === 0 ? radius : inner;
                const a = (-Math.PI / 2) + (i * (Math.PI / 5));
                points.push(`${x + r * Math.cos(a)},${y + r * Math.sin(a)}`);
            }
            marker.setAttribute('points', points.join(' '));
            break;
        }
        case 'plus':
        case 'cross': {
            marker = document.createElementNS(ns, 'g');
            const l1 = document.createElementNS(ns, 'line');
            const l2 = document.createElementNS(ns, 'line');
            const outline1 = document.createElementNS(ns, 'line');
            const outline2 = document.createElementNS(ns, 'line');
            if (shapeType === 'plus') {
                l1.setAttribute('x1', String(x - radius));
                l1.setAttribute('y1', String(y));
                l1.setAttribute('x2', String(x + radius));
                l1.setAttribute('y2', String(y));
                l2.setAttribute('x1', String(x));
                l2.setAttribute('y1', String(y - radius));
                l2.setAttribute('x2', String(x));
                l2.setAttribute('y2', String(y + radius));

                outline1.setAttribute('x1', String(x - radius));
                outline1.setAttribute('y1', String(y));
                outline1.setAttribute('x2', String(x + radius));
                outline1.setAttribute('y2', String(y));
                outline2.setAttribute('x1', String(x));
                outline2.setAttribute('y1', String(y - radius));
                outline2.setAttribute('x2', String(x));
                outline2.setAttribute('y2', String(y + radius));
            } else {
                l1.setAttribute('x1', String(x - radius));
                l1.setAttribute('y1', String(y - radius));
                l1.setAttribute('x2', String(x + radius));
                l1.setAttribute('y2', String(y + radius));
                l2.setAttribute('x1', String(x - radius));
                l2.setAttribute('y1', String(y + radius));
                l2.setAttribute('x2', String(x + radius));
                l2.setAttribute('y2', String(y - radius));

                outline1.setAttribute('x1', String(x - radius));
                outline1.setAttribute('y1', String(y - radius));
                outline1.setAttribute('x2', String(x + radius));
                outline1.setAttribute('y2', String(y + radius));
                outline2.setAttribute('x1', String(x - radius));
                outline2.setAttribute('y1', String(y + radius));
                outline2.setAttribute('x2', String(x + radius));
                outline2.setAttribute('y2', String(y - radius));
            }

            const mainWidth = Math.max(1, radius * 0.55);
            const outlineWidth = mainWidth + Math.max(0, Number(strokeWidth) || 0) * 1.2;

            // For line-only shapes, keep the note color as the primary stroke.
            l1.setAttribute('stroke', fill);
            l2.setAttribute('stroke', fill);
            l1.setAttribute('stroke-width', String(mainWidth));
            l2.setAttribute('stroke-width', String(mainWidth));
            l1.setAttribute('stroke-linecap', 'round');
            l2.setAttribute('stroke-linecap', 'round');

            if (stroke && stroke !== fill) {
                outline1.setAttribute('stroke', stroke);
                outline2.setAttribute('stroke', stroke);
                outline1.setAttribute('stroke-width', String(outlineWidth));
                outline2.setAttribute('stroke-width', String(outlineWidth));
                outline1.setAttribute('stroke-linecap', 'round');
                outline2.setAttribute('stroke-linecap', 'round');
                marker.appendChild(outline1);
                marker.appendChild(outline2);
            }

            if (dashed) {
                const dashPattern = `${Math.max(1, radius * 0.4)},${Math.max(1, radius * 0.3)}`;
                l1.setAttribute('stroke-dasharray', dashPattern);
                l2.setAttribute('stroke-dasharray', dashPattern);
            }

            marker.appendChild(l1);
            marker.appendChild(l2);
            return marker;
        }
        case 'circle':
        default: {
            marker = document.createElementNS(ns, 'circle');
            marker.setAttribute('cx', String(x));
            marker.setAttribute('cy', String(y));
            marker.setAttribute('r', String(radius));
            break;
        }
    }

    marker.setAttribute('fill', fill);
    marker.setAttribute('stroke', stroke);
    marker.setAttribute('stroke-width', String(strokeWidth));
    if (dashed) {
        marker.setAttribute('stroke-dasharray', `${Math.max(1, radius * 0.4)},${Math.max(1, radius * 0.3)}`);
    }
    return marker;
}
