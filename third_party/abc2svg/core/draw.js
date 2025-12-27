// abc2svg - draw.js - draw functions
//
// Copyright (C) 2014-2025 Jean-Francois Moine
//
// This file is part of abc2svg-core.
//
// abc2svg-core is free software: you can redistribute it and/or modify
// it under the terms of the GNU Lesser General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// abc2svg-core is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Lesser General Public License for more details.
//
// You should have received a copy of the GNU Lesser General Public License
// along with abc2svg-core.  If not, see <http://www.gnu.org/licenses/>.

// constants
var	STEM_MIN	= 16,	/* min stem height under beams */
	STEM_MIN2	= 14,	/* ... for notes with two beams */
	STEM_MIN3	= 12,	/* ... for notes with three beams */
	STEM_MIN4	= 10,	/* ... for notes with four beams */
	STEM_CH_MIN	= 14,	/* min stem height for chords under beams */
	STEM_CH_MIN2	= 10,	/* ... for notes with two beams */
	STEM_CH_MIN3	= 9,	/* ... for notes with three beams */
	STEM_CH_MIN4	= 9,	/* ... for notes with four beams */
	BEAM_DEPTH	= 3.2,	/* width of a beam stroke */
	BEAM_OFFSET	= .25,	/* pos of flat beam relative to staff line */
	BEAM_SHIFT	= 5,	/* shift of second and third beams */
	BEAM_STUB	= 7,	/* length of stub for flag under beam */ 
	SLUR_SLOPE	= .7,	// max slope of a slur
	GSTEM		= 15,	/* grace note stem length */
	GSTEM_XOFF	= 2.3	/* x offset for grace note stem */

    var cache,
	anno_a = []		// symbols with annotations

/* -- compute the best vertical offset for the beams -- */
function b_pos(grace, stem, nflags, b) {
	var	top, bot, d1, d2,
		shift = !grace ? BEAM_SHIFT : 3.5,
		depth = !grace ? BEAM_DEPTH : 1.8

	/* -- up/down shift needed to get k*6 -- */
	function rnd6(y) {
		var iy = Math.round((y + 12) / 6) * 6 - 12
		return iy - y
	} // rnd6()

	if (stem > 0) {
		bot = b - (nflags - 1) * shift - depth
		if (bot > 26)
			return 0
		top = b
	} else {
		top = b + (nflags - 1) * shift + depth
		if (top < -2)
			return 0
		bot = b
	}

	d1 = rnd6(top - BEAM_OFFSET);
	d2 = rnd6(bot + BEAM_OFFSET)
	return d1 * d1 > d2 * d2 ? d2 : d1
}

/* duplicate a note for beaming continuation */
function sym_dup(s) {
    var	m, note

	s = clone(s)
	s.invis = true
	delete s.extra;
	delete s.text
	delete s.a_gch
	delete s.a_ly
	delete s.a_dd;
	delete s.tp
	s.notes = clone(s.notes)
	for (m = 0; m <= s.nhd; m++) {
		note = s.notes[m] = clone(s.notes[m])
		delete note.a_dd
	}
	return s
}

/* -- calculate a beam -- */
/* (the staves may be defined or not) */
var min_tb = [
	[STEM_MIN, STEM_MIN,
		STEM_MIN2, STEM_MIN3, STEM_MIN4, STEM_MIN4],
	[STEM_CH_MIN, STEM_CH_MIN,
		STEM_CH_MIN2, STEM_CH_MIN3, STEM_CH_MIN4, STEM_CH_MIN4]
]

// (possible hook)
Abc.prototype.calculate_beam = function(bm, s1) {
    var	s, s2, g, notes, nflags, st, v, two_staves, two_dir,
	n, x, y, ys, a, b, stem_err, max_stem_err,
		p_min, p_max, s_closest,
		stem_xoff, scale,
		visible, dy

	if (!s1.beam_st) {	/* beam from previous music line */
		s = sym_dup(s1);
		lkvsym(s, s1);
		lktsym(s, s1);
		s.x -= 12
		if (s.x > s1.prev.x + 12)
			s.x = s1.prev.x + 12;
		s.beam_st = true
		delete s.beam_end;
		s.tmp = true
		delete s.sls;
		s1 = s
	}

	/* search last note in beam */
	notes = nflags = 0;	/* set x positions, count notes and flags */
	two_staves = two_dir = false;
	st = s1.st;
	v = s1.v;
	stem_xoff = s1.grace ? GSTEM_XOFF : 3.5
	for (s2 = s1;  ;s2 = s2.next) {
		if (s2.type == C.NOTE) {
			if (s2.nflags > nflags)
				nflags = s2.nflags;
			notes++
			if (s2.st != st)
				two_staves = true
			if (s2.stem != s1.stem)
				two_dir = true
			if (!visible && !s2.invis
			 && (!s2.stemless || s2.trem2))
				visible = true
			if (s2.beam_end)
				break
		}
		if (!s2.next) {		/* beam towards next music line */
			for (; ; s2 = s2.prev) {
				if (s2.type == C.NOTE)
					break
			}
			s = sym_dup(s2);
			s.next = s2.next
			if (s.next)
				s.next.prev = s;
			s2.next = s;
			s.prev = s2;
			s.ts_next = s2.ts_next
			if (s.ts_next)
				s.ts_next.ts_prev = s;
			s2.ts_next = s;
			s.ts_prev = s2
			delete s.beam_st;
			s.beam_end = true;
			s.tmp = true
			delete s.sls;
			s.x += 12
			if (s.x < realwidth - 12)
				s.x = realwidth - 12;
			s2 = s;
			notes++
			break
		}
	}

	// at least, must have a visible note with a stem
	if (!visible)
		return false;

	bm.s2 = s2			/* (don't display the flags) */

	if (staff_tb[st].y == 0) {	/* staves not defined */
		if (two_staves)
			return false
	} else {			/* staves defined */
//		if (!two_staves && !s1.grace) {
		if (!two_staves) {
			bm.s1 = s1;	/* beam already calculated */
			bm.a = (s1.ys - s2.ys) / (s1.xs - s2.xs);
			bm.b = s1.ys - s1.xs * bm.a + staff_tb[st].y;
			bm.nflags = nflags
			return true
		}
	}

	s_closest = s1;
	p_min = 100;
	p_max = 0
	for (s = s1; ; s = s.next) {
		if (s.type != C.NOTE)
			continue
		if ((scale = s.p_v.scale) == 1)
			scale = staff_tb[s.st].staffscale
		if (s.stem >= 0) {
			x = stem_xoff + s.notes[0].shhd
			if (s.notes[s.nhd].midi > p_max) {
				p_max = s.notes[s.nhd].midi
				s_closest = s
			}
		} else {
			x = -stem_xoff + s.notes[s.nhd].shhd
			if (s.notes[0].midi < p_min) {
				p_min = s.notes[0].midi
				s_closest = s
			}
		}
		s.xs = s.x + x * scale;
		if (s == s2)
			break
	}

	// have flat beams on grace notes when asked
	if (s.grace && s1.fmt.flatbeams)
		a = 0

	// if a note inside the beam is the closest to the beam, the beam is flat
	else if (!two_dir
	      && notes >= 3
	      && s_closest != s1 && s_closest != s2)
		a = 0

	y = s1.ys + staff_tb[st].y
	if (a == undefined) {
		if (two_dir
		 && s1.stem != s2.stem
		 && s1.st == s2.st) {		// if inverted stems,
			y -= 5 * s1.stem	// remove the beam depth
			s2.ys -= 5 * s2.stem			
		}
		a = (s2.ys + staff_tb[s2.st].y - y) / (s2.xs - s1.xs)
	}

	if (a != 0) {
		a = s1.fmt.beamslope * a /
			(s1.fmt.beamslope + Math.abs(a)) // max steepness for beam
		if (a > -.04 && a < .04)
			a = 0				// slope too low
	}

	// center the main beam
	b = (y + s2.ys + staff_tb[s2.st].y) / 2 - a * (s2.xs + s1.xs) / 2

	/* have room for the symbols in the staff */
	max_stem_err = 0;		/* check stem lengths */

	// when 2 directions, check if all beams are on the same side of the main beam
	s = s1
	if (two_dir) {
		n = 1
		while (1) {
			if (s.stem != s1.stem
			 && (s.nflags == 1
			  || s.beam_br1  || s.beam_br2)) {
				n = 0
				break
			}
			if (s == s2)
				break
			s = s.next
		}
		if (n)				// same side
			n = (s1.nflags + s2.nflags)
				* (s1.nflags >= s2.nflags ? s1.stem : s2.stem)
					/ 4
		else				// different sides
			n = -(s1.nflags * s1.stem + s2.nflags * s2.stem)
					/ 2
		b += ((s1.grace ? 3.5 : BEAM_SHIFT) * n
				+ BEAM_DEPTH * s1.stem) / 2
	} else if (!s1.grace) {		/* normal notes */
		var beam_h = BEAM_DEPTH + BEAM_SHIFT * (nflags - 1)
//--fixme: added for abc2svg
		while (s.ts_prev
		    && s.ts_prev.type == C.NOTE
		    && s.ts_prev.time == s.time
		    && s.ts_prev.x > s1.xs)
			s = s.ts_prev

		for (; s && s.time <= s2.time; s = s.ts_next) {
			if (s.type != C.NOTE
			 || s.invis
			 || (s.st != st
			  && s.v != v)) {
				continue
			}
			x = s.v == v ? s.xs : s.x;
			ys = a * x + b - staff_tb[s.st].y
			if (s.v == v) {
				stem_err = min_tb[s.nhd == 0 ? 0 : 1][s.nflags]
				if (s.stem > 0) {
					if (s.notes[s.nhd].pit > 26) {
						stem_err -= 2
						if (s.notes[s.nhd].pit > 28)
							stem_err -= 2
					}
					stem_err -= ys - 3 * (s.notes[s.nhd].pit - 18)
				} else {
					if (s.notes[0].pit < 18) {
						stem_err -= 2
						if (s.notes[0].pit < 16)
							stem_err -= 2
					}
					stem_err -= 3 * (s.notes[0].pit - 18) - ys
				}
				stem_err += BEAM_DEPTH + BEAM_SHIFT * (s.nflags - 1)
			} else {
/*fixme: KO when two_staves*/
				if (s1.stem > 0) {
					if (s.stem > 0) {
/*fixme: KO when the voice numbers are inverted*/
						if (s.ymn > ys + 4
						 || s.ymx < ys - beam_h - 2)
							continue
						if (s.v > v)
							stem_err = s.ymx - ys
						else
							stem_err = s.ymn + 8 - ys
					} else {
						stem_err = s.ymx - ys
					}
				} else {
					if (s.stem < 0) {
						if (s.ymx < ys - 4
						 || s.ymn > ys - beam_h - 2)
							continue
						if (s.v < v)
							stem_err = ys - s.ymn
						else
							stem_err = ys - s.ymx + 8
					} else {
						stem_err = ys - s.ymn
					}
				}
				stem_err += 2 + beam_h
			}
			if (stem_err > max_stem_err)
				max_stem_err = stem_err
		}
	} else {				/* grace notes */
		for ( ; ; s = s.next) {
			ys = a * s.xs + b - staff_tb[s.st].y;
			stem_err = GSTEM - 2
			if (s.stem > 0)
				stem_err -= ys - (3 * (s.notes[s.nhd].pit - 18))
			else
				stem_err += ys - (3 * (s.notes[0].pit - 18));
			stem_err += 3 * (s.nflags - 1)
			if (stem_err > max_stem_err)
				max_stem_err = stem_err
			if (s == s2)
				break
		}
	}

	if (max_stem_err > 0)		/* shift beam if stems too short */
		b += s1.stem * max_stem_err

	// have room for the gracenotes and clefs
    if (!two_staves && !two_dir)
	for (s = s1.next; ; s = s.next) {
		switch (s.type) {
		case C.REST:		/* cannot move rests in multi-voices */
			if (!s.multi)
				break
			g = s.ts_next
			if (!g || g.st != st
			 || (g.type != C.NOTE && g.type != C.REST))
				break
//fixme:too much vertical shift if some space above the note
//fixme:this does not fix rest under beam in second voice (ts_prev)
			/*fall thru*/
//		case C.BAR:
			if (s.invis)
				break
			/*fall thru*/
		case C.CLEF:
			y = a * s.x + b
			if (s1.stem > 0) {
				y = s.ymx - y
					+ BEAM_DEPTH + BEAM_SHIFT * (nflags - 1)
					+ 2
				if (y > 0)
					b += y
			} else {
				y = s.ymn - y
					- BEAM_DEPTH - BEAM_SHIFT * (nflags - 1)
					- 2
				if (y < 0)
					b += y
			}
			break
		case C.GRACE:
			for (g = s.extra; g; g = g.next) {
				y = a * g.x + b
				if (s1.stem > 0) {
					y = g.ymx - y
						+ BEAM_DEPTH + BEAM_SHIFT * (nflags - 1)
					if (y > 0)
						b += y
				} else {
					y = g.ymn - y
						- BEAM_DEPTH - BEAM_SHIFT * (nflags - 1)
					if (y < 0)
						b += y
				}
			}
			break
		}
		if (s == s2)
			break
	}

	if (a == 0)		/* shift flat beams onto staff lines */
		b += b_pos(s1.grace, s1.stem, nflags, b - staff_tb[st].y)

	/* adjust final stems and rests under beam */
	for (s = s1; ; s = s.next) {
		switch (s.type) {
		case C.NOTE:
			s.ys = a * s.xs + b - staff_tb[s.st].y
			if (s.stem > 0) {
				s.ymx = s.ys + 2.5
			} else {
				s.ymn = s.ys - 2.5
			}
			break
		case C.REST:
			y = a * s.x + b - staff_tb[s.st].y
			dy = BEAM_DEPTH + BEAM_SHIFT * (nflags - 1)
				+ (s.head != C.FULL ? 4 : 9)
			if (s1.stem > 0) {
				y -= dy
				if (s1.multi == 0 && y > 12)
					y = 12
				if (s.y <= y)
					break
			} else {
				y += dy
				if (s1.multi == 0 && y < 12)
					y = 12
				if (s.y >= y)
					break
			}
			if (s.head != C.FULL)
				y = (((y + 3 + 12) / 6) | 0) * 6 - 12;
			s.y = y
			break
		}
		if (s == s2)
			break
	}

	/* save beam parameters */
	if (staff_tb[st].y == 0)	/* if staves not defined */
		return false
	bm.s1 = s1;
	bm.a = a;
	bm.b = b;
	bm.nflags = nflags
	return true
}

