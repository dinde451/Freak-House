// FREAK HOUSE RENDERER
// Dinde451

(function (root) {
	"use strict";

	const toNumber = (v) => {
		if (typeof v === "number") return isNaN(v) ? 0 : v;
		const n = Number(v);
		return isNaN(n) ? 0 : n;
	};

	const hexToRgb = (hex) => {
		hex = String(hex).replace(
			/^#?([a-f\d])([a-f\d])([a-f\d])$/i,
			(m, r, g, b) => r + r + g + g + b + b,
		);
		const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
		return m
			? {
					r: parseInt(m[1], 16),
					g: parseInt(m[2], 16),
					b: parseInt(m[3], 16),
				}
			: null;
	};

	const toRgb = (value) => {
		if (typeof value === "string" && value.substring(0, 1) === "#") {
			return hexToRgb(value) || { r: 0, g: 0, b: 0 };
		}
		const d = toNumber(value);
		return { r: (d >> 16) & 0xff, g: (d >> 8) & 0xff, b: d & 0xff };
	};

	const rgbToHsv = (r, g, b) => {
		r /= 255;
		g /= 255;
		b /= 255;
		const x = Math.min(r, g, b);
		const v = Math.max(r, g, b);
		let h = 0;
		let s = 0;
		if (x !== v) {
			const f = r === x ? g - b : g === x ? b - r : r - g;
			const i = r === x ? 3 : g === x ? 5 : 1;
			h = ((i - f / (v - x)) / 6) % 1;
			s = (v - x) / v;
		}
		return { h: h * 360, s, v };
	};

	const hsvToPacked = (h, s, v) => {
		h = h % 360;
		if (h < 0) h += 360;
		s = Math.max(0, Math.min(s, 1));
		v = Math.max(0, Math.min(v, 1));
		const i = Math.floor(h / 60);
		const f = h / 60 - i;
		const p = v * (1 - s);
		const q = v * (1 - s * f);
		const t = v * (1 - s * (1 - f));
		let r, g, b;
		switch (i) {
			default:
			case 0:
				r = v;
				g = t;
				b = p;
				break;
			case 1:
				r = q;
				g = v;
				b = p;
				break;
			case 2:
				r = p;
				g = v;
				b = t;
				break;
			case 3:
				r = p;
				g = q;
				b = v;
				break;
			case 4:
				r = t;
				g = p;
				b = v;
				break;
			case 5:
				r = v;
				g = p;
				b = q;
				break;
		}
		return (
			((255 << 24) |
				(Math.floor(b * 255) << 16) |
				(Math.floor(g * 255) << 8) |
				Math.floor(r * 255)) >>>
			0
		);
	};

	const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
	const isWhiteSpace = (v) =>
		v === null || (typeof v === "string" && v.trim().length === 0);

	const compare = (v1, v2) => {
		let n1 = Number(v1);
		let n2 = Number(v2);
		if (n1 === 0 && isWhiteSpace(v1)) n1 = NaN;
		else if (n2 === 0 && isWhiteSpace(v2)) n2 = NaN;
		if (isNaN(n1) || isNaN(n2)) {
			const s1 = String(v1).toLowerCase();
			const s2 = String(v2).toLowerCase();
			if (s1 < s2) return -1;
			if (s1 > s2) return 1;
			return 0;
		}
		return n1 - n2;
	};
	const looseEquals = (a, b) => compare(a, b) === 0;
	const parsePalette = (items) => {
		const out = [];
		const isNum = (t) => t !== undefined && t !== "" && !isNaN(Number(t));
		for (const item of items) {
			const tok = String(item)
				.trim()
				.split(/[\s,;]+/);
			if (!tok[0]) continue;
			const rgb = toRgb(
				/^[0-9a-f]{3}$|^[0-9a-f]{6}$/i.test(tok[0])
					? "#" + tok[0]
					: tok[0],
			);
			const e = { r: rgb.r, g: rgb.g, b: rgb.b, a: 0, t: 0 };
			if (isNum(tok[1]) && isNum(tok[2])) {
				e.a = Math.max(0, Math.floor(Number(tok[1])));
				e.t = Math.max(0, Math.floor(Number(tok[2])));
			} else if (tok[1] !== undefined) {
				e.name = tok[1];
			}
			out.push(e);
		}
		return out;
	};

	const tilePos = (idx, ts, atlasW) => {
		const perRow = Math.max(1, Math.floor(atlasW / ts));
		return { a: idx % perRow, t: Math.floor(idx / perRow), perRow };
	};

	const composeAtlas = (tiles, ts, atlasW) => {
		const perRow = Math.max(1, Math.floor(atlasW / ts));
		const rows = Math.max(1, Math.ceil(tiles.length / perRow));
		const out = new Array(atlasW * rows * ts).fill(0);
		for (let i = 0; i < tiles.length; i++) {
			const d = tiles[i];
			const a = i % perRow;
			const b = Math.floor(i / perRow);
			for (let y = 0; y < ts; y++) {
				const base = (b * ts + y) * atlasW + a * ts;
				for (let x = 0; x < ts; x++) {
					const o = (y * ts + x) * 4;
					out[base + x] = d[o] * 65536 + d[o + 1] * 256 + d[o + 2];
				}
			}
		}
		return { list: out, rows, perRow };
	};

	const classify = (rgba, palette, isMask) => {
		const n = rgba.length >> 2;
		const out = new Uint8Array(n);
		let lr = -1,
			lg = -1,
			lb = -1,
			lidx = 255;
		for (let i = 0; i < n; i++) {
			const o = i << 2;
			if (rgba[o + 3] < 128) {
				out[i] = 255;
				continue;
			}
			if (isMask) {
				out[i] = 1;
				continue;
			}
			const r = rgba[o],
				g = rgba[o + 1],
				b = rgba[o + 2];
			if (r !== lr || g !== lg || b !== lb) {
				let best = 1e9;
				lidx = 255;
				for (let k = 0; k < palette.length && k < 250; k++) {
					const p = palette[k];
					const d =
						(p.r - r) * (p.r - r) +
						(p.g - g) * (p.g - g) +
						(p.b - b) * (p.b - b);
					if (d < best) {
						best = d;
						lidx = k;
					}
				}
				lr = r;
				lg = g;
				lb = b;
			}
			out[i] = lidx;
		}
		return out;
	};

	const edt1d = (f, n, d, v, z) => {
		let k = 0;
		v[0] = 0;
		z[0] = -Infinity;
		z[1] = Infinity;
		for (let q = 1; q < n; q++) {
			let s =
				(f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
			while (s <= z[k]) {
				k--;
				s =
					(f[q] + q * q - (f[v[k]] + v[k] * v[k])) /
					(2 * q - 2 * v[k]);
			}
			k++;
			v[k] = q;
			z[k] = s;
			z[k + 1] = Infinity;
		}
		k = 0;
		for (let q = 0; q < n; q++) {
			while (z[k + 1] < q) k++;
			d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
		}
	};

	const classifyRoof = (rgba, W, H, palette) => {
		const n = W * H;
		const pal = palette || [];
		const codes = new Uint8Array(n);
		let any = false;
		let hasWhite = false;
		let lr = -1,
			lg = -1,
			lb = -1,
			lc = 0;
		for (let i = 0; i < n; i++) {
			const o = i << 2;
			if (rgba[o + 3] < 128) continue;
			const r = rgba[o],
				g = rgba[o + 1],
				b = rgba[o + 2];
			if (r >= 235 && g >= 235 && b >= 235) {
				codes[i] = 1;
				hasWhite = true;
				continue;
			}
			if (r !== lr || g !== lg || b !== lb) {
				lr = r;
				lg = g;
				lb = b;
				lc = 0;
				if (pal.length) {
					let best = 1e9;
					for (let k = 0; k < pal.length && k < 250; k++) {
						const p = pal[k];
						const d =
							(p.r - r) * (p.r - r) +
							(p.g - g) * (p.g - g) +
							(p.b - b) * (p.b - b);
						if (d < best) {
							best = d;
							lc = k + 2;
						}
					}
					if (best > 6400) lc = 0;
				} else if (r <= 55 && g <= 55 && b <= 55) lc = 2;
			}
			codes[i] = lc;
			if (lc >= 2) any = true;
		}
		const frac = new Float32Array(n);
		const enc = new Uint8Array(n);
		if (!any) return { codes, frac, enc, hasWhite };
		{
			const seen = new Uint8Array(n);
			const q = new Int32Array(n);
			let qh = 0,
				qt = 0;
			const push = (i) => {
				if (!seen[i] && codes[i] < 2) {
					seen[i] = 1;
					q[qt++] = i;
				}
			};
			for (let x = 0; x < W; x++) {
				push(x);
				push((H - 1) * W + x);
			}
			for (let y = 0; y < H; y++) {
				push(y * W);
				push(y * W + W - 1);
			}
			while (qh < qt) {
				const c = q[qh++];
				const cx = c % W;
				if (cx > 0) push(c - 1);
				if (cx < W - 1) push(c + 1);
				if (c >= W) push(c - W);
				if (c < n - W) push(c + W);
			}
			for (let i = 0; i < n; i++)
				if (codes[i] < 2 && !seen[i]) enc[i] = 1;
		}
		
		const INF = 1e12;
		const d2 = new Float64Array(n);
		for (let y = 0; y < H; y++) {
			for (let x = 0; x < W; x++) {
				const i = y * W + x;
				const c = codes[i];
				if (c < 2) {
					d2[i] = INF;
					continue;
				}
				const edge =
					x === 0 ||
					y === 0 ||
					x === W - 1 ||
					y === H - 1 ||
					codes[i - 1] !== c ||
					codes[i + 1] !== c ||
					codes[i - W] !== c ||
					codes[i + W] !== c;
				d2[i] = edge ? 0 : INF;
			}
		}
		const m = Math.max(W, H);
		const f = new Float64Array(m),
			d = new Float64Array(m),
			v = new Int32Array(m),
			z = new Float64Array(m + 1);
		for (let x = 0; x < W; x++) {
			for (let y = 0; y < H; y++) f[y] = d2[y * W + x];
			edt1d(f, H, d, v, z);
			for (let y = 0; y < H; y++) d2[y * W + x] = d[y];
		}
		for (let y = 0; y < H; y++) {
			for (let x = 0; x < W; x++) f[x] = d2[y * W + x];
			edt1d(f, W, d, v, z);
			for (let x = 0; x < W; x++) d2[y * W + x] = d[x];
		}

		const label = new Int32Array(n);
		const stack = new Int32Array(n);
		const maxD = [0];
		let nl = 0;
		for (let i = 0; i < n; i++) {
			const c0 = codes[i];
			if (c0 < 2 || label[i]) continue;
			nl++;
			let best = 0;
			let sp = 0;
			stack[sp++] = i;
			label[i] = nl;
			while (sp) {
				const c = stack[--sp];
				const cx = c % W;
				if (d2[c] > best) best = d2[c];
				if (cx > 0 && codes[c - 1] === c0 && !label[c - 1]) {
					label[c - 1] = nl;
					stack[sp++] = c - 1;
				}
				if (cx < W - 1 && codes[c + 1] === c0 && !label[c + 1]) {
					label[c + 1] = nl;
					stack[sp++] = c + 1;
				}
				if (c >= W && codes[c - W] === c0 && !label[c - W]) {
					label[c - W] = nl;
					stack[sp++] = c - W;
				}
				if (c < n - W && codes[c + W] === c0 && !label[c + W]) {
					label[c + W] = nl;
					stack[sp++] = c + W;
				}
			}
			maxD.push(Math.sqrt(best));
		}
		for (let i = 0; i < n; i++) {
			if (codes[i] < 2) continue;
			frac[i] = clamp(
				(Math.sqrt(d2[i]) + 0.5) / (maxD[label[i]] + 0.5),
				0,
				1,
			);
		}
		return { codes, frac, enc, hasWhite };
	};

	const layerPlacement = (o) => {
		const sc = o.size / 100 / o.bitmapRes;
		return {
			dx: (o.x - o.rotX * sc + o.stageW / 2) * o.gs,
			dy: (o.stageH / 2 - (o.y + o.rotY * sc)) * o.gs,
			dw: o.imgW * sc * o.gs,
			dh: o.imgH * sc * o.gs,
		};
	};

	const xOrigin = (res, W) => {
		let x0 = res / 2 - W / 2;
		if (res < 4) x0 = Math.round(x0);
		return x0;
	};

	class FastCore {
		constructor() {
			this.W = 640;
			this.H = 480;
			this.pix = new Uint32Array(this.W * this.H);
			this.roundCaps = true;
			this.rand = Math.random;
			this.dirty = false;
			this.rMin = this.H;
			this.rMax = -1;
			this.p = null;
			this.scan = new Int32Array(0);
			this.noise = [];
			this.gb = 0;
			this.ni = 1;
			this.tc = new Uint32Array(80);
			this.roofActive = false;
			this.rs = {
				n: 0,
				x: new Float32Array(8192),
				y0: new Float32Array(8192),
				y1: new Float32Array(8192),
				col: new Uint32Array(8192),
				next: new Int32Array(8192),
			};
			this.rHeads = new Int32Array(1300).fill(-1);
			this.rCur = 1299;
			this.rBuilt = false;
			this.rRows = false;
			this.cw = null;
			this.cwt = null;
			this.slopeCache = [0, 0, 0, 0];
			this.lastWall = 0;
			this.maxOverhang = 4;
			this.layers = null;
			this.hsvH = this.hsvS = this.hsvV = null;
			this.colSin = this.colCos = this.colSec = null;
			this.ck = "";
			this.ca = NaN;
		}

		setBuffer(pix, W, H) {
			this.pix = pix;
			this.W = W;
			this.H = H;
			this.dirty = false;
			this.rMin = H;
			this.rMax = -1;
		}

		clearBuffer() {
			if (this.rMax >= this.rMin)
				this.pix.fill(0, this.rMin * this.W, (this.rMax + 1) * this.W);
			this.rMin = this.H;
			this.rMax = -1;
			this.dirty = false;
		}

		prepCols() {
			const P = this.p,
				W = this.W,
				res = P.res;
			const cols = Math.ceil(W / res);
			const key = W + "|" + res + "|" + P.dv;
			if (this.ck !== key || !this.colSin) {
				this.ck = key;
				this.ca = NaN;
				this.nCols = cols;
				this.colX0 = xOrigin(res, W);
				this.colX = new Float64Array(cols);
				this.colPhi = new Float64Array(cols);
				this.colCphi = new Float64Array(cols);
				this.colSec = new Float64Array(cols);
				this.colSin = new Float64Array(cols);
				this.colCos = new Float64Array(cols);
				for (let k = 0; k < cols; k++) {
					const xk = this.colX0 + k * res;
					const phi = Math.atan(xk / P.dv);
					this.colX[k] = xk;
					this.colPhi[k] = phi;
					this.colCphi[k] = Math.cos(phi);
					this.colSec[k] = 1 / Math.cos(phi);
				}
			}
			if (this.ca !== P.camDir) {
				const camRad = (P.camDir * Math.PI) / 180;
				for (let k = 0; k < this.nCols; k++) {
					const ang = camRad + this.colPhi[k];
					this.colSin[k] = Math.sin(ang);
					this.colCos[k] = Math.cos(ang);
				}
				this.ca = P.camDir;
			}
		}

		begin(p, scanList, noiseList) {
			const g = rgbToHsv.apply(null, Object.values(toRgb(p.groundColor)));
			const c = rgbToHsv.apply(
				null,
				Object.values(toRgb(p.ceilingColor)),
			);
			this.p = Object.assign({}, p, {
				gh: g.h,
				gs: g.s,
				ch: c.h,
				cs: c.s,
				rr: Math.max(Math.round(p.res / 2), 0.0001),
			});
			const n = scanList.length;
			let changed = this.scan.length !== n;
			if (changed) this.scan = new Int32Array(n);
			for (let k = 0; k < n; k++) {
				const v = scanList[k] | 0;
				if (this.scan[k] !== v) {
					this.scan[k] = v;
					changed = true;
				}
			}
			if (changed || !this.hsvH) {
				this.hsvH = new Float64Array(n).fill(NaN);
				this.hsvS = new Float64Array(n);
				this.hsvV = new Float64Array(n);
			}
			const nn = noiseList.length;
			if (!this.noise || this.noise.length !== nn)
				this.noise = new Float64Array(nn);
			for (let k = 0; k < nn; k++) this.noise[k] = toNumber(noiseList[k]);
			this.ni = 1;
			this.roofActive = !!(p.roofPass && this.layers && this.layers.roof);
			this.rs.n = 0;
			this.rHeads.fill(-1);
			this.rCur = 1299;
			this.rBuilt = false;
			this.rRows = false;
			this.cw = null;
			this.cwt = null;
			this.lastWall = 0;
			if (this.tc.length < p.textureSize + 2)
				this.tc = new Uint32Array(Math.max(64, p.textureSize) + 2);
		}

		setLayers(layers) {
			this.layers = layers;
		}

		shadeTexel(i0, bright) {
			let h, s, v;
			if (i0 < 0 || i0 >= this.scan.length) {
				h = 0;
				s = 0;
				v = 0;
			} else {
				h = this.hsvH[i0];
				if (h !== h) {
					const c = this.scan[i0];
					const hsv = rgbToHsv(
						(c >> 16) & 255,
						(c >> 8) & 255,
						c & 255,
					);
					this.hsvH[i0] = h = hsv.h;
					this.hsvS[i0] = hsv.s;
					this.hsvV[i0] = hsv.v;
				}
				s = this.hsvS[i0];
				v = this.hsvV[i0];
			}
			return hsvToPacked(h, s, clamp(v * 100 + bright, 0, 100) / 100);
		}

		renderWalls(types, xs, dists, row) {
			const n = dists.length;
			this.setRows(types, xs, dists);
			while (row <= n) {
				const t = types[row - 1];
				const d = toNumber(dists[row - 1]);
				this.flushRoofs(d);
				if (compare(t, 10) < 0) break;
				this.column(toNumber(t), toNumber(xs[row - 1]), d);
				if (row === this.lastWall) this.flushRoofs(-1);
				row++;
			}
			if (row > n) this.flushRoofs(-1);
			return row;
		}

		setRows(types, xs, dists) {
			if (!this.roofActive || this.rRows) return;
			this.rRows = true;
			const res = this.p.res;
			const cols = Math.ceil(this.W / res);
			const x0 = xOrigin(res, this.W);
			this.cw = new Array(cols).fill(null);
			this.cwt = new Array(cols).fill(null);
			this.lastWall = 0;
			for (let i = 0; i < dists.length; i++) {
				if (compare(types[i], 10) < 0) continue;
				this.lastWall = i + 1;
				const k = Math.round((toNumber(xs[i]) - x0) / res);
				if (k < 0 || k >= cols) continue;
				(this.cw[k] || (this.cw[k] = [])).push(toNumber(dists[i]));
				(this.cwt[k] || (this.cwt[k] = [])).push(toNumber(types[i]));
			}
		}

		column(type, x, dist) {
			const P = this.p;
			const res = P.res;
			const ts = P.textureSize;

			const H0 = 10 * (P.dv / dist);
			let y = 2 * H0 - res / 2 - P.camY;
			const h4 = H0 * 4 - res;
			if (!isFinite(y) || !isFinite(h4)) return;
			const px = x + this.W / 2;

			let dy = 0 - h4 / ts;
			let scanIndex = type % 1000000;
			let bright = P.levelLight - dist / 2;
			if (P.level === 99) bright = P.levelLight - dist / 6;
			if (type > 2000000) bright += -15;

			const sc = h4 / res;
			let scaled;
			if (sc < 12) scaled = 8;
			else if (sc < 24) scaled = 16;
			else scaled = ts;
			const yTop = y;

			const skip0 = Math.floor(ts / scaled);
			dy = dy * skip0;
			const skip = skip0 * 480;

			const halfRes = res / 2,
				Hh = this.H / 2;
			for (let k = Math.round(scaled); k >= 0.5; k--) {
				const ny = y + dy;
				const sa = Hh - y,
					sb = Hh - ny;
				const slo = sa < sb ? sa : sb,
					shi = sa < sb ? sb : sa;
				if (shi + halfRes >= 0 && slo - halfRes <= this.H)
					this.seg(
						px,
						y,
						ny,
						this.shadeTexel(Math.floor(scanIndex) - 1, bright),
					);
				scanIndex += skip;
				y = ny;
			}

			const rr = P.rr;
			const camY = P.camY;
			let count = P.floorPass ? 0 : Math.round((y + 480) / rr);
			for (; count >= 1; count--) {
				const fb = Math.abs((y + camY) / 13);
				const v = clamp(clamp(fb, 0, 100) + this.gb, 0, 100);
				const ny = y - res;
				this.segColor(px, y, ny, P.gh, P.gs, v);
				y = ny;
				this.noiseStep();
			}

			if (P.drawCeiling && !P.ceilPass) {
				y = yTop;
				count = Math.round((y + 480) / rr);
				for (; count >= 1; count--) {
					const fb = Math.abs((y + camY) / 13);
					const v = clamp(clamp(fb, 0, 100) + this.gb, 0, 100);
					const ny = y + res;
					this.segColor(px, y, ny, P.ch, P.cs, v);
					y = ny;
					this.noiseStep();
				}
			}
		}

		bucketOf(p) {
			if (!(p > 0)) return 0;
			const b = Math.floor(Math.log(p) * 100) + 400;
			return b < 0 ? 0 : b > 1299 ? 1299 : b;
		}

		addSpan(bucket, px, y0, y1, col) {
			const rs = this.rs;
			if (rs.n >= rs.x.length) {
				const cap = rs.x.length * 2;
				const grow = (A, T) => {
					const B = new T(cap);
					B.set(A);
					return B;
				};
				rs.x = grow(rs.x, Float32Array);
				rs.y0 = grow(rs.y0, Float32Array);
				rs.y1 = grow(rs.y1, Float32Array);
				rs.col = grow(rs.col, Uint32Array);
				rs.next = grow(rs.next, Int32Array);
			}
			const i = rs.n++;
			rs.x[i] = px;
			rs.y0[i] = y0;
			rs.y1[i] = y1;
			rs.col[i] = col;
			rs.next[i] = this.rHeads[bucket];
			this.rHeads[bucket] = i;
		}

		buildRoofSpans() {
			this.rBuilt = true;
			const P = this.p,
				L = this.layers,
				R = L && L.roof;
			if (!R) return;
			const W = this.W,
				H = this.H,
				res = P.res;
			const gs = L.gs,
				gw = L.gw,
				gh = L.gh;
			this.prepCols();
			const cols = this.nCols,
				x0 = this.colX0;
			const colX = this.colX,
				colCphi = this.colCphi,
				colSin = this.colSin,
				colCos = this.colCos;
			const Hh = H / 2;
			const dv = P.dv,
				camY = P.camY,
				hgt = P.roofHeight;
			const ts = P.textureSize;
			const lightDiv = P.level === 99 ? 6 : 2;
			const zmax = 20 + hgt;
			const grey = (b) => hsvToPacked(0, 0, clamp(b, 0, 100) / 100);
			const ceil = L.ceil && L.ceil.grid ? L.ceil.grid : null;
			let inside = false;
			{
				const pgx = Math.floor((P.playerX + W / 2) * gs);
				const pgy = Math.floor((H / 2 - P.playerY) * gs);
				if (pgx >= 0 && pgy >= 0 && pgx < gw && pgy < gh) {
					const pc = pgy * gw + pgx;
					if (
						R.codes[pc] >= 2 ||
						R.enc[pc] === 1 ||
						(ceil !== null && ceil[pc] !== 255)
					)
						inside = true;
				}
			}
			const tP = new Float64Array(cols),
				tY = new Float64Array(cols),
				tT = new Float64Array(cols),
				tD = new Float64Array(cols);
			const tU = new Float64Array(cols);
			const tA = new Uint8Array(cols);
			const tF = new Uint8Array(cols);
			const tReal = new Uint8Array(cols);
			for (let k = 0; k < cols; k++) {
				const cphi = colCphi[k];
				if (cphi < 1e-4) continue;
				const px = colX[k] + W / 2;
				const sx = colSin[k],
					sy = colCos[k];
				let r = 0.25;
				const walls = this.cw ? this.cw[k] : null;
				let inRun = false,
					seen = false,
					prev = 0.4;
				let ymax = -1e9,
					ymaxC = -1e9;
				for (let n = 0; n < 4000; n++) {
					const wx = P.playerX + r * sx,
						wy = P.playerY + r * sy;
					const gx = Math.floor((wx + W / 2) * gs);
					const gy = Math.floor((H / 2 - wy) * gs);
					const p = r * cphi;
					let step = 0.4;
					if (gx < 0 || gy < 0 || gx >= gw || gy >= gh) {
						if (seen || r > 6000) break;
						inRun = false;
						step = 8;
					} else {
						seen = true;
						const c = gy * gw + gx;
						if (
							R.enc[c] === 1 ||
							(ceil !== null && ceil[c] !== 255)
						) {
							const yc = (20 * dv) / p - camY;
							if (yc > ymaxC) ymaxC = yc;
							if (!inside && yc > ymax) ymax = yc;
						}
						if (R.codes[c] === 1) {
							let lo = Math.max(0.25, r - prev),
								hi = r;
							for (let b = 0; b < 5; b++) {
								const m = (lo + hi) / 2;
								const mx = Math.floor(
									(P.playerX + m * sx + W / 2) * gs,
								);
								const my = Math.floor(
									(H / 2 - (P.playerY + m * sy)) * gs,
								);
								if (
									mx >= 0 &&
									my >= 0 &&
									mx < gw &&
									my < gh &&
									R.codes[my * gw + mx] === 1
								)
									hi = m;
								else lo = m;
							}
							const pt = hi * cphi;
							let best = -1,
								bd = 3.01;
							if (walls) {
								for (let i = 0; i < walls.length; i++) {
									const dd = Math.abs(walls[i] - pt);
									if (dd < bd) {
										bd = dd;
										best = i;
									}
								}
							}
							{
								tP[k] = pt;
								tY[k] =
									best >= 0 ? ymax : Math.max(ymax, ymaxC);
								if (best >= 0) {
									tReal[k] = 1;
									tT[k] = this.cwt[k][best];
									tD[k] = walls[best];
								}

								const lcx = Math.floor(
									(P.playerX + lo * sx + W / 2) * gs,
								);
								const lcy = Math.floor(
									(H / 2 - (P.playerY + lo * sy)) * gs,
								);
								const hcx = Math.floor(
									(P.playerX + hi * sx + W / 2) * gs,
								);
								const hcy = Math.floor(
									(H / 2 - (P.playerY + hi * sy)) * gs,
								);
								let alongX;
								if (hcy !== lcy && hcx === lcx) alongX = true;
								else if (hcx !== lcx && hcy === lcy)
									alongX = false;
								else alongX = Math.abs(sy) >= Math.abs(sx);
								if (alongX) {
									tU[k] = P.playerX + hi * sx;
									tA[k] = 1;
									tF[k] = sy >= 0 ? 0 : 1;
								} else {
									tU[k] = P.playerY + hi * sy;
									tA[k] = 2;
									tF[k] = sx >= 0 ? 2 : 3;
								}
							}
							break;
						}
						if (!inside && R.codes[c] >= 2) {
							if (!inRun) {
								inRun = true;
								const yE = (20 * dv) / p - camY;
								let yLow = yE;
								if (walls) {
									let best = Infinity;
									for (let i = 0; i < walls.length; i++)
										if (
											walls[i] >= p - 0.75 &&
											walls[i] < best
										)
											best = walls[i];
									if (
										best > p + 0.3 &&
										best < p + this.maxOverhang
									)
										yLow = Math.min(
											yE,
											(20 * dv) / best - camY,
										);
								}
								if (ymax < yLow) ymax = yLow;
							}
							const yy = ((20 + R.frac[c] * hgt) * dv) / p - camY;
							if (yy > ymax && ymax < Hh) {
								let shade = 0;
								if (c > gw && c < R.frac.length - gw - 1) {
									const gxs = R.frac[c + 1] - R.frac[c - 1];
									const gys = R.frac[c + gw] - R.frac[c - gw];
									const len = Math.sqrt(
										gxs * gxs + gys * gys,
									);
									if (len > 1e-6)
										shade =
											-((gxs * -0.6 + gys * -0.8) / len) *
											12;
								}
								const bright =
									P.levelLight - p / lightDiv + shade;
								const cls = R.codes[c] - 2;
								const ta = R.a[cls];
								const col =
									ta !== undefined && ta >= 0
										? this.tileColor(
												ta,
												R.t[cls],
												wx,
												wy,
												bright,
												P,
												P.roofTile,
											)
										: grey(bright);
								this.addSpan(
									this.bucketOf(p),
									px,
									ymax,
									yy,
									col,
								);
								ymax = yy;
							}
						} else {
							inRun = false;
						}
						if (ymax >= Hh && !R.hasWhite) break;
						step = Math.max(
							0.4,
							Math.min(2, (p * p) / (zmax * dv)),
						);
					}
					prev = step;
					r += step;
				}
			}

			const tX = new Float64Array(cols),
				tBase = new Float64Array(cols),
				tExtra = new Float64Array(cols);
			for (let k = 0; k < cols; k++) {
				if (!tReal[k]) continue;
				const m = tT[k] % 1000000;
				const idx = m - 1;
				const tx = ((idx % ts) + ts) % ts;
				tX[k] = tx;
				tBase[k] = idx - tx;
				tExtra[k] = tT[k] - m;
			}

			const walk = (q, dir) => {
				let sdt = 0,
					sdu = 0,
					cur = q;
				for (let i = 0; i < 16; i++) {
					const nx = cur + dir;
					if (
						nx < 0 ||
						nx >= cols ||
						!tReal[nx] ||
						tA[nx] !== tA[q] ||
						tBase[nx] !== tBase[q]
					)
						break;
					let d = tX[nx] - tX[cur];
					if (d > ts / 2) d -= ts;
					else if (d < -ts / 2) d += ts;
					sdt += d;
					sdu += tU[nx] - tU[cur];
					cur = nx;
				}
				return [sdt, sdu];
			};

			for (let k = 0; k < cols; k++) {
				if (!(tP[k] > 0)) continue;
				let type = tT[k],
					dist = tD[k];
				if (!tReal[k]) {
					dist = tP[k];
					type = 0;
					if (tA[k]) {
						let Lc = -1,
							Rc = -1;
						for (let j = 1; j < 80; j++) {
							if (Lc < 0) {
								const q = k - j;
								if (q >= 0 && tReal[q] && tA[q] === tA[k])
									Lc = q;
							}
							if (Rc < 0) {
								const q = k + j;
								if (q < cols && tReal[q] && tA[q] === tA[k])
									Rc = q;
							}
							if (Lc >= 0 && Rc >= 0) break;
						}
						let q = -1;
						if (Lc >= 0 && Rc >= 0)
							q =
								Math.abs(tU[Lc] - tU[k]) <=
								Math.abs(tU[Rc] - tU[k])
									? Lc
									: Rc;
						else q = Lc >= 0 ? Lc : Rc;
						if (q >= 0) {
							const dir = q < k ? -1 : 1;
							let [sdt, sdu] = walk(q, dir);
							if (Math.abs(sdu) <= 4) {
								const o = q === Lc ? Rc : Lc;
								if (o >= 0 && tBase[o] === tBase[q]) {
									const od = o < k ? -1 : 1;
									const w2 = walk(o, od);
									if (Math.abs(w2[1]) > Math.abs(sdu)) {
										sdt = w2[0];
										sdu = w2[1];
									}
								}
							}
							let slope;
							if (Math.abs(sdu) > 4) {
								slope = sdt / sdu;
								this.slopeCache[tF[q]] = slope;
							} else slope = this.slopeCache[tF[k]] || 0;
							let tx = tX[q] + slope * (tU[k] - tU[q]);
							tx = ((Math.floor(tx) % ts) + ts) % ts;
							type = tExtra[q] + tBase[q] + tx + 1;
						}
					}
					if (!type) {
						for (let j = 1; j < 80 && !type; j++) {
							if (k - j >= 0 && tReal[k - j]) type = tT[k - j];
							else if (k + j < cols && tReal[k + j])
								type = tT[k + j];
						}
						if (!type && this.cwt && this.cwt[k])
							type = this.cwt[k][0];
					}
				}
				this.towerSpans(
					k,
					x0 + k * res + W / 2,
					type,
					dist,
					tY[k],
					tReal[k] === 1,
				);
			}
		}

		towerSpans(k, px, type, dist, ymax, real) {
			const P = this.p,
				res = P.res,
				ts = P.textureSize;
			const H0 = 10 * (P.dv / dist);
			const yTop = 2 * H0 - res / 2 - P.camY;
			const h4 = H0 * 4 - res;
			const top = this.H / 2 + res;
			if (!isFinite(yTop) || !isFinite(h4)) return;
			const bucket = this.bucketOf(dist);
			const first = real ? 1 : 0;
			if (yTop + (first - 1) * h4 > top) return;
			let nt = 0,
				dy = 0,
				col0 = 0;
			if (type > 0 && h4 > 0.5) {
				let scanIndex = type % 1000000;
				let bright = P.levelLight - dist / 2;
				if (P.level === 99) bright = P.levelLight - dist / 6;
				if (type > 2000000) bright += -15;
				const sc = h4 / res;
				const scaled = sc < 12 ? 8 : sc < 24 ? 16 : ts;
				const skip = Math.floor(ts / scaled) * 480;
				dy = h4 / scaled;
				for (let i = Math.round(scaled); i >= 0.5; i--) {
					this.tc[nt++] = this.shadeTexel(
						Math.floor(scanIndex) - 1,
						bright,
					);
					scanIndex += skip;
				}
				col0 = this.tc[nt >> 1];
			} else {
				col0 =
					type > 0
						? this.shadeTexel(
								(type % 1000000) - 1,
								P.levelLight - dist / 2,
							)
						: hsvToPacked(
								0,
								0,
								clamp(P.levelLight - dist / 2, 0, 100) / 100,
							);
			}
			const h = res / 2;
			for (let n = first; n < 400; n++) {
				const tTop = yTop + n * h4;
				const tBot = tTop - h4;
				if (tBot - h > top) break;
				if (tTop <= ymax) continue;
				if (nt < 1) {
					this.addSpan(bucket, px, Math.max(tBot, ymax), tTop, col0);
					continue;
				}
				let y = tTop;
				for (let i = 0; i < nt; i++) {
					const ny = y - dy;
					const lo = ny > ymax ? ny : ymax;
					if (y > lo) this.addSpan(bucket, px, lo, y, this.tc[i]);
					y = ny;
					if (y <= ymax) break;
				}
			}
		}

		flushRoofs(d) {
			if (!this.roofActive) return;
			if (!this.rBuilt) this.buildRoofSpans();
			const bd = d > 0 ? this.bucketOf(d) : -1;
			const rs = this.rs;
			for (; this.rCur > bd; this.rCur--) {
				for (let i = this.rHeads[this.rCur]; i >= 0; i = rs.next[i])
					this.vspan(rs.x[i], rs.y0[i], rs.y1[i], rs.col[i]);
				this.rHeads[this.rCur] = -1;
			}
		}

		vspan(px, yLow, yHigh, col) {
			const W = this.W,
				H = this.H;
			const r = this.p.res / 2;
			let rowA = Math.ceil(H / 2 - yHigh - 0.5);
			let rowB = Math.floor(H / 2 - yLow - 0.5);
			if (rowA < 0) rowA = 0;
			if (rowB > H - 1) rowB = H - 1;
			let x0 = Math.ceil(px - r - 0.5);
			let x1 = Math.floor(px + r - 0.5);
			if (x0 < 0) x0 = 0;
			if (x1 > W - 1) x1 = W - 1;
			if (x1 < x0) return;
			if (rowB >= rowA) {
				if (rowA < this.rMin) this.rMin = rowA;
				if (rowB > this.rMax) this.rMax = rowB;
			}
			const pix = this.pix;
			for (let py = rowA; py <= rowB; py++) {
				const o = py * W;
				if (x1 - x0 < 6) {
					for (let xx = x0; xx <= x1; xx++) pix[o + xx] = col;
				} else pix.fill(col, o + x0, o + x1 + 1);
				this.dirty = true;
			}
		}

		renderBackdrop() {
			const P = this.p;
			const L = this.layers;
			if (!P || !L || (!P.floorPass && !P.ceilPass)) return;
			const W = this.W,
				H = this.H,
				res = P.res;
			this.prepCols();
			const cols = this.nCols;
			const rows = Math.ceil(H / res);
			const x0 = this.colX0;
			const gs = L.gs,
				gw = L.gw,
				gh = L.gh;
			const maxDist = P.maxDist || 4000;
			const fl = L.floor,
				cm = L.ceil,
				ct = L.ceilTex;
			const lightDiv = P.level === 99 ? 6 : 2;
			const half = res / 2;

			for (let r = 0; r < rows; r++) {
				const top = r * res;
				const penY = H / 2 - (top + half);
				const t = -(penY + P.camY);
				const isFloor = t > 0;
				if (isFloor ? !P.floorPass : !P.ceilPass) continue;
				const at = Math.abs(t);
				if (at < 0.001) continue;
				const perp = (20 * P.dv) / at;
				if (perp > maxDist) continue;
				const bright = P.levelLight - perp / lightDiv;
				const flat = hsvToPacked(
					isFloor ? P.gh : P.ch,
					isFloor ? P.gs : P.cs,
					clamp(at / 13, 0, 100) / 100,
				);
				for (let k = 0; k < cols; k++) {
					const rd = perp * this.colSec[k];
					const wx = P.playerX + rd * this.colSin[k];
					const wy = P.playerY + rd * this.colCos[k];
					const gx = Math.floor((wx + W / 2) * gs);
					const gy = Math.floor((H / 2 - wy) * gs);
					const inside = gx >= 0 && gy >= 0 && gx < gw && gy < gh;
					const cell = inside ? gy * gw + gx : -1;
					let col;
					if (isFloor) {
						const pi = cell >= 0 ? fl.grid[cell] : 255;
						col =
							pi < fl.a.length && fl.a[pi] >= 0
								? this.tileColor(
										fl.a[pi],
										fl.t[pi],
										wx,
										wy,
										bright,
										P,
									)
								: flat;
					} else {
						if (cell < 0 || cm.grid[cell] === 255) continue;
						const pi = ct && ct.grid ? ct.grid[cell] : 255;
						col =
							ct && pi < ct.a.length && ct.a[pi] >= 0
								? this.tileColor(
										ct.a[pi],
										ct.t[pi],
										wx,
										wy,
										bright,
										P,
										P.ceilTile,
									)
								: flat;
					}
					this.fillBlock(
						Math.floor(x0 + k * res + W / 2 - half + 1e-6),
						top,
						res,
						res,
						col,
					);
				}
			}
		}

		tileColor(a, b, wx, wy, bright, P, tw) {
			const ts = P.textureSize;
			const size = tw || P.tileWorld;
			let u = wx / size;
			u -= Math.floor(u);
			let v = wy / size;
			v -= Math.floor(v);
			const tx = Math.min(ts - 1, Math.floor(u * ts));
			const ty = Math.min(ts - 1, Math.floor((1 - v) * ts));
			return this.shadeTexel(a * ts + tx + (b * ts + ty) * 480, bright);
		}

		fillBlock(x, y, w, h, col) {
			const W = this.W,
				H = this.H;
			let x1 = x + w - 1,
				y1 = y + h - 1;
			if (x < 0) x = 0;
			if (y < 0) y = 0;
			if (x1 > W - 1) x1 = W - 1;
			if (y1 > H - 1) y1 = H - 1;
			if (x1 < x || y1 < y) return;
			if (y < this.rMin) this.rMin = y;
			if (y1 > this.rMax) this.rMax = y1;
			const pix = this.pix;
			for (let py = y; py <= y1; py++) {
				const o = py * W;
				if (x1 - x < 6) {
					for (let xx = x; xx <= x1; xx++) pix[o + xx] = col;
				} else pix.fill(col, o + x, o + x1 + 1);
			}
			this.dirty = true;
		}

		noiseStep() {
			if (this.p.moving) {
				this.gb = Math.floor(this.rand() * 5) - 2;
			} else {
				const nl = this.noise;
				this.gb = nl[this.ni - 1] || 0;
				if (this.ni < nl.length - 1) this.ni++;
				else this.ni = 1;
			}
		}

		segColor(px, y0, y1, h, s, v) {
			const r = this.p.res / 2;
			const sy0 = this.H / 2 - y0;
			const sy1 = this.H / 2 - y1;
			const lo = Math.min(sy0, sy1) - r;
			const hi = Math.max(sy0, sy1) + r;
			if (hi < 0 || lo > this.H) return;
			this.seg(px, y0, y1, hsvToPacked(h, s, v / 100));
		}

		seg(px, y0, y1, col) {
			const W = this.W;
			const H = this.H;
			const r = this.p.res / 2;
			const sy0 = H / 2 - y0;
			const sy1 = H / 2 - y1;
			const smin = Math.min(sy0, sy1);
			const smax = Math.max(sy0, sy1);
			const pix = this.pix;

			if (this.roundCaps) {
				const rowA = Math.max(0, Math.floor(smin - r));
				const rowB = Math.min(H - 1, Math.ceil(smax + r));
				if (rowB >= rowA) {
					if (rowA < this.rMin) this.rMin = rowA;
					if (rowB > this.rMax) this.rMax = rowB;
				}
				for (let py = rowA; py <= rowB; py++) {
					const cy = py + 0.5;
					let d = 0;
					if (cy < smin) d = smin - cy;
					else if (cy > smax) d = cy - smax;
					if (d > r) continue;
					const hw = d === 0 ? r : Math.sqrt(r * r - d * d);
					let x0 = Math.ceil(px - hw - 0.5);
					let x1 = Math.floor(px + hw - 0.5);
					if (x0 < 0) x0 = 0;
					if (x1 > W - 1) x1 = W - 1;
					if (x1 >= x0) {
						const o = py * W;
						if (x1 - x0 < 6) {
							for (let xx = x0; xx <= x1; xx++) pix[o + xx] = col;
						} else {
							pix.fill(col, o + x0, o + x1 + 1);
						}
						this.dirty = true;
					}
				}
			} else {
				let rowA = Math.ceil(smin - 0.5);
				let rowB = Math.floor(smax - 0.5);
				if (rowA < 0) rowA = 0;
				if (rowB > H - 1) rowB = H - 1;
				let x0 = Math.ceil(px - r - 0.5);
				let x1 = Math.floor(px + r - 0.5);
				if (x0 < 0) x0 = 0;
				if (x1 > W - 1) x1 = W - 1;
				if (x1 < x0) return;
				if (rowB >= rowA) {
					if (rowA < this.rMin) this.rMin = rowA;
					if (rowB > this.rMax) this.rMax = rowB;
				}
				for (let py = rowA; py <= rowB; py++) {
					pix.fill(col, py * W + x0, py * W + x1 + 1);
					this.dirty = true;
				}
			}
		}
	}

	if (
		typeof module !== "undefined" &&
		module.exports &&
		typeof root.Scratch === "undefined"
	) {
		module.exports = {
			FastCore,
			toRgb,
			rgbToHsv,
			hsvToPacked,
			compare,
			looseEquals,
			toNumber,
			parsePalette,
			classify,
			classifyRoof,
			layerPlacement,
			tilePos,
			composeAtlas,
		};
		return;
	}

	const Scratch = root.Scratch;
	if (!Scratch.extensions.unsandboxed) {
		throw new Error("Freak House Renderer must run unsandboxed");
	}
	const vm = Scratch.vm;
	const runtime = vm.runtime;

	class MapLayer {
		constructor() {
			this.key = "";
			this.state = "off";
			this.grid = null;
			this.token = 0;
			this.note = "";
		}
		off(note) {
			this.token++;
			this.key = "";
			this.state = "off";
			this.grid = null;
			this.note = note || "";
		}
		update(key, loader) {
			if (key === this.key) return;
			this.key = key;
			this.state = "pending";
			this.grid = null;
			this.note = "";
			const my = ++this.token;
			loader()
				.then((grid) => {
					if (my !== this.token) return;
					this.grid = grid;
					this.state = "ready";
					runtime.requestRedraw();
				})
				.catch((e) => {
					if (my !== this.token) return;
					this.state = "error";
					this.note = String((e && e.message) || e);
					console.error("[Fast Renderer] map layer", e);
				});
		}
	}

	const varCache = new WeakMap();
	function lookupCached(target, name, type) {
		let m = varCache.get(target);
		if (!m) {
			m = new Map();
			varCache.set(target, m);
		}
		const key = type + "|" + name;
		const v = m.get(key);
		if (v !== undefined && v.name === name) {
			if (target.variables[v.id] === v) return v;
			const stage = runtime.getTargetForStage();
			if (stage && stage.variables[v.id] === v) return v;
		}
		const f = target.lookupVariableByNameAndType(name, type);
		if (f) m.set(key, f);
		else m.delete(key);
		return f;
	}

	let beepCtx = null;
	function playBeep(freq, dur, vol) {
		try {
			freq = Number.isFinite(freq) && freq > 0 ? freq : 440;
			dur = Number.isFinite(dur) && dur > 0 ? dur : 0.07;
			vol = Number.isFinite(vol) ? vol : 0.08;
			if (vol <= 0) return;
			if (!beepCtx || beepCtx.state === "closed")
				beepCtx = new (
					window.AudioContext || window.webkitAudioContext
				)();
			if (beepCtx.state === "suspended") beepCtx.resume();
			const ctx = beepCtx;
			const osc = ctx.createOscillator();
			const gain = ctx.createGain();
			osc.connect(gain);
			gain.connect(ctx.destination);
			osc.type = "square";
			osc.frequency.value = freq;
			const t = ctx.currentTime + 0.01;
			gain.gain.setValueAtTime(vol, t);
			gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
			osc.start(t);
			osc.stop(t + dur);
			osc.onended = () => {
				osc.disconnect();
				gain.disconnect();
			};
		} catch (e) {}
	}

	const STAMP_LIST_NAMES = ["FHColCheck", "FHColisionChecker"];
	const STAMP_DEFAULT_PRECISION = 4;

	const findStampList = (target) => {
		for (const name of STAMP_LIST_NAMES) {
			const l = lookupCached(target, name, "list");
			if (l) return l;
		}
		return null;
	};

	const stampProbe = [0, 0];

	const stampStates = new Map();
	function getStampState(N) {
		const halfW = (runtime.stageWidth || 480) / 2;
		const halfH = (runtime.stageHeight || 360) / 2;
		const nxMin = Math.ceil(-halfW / N);
		const nxMax = Math.floor(halfW / N);
		const nyMin = Math.ceil(-halfH / N);
		const nyMax = Math.floor(halfH / N);
		const tw = nxMax - nxMin + 1;
		const th = nyMax - nyMin + 1;
		let st = stampStates.get(N);
		if (
			!st ||
			st.cxMin !== nxMin ||
			st.cyMax !== nyMax ||
			st.tw !== tw ||
			st.th !== th
		) {
			st = {
				cxMin: nxMin,
				cyMax: nyMax,
				tw,
				th,
				table: new Uint8Array(tw * th),
				list: null,
				len: -1,
			};
			stampStates.set(N, st);
		}
		return st;
	}

	function syncStampState(st, list) {
		if (st.list === list && st.len === list.value.length) return;
		st.table.fill(0);
		const items = list.value;
		for (let n = 0; n < items.length; n++) {
			const str = String(items[n]);
			const c = str.indexOf(",");
			if (c < 0) continue;
			const ix = Number(str.slice(0, c)) - st.cxMin;
			const iy = st.cyMax - Number(str.slice(c + 1));
			if (ix >= 0 && ix < st.tw && iy >= 0 && iy < st.th)
				st.table[iy * st.tw + ix] = 1;
		}
		st.list = list;
		st.len = items.length;
	}

	class FHFastRenderer {
		constructor() {
			this.core = new FastCore();
			this.ready = false;
			this.error = "";
			this.ms = 0;
			this.skinId = -1;
			this.drawableId = -1;
			this.imageData = null;
			this.sizeW = 0;
			this.sizeH = 0;
			this.names = {
				floor: "map//floor texture",
				ceil: "map//ceiling",
				ceilTex: "map//ceiling texture",
			};
			this.tileWorld = 25;
			this.ceilTile = 25;
			this.texSprite = "TextureManager";
			this.floorLayer = new MapLayer();
			this.ceilLayer = new MapLayer();
			this.ceilTexLayer = new MapLayer();
			this.roofLayer = new MapLayer();
			this.roof = { sprite: "map//roof", height: 60, tile: 25 };
			this.palCache = {
				floor: { key: "", pal: [] },
				ceil: { key: "", pal: [] },
				roof: { key: "", pal: [] },
			};
			this.warned = new Set();
			this.tileCache = {};
			this.namesCache = null;
		}

		getInfo() {
			return {
				id: "fhfastrender",
				name: "Freak House Renderer",
				color1: "#33691e",
				color2: "#255214",
				color3: "#230000",
				blocks: [
					{
						opcode: "setPixelate",
						blockType: Scratch.BlockType.COMMAND,
						text: "Freak House Renderer [VALUE]",
						arguments: {
							VALUE: {
								type: Scratch.ArgumentType.NUMBER,
								defaultValue: 25,
							},
						},
					},
					{
						opcode: "extraRendering",
						blockType: Scratch.BlockType.COMMAND,
						text: "extra rendering (frame setup, floor, ceiling and roofs)",
					},
					{
						opcode: "bakeAtlas",
						blockType: Scratch.BlockType.COMMAND,
						text: "fast render: build texture atlas from sprite [SPRITE] into list [LIST]",
						arguments: {
							SPRITE: {
								type: Scratch.ArgumentType.STRING,
								defaultValue: "TextureManager",
							},
							LIST: {
								type: Scratch.ArgumentType.STRING,
								defaultValue: "SCAN",
							},
						},
					},
					{
						opcode: "renderWalls",
						blockType: Scratch.BlockType.REPORTER,
						text: "fast render: draw wall rows from row [ROW] (reports next row)",
						arguments: {
							ROW: {
								type: Scratch.ArgumentType.NUMBER,
								defaultValue: 1,
							},
						},
					},
					{
						opcode: "setCaps",
						blockType: Scratch.BlockType.COMMAND,
						text: "fast render: pen line ends [STYLE]",
						arguments: {
							STYLE: {
								type: Scratch.ArgumentType.STRING,
								menu: "caps",
								defaultValue: "round",
							},
						},
					},
					{
						opcode: "isReady",
						blockType: Scratch.BlockType.BOOLEAN,
						text: "fast render: ready?",
					},
					"---",
					{
						opcode: "beepFull",
						blockType: Scratch.BlockType.COMMAND,
						text: "beep at [FREQ] hz for [DUR] s volume [VOL]",
						arguments: {
							FREQ: {
								type: Scratch.ArgumentType.NUMBER,
								defaultValue: 440,
							},
							DUR: {
								type: Scratch.ArgumentType.NUMBER,
								defaultValue: 0.07,
							},
							VOL: {
								type: Scratch.ArgumentType.NUMBER,
								defaultValue: 0.08,
							},
						},
					},
					"---",
					{
						blockType: Scratch.BlockType.LABEL,
						text: "Stamp collision log",
					},
					{
						opcode: "stampAndLog",
						blockType: Scratch.BlockType.COMMAND,
						text:
							"stamp and log to " +
							STAMP_LIST_NAMES[0] +
							" every [PRECISION] px",
						arguments: {
							PRECISION: {
								type: Scratch.ArgumentType.NUMBER,
								defaultValue: STAMP_DEFAULT_PRECISION,
							},
						},
					},
					{
						opcode: "isTouchingStamp",
						blockType: Scratch.BlockType.BOOLEAN,
						text: "touching stamp? precision [PRECISION]",
						arguments: {
							PRECISION: {
								type: Scratch.ArgumentType.NUMBER,
								defaultValue: STAMP_DEFAULT_PRECISION,
							},
						},
					},
				],
				menus: {
					caps: { acceptReporters: true, items: ["round", "flat"] },
				},
			};
		}

		_var(util, name, type) {
			const v = lookupCached(util.target, name, type || "");
			if (!v)
				throw new Error(
					"Missing " +
						(type === "list" ? "list" : "variable") +
						': "' +
						name +
						'"',
				);
			return v;
		}
		_num(util, name) {
			return toNumber(this._var(util, name).value);
		}
		_list(util, name) {
			return this._var(util, name, "list").value;
		}

		_ensureGpu() {
			const renderer = vm.renderer || Scratch.renderer;
			if (!renderer) throw new Error("No renderer");
			const W = runtime.stageWidth;
			const H = runtime.stageHeight;
			if (this.skinId < 0 || W !== this.sizeW || H !== this.sizeH) {
				if (this.skinId >= 0) renderer.destroySkin(this.skinId);
				this.imageData = new ImageData(W, H);
				this.core.setBuffer(
					new Uint32Array(this.imageData.data.buffer),
					W,
					H,
				);
				this.skinId = renderer.createBitmapSkin(this.imageData, 1, [
					W / 2,
					H / 2,
				]);
				if (this.drawableId < 0) {
					this.drawableId = renderer.createDrawable("sprite");
					renderer.updateDrawableVisible(this.drawableId, false);
				}
				renderer.updateDrawableSkinId(this.drawableId, this.skinId);
				this.sizeW = W;
				this.sizeH = H;
			}
			const pen = runtime.ext_pen;
			if (!pen) throw new Error("The Pen extension is not loaded");
			if (pen._penSkinId < 0 && typeof pen._getPenLayerID === "function")
				pen._getPenLayerID();
			if (pen._penSkinId < 0)
				throw new Error("Pen layer is not initialised");
			return { renderer, penSkinId: pen._penSkinId };
		}

		_flush() {
			const core = this.core;
			if (!core.dirty) return;
			const { renderer, penSkinId } = this._ensureGpu();
			renderer.updateBitmapSkin(this.skinId, this.imageData, 1, [
				this.sizeW / 2,
				this.sizeH / 2,
			]);
			renderer.penStamp(penSkinId, this.drawableId);
			runtime.requestRedraw();
			core.clearBuffer();
		}

		async _loadCostumeImage(costume) {
			const asset = costume && costume.asset;
			if (!asset || !asset.data)
				throw new Error("costume has no asset data");
			const fmt = String(costume.dataFormat || "").toLowerCase();
			let img, w, h;
			if (fmt === "svg") {
				let text =
					typeof asset.decodeText === "function"
						? asset.decodeText()
						: new TextDecoder().decode(asset.data);
				if (!/shape-rendering=/.test(text.slice(0, 500)))
					text = text.replace(
						/<svg\b/,
						'<svg shape-rendering="crispEdges"',
					);
				const url = URL.createObjectURL(
					new Blob([text], { type: "image/svg+xml" }),
				);
				try {
					img = new Image();
					img.src = url;
					await img.decode();
				} finally {
					URL.revokeObjectURL(url);
				}
				w = img.naturalWidth;
				h = img.naturalHeight;
			} else {
				img = await createImageBitmap(
					new Blob([asset.data], {
						type: fmt === "png" ? "image/png" : "image/jpeg",
					}),
				);
				w = img.width;
				h = img.height;
			}
			if (!w || !h) throw new Error("could not measure costume image");
			return { img, w, h };
		}

		async _rasterize(target, W, H, gs) {
			const costume = target.getCostumes()[target.currentCostume];
			const {
				img,
				w: imgW,
				h: imgH,
			} = await this._loadCostumeImage(costume);
			const canvas = document.createElement("canvas");
			canvas.width = W * gs;
			canvas.height = H * gs;
			const ctx = canvas.getContext("2d", { willReadFrequently: true });
			ctx.imageSmoothingEnabled = false;
			const pl = layerPlacement({
				x: target.x,
				y: target.y,
				size: target.size,
				rotX: costume.rotationCenterX,
				rotY: costume.rotationCenterY,
				imgW,
				imgH,
				bitmapRes: costume.bitmapResolution || 1,
				stageW: W,
				stageH: H,
				gs,
			});
			ctx.drawImage(img, pl.dx, pl.dy, pl.dw, pl.dh);
			if (typeof img.close === "function") img.close();
			return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
		}

		_stageNum(util, name, fallback) {
			const v = lookupCached(util.target, name, "");
			const n = v ? toNumber(v.value) : NaN;
			return n > 0 ? Math.floor(n) : fallback;
		}

		_textureNames(util) {
			const l = lookupCached(util.target, "texture names", "list");
			const fromList = !!(l && l.value.length);
			let src = null;
			if (fromList) src = l.value;
			else {
				const t = runtime.getSpriteTargetByName(this.texSprite);
				if (t) src = t.getCostumes();
			}
			const c = this.namesCache;
			if (c && c.src === src && c.len === (src ? src.length : 0))
				return c.names;
			const names = !src
				? []
				: fromList
					? src.map(String)
					: src.map((x) => String(x.name));
			this.namesCache = { src, len: src ? src.length : 0, names };
			return names;
		}

		_textureIndex(names, ref) {
			const s = String(ref);
			let idx = names.indexOf(s);
			if (idx < 0) {
				const n = Number(s);
				if (Number.isInteger(n) && n >= 1 && n <= names.length)
					idx = n - 1;
			}
			return idx;
		}

		_resolveTexture(names, ref, ts) {
			const s = String(ref).trim();
			let idx = names.indexOf(s);
			if (idx < 0) {
				const low = s.toLowerCase();
				idx = names.findIndex((n) => n.toLowerCase() === low);
			}
			if (idx < 0) {
				const n = Number(s);
				if (
					s !== "" &&
					Number.isInteger(n) &&
					n >= 1 &&
					n <= names.length
				)
					idx = n - 1;
			}
			if (idx >= 0) {
				const pos = tilePos(idx, ts, 480);
				return { a: pos.a, t: pos.t };
			}
			const m = /^(\d+)[\s,;]+(\d+)$/.exec(s);
			if (m) return { a: Number(m[1]), t: Number(m[2]) };
			const n = Number(s);
			if (
				s !== "" &&
				Number.isFinite(n) &&
				n > 0 &&
				ts > 0 &&
				n % ts === 0 &&
				n > names.length
			) {
				const q = n / ts;
				return { a: q % 480, t: Math.floor(q / 480) };
			}
			return null;
		}

		_warnOnce(msg) {
			if (this.warned.has(msg)) return;
			this.warned.add(msg);
			console.warn("[Fast Renderer]", msg);
		}

		_fail(e) {
			const msg = String((e && e.message) || e);
			if (msg !== this.error) console.error("[Fast Renderer]", e);
			this.error = msg;
			this.ready = false;
			this.core.clearBuffer();
		}

		_tiles(util, tag, pal, ts) {
			const names = this._textureNames(util);
			const c = this.tileCache[tag];
			if (c && c.pal === pal && c.ts === ts && c.names === names)
				return c.out;
			const a = [];
			const t = [];
			const trimmed =
				tag === "roof" ? names.map((n) => String(n).trim()) : null;
			for (const p of pal) {
				if (p.name === undefined) {
					a.push(p.a);
					t.push(p.t);
					continue;
				}
				let res = null;
				if (tag === "roof")
					res = this._resolveTexture(trimmed, p.name, ts);
				else {
					const idx = this._textureIndex(names, p.name);
					if (idx >= 0) res = tilePos(idx, ts, 480);
				}
				if (res) {
					a.push(res.a);
					t.push(res.t);
				} else {
					a.push(-1);
					t.push(0);
					this._warnOnce(
						'unknown texture "' +
							p.name +
							'" in the ' +
							tag +
							" palette",
					);
				}
			}
			const out = { a, t };
			this.tileCache[tag] = { pal, ts, names, out };
			return out;
		}

		_paletteFor(which, list) {
			const items = list ? list.value : [];
			const key = items.join("|");
			const c = this.palCache[which];
			if (c.key !== key) {
				c.key = key;
				c.pal = parsePalette(items);
				c.pal.key = c.pal
					.map((p) => p.r + "," + p.g + "," + p.b)
					.join(";");
			}
			return c.pal;
		}

		_syncLayer(layer, spriteName, palette, isMask, W, H, gs) {
			const target = runtime.getSpriteTargetByName(spriteName);
			if (!target) {
				layer.off('no sprite "' + spriteName + '"');
				return;
			}
			if (!isMask && (!palette || palette.length === 0)) {
				layer.off("empty palette list");
				return;
			}
			const costume = target.getCostumes()[target.currentCostume];
			if (!costume) {
				layer.off("no costume");
				return;
			}
			const palKey = isMask ? "" : palette.key;
			const key = [
				costume.assetId || costume.md5 || costume.name,
				target.x,
				target.y,
				target.size,
				W,
				H,
				palKey,
			].join("|");
			layer.update(key, async () =>
				classify(
					await this._rasterize(target, W, H, gs),
					palette,
					isMask,
				),
			);
		}

		_syncRoofLayer(W, H, gs, palette) {
			const layer = this.roofLayer;
			const name = this.roof.sprite;
			if (!name) {
				layer.off("");
				return;
			}
			const target = runtime.getSpriteTargetByName(name);
			if (!target) {
				layer.off('no sprite "' + name + '"');
				return;
			}
			const costume = target.getCostumes()[target.currentCostume];
			if (!costume) {
				layer.off("no costume");
				return;
			}
			const key = [
				name,
				costume.assetId || costume.md5 || costume.name,
				target.x,
				target.y,
				target.size,
				W,
				H,
				palette.key,
			].join("|");
			layer.update(key, async () =>
				classifyRoof(
					await this._rasterize(target, W, H, gs),
					W * gs,
					H * gs,
					palette,
				),
			);
		}

		_updateLayers(util, W, H) {
			const gs = 2;
			const tg = util.target;
			const fPal = this._paletteFor(
				"floor",
				lookupCached(tg, "floor palette", "list"),
			);
			const cPal = this._paletteFor(
				"ceil",
				lookupCached(tg, "ceiling palette", "list"),
			);
			this._syncLayer(
				this.floorLayer,
				this.names.floor,
				fPal,
				false,
				W,
				H,
				gs,
			);
			this._syncLayer(
				this.ceilLayer,
				this.names.ceil,
				null,
				true,
				W,
				H,
				gs,
			);
			this._syncLayer(
				this.ceilTexLayer,
				this.names.ceilTex,
				cPal,
				false,
				W,
				H,
				gs,
			);
			const rPal = this._paletteFor(
				"roof",
				lookupCached(tg, "roof palette", "list"),
			);
			this._syncRoofLayer(W, H, gs, rPal);
			const floorPass = this.floorLayer.state === "ready";
			const ceilPass = this.ceilLayer.state === "ready";
			const texReady = ceilPass && this.ceilTexLayer.state === "ready";
			const roofPass = this.roofLayer.state === "ready";
			const ts = this._stageNum(util, "textureSize", 64);
			const fT = floorPass ? this._tiles(util, "floor", fPal, ts) : null;
			const cT = texReady ? this._tiles(util, "ceiling", cPal, ts) : null;
			const rT = roofPass ? this._tiles(util, "roof", rPal, ts) : null;
			const rg = roofPass ? this.roofLayer.grid : null;
			this.core.setLayers({
				roof: roofPass
					? {
							codes: rg.codes,
							frac: rg.frac,
							enc: rg.enc,
							hasWhite: rg.hasWhite,
							a: rT.a,
							t: rT.t,
						}
					: null,
				gs,
				gw: W * gs,
				gh: H * gs,
				floor: floorPass
					? { grid: this.floorLayer.grid, a: fT.a, t: fT.t }
					: null,
				ceil: ceilPass ? { grid: this.ceilLayer.grid } : null,
				ceilTex: texReady
					? { grid: this.ceilTexLayer.grid, a: cT.a, t: cT.t }
					: null,
			});
			return { floorPass, ceilPass, roofPass };
		}

		beginFrame(args, util) {
			this.ready = false;
			this.ms = 0;
			this.core.clearBuffer();
			const t0 = performance.now();
			try {
				this._ensureGpu();
				const res = this._num(util, "res");
				const textureSize = this._num(util, "textureSize");
				if (!(res > 0))
					throw new Error('variable "res" must be above 0');
				if (!(textureSize > 0))
					throw new Error('variable "textureSize" must be above 0');
				const mouse = runtime.ioDevices.mouse;
				const moving =
					!looseEquals(
						this._var(util, "myPosy").value,
						this._var(util, "lastPPosY").value,
					) ||
					!looseEquals(
						this._var(util, "myPosx").value,
						this._var(util, "lastPPosX").value,
					) ||
					!looseEquals(
						mouse.getScratchX(),
						this._var(util, "lastMouseX").value,
					) ||
					!looseEquals(
						mouse.getScratchY(),
						this._var(util, "lastMouseY").value,
					);
				const { floorPass, ceilPass, roofPass } = this._updateLayers(
					util,
					this.sizeW,
					this.sizeH,
				);
				let playerX = 0;
				let playerY = 0;
				if (floorPass || ceilPass || roofPass) {
					const pl =
						runtime.getSpriteTargetByName("2D => 3D//player");
					if (!pl)
						throw new Error('Missing sprite: "2D => 3D//player"');
					playerX = pl.x;
					playerY = pl.y;
				}
				this.core.begin(
					{
						floorPass,
						ceilPass,
						playerX,
						playerY,
						roofPass,
						roofHeight: this.roof.height,
						roofTile: this.roof.tile,
						camDir: this._num(util, "camera dir"),
						tileWorld: this.tileWorld,
						ceilTile: this.ceilTile,
						res,
						textureSize,
						dv: this._num(util, "dv"),
						camY: this._num(util, "camera Y"),
						levelLight: this._num(util, "levelLight"),
						level: this._num(util, "☁ Level"),
						groundColor: this._var(util, "groundColor").value,
						ceilingColor: this._var(util, "ceilingColor").value,
						drawCeiling:
							looseEquals(
								this._var(util, "Draw Ceiling").value,
								1,
							) &&
							looseEquals(this._var(util, "inside?").value, 1),
						moving,
					},
					this._list(util, "SCAN"),
					this._list(util, "floorNoise"),
				);
				this.ready = true;
				this.error = "";
			} catch (e) {
				this._fail(e);
			}
			this.ms += performance.now() - t0;
		}

		async bakeAtlas(args, util) {
			const t0 = performance.now();
			try {
				this.texSprite = String(args.SPRITE);
				const target = runtime.getSpriteTargetByName(this.texSprite);
				if (!target)
					throw new Error('no sprite named "' + this.texSprite + '"');
				const list = lookupCached(
					util.target,
					String(args.LIST),
					"list",
				);
				if (!list)
					throw new Error(
						'no list named "' + String(args.LIST) + '"',
					);
				const ts = this._stageNum(util, "textureSize", 64);
				const atlasW = 480;
				const costumes = target.getCostumes();
				if (!costumes.length)
					throw new Error('"' + this.texSprite + '" has no costumes');
				if (ts > atlasW)
					throw new Error(
						"textureSize is larger than the atlas width",
					);
				const canvas = document.createElement("canvas");
				canvas.width = ts;
				canvas.height = ts;
				const ctx = canvas.getContext("2d", {
					willReadFrequently: true,
				});
				const tiles = [];
				for (const costume of costumes) {
					const { img, w, h } = await this._loadCostumeImage(costume);
					ctx.globalCompositeOperation = "source-over";
					ctx.fillStyle = "#000000";
					ctx.fillRect(0, 0, ts, ts);
					ctx.imageSmoothingEnabled = !(w === ts && h === ts);
					ctx.imageSmoothingQuality = "high";
					ctx.drawImage(img, 0, 0, w, h, 0, 0, ts, ts);
					if (typeof img.close === "function") img.close();
					tiles.push(
						new Uint8ClampedArray(
							ctx.getImageData(0, 0, ts, ts).data,
						),
					);
				}
				const { list: atlas } = composeAtlas(tiles, ts, atlasW);
				list.value = atlas;
				const namesList = lookupCached(
					util.target,
					"texture names",
					"list",
				);
				if (namesList)
					namesList.value = costumes.map((c) => String(c.name));
				runtime.requestRedraw();
				if (atlas.length > 200000)
					this._warnOnce(
						"the texture atlas has " +
							atlas.length +
							" items: the list limit of 200,000 must be removed",
					);
			} catch (e) {
				console.error("[Fast Renderer] texture atlas", e);
			}
		}

		drawBackdrop(args, util) {
			if (!this.ready) return;
			const t0 = performance.now();
			try {
				this.core.renderBackdrop();
				if (this.core.roofActive) {
					const ds = this._list(util, "draw dist");
					this.core.setRows(
						this._list(util, "draw type"),
						this._list(util, "draw x"),
						ds,
					);
					let far = 0;
					for (let i = 0; i < ds.length; i++) {
						const v = toNumber(ds[i]);
						if (v < 99999 && v > far) far = v;
					}
					this.core.flushRoofs(this.core.lastWall ? far : -1);
				}
				this._flush();
			} catch (e) {
				this._fail(e);
			}
			this.ms += performance.now() - t0;
		}

		extraRendering(args, util) {
			this.beginFrame(args, util);
			if (this.ready) this.drawBackdrop(args, util);
		}

		renderWalls(args, util) {
			const row = Math.floor(toNumber(args.ROW));
			if (!this.ready) return row;
			const t0 = performance.now();
			try {
				const core = this.core;
				const gbVar = this._var(util, "groundBright");
				const iVar = this._var(util, "i");
				core.gb = toNumber(gbVar.value);
				core.ni = Math.max(1, Math.floor(toNumber(iVar.value)));
				const next = core.renderWalls(
					this._list(util, "draw type"),
					this._list(util, "draw x"),
					this._list(util, "draw dist"),
					row,
				);
				gbVar.value = core.gb;
				iVar.value = core.ni;
				this._flush();
				this.ms += performance.now() - t0;
				return next;
			} catch (e) {
				this._fail(e);
				return row;
			}
		}

		isReady() {
			return this.ready;
		}
		setCaps(args) {
			this.core.roundCaps = String(args.STYLE) !== "flat";
		}

		setPixelate(args) {
			const pen = runtime.ext_pen;
			const penID = pen && pen._penDrawableId;
			if (penID === undefined || penID === null) return;
			const renderer = vm.renderer || Scratch.renderer;
			const drawable = renderer && renderer._allDrawables[penID];
			if (!drawable) return;
			const v = Number(args.VALUE);
			if (!Number.isFinite(v)) return;
			drawable.updateEffect("pixelate", v);
		}

		beepFull(args) {
			playBeep(Number(args.FREQ), Number(args.DUR), Number(args.VOL));
		}

		stampAndLog(args, util) {
			const target = util.target;
			if (!target || target.isStage) return;

			const pen = runtime.ext_pen;
			if (pen && typeof pen.stamp === "function") pen.stamp({}, util);

			const list = findStampList(target);
			if (!list) return;
			const renderer = vm.renderer || Scratch.renderer;
			if (!renderer) return;
			const drawable = renderer._allDrawables[target.drawableID];
			if (!drawable || typeof drawable.isTouching !== "function") {
				console.error(
					"[Fast Renderer] stamp and log: cannot read sprite pixels",
				);
				return;
			}

			let N = Math.round(Number(args.PRECISION));
			if (!(N >= 1)) N = STAMP_DEFAULT_PRECISION;

			const st = getStampState(N);
			syncStampState(st, list);

			if (typeof drawable.updateCPURenderAttributes === "function")
				drawable.updateCPURenderAttributes();
			const b = drawable.getFastBounds();
			const x0 = Math.max(Math.ceil(b.left / N), st.cxMin);
			const x1 = Math.min(Math.floor(b.right / N), st.cxMin + st.tw - 1);
			const y0 = Math.max(Math.ceil(b.bottom / N), st.cyMax - st.th + 1);
			const y1 = Math.min(Math.floor(b.top / N), st.cyMax);

			const items = list.value;
			for (let cy = y0; cy <= y1; cy++) {
				stampProbe[1] = cy * N;
				const row = (st.cyMax - cy) * st.tw;
				for (let cx = x0; cx <= x1; cx++) {
					const idx = row + (cx - st.cxMin);
					if (st.table[idx]) continue;
					stampProbe[0] = cx * N;
					if (drawable.isTouching(stampProbe)) {
						st.table[idx] = 1;
						items.push(cx + "," + cy);
					}
				}
			}
			st.len = items.length;
			list._monitorUpToDate = false;
		}

		isTouchingStamp(args, util) {
			const target = util.target;
			if (!target || target.isStage) return false;
			const list = findStampList(target);
			if (!list) return false;

			let N = Math.round(Number(args.PRECISION));
			if (!(N >= 1)) N = STAMP_DEFAULT_PRECISION;

			const st = getStampState(N);
			syncStampState(st, list);

			const ix = Math.round(target.x / N) - st.cxMin;
			const iy = st.cyMax - Math.round(target.y / N);
			if (ix < 0 || ix >= st.tw || iy < 0 || iy >= st.th) return false;
			return st.table[iy * st.tw + ix] === 1;
		}
	}

	Scratch.extensions.register(new FHFastRenderer());
})(typeof globalThis !== "undefined" ? globalThis : window);