/* -- draw the beams for one word -- */
/* (the staves are defined) */
function draw_beams(bm) {
    var	s, i, beam_dir, shift, bshift, bstub, bh, da, bsh,
		k, k1, k2, x1,
	osh = 0,				// shift other side
		s1 = bm.s1,
		s2 = bm.s2

	/* -- draw a single beam -- */
	function draw_beam(x1, x2, dy, h, bm,
				 n) {		/* beam number (1..n) */
		var	y1, dy2,
			s = bm.s1,
			nflags = s.nflags

		if (s.ntrem)
			nflags -= s.ntrem
		if (s.trem2 && n > nflags) {
			if (s.dur >= C.BLEN / 2) {
				x1 = s.x + 6;
				x2 = bm.s2.x - 6
			} else if (s.dur < C.BLEN / 4) {
			    var	dx = x2 - x1
				if (dx < 16) {
					x1 += dx / 4
					x2 -= dx / 4
				} else {
					x1 += 5
					x2 -= 6
				}
			}
		}

		y1 = bm.a * x1 + bm.b - dy;
		x2 -= x1;
		x2 /= stv_g.scale;
		dy2 = bm.a * x2 * stv_g.stsc
		xypath(x1, y1, true);
		output += 'l' + x2.toFixed(1) + ' ' + (-dy2).toFixed(1) +
			'v' + h.toFixed(1) +
			'l' + (-x2).toFixed(1) + ' ' + dy2.toFixed(1) +
			'z"/>\n'
	} // draw_beam()

	anno_start(s1, 'beam')
/*fixme: KO if many staves with different scales*/
//	set_scale(s1)
	if (!s1.grace) {
		bshift = BEAM_SHIFT;
		bstub = BEAM_STUB;
		shift = .34;		/* (half width of the stem) */
		bh = BEAM_DEPTH
	} else {
		bshift = 3.5;
		bstub = 3.2;
		shift = .29;
		bh = 1.8
	}
	bh /= stv_g.scale

/*fixme: quick hack for stubs at end of beam and different stem directions*/
	beam_dir = s1.stem
	if (s1.stem != s2.stem
	 && s1.nflags > s2.nflags)
		beam_dir = s2.stem
	if (beam_dir < 0)
		bh = -bh;

	/* make first beam over whole word and adjust the stem lengths */
	draw_beam(s1.xs - shift, s2.xs + shift, 0, bh, bm, 1);
	da = 0
	for (s = s1; ; s = s.next) {
		if (s.type == C.NOTE
		 && s.stem != beam_dir)
			s.ys = bm.a * s.xs + bm.b
				- staff_tb[s.st].y
				+ bshift * (s.nflags - 1) * s.stem
				- bh
		if (s == s2)
			break
	}

	if (s1.feathered_beam) {
		da = bshift / (s2.xs - s1.xs)
		if (s1.feathered_beam > 0) {
			da = -da;
			bshift = da * s1.xs
		} else {
			bshift = da * s2.xs
		}
		da = da * beam_dir
	}

	/* other beams with two or more flags */
	shift = 0
	for (i = 2; i <= bm.nflags; i++) {
		shift += bshift
		if (da != 0)
			bm.a += da
		for (s = s1; ; s = s.next) {
			if (s.type != C.NOTE
			 || s.nflags < i) {
				if (s == s2)
					break
				continue
			}
			if (s.trem1
			 && i > s.nflags - s.ntrem) {
				x1 = (s.dur >= C.BLEN / 2) ? s.x : s.xs;
				draw_beam(x1 - 5, x1 + 5,
					  (shift + 2.5) * beam_dir,
					  bh, bm, i)
				if (s == s2)
					break
				continue
			}
			k1 = s
			while (1) {
				if (s == s2)
					break
				k = s.next
				if (k.type == C.NOTE || k.type == C.REST) {
					if (k.trem1){
						if (k.nflags - k.ntrem < i)
							break
					} else if (k.nflags < i) {
						break
					}
				}
				if (k.beam_br1
				 || (k.beam_br2 && i > 2))
					break
				s = k
			}
			k2 = s
			while (k2.type != C.NOTE)
				k2 = k2.prev;
			x1 = k1.xs
			bsh = shift * beam_dir
			if (k1 == k2) {
				if (k1 == s1) {
					x1 += bstub
				} else if (k1 == s2) {
					x1 -= bstub
				} else if (k1.beam_br1
				        || (k1.beam_br2
					 && i > 2)) {
					x1 += bstub
				} else {
					k = k1.next
					while (k.type != C.NOTE)
						k = k.next
					if (k.beam_br1
					 || (k.beam_br2 && i > 2)) {
						x1 -= bstub
					} else {
						k1 = k1.prev
						while (k1.type != C.NOTE)
							k1 = k1.prev
						if (k1.nflags < k.nflags
						 || (k1.nflags == k.nflags
						  && k1.dots < k.dots))
							x1 += bstub
						else
							x1 -= bstub
					}
				}
				if (k1.stem != beam_dir) {
					osh -= bshift
					bsh = osh * beam_dir
					k1.ys = bm.a * k1.xs + bm.b
						- staff_tb[k1.st].y - bh
				}
			} else if (k1.stem == k2.stem && k1.stem != beam_dir) {

				// inverted stems: put the beam on the other side
				osh -= bshift
				bsh = osh * beam_dir
				for (s = k1; ; s = s.next) {
					if (s.type == C.NOTE)
						s.ys = bm.a * s.xs + bm.b
							- staff_tb[s.st].y
							- bh
					if (s == k2)
						break
				}
			}
			draw_beam(x1, k2.xs,
				  bsh,
				  bh, bm, i)
			if (s == s2)
				break
		}
	}
	if (s1.tmp)
		unlksym(s1)
	else if (s2.tmp)
		unlksym(s2)
	anno_stop(s1, 'beam')
}

/* -- draw the left side of the staves -- */
function draw_lstaff(x) {
    var	i, j, yb, h, fl,
		nst = cur_sy.nstaff,
		l = 0

	/* -- draw a system brace or bracket -- */
	function draw_sysbra(x, st, flag) {
		var i, st_end, yt, yb

		while (!cur_sy.st_print[st]) {
			if (cur_sy.staves[st].flags & flag)
				return
			st++
		}
		i = st_end = st
		while (1) {
			if (cur_sy.st_print[i])
				st_end = i
			if (cur_sy.staves[i].flags & flag)
				break
			i++
		}
		yt = staff_tb[st].y + staff_tb[st].topbar
					* staff_tb[st].staffscale;
		yb = staff_tb[st_end].y + staff_tb[st_end].botbar
					* staff_tb[st_end].staffscale
		if (flag & (CLOSE_BRACE | CLOSE_BRACE2))
			out_brace(x, yb, yt - yb)
		else
			out_bracket(x, yt, yt - yb)
	}

	for (i = 0; ; i++) {
		fl = cur_sy.staves[i].flags
		if (fl & (OPEN_BRACE | OPEN_BRACKET))
			l++
		if (cur_sy.st_print[i])
			break
		if (fl & (CLOSE_BRACE | CLOSE_BRACKET))
			l--
		if (i == nst)
			break
	}
	for (j = nst; j > i; j--) {
		if (cur_sy.st_print[j])
			break
	}
	if (i == j && l == 0)
		return
	yb = staff_tb[j].y + staff_tb[j].botbar * staff_tb[j].staffscale;
	h = staff_tb[i].y + staff_tb[i].topbar * staff_tb[i].staffscale - yb;
	xypath(x, yb);
	output += "v" + (-h).toFixed(1) + '"/>\n'
	for (i = 0; i <= nst; i++) {
		fl = cur_sy.staves[i].flags
		if (fl & OPEN_BRACE)
			draw_sysbra(x, i, CLOSE_BRACE)
		if (fl & OPEN_BRACKET)
			draw_sysbra(x, i, CLOSE_BRACKET)
		if (fl & OPEN_BRACE2)
			draw_sysbra(x - 6, i, CLOSE_BRACE2)
		if (fl & OPEN_BRACKET2)
			draw_sysbra(x - 6, i, CLOSE_BRACKET2)
	}
}

/* -- draw the time signature -- */
function draw_meter(s) {
	if (!s.a_meter)
		return
    var	i, m, meter, x, x0, yt,
	p_staff = staff_tb[s.st],
	y = p_staff.y

	// adjust the vertical offset according to the staff definition
	if (p_staff.stafflines != '|||||')
		y += (p_staff.topbar + p_staff.botbar) / 2 - 12	// bottom

	for (i = 0; i < s.a_meter.length; i++) {
		meter = s.a_meter[i];
		x = s.x + s.x_meter[i]
		yt = y + (meter.bot ? 18 : 12)
		if (s.a_meter[i + 1]
		 && (s.a_meter[i + 1].top == '|'
		  || s.a_meter[i + 1].top == '.')) {
			xygl(x, yt, "mtr" + meter.top[0] + s.a_meter[i + 1].top)
			i++
			continue
		}
		xygl(x, yt, "mtr" + meter.top[0])
		if (meter.top.length > 1) {
			m = 0
			x0 = x
			while (1) {
				switch (meter.top[m]) {
				case '(':
				case ')':
					x += 4
					break
				case '1':
					x += 8
					break
				case ' ':
					x += 4
					break
				case '+':
					x += 2
					// fall thru
				default:
					x += 10
					break
				}
				if (++m >= meter.top.length)
					break
				xygl(x, yt, "mtr" + meter.top[m])
			}
			x = (x0 + x) / 2 - 5
		}
		if (meter.bot) {
			if (meter.bot[1]) {
				if (meter.bot[0] == 1) {
					x0 = x - 4
					x += 4
				} else {
					x0 = x - 5
					x += 5
				}
				xygl(x0, y + 6, "mtr" + meter.bot[0])
				xygl(x, y + 6, "mtr" + meter.bot[1])
			} else {
				xygl(x, y + 6, "mtr" + meter.bot[0])
			}
		}
	}
}

    var	acc_nd = {}		// cache of the microtonal accidentals

/* -- draw an accidental -- */
function draw_acc(x, y, a) {
	if (typeof a == "object") {		// if microtone
	    var	c,
		n = a[0],
		d = a[1]

		c = n + '_' + d
		a = acc_nd[c]
		if (!a) {
			a = abc2svg.rat(Math.abs(n), d)
			d = a[1]
			a = (n < 0 ? -a[0] : a[0]).toString()
			if (d != 1)
				a += '_' + d
			acc_nd[c] = a
		}
	}
	xygl(x, y, "acc" + a)
}

// memorize the helper/ledger lines
function set_hl(p_st, n, x, dx1, dx2) {
    var	i, hl

	if (n >= 0) {
		hl = p_st.hlu[n]
		if (!hl)
			hl = p_st.hlu[n] = []
	} else {
		hl = p_st.hld[-n]
		if (!hl)
			hl = p_st.hld[-n] = []
	}

	for (i = 0; i < hl.length; i++) {
		if (x >= hl[i][0])
			break
	}
	if (i == hl.length) {
		hl.push([x, dx1, dx2])
	} else if (x > hl[i][0]) {
		hl.splice(++i, 0, [x, dx1, dx2])
	} else {
		if (dx1 < hl[i][1])
			hl[i][1] = dx1
		if (dx2 > hl[i][2])
			hl[i][2] = dx2
	}
} // set_hl()

// draw helper lines
// (possible hook)
Abc.prototype.draw_hl = function(s) {
    var	i, j, n, note,
	hla = [],
	st = s.st,
	p_staff = staff_tb[st]

	// check if any helper line
	if (!p_staff.hll
	 || s.invis)
		return			// no helper line (no line)
	for (i = 0; i <= s.nhd; i++) {
		note = s.notes[i]
		if (!p_staff.hlmap[note.pit - p_staff.hll])
			hla.push([note.pit - 18,
				  note.shhd * s.p_v.scale])
	}
	n = hla.length
	if (!n)
		return			// no

	// handle the helper lines out of the staff
    var	dx1, dx2, hl, shhd,hlp,
	stafflines = cur_sy.staves[st].stafflines,
	top = stafflines.length - 1,
	yu =  top,
	bot = (p_staff.hll - 17) / 2,
	yl = bot,
	dx = (s.grace ? 4 : hw_tb[s.head] * 1.3) * s.p_v.scale

	// get the x start and x stop of the intermediate helper lines
	note = s.notes[s.stem < 0 ? s.nhd : 0]
	shhd = note.shhd

	for (i = 0; i < hla.length; i++) {
		hlp = hla[i][0]
		dx1 = (hla[i][1] < shhd ? hla[i][1] : shhd) - dx
		dx2 = (hla[i][1] > shhd ? hla[i][1] : shhd) + dx
		if (hlp < bot * 2) {
			if (++hlp < yl * 2)
				yl = hlp >> 1
			n--
		} else if (hlp > top * 2) {
			yu = hlp >> 1
			n--
		}
		set_hl(p_staff, hlp >> 1, s.x, dx1, dx2)
	}

	dx1 = shhd - dx
	dx2 = shhd + dx
	while (++yl < bot)
		set_hl(p_staff, yl,
			s.x, dx1, dx2)
	while (--yu > top)
		set_hl(p_staff, yu,
			s.x, dx1, dx2)
	if (!n)
		return			// no more helper lines

	// draw the helper lines inside the staff
	i = yl;
	j = yu
	while (i > bot && stafflines[i] == '-')
		i--
	while (j < top && stafflines[j] == '-')
		j++
	for ( ; i < j; i++) {
		if (stafflines[i] == '-')
			set_hl(p_staff, i, s.x, dx1, dx2)
	}
}

/* -- draw a key signature -- */
// (possible hook)
var	sharp_cl = new Int8Array([24, 9, 15, 21, 6, 12, 18]),
	flat_cl = new Int8Array([12, 18, 24, 9, 15, 21, 6]),
	sharp1 = new Int8Array([-9, 12, -9, -9, 12, -9]),
	sharp2 = new Int8Array([12, -9, 12, -9, 12, -9]),
	flat1 = new Int8Array([9, -12, 9, -12, 9, -12]),
	flat2 = new Int8Array([-12, 9, -12, 9, -12, 9])

Abc.prototype.draw_keysig = function(x, s) {
	var	old_sf = s.k_old_sf,
		st = s.st,
		staffb = staff_tb[st].y,
		i, shift, p_seq,
		clef_ix = s.k_y_clef,
	a_acc = s.k_a_acc			// accidental list [pit, acc]

	// set the accidentals when K: with modified accidentals
	function set_k_acc(a_acc, sf) {
	    var i, j, n, nacc, p_acc,
		accs = [],
		pits = []

		if (sf > 0) {
			for (nacc = 0; nacc < sf; nacc++) {
				accs[nacc] = 1			// sharp
				pits[nacc] = [26, 23, 27, 24, 21, 25, 22][nacc]
			}
		} else {
			for (nacc = 0; nacc < -sf; nacc++) {
				accs[nacc] = -1			// flat
				pits[nacc] = [22, 25, 21, 24, 20, 23, 26][nacc]
			}
		}
		n = a_acc.length
		for (i = 0; i < n; i++) {
			p_acc = a_acc[i]
			for (j = 0; j < nacc; j++) {
				if (pits[j] == p_acc.pit) {
					accs[j] = p_acc.acc
					break
				}
			}
			if (j == nacc) {
				accs[j] = p_acc.acc
				pits[j] = p_acc.pit
				nacc++
			}
		}
		for (i = 0; i < nacc; i++) {
			p_acc = a_acc[i]
			if (!p_acc)
				p_acc = a_acc[i] = {}
			p_acc.acc = accs[i]
			p_acc.pit = pits[i]
		}
	} // set_k_acc()

	// ---- draw_keysig ---
	if (clef_ix & 1)
		clef_ix += 7;
	clef_ix /= 2
	while (clef_ix < 0)
		clef_ix += 7;
	clef_ix %= 7

	/* normal accidentals */
	if (a_acc && !s.exp)			// if added accidentals
		set_k_acc(a_acc, s.k_sf)	// merge them into the key

	if (!a_acc) {

		/* put neutrals if 'accidental cancel' */
		if (s.fmt.cancelkey || s.k_sf == 0) {

			/* when flats to sharps, or sharps to flats, */
			if (s.k_sf == 0
			 || old_sf * s.k_sf < 0) {

				/* old sharps */
				shift = sharp_cl[clef_ix];
				p_seq = shift > 9 ? sharp1 : sharp2
				for (i = 0; i < old_sf; i++) {
					xygl(x, staffb + shift, "acc3");
					shift += p_seq[i];
					x += 5.5
				}

				/* old flats */
				shift = flat_cl[clef_ix];
				p_seq = shift < 18 ? flat1 : flat2
				for (i = 0; i > old_sf; i--) {
					xygl(x, staffb + shift, "acc3");
					shift += p_seq[-i];
					x += 5.5
				}
				if (s.k_sf != 0)
					x += 3		/* extra space */
			}
		}

		/* new sharps */
		if (s.k_sf > 0) {
			shift = sharp_cl[clef_ix];
			p_seq = shift > 9 ? sharp1 : sharp2
			for (i = 0; i < s.k_sf; i++) {
				xygl(x, staffb + shift, "acc1");
				shift += p_seq[i];
				x += 5.5
			}
			if (s.fmt.cancelkey && i < old_sf) {
				x += 2
				for (; i < old_sf; i++) {
					xygl(x, staffb + shift, "acc3");
					shift += p_seq[i];
					x += 5.5
				}
			}
			if (s.k_bagpipe == 'p') {	// K:Hp - add the g natural
				xygl(x, staffb + 27, "acc3")
				x += 5.5
			}
		}

		/* new flats */
		if (s.k_sf < 0) {
			shift = flat_cl[clef_ix];
			p_seq = shift < 18 ? flat1 : flat2
			for (i = 0; i > s.k_sf; i--) {
				xygl(x, staffb + shift, "acc-1");
				shift += p_seq[-i];
				x += 5.5
			}
			if (s.fmt.cancelkey && i > old_sf) {
				x += 2
				for (; i > old_sf; i--) {
					xygl(x, staffb + shift, "acc3");
					shift += p_seq[-i];
					x += 5.5
				}
			}
		}
	} else if (a_acc.length) {

		/* explicit accidentals */
		var	acc,
			last_acc = a_acc[0].acc,
			last_shift = 100,
			s2 = {
				st: st,
				nhd: 0,
				notes: [{}]
			}

		for (i = 0; i < a_acc.length; i++) {
			acc = a_acc[i];
			shift = (s.k_y_clef	// clef shift
				+ acc.pit - 18) * 3
			while (shift < -3)		// let the accidentals inside the staff
				shift += 21
			while (shift > 27)
				shift -= 21
			if (i != 0
			 && (shift > last_shift + 18
			  || shift < last_shift - 18))
				x -= 5.5		// no clash
			else if (acc.acc != last_acc)
				x += 3;
			last_acc = acc.acc;
			s2.x = x
			s2.notes[0].pit = shift / 3 + 18;
// is this useful?
//			s2.head = C.FULL
//			s2.notes[0].shhd = 0
//			self.draw_hl(s2)
			last_shift = shift;
			draw_acc(x, staffb + shift, acc.acc)
			x += 5.5
		}
	}
}

// output the measure repeat number
function nrep_out(x, y, n) {
	y -= 3
	if (n < 10) {
		xygl(x - 4, y, "mtr" + n)
	} else {
		xygl(x - 10, y, "mtr" + ((n / 10) | 0))
		xygl(x - 2, y, "mtr" + (n % 10))
	}
} // nrep_out()

// if rest alone in the measure or measure repeat,
// change the head and center
function center_rest(s) {
    var	s2, x
	
	if (s.dur < C.BLEN * 2)
		s.nflags = -2		// semibreve / whole
	else if (s.dur < C.BLEN * 4)
		s.nflags = -3
	else
		s.nflags = -4
	s.dots = 0

	/* don't use next/prev: there is no bar in voice overlay */
	s2 = s.ts_next
	while (s2.time != s.time + s.dur
	    && s2.ts_next)
		s2 = s2.ts_next
	x = s2.x - s2.wl
	s2 = s
	while (!s2.seqst)
		s2 = s2.ts_prev
	s2 = s2.ts_prev
	x = (x + s2.x + s2.wr) / 2

	/* center the associated decorations */
	if (s.a_dd)
		deco_update(s, x - s.x)
	s.x = x
} // center_rest()

/* -- draw a rest -- */
/* (the staves are defined) */
var rest_tb = [
	"r128", "r64", "r32", "r16", "r8",
	"r4",
	"r2", "r1", "r0", "r00"]

function draw_rest(s) {
    var	s2, i, j, y, bx,
	p_staff = staff_tb[s.st],
	yb = p_staff.y,			// bottom of staff
	x = s.x

	if (s.notes[0].shhd)
		x += s.notes[0].shhd * stv_g.scale

	if (s.rep_nb) {
		set_sscale(s.st);
		anno_start(s);
		if (p_staff.stafflines == '|||||')
			yb += 12
		else
			yb += (p_staff.topbar + p_staff.botbar) / 2
		if (s.rep_nb < 0) {
			xygl(x, yb, "srep")
		} else {
			xygl(x, yb, "mrep")
			if (s.rep_nb > 2 && s.v == cur_sy.top_voice
			 && s.fmt.measrepnb > 0
			 && !(s.rep_nb % s.fmt.measrepnb))
				nrep_out(x, yb + p_staff.topbar, s.rep_nb)
		}
		anno_a.push(s)
		return
	}

	set_scale(s);
	anno_start(s);

	if (s.notes[0].color)
		set_color(s.notes[0].color);

	y = s.y;

	i = 5 - s.nflags		/* rest_tb index (5 = C_XFLAGS) */
	if (i == 7 && y == 12
	 && p_staff.stafflines.length <= 2)
		y -= 6				/* semibreve a bit lower */

	// draw the rest
	if (!s.notes[0].invis)		// if not head replacement
		xygl(x, y + yb, rest_tb[i])

	if (s.dots) {
		x += 8;
		y += yb + 3
		j = s.dots
		i = (s.dur_orig / 12) >> ((5 - s.nflags) - j)
		while (j-- > 0) {
			xygl(x, y, (i & (1 << j)) ? "dot" : "dot+")
			x += 3.5
		}
	}
	set_color();
	anno_a.push(s)
}

// -- draw a multi-measure rest --
// (the staves are defined)
function draw_mrest(s) {
	if (s.second)
		return
    var	x1, x2, s2,
	p_st = staff_tb[s.st],
	y = p_st.y + (p_st.topbar + p_st.botbar) / 2,
	p = s.nmes.toString()

	// output an old multimeasure rest
	function omrest() {
	    var	x = s.x,
		y = p_st.y + 12,
		n = s.nmes,
		k = n >> 2			// number of rests

		if (n & 3) {
			k++
			if (n & 3 == 3)
				k++
		}
//dx = 6
		x -= 3 * (k - 1)
		while (n >= 4) {
			xygl(x, y, "r00")
			n -= 4
			x += 6
		}
		if (n >= 2) {
			xygl(x, y, "r0")
			n -= 2
			x += 6
		}
		if (n)
			xygl(x + 2, y, "r1")
	} // omrest()

	set_scale(s)

	s2 = s			// search the start of the previous time sequence
	while (!s2.seqst)
		s2 = s2.ts_prev
	s2 = s2.ts_prev
	while (!s2.seqst)
		s2 = s2.ts_prev
	x1 = s2.x + 20

	s2 = s.ts_next		// search the next symbol on the same staff
	for (s2 = s.ts_next; s2 && !s2.seqst; s2 = s2.ts_next)
		;			// search the next symbol on the same staff
	x2 = s2 ? s2.x - 20 : s.x + 20 

	s.x = (x1 + x2) / 2
	anno_start(s)
	if (!cfmt.oldmrest || s.nmes > cfmt.oldmrest) {
		out_XYAB('<path d="mX Y', x1 + .6, y - 2.7)
		output += 'v2.7h-1.4v-10.8h1.4v2.7h'
			+ ((x2 - x1 - 2.8) / stv_g.scale).toFixed(1)
			+ 'v-2.7h1.4v10.8h-1.4v-2.7z"/>\n'
	} else {
		omrest()		// old multirest
	}
    if (s.tacet)
	out_XYAB('<text x ="X" y="Y" style="font-size:12px;font-weight:700"\
 text-anchor="middle">A</text>\n',
		s.x, y + 18, s.tacet)
    else
	out_XYAB('<text x ="X" y="Y" text-anchor="middle">A</text>\n',
		s.x, y + 22, m_gl(p))
	anno_a.push(s)
} // draw_mrest()

function grace_slur(s) {
    var	yy, x0, y0, x3, y3, bet1, bet2, dy1, dy2, last, below,
	so = s,
	g = s.extra

	while (1) {
		if (!g.next)
			break			/* (keep the last note) */
		g = g.next
	}
	last = g

	below = ((g.stem >= 0 || s.multi < 0) && g.notes[0].pit <= 28)
			|| g.notes[0].pit < 16
	if (below) {
		yy = 127
		for (g = s.extra; g; g = g.next) {
			if (g.y < yy) {
				yy = g.y;
				last = g
			}
		}
		x0 = last.x;
		y0 = last.y - 5
		if (s.extra != last) {
			x0 -= 4;
			y0 += 1
		}
		s = s.next;
		x3 = s.x - 1
		if (s.stem < 0 && s.nflags > -2)
			x3 -= 4;
		y3 = 3 * (s.notes[0].pit - 18) - 5;
		dy1 = (x3 - x0) * .4
		if (dy1 > 3)
			dy1 = 3;
		dy2 = dy1;
		bet1 = .2;
		bet2 = .8
		if (y0 > y3 + 7) {
			x0 = last.x - 1;
			y0 += .5;
			y3 += 6.5;
			x3 = s.x - 5.5;
			dy1 = (y0 - y3) * .8;
			dy2 = (y0 - y3) * .2;
			bet1 = 0
		} else if (y3 > y0 + 4) {
			y3 = y0 + 4;
			x0 = last.x + 2;
			y0 = last.y - 4
		}
	} else {				// slur above
		yy = -127
		for (g = s.extra; g; g = g.next) {
			if (g.y > yy) {
				yy = g.y;
				last = g
			}
		}
		x0 = last.x;
		y0 = last.y + 5
		if (s.extra != last) {
			x0 -= 4;
			y0 -= 1
		}
		s = s.next;
		x3 = s.x - 1
		if (s.stem >= 0 && s.nflags > -2)
			x3 -= 2;
		y3 = 3 * (s.notes[s.nhd].pit - 18) + 5;
		dy1 = (x0 - x3) * .4
		if (dy1 < -3)
			dy1 = -3;
		dy2 = dy1;
		bet1 = .2;
		bet2 = .8
		if (y0 < y3 - 7) {
			x0 = last.x - 1;
			y0 -= .5;
			y3 -= 6.5;
			x3 = s.x - 5.5;
			dy1 = (y0 - y3) * .8;
			dy2 = (y0 - y3) * .2;
			bet1 = 0
		} else if (y3 < y0 - 4) {
			y3 = y0 - 4;
			x0 = last.x + 2;
			y0 = last.y + 4
		}
	}

	so.slur = {
		x0: x0,
		y0: y0,
		x1: bet1 * x3 + (1 - bet1) * x0 - x0,
		y1: y0 - bet1 * y3 - (1 - bet1) * y0 + dy1,
		x2: bet2 * x3 + (1 - bet2) * x0 - x0,
		y2: y0 - bet2 * y3 - (1 - bet2) * y0 + dy2,
		x3: x3 - x0,
		y3: y0 - y3
	}
	y0 -= so.slur.y1
	g = so.extra
//fixme: useless?
//	y_set(s.st, !below, x0, x3 - x0, y0)
	if (below) {
		if (y0 < g.ymn)
			g.ymn = y0
	} else {
		if (y0 > g.ymx)
			g.ymx = y0
	}
} // grace_slur()

/* -- draw grace notes -- */
/* (the staves are defined) */
function draw_gracenotes(s) {
    var	x1, y1,
	last, note,
	bm = {},
	g = s.extra

	/* draw the notes */
//	bm.s2 = undefined			/* (draw flags) */
	while (1) {
		if (g.beam_st && !g.beam_end) {
			if (self.calculate_beam(bm, g))
				draw_beams(bm)
		}
		anno_start(g)
		draw_note(g, !bm.s2)
		if (g == bm.s2)
			bm.s2 = null			/* (draw flags again) */
		anno_a.push(s)
//		if (g.sls || g.sl2)
//			slur = true
		if (!g.next)
			break			/* (keep the last note) */
		g = g.next
	}
	last = g

	// if an acciaccatura, draw a bar 
	if (s.sappo) {
		g = s.extra
		if (!g.next) {			/* if one note */
			x1 = 9
			y1 = g.stem > 0 ? 5 : -5
		} else {			/* many notes */
			x1 = (g.next.x - g.x) * .5 + 4
			y1 = (g.ys + g.next.ys) * .5 - g.y
			if (g.stem > 0)
				y1 -= 1
			else
				y1 += 1
		}
		note = g.notes[g.stem < 0 ? 0 : g.nhd]
		out_acciac(g.x, y_head(g, note),
				x1, y1, g.stem > 0)
	}

	/* slur */
	g = s.slur
	if (g) {
		anno_start(s, 'slur')
		xypath(g.x0, g.y0 + staff_tb[s.st].y)
		output += 'c' + g.x1.toFixed(1) + ' ' + g.y1.toFixed(1) +
			' ' + g.x2.toFixed(1) + ' ' + g.y2.toFixed(1) +
			' ' + g.x3.toFixed(1) + ' ' + g.y3.toFixed(1) + '"/>\n'
		anno_stop(s, 'slur')
	}
}

/* -- set the y offset of the dots -- */
function setdoty(s, y_tb) {
	var m, m1, y

	/* set the normal offsets */
	for (m = 0; m <= s.nhd; m++) {
		y = 3 * (s.notes[m].pit - 18)	/* note height on staff */
		if ((y % 6) == 0) {
			if (s.dot_low)
				y -= 3
			else
				y += 3
		}
		y_tb[m] = y
	}
	/* dispatch and recenter the dots in the staff spaces */
	for (m = 0; m < s.nhd; m++) {
		if (y_tb[m + 1] > y_tb[m])
			continue
		m1 = m
		while (m1 > 0) {
			if (y_tb[m1] > y_tb[m1 - 1] + 6)
				break
			m1--
		}
		if (3 * (s.notes[m1].pit - 18) - y_tb[m1]
				< y_tb[m + 1] - 3 * (s.notes[m + 1].pit - 18)) {
			while (m1 <= m)
				y_tb[m1++] -= 6
		} else {
			y_tb[m + 1] = y_tb[m] + 6
		}
	}
}

// get the y offset of a note head
// (when the staves are defined)
function y_head(s, note) {
	return staff_tb[s.st].y + 3 * (note.pit - 18)
}

/* -- draw m-th head with accidentals and dots -- */
/* (the staves are defined) */
// sets {x,y}_note
function draw_basic_note(s, m, y_tb) {
    var	i, p, yy, dotx, doty, inv, head, dots, nflags,
		old_color = false,
		note = s.notes[m],
		staffb = staff_tb[s.st].y,	/* bottom of staff */
	x = s.x,
		y = 3 * (note.pit - 18),	/* note height on staff */
		shhd = note.shhd * stv_g.scale,
		x_note = x + shhd,
		y_note = y + staffb

//	/* special case for voice unison */
//	if (s.nohdi1 != undefined
//	 && m >= s.nohdi1 && m < s.nohdi2)
//		return

	if (note.dur == s.dur) {
		head = s.head
		dots = s.dots
		nflags = s.nflags
	} else {
		i = identify_note(s, note.dur)
		head = i[0]
		dots = i[1]
		nflags = i[2]
	}

	/* draw the head */
	if (note.invis) {
		;
	} else if (note.map && note.map[0]) {
		i = head;
		p = note.map[0][i]		// heads
		if (!p)
			p = note.map[0][note.map[0].length - 1]
		i = p.indexOf('/')
		if (i >= 0) {			// stem dependant
			if (s.stem >= 0)
				p = p.slice(0, i)
			else
				p = p.slice(i + 1)
		}
	} else if (s.type == C.CUSTOS) {
		p = "custos"
	} else {
		switch (head) {
		case C.OVAL:
			p = "HD"
			break
		case C.OVALBARS:
			if (s.head != C.SQUARE) {
				p = "HDD"
				break
			}
			// fall thru
		case C.SQUARE:
			if (nflags > -4) {
				p = "breve"
			} else {
				p = "longa"
				inv = s.stem > 0
			}

			/* don't display dots on last note of the tune */
			if (!tsnext && s.next
			 && s.next.type == C.BAR && !s.next.next)
				dots = 0
			x_note += 1
			break
		case C.EMPTY:
			p = "Hd"		// white note
			break
		default:			// black note
			p = "hd"
			break
		}
	}
	if (note.color != undefined)
		old_color = set_color(note.color)
	if (p) {
		if (s.grace || inv) {
			if (s.grace)
				g_open(x_note, y_note, 0, .66, 0)
			else
				g_open(x_note, y_note, 0, 1, -1)
			x_note = y_note = 0
		}
		if (!self.psxygl(x_note, y_note, p))
			xygl(x_note, y_note, p)
		if (s.grace || inv)
			g_close()
	}

	/* draw the dots */
/*fixme: to see for grace notes*/
	// (s.dots may be removed in tablatures - see strtab)
	if (dots && (s.dots || note.dur != s.dur)) {
		dotx = x + (6.6 + s.xmx) * stv_g.scale
		if (y_tb[m] == undefined) {
			y_tb[m] = 3 * (s.notes[m].pit - 18)
			if ((s.notes[m].pit & 1) == 0)
				y_tb[m] += 3
		}
		doty = y_tb[m] + staffb
		i = (note.dur / 12) >> ((5 - nflags) - dots)
		while (dots-- > 0) {
			xygl(dotx, doty, (i & (1 << dots)) ? "dot" : "dot+")
			dotx += 3.5
		}
	}

	/* draw the accidental */
	if (note.acc) {
		x -= note.shac * stv_g.scale
		if (!s.grace) {
			draw_acc(x, y + staffb, note.acc)
		} else {
			g_open(x, y + staffb, 0, .75);
			draw_acc(0, 0, note.acc)
			g_close()
		}
	}
	if (old_color != false)
		set_color(old_color)
}

/* -- draw a note or a chord -- */
/* (the staves are defined) */
function draw_note(s,
		   fl) {		// draw flags
    var	s2, i, m, y, slen, c, nflags,
	y_tb = new Array(s.nhd + 1),
	note = s.notes[s.stem < 0 ? s.nhd : 0],	// master note head
	x = s.x,
	x_st = s.x + note.shhd * stv_g.scale,
	y = y_head(s, note),
	staffb = staff_tb[s.st].y

	if (s.dots)
		setdoty(s, y_tb)

	/* draw the stem and flags */
	if (!s.stemless) {
		slen = s.ys - s.y;
		nflags = s.nflags
		if (s.ntrem)
			nflags -= s.ntrem
		if (!fl || nflags <= 0) {	/* stem only */
			if (s.nflags > 0) {	/* (fix for PS low resolution) */
				if (s.stem >= 0)
					slen -= 1
				else
					slen += 1
			}
			out_stem(x_st, y, slen, s.grace)
		} else {				/* stem and flags */
			out_stem(x_st, y, slen, s.grace,
				 nflags, s.fmt.straightflags)
		}
	} else if (s.xstem) {				/* cross-staff stem */
		s2 = s.ts_prev;
		slen = (s2.stem > 0 ? s2.y : s2.ys) - s.y;
		slen += staff_tb[s2.st].y - staffb;
		out_stem(x_st, y, slen)
	}

	/* draw the tremolo bars */
	if (fl && s.trem1) {
		var	ntrem = s.ntrem || 0,
			x1 = x;
		slen = 3 * (s.notes[s.stem > 0 ? s.nhd : 0].pit - 18)
		if (s.head == C.FULL || s.head == C.EMPTY) {
			x1 += (s.grace ? GSTEM_XOFF : 3.5) * s.stem
			if (s.stem > 0)
				slen += 6 + 5.4 * ntrem
			else
				slen -= 6 + 5.4
		} else {
			if (s.stem > 0)
				slen += 5 + 5.4 * ntrem
			else
				slen -= 5 + 5.4
		}
		slen /= s.p_v.scale;
		out_trem(x1, staffb + slen, ntrem)
	}

	/* draw the note heads */
	for (m = 0; m <= s.nhd; m++)
		draw_basic_note(s, m, y_tb)
}

// find where to start a long decoration
function prev_scut(s) {
	while (s.prev) {
		s = s.prev
		if (s.rbstart)
			return s
	}

	/* return a symbol of any voice starting before the start of the voice */
	s = s.p_v.sym
	while (s.type != C.CLEF)
		s = s.ts_prev		/* search a main voice */
	if (s.next && s.next.type == C.KEY)
		s = s.next
	if (s.next && s.next.type == C.METER)
		return s.next
	return s
}

/* -- decide whether a slur goes up or down (same voice) -- */
function slur_direction(k1, k2) {
    var	s, some_upstem, low, dir

	// check if slur sequence in a multi-voice staff
	function slur_multi(s1, s2) {
//		while (1) {
//			if (s1.multi)		// if multi voice
//				//fixme: may change
//				return s1.multi
//			if (s1 == s2)
//				break
//			s1 = s1.next
//		}
		if (s1.multi)
			return s1.multi
		if (s2.multi)
			return s2.multi
		return 0
	} // slur_multi()

	if (k1.grace && k1.stem > 0)
		return -1

	dir = slur_multi(k1, k2)
	if (dir)
		return dir

	for (s = k1; ; s = s.next) {
		if (s.type == C.NOTE) {
			if (!s.stemless) {
				if (s.stem < 0)
					return 1
				some_upstem = true
			}
			if (s.notes[0].pit < 22)	/* if under middle staff */
				low = true
		}
//		if (s == k2)
		if (s.time == k2.time)		// (k2 may be a grace note)
			break
	}
	if (!some_upstem && !low)
		return 1
	return -1
}

/* -- output a slur / tie -- */
function slur_out(x1, y1, x2, y2, dir, height, dotted) {
	var	dx, dy, dz,
		alfa = .3,
		beta = .45;

	/* for wide flat slurs, make shape more square */
	dy = y2 - y1
	if (dy < 0)
		dy = -dy;
	dx = x2 - x1
	if (dx > 40. && dy / dx < .7) {
		alfa = .3 + .002 * (dx - 40.)
		if (alfa > .7)
			alfa = .7
	}

	/* alfa, beta, and height determine Bezier control points pp1,pp2
	 *
	 *           X====alfa===|===alfa=====X
	 *	    /		 |	       \
	 *	  pp1		 |	        pp2
	 *	  /	       height		 \
	 *	beta		 |		 beta
	 *      /		 |		   \
	 *    p1		 m		     p2
	 *
	 */

	var	mx = .5 * (x1 + x2),
		my = .5 * (y1 + y2),
		xx1 = mx + alfa * (x1 - mx),
		yy1 = my + alfa * (y1 - my) + height;
	xx1 = x1 + beta * (xx1 - x1);
	yy1 = y1 + beta * (yy1 - y1)

	var	xx2 = mx + alfa * (x2 - mx),
		yy2 = my + alfa * (y2 - my) + height;
	xx2 = x2 + beta * (xx2 - x2);
	yy2 = y2 + beta * (yy2 - y2);

//	dy = 1.6 * dir
	dy = 2 * dir;
	dz = .2 + .001 * dx
	if (dz > .6)
		dz = .6;
	dz *= dir
	dx *= .03
//	if (dx > 10.)
//		dx = 10.

//	var scale_y = stv_g.st < 0 ? stv_g.scale : 1
	var scale_y = 1			// (see set_dscale())
	if (!dotted)
		output += '<path d="M'
	else
		output += '<path class="stroke" stroke-dasharray="5,5" d="M';
	out_sxsy(x1, ' ', y1);
	output += 'c' +
		((xx1 - x1) / stv_g.scale).toFixed(1) + ' ' +
		((y1 - yy1) / scale_y).toFixed(1) + ' ' +
		((xx2 - x1) / stv_g.scale).toFixed(1) + ' ' +
		((y1 - yy2) / scale_y).toFixed(1) + ' ' +
		((x2 - x1) / stv_g.scale).toFixed(1) + ' ' +
		((y1 - y2) / scale_y).toFixed(1)

	if (!dotted)
		output += '\n\tv' +
			(-dz).toFixed(1) + 'c' +
			((xx2 - dx - x2) / stv_g.scale).toFixed(1) + ' ' +
			((y2 + dz - yy2 - dy) / scale_y).toFixed(1) + ' ' +
			((xx1 + dx - x2) / stv_g.scale).toFixed(1) + ' ' +
			((y2 + dz - yy1 - dy) / scale_y).toFixed(1) + ' ' +
			((x1 - x2) / stv_g.scale).toFixed(1) + ' ' +
			((y2 - y1) / scale_y).toFixed(1)
	output += '"/>\n'
}

// draw a slur between two chords / notes
/* (the staves are not yet defined) */
/* (delayed output) */
/* (not a pretty routine, this) */
function draw_slur(path,	// list of symbols under the slur
		   sl,		// slur variables: type, end symbol, note
		   recurr) {	// recurrent call when slur on two staves
    var	i,
	k, g, x1, y1, x2, y2, height, addy, s_st2,
	a, y, z, h, dx, dy,
	ty = sl.ty,
	dir = (ty & 0x07) == C.SL_ABOVE ? 1 : -1,
	n = path.length,
	i1 = 0,
	i2 = n - 1,
	not1 = sl.nts,		// if the slur starts on a note
	k1 = path[0],
	k2 = path[i2],
	nn = 1

	set_dscale(k1.st)

	for (i = 1; i < n; i++) {
		k = path[i]
		if (k.type == C.NOTE || k.type == C.REST) {
			nn++
			if (k.st != k1.st
			 && !s_st2)
				s_st2 = k
		}
	}

	// if slur on 2 staves, define it, but don't output it now
	// this will be done in draw_sl2()
	if (s_st2 && !recurr) {			// if not 2nd call to draw_slur()
		if (!gene.a_sl)
			gene.a_sl = []

		// replace the symbols of the other staff
		// by symbols in the current staff but with updated y offsets
		h = 24 + k1.fmt.sysstaffsep		// delta y
		if (s_st2.st > k1.st)
			h = -h
		for (i = 0; i < n; i++) {
			k = path[i]
			if (k.st == k1.st) {
				if (k.dur)
					a = k		// (used for types // and \\)
				continue
			}
			k = clone(k)
			if (path[i] == s_st2)
				s_st2 = k
			path[i] = k
			if (k.dur) {
				k.notes = clone(k.notes)
				k.notes[0] = clone(k.notes[0])
				if (sl.ty & C.SL_CENTER) {
					if (k.st != a.st) {
						sl.ty = (sl.ty & ~0x07)
							 | (a.st < k.st
								? C.SL_BELOW
								: C.SL_ABOVE)
						z = k1.ymn
						h = k2.ymx
						if (k.st < a.st) {
							for (i1 = 1; i1 < i; i1++) {
								a = path[i1]
								if (a.ymn < z)
									z = a.ymn
							}
							for (i1 = i; i1 < i2; i1++) {
								a = path[i1]
								if (a.ymx > h)
									h = a.ymx
							}
						} else {
							for (i1 = 1; i1 < i; i1++) {
								a = path[i1]
								if (a.ymx > h)
									h = a.ymx
							}
							for (i1 = i; i1 < i2; i1++) {
								a = path[i1]
								if (a.ymn < z)
									z = a.ymn
							}
						}
						h += z
						a = k
					}
					k.y = h - k.y
					k.notes[0].pit = (k.y / 3 | 0) + 18
					k.ys = h - k.ys
					y = k.ymx
					k.ymx = h - k.ymn
					k.ymn = h - y
					k.stem = -k.stem
				} else {
					k.notes[0].pit += h / 3 | 0
					k.ys += h
					k.y += h
					k.ymx += h
					k.ymn += h
				}
			}
//			k.st = k1.st	// keep the staff number for draw_sl2()
		}

		ty = k1.st > s_st2.st ? '/' : '\\'
		if (sl.ty & C.SL_CENTER)
			ty = ty + ty			// type = // or \\
		else if (k1.st == k2.st)
			ty = ty == '/' ? '/\\' : '\\/'	// type = /\ or \/
		else
			ty += dir > 0 ? '+' : '-'	// type = .+ or .-

	    var	savout = output
		output = ""
		draw_slur(path, sl, 1 /*true*/)
		gene.a_sl.push([k1, s_st2, ty, output])
		output = savout
		return
	}

	/* fix endpoints */
	x1 = k1.x
	if (k1.notes && k1.notes[0].shhd)
		x1 += k1.notes[0].shhd;
	x2 = k2.x
	if (k2.notes)
		x2 += k2.notes[0].shhd

	if (not1) {					// start on a note
		y1 = 3 * (not1.pit - 18) + 2 * dir
		x1 += 3
	} else {					// start on a chord
		y1 = dir > 0 ? k1.ymx + 2 : k1.ymn - 2
		if (k1.type == C.NOTE) {
			if (dir > 0) {
				if (k1.stem > 0) {
					x1 += 5
					if (k1.beam_end
					 && k1.nflags >= -1	/* if with a stem */
//fixme: check if at end of tuplet
					 && !k1.in_tuplet) {
						if (k1.nflags > 0) {
							x1 += 2;
							y1 = k1.ys - 3
						} else {
							y1 = k1.ys - 6
						}
					} else {
						y1 = k1.ys + 3
					}
				} else {
					y1 = k1.y + 8
				}
			} else {
				if (k1.stem < 0) {
					x1 -= 1
					if (k2.grace) {
						y1 = k1.y - 8
					} else if (k1.beam_end
						&& k1.nflags >= -1
						&& (!k1.in_tuplet
						 || k1.ys < y1 + 3)) {
						if (k1.nflags > 0) {
							x1 += 2;
							y1 = k1.ys + 3
						} else {
							y1 = k1.ys + 6
						}
					} else {
						y1 = k1.ys - 3
					}
				} else {
					y1 = k1.y - 5
				}
			}
		}
	}

	if (sl.nte) {					// slur ending on a note
		y2 = 3 * (sl.nte.pit - 18) + 2 * dir
		x2 -= 3
	} else {					// end on a chord
		y2 = dir > 0 ? k2.ymx + 2 : k2.ymn - 2
		if (k2.type == C.NOTE) {
			if (dir > 0) {
				if (k2.stem > 0) {
					x2 += 1
					if (k2.beam_st
					 && k2.nflags >= -1
					 && !k2.in_tuplet)
						y2 = k2.ys - 6
					else
						y2 = k2.ys + 3
				} else {
					y2 = k2.y + 8
				}
			} else {
				if (k2.stem < 0) {
					x2 -= 5
					if (k2.beam_st
					 && k2.nflags >= -1
					 && !k2.in_tuplet)
//						|| k2.ys < y2 + 3))
						y2 = k2.ys + 6
					else
						y2 = k2.ys - 3
				} else {
					y2 = k2.y - 5
				}
			}
		}
	}

	if (k1.type != C.NOTE) {
		y1 = y2 + 1.2 * dir;
		x1 = k1.x + k1.wr * .5
		if (x1 > x2 - 12)
			x1 = x2 - 12
	}

	if (k2.type != C.NOTE) {
		if (k1.type == C.NOTE)
			y2 = y1 + 1.2 * dir
		else
			y2 = y1
		if (k1 != k2)
			x2 = k2.x - k2.wl * .3
	}

	if (nn >= 3) {
		k = path[1]
		if (k.type != C.BAR
		 && k.x < x1 + 48) {
			if (dir > 0) {
				y = k.ymx - 2
				if (y1 < y)
					y1 = y
			} else {
				y = k.ymn + 2
				if (y1 > y)
					y1 = y
			}
		}
		k = path[i2 - 1]
		if (k.type != C.BAR
		 && k.x > x2 - 48) {
			if (dir > 0) {
				y = k.ymx - 2
				if (y2 < y)
					y2 = y
			} else {
				y = k.ymn + 2
				if (y2 > y)
					y2 = y
			}
		}
	}

	a = (y2 - y1) / (x2 - x1)		/* slur steepness */
	if (a > SLUR_SLOPE || a < -SLUR_SLOPE) {
		a = a > SLUR_SLOPE ? SLUR_SLOPE : -SLUR_SLOPE
		if (a * dir > 0)
			y1 = y2 - a * (x2 - x1)
		else
			y2 = y1 + a * (x2 - x1)
	}

	/* for big vertical jump, shift endpoints */
	y = y2 - y1
	if (y > 8)
		y = 8
	else if (y < -8)
		y = -8
	z = y
	if (z < 0)
		z = -z;
	dx = .5 * z;
	dy = .3 * y
	if (y * dir > 0) {
		x2 -= dx;
		y2 -= dy
	} else {
		x1 += dx;
		y1 += dy
	}

	/* special case for grace notes */
	if (k1.grace)
		x1 = k1.x - GSTEM_XOFF * .5
	if (k2.grace)
		x2 = k2.x + GSTEM_XOFF * .5

	h = 0;
	a = (y2 - y1) / (x2 - x1)
	if (k1 != k2
	 && k1.v == k2.v) {
	    addy = y1 - a * x1
	    for (i = 1; i < i2; i++) {
		k = path[i]
		switch (k.type) {
		case C.NOTE:
		case C.REST:
			if (dir > 0) {
				y = 3 * (k.notes[k.nhd].pit - 18) + 6
				if (y < k.ymx)
					y = k.ymx;
				y -= a * k.x + addy
				if (y > h)
					h = y
			} else {
				y = 3 * (k.notes[0].pit - 18) - 6
				if (y > k.ymn)
					y = k.ymn;
				y -= a * k.x + addy
				if (y < h)
					h = y
			}
			break
		case C.GRACE:
			for (g = k.extra; g; g = g.next) {
				if (dir > 0) {
//					y = 3 * (g.notes[g.nhd].pit - 18) + 6
//					if (y < g.ymx)
						y = g.ymx;
					y -= a * g.x + addy
					if (y > h)
						h = y
				} else {
//					y = 3 * (g.notes[0].pit - 18) - 6
//					if (y > g.ymn)
						y = g.ymn;
					y -= a * g.x + addy
					if (y < h)
						h = y
				}
			}
			break
		}
	    }
	    y1 += .45 * h;
	    y2 += .45 * h;
	    h *= .65
	}

	if (nn > 3)
		height = (.08 * (x2 - x1) + 12) * dir
	else
		height = (.03 * (x2 - x1) + 8) * dir
	if (dir > 0) {
		if (height < 3 * h)
			height = 3 * h
		if (height > 40)
			height = 40
	} else {
		if (height > 3 * h)
			height = 3 * h
		if (height < -40)
			height = -40
	}

	y = y2 - y1
	if (y < 0)
		y = -y
	if (dir > 0) {
		if (height < .8 * y)
			height = .8 * y
	} else {
		if (height > -.8 * y)
			height = -.8 * y
	}
	height *= k1.fmt.slurheight;

//	anno_start(k1_o, 'slur');
	slur_out(x1, y1, x2, y2, dir, height, ty & C.SL_DOTTED);
//	anno_stop(k1_o, 'slur');

	/* have room for other symbols */
	dx = x2 - x1;
	a = (y2 - y1) / dx;
/*fixme: it seems to work with .4, but why?*/
//	addy = y1 - a * x1 + .4 * height
//fixme: the following code seems better!
	addy = y1 - a * x1
	if (height > 0)
		addy += 3 * Math.sqrt(height) - 2
	else
		addy -= 3 * Math.sqrt(-height) - 2
	for (i = 0; i <= i2; i++) {
		k = path[i]
		if (k.st != k1.st || k.type == C.BAR)
			continue
		y = a * k.x + addy
		if (k.ymx < y)
			k.ymx = y
		else if (k.ymn > y)
			k.ymn = y
		if (recurr)			// no room when slur on 2 staves
			continue
		if (i == i2) {
			dx = x2
			if (sl.nte)
				dx -= 5;
		} else {
			dx = k.x + k.wr
		}
		if (i != 0)
			x1 = k.x
		if (!i || i == i2)
			y -= height / 3
		dx -= x1 - k.wl
		y_set(k1.st, dir > 0, x1 - k.wl, dx, y)
	}
}

/* -- draw the slurs between 2 symbols --*/
function draw_slurs(s, last) {
    var	gr1, i, m, note, sls, nsls

	// draw a slur knowing the start and stop elements
	function draw_sls(s,		// start symbol
			sl) {		// slur variables
	    var	k, v, i, dir, s3,
		path = [],
		s2 = sl.se			// slur end

		if (last && s2.time > last.time)
			return			// will be drawn next time

		// handle slurs without start or end
		switch (sl.loc) {
		case 'i':			// no start
			s = prev_scut(s)
			break
		case 'o':			// no end
			for (s3 = gr1 || s; s3.ts_next; s3 = s3.ts_next)
				;
			s2 = s3
			for (; s3; s3 = s3.ts_prev) {
				if (s3.v == s.v) {
					s2 = s3
					break
				}
				if (s3.st == s.st)
					s2 = s3
				if (s3.ts_prev.time != s2.time)
					break
			}
			break
		}

		// if the slur continues on the next music line,
		// stop it at the end of the current line
		if (s.p_v.s_next && s2.time >= tsnext.time) {
		  if (s2.time == tsnext.time) {
		    if (s2.grace) {
			for (s3 = tsnext; s3 && s3.time == s2.time; s3 = s3.ts_next) {
				if (s3.type == C.GRACE) {
					s3 = null
					break
				}
			}
		    } else {
			for (s3 = tsnext; s3.time == s2.time; s3 = s3.ts_next) {
				if (s3 == s2) {
					s3 = null	// end of slur in next line
					break
				}
			}
		    }
		  } else {
			s3 = null
		  }
		    if (!s3) {
			s.p_v.sls.push(sl);		// continuation on next line
			s2 = s.p_v.s_next.prev		// one voice
			while (s2.next)
				s2 = s2.next;		// search the ending bar
			sl = Object.create(sl);		// new slur
		    }
		}

		// set the slur position
		switch (sl.ty & 0x07) {
		case C.SL_ABOVE: dir = 1; break
		case C.SL_BELOW: dir = -1; break
		default:
			dir = s.v != s2.v ?
				1 :		// always above ?
				slur_direction(s, s2)
			sl.ty &= ~0x07
			sl.ty |= dir > 0 ? C.SL_ABOVE : C.SL_BELOW
			break
		}

		// build the path of the symbols under the slur
		if (s.v == s2.v) {
			v = s.v
		} if (!cur_sy.voices[s.v] || !cur_sy.voices[s2.v]) {
			v = s.v > s2.v ? s.v : s2.v
		} else if (dir *			// if slur on first voice
			(cur_sy.voices[s.v].range <= cur_sy.voices[s2.v].range ?
				1 : -1) > 0)
			v = s.v
		else
			v = s2.v

		if (gr1				// if start on a grace note
		 && !(s2.grace			// and not end in the same
		   && s.v == s2.v		// grace note sequence
		   && s.time == s2.time)) {
			do {
				path.push(s);	// add all grace notes
				s = s.next
			} while (s);
			s = gr1.next
		} else {
			path.push(s);
			if (s.grace)
				s = s.next
			else
				s = s.ts_next
		}

		if (!s2.grace) {		// if end on a normal note
			while (s) {
				if (s.v == v)
					path.push(s)
				if (s == s2)
					break
				s = s.ts_next
			}
		} else if (s.grace) {		// if start/end in the same sequence
			while (1) {
//				if (s.v == v)
					path.push(s)
				if (s == s2)
					break
				s = s.next
			}
		} else {			// end on a grace note
			k = s2
			while (k.prev)
				k = k.prev	// .extra pointer
			while (1) {
				if (s.v == v)
					path.push(s)
				if (s.extra == k)
					break
				s = s.ts_next
			}
			s = k
			while (1) {
				path.push(s)
				if (s == s2)
					break
				s = s.next
			}
		}

		// if some nested slurs/tuplets, draw them
		for (i = 1; i < path.length - 1; i++) {
			s = path[i]
			if (s.sls)
				draw_slurs(s, last)
			if (s.tp)
				draw_tuplet(s)
		}
		draw_slur(path, sl)
		return 1			// slur drawn, remove it
	} // draw_sls()

	// code of draw_slurs()
	while (1) {
		if (!s || s == last) {
			if (!gr1		// if end of grace notes
			 || !(s = gr1.next)	// return to normal notes
			 || s == last)
				break
			gr1 = null
		}
		if (s.type == C.GRACE) {	// if start of grace notes
			gr1 = s;		// continue in the grace note sequence
			s = s.extra
			continue
		}
		if (s.sls) {			// slurs from the chord
			sls = s.sls
			s.sls = null
			nsls = []
			for (i = 0; i < sls.length; i++) {
				if (!draw_sls(s, sls[i]))
					nsls.push(sls[i])
			}
			if (nsls.length)
				s.sls = nsls
		}
		s = s.next
	}
}

/* -- draw a tuplet -- */
/* (the staves are not yet defined) */
/* (delayed output) */
/* See http://moinejf.free.fr/abcm2ps-doc/tuplets.html
 * for the value of 'tp.f' */
function draw_tuplet(s1) {
    var	s2, s3, g, stu, std, nb_only,
	x1, x2, y1, y2, xm, ym, a, s0, yy, yx, dy, a, dir, r,
	tp = s1.tp.shift()		// tuplet parameters

	if (!s1.tp.length)
		delete s1.tp		// last tuplet

	// treat the slurs and the nested tuplets
	stu = std = s1.st
	for (s2 = s1; s2; s2 = s2.next) {
		switch (s2.type) {
		case C.GRACE:
			if (!s2.sl1)
				continue
			for (g = s2.extra; g; g = g.next) {
				if (g.sls)
					draw_slurs(g)
			}
			// fall thru
		default:
			continue
		case C.NOTE:
		case C.REST:
			break
		}
		if (s2.sls)
			draw_slurs(s2)
		if (s2.st < stu) {
			std = stu
			stu = s2.st
		} else if (s2.st > std) {
			std = s2.st
		}
		if (s2.tp)
			draw_tuplet(s2)
		if (s2.tpe)
			break
	}

	if (s2)
		s2.tpe--

	if (tp.f[0] == 1)		// if 'when' == never
		return			// accept tuplets on many lines

	if (!s2) {
		error(1, s1, "No end of tuplet in this music line")
		return
	}

	dir = tp.f[3]				// 'where'
	if (!dir) {				// if auto
		s3 = s1
		while (s3 && !s3.stem)		// (may have tuplets of rests!)
			s3 = s3.next
		dir = (s3 && s3.stem < 0) ? C.SL_BELOW : C.SL_ABOVE
	}
	set_dscale(dir == C.SL_ABOVE ? stu : std)

	if (s1 == s2				// tuplet with 1 note (!)
	 || tp.f[1] == 2) {			// what == nothing
		nb_only = true
	} else if (tp.f[1] == 1) {			/* 'what' == slur */
		nb_only = true;
		draw_slur([s1, s2], {ty: dir})
	} else {

		/* search if a bracket is needed */
		if (tp.f[0] != 2		// if 'when' != always
		 && s1.type == C.NOTE && s2.type == C.NOTE) {
			nb_only = true
			for (s3 = s1; ; s3 = s3.next) {
				if (s3.type != C.NOTE
				 && s3.type != C.REST) {
					if (s3.type == C.GRACE
					 || s3.type == C.SPACE)
						continue
					nb_only = false
					break
				}
				if (s3 == s2)
					break
				if (s3.beam_end) {
					nb_only = false
					break
				}
			}
			if (nb_only
			 && !s1.beam_st
			 && !s1.beam_br1
			 && !s1.beam_br2) {
				for (s3 = s1.prev; s3; s3 = s3.prev) {
					if (s3.type == C.NOTE
					 || s3.type == C.REST) {
						if (s3.nflags >= s1.nflags)
							nb_only = false
						break
					}
				}
			}
			if (nb_only && !s2.beam_end) {
				for (s3 = s2.next; s3; s3 = s3.next) {
					if (s3.type == C.NOTE
					 || s3.type == C.REST) {
						if (!s3.beam_br1
						 && !s3.beam_br2
						 && s3.nflags >= s2.nflags)
							nb_only = false
						break
					}
				}
			}
		}
	}

	/* if number only, draw it */
	if (nb_only) {
		if (tp.f[2] == 1)		/* if 'which' == none */
			return
		set_font("tuplet")
		xm = (s2.x + s1.x) / 2
		if (dir == C.SL_ABOVE)		// 8 = width around the middle
			ym = y_get(stu, 1, xm - 4, 8)
		else
			ym = y_get(std, 0, xm - 4, 8) -
					gene.curfont.size

		if (s1.stem * s2.stem > 0) {
			if (s1.stem > 0)
				xm += 4
			else
				xm -= 4
		}

		yy = ym + gene.curfont.size * .22
		if (tp.f[2] == 0)		// if 'which' == number
			xy_str(xm, yy, tp.p.toString(), 'c')
		else
			xy_str(xm, yy, tp.p + ':' + tp.q, 'c')

		for (s3 = s1; ; s3 = s3.next) {
			if (s3.x >= xm)
				break
		}
		if (dir == C.SL_ABOVE) {
			ym += gene.curfont.size
			if (s3.ymx < ym)
				s3.ymx = ym;
			y_set(stu, 1, xm - 3, 6, ym)
		} else {
			if (s3.ymn > ym)
				s3.ymn = ym;
			y_set(std, 0, xm - 3, 6, ym)
		}
		return
	}

	// here, 'what' is square bracket

/*fixme: two staves not treated*/
/*fixme: to optimize*/

	// first, get the x offsets
	x1 = s1.x - 4

	// end the bracket according to the last note duration
	if (s2.dur > s2.prev.dur) {
		s3 = s2.next
		if (!s3	// maybe a note in an overlay voice
		 || s3.time != s2.time + s2.dur) {
			for (s3 = s2.ts_next; s3; s3 = s3.ts_next) {
				if (s3.seqst
				 && s3.time >= s2.time + s2.dur)
					break
			}
		}
//fixme: s3 cannot be null (bar at end of staff)
		x2 = s3 ? s3.x - s3.wl - 5 : realwidth - 6
	} else {
		x2 = s2.x + 4
		r = s2.stem >= 0 ? 0 : s2.nhd
		if (s2.notes[r].shhd > 0)
			x2 += s2.notes[r].shhd
		if (s2.st == stu
		 && s2.stem > 0)
			x2 += 3.5
	}

    // above
    if (dir == C.SL_ABOVE) {
	if (s1.st >= s2.st) {
		if (s1.stem > 0)
			x1 += 3
		ym = y_get(s1.st, 1, x1 - 4, 8)
		y1 = ym > staff_tb[s1.st].topbar + 2
			? ym
			: staff_tb[s1.st].topbar + 2
	} else {
		y1 = staff_tb[s1.st].topbar + 2
	}
	if (s2.st >= s1.st) {
		ym = y_get(s2.st, 1, x2 - 4, 8)
		y2 = ym > staff_tb[s2.st].topbar + 2
			? ym
			: staff_tb[s2.st].topbar + 2
	} else {
		y2 = staff_tb[s2.st].topbar + 2
	}

	xm = .5 * (x1 + x2);
	ym = .5 * (y1 + y2);

	a = (y2 - y1) / (x2 - x1);
	s0 = 3 * (s2.notes[s2.nhd].pit - s1.notes[s1.nhd].pit) / (x2 - x1)
	if (s0 > 0) {
		if (a < 0)
			a = 0
		else if (a > s0)
			a = s0
	} else {
		if (a > 0)
			a = 0
		else if (a < s0)
			a = s0
	}
	a = s1.fmt.beamslope * a / (s1.fmt.beamslope + Math.abs(a))
	if (a * a < .1 * .1)
		a = 0

	/* shift up bracket if needed */
	dy = 0
	for (s3 = s1; ; s3 = s3.next) {
		if (!s3.dur			/* not a note or a rest */
		 || s3.st != stu) {
			if (s3 == s2)
				break
			continue
		}
		yy = ym + (s3.x - xm) * a;
		yx = y_get(stu, 1, s3.x - 4, 8) + 2
		if (yx - yy > dy)
			dy = yx - yy
		if (s3 == s2)
			break
	}

	ym += dy;
	y1 = ym + a * (x1 - xm);
	y2 = ym + a * (x2 - xm);

	/* shift the slurs / decorations */
	ym += 6
	for (s3 = s1; ; s3 = s3.next) {
		if (s3.st == stu) {
			yy = ym + (s3.x - xm) * a
			if (s3.ymx < yy)
				s3.ymx = yy
			y_set(stu, 1, s3.x - 3, 6, yy)
		}
		if (s3 == s2)
			break
	}

    // below
    } else {	/* lower voice of the staff: the bracket is below the staff */
	if (s1.st <= s2.st) {
		ym = y_get(s1.st, 0, x1 - 4, 8)
		y1 = ym < -2
			? ym
			: -2
	} else {
		y1 = -2
	}
	if (s2.st <= s1.st) {
		if (s2.stem < 0)
			x2 -= 3
		ym = y_get(s2.st, 0, x2 - 4, 8)
		y2 = ym < -2
			? ym
			: -2
	} else {
		y2 = -2
	}

	xm = .5 * (x1 + x2);
	ym = .5 * (y1 + y2);

	a = (y2 - y1) / (x2 - x1);
	s0 = 3 * (s2.notes[0].pit - s1.notes[0].pit) / (x2 - x1)
	if (s0 > 0) {
		if (a < 0)
			a = 0
		else if (a > s0)
			a = s0
		if (a > .35)
			a = .35
	} else {
		if (a > 0)
			a = 0
		else if (a < s0)
			a = s0
		if (a < -.35)
			a = -.35
	}
	if (a * a < .1 * .1)
		a = 0

	/* shift down the bracket if needed */
	dy = 0
	for (s3 = s1; ; s3 = s3.next) {
		if (!s3.dur			/* not a note nor a rest */
		 || s3.st != std) {
			if (s3 == s2)
				break
			continue
		}
		yy = ym + (s3.x - xm) * a;
		yx = y_get(std, 0, s3.x - 4, 8)
		if (yx - yy < dy)
			dy = yx - yy
		if (s3 == s2)
			break
	}

	ym += dy - 8
	y1 = ym + a * (x1 - xm);
	y2 = ym + a * (x2 - xm);

	/* shift the slurs / decorations */
	ym -= 2
	for (s3 = s1; ; s3 = s3.next) {
		if (s3.st == std) {
			yy = ym + (s3.x - xm) * a
			if (s3.ymn > yy)
				s3.ymn = yy;
			y_set(std, 0, s3.x - 3, 6, yy)
		}
		if (s3 == s2)
			break
	}
    } /* lower voice */

	if (tp.f[2] == 1) {			/* if 'which' == none */
		out_tubr(x1, y1 + 4, x2 - x1, y2 - y1, dir == C.SL_ABOVE);
		return
	}
	out_tubrn(x1, y1, x2 - x1, y2 - y1, dir == C.SL_ABOVE,
		tp.f[2] == 0 ? tp.p.toString() : tp.p + ':' +  tp.q);

	if (dir == C.SL_ABOVE)
		y_set(stu, 1, xm - 3, 6, yy + 2)
	else
		y_set(std, 0, xm - 3, 6, yy)
}

// -- draw a ties --
function draw_tie(not1, not2,
			job) {	// -: start and end
				// 1: no starting note
				// 2: no ending note
				// 3: no start for clef or staff change
    var	m, x1, s, y, h, time,
	p = job == 2 ? not1.pit : not2.pit,
	dir = (not1.tie_ty & 0x07) == C.SL_ABOVE ? 1 : -1,
	s1 = not1.s,
	st = s1.st,
	s2 = not2.s,
	x2 = s2.x,
	sh = not1.shhd			// head shift

	for (m = 0; m < s1.nhd; m++)
		if (s1.notes[m] == not1)
			break
	if (dir > 0) {
		if (m < s1.nhd && p + 1 == s1.notes[m + 1].pit)
			if (s1.notes[m + 1].shhd > sh)
				sh = s1.notes[m + 1].shhd
	} else {
		if (m > 0 && p == s1.notes[m - 1].pit + 1)
			if (s1.notes[m - 1].shhd > sh)
				sh = s1.notes[m - 1].shhd
	}
	x1 = s1.x + sh // * .6

	if (job != 2) {
		for (m = 0; m < s2.nhd; m++)
			if (s2.notes[m] == not2)
				break
		sh = s2.notes[m].shhd
		if (dir > 0) {
			if (m < s2.nhd && p + 1 == s2.notes[m + 1].pit)
				if (s2.notes[m + 1].shhd < sh)
					sh = s2.notes[m + 1].shhd
		} else {
			if (m > 0 && p == s2.notes[m - 1].pit + 1)
				if (s2.notes[m - 1].shhd < sh)
					sh = s2.notes[m - 1].shhd
		}
		x2 += sh // * .6
	}

	switch (job) {
	default:
		if (p < not2.pit || dir < 0)
			p = not1.pit
		break
	case 3:
		dir = -dir
	case 1:				/* no starting note */
		x1 = s2.prev ? (s2.prev.x + s2.wr) : s1.x
		if (s1.st != s2.st)
			st = s2.st
		x1 += (x2 - x1) * .4
		if (x1 > x2 - 20)
			x1 = x2 - 20
		break
	case 2:				 // no ending note
		x2 = s1.next ? s1.next.x : realwidth
		if (x2 != realwidth)
			x2 -= (x2 - x1) * .4
		if (x2 < x1 + 16)
			x2 = x1 + 16
		break
	}
	if (x2 - x1 > 20) {
		x1 += 3.5
		x2 -= 3.5
	} else {
		x1 += 1.5
		x2 -= 1.5
	}

	if (s1.dots && !(not1.pit & 1)
	 && ((dir > 0 && !s1.dot_low)
	  || (dir < 0 && s1.dot_low)))
		x1 += 5

	y = staff_tb[st].y + 3 * (p - 18) + .8 * dir
	h = (.15 * (x2 - x1) + 14) * dir * s1.fmt.tieheight
//	anno_start(k1, 'slur')
	slur_out(x1, y, x2, y, dir, h, not1.tie_ty & C.SL_DOTTED)
//	anno_stop(k1, 'slur')
} // draw_tie()

/* -- draw all ties between neighboring notes -- */
function draw_all_ties(p_voice) {
    var s, s1, s2, clef_chg, x, dx, m, not1, not2,
	tim2 = 0

	/* search the start of ties */
//	clef_chg = false
	s1 = p_voice.sym
	set_color(s1.color)
	for ( ; s1; s1 = s1.next) {
		if (s1.ti2			// if end of tie
		 && !s1.invis
		 && s1.time != tim2) {		// and new end
			for (m = 0; m <= s1.nhd; m++) {
				not2 = s1.notes[m]
				not1 = not2.tie_s
				if (!not1
				 || not1.s.v != s1.v)	// (already done)
					continue
				draw_tie(not1, not2, 1)
			}
		}
		if (!s1.ti1			// if not start of tie
		 || s1.invis)
			continue

		// get the end of the tie(s)
		if (s1.type == C.GRACE) {
			for (s = s1.extra; s; s = s.next) {
			    for (m = 0; m <= s1.nhd; m++) {
				not1 = s.notes[m]
				not2 = not1.tie_e
				if (!not2)
					continue
				draw_tie(not1, not2)
				tim2 = not2.s.time
			    }
			}
			continue
		}

	    for (m = 0; m <= s1.nhd; m++) {
		not1 = s1.notes[m]
		not2 = not1.tie_e
		if (!not2) {
			if (not1.tie_ty)
				draw_tie(not1, not1, 2)
			continue
		}
		s2 = not2.s
		if (tsnext && s2.time >= tsnext.time) {	// if end in next line
			draw_tie(not1, not2, 2)
			continue
		}
		tim2 = s2.time

		// check if some clef changes (can occur in an other voice)
		for (s = s1.ts_next; s != s2; s = s.ts_next) {
			if (s.st != s1.st)
				continue
			if (s.type == C.CLEF) {
				clef_chg = true
				break
			}
		}

		/* ties with clef or staff change */
		if (clef_chg || s1.st != s2.st) {
			draw_tie(not1, not2, 2)
			draw_tie(not1, not2, 3)
			clef_chg = false
		} else {
			draw_tie(not1, not2)
		}
	    }
	}
}

/* -- draw the symbols near the notes -- */
/* (the staves are not yet defined) */
/* order:
 * - scaled
 *   - beams
 *   - decorations near the notes
 *   - decorations tied to the notes
 *   - tuplets and slurs
 * - not scaled
 *   - measure numbers
 *   - lyrics
 *   - staff decorations
 *   - chord symbols
 *   - repeat brackets
 *   - parts and tempos
 * The buffer output is delayed until the definition of the staff system
 */
function draw_sym_near() {
    var	p_voice, p_st, s, v, st, y, g, w, i, st, dx, top, bot, ymn,
	output_sav = output;

	// set the staff offsets of a beam
	function set_yab(s1, s2) {
	    var y,
		k = realwidth / YSTEP,
		i = (s1.x / k) | 0,
		j = (s2.x / k) | 0,
		a = (s1.ys - s2.ys) / (s1.xs - s2.xs),
		b = s1.ys - s1.xs * a,
		p_st = staff_tb[s1.st]

		k *= a
		if (s1.stem > 0) {
			while (i <= j) {
				y = k * i + b
				if (p_st.top[i] < y)
					p_st.top[i] = y
				i++
			}
		} else {
			while (i <= j) {
				y = k * i + b
				if (p_st.bot[i] > y)
					p_st.bot[i] = y
				i++
			}
		}
	} // set_yab()

	output = ""
	YSTEP = Math.ceil(realwidth / 2)

	// initialize the min/max vertical offsets in the staves
	for (st = 0; st <= nstaff; st++) {
		p_st = staff_tb[st]
		p_st.top = new Float32Array(YSTEP)
		p_st.bot = new Float32Array(YSTEP)
		for (i = 0; i < YSTEP; i++) {
			p_st.top[i] = 0
			p_st.bot[i] = 24
		}
//		p_st.top.fill(0.)
//		p_st.bot.fill(24.)
	}

	/* calculate the beams but don't draw them (the staves are not yet defined) */
	for (v = 0; v < voice_tb.length; v++) {
		var	bm = {},
			first_note = true;

		p_voice = voice_tb[v]
		for (s = p_voice.sym; s; s = s.next) {
			switch (s.type) {
			case C.GRACE:
				for (g = s.extra; g; g = g.next) {
					if (g.beam_st && !g.beam_end) {
						self.calculate_beam(bm, g)
						if (bm.s2)
							set_yab(g, bm.s2)
					}
				}
				if (!s.p_v.ckey.k_bagpipe	// no slur when bagpipe
				 && s.fmt.graceslurs
				 && !s.gr_shift			// tied to previous note
				 && !s.sl1			// explicit slur
				 && !s.ti1			// some tie
				 && s.next
				 && s.next.type == C.NOTE)
					grace_slur(s)
				break
			}
		}
		for (s = p_voice.sym; s; s = s.next) {
			switch (s.type) {
			case C.NOTE:
				if ((s.beam_st && !s.beam_end)
				 || (first_note && !s.beam_st)) {
					first_note = false;
					self.calculate_beam(bm, s)
					if (bm.s2)
						set_yab(s, bm.s2)
				}
				break
			}
		}
	}

	set_tie_room();
	draw_deco_near()

	/* set the min/max vertical offsets */
	for (s = tsfirst; s; s = s.ts_next) {
		if (s.invis)
			continue
		switch (s.type) {
		case C.GRACE:
			for (g = s.extra; g; g = g.next) {
				y_set(s.st, true, g.x - 2, 4, g.ymx + 1);
				y_set(s.st, false, g.x - 2, 4,
//fixme: hack for slur/accidental far under the staff
//						g.ymn - 1)
						g.ymn - 5)
			}
			continue
		case C.MREST:
			y_set(s.st, true, s.x + 16, 32, s.ymx + 2)
			continue
		default:
			y_set(s.st, true, s.x - s.wl, s.wl + s.wr, s.ymx + 2);
			y_set(s.st, false, s.x - s.wl, s.wl + s.wr, s.ymn - 2)
			// fall thru
		case C.PART:
		case C.TEMPO:
		case C.STAVES:
			continue
		case C.NOTE:
			break
		}

		// (permit closer staves)
		if (s.stem > 0) {
			if (s.stemless) {
				dx = -5;
				w = 10
			} else if (s.beam_st) {
				dx = 3;
				w = s.beam_end ? 4 : 10
			} else {
				dx = -8;
				w = s.beam_end ? 11 : 16
			}
			y_set(s.st, true, s.x + dx, w, s.ymx);
			ymn = s.ymn
			if (s.notes[0].acc	// set room for the accidental
			 && ymn > 3 * (s.notes[0].pit - 18) - 9)
				ymn = 3 * (s.notes[0].pit - 18) - 9
			y_set(s.st, false, s.x - s.wl, s.wl + s.wr, ymn)
		} else {
			y_set(s.st, true, s.x - s.wl, s.wl + s.wr, s.ymx);
			if (s.stemless) {
				dx = -5;
				w = 10
			} else if (s.beam_st) {
				dx = -6;
				w = s.beam_end ? 4 : 10
			} else {
				dx = -8;
				w = s.beam_end ? 5 : 16
			}
			dx += s.notes[0].shhd;
			y_set(s.st, false, s.x + dx, w, s.ymn)
		}

		/* have room for the accidentals */
		if (s.notes[s.nhd].acc) {
			y = 3 * (s.notes[s.nhd].pit - 18)
				+ (s.notes[s.nhd].acc == -1	// flat
					? 11 : 10)
			y_set(s.st, true, s.x - 10, 10, y)
		}
		if (s.notes[0].acc) {
			y = 3 * (s.notes[0].pit - 18)
				- (s.notes[0].acc == -1		// flat
					? 5 : 10)
			y_set(s.st, false, s.x - 10, 10, y)
		}
	}

	draw_deco_note()

	for (v = 0; v < voice_tb.length; v++) {
		p_voice = voice_tb[v];
		s = p_voice.sym
		if (!s)
			continue
		set_color(s.color);
		st = p_voice.st;
//  if (st == undefined) {
//error(1, s, "BUG: no staff for voice " + p_voice.id)
//    continue
//  }

		// draw the slurs and tuplets
		for ( ; s; s = s.next) {
			if (s.play)
				continue
			if (s.tp)
				draw_tuplet(s)
			if (s.sls || s.sl1)
				draw_slurs(s)
		}
	}
	set_color()

	/* set the top and bottom out of the staves */
	for (st = 0; st <= nstaff; st++) {
		p_st = staff_tb[st];
		top = p_st.topbar + 2;
		bot = p_st.botbar - 2
/*fixme:should handle stafflines changes*/
		for (i = 0; i < YSTEP; i++) {
			if (top > p_st.top[i])
				p_st.top[i] = top
			if (bot < p_st.bot[i])
				p_st.bot[i] = bot
		}
	}

	if (cfmt.measurenb >= 0)
		draw_measnb();

	/* if any lyric, draw them now as unscaled */
	set_dscale(-1)
//	set_sscale(-1)
	for (v = 0; v < voice_tb.length; v++) {
		p_voice = voice_tb[v]
		if (p_voice.have_ly) {
			draw_all_lyrics()
			break
		}
	}

	draw_deco_staff()

	draw_partempo()			// draw the parts and tempo indications if any

	set_dscale(-1);
	output = output_sav
}

/* -- draw the name/subname of the voices -- */
function draw_vname(indent, stl) {
    var	p_voice, n, st, v, a_p, p, y, h, h2,
	staff_d = []

	if (!gene.vnt)
		return

//	for (st = stl.length; st >= 0; st--) {
	for (st = stl.length; --st >= 0; ) {
		if (stl[st])
			break
	}
	if (st < 0)
		return

	for (v = 0; v < voice_tb.length; v++) {
		p_voice = voice_tb[v]
		if (!cur_sy.voices[v])
			continue
		st = cur_sy.voices[v].st
		if (!stl[st])
			continue
		p = gene.vnt == 1 ? p_voice.nm : p_voice.snm
		if (!p)
			continue
		delete p_voice.new_name
		if (!staff_d[st])
			staff_d[st] = p
		else
			staff_d[st] += "\n" + p
	}
	if (!staff_d.length)
		return
	set_font("voice");
	h = gene.curfont.size
	h2 = h / 2
	indent = -indent * .5			/* center */
	for (st = 0; st < staff_d.length; st++) {
		if (!staff_d[st])
			continue
		a_p = staff_d[st].split("\n");
		y = staff_tb[st].y
			+ staff_tb[st].topbar * .5
				* staff_tb[st].staffscale
			+ h2 * (a_p.length - 2) + h *.22

		// if instrument with 2 staves, center the voice name
		if ((cur_sy.staves[st].flags & OPEN_BRACE)
		 && st + 1 < staff_tb.length
		 && (cur_sy.staves[st + 1].flags & CLOSE_BRACE)
		 && !staff_d[st + 1])
			y -= (staff_tb[st].y - staff_tb[st + 1].y) * .5
		for (n = 0; n < a_p.length; n++) {
			p = a_p[n];
			xy_str(indent, y, p, "c");
			y -= h
		}
	}
}

// -- set the y offset of the staves and return the height of the whole system --
function set_staff() {
    var	i, st, prev_staff, v, fmt, s,
	y, staffsep, dy, maxsep, mbot, val, p_voice, p_staff,
	sy = cur_sy

	// the last values of {,max}{,sys}staffsep are in the last format
	fmt = tsnext ? tsnext.fmt : cfmt

	/* set the scale of the voices */
	for (v = 0; v < voice_tb.length; v++) {
		p_voice = voice_tb[v]
		if (p_voice.scale != 1)
			p_voice.scale_str = 
				'transform="scale(' + p_voice.scale + ')"'
	}

	// search the top staff
	for (st = 0; st <= nstaff; st++) {
		if (gene.st_print[st])
			break
	}
	y = 0
	if (st > nstaff)
		return y

		p_staff = staff_tb[st]
		for (i = 0; i < YSTEP; i++) {
			val = p_staff.top[i]
			if (y < val)
				y = val
		}

	/* set the vertical offset of the 1st staff */
	y *= p_staff.staffscale;
	staffsep = tsfirst.fmt.staffsep / 2 +
			p_staff.topbar * p_staff.staffscale
	if (y < staffsep)
		y = staffsep
	if (y < p_staff.ann_top)	// absolute annotation
		y = p_staff.ann_top;
	p_staff.y = -y;

	/* set the offset of the other staves */
	for (prev_staff = 0; prev_staff < st; prev_staff++)
		staff_tb[prev_staff].y = -y
	if (!gene.st_print[st])		// no staff
		return y

	var sy_staff_prev = sy.staves[prev_staff]
	for (st++; st <= nstaff; st++) {
		if (!gene.st_print[st])
			continue
		p_staff = staff_tb[st]
		staffsep = sy_staff_prev.sep || fmt.sysstaffsep;
		maxsep = sy_staff_prev.maxsep || fmt.maxsysstaffsep;

		dy = 0
		if (p_staff.staffscale == staff_tb[prev_staff].staffscale) {
			for (i = 0; i < YSTEP; i++) {
				val = p_staff.top[i] -
						staff_tb[prev_staff].bot[i]
				if (dy < val)
					dy = val
			}
			dy *= p_staff.staffscale
		} else {
			for (i = 0; i < YSTEP; i++) {
				val = p_staff.top[i] * p_staff.staffscale
				  - staff_tb[prev_staff].bot[i]
					* staff_tb[prev_staff].staffscale
				if (dy < val)
					dy = val
			}
		}
		staffsep += p_staff.topbar * p_staff.staffscale
		if (dy < staffsep)
			dy = staffsep;
		maxsep += p_staff.topbar * p_staff.staffscale
		if (dy > maxsep)
			dy = maxsep;
		y += dy;
		p_staff.y = -y;

		while (!gene.st_print[++prev_staff])
			staff_tb[prev_staff].y = -y
		while (1) {
			sy_staff_prev = sy.staves[prev_staff]
			if (sy_staff_prev)
				break
			sy = sy.next
		}
	}
	mbot = 0
	for (i = 0; i < YSTEP; i++) {
		val = staff_tb[prev_staff].bot[i]
		if (mbot > val)
			mbot = val
	}
	if (mbot > p_staff.ann_bot) 	// absolute annotation
		mbot = p_staff.ann_bot;
	mbot *= staff_tb[prev_staff].staffscale

	/* output the staff offsets */
	for (st = 0; st <= nstaff; st++) {
		p_staff = staff_tb[st];
		dy = p_staff.y
		if (p_staff.staffscale != 1) {
			p_staff.scale_str =
				'transform="translate(0,' +
					(posy - dy).toFixed(1) + ') ' +
				'scale(' + p_staff.staffscale + ')"'
		}
	}

	if (mbot == 0) {
		for (st = nstaff; st >= 0; st--) {
			if (gene.st_print[st])
				break
		}
		if (st < 0)		/* no symbol in this system ! */
			return y
	}
	dy = -mbot;
	staffsep = fmt.staffsep * .5
	if (dy < staffsep)
		dy = staffsep;
	maxsep = fmt.maxstaffsep * .5
	if (dy > maxsep)
		dy = maxsep;

	// return the height of the whole staff system
	return y + dy
}

/* -- draw the staff systems and the measure bars -- */
function draw_systems(indent) {
	var	s, s2, st, x, x2, res, sy,
		xstaff = [],
		stl = [],		// all staves in the line
		bar_bot = [],
		bar_height = [],
		bar_ng = [],		// number of gaps
		ba = [],		// bars [symbol, bottom, height]
		sb = "",
		thb = ""

	/* -- set the bottom and height of the measure bars -- */
	function bar_set() {
	    var	st, sc, i, j, l, stlines, b, hlmap,
		dy = 0

		for (st = 0; st <= cur_sy.nstaff; st++) {
			if (xstaff[st] < 0) {
				bar_bot[st] = bar_height[st] = 0
				continue
			}
			sc = staff_tb[st].staffscale;
			stlines = cur_sy.staves[st].stafflines
			l = stlines.length
			for (i = 0; i < l; i++) {
				if (stlines[i] != '.' && stlines[i] != '-')
					break
			}
			bar_bot[st] = staff_tb[st].y + 6 * (
						i == l - 1 ? (l - 2) :
						i >= l - 2 ? (l - 3) :
						i) * sc
			if (!dy) {
				dy = staff_tb[st].y + 6 * (
						i == l ? (l + 1) :
						i >= l - 2 ? l :
						(l - 1)) * sc
			}
			bar_height[st] = dy - bar_bot[st];
			bar_ng[st] = l - i		// number of gaps
				 && (l - 1 - i || 2)

			// define the helper lines
			if (stlines[l-1]!= '.') {	// if any staff line
				staff_tb[st].hll = 17 + i * 2	// pitch of lowest note
							// without helper line
							// ('D' when standard staff)
				if (i == l)
					staff_tb[st].hll -= 2
				staff_tb[st].hlmap =
					hlmap = new Int8Array((l - i + 1) * 2 + 2)
				for (j = 1; i < l; i++, j += 2) {
					switch (stlines[i]) {
					case '|':
					case '[':
					case "'":
//					case ':':
						hlmap[j - 1] = 1	// no helper line
						hlmap[j] = 1
						hlmap[j + 1] = 1
						break
					}
				}
			}

			dy = (cur_sy.staves[st].flags & STOP_BAR) ?
					0 : bar_bot[st]
		}

		// if in the middle of the tune, check the previous bar(s)
		i = ba.length
		if (!i)
			return
		while (--i >= 0) {
			b = ba[i]
			st = b[0].st
			if (b[1] > bar_bot[st])
				b[1] = bar_bot[st]
			if (b[2] < bar_height[st])
				b[2] = bar_height[st]
			if (b[3] < bar_ng[st])
				b[3] = bar_ng[st]
			if (b[0].seqst)		// end of time sequence
				break
		}
	} // bar_set()

	/* -- draw a staff -- */
	function draw_staff(st, x1, x2) {
	    var	w, i, dy, ty,
			y = 0,
			ln = "",
		tycl = {
		"|": "slW",		// normal
		"[": "slthW",		// thick
		"'": "sltnW",		// thin
		":": "sldW"		// dash
		},
		stafflines = cur_sy.staves[st].stafflines,
			l = stafflines.length,
			il = 6 * staff_tb[st].staffscale // interline

		if (!/[\[|':]/.test(stafflines))	// '
			return				// no line
		w = x2 - x1;
		set_sscale(-1)

		// check if default staff
		if (cache && cache.st_l == stafflines
		 && staff_tb[st].staffscale == 1
		 && cache.st_w == (w | 0)) {
			xygl(x1, staff_tb[st].y, 'stdef' + cfmt.fullsvg)
			return
		}
		for (i = 0; i < l; i++, y -= il) {
			if (stafflines[i] == '.')
				continue
			dy = 0
			for (; i < l; i++, y -= il, dy -= il) {
				switch (stafflines[i]) {
				case '.':
				case '-':
					continue
				case ty:
					ln += 'm-' + w.toFixed(1) +
						' ' + dy.toFixed(2) +
						'h' + w.toFixed(1);
					dy = 0
					continue
				}
				if (ty != undefined)
					ln += '"/>\n';
				ty = stafflines[i]
				ln += '<path class="' + tycl[ty] +
					'" d="m0 ' + y + 'h' + w.toFixed(1);
				dy = 0
			}
			ln += '"/>'
		}
		y = staff_tb[st].y
		if (!cache
		 && w > get_lwidth() - 10
		 && staff_tb[st].staffscale == 1) {
			cache = {
				st_l: stafflines,
				st_w: w | 0
			}
			i = 'stdef' + cfmt.fullsvg;
			if (ln.indexOf('<path', 1) < 0)
				glyphs[i] = ln.replace('path', 'path id="' + i + '"')
			else
				glyphs[i] = '<g id="' + i + '">\n' + ln + '\n</g>';
			xygl(x1, y, i)
			return
		}
		out_XYAB('<g transform="translate(X, Y)">\n' + ln + '\n</g>\n', x1, y)
	} // draw_staff()

	// draw a measure bar
	function draw_bar(s, bot, h, ng) {
	    var	i, s2, yb, w,
		bar_type = s.bar_type,
		st = s.st,
		p_staff = staff_tb[st],
		top = ng >= 3 ? 6 * ng : (4 - ng) * 6,
		x = s.x

		// don't put a line between the staves if there is no bar above
		if (st != 0
		 && s.ts_prev
//fixme: 's.ts_prev.st != st - 1' when floating voice in lower staff
//	 && (s.ts_prev.type != C.BAR || s.ts_prev.st != st - 1))
		 && s.ts_prev.type != C.BAR)
			h = top * p_staff.staffscale

		s.ymx = s.ymn + h;

		set_sscale(-1)
		anno_start(s)
		if (s.color)
			set_color(s.color);

		// compute the middle vertical offset of the staff
		yb = bot + top / 2

		// if measure repeat, draw the '%' like glyphs
		if (s.bar_mrep) {
			set_sscale(st)
			if (s.bar_mrep == 1) {
				for (s2 = s.prev; s2.type != C.REST; s2 = s2.prev)
					;
				xygl(s2.x, yb, "mrep")
			} else {
				xygl(x, yb, "mrep2")
				if (s.v == cur_sy.top_voice)
					nrep_out(x, yb + p_staff.topbar, s.bar_mrep)
			}
			set_sscale(-1)
		}

		if (bar_type == '||:')
			bar_type = '[|:'

		for (i = bar_type.length; --i >= 0; ) {
			switch (bar_type[i]) {
			case "|":
				if (s.bar_dotted) {
					w = top / 6 <= 9
					    ? [0, 0, 4, 3.6, 4.8, 4.3, 4, 4.7, 4.4, 4.9]
							[top / 6]
						: 5
					out_XYAB(
			'<path class="bW" stroke-dasharray="A,A" d="MX YvG"/>\n',
						x, bot, w * p_staff.staffscale, -h)
				} else if (s.color) {
					out_XYAB('<path class="bW" d="MX YvF"/>\n',
						x, bot, -h)
				} else {
					sb += 'M' + sx(x).toFixed(1)
						+ ' ' + self.sy(bot).toFixed(1)
						+ 'v' + (-h).toFixed(1)
				}
				break
			default:
//			case "[":
//			case "]":
				x -= 3;
				if (s.color)
					out_XYAB('<path class="bthW" d="MX YvF"/>\n',
						x + 1.5, bot, -h)
				else
					thb += 'M' + sx(x + 1.5).toFixed(1)
						+ ' ' + self.sy(bot).toFixed(1)
						+ 'v' + (-h).toFixed(1)
				break
			case ":":
				x -= 2;
				set_sscale(st);
				if (ng & 1) {
					xygl(x, yb + 6, "rdot")
					xygl(x, yb - 6, "rdot")
				} else {
					xygl(x, yb - 12, "rdots")
				}
				set_sscale(-1)
				break
			}
			x -= 3
		}
		set_color();
		anno_stop(s)
	} // draw_bar()

	// output all the bars
	function out_bars() {
	    var	i, b,
		l = ba.length

		for (i = 0; i < l; i++) {
			b = ba[i]		// symbol, bottom, height, top
			draw_bar(b[0], b[1], b[2], b[3])
		}

		set_sscale(-1)
		if (sb)			// single bars
			output += '<path class="bW" d="'
				+ sb
				+ '"/>\n'

		if (thb)		// thick bars [x, y, h]
			output += '<path class="bthW" d="'
				+ thb
				+ '"/>\n'
	} // out_bars()

	// set the helper lines of rests
	function hl_rest(s) {
	    var	j,
		stlines = cur_sy.staves[s.st].stafflines,
		p_st = staff_tb[s.st],
		i = 5 - s.nflags,		// rest_tb index (5 = C_XFLAGS)
		x = s.x,
		y = s.y

		if (i < 6)	// no ledger line if rest smaller than minim
			return

		if (i == 7 && y == 12
		 && stlines.length <= 2)
			y -= 6			// semibreve a bit lower

		j = y / 6
		switch (i) {
		default:
			switch (stlines[j + 1]) {
			case '|':
			case '[':
			case "'":
			case ':':
				break
			default:
				set_hl(p_st, j + 1, x, -7, 7)
				break
			}
			if (i == 9) {		// longa
				y -= 6
				j--
			}
			break
		case 7:				// semibreve
			y += 6
			j++
		case 6:				// minim
			break
		}
		switch (stlines[j]) {
		case '|':
		case '[':
		case "'":
		case ':':
			break
		default:
			set_hl(p_st, j, x, -7, 7)
			break
		}
	} // hl_rest()

	// return the left x offset of a new staff
	// s is the %%staves
	function st1(st, s) {
	    var	tim = s.time

		do {			// search a voice of this staff
			s = s.ts_next
		} while (s.st != st)
		while (s.prev		// search the first symbol of this voice
		    && s.prev.time >= tim)
			s = s.prev
		if (s.bar_type)
			return s.x
		return s.x - s.wl
	} // st1()

	// ---- draw_systems() ----

	/* draw the staff, skipping the staff breaks */
	for (st = 0; st <= nstaff; st++) {
		stl[st] = cur_sy.st_print[st]		// staff at start of line
		xstaff[st] = !stl[st] ? -1 : 0;
	}
	bar_set();
	draw_lstaff(0)
	for (s = tsfirst; s; s = s.ts_next) {
		switch (s.type) {
		case C.STAVES:
			sy = s.sy
			for (st = 0; st <= nstaff; st++) {
				x = xstaff[st]
				if (x < 0) {		// no staff yet
					if (sy.st_print[st]) {
						xstaff[st] = st1(st, s)
						stl[st] = true
					}
					continue
				}
				if (sy.st_print[st]	// if not staff stop
				 && cur_sy.staves[st]
				 && sy.staves[st].stafflines ==
						cur_sy.staves[st].stafflines)
					continue
				if (s.ts_prev.bar_type) {
					x2 = s.ts_prev.x
					if (sy.staves[st].stafflines.length >
					    cur_sy.staves[st].stafflines.length)
						x2 -= s.ts_prev.wl - 4
				} else {
					x2 = (s.ts_prev.x + s.x) / 2
					xstaff[st] = -1
				}
				draw_staff(st, x, x2)
				xstaff[st] = sy.st_print[st] ? x2 : -1
			}
			cur_sy = sy;
			bar_set()
			continue
		case C.BAR:		// display the bars after the staves
			if (s.invis || !s.bar_type
			 || !cur_sy.st_print[s.st])
				break
			if (s.second
			 && (!s.ts_prev
			  || (s.ts_prev.type == C.BAR
			   && s.ts_prev.st == s.st)))
				break
			ba.push([s, bar_bot[s.st], bar_height[s.st], bar_ng[s.st]])
			break
		case C.STBRK:
			if (cur_sy.voices[s.v]
			 && cur_sy.voices[s.v].range == 0) {
				if (s.xmx > 14
				 && s.next			// if not at end of line
				 && s.next.type == C.CLEF) {	// and before a clef

					/* draw the left system if stbrk in all voices */
					var nv = 0
					for (var i = 0; i < voice_tb.length; i++) {
						if (cur_sy.voices[i]
						  && cur_sy.voices[i].range > 0)
							nv++
					}
					for (s2 = s.ts_next; s2; s2 = s2.ts_next) {
						if (s2.type != C.STBRK)
							break
						nv--
					}
					if (nv == 0)
						draw_lstaff(s.x)
				}
			}
			st = s.st;
			x = xstaff[st]
			if (x >= 0) {
				s2 = s.prev
				if (!s2)
					break
				x2 = s2.type == C.BAR ?
					s2.x :
					s.x - s.xmx
				if (x >= x2)
					break
				draw_staff(st, x, x2)
				xstaff[st] = s.x
			}
			break
		case C.GRACE:
			for (s2 = s.extra; s2; s2 = s2.next)
				self.draw_hl(s2)
			break
		case C.NOTE:
			if (!s.invis)
				self.draw_hl(s)
			break
		case C.REST:
			if (s.fmr		// if full measure rest
			 || (s.rep_nb && s.rep_nb >= 0))
				center_rest(s)
			if (!s.invis)
				hl_rest(s)
			break
//		default:
//fixme:does not work for "%%staves K: M: $" */
//removed for K:/M: in empty staves
//			if (!cur_sy.st_print[st])
//				s.invis = true
//			break
		}
	}

	// draw the end of the staves
	for (st = 0; st <= nstaff; st++) {
		x = xstaff[st]
		if (x < 0 || x >= realwidth)
			continue
		draw_staff(st, x, realwidth)
	}

	// the ledger lines
	draw_all_hl()

	// and the bars
	out_bars()

	draw_vname(indent, stl)

//	set_sscale(-1)
}

/* -- draw remaining symbols when the staves are defined -- */
// (possible hook)
Abc.prototype.draw_symbols = function(p_voice) {
	var	bm = {},
		s, x, y, st;

//	bm.s2 = undefined
	for (s = p_voice.sym; s; s = s.next) {
		if (s.invis) {
			switch (s.type) {
			case C.CLEF:
				if (s.time >= staff_tb[s.st].clef.time)
					staff_tb[s.st].clef = s
				continue
			case C.KEY:
				p_voice.ckey = s
			default:
				continue
			case C.NOTE:	// (beams may start on invisible notes)
				break
			}
		}
		st = s.st
		x = s.x;
		set_color(s.color)
		switch (s.type) {
		case C.NOTE:
//--fixme: recall set_scale if different staff
			set_scale(s)
			if (s.beam_st && !s.beam_end) {
				if (self.calculate_beam(bm, s))
					draw_beams(bm)
			}
			if (!s.invis) {
				anno_start(s);
				draw_note(s, !bm.s2);
				anno_a.push(s)
			}
			if (s == bm.s2)
				bm.s2 = null
			break
		case C.REST:
			if (!gene.st_print[st])
				break
			draw_rest(s);
			break
		case C.BAR:
			break			/* drawn in draw_systems */
		case C.CLEF:
			if (s.time >= staff_tb[st].clef.time) {
				if (s.x == staff_tb[st].clef.x
				 && s.v != staff_tb[st].clef.v)
					break
				staff_tb[st].clef = s
			}
			if (!gene.st_print[st])
				break
			set_color();
			set_sscale(st);
			anno_start(s);
			y = staff_tb[st].y
			if (s.clef_name)
				xygl(x, y + s.y, s.clef_name)
			else if (!s.clef_small)
				xygl(x, y + s.y, s.clef_type + "clef")
			else
				xygl(x, y + s.y, "s" + s.clef_type + "clef")
			if (s.clef_octave) {
/*fixme:break the compatibility and avoid strange numbers*/
				if (s.clef_octave > 0) {
					y += s.ymx + 1
					if (s.clef_small)
						y -= 2
				} else {
					y += s.ymn - 2 //+2
//					if (s.clef_small)
//						y += 1
				}
				xygl(x - 2, y, (s.clef_octave == 7
						|| s.clef_octave == -7)
					? "oct" : "oct2")
			}
			anno_a.push(s)
			break
		case C.METER:
			p_voice.meter = s
			if (s.second
			 || !staff_tb[s.st].topbar)
				break
			set_color();
			set_sscale(s.st);
			anno_start(s);
			draw_meter(s);
			anno_a.push(s)
			break
		case C.KEY:
			p_voice.ckey = s
			if (s.second
			 || !staff_tb[s.st].topbar)
				break
			set_color();
			set_sscale(s.st);
			anno_start(s);
			self.draw_keysig(x, s);
			anno_a.push(s)
			break
		case C.MREST:
			draw_mrest(s)
			break
		case C.GRACE:
			set_scale(s);
			draw_gracenotes(s)
			break
		case C.SPACE:
		case C.STBRK:
			break			/* nothing */
		case C.CUSTOS:
			set_scale(s);
			draw_note(s, 0)
			break
		case C.BLOCK:			// no width
		case C.REMARK:
		case C.STAVES:
		case C.TEMPO:
			break
		default:
			error(2, s, "draw_symbols - Cannot draw symbol " + s.type)
			break
		}
	}
	set_scale(p_voice.sym);
}

/* -- draw all symbols -- */
function draw_all_sym() {
    var	p_voice, v,
	n = voice_tb.length

	// draw the slurs on 2 staves
	// sl = [symbol of 1st staff, symbol of 2nd staff, slur type, <path .../>
	function draw_sl2() {
	    var	i, a, d, dy, dy2, dy2o, dz, n, sl

		while (1) {
			sl = gene.a_sl.shift()
			if (!sl)
				break

			// extract the path header and the values
			i = sl[3].indexOf('d="M') + 4
			output += sl[3].slice(0, i)	// <path .. >d="M

			a = new Float32Array(sl[3].slice(i).match(/[\d.-]+/g))

			// update the starting point of the slur
			a[1] -= staff_tb[sl[0].st].y	// absolute vertical offset

// [0][1] = M
// [2][3] [4][5] [6][7] = c
// [8] = v			second curve if not dotted
// [9][10] [11][12] [13][14] = c
//
// y:      3-------5
//	  / 12---10 \
//	 / /       \ \
//	/ /         \ \ 7
//     1 14          \| 8
//
// x:  0   2       4    6
//       13 11    9	

			// deltas between staves, original and now
			dy2o = sl[0].fmt.sysstaffsep + 24
			dy2 = staff_tb[sl[1].st].y - staff_tb[sl[0].st].y

			switch (sl[2]) {		// slur type
			case "//":			// '~' like
			case "\\\\":

				// get the middle of the '~' slur (* 2)
				d = -(sl[1].prev.prev.y + staff_tb[sl[0].st].y
					+ sl[1].prev.next.y + staff_tb[sl[1].st].y)
					- 2 * (a[1] - posy)
				a[5] = d - a[5]
				a[7] = d - a[7]
				if (a.length > 8) {
					d = sl[2][0] == '/' ? 3 : -3
					a[8] = -a[8]
					a[10] = -a[3] + d
					a[12] = -a[5] + d
					a[14] = -a[7]
				}
				break
			case "/\\":
			case "\\/":
				d = sl[2][0] == '/'
					? dy2 - dy2o - 10
					: dy2 + dy2o + 10
				a[3] += d
				a[5] += d
				if (a.length > 8) {
					a[10] += d
					a[12] += d
				}
				break
			default:			// /+, /-, \+ or \-
				d = sl[2][0] == '/' ? dy2 - dy2o : -dy2 - dy2o
				a[5] += d
				a[7] += d
				if (a.length > 8) {
					a[12] -= d
					a[14] -= d
				}
				break
			}

			// output the slur
			output += a[0].toFixed(1) + ' ' + a[1].toFixed(1)
				+ 'c' + a[2].toFixed(1) + ' ' + a[3].toFixed(1)
				+ ' ' + a[4].toFixed(1) + ' ' + a[5].toFixed(1)
				+ ' ' + a[6].toFixed(1) + ' ' + a[7].toFixed(1)
			if (a.length > 8)
				output += 'v' + a[8].toFixed(1)
					+ 'c' + a[9].toFixed(1)
						+ ' ' + a[10].toFixed(1)
					+ ' ' + a[11].toFixed(1)
						+ ' ' + a[12].toFixed(1)
					+ ' ' + a[13].toFixed(1)
						+ ' ' + a[14].toFixed(1)
			output += '"/>\n'
		}
	} // draw_sl2()

	for (v = 0; v < n; v++) {
		p_voice = voice_tb[v]
		if (p_voice.sym
		 && p_voice.sym.x != undefined) {
			self.draw_symbols(p_voice)
			draw_all_ties(p_voice);
// no need to reset the scale as in abcm2ps
			set_color()
		}
	}

	self.draw_all_deco()
	glout()			// output the symbols
	anno_put()		// before outputting the symbol annotations

	set_sscale(-1)				/* restore the scale */

	if (gene.a_sl)		// if slurs on two staves
		draw_sl2()
}

/* -- set the tie directions for one voice -- */
function set_tie_dir(s) {
    var i, ntie, dir, sec, pit, ty, s2

	for ( ; s; s = s.next) {
		if (!s.ti1)
			continue

		sec = ntie = 0;
		pit = 128
		for (i = 0; i <= s.nhd; i++) {
			if (s.notes[i].tie_ty) {
				ntie++
				if (pit < 128
				 && s.notes[i].pit <= pit + 1)
					sec++;
				pit = s.notes[i].pit
				s2 = s.notes[i].tie_e
			}
		}

		if (s2 && s.stem * s2.stem < 0)
			dir = pit >= 22	// up if above middle staff
				? C.SL_ABOVE : C.SL_BELOW
		else if (s.multi)
			dir = s.multi > 0 ? C.SL_ABOVE : C.SL_BELOW
		else
			dir = s.stem < 0 ? C.SL_ABOVE : C.SL_BELOW

		// if other voice, set the ties in opposite direction
		if (s.multi) {
			for (i = 0; i <= s.nhd; i++) {
				ty = s.notes[i].tie_ty
				if (!((ty & 0x07) == C.SL_AUTO))
					continue
				s.notes[i].tie_ty = (ty & C.SL_DOTTED) | dir
			}
			continue
		}

		/* if one note, set the direction according to the stem */
		if (ntie <= 1) {
			for (i = 0; i <= s.nhd; i++) {
				ty = s.notes[i].tie_ty
				if (ty) {
					if ((ty & 0x07) == C.SL_AUTO)
						s.notes[i].tie_ty =
							(ty & C.SL_DOTTED) | dir
					break
				}
			}
			continue
		}
		if (!sec) {
			if (ntie & 1) {
/* in chords with an odd number of notes, the outer noteheads are paired off
 * center notes are tied according to their position in relation to the
 * center line */
				ntie = (ntie - 1) / 2;
				dir = C.SL_BELOW
				for (i = 0; i <= s.nhd; i++) {
					ty = s.notes[i].tie_ty
					if (!ty)
						continue
					if (ntie == 0) {	/* central tie */
						if (s.notes[i].pit >= 22)
							dir = C.SL_ABOVE
					}
					if ((ty & 0x07) == C.SL_AUTO)
						s.notes[i].tie_ty =
							(ty & C.SL_DOTTED) | dir
					if (ntie-- == 0)
						dir = C.SL_ABOVE
				}
				continue
			}
/* even number of notes, ties divided in opposite directions */
			ntie /= 2;
			dir = C.SL_BELOW
			for (i = 0; i <= s.nhd; i++) {
				ty = s.notes[i].tie_ty
				if (!ty)
					continue
				if ((ty & 0x07) == C.SL_AUTO)
					s.notes[i].tie_ty =
						(ty & C.SL_DOTTED) | dir
				if (--ntie == 0)
					dir = C.SL_ABOVE
			}
			continue
		}
/*fixme: treat more than one second */
/*		if (nsec == 1) {	*/
/* When a chord contains the interval of a second, tie those two notes in
 * opposition; then fill in the remaining notes of the chord accordingly */
			pit = 128
			for (i = 0; i <= s.nhd; i++) {
				if (s.notes[i].tie_ty) {
					if (pit < 128
					 && s.notes[i].pit <= pit + 1) {
						ntie = i
						break
					}
					pit = s.notes[i].pit
				}
			}
			dir = C.SL_BELOW
			for (i = 0; i <= s.nhd; i++) {
				ty = s.notes[i].tie_ty
				if (!ty)
					continue
				if (ntie == i)
					dir = C.SL_ABOVE
				if ((ty & 0x07) == C.SL_AUTO)
					s.notes[i].tie_ty =
						(ty & C.SL_DOTTED) | dir
			}
/*fixme..
			continue
		}
..*/
/* if a chord contains more than one pair of seconds, the pair farthest
 * from the center line receives the ties drawn in opposition */
	}
}

/* -- have room for the ties out of the staves -- */
function set_tie_room() {
	var p_voice, s, s2, v, dx, y, dy

	for (v = 0; v < voice_tb.length; v++) {
		p_voice = voice_tb[v];
		s = p_voice.sym
		if (!s)
			continue
		s = s.next
		if (!s)
			continue
		set_tie_dir(s)
		for ( ; s; s = s.next) {
			if (!s.ti1)
				continue
			if (s.notes[0].pit < 20
			 && s.notes[0].tie_ty
			 && (s.notes[0].tie_ty & 0x07) == C.SL_BELOW)
				;
			else if (s.notes[s.nhd].pit > 24
			      && s.notes[s.nhd].tie_ty
			      && (s.notes[s.nhd].tie_ty & 0x07) == C.SL_ABOVE)
				;
			else
				continue
			s2 = s.next
			while (s2 && s2.type != C.NOTE)
				s2 = s2.next
			if (s2) {
				if (s2.st != s.st)
					continue
				dx = s2.x - s.x - 10
			} else {
				dx = realwidth - s.x - 10
			}
			if (dx < 100)
				dy = 9
			else if (dx < 300)
				dy = 12
			else
				dy = 16
			if (s.notes[s.nhd].pit > 24) {
				y = 3 * (s.notes[s.nhd].pit - 18) + dy
				if (s.ymx < y)
					s.ymx = y
				if (s2 && s2.ymx < y)
					s2.ymx = y;
				y_set(s.st, true, s.x + 5, dx, y)
			}
			if (s.notes[0].pit < 20) {
				y = 3 * (s.notes[0].pit - 18) - dy
				if (s.ymn > y)
					s.ymn = y
				if (s2 && s2.ymn > y)
					s2.ymn = y;
				y_set(s.st, false, s.x + 5, dx, y)
			}
		}
	}
}
