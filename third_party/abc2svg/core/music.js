// abc2svg - music.js - music generation
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

var	gene,
	staff_tb,
	nstaff,			// current number of staves
	tsnext,			// next line when cut
	realwidth,		// real staff width while generating
	insert_meter,		// insert the time signature
	spf_last,		// spacing for last short line

	smallest_duration

/* -- decide whether to shift heads to other side of stem on chords -- */
/* this routine is called only once per tune */

// distance for no overlap - index: [prev acc][cur acc]
//var dt_tb = [
//	[5, 5, 5, 5],		/* dble sharp */
//	[5, 6, 6, 6],		/* sharp */
//	[5, 6, 5, 6],		/* natural */
//	[5, 5, 5, 5]		/* flat / dble flat */
//]

// accidental x offset - index = note head type
var dx_tb = new Float32Array([
	9.5,		// FULL
	9.5,		// EMPTY
	13,		// OVAL
	16,		// OVALBARS
	16		// SQUARE
])

// head width  - index = note head type
var hw_tb = new Float32Array([
	4.7,		// FULL
	5,		// EMPTY
	6,		// OVAL
	7.2,		// OVALBARS
	7.5		// SQUARE
])

/* head width for voice overlap - index = note head type */
var w_note = new Float32Array([
	2.5,		// FULL
	3,		// EMPTY
	4.5,		// OVAL
	6,		// OVALBARS
	6.5		// SQUARE
])

// get head type, dots, flags of note/rest for a duration
function identify_note(s, dur_o) {
    var	r = abc2svg.hdn[dur_o]
	if (r)				// in cache?
		return r

    var	head, flags,
	dots = 0,
	dur = dur_o

	if (dur % 12 != 0)
		error(1, s, "Invalid note duration $1", dur);
	dur /= 12			/* see C.BLEN for values */
	if (!dur)
		error(1, s, "Note too short")
	for (flags = 5; dur; dur >>= 1, flags--) {
		if (dur & 1)
			break
	}
	dur >>= 1
	while (dur >> dots > 0)
		dots++

	flags -= dots
	if (flags >= 0) {
		head = C.FULL
	} else switch (flags) {
	default:
		error(1, s, "Note too long")
		flags = -4
		/* fall thru */
	case -4:
		head = C.SQUARE
		break
	case -3:
		head = s.fmt.squarebreve ? C.SQUARE : C.OVALBARS
		break
	case -2:
		head = C.OVAL
		break
	case -1:
		head = C.EMPTY
		break
	}
	abc2svg.hdn[dur_o] =
		r = [head, dots, flags]
	return r
}

function set_head_shift(s) {
	var	i, i1, i2, d, ps, dx,
		dx_head = dx_tb[s.head],
		dir = s.stem,
		n = s.nhd

	if (!n)
		return			// single note

	/* set the head shifts */
	dx = dx_head * .74
	if (s.grace)
		dx *= .6
	if (dir >= 0) {
		i1 = 1;
		i2 = n + 1;
		ps = s.notes[0].pit
	} else {
		dx = -dx;
		i1 = n - 1;
		i2 = -1;
		ps = s.notes[n].pit
	}
	var	shift = false,
		dx_max = 0
	for (i = i1; i != i2; i += dir) {
		d = s.notes[i].pit - ps;
		ps = s.notes[i].pit
		if (!d) {
			if (shift) {		/* unison on shifted note */
				var new_dx = s.notes[i].shhd =
						s.notes[i - dir].shhd + dx
				if (dx_max < new_dx)
					dx_max = new_dx
				continue
			}
			if (i + dir != i2	/* second after unison */
//fixme: should handle many unisons after second
			 && ps + dir == s.notes[i + dir].pit) {
				s.notes[i].shhd = -dx
				if (dx_max < -dx)
					dx_max = -dx
				continue
			}
		}
		if (d < 0)
			d = -d
		if (d > 3 || (d >= 2 && s.head != C.SQUARE)) {
			shift = false
		} else {
			shift = !shift
			if (shift) {
				s.notes[i].shhd = dx
				if (dx_max < dx)
					dx_max = dx
			}
		}
	}
	s.xmx = dx_max				/* shift the dots */
}

// set the accidental shifts for a set of chords
// @grh = head width when grace notes
function acc_shift(notes, grh) {
    var	i, i1, i2, dx, dx1, dx2, ps, p1, acc, dxh,
	n = notes.length

	// set the shifts from the head shifts
	for (i = n - 1; --i >= 0; ) {	// (no shift on top)
		dx = notes[i].shhd
		if (!dx || dx > 0)
			continue
//fixme: '9' is the width of a quarter note
		dx = (grh || (notes[i].s ? dx_tb[notes[i].s.head] : 9))
			- dx
		ps = notes[i].pit
		for (i1 = n; --i1 >= 0; ) {
			if (!notes[i1].acc)
				continue
			p1 = notes[i1].pit
			if (p1 < ps - 3)
				break
			if (p1 > ps + 3)
				continue
			if (notes[i1].shac < dx)
				notes[i1].shac = dx
		}
	}

	// set the shifts of the highest and lowest notes
	for (i1 = n; --i1 >= 0; ) {
		if (notes[i1].acc) {
			p1 = notes[i1].pit	// top note with accidental
			dx1 = notes[i1].shac
			if (!dx1) {
				dx1 = notes[i1].shhd
				dxh = grh || dx_tb[notes[i1].s.head]
				if (dx1 < 0)
					dx1 = dxh - dx1
				else
					dx1 = dxh
			}
			break
		}
	}
	if (i1 < 0)				// no accidental
		return
	for (i2 = 0; i2 < i1; i2++) {
		if (notes[i2].acc) {
			ps = notes[i2].pit	// bottom note with accidental
			dx2 = notes[i2].shac
			if (!dx2) {
				dx2 = notes[i2].shhd
				dxh = grh || dx_tb[notes[i2].s.head]
				if (dx2 < 0)
					dx2 = dxh - dx2
				else
					dx2 = dxh
			}
			break
		}
	}
	if (i1 == i2) {			// only one accidental
		notes[i1].shac = dx1
		return
	}

	if (p1 > ps + 4) {		// if interval greater than a sixth
		if (dx1 > dx2)
			dx2 = dx1	// align the accidentals
		notes[i1].shac = notes[i2].shac = dx2
	} else {
		notes[i1].shac = dx1
		if (notes[i1].pit != notes[i2].pit
		 || notes[i1].acc != notes[i2].acc)
			dx1 += 7
		notes[i2].shac = dx2 = dx1
	}
	dx2 += 7

	// shift the remaining accidentals
	for (i = i1; --i > i2; ) {		// from top to bottom
		acc = notes[i].acc
		if (!acc)
			continue
		dx = notes[i].shac
		if (dx < dx2)
			dx = dx2
		ps = notes[i].pit
		for (i1 = n; --i1 > i; ) {
			if (!notes[i1].acc)
				continue
			p1 = notes[i1].pit
			if (p1 >= ps + 4) {	// pitch far enough
				if (p1 > ps + 4	// if more than a fifth
				 || acc < 0	// if flat/dble flat
				 || notes[i1].acc < 0)
					continue
			}
			if (dx > notes[i1].shac - 6) {
				dx1 = notes[i1].shac + 7
				if (dx1 > dx)
					dx = dx1
			}
		}
		notes[i].shac = dx
	}
}

/* set the horizontal shift of accidentals */
/* this routine is called only once per tune */
function set_acc_shft() {
    var	s, s2, st, i, acc, st, t, notes

	// search the notes with accidentals at the same time
	s = tsfirst
	while (s) {
		if (s.type != C.NOTE
		 || s.invis) {
			s = s.ts_next
			continue
		}
		st = s.st;
		t = s.time;
		acc = false
		for (s2 = s; s2; s2 = s2.ts_next) {
			if (s2.time != t
			 || s2.type != C.NOTE
			 || s2.st != st)
				break
			for (i = 0; i <= s2.nhd; i++) {
				if (s2.notes[i].acc) {
					s2.notes[i].s = s2
					acc = true
				}
			}
		}
		if (!acc) {
			s = s2
			continue
		}

		// build a pseudo chord and shift the accidentals
		notes = []
		for ( ; s != s2; s = s.ts_next) {
			if (!s.invis)
				Array.prototype.push.apply(notes, s.notes)
		}
		notes.sort(abc2svg.pitcmp)
		acc_shift(notes)
	}
}

// link a symbol before an other one
function lkvsym(s, next) {	// voice linkage
	s.next = next;
	s.prev = next.prev
	if (s.prev)
		s.prev.next = s
	else
		s.p_v.sym = s;
	next.prev = s
}
function lktsym(s, next) {	// time linkage
    var	old_wl

	s.ts_next = next
	if (next) {
		s.ts_prev = next.ts_prev
		if (s.ts_prev)
			s.ts_prev.ts_next = s;
		next.ts_prev = s
	} else {
//fixme
error(2, s, "Bad linkage")
		s.ts_prev = null
	}
	s.seqst = !s.ts_prev
		|| s.time != s.ts_prev.time
		|| (w_tb[s.ts_prev.type] != w_tb[s.type]
		 && !!w_tb[s.ts_prev.type])
	if (!next || next.seqst)
		return
	next.seqst = next.time != s.time ||
			(w_tb[s.type] != w_tb[next.type]
			 && !!w_tb[s.type])
	if (next.seqst) {
		old_wl = next.wl
		self.set_width(next)
		if (next.a_ly)
			ly_set(next)
		if (!next.shrink) {
			next.shrink = next.wl
			if (next.prev)
				next.shrink += next.prev.wr
		} else {
			next.shrink += next.wl - old_wl
		}
		next.space = 0
	}
}

/* -- unlink a symbol -- */
function unlksym(s) {
	if (s.next)
		s.next.prev = s.prev
	if (s.prev)
		s.prev.next = s.next
	else
		s.p_v.sym = s.next
	if (s.ts_next) {
		if (s.seqst) {
		    if (s.ts_next.seqst) {
			s.ts_next.shrink += s.shrink;
			s.ts_next.space += s.space
		    } else {
			s.ts_next.seqst = true;
			s.ts_next.shrink = s.shrink;
			s.ts_next.space = s.space
		    }
		} else {
			if (s.ts_next.seqst
			 && s.ts_prev && s.ts_prev.seqst
			 && !w_tb[s.ts_prev.type]) {
				s.ts_next.seqst = false
				s.shrink = s.ts_next.shrink
				s.space = s.ts_next.space
			}
		}
		s.ts_next.ts_prev = s.ts_prev
	}
	if (s.ts_prev)
		s.ts_prev.ts_next = s.ts_next
	if (tsfirst == s)
		tsfirst = s.ts_next
	if (tsnext == s)
		tsnext = s.ts_next
}

/* -- insert a clef change (treble or bass) before a symbol -- */
function insert_clef(s, clef_type, clef_line) {
	var	p_voice = s.p_v,
		new_s,
		st = s.st

	/* don't insert the clef between two bars */
	if (s.type == C.BAR && s.prev && s.prev.type == C.BAR
	 && s.prev.bar_type[0] != ':')
		s = s.prev;

	/* create the symbol */
	p_voice.last_sym = s.prev
	if (!p_voice.last_sym)
		p_voice.sym = null;
	p_voice.time = s.time;
	new_s = sym_add(p_voice, C.CLEF);
	new_s.next = s;
	s.prev = new_s;

	new_s.clef_type = clef_type;
	new_s.clef_line = clef_line;
	new_s.st = st;
	new_s.clef_small = true
	delete new_s.second;
	new_s.notes = []
	new_s.notes[0] = {
		pit: s.notes[0].pit
	}
	new_s.nhd = 0;

	/* link in time */
	while (!s.seqst)
		s = s.ts_prev;
	lktsym(new_s, s)
	if (s.soln) {			// move the start of line
		new_s.soln = true
		delete s.soln
	}
	return new_s
}

/* -- set the staff of the floating voices -- */
/* this function is called only once per tune */
function set_float() {
	var p_voice, st, staff_chg, v, s, s1, up, down

	for (v = 0; v < voice_tb.length; v++) {
		p_voice = voice_tb[v]
//		if (!p_voice.floating)
//			continue
		staff_chg = false;
		st = p_voice.st
		for (s = p_voice.sym; s; s = s.next) {
			if (!s.floating) {
				while (s && !s.floating)
					s = s.next
				if (!s)
					break
				staff_chg = false
			}
			if (!s.dur) {
				if (staff_chg)
					s.st++
				continue
			}
			if (s.notes[0].pit >= 19) {		/* F */
				staff_chg = false
				continue
			}
			if (s.notes[s.nhd].pit <= 12) {	/* F, */
				staff_chg = true
				s.st++
				continue
			}
			up = 127
			for (s1 = s.ts_prev; s1; s1 = s1.ts_prev) {
				if (s1.st != st
				 || s1.v == s.v)
					break
				if (s1.type == C.NOTE)
				    if (s1.notes[0].pit < up)
					up = s1.notes[0].pit
			}
			if (up == 127) {
				if (staff_chg)
					s.st++
				continue
			}
			if (s.notes[s.nhd].pit > up - 3) {
				staff_chg = false
				continue
			}
			down = -127
			for (s1 = s.ts_next; s1; s1 = s1.ts_next) {
				if (s1.st != st + 1
				 || s1.v == s.v)
					break
				if (s1.type == C.NOTE)
				    if (s1.notes[s1.nhd].pit > down)
					down = s1.notes[s1.nhd].pit
			}
			if (down == -127) {
				if (staff_chg)
					s.st++
				continue
			}
			if (s.notes[0].pit < down + 3) {
				staff_chg = true
				s.st++
				continue
			}
			up -= s.notes[s.nhd].pit
			down = s.notes[0].pit - down
			if (!staff_chg) {
				if (up < down + 3)
					continue
				staff_chg = true
			} else {
				if (up < down - 3) {
					staff_chg = false
					continue
				}
			}
			s.st++
		}
	}
}

/* -- set the x offset of the grace notes -- */
function set_graceoffs(s) {
	var	next, m, dx, x,
		gspleft = s.fmt.gracespace[0],
		gspinside = s.fmt.gracespace[1],
		gspright = s.fmt.gracespace[2],
		g = s.extra;

	if (s.prev && s.prev.type == C.BAR)
		gspleft -= 3;
	x = gspleft;

	g.beam_st = true
	for ( ; ; g = g.next) {
		set_head_shift(g)
		acc_shift(g.notes, 6.5)
		dx = 0
		for (m = g.nhd; m >= 0; m--) {
			if (g.notes[m].shac - 2 > dx)
				dx = g.notes[m].shac - 2
		}
		x += dx;
		g.x = x

		if (g.nflags <= 0)
			g.beam_st = g.beam_end = true
		next = g.next
		if (!next) {
			g.beam_end = true
			break
		}
		if (next.nflags <= 0)
			g.beam_end = true
		if (g.beam_end) {
			next.beam_st = true;
			x += gspinside / 4
		}
		if (g.nflags <= 0)
			x += gspinside / 4
		if (g.y > next.y + 8)
			x -= 1.5
		x += gspinside
	}

	next = s.next
	if (next
	 && next.type == C.NOTE) {	/* if before a note */
		if (g.y >= 3 * (next.notes[next.nhd].pit - 18))
			gspright -= 1		// above, a bit closer
		else if (g.beam_st
		      && g.y < 3 * (next.notes[next.nhd].pit - 18) - 4)
			gspright += 2		// below with flag, a bit further
	}
	x += gspright;

	/* return the whole width */
	return x
}

// Compute the smallest spacing between symbols according to chord symbols
//	so that they stay at the same offset
// and, also, adjust the spacing due to the lyric words.
// Constraints:
// - assume the chord symbols are only in the first staff
// - treat only the first chord symbol of each symbol
// - the chord symbols under the staff are ignored
function set_w_chs(s) {
    var	i, ch, w0, s0, dw,
	x = 0,
	n = 0

	set_font("vocal")
	for ( ; s; s = s.ts_next) {
		if (s.seqst) {
			x += s.shrink;
			n++
		}
		if (s.a_ly)			// if some lyric
			ly_set(s)

		if (!s.a_gch)
			continue
		for (i = 0; i < s.a_gch.length; i++) {
			ch = s.a_gch[i]
			if (ch.type != 'g' || ch.y < 0) // upper chord symbol only
				continue
			if (w0) {		// width of the previous chord symbol
				if (w0 > x + ch.x) {
					if (s.prev // (if not at start of a secondary voice)
					 && s.prev.seqst
					 && s.prev.type == C.BAR) // don't move away
						n--		// the symbol from a bar
					dw = (w0 - x - ch.x) / n
					while (1) {
						s0 = s0.ts_next
						if (s0.shrink)
							s0.shrink += dw
						if (s0 == s
						 || s0.type == C.BAR)
							break
					}
				}
			}
			s0 = s;
			w0 = ch.text.wh[0];
			n = 0;
//			x = ch.font.box ? -2 : 0
			x = 0
			break
		}
	}
}

// compute the width needed by the left and right annotations
function gchord_width(s, wlnote, wlw) {
    var	gch, w, ix,
	arspc = 0

	for (ix = 0; ix < s.a_gch.length; ix++) {
		gch = s.a_gch[ix]
		switch (gch.type) {
		case '<':		/* left */
			w = gch.text.wh[0] + wlnote
			if (w > wlw)
				wlw = w
			break
		case '>':		/* right */
			w = gch.text.wh[0] + s.wr
			if (w > arspc)
				arspc = w
			break
		}
	}
	if (s.wr < arspc)
		s.wr = arspc

	return wlw
}

/* -- set the width of a symbol -- */
/* This routine sets the minimal left and right widths wl,wr
 * so that successive symbols are still separated when
 * no extra glue is put between them */
// (possible hook)
Abc.prototype.set_width = function(s) {
    var	s2, i, m, xx, w, wlnote, wlw, acc, nt,
	bar_type, meter, last_acc, n1, n2, esp, tmp

	if (s.play) {			// if play symbol
		s.wl = s.wr = 0
		return
	}

	switch (s.type) {
	case C.NOTE:
	case C.REST:

		/* set the note widths */
		s.wr = wlnote = s.invis ? 0 : hw_tb[s.head]

		/* room for shifted heads and accidental signs */
		if (s.xmx > 0)
			s.wr += s.xmx + 4;
		for (s2 = s.prev; s2; s2 = s2.prev) {
			if (w_tb[s2.type])
				break
		}
		if (s2) {
			switch (s2.type) {
			case C.BAR:
			case C.CLEF:
			case C.KEY:
			case C.METER:
				wlnote += 3
				break
			case C.STBRK:
				wlnote += 8
				break
			case C.NOTE:

				// change the spacing when stems in reverse directions
				if (s.stem * s2.stem < 0)
					wlnote += s.stem < 0 ? 3 : -3
				break
			}
		}
		w = 0				// width of the chord decorations
		for (m = 0; m <= s.nhd; m++) {
			nt = s.notes[m]
			xx = nt.shhd
			if (xx < 0) {
				if (wlnote < -xx + 5)
					wlnote = -xx + 5
			}
			acc = nt.acc
			if (acc
			 && (!s2
			  || s2.type != C.NOTE
			  || (s2.stem >= 0 && s2.notes[0].pit < nt.pit + 4)
			  || (s2.stem < 0 && s2.notes[s2.nhd].pit > nt.pit - 4))) {
				tmp = nt.shac +
					(typeof acc == "object" ? 5.5 : 3.5)
				if (s2 && s2.stem < 0
				 && s2.notes[s2.nhd].pit > nt.pit + 4)
					tmp -= 5
				if (wlnote < tmp)
					wlnote = tmp
			}
			if (nt.a_dd) {		// if decoration in chord
				tmp = deco_wch(nt)
				if (w < tmp)
					w = tmp
			}
		}
		wlnote += w
		if (s2) {
			switch (s2.type) {
			case C.BAR:
			case C.CLEF:
			case C.KEY:
			case C.METER:
				wlnote -= 3
				break
			}
		}

		/* room for the decorations */
		if (s.a_dd)
			wlnote = deco_width(s, wlnote)

		/* space for flag if stem goes up on standalone note */
		if (s.beam_st && s.beam_end
		 && s.stem > 0 && s.nflags > 0) {
			if (s.wr < s.xmx + 9)
				s.wr = s.xmx + 9
		}

		/* leave room for dots and set their offset */
		if (s.dots) {
		  if (s.wl == undefined)	// don't recompute if new music line
			switch (s.head) {
			case C.SQUARE:
			case C.OVALBARS:
				s.xmx += 3
				break
			case C.OVAL:
				s.xmx += 1
				break
			}
			if (s.wr < s.xmx + 8)
				s.wr = s.xmx + 8
			if (s.dots >= 2)
				s.wr += 3.5 * (s.dots - 1)
		}

		/* if a tremolo on 2 notes, have space for the small beam(s) */
		if (s.trem2 && s.beam_end
		 && wlnote < 20)
			wlnote = 20

		wlw = wlnote

		if (s2) {
			switch (s2.type) {
			case C.NOTE:

				/* make sure helper lines don't overlap */
				if ((s.y > 27 && s2.y > 27)
				 || (s.y < -3 && s2.y < -3)) {
					if (wlw < 6)
						wlw = 6
				}

				/* have ties wide enough */
				if (s2.tie) {
					if (wlw < 14)
						wlw = 14
				}
				break
			case C.CLEF:		/* extra space at start of line */
				if (s2.second
				 || s2.clef_small)
					break
				// fall thru
			case C.KEY:
				if (s.a_gch)
					wlw += 4 // have some room for the chord symbols
				// fall thru
			case C.METER:
				wlw += 3
				break
			}
		}

		/* leave room for guitar chord */
		if (s.a_gch)
			wlw = gchord_width(s, wlnote, wlw)

		// ignore the lyrics for now

		/* if preceeded by a grace note sequence, adjust */
		if (s.prev && s.prev.type == C.GRACE) {
			s.wl = wlnote - 4.5
		} else {
			s.wl = wlw
		}
		return
	case C.SPACE:
		xx = s.width / 2;
		s.wr = xx
		if (s.a_gch)
			xx = gchord_width(s, xx, xx)
		if (s.a_dd)
			xx = deco_width(s, xx)
		s.wl = xx
		return
	case C.BAR:
		bar_type = s.bar_type
			switch (bar_type) {
			case "|":
				w = 5		// 3 + 2
				break
			case "[":		// repeat number on secondary staff
				w = 0
				break
			default:
				w = 2 + 2.8 * bar_type.length
				for (i = 0; i < bar_type.length; i++) {
					switch (bar_type[i]) {
					case "[":
					case "]":
						w += 1
						// fall thru
					case ":":
						w += 2
						break
					}
				}
				if (bar_type[0] == ":"		// if "c3 :|"
				 && s.prev && s.prev.dots)
					w += 4
				break
			}
			s.wl = w
			if (s.next
			 && s.next.type != C.METER)
				s.wr = 7
			else
				s.wr = 5
//			s.notes[0].shhd = (w - 5) * -.5

		// special case for (mainly) "|| !invisible! |:"
		if (s.invis)
//fixme
//		 && s.prev && s.prev.bar_type)
			s.wl = s.wr = 2

			/* if preceeded by a grace note sequence, adjust */
			s2 = s.prev
			if (s2 && s2.type == C.GRACE)
				s.wl -= 6
			for ( ; s2; s2 = s2.prev) {
				if (w_tb[s2.type]) {
					if (s2.type == C.STBRK)
						s.wl -= 12
					break
				}
			}

		if (s.a_dd)
			s.wl = deco_width(s, s.wl)

		/* have room for the repeat numbers / chord indication */
		if (s.text && s.text.length < 4
		 && s.next && s.next.a_gch) {
			set_font("repeat");
			s.wr += strwh(s.text)[0] + 2
		}
		if (cfmt.measurenb > 0 && s.bar_num
			 && !(s.bar_num % cfmt.measurenb))
				s.wr += 4
		return
	case C.CLEF:
// (there may be invisible clefs in empty staves)
		if (s.invis) {
			s.wl = s.wr = 1		// (!! not 0 !!)
			return
		}
		if (s.prev && s.prev.type == C.STBRK) {
			s.wl = 6
			s.wr = 13
			delete s.clef_small
			return
		}
		s.wl = s.clef_small ? 11 : 12
		s.wr = s.clef_small ? 8 : 13
		return
	case C.KEY:
		if (s.invis)
			break				// no width
		s.wl = 0
		esp = 3
			n1 = s.k_sf			/* new key sig */
			if (s.k_old_sf && (s.fmt.cancelkey || n1 == 0))
				n2 = s.k_old_sf	/* old key */
			else
				n2 = 0
			if (n1 * n2 >= 0) {		/* if no natural */
				if (n1 < 0)
					n1 = -n1
				if (n2 < 0)
					n2 = -n2
				if (n2 > n1)
					n1 = n2
			} else {
				n1 -= n2
				if (n1 < 0)
					n1 = -n1;
				esp += 3	/* see extra space in draw_keysig() */
			}
		if (s.k_bagpipe == 'p')		// K:Hp - add the g natural
			n1++
		if (s.k_a_acc) {
			n2 = s.k_a_acc.length
			if (s.exp)
				n1 = n2			// no key signature
			else
				n1 += n2
			if (n2)
				last_acc = s.k_a_acc[0].acc
			for (i = 1; i < n2; i++) {
				acc = s.k_a_acc[i]
				if (acc.pit > s.k_a_acc[i - 1].pit + 6
				 || acc.pit < s.k_a_acc[i - 1].pit - 6)
					n1--		// no clash
				else if (acc.acc != last_acc)
					esp += 3;
				last_acc = acc.acc
			}
		}
		if (!n1)
			break			// no width
		s.wr = 5.5 * n1 + esp
		if (s.prev && !s.prev.bar_type)
			s.wl += 2
		return
	case C.METER:
		s.x_meter = []
		if (!s.a_meter.length)
			break				// no width
		wlw = 0
		for (i = 0; i < s.a_meter.length; i++) {
			meter = s.a_meter[i]
			switch (meter.top[0]) {
			case 'C':
			case 'c':
			case 'o':
				s.x_meter[i] = wlw
				wlw += 14
				break
			default:
				w = 0
				if (!meter.bot
				 || meter.top.length > meter.bot.length)
					meter = meter.top
				else
					meter = meter.bot;
				for (m = 0; m < meter.length; m++) {
					switch (meter[m]) {
					case '(':
						wlw += 2
						w += 6
						break
					case ')':
						wlw -= 2
						w += 6
						break
					case '1':
						w += 6
						break
					case ' ':
						w += 2
						// fall thru
					case '.':
					case '|':
						break
					default:
						w += 12
						break
					}
				}
				s.x_meter[i] = wlw
				wlw += w
				break
			}
		}
		s.wl = 1
		s.wr = wlw + 4
		return
	case C.MREST:
		s.wl = 6;
		s.wr = 66
		return
	case C.GRACE:
		if (s.invis)
			break
		s.wl = set_graceoffs(s);
		s.wr = 0
		if (s.a_ly)
			ly_set(s)
		return
	case C.STBRK:
		s.wl = s.xmx
		s.wr = 8
		return
	case C.CUSTOS:
		s.wl = s.wr = 4
		return
	case C.TEMPO:		// no width, but build the tempo string
		tempo_build(s)
		break
	case C.BLOCK:				// no width
	case C.REMARK:
	case C.STAVES:
		break
	default:
		error(2, s, "set_width - Cannot set width for symbol $1", s.type)
		break
	}
	s.wl = s.wr = 0

	// move the invisible symbol to the next time sequence
	if (s.seqst && s.ts_next)
		s.ts_next.seqst = 0
}

// convert delta time to natural spacing
function time2space(s, len) {
    var i, l, space

	if (smallest_duration >= C.BLEN / 2) {
		if (smallest_duration >= C.BLEN)
			len /= 4
		else
			len /= 2
	} else if (!s.next && len >= C.BLEN) {
		len /= 2
	}
	if (len >= C.BLEN / 4) {
		if (len < C.BLEN / 2)
			i = 5
		else if (len < C.BLEN)
			i = 6
		else if (len < C.BLEN * 2)
			i = 7
		else if (len < C.BLEN * 4)
			i = 8
		else
			i = 9
	} else {
		if (len >= C.BLEN / 8)
			i = 4
		else if (len >= C.BLEN / 16)
			i = 3
		else if (len >= C.BLEN / 32)
			i = 2
		else if (len >= C.BLEN / 64)
			i = 1
		else
			i = 0
	}
	l = len - ((C.BLEN / 16 / 8) << i)
	space = cfmt.spatab[i]
	if (l) {
		if (l < 0) {
			space = cfmt.spatab[0] * len / (C.BLEN / 16 / 8)
		} else {
			if (i >= 9)
				i = 8
			space += (cfmt.spatab[i + 1] - cfmt.spatab[i]) *
					l / ((C.BLEN / 16 / 8) << i)
		}
	}
	return space
}

// set the natural space
function set_space(s, ptime) {
    var	space, len, s2, stemdir

	len = s.time - ptime		// time skip

	if (!len) {
		switch (s.type) {
		case C.MREST:
			return s.wl
///*fixme:do same thing at start of line*/
//		case C.NOTE:
//		case C.REST:
//			if (s.ts_prev.type == C.BAR) {
//				if (s.nflags < -2)
//					return cfmt.spatab[0]
//				return cfmt.spatab[2]
//			}
//			break
		}
		return 0
	}
	if (s.ts_prev.type == C.MREST)
//		return s.ts_prev.wr + 16
//				+ 3		// (bar wl=5 wr=8)
		return 71	// 66 (mrest.wl) + 5 (bar.wl)

	space = time2space(s, len)

	while (!s.dur) {
		switch (s.type) {
		case C.BAR:
			// (hack to have quite the same note widths between measures)
			if (!s.next)
				space *= .9
			return space * .9 - 3
		case C.CLEF:
			return space - s.wl - s.wr
		case C.BLOCK:			// no space
		case C.REMARK:
		case C.STAVES:
		case C.TEMPO:
			s = s.ts_next
			if (!s)
				return space
			continue
		case C.NOTE:
			break
		default:
			return space
		}
		break
	}

	/* reduce spacing within a beam */
	if (len <= C.BLEN / 4) {
		s2 = s
		while (s2) {
			if (!s2.beam_st) {
				space *= .9		// ex fnnp
				break
			}
			s2 = s2.ts_next
			if (!s2 || s2.seqst)
				break
		}
	}

	/* decrease spacing when stem down followed by stem up */
/*fixme:to be done later, after x computed in sym_glue*/
	if (s.nflags >= -1
	 && s.stem > 0) {
		stemdir = true

		for (s2 = s.ts_prev;
		     s2 && s2.time == ptime;
		     s2 = s2.ts_prev) {
			if (s2.type == C.NOTE
			 && (s2.nflags < -1 || s2.stem > 0)) {
				stemdir = false
				break
			}
		}
		if (stemdir) {
			for (s2 = s.ts_next;
			     s2 && s2.time == s.time;
			     s2 = s2.ts_next) {
				if (s2.type == C.NOTE
				 && (s2.nflags < -1 || s2.stem < 0)) {
					stemdir = false
					break
				}
			}
			if (stemdir)
				space *= .9
		}
	}
	return space
}

// set the spacing inside tuplets or L: factor
function set_sp_tup(s, s_et) {
    var	tim = s.time,
	ttim = s_et.time - tim,
	sp = time2space(s, ttim),	// whole time spacing
	s2 = s,
	wsp = 0

	// compute the whole spacing
	while (1) {
		s2 = s2.ts_next
		if (s2.seqst) {
			wsp += s2.space
			if (s2.bar_type)
				wsp += 10	// (fixme: not exact)
		}
		if (s2 == s_et)
			break
	}
	sp = (sp + wsp) / 2 / ttim	// mean spacing per time unit

	while (1) {
		s = s.ts_next
		if (s.seqst) {
			s.space = sp * (s.time - tim)
			tim = s.time
		}
		if (s == s_et)
			break
	}
}

// return an empty bar
function _bar(s) {
	return {
		type: C.BAR,
		bar_type: "|",
		fname: s.fname,
		istart: s.istart,
		iend: s.iend,
		v: s.v,
		p_v: s.p_v,
		st: s.st,
		dur: 0,
		time: s.time + (s.dur || 0),
		nhd: 0,
		notes: [{
			pit: s.notes ? s.notes[0].pit : 22
		}],
		seqst: true,
		invis: true,
		prev: s,
		fmt: s.fmt
	}
} // _bar()

// create an invisible bar for end of music lines
function add_end_bar(s) {
	if (s.type == C.KEY && !s.k_sf		// if an invisible key
	 && !s.k_old_sf && !s.k_a_acc
	 && s.prev && s.prev.bar_type) {	// before a bar
		unlksym(s)			// remove it
		return
	}

    var b = _bar(s),
	sn = s.ts_next		// start of next line

	b.wl = 0
	b.wr = 0
	b.ts_prev = s
	b.next = s.next
	b.ts_next = s.ts_next

	if (s.next)			// (must not be the end of the voice)
		s.next.prev = b
//	if (s.ts_next)
		s.ts_next.ts_prev = b
	s.next = s.ts_next = b
	b.shrink = sn.shrink
	sn.shrink = sn.wl + 10
	b.space = sn.space * .9 - 3
}

/* -- set the width and space of all symbols -- */
// this function is called once for the whole tune
// and once more for each new music line
function set_allsymwidth(first) {
    var	val, st, s_chs, stup, itup,
	s = tsfirst,
	s2 = s,
	xa = 0,
	xl = [],
	wr = [],
	maxx = xa,
	tim = s.time

	/* loop on all symbols */
	while (1) {
		itup = 0
		do {
			if ((s.a_gch || s.a_ly) && !s_chs)
				s_chs = s;
			self.set_width(s);
			st = s.st
			if (xl[st] == undefined)
				xl[st] = 0
			if (wr[st] == undefined)
				wr[st] = 0;
			if (s.prev && s.prev.st != st) {
				xl[st] = xl[s.prev.st]
				wr[st] = wr[s.prev.st]
			}
			val = xl[st] + wr[st] + s.wl
			if (val > maxx)
				maxx = val
			if (s.dur && s.dur != s.notes[0].dur)	// if in tuplet
				itup = 1
			s = s.ts_next
		} while (s && !s.seqst);

		// set the spaces of the time sequence
		s2.shrink = maxx - xa
		s2.space = s2.ts_prev ? set_space(s2, tim) : 0

		// adjust the spacing when after a spacer (y)
		if (s2.space == 0 && s2.ts_prev
		 && s2.ts_prev.type == C.SPACE && s2.ts_prev.seqst)
			s2.space = s2.ts_prev.space /= 2

		if (itup) {
			if (!first)
				break
			if (!stup)
				stup = s2
		} else if (stup && stup.v == s2.v) {
			set_sp_tup(stup, s2)
			stup = null
		}

		if (!s2.shrink) {
		    if (s2.type == C.CLEF
		     && !s2.ts_prev.bar_type) {
			delete s2.seqst;		/* no space */
			s2.time = tim
		    } else {
			s2.shrink = s2.wl		// cannot be null
			maxx += s2.wl
		    }
		}
		tim = s2.time
		if (!s)
			break

		// update the min left space per staff
		s = s2
		do {
			wr[s.st] = 0
			s = s.ts_next
		} while (!s.seqst)

		xa = maxx
		do {
			st = s2.st;
			xl[st] = xa
			if (s2.wr > wr[st])
				wr[st] = s2.wr
			s2 = s2.ts_next
		} while (!s2.seqst)
	}

	if (stup)
		set_sp_tup(stup, s2)

	// let the chord symbols at the same offset
	// and adjust the spacing due to the lyrics
	if (s_chs)
		set_w_chs(s_chs)
}

// insert a rest, this one replacing a sequence or a measure
function to_rest(so) {
    var	s = clone(so)

	s.prev.next = so.ts_prev = so.prev = s.ts_prev.ts_next = s
	s.next = s.ts_next = so
	so.seqst = false
	so.invis = so.play = true

	s.type = C.REST
// just keep nl and seqst
	delete s.in_tuplet
	delete s.tp
	delete s.a_dd
	delete s.a_gch
	delete s.sls
//fixme: what if chord / slur in notes / ... ?
/*fixme: should set many parameters for set_width*/
//	set_width(s)
	return s
}

/* -- set the repeat sequences / measures -- */
function set_repeat(s) {	// first note
    var	s2, s3, i, j, dur,
	n = s.repeat_n,
	k = s.repeat_k,
	st = s.st,
	v = s.v

	s.repeat_n = 0				// treated

	/* treat the sequence repeat */
	if (n < 0) {				/* number of notes / measures */
		n = -n;
		i = n				/* number of notes to repeat */
		for (s3 = s.prev; s3; s3 = s3.prev) {
			if (!s3.dur) {
				if (s3.type == C.BAR) {
					error(1, s3, "Bar in repeat sequence")
					return
				}
				continue
			}
			if (--i <= 0)
				break
		}
		if (!s3) {
			error(1, s, errs.not_enough_n)
			return
		}
		dur = s.time - s3.time;

		i = k * n		/* whole number of notes/rests to repeat */
		for (s2 = s; s2; s2 = s2.next) {
			if (!s2.dur) {
				if (s2.type == C.BAR) {
					error(1, s2, "Bar in repeat sequence")
					return
				}
				continue
			}
			if (--i <= 0)
				break
		}
		if (!s2
		 || !s2.next) {		/* should have some symbol */
			error(1, s, errs.not_enough_n)
			return
		}
		for (s2 = s.prev; s2 != s3; s2 = s2.prev) {
			if (s2.type == C.NOTE) {
				s2.beam_end = true
				break
			}
		}
		for (j = k; --j >= 0; ) {
			i = n			/* number of notes/rests */
			if (s.dur)
				i--;
			s2 = s.ts_next
			while (i > 0) {
				if (s2.st == st) {
					s2.invis = s2.play = true
					if (s2.seqst && s2.ts_next.seqst)
						s2.seqst = false
					if (s2.v == v
					 && s2.dur)
						i--
				}
				s2 = s2.ts_next
			}
			s = to_rest(s)
			s.dur = s.notes[0].dur = dur;
			s.rep_nb = -1;		// single repeat
			s.beam_st = true;
			self.set_width(s)
			s.head = C.SQUARE;
			for (s = s2; s; s = s.ts_next) {
				if (s.st == st
				 && s.v == v
				 && s.dur)
					break
			}
		}
		return
	}

	/* check the measure repeat */
	i = n				/* number of measures to repeat */
	for (s2 = s.prev.prev ; s2; s2 = s2.prev) {
		if (s2.type == C.BAR
		 || s2.time == tsfirst.time) {
			if (--i <= 0)
				break
		}
	}
	if (!s2) {
		error(1, s, errs.not_enough_m)
		return
	}

	dur = s.time - s2.time		/* repeat duration */

	if (n == 1)
		i = k			/* repeat number */
	else
		i = n			/* check only 2 measures */
	for (s2 = s; s2; s2 = s2.next) {
		if (s2.type == C.BAR) {
			if (--i <= 0)
				break
		}
	}
	if (!s2) {
		error(1, s, errs.not_enough_m)
		return
	}

	/* if many 'repeat 2 measures'
	 * insert a new %%repeat after the next bar */
	i = k				/* repeat number */
	if (n == 2 && i > 1) {
		s2 = s2.next
		if (!s2) {
			error(1, s, errs.not_enough_m)
			return
		}
		s2.repeat_n = n;
		s2.repeat_k = --i
	}

	/* replace */
	dur /= n
	if (n == 2) {			/* repeat 2 measures (once) */
		s3 = s
		for (s2 = s.ts_next; ; s2 = s2.ts_next) {
			if (s2.st != st)
				continue
			if (s2.type == C.BAR) {
				if (s2.v == v)
					break
				continue
			}
			s2.invis = s2.play = true
			if (s2.seqst && s2.ts_next.seqst)
				s2.seqst = false
		}
		s3 = to_rest(s3)
		s3.dur = s3.notes[0].dur = dur;
		s3.invis = true
		s2.bar_mrep = 2
		s3 = s2.next;
		for (s2 = s3.ts_next; ; s2 = s2.ts_next) {
			if (s2.st != st)
				continue
			if (s2.type == C.BAR) {
				if (s2.v == v)
					break
				continue
			}
			if (!s2.dur)
				continue
			s2.invis = s2.play = true
			if (s2.seqst && s2.ts_next.seqst)
				s2.seqst = false
		}
		s3 = to_rest(s3)
		s3.dur = s3.notes[0].dur = dur;
		s3.invis = true;
		self.set_width(s3)
		return
	}

	/* repeat 1 measure */
	s3 = s
	for (j = k; --j >= 0; ) {
		for (s2 = s3.ts_next; ; s2 = s2.ts_next) {
			if (s2.st != st)
				continue
			if (s2.type == C.BAR) {
				if (s2.v == v)
					break
				continue
			}
			if (!s2.dur)
				continue
			s2.invis = s2.play = true
			if (s2.seqst && s2.ts_next.seqst)
				s2.seqst = false
		}
		s3 = to_rest(s3)

		s3.dur = s3.notes[0].dur = dur;
		s3.beam_st = true
		if (k == 1) {
			s3.rep_nb = 1
			break
		}
		s3.rep_nb = k - j + 1;	// number to print above the repeat rest
		s3 = s2.next
	}
}

/* add a custos before the symbol of the next line */
function custos_add(s) {
	var	p_voice, new_s, i,
		s2 = s

	while (1) {
		if (s2.type == C.NOTE)
			break
		s2 = s2.next
		if (!s2)
			return
	}

	p_voice = s.p_v;
	p_voice.last_sym = s.prev;
//	if (!p_voice.last_sym)
//		p_voice.sym = null;
	p_voice.time = s.time;
	new_s = sym_add(p_voice, C.CUSTOS);
	new_s.next = s;
	s.prev = new_s;
	new_s.wl = 0			// (needed here for lktsym)
	new_s.wr = 4
	lktsym(new_s, s);

	new_s.shrink = s.shrink
	if (new_s.shrink < 8 + 4)
		new_s.shrink = 8 + 4;
	new_s.space = s2.space;

	new_s.head = C.FULL
	new_s.stem = s2.stem
	new_s.nhd = s2.nhd;
	new_s.notes = []
	for (i = 0; i < s2.notes.length; i++) {
		new_s.notes[i] = {
			pit: s2.notes[i].pit,
			shhd: 0,
			dur: C.BLEN / 4
		}
	}
	new_s.stemless = true
}

/* -- define the beginning of a new music line -- */
function set_nl(s) {			// s = start of line
    var	p_voice, done, tim, ptyp

	// divide the left repeat (|:) or variant bars (|1)
	// the new bars go in the next line
	function bardiv(so) {		// start of next line
	    var s, s1, s2, t1, t2, i

	    function new_type(s) {
	    var	t = s.bar_type.match(/(:*)([^:]*)(:*)/)
			// [1] = starting ':'s, [2] = middle, [3] = ending ':'s

		if (!t[3]) {		// if start of variant
			// |1 -> | [1
			// :|]1 -> :|] [1
			t1 = t[1] + t[2]
			t2 = '['
		} else if (!t[1]) {	// if left repeat only
			// x|: -> || [|:
			t1 = '||'
			t2 = '[|' + t[3]
		} else {
			// :][: -> :|] [|:
			i = (t[2].length / 2) | 0
			t1 = t[1] + '|' + t[2].slice(0, i)
			t2 = t[2].slice(i) +'|' + t[3]
		}
	    } // new_typ()

		// change or add a bar for the voice in the previous line
		function eol_bar(s,		// bar |:
				 so,		// start of new line
				 sst) {		// first bar (for seqst)
		    var	s1, s2, s3

			// check if a bar in the previous line
			for (s1 = so.ts_prev ; s1.time == s.time; s1 = s1.ts_prev) {
				if (s1.v != s.v)
					continue
				if (s1.bar_type) {
					if (s1.bar_type != '|')
						return	// don't change
					s2 = s1		// last symbol in previous line
					break
				}
				if (!s3)
					s3 = s1.next	// possible anchor for the new bar
			}
			if (!s2) {			// if no symbol in previous line
				s2 = clone(s)
				if (!s3)
					s3 = s
				s2.next = s3
				s2.prev = s3.prev
				if (s2.prev)
					s2.prev.next = s2
				s3.prev = s2
				s2.ts_prev = so.ts_prev	// time linkage
				s2.ts_prev.ts_next = s2
				s2.ts_next = so
				so.ts_prev = s2
				if (s == sst)		// if first inserted bar
					s2.seqst = 1 //true
				if (s2.seqst) {
					for (s = s2.ts_next; !s.seqst; s = s.ts_next)
						;
					s2.shrink = s.shrink
					s.shrink = s2.wr + s.wl
					s2.space = s.space
					s.space = 0
				}
				delete s2.part
			}
			s2.bar_type = "||"
		} // eol_bar()

		// check if there is a left repeat bar at start of the new line
		s = so				// start of new music line
		while (s && s.time == so.time) {
			if (s.bar_type && s.bar_type.slice(-1) == ':') {
				s2 = s
				break
			}
			s = s.ts_next
		}
		if (s2) {
			s = s2
			while (1) {		// loop on all voices
				eol_bar(s2, so, s)
				s2 = s2.ts_next
				if (!s2 || s2.seqst)
					break
			}
			return so
		}

		s = so
		while (s.ts_prev
		 && s.ts_prev.time == so.time) {
			s = s.ts_prev
			if (s.bar_type)
				s1 = s		// first previous bar
			else if (!s1 && s.type == C.GRACE && s.seqst)
				so = s		// if grace note after a bar
						// move the start of line
		}
		if (!s1
		 || !s1.bar_type
		 || (s1.bar_type.slice(-1) != ':'
		  && !s1.text))
			return so

		// search the new start of the next line
		for (so = s1; so.time == s1.time; so = so.ts_prev) {
			switch (so.ts_prev.type) {
			case C.KEY:
			case C.METER:
//			case C.PART:
			case C.TEMPO:
			case C.STAVES:
			case C.STBRK:
				continue
			}
			break
		}

		// put the new bar before the end of music line
		s = s1				// keep first bar
		while (1) {
			new_type(s1)
			s2 = clone(s1)
			s2.bar_type = t1
			s1.bar_type = t2
			s2.ts_prev = so.ts_prev
			s2.ts_prev.ts_next = s2
			s2.ts_next = so
			so.ts_prev = s2
			if (s1 == s)
				s2.seqst = 1 //true
			s2.next = s1
			if (s2.prev)
				s2.prev.next = s2
			s1.prev = s2
			if (s1.rbstop)
				s2.rbstop = s1.rbstop
			if (s1.text) {
				s1.invis = 1 //true
				delete s1.xsh
				delete s2.text
				delete s2.rbstart
			}
			delete s2.part
			delete s1.a_dd
			delete s1.a_gch
			do {
				s1 = s1.ts_next
			} while (!s1.seqst && !s1.bar_type)
			if (s1.seqst)
				break
		}
		return so
	} // bardiv()

	// set the start of line marker
	function set_eol(s) {
		if (cfmt.custos && voice_tb.length == 1)
			custos_add(s)
		s.nl = true
		s = s.ts_prev
		if (s.type != C.BAR)
			add_end_bar(s)
	} // set_eol()

	// put the warning symbols
	// the new symbols go in the previous line
	function do_warn(s) {		// start of next line
	    var s1, s2, s3, s4, w

		// advance in the next line
		for (s2 = s; s2 && s2.time == s.time; s2 = s2.ts_next) {
			switch (s2.type) {
			case C.KEY:
				if (!s2.fmt.keywarn
				 || s2.invis)
					continue
				for (s1 = s.ts_prev; s1 ;s1 = s1.ts_prev) {
					if (s1.type != C.METER)
						break
				}
				// fall thru
			case C.METER:
				if (s2.type == C.METER) {
					if (!s.fmt.timewarn)
						continue
					s1 = s.ts_prev
				}
				// fall thru
			case C.CLEF:
				if (!s2.prev)		// start of voice
					continue
				if (s2.type == C.CLEF) {
					if (s2.clef_none) // if 'K: clef=none' after bar
						break
					for (s1 = s.ts_prev; s1; s1 = s1.ts_prev) {
						switch (s1.type) {
						case C.BAR:
							if (s1.bar_type[0] == ':')
								break
							// fall thru
						case C.KEY:
						case C.METER:
							continue
						}
						break
					}
				}

				// put the warning symbol at end of line
				s3 = clone(s2)		// duplicate the K:/M:/clef

				lktsym(s3, s1.ts_next)	// time link

				s1 = s3
				while (1) {
					s1 = s1.ts_next
					if (s1.v == s2.v)
						break
				}
				lkvsym(s3, s1)		// voice link

				// care with spacing
				if (s3.seqst) {
					self.set_width(s3)
					s3.shrink = s3.wl
					s4 = s3.ts_prev
					w = 0
					while (1) {
						if (s4.wr > w)
							w = s4.wr
						if (s4.seqst)
							break
						s4 = s4.ts_prev
					}
					s3.shrink += w
					s3.space = 0
					s4 = s3
					while (1) {
						if (s4.ts_next.seqst)
							break
						s4 = s4.ts_next
					}
					w = 0
					while (1) {
						if (s4.wl > w)
							w = s4.wl
						s4 = s4.ts_next
						if (s4.seqst)
							break
					}
					s4.shrink = s3.wr + w
				}
				delete s3.part
				continue
			}
			if (w_tb[s2.type])
				break		// symbol with a width
		}
	} // do_warn()

	// divide the left repeat and variant bars
	s = bardiv(s)

	// add the warning symbols at the end of the previous line
	do_warn(s)

	/* if normal symbol, cut here */
	if (s.ts_prev.type != C.STAVES) {
		set_eol(s)
		return s
	}

	/* go back to handle the staff breaks at end of line */
	for (s = s.ts_prev; s; s = s.ts_prev) {
		if (s.seqst && s.type != C.CLEF)
			break
	}
	done = 0
	ptyp = s.type
	for ( ; ; s = s.ts_next) {
		if (!s)
			return s
		if (s.type == ptyp)
			continue
		ptyp = s.type
		if (done < 0)
			break
		switch (s.type) {
		case C.STAVES:
			if (!s.ts_prev)
				return // null		// no music yet
			if (s.ts_prev.type == C.BAR)
				break
			while (s.ts_next) {
				if (w_tb[s.ts_next.type]
				 && s.ts_next.type != C.CLEF)
					break
				s = s.ts_next
			}
			if (!s.ts_next || s.ts_next.type != C.BAR)
				continue
			s = s.ts_next
			// fall thru
		case C.BAR:
			if (done)
				break
			done = 1;
			continue
		case C.STBRK:
			if (!s.stbrk_forced)
				unlksym(s)	/* remove */
			else
				done = -1	// keep the next symbols on the next line
			continue
		case C.CLEF:
			if (done)
				break
			continue
		default:
			if (!done || (s.prev && s.prev.type == C.GRACE))
				continue
			break
		}
		break
	}
	set_eol(s)
	return s
}

/* get the width of the starting clef and key signature */
// return
//	r[0] = width of clef and key signature
//	r[1] = width of the meter
function get_ck_width() {
    var	r0, r1,
	p_voice = voice_tb[0]

	self.set_width(p_voice.clef);
	self.set_width(p_voice.ckey);
	self.set_width(p_voice.meter)
	return [p_voice.clef.wl + p_voice.clef.wr +
			p_voice.ckey.wl + p_voice.ckey.wr,
		p_voice.meter.wl + p_voice.meter.wr]
}

// get the width of the symbols up to the next soln or eof
// also, set a x (nice spacing) to all symbols
// two returned values: width of nice spacing, width with max shrinking
function get_width(s, next) {
    var	shrink, space,
	w = 0,
	wmx = 0,
	sp_fac = (1 - s.fmt.maxshrink)

	while (s != next) {
		if (s.seqst) {
			shrink = s.shrink
			wmx += shrink
			if ((space = s.space) < shrink)
				w += shrink
			else
				w += shrink * s.fmt.maxshrink
					+ space * sp_fac
			s.x = w
		}
		s = s.ts_next
	}
	if (next)
		wmx += next.wr		// big key signatures may be wide enough
	return [w, wmx]
}

/* -- search where to cut the lines according to the staff width -- */
function set_lines(	s,		/* first symbol */
			next,		/* symbol of the next line / null */
			lwidth,		/* w - (clef & key sig) */
			indent) {	/* for start of tune */
    var	first, s2, s3, s4, s5, x, xmin, xmid, xmax, wwidth, shrink, space,
	nlines,
	last = next ? next.ts_prev : null,
	ws = get_width(s, next)		// 2 widths: nice and shrunk

	// split a big lyric word on two music lines
	function ly_split(s, wmax) {
	    var	i, wh,
		s2 = clone(s),
		p = s.a_ly[0].t,		// lyric word
		w = 0,
		j = 0

		gene.deffont = s.a_ly[0].font
		while (1) {
			i = p.indexOf(' ', j) + 1
			if (i <= 0)
				break
			wh = strwh(p.slice(j, i))
			w += wh[0]
			if (w > wmax)
				break
			j = i
		}
		s.a_ly[0].t = new String(p.slice(0, j - 1))
		s2.a_ly = clone(s.a_ly)
		s2.a_ly[0] = clone(s.a_ly[0])
		s2.a_ly[0].t = new String(p.slice(j))
		if (abc2svg.el) {
			strwh(s.a_ly[0].t)
			strwh(s2.a_ly[0].t)
		} else {
			s.a_ly[0].t.wh = strwh(s.a_ly[0].t)
			s2.a_ly[0].t.wh = strwh(s2.a_ly[0].t)
		}
		w = s.a_ly[0].t.wh[0]		// new length of the words
		s.wr = wmax
		s2.wr -= w

		lkvsym(s2, s2.next)		// voice linkage

		s2.time += .1
//		s2.dur -= .1
		s2.nl = 0 //false
		while (!s.seqst)
			s = s.ts_prev
		s2.x = s.x + w
		s2.shrink = w - s2.wl
		s = s2.ts_next
		while (s) {
			if (s.seqst) {
				s.wl -= w
				s.shrink -= w
				break
			}
			s = s.ts_next
		}
		lktsym(s2, s2.ts_next)		// time linkage
	} // ly_split()

	// -- set_lines --

	// take care of big key signatures at end of line
	if (s.fmt.keywarn && next
	 && next.type == C.KEY && !last.dur) {
		ws[0] += next.wr
		ws[1] += next.wr
	}

	// check if the symbols can enter in one line (with max shrink)
	if (ws[1] + indent < lwidth) {
		if (next)
			next = set_nl(next)
		return next || last
	}

	/* loop on cutting the tune into music lines */
	wwidth = ws[0] + indent
	while (1) {
		nlines = Math.ceil(wwidth / lwidth)
		if (nlines <= 1) {
			if (next)
				next = set_nl(next)
			return next || last
		}

		s2 = first = s;
		xmin = s.x
		xmax = xmin + lwidth;
		xmid = xmin + wwidth / nlines;
		xmin += wwidth / nlines * s.fmt.breaklimit;
		for (s = s.ts_next; s != next ; s = s.ts_next) {
			if (!s.x)
				continue
			if (s.type == C.BAR)
				s2 = s
			if (s.x >= xmin)
				break
		}
		s4 = s			// keep first symbol with x greater than xmin
//fixme: can this occur?
		if (s == next) {
			if (s)
				s = set_nl(s)
			return s
		}

		// if the width of the symbol is greater than
		//			 the remaining width in the staff
		// and if there are lyrics, split these lyrics on 2 staves
	    if (s.x > xmax
	     && s.prev.a_ly) {
		s3 = s = s.prev
		while (!s3.seqst)
			s3 = s3.ts_prev
		ly_split(s, xmax - s3.x)
	    } else {

		/* try to cut on a measure bar */
		s3 = null
		for ( ; s != next; s = s.ts_next) {
			x = s.x
			if (!x)
				continue
			if (x > xmax)
				break
			if (s.type != C.BAR)
				continue

			// cut on the bar closest to the middle
			if (x < xmid) {
				s3 = s		// closest bar before middle
				continue
			}
			if (!s3 || x - xmid < xmid - s3.x)
				s3 = s		// closest bar after middle
			break
		}

		// no bar, try to avoid to cut a beam or a tuplet */
		if (!s3) {
			s = s4			// restart after xmin

		    var	beam = 0,
			bar_time = s2.time

			xmax -= 8; // (left width of the inserted bar in set_allsymwidth)
			s5 = s
			for ( ; s != next; s = s.ts_next) {
				if (s.seqst) {
					x = s.x
					if (x + s.wr >= xmax)
						break
					if (!beam && !s.in_tuplet
					 && (xmid - s5.x > x - xmid
					  || (s.time - bar_time)
							% (C.BLEN / 4) == 0))
						s3 = s
				}
				if (s.beam_st)
					beam |= 1 << s.v
				if (s.beam_end)
					beam &= ~(1 << s.v)
				s5 = s		// start of new time sequence
			}
			if (s3) {
				do {		// cut on the previous sequence
					s3 = s3.ts_prev
				} while (!s3.seqst)
			}
		}

		// cut anyhere
		if (!s3) {
			s3 = s = s4
			for ( ; s != next; s = s.ts_next) {
				x = s.x
				if (!x)
					continue
				if (x + s.wr >= xmax)
					break
				if (s3 && x >= xmid) {
					if (xmid - s3.x > x - xmid)
						s3 = s
					break
				}
				s3 = s
			}
		}
		s = s3
	    } // ly_split call
		while (s.ts_next) {
			s = s.ts_next
			if (s.seqst)
				break
		}

		if (s.nl) {		/* already set here - advance */
			error(0, s,
			    "Line split problem - adjust maxshrink and/or breaklimit");
			nlines = 2
			for (s = s.ts_next; s != next; s = s.ts_next) {
				if (!s.x)
					continue
				if (--nlines <= 0)
					break
			}
		}
		s = set_nl(s)
		if (!s
		 || (next && s.time >= next.time))
			break
		wwidth -= s.x - first.x;
		indent = 0
	}
	return s
}

/* -- cut the tune into music lines -- */
function cut_tune(lwidth, lsh) {
    var	s2, i, mc,
	pg_sav = {			// save the page parameters
		leftmargin: cfmt.leftmargin,
		rightmargin: cfmt.rightmargin,
		pagewidth: cfmt.pagewidth,
		scale: cfmt.scale
	},
	indent = lsh[1] - lsh[2],	// extra width of the first line
	ckw = get_ck_width(),		// width of the starting symbols
	s = tsfirst

	lwidth -= lsh[2]		// width of the lines
	if (cfmt.indent && cfmt.indent > lsh[1])
		indent += cfmt.indent

	// adjust the line width according to the starting symbols
	lwidth -= ckw[0]
	indent += ckw[1]

	if (cfmt.custos && voice_tb.length == 1)
		lwidth -= 12

	/* if asked, count the measures and set the EOLNs */
	i = s.fmt.barsperstaff
	if (i) {
		for (s2 = s; s2; s2 = s2.ts_next) {
			if (s2.type != C.BAR
			 || !s2.bar_num
			 || --i > 0)
				continue
			while (s2.ts_next && s2.ts_next.type == C.BAR)
				s2 = s2.ts_next
			if (s2.ts_next)
				s2.ts_next.soln = true
			i = s.fmt.barsperstaff
		}
	}

	/* cut at explicit end of line, checking the line width */
	s2 = s
	for ( ; s; s = s.ts_next) {
		if (s.type == C.BLOCK) {
			switch (s.subtype) {
			case "leftmargin":
			case "rightmargin":
			case "pagescale":
			case "pagewidth":
			case "scale":
			case "staffwidth":
				if (!s.soln)
					self.set_format(s.subtype, s.param)
				break
			case "mc_start":
				mc = {
					lm: cfmt.leftmargin,
					rm: cfmt.rightmargin
				}
				break
			case "mc_new":
			case "mc_end":
				if (!mc)
					break
				cfmt.leftmargin = mc.lm
				cfmt.rightmargin = mc.rm
				img.chg = 1 //true
				break
			}
		}
		if (!s.ts_next) {
			s = null
		} else if (!s.soln) {
			continue
		} else {
			s.soln = false
//fixme what if new line wanted?
			if (s.time == s2.time)
				continue	// empty music line!
			while (!s.seqst)
				s = s.ts_prev
		}
		set_page()
		lwidth = get_lwidth() - lsh[1] - ckw[0]
		s2 = set_lines(s2, s, lwidth, indent)
		if (!s2)
			break

		s = s2.type == C.BLOCK
			? s2.ts_prev		// don't miss a parameter
			: s
		indent = 0
	}

	// restore the page parameters at start of line
	cfmt.leftmargin = pg_sav.leftmargin
	cfmt.rightmargin = pg_sav.rightmargin
	cfmt.pagewidth = pg_sav.pagewidth
	cfmt.scale = pg_sav.scale
	img.chg = 1
	set_page()
}

/* -- set the y values of some symbols -- */
function set_yval(s) {
//fixme: staff_tb is not yet defined
//	var top = staff_tb[s.st].topbar
//	var bot = staff_tb[s.st].botbar
	switch (s.type) {
	case C.CLEF:
		s.y = (s.clef_line - 1) * 6
		if (s.second
		 || s.invis) {
//			s.ymx = s.ymn = (top + bot) / 2
			s.ymx = s.ymn = 12
			break
		}
		switch (s.clef_type) {
		default:			/* treble / perc */
			s.ymx = s.y + 25
			s.ymn = s.y - 14
			break
		case "c":
			s.ymx = s.y + 12
			s.ymn = s.y - 11
			break
		case "b":
			s.ymx = s.y + 4
			s.ymn = s.y - 11//12
			break
		}
		if (s.clef_small) {
			s.ymx -= 3
			s.ymn += 2
		}
		if (s.ymx < 24)
			s.ymx = 24
//		if (s.ymn > -1)
//			s.ymn = -1
		if (s.ymn > 0)
			s.ymn = 0
//		s.y += s.clef_line * 6
//		if (s.y > 0)
//			s.ymx += s.y
//		else if (s.y < 0)
//			s.ymn += s.y
		if (s.clef_octave) {
			if (s.clef_octave > 0)
				s.ymx += 4
			else
				s.ymn -= 4
		}
		break
	case C.KEY:
		if (s.k_sf > 2)
			s.ymx = 24 + 10
		else if (s.k_sf > 0)
			s.ymx = 24 + 6
		else
			s.ymx = 24 + 2;
		s.ymn = -2
		break
	default:
//		s.ymx = top;
		s.ymx = 24;
		s.ymn = 0
		break
	}
}

// set the pitch of the notes under an ottava sequence
function set_ottava() {
    var	s, s1, st, o, d,
	m = nstaff + 1,
	staff_d = new Int8Array(m)

	// update the pitches of a symbol
	function sym_ott(s, d) {
	    var	g, m, note

		switch (s.type) {
		case C.REST:
			if (voice_tb.length == 1)
				break
		case C.NOTE:
			if (!s.p_v.ckey.k_drum) {
				for (m = s.nhd; m >= 0; m--) {
					note = s.notes[m];
					if (!note.opit)
						note.opit = note.pit;
					note.pit += d
				}
			}
			break
		case C.GRACE:
			for (g = s.extra; g; g = g.next) {
				if (!s.p_v.ckey.k_drum) {
					for (m = 0; m <= g.nhd; m++) {
						note = g.notes[m]
						if (!note.opit)
							note.opit = note.pit
						note.pit += d
					}
				}
			}
			break
		}
	} // sym_ott()

	// remove the ottava decorations of a symbol
	function deco_rm(s) {
		for (var i = s.a_dd.length; --i >= 0;) {
			if (s.a_dd[i].name.match(/1?[85][vm][ab]/))
				s.a_dd.splice(i, 1)
		}
	} // deco_rm()

	for (s = tsfirst; s; s = s.ts_next) {
		st = s.st
		o = s.ottava
		if (o) {				// some ottava start or stop
			if (o[0]) {
				if (staff_d[st] && !o[1]) {
					sym_ott(s, staff_d[st])
					deco_rm(s)
					continue	// same ottava
				}
			} else if (!staff_d[st]) {
				deco_rm(s)
				continue		// already no ottava
			}
			s1 = s
			while (s1 && !s1.seqst)
				s1 = s1.ts_prev
			if (s1) {			// update the previous symbols
				while (s1 != s) {
					if (s1.st == st) {
						if (o[1])
							sym_ott(s1, -staff_d[st])
						if (o[0])
							sym_ott(s1, -o[0] * 7)
					}
					s1 = s1.ts_next
				}
			}
			if (o[0]) {			// ottava start
				staff_d[st] = -o[0] * 7
			} else {
				staff_d[st] = 0
			}
		}
		if (staff_d[st])
			sym_ott(s, staff_d[st])
	}
}

// expand the multi-rests as needed
function mrest_expand() {
    var	s, s2

	// expand a multi-rest into a set of rest + bar
	function mexp(s) {
	    var	bar, s3, s4, tim, nbar,
		nb = s.nmes,
		dur = s.dur / nb,
		s2 = s.next

		// get the bar (there may be some other symbols before the bar)
		while (s2 && !s2.bar_type)
			s2 = s2.next
		if (!s2)
			return error(1, s, "Lack of bar after multi-measure rest")
		bar = s2
		while (!s2.bar_num)		// get the bar number
			s2 = s2.ts_prev
		nbar = s2.bar_num - s.nmes

		// change the multi-rest into a single rest
		s.type = C.REST
		s.notes[0].dur = s.dur = s.dur_orig = dur
		s.nflags = -2
		s.head = C.FULL
		s.fmr = 1			// full measure rest

		/* add the bar(s) and rest(s) */
		tim = s.time + dur
		s3 = s
		while (--nb > 0) {

			// add the bar
			s2 = clone(bar)
			delete s2.soln
			delete s2.a_gch
			delete s2.a_dd
			delete s2.text
			delete s2.rbstart
			delete s2.rbstop
			lkvsym(s2, s.next)	// before symbol at end of rests

			s2.time = tim
			while (s3.time < tim)
				s3 = s3.ts_next	// bar at end of measure
			if (s3.time == tim) {
				while (!s3.bar_type
				    && s3.ts_next && s3.ts_next.time == tim)
					s3 = s3.ts_next
			while (s3 && s3.v < s.v && s3.type == C.BAR)
				s3 = s3.ts_next	// keep in order
			}
			if (s3) {
				if (s3.bar_type)
					s3.seqst = 0 //false
				lktsym(s2, s3)
				if (s3.type == C.BAR)
					delete s3.bar_num
			} else {
				s3 = s
				while (s3.ts_next)
					s3 = s3.ts_next
				s3.ts_next = s2
				s2.ts_prev = s3
				s2.ts_next = null
			}
			nbar++
			if (s2.seqst) {
				s2.bar_num = nbar
				s4 = s2.ts_next
			} else {
				delete s2.bar_num
				s4 = s2.ts_prev
			}
			s2.bar_type = '|'
			if (s4.bar_num && !s4.seqst)
				delete s4.bar_num

			// add the rest
			s4 = clone(s)
			delete s4.a_dd
			delete s4.soln
			delete s4.a_gch
			delete s4.part
			lkvsym(s4, s.next)	// before symbol after mrest
			s4.time = tim

			while (s3 && !s3.dur && s3.time == tim)
				s3 = s3.ts_next
			while (s3 && s3.time == tim && s3.v < s.v) {
				s3 = s3.ts_next	// keep in order
				if (s3 && s3.seqst)
					break
			}
			if (s3) {
				if (s3.dur)
					s3.seqst = 0 //false
				lktsym(s4, s3)
			} else {
				s3 = s
				while (s3.ts_next)
					s3 = s3.ts_next
				s3.ts_next = s4
				s4.ts_prev = s3
				s4.ts_next = null
			}

			tim += dur
			s = s3 = s4
		}
	} // mexp()

	for (s = tsfirst; s; s = s.ts_next) {
		if (s.type != C.MREST)
			continue
		if (!s.seqst && w_tb[s.ts_prev.type]) {
			s2 = s
		} else {
			s2 = s.ts_next
			while (!s2.seqst) {
				if (s2.type != C.MREST
				 || s2.nmes != s.nmes)
					break
				s2 = s2.ts_next
			}
		}
		if (!s2.seqst) {
			while (s.type == C.MREST) {
				mexp(s)
				s = s.ts_next
			}
		} else {
			s = s2.ts_prev
		}
	}
} // mrest_expand()

// set the clefs (treble or bass) in a 'auto clef' sequence
// return the starting clef type
function set_auto_clef(st, s_start, clef_type_start) {
    var	s, time, s2, s3,
	max = 14,				// "A,"
	min = 18				// "E"

	/* get the max and min pitches in the sequence */
	for (s = s_start; s; s = s.ts_next) {
		if (s.type == C.STAVES && s != s_start)
			break
		if (s.st != st)
			continue
		if (s.type != C.NOTE) {
			if (s.type == C.CLEF) {
				if (s.clef_type != 'a')
					break
				unlksym(s)
			}
			continue
		}
		if (s.notes[0].pit < min)
			min = s.notes[0].pit
		if (s.notes[s.nhd].pit > max)
			max = s.notes[s.nhd].pit
	}

	if (min >= 19					/* upper than 'F' */
	 || (min >= 13 && clef_type_start != 'b'))	/* or 'G,' */
		return 't'
	if (max <= 13					/* lower than 'G,' */
	 || (max <= 19 && clef_type_start != 't'))	/* or 'F' */
		return 'b'

	/* set clef changes */
	if (clef_type_start == 'a') {
		if ((max + min) / 2 >= 16)
			clef_type_start = 't'
		else
			clef_type_start = 'b'
	}
	var	clef_type = clef_type_start,
		s_last = s,
		s_last_chg = null
	for (s = s_start; s != s_last; s = s.ts_next) {
		if (s.type == C.STAVES && s != s_start)
			break
		if (s.st != st || s.type != C.NOTE)
			continue

		/* check if a clef change may occur */
		time = s.time
		if (clef_type == 't') {
			if (s.notes[0].pit > 12		/* F, */
			 || s.notes[s.nhd].pit > 20) {	/* G */
				if (s.notes[0].pit > 20
				 || s.notes[s.nhd].pit > 20)
					s_last_chg = s
				continue
			}
			s2 = s.ts_prev
			if (s2
			 && s2.time == time
			 && s2.st == st
			 && s2.type == C.NOTE
			 && s2.notes[0].pit >= 19)	/* F */
				continue
			s2 = s.ts_next
			if (s2
			 && s2.st == st
			 && s2.time == time
			 && s2.type == C.NOTE
			 && s2.notes[0].pit >= 19)	/* F */
				continue
		} else {
			if (s.notes[0].pit <= 12	/* F, */
			 || s.notes[s.nhd].pit < 20) {	/* G */
				if (s.notes[s.nhd].pit <= 12
				 || s.notes[0].pit <= 12)
					s_last_chg = s
				continue
			}
			s2 = s.ts_prev
			if (s2
			 && s2.time == time
			 && s2.st == st
			 && s2.type == C.NOTE
			 && s2.notes[0].pit <= 13)	/* G, */
				continue
			s2 = s.ts_next
			if (s2
			 && s2.st == st
			 && s2.time == time
			 && s2.type == C.NOTE
			 && s2.notes[0].pit <= 13)	/* G, */
				continue
		}

		/* if first change, change the starting clef */
		if (!s_last_chg) {
			clef_type = clef_type_start =
					clef_type == 't' ? 'b' : 't';
			s_last_chg = s
			continue
		}

		/* go backwards and search where to insert a clef change */
		s3 = s
		for (s2 = s.ts_prev; s2 != s_last_chg; s2 = s2.ts_prev) {
			if (s2.st != st)
				continue
			if (s2.type == C.BAR) {
				s3 = s2.bar_type[0] != ':' ? s2 : s2.next
				break
			}
			if (s2.type != C.NOTE)
				continue

			/* have a 2nd choice on beam start */
			if (s2.beam_st
			 && !s2.p_v.second)
				s3 = s2
		}

		/* no change possible if no insert point */
		if (s3.time == s_last_chg.time) {
			s_last_chg = s
			continue
		}
		s_last_chg = s;

		/* insert a clef change */
		clef_type = clef_type == 't' ? 'b' : 't';
		s2 = insert_clef(s3, clef_type, clef_type == "t" ? 2 : 4);
		s2.clef_auto = true
//		s3.prev.st = st
	}
	return clef_type_start
}

/* set the clefs */
/* this function is called once at start of tune generation */
/*
 * global variables:
 *	- staff_tb[st].clef = clefs at start of line (here, start of tune)
 *				(created here, updated on clef draw)
 *	- voice_tb[v].clef = clefs at end of generation
 *				(created on voice creation, updated here)
 */
function set_clefs() {
    var	s, s2, st, v, p_voice, g, new_type, new_line, p_staff, pit,
	staff_clef = new Array(nstaff + 1),	// st -> { clef, autoclef }
	sy = cur_sy,
	mid = []

	// create the staff table
	staff_tb = new Array(nstaff + 1)
	for (st = 0; st <= nstaff; st++) {
		staff_clef[st] = {
			autoclef: true
		}
		staff_tb[st] = {
			output: "",
			sc_out: ""
		}
	}

	for (st = 0; st <= sy.nstaff; st++)
		mid[st] = (sy.staves[st].stafflines.length - 1) * 3

	for (s = tsfirst; s; s = s.ts_next) {
		if (s.repeat_n)
			set_repeat(s)

		switch (s.type) {
		case C.STAVES:
			sy = s.sy			// new system
			for (st = 0; st <= nstaff; st++)
				staff_clef[st].autoclef = true
			for (v = 0; v < voice_tb.length; v++) {
				if (!sy.voices[v])
					continue
				p_voice = voice_tb[v];
				st = sy.voices[v].st
				if (!sy.voices[v].second) {
					sy.staves[st].staffnonote = p_voice.staffnonote
					if (p_voice.staffscale)
						sy.staves[st].staffscale = p_voice.staffscale
					if (sy.voices[v].sep)
						sy.staves[st].sep = sy.voices[v].sep
					if (sy.voices[v].maxsep)
						sy.staves[st].maxsep = sy.voices[v].maxsep
				}
				s2 = p_voice.clef
				if (!s2.clef_auto)
					staff_clef[st].autoclef = false
			}
			for (st = 0; st <= sy.nstaff; st++)
				mid[st] = (sy.staves[st].stafflines.length - 1) * 3
			for (v = 0; v < voice_tb.length; v++) {
				if (!sy.voices[v]
				 || sy.voices[v].second)	// main voices
					continue
				p_voice = voice_tb[v];
				st = sy.voices[v].st;
				s2 = p_voice.clef
				if (s2.clef_auto) {
//fixme: the staff may have other voices with explicit clefs...
//					if (!staff_clef[st].autoclef)
//						???
					new_type = set_auto_clef(st, s,
						staff_clef[st].clef ?
							staff_clef[st].clef.clef_type :
							'a');
					new_line = new_type == 't' ? 2 : 4
					set_yval(p_voice.clef)
				} else {
					new_type = s2.clef_type;
					new_line = s2.clef_line
				}
				if (!staff_clef[st].clef) {	// new staff
					if (s2.clef_auto) {
						if (s2.clef_type != 'a')
							p_voice.clef =
								clone(p_voice.clef);
						p_voice.clef.clef_type = new_type;
						p_voice.clef.clef_line = new_line
						set_yval(p_voice.clef)
					}
					staff_tb[st].clef =
						staff_clef[st].clef = p_voice.clef
					continue
				}
								// old staff
				if (new_type == staff_clef[st].clef.clef_type
				 && new_line == staff_clef[st].clef.clef_line)
					continue
				g = s.ts_prev
				while (g
				 && g.time == s.time
				 && (g.v != v || g.st != st))
					g = g.ts_prev
				if (!g || g.time != s.time) {
					g = s.ts_next
					while (g && (g.v != v || g.st != st))
						g = g.ts_next
					if (!g || g.time != s.time)
						g = s
				}
				if (g.type != C.CLEF) {
					g = insert_clef(g, new_type, new_line)
					if (s2.clef_auto)
						g.clef_auto = true
				}
				staff_clef[st].clef = p_voice.clef = g
			}
			continue
		default:
			s.mid = mid[s.st]
			continue
		case C.CLEF:
			break
		}

		if (s.clef_type == 'a') {
			s.clef_type = set_auto_clef(s.st,
						s.ts_next,
						staff_clef[s.st].clef.clef_type);
			s.clef_line = s.clef_type == 't' ? 2 : 4
			set_yval(s)
		}

		p_voice = s.p_v;
		p_voice.clef = s
		st = s.st
// may have been inserted on %%staves
//		if (s.clef_auto) {
//			unlksym(s)
//			continue
//		}

		if (staff_clef[st].clef) {
			if (s.clef_type == staff_clef[st].clef.clef_type
			 && s.clef_line == staff_clef[st].clef.clef_line) {
//				unlksym(s)
				continue
			}
		} else {

			// the voice moved to a new staff with a forced clef
			staff_tb[st].clef = s
		}
		staff_clef[st].clef = s
	}

	/* set a pitch to the symbols of voices with no note */
	sy = cur_sy
	for (v = 0; v < voice_tb.length; v++) {
		if (!sy.voices[v])
			continue
		s2 = voice_tb[v].sym
		if (!s2 || s2.notes[0].pit != 127)
			continue
		st = sy.voices[v].st
		switch (staff_tb[st].clef.clef_type) {
		default:
			pit = 22		/* 'B' */
			break
		case "c":
			pit = 16		/* 'C' */
			break
		case "b":
			pit = 10		/* 'D,' */
			break
		}
		for (s = s2; s; s = s.next)
			s.notes[0].pit = pit
	}
}

/* set the pitch of the notes according to the clefs
 * and set the vertical offset of the symbols */
/* this function is called at start of tune generation and
 * then, once per music line up to the old sequence */

var delta_tb = {
	t: 0 - 2 * 2,
	c: 6 - 3 * 2,
	b: 12 - 4 * 2,
	p: 0 - 3 * 2
}

/* upper and lower space needed by rests */
var rest_sp = [
	[18, 18],
	[12, 18],
	[12, 12],
	[10, 12],
	[10, 10],
	[10, 10],			/* crotchet */
	[8, 4],
	[9, 0],
	[9, 4],
	[6, 8]
]

// set the offsets of a rest
function roffs(s) {
	s.ymx = s.y + rest_sp[5 - s.nflags][0]
	s.ymn = s.y - rest_sp[5 - s.nflags][1]
} // roffs()

// (possible hook)
Abc.prototype.set_pitch = function(last_s) {
	var	s, s2, g, st, delta, pitch, note,
		dur = C.BLEN,
		m = nstaff + 1,
		staff_delta = new Int16Array(m * 2),	// delta clef
		sy = cur_sy

	// set the starting clefs of the staves
	for (st = 0; st <= nstaff; st++) {
		s = staff_tb[st].clef;
		staff_delta[st] = delta_tb[s.clef_type] + s.clef_line * 2
		if (s.clefpit)
			staff_delta[st] += s.clefpit
		if (cfmt.sound) {
			if (s.clef_octave && !s.clef_oct_transp)
				staff_delta[st] += s.clef_octave
		} else {
			if (s.clef_oct_transp)
				staff_delta[st] -= s.clef_octave
		}
	}

	for (s = tsfirst; s != last_s; s = s.ts_next) {
		st = s.st
		switch (s.type) {
		case C.CLEF:
			staff_delta[st] = delta_tb[s.clef_type] +
						s.clef_line * 2
			if (s.clefpit)
				staff_delta[st] += s.clefpit
			if (cfmt.sound) {
				if (s.clef_octave && !s.clef_oct_transp)
					staff_delta[st] += s.clef_octave
			} else {
				if (s.clef_oct_transp)
					staff_delta[st] -= s.clef_octave
			}
			set_yval(s)
			break
		case C.GRACE:
			for (g = s.extra; g; g = g.next) {
				delta = staff_delta[g.st]
				if (delta
				 && !s.p_v.ckey.k_drum) {
					for (m = 0; m <= g.nhd; m++) {
						note = g.notes[m];
						note.opit = note.pit
						note.pit += delta
					}
				}
				g.ymn = 3 * (g.notes[0].pit - 18) - 2;
				g.ymx = 3 * (g.notes[g.nhd].pit - 18) + 2
			}
			set_yval(s)
			break
		case C.KEY:
			s.k_y_clef = staff_delta[st] /* keep the y delta */
			/* fall thru */
		default:
			set_yval(s)
			break
		case C.MREST:
			if (s.invis)
				break
			s.y = 12;
			s.ymx = 24 + 15;
			s.ymn = -2
			break
		case C.REST:
			s.y = 12
			if (s.rep_nb > 1		// if measure repeat
			 || s.bar_mrep) {
				s.ymx = 38		// (24 + 14)
				s.ymn = 0
				break
			}
			roffs(s)
			// fall thru
		case C.NOTE:
			delta = staff_delta[st]
			if (delta
			 && !s.p_v.ckey.k_drum) {
				for (m = s.nhd; m >= 0; m--) {
					note = s.notes[m]
					note.opit = note.pit
					note.pit += delta
				}
			}
			if (s.dur < dur)
				dur = s.dur
			break
		}
	}
	if (!last_s)
		smallest_duration = dur
}

/* -- set the stem direction when multi-voices -- */
/* this function is called only once per tune */
// (possible hook)
Abc.prototype.set_stem_dir = function() {
	var	t, u, i, st, rvoice, v,
		v_st,			// voice -> staff 1 & 2
		st_v, vobj,		// staff -> (v, ymx, ymn)*
		v_st_tb,		// array of v_st
		st_v_tb = [],		// array of st_v
		s = tsfirst,
		sy = cur_sy,
		nst = sy.nstaff

	while (s) {
		for (st = 0; st <= nst; st++)
			st_v_tb[st] = []
		v_st_tb = []

		/* get the max/min offsets in the delta time */
/*fixme: the stem height is not calculated yet*/
		for (u = s; u; u = u.ts_next) {
			if (u.type == C.BAR)
				break;
			if (u.type == C.STAVES) {
				if (u != s)
					break
				sy = s.sy
				for (st = nst; st <= sy.nstaff; st++)
					st_v_tb[st] = []
				nst = sy.nstaff
				continue
			}
			if ((u.type != C.NOTE && u.type != C.REST)
			 || u.invis)
				continue
			st = u.st;
/*fixme:test*/
if (st > nst) {
	var msg = "*** fatal set_stem_dir(): bad staff number " + st +
			" max " + nst;
	error(2, null, msg);
	throw new Error(msg)
}
			v = u.v;
			v_st = v_st_tb[v]
			if (!v_st) {
				v_st = {
					st1: -1,
					st2: -1
				}
				v_st_tb[v] = v_st
			}
			if (v_st.st1 < 0) {
				v_st.st1 = st
			} else if (v_st.st1 != st) {
				if (st > v_st.st1) {
					if (st > v_st.st2)
						v_st.st2 = st
				} else {
					if (v_st.st1 > v_st.st2)
						v_st.st2 = v_st.st1;
					v_st.st1 = st
				}
			}
			st_v = st_v_tb[st];
			rvoice = sy.voices[v].range;
			for (i = st_v.length; --i >= 0; ) {
				vobj = st_v[i]
				if (vobj.v == rvoice)
					break
			}
			if (i < 0) {
				vobj = {
					v: rvoice,
					ymx: 0,
					ymn: 24
				}
				for (i = 0; i < st_v.length; i++) {
					if (rvoice < st_v[i].v) {
						st_v.splice(i, 0, vobj)
						break
					}
				}
				if (i == st_v.length)
					st_v.push(vobj)
			}

			if (u.type != C.NOTE)
				continue
			if (u.ymx > vobj.ymx)
				vobj.ymx = u.ymx
			if (u.ymn < vobj.ymn)
				vobj.ymn = u.ymn

			if (u.xstem) {
				if (u.ts_prev.st != st - 1
				 || u.ts_prev.type != C.NOTE) {
					error(1, s, "Bad !xstem!");
					u.xstem = false
/*fixme:nflags KO*/
				} else {
					u.ts_prev.multi = 1;
					u.multi = 1;
					u.stemless = true
				}
			}
		}

		for ( ; s != u; s = s.ts_next) {
			if (s.multi)
				continue
			switch (s.type) {
			default:
				continue
			case C.REST:
				// handle %%voicecombine 0
				if ((s.combine != undefined && s.combine < 0)
				 || !s.ts_next || s.ts_next.type != C.REST
				 || s.ts_next.st != s.st
				 || s.time != s.ts_next.time
				 || s.dur != s.ts_next.dur
				 || (s.a_dd && s.ts_next.a_dd)
				 || (s.a_gch && s.ts_next.a_gch)
				 || s.invis)
					break
				if (s.ts_next.a_dd)
					s.a_dd = s.ts_next.a_dd
				if (s.ts_next.a_gch)
					s.a_gch = s.ts_next.a_gch
				if (s.p_v.scale != 1
				 && s.ts_next.p_v.scale > s.p_v.scale)
				 	unlksym(s)
				else
					unlksym(s.ts_next)

				if ((!s.ts_prev.dur || s.ts_prev.time != s.time
				  || s.ts_prev.st != s.st)
				 && (s.ts_next.time != s.time
				  || s.ts_next.st != s.st))
					continue	// rest alone in the staff
				// fall thru
			case C.NOTE:
			case C.GRACE:
				break
			}

			st = s.st;
			v = s.v;
			v_st = v_st_tb[v];
			st_v = st_v_tb[st]
			if (v_st && v_st.st2 >= 0) {
				if (st == v_st.st1)
					s.multi = -1
				else if (st == v_st.st2)
					s.multi = 1
				continue
			}
			if (st_v.length <= 1) { /* voice alone on the staff */
//				if (s.multi)
//					continue
/*fixme:could be done in set_var()*/
				if (s.floating)
					s.multi = st == voice_tb[v].st ? -1 : 1
				continue
			}
			rvoice = sy.voices[v].range
			for (i = st_v.length; --i >= 0; ) {
				if (st_v[i].v == rvoice)
					break
			}
			if (i < 0)
				continue		/* voice ignored */
			if (i == st_v.length - 1) {
				s.multi = -1	/* last voice */
			} else {
				s.multi = 1	/* first voice(s) */

				/* if 3 voices, and vertical space enough,
				 * have stems down for the middle voice */
				if (i && i + 2 == st_v.length) {
					if (st_v[i].ymn - s.fmt.stemheight
							>= st_v[i + 1].ymx)
						s.multi = -1;

					/* special case for unison */
					t = s.ts_next
//fixme: pb with ../lacerda/evol-7.5.5.abc
					if (s.ts_prev
					 && s.ts_prev.time == s.time
					 && s.ts_prev.st == s.st
					 && s.notes[s.nhd].pit == s.ts_prev.notes[0].pit
					 && s.beam_st
					 && s.beam_end
					 && (!t
					  || t.st != s.st
					  || t.time != s.time))
						s.multi = -1
				}
			}
		}
		while (s && s.type == C.BAR)
			s = s.ts_next
	}
}

/* -- adjust the offset of the rests when many voices -- */
/* this function is called only once per tune */
function set_rest_offset() {
   var	s, s2, v, v_s, ymax, ymin, d,
		v_s_tb = [],
		sy = cur_sy

	// set a vertical offset on a line 
	function loffs(d) {
		return d > 0
			? Math.ceil(d / 6) * 6
			: -Math.ceil(-d / 6) * 6
	} // loffs()

	// shift a rest to the right
	function rshift() {
	    var	dx = s2.dots ? 15 : 10
		s2.notes[0].shhd = dx
		s2.xmx = dx
		d = (d + v_s.d) / 2
		d = loffs(d)
		s2.y += d
		s2.ymx += d
		s2.ymn += d
		v_s.d = 0
	} // rshift()

	// -- set_rest_off --
	for (s = tsfirst; s; s = s.ts_next) {
		if (s.invis)
			continue
		switch (s.type) {
		case C.STAVES:
			sy = s.sy
			// fall thru
		default:
			continue
		case C.REST:
			if (s.invis || !s.multi)
				continue
			v_s = v_s_tb[s.v]
			if (!v_s) {
				v_s_tb[s.v] = v_s = { d: 0}
			} else if (v_s.d) {
				s2 = v_s.s	// set the offsets of the previous rest
				d = loffs(v_s.d)
				s2.y += d
				s2.ymx += d
				s2.ymn += d
				v_s.d = 0
			}

			d = s.multi > 0 ? 0 : 24
				if (s.prev && s.prev.type == C.NOTE)
					d = (s.next && s.next.type == C.NOTE)
						? (s.prev.y + s.next.y) / 2
						: s.prev.y
				else if (s.next && s.next.type == C.NOTE)
					d = s.next.y
			else if (s.prev && s.prev.type == C.REST)
				d = s.prev.y
			if (s.multi > 0) {
				if (d >= 12)
					v_s.d = d - s.y
			} else {
				if (d <= 12)
					v_s.d = d - s.y
			}

			v_s.s = s
			v_s.st = s.st
			v_s.end_time = s.time + s.dur
			if (s.fmr)			// if full meeasure rest
				v_s.end_time -= s.p_v.wmeasure * .3
			if (s.seqst)
				continue
			s2 = s.ts_prev
			if (s2.st != s.st
			 || s2.invis)
				continue
			d = s2.ymn
			if (v_s_tb[s2.v] && v_s_tb[s2.v].d
			 && v_s_tb[s2.v] >= s.time)
				d += v_s_tb[s2.v].d
			if (s.ymx <= d)
				continue
			if (s2.type == C.NOTE) {
				v_s.d = d - s.ymx
				break
			}
			if (s2.type == C.REST
			 && s2.y < 18
			 && s.y >= 6)
				v_s.d = (d - s.ymx) / 2
			break
		case C.NOTE:
			if (s.invis || !s.multi)
				continue
			break
		}

		// check if any clash with a rest
		for (v = 0; v < v_s_tb.length; v++) {
			v_s = v_s_tb[v]
			if (!v_s
			 || v_s.st != s.st
			 || v == s.v
			 || v_s.end_time <= s.time)
				continue
			s2 = v_s.s				// rest
			if (sy.voices[v].range > sy.voices[s.v].range) {
				if (s2.ymx + v_s.d <= s.ymn)
					continue
				d = s.ymn - s2.ymx		// rest must go down
//				if (s2.time < s.time) {
					if (s.type == C.REST) {
						if (!v_s_tb[s.v])
							v_s_tb[s.v] = {d: 0}
						if (v_s_tb[s.v].d < 6)
							v_s_tb[s.v].d = 6
						d = -6
					} else {
						d /= 2
						if (s2.fmr)
							d -= 6
					}
//				}
				if (v_s.d) {
					if (v_s.d > 0) {	// if it was go up
						rshift()	// shift the rest
						continue
					}
					if (d >= v_s.d)
						continue
				}
			} else {
				if (s2.ymn + v_s.d >= s.ymx)
					continue
				d = s.ymx - s2.ymn		// rest must go up
				if (s.type == C.REST		// if rest
				 && s2 == s.ts_prev		// just under a rest
				 && s.y == s2.y) {		// at a same offset
					if (!v_s_tb[s.v])
						v_s_tb[s.v] = {d: 0}
					if (v_s_tb[s.v].d > -6)
						v_s_tb[s.v].d = -6
					d = 6
				} else if (s2.time < s.time) {
					d = s.ymx - s2.y
				}
				if (v_s.d) {
					if (v_s.d < 0) {	// if it was go down
						rshift()	// shift the rest
						continue
					}
					if (d <= v_s.d)
						continue
				}
			}
			v_s.d = d
		}
	}

	// update the offsets of the last rests
	for (v = 0; v < v_s_tb.length; v++) {
		v_s = v_s_tb[v]
		if (v_s && v_s.d) {
			s2 = v_s.s
			d = loffs(v_s.d)
			s2.y += d
			s2.ymx += d
			s2.ymn += d
		}
	}
}

/* -- create a starting symbol -- */
// last_s = symbol at same time
function new_sym(s, p_v, last_s) {
	s.p_v = p_v
	s.v = p_v.v
	s.st = p_v.st
	s.time = last_s.time

	if (p_v.last_sym) {
		s.next = p_v.last_sym.next
		if (s.next)
			s.next.prev = s;
		p_v.last_sym.next = s;
		s.prev = p_v.last_sym
	}
	p_v.last_sym = s;

	lktsym(s, last_s)
}

/* -- init the symbols at start of a music line -- */
function init_music_line() {
   var	p_voice, s, s1, s2, s3, last_s, v, st, shr, shrmx, shl,
	shlp, p_st, top,
	nv = voice_tb.length,
	fmt = tsfirst.fmt

	/* initialize the voices */
	for (v = 0; v < nv; v++) {
		if (!cur_sy.voices[v])
			continue
		p_voice = voice_tb[v];
		p_voice.st = cur_sy.voices[v].st
		p_voice.second = cur_sy.voices[v].second;
		p_voice.last_sym = p_voice.sym;

	// move the first clefs, key signatures and time signatures
	// to the staves
	   for (s = p_voice.sym; s && s.time == tsfirst.time; s = s.next) {
		switch (s.type) {
		case C.CLEF:
		case C.KEY:
		case C.METER:
			switch (s.type) {
			case C.CLEF:
				staff_tb[s.st].clef = s
				break
			case C.KEY:
				s.p_v.ckey = s
				break
			case C.METER:
				s.p_v.meter = s
				insert_meter = cfmt.writefields.indexOf('M') >= 0
					&& s.a_meter.length
				break
			}
			if (s.part)
				s.next.part = s.part
			unlksym(s)
			// fall thru
		case C.TEMPO:
		case C.BLOCK:
		case C.REMARK:
			continue
		}
		break
	    }
	}

	// generate the starting clefs, key signatures and time signatures

	// add a clef at start of the main voices
	last_s = tsfirst
	for (v = 0; v < nv; v++) {
		p_voice = voice_tb[v]
		if (!cur_sy.voices[v]
		 || (cur_sy.voices[v].second
		  && !p_voice.bar_start))	// needed for correct linkage
			continue
		st = cur_sy.voices[v].st
		if (!staff_tb[st]
		 || !staff_tb[st].clef)
			continue
		s = clone(staff_tb[st].clef);
		s.v = v;
		s.p_v = p_voice;
		s.st = st;
		s.time = tsfirst.time;
		s.prev = null;
		s.next = p_voice.sym
		if (s.next)
			s.next.prev = s;
		p_voice.sym = p_voice.last_sym = s
		s.ts_next = last_s;
		if (last_s)
			s.ts_prev = last_s.ts_prev
		else
			s.ts_prev = null
		if (!s.ts_prev) {
			tsfirst = s;
		} else {
			s.ts_prev.ts_next = s
			delete s.seqst
		}
		if (last_s)
			last_s.ts_prev = s
		delete s.clef_small;
		delete s.part
		s.second = cur_sy.voices[v].second
// (fixme: needed for sample5 X:3 Fugue & staffnonote.html)
		if (!cur_sy.st_print[st])
			s.invis = true
		else if (!s.clef_none)
			delete s.invis
		s.fmt = fmt
	}

	/* add keysig */
	for (v = 0; v < nv; v++) {
		if (!cur_sy.voices[v]
		 || cur_sy.voices[v].second
		 || !cur_sy.st_print[cur_sy.voices[v].st])
			continue
		p_voice = voice_tb[v]
		s2 = p_voice.ckey
		if (s2.k_sf || s2.k_a_acc) {
			s = clone(s2)
			new_sym(s, p_voice, last_s)
			delete s.invis
			delete s.part
			s.k_old_sf = s2.k_sf	// no key cancel
			s.fmt = fmt
		}
	}

	/* add time signature (meter) if needed */
	if (insert_meter) {
		for (v = 0; v < nv; v++) {
			p_voice = voice_tb[v];
			s2 = p_voice.meter
			if (!cur_sy.voices[v]
			 || cur_sy.voices[v].second
			 || !cur_sy.st_print[cur_sy.voices[v].st])
//			 || !s2.a_meter.length)
				continue
			s = clone(s2)
			new_sym(s, p_voice, last_s)
			delete s.part
			s.fmt = fmt
		}
		insert_meter = false		// no meter any more
	}

	// add an invisible bar for the various continued elements
	for (v = 0; v < nv; v++) {
		p_voice = voice_tb[v]
		if (p_voice.sls.length) {
			s = {
				type: C.BAR,
				fname: last_s.fname,
				bar_type: "|",
				dur: 0,
				multi: 0,
				invis: true,
				sls: p_voice.sls,
				fmt: fmt
			}
			new_sym(s, p_voice, last_s)
			p_voice.sls = []
		}
	}

	// add a bar for the continuation of repeat brackets
	for (v = 0; v < nv; v++) {
		p_voice = voice_tb[v];
		s2 = p_voice.bar_start;
		p_voice.bar_start = null

		// check if bracket stop at this time
		for (s = last_s; s && s.time == last_s.time; s = s.ts_next) {
			if (s.rbstop) {
				s2 = null
				break
			}
		}

		if (!s2)
			continue
		if (!cur_sy.voices[v]
		 || !cur_sy.st_print[cur_sy.voices[v].st])
			continue

		if (p_voice.last_sym.type == C.BAR) {
			if (!p_voice.last_sym.rbstop)
				p_voice.last_sym.rbstart = 1
		} else {
			new_sym(s2, p_voice, last_s)
			s2.fmt = fmt
		}
	}

	// compute the spacing of the added symbols
	self.set_pitch(last_s);

	s = tsfirst
	s.seqst = true

	for (s = last_s; s.ts_next && !s.ts_next.seqst; s = s.ts_next)
		;
	if (s.ts_next		// a bit further in case different keys per voice
	 && s.ts_next.type != C.CLEF	// (the clef may move in allsymwidth)
	 && !s.tp			// (start of a tuplet)
	 && !s.ts_next.a_ly)		// (don't update next .shrink)
		for (s = s.ts_next; s.ts_next && !s.ts_next.seqst; s = s.ts_next)
			;
	s2 = s.ts_next
	s.ts_next = null
	set_allsymwidth()
	s.ts_next = s2
} // init_music_line()

// check if the tune ends on a measure bar
function check_end_bar() {
    var	s2,
	s = tsfirst
	while (s.ts_next)
		s = s.ts_next
	if (s.type != C.BAR) {
		s2 = _bar(s)
		s2.ts_prev = s

		s.next = s.ts_next = s2
	}
} // check_end_bar()

/* -- set a pitch in all symbols and the start/stop of the beams -- */
// and sort the pitches in the chords
// and build the chord symbols / annotations
// this function is called only once per tune
function set_words(p_voice) {
	var	s, s2, nflags, lastnote, res,
		start_flag = true,
		pitch = 127			/* no note */

	// adjust the duration of the notes in a decoration !trem1..4!
	function trem_adj(s) {
		s.prev.trem2 = true
		s.prev.head = ++s.head
		if (--s.nflags > 0) {
			s.nflags += s.ntrem
		} else {
			if (s.nflags <= -2) {
				s.stemless = true
				s.prev.stemless = true
			}
			s.nflags = s.ntrem
		}
		s.prev.nflags = s.nflags
	} // trem_adj()

	for (s = p_voice.sym; s; s = s.next) {
		if (s.type == C.NOTE) {
			pitch = s.notes[0].pit
			break
		}
	}
	for (s = p_voice.sym; s; s = s.next) {
		if (s.a_gch)
			self.gch_build(s)
		switch (s.type) {
		case C.MREST:
			start_flag = true
			break
		case C.BAR:
			res = s.fmt.bardef[s.bar_type]
			if (res)
				s.bar_type = res
			if (!s.beam_on)
				start_flag = true
			if (!s.next && s.prev
			 && !s.invis
			 && s.prev.head == C.OVALBARS)
				s.prev.head = C.SQUARE
			break
		case C.GRACE:
			for (s2 = s.extra; s2; s2 = s2.next) {
				s2.notes.sort(abc2svg.pitcmp)
				res = identify_note(s2, s2.dur_orig)
				s2.head = res[0]
				s2.dots = res[1]
				s2.nflags = res[2]
				if (s2.trem2
				 && (!s2.next || s2.next.trem2))
					trem_adj(s2)
			}
			break
		case C.NOTE:
		case C.REST:
			res = identify_note(s, s.dur_orig);
			s.head = res[0];
			s.dots = res[1];
			s.nflags = res[2]
			if (s.nflags <= -2)
				s.stemless = true

			if (s.xstem)
				s.nflags = 0	// beam break
			if (s.trem1) {
				if (s.nflags > 0)
					s.nflags += s.ntrem
				else
					s.nflags = s.ntrem
			}
			if (s.next && s.next.trem2)
				break
			if (s.trem2) {
				trem_adj(s)
				break
			}

			nflags = s.nflags

			if (s.ntrem)
				nflags -= s.ntrem
			if (s.type == C.REST && s.beam_end
			 && !s.beam_on) {
//				s.beam_end = false;
				start_flag = true
			}
			if (start_flag
			 || nflags <= 0) {
				if (lastnote) {
					lastnote.beam_end = true;
					lastnote = null
				}
				if (nflags <= 0) {
					s.beam_st = s.beam_end = true
				} else if (s.type == C.NOTE || s.beam_on) {
					s.beam_st = true;
					start_flag = false
				}
			}
			if (s.beam_end)
				start_flag = true
			if (s.type == C.NOTE || s.beam_on)
				lastnote = s
			break
		}
		if (s.type == C.NOTE) {
			if (s.nhd)
				s.notes.sort(abc2svg.pitcmp)
			pitch = s.notes[0].pit
//			if (s.prev
//			 && s.prev.type != C.NOTE) {
//				s.prev.notes[0].pit = (s.prev.notes[0].pit
//						    + pitch) / 2
			for (s2 = s.prev; s2; s2 = s2.prev) {
				if (s2.type != C.REST)
					break
				s2.notes[0].pit = pitch
			}
		} else {
			if (!s.notes) {
				s.notes = []
				s.notes[0] = {}
				s.nhd = 0
			}
			s.notes[0].pit = pitch
		}
	}
	if (lastnote)
		lastnote.beam_end = true
}

/* -- set the end of the repeat sequences -- */
function set_rb(p_voice) {
    var	s2, n,
	s = p_voice.sym

	while (s) {
		if (s.type != C.BAR || !s.rbstart || s.norepbra) {
			s = s.next
			continue
		}
		n = 0;
		s2 = null
		for (s = s.next; s; s = s.next) {
			if (s.type != C.BAR)
				continue
			if (s.rbstop)
				break
			if (!s.next) {
				s.rbstop = 2	// right repeat with end
				break
			}
			n++
			if (n == s.fmt.rbmin)
				s2 = s
			if (n == s.fmt.rbmax) {
				if (s2)
					s = s2;
				s.rbstop = 1	// right repeat without end
				break
			}
		}
	}
}

/* -- initialize the generator -- */
// this function is called only once per tune

var delpit = [0, -7, -14, 0]

function set_global() {
    var	p_voice, v,
	nv = voice_tb.length,
	sy = cur_sy,
	st = sy.nstaff

	insert_meter = cfmt.writefields.indexOf('M') >= 0

	/* get the max number of staves */
	while (1) {
		sy = sy.next
		if (!sy)
			break
		if (sy.nstaff > st)
			st = sy.nstaff
	}
	nstaff = st;

	// there must be a bar at end of tune
	check_end_bar()

	/* set the pitches, the words (beams) and the repeat brackets */
	for (v = 0; v < nv; v++) {
		p_voice = voice_tb[v];
		set_words(p_voice)
		p_voice.ckey = p_voice.key	// starting key
// (test removed because v.second may change after %%staves)
//		if (!p_voice.second && !p_voice.norepbra)
			set_rb(p_voice)
	}

	/* set the staff of the floating voices */
	if (nv > 1) {
		set_float()

	// expand the multi-rests as needed
		if (glovar.mrest_p)
			mrest_expand()
	}

	if (glovar.ottava && cfmt.sound != "play")
		set_ottava();

	// set the clefs and adjust the pitches of all symbol
	set_clefs();
	self.set_pitch(null)
}

// get the left offsets of the first and other staff systems
// return left shift [no name, first music line, other lines
function get_lshift() {
    var	st, v, p_v, p1, po, fnt, w,
	sy = cur_sy,
	lsh = [0, 0, 0],
	nv = voice_tb.length

	// get the max width of a voice name/subname
	function get_wx(p, wx) {
	    var	w, j,
		i = 0

		p += '\n'
		while (1) {
			j = p.indexOf("\n", i)
			if (j < 0)
				break
			w = strwh(p.slice(i, j))[0] + 12
			if (w > wx)
				wx = w
			if (j < 0)
				break
			i = j + 1
		}
		return wx
	} // get_wx()

	for (v = 0; v < nv; v++) {
		p_v = voice_tb[v]
		p1 = p_v.nm
		po = p_v.snm
		if ((p1 || po) && !fnt) {
			set_font("voice")
			fnt = gene.deffont
		}
		if (p1) {
			w = get_wx(p1, lsh[1])
			if (w > lsh[1])
				lsh[1] = w
		}
		if (po) {
			w = get_wx(po, lsh[2])
			if (w > lsh[2])
				lsh[2] = w
		}
	}
	// add the width of the braces/brackets
	w = 0
	while (sy) {
		for (st = 0; st <= sy.nstaff; st++) {
			if (sy.staves[st].flags
					& (OPEN_BRACE2 | OPEN_BRACKET2)) {
				w = 12
				break
			}
			if (sy.staves[st].flags & (OPEN_BRACE | OPEN_BRACKET))
				w = 6
		}
		if (w == 12)
			break
		sy = sy.next
	}
	lsh[0] = w
	lsh[1] += w
	lsh[2] += w
	return lsh
} // get_lshift()

/* -- return the left indentation of the staves -- */
function set_indent(lsh) {
    var	st, v, w, p_voice, p, i, j, font,
	vnt = 0,
	fmt = tsnext ? tsnext.fmt : cfmt

	// name or subname?
	if (fmt.systvoices) {		// put the voice names in the staff system
	    for (v = voice_tb.length; --v >= 0; ) {
		p_voice = voice_tb[v]
		if (!cur_sy.voices[v]
		 || !gene.st_print[p_voice.st])
			continue
		if (p_voice.nm
		 && (fmt.systvoices == 1
		  || (p_voice.new_name && fmt.systvoices == 3))) {
			vnt = 1		// full name
			break
		}
		if (p_voice.snm)
			vnt = 2		// subname
	    }
	}
	gene.vnt = vnt			// voice name type for draw
	return lsh[vnt]
}

/* -- decide on beams and on stem directions -- */
/* this routine is called only once per tune */
function set_beams(sym) {
    var	s, t, g, beam, s_opp, n, m, mid_p, pu, pd,
	laststem = -1

	for (s = sym; s; s = s.next) {
		if (s.type != C.NOTE) {
			if (s.type != C.GRACE)
				continue
			g = s.extra
			if (g.stem == 2) {	/* opposite gstem direction */
				s_opp = s
				continue
			}
			if (!s.stem)
				s.stem = s.multi || 1
			for (; g; g = g.next) {
				g.stem = s.stem;
				g.multi = s.multi
			}
			continue
		}

		if (!s.stem && s.multi)
			s.stem = s.multi
		if (!s.stem) {			// if note alone on the staff
			mid_p = s.mid / 3 + 18

			/* notes in a beam have the same stem direction */
			if (beam) {
				s.stem = laststem
			} else if (s.beam_st && !s.beam_end) {	// beam start
				beam = true;

				// the stem direction is the one of the note
				// farthest from the middle line
						pu = s.notes[s.nhd].pit;
						pd = s.notes[0].pit
						for (g = s.next; g; g = g.next) {
							if (g.type != C.NOTE)
								continue
							if (g.stem || g.multi) // if forced direction
								s.stem = g.stem || g.multi
							if (g.notes[g.nhd].pit > pu)
								pu = g.notes[g.nhd].pit
							if (g.notes[0].pit < pd)
								pd = g.notes[0].pit
							if (g.beam_end)
								break
						}
					if (!s.stem && g.beam_end) {
							if (pu + pd < mid_p * 2) {
								s.stem = 1
							} else if (pu + pd > mid_p * 2) {
								s.stem = -1
							} else {
								if (s.fmt.bstemdown)
									s.stem = -1
							}
						}
				if (!s.stem)
					s.stem = laststem
			} else {				// no beam
				n = (s.notes[s.nhd].pit + s.notes[0].pit) / 2
				if (n == mid_p && s.nhd > 1) {
					for (m = 0; m < s.nhd; m++) {
						if (s.notes[m].pit >= mid_p)
							break
					}
					n = m * 2 < s.nhd ? mid_p - 1 : mid_p + 1
				}
				if (n < mid_p)
					s.stem = 1
				else if (n > mid_p || s.fmt.bstemdown)
					s.stem = -1
				else
					s.stem = laststem
			}
		} else {			/* stem set by set_stem_dir */
			if (s.beam_st && !s.beam_end)
				beam = true
		}
		if (s.beam_end)
			beam = false;
		laststem = s.stem;

		if (s_opp) {			/* opposite gstem direction */
			for (g = s_opp.extra; g; g = g.next)
				g.stem = -laststem;
			s_opp.stem = -laststem;
			s_opp = null
		}
	}
}

// check if there may be one head for unison when voice overlap
function same_head(s1, s2) {
    var	i1, i2, l1, l2, head, i11, i12, i21, i22, sh1, sh2,
	shu = s1.fmt.shiftunison || 0

	if (shu >= 3)
		return false
	if ((l1 = s1.dur) >= C.BLEN)
		return false
	if ((l2 = s2.dur) >= C.BLEN)
		return false
	if (s1.stemless && s2.stemless)
		return false
	if (s1.dots != s2.dots) {
		if (shu & 1
		 || s1.dots * s2.dots != 0)
			return false
	}
	if (s1.stem * s2.stem > 0)
		return false

	/* check if a common unison */
	i1 = i2 = 0
	if (s1.notes[0].pit > s2.notes[0].pit) {
//fixme:dots
		if (s1.stem < 0)
			return false
		while (s2.notes[i2].pit != s1.notes[0].pit) {
			if (++i2 > s2.nhd)
				return false
		}
	} else if (s1.notes[0].pit < s2.notes[0].pit) {
//fixme:dots
		if (s2.stem < 0)
			return false
		while (s2.notes[0].pit != s1.notes[i1].pit) {
			if (++i1 > s1.nhd)
				return false
		}
	}
	if (s2.notes[i2].acc != s1.notes[i1].acc)
		return false;
	i11 = i1;
	i21 = i2;
	sh1 = s1.notes[i1].shhd;
	sh2 = s2.notes[i2].shhd
	do {
//fixme:dots
		i1++;
		i2++
		if (i1 > s1.nhd) {
//fixme:dots
//			if (s1.notes[0].pit < s2.notes[0].pit)
//				return false
			break
		}
		if (i2 > s2.nhd) {
//fixme:dots
//			if (s1.notes[0].pit > s2.notes[0].pit)
//				return false
			break
		}
		if (s2.notes[i2].acc != s1.notes[i1].acc)
			return false
		if (sh1 < s1.notes[i1].shhd)
			sh1 = s1.notes[i1].shhd
		if (sh2 < s2.notes[i2].shhd)
			sh2 = s2.notes[i2].shhd
	} while (s2.notes[i2].pit == s1.notes[i1].pit)
//fixme:dots
	if (i1 <= s1.nhd) {
		if (i2 <= s2.nhd)
			return false
		if (s2.stem > 0)
			return false
	} else if (i2 <= s2.nhd) {
		if (s1.stem > 0)
			return false
	}
	i12 = i1;
	i22 = i2;

	head = 0
	if (l1 != l2) {
		if (l1 < l2) {
			l1 = l2;
			l2 = s1.dur
		}
		if (l1 < C.BLEN / 2) {
			if (s2.dots)
				head = 2
			else if (s1.dots)
				head = 1
		} else if (l2 < C.BLEN / 4) {	/* (l1 >= C.BLEN / 2) */
//			if (shu == 2)
//			 || s1.dots != s2.dots)
			if (shu & 2)
				return false
			head = s2.dur >= C.BLEN / 2 ? 2 : 1
		} else {
			return false
		}
	}
	if (!head)
		head = s1.p_v.scale < s2.p_v.scale ? 2 : 1
	if (head == 1) {
		for (i2 = i21; i2 < i22; i2++) {
			s2.notes[i2].invis = true
			delete s2.notes[i2].acc
		}
		for (i2 = 0; i2 <= s2.nhd; i2++)
			s2.notes[i2].shhd += sh1
	} else {
		for (i1 = i11; i1 < i12; i1++) {
			s1.notes[i1].invis = true
			delete s1.notes[i1].acc
		}
		for (i1 = 0; i1 <= s1.nhd; i1++)
			s1.notes[i1].shhd += sh2
	}
	if (s1.dots == s2.dots)			// let the dots in one voice
		s2.dots = 0
	return true
}

/* handle unison with different accidentals */
function unison_acc(s1, s2, i1, i2) {
    var	m, d, acc

	acc = s2.notes[i2].acc
	if (!acc) {
		d = w_note[s2.head] * 2 + s2.xmx + s1.notes[i1].shac + 2
		acc = s1.notes[i1].acc
		if (typeof acc == "object")	// microtone
			d += 2
		if (s2.dots)
			d += 6
		for (m = 0; m <= s1.nhd; m++) {
			s1.notes[m].shhd += d;
			s1.notes[m].shac -= d
		}
		s1.xmx += d
	} else {
		d = w_note[s1.head] * 2 + s1.xmx + s2.notes[i2].shac + 2
		if (typeof acc == "object")	// microtone
			d += 2
		if (s1.dots)
			d += 6
		for (m = 0; m <= s2.nhd; m++) {
			s2.notes[m].shhd += d;
			s2.notes[m].shac -= d
		}
		s2.xmx += d
		if (s1.notes[i1].acc)
			s1.notes[i1].shac -= 7
//fixme: why not dx_tb[s2.head] ?
	}
}

var MAXPIT = 48 * 2

/* set the left space of a note/chord */
function set_left(s) {
	var	m, i, j, shift,
		w_base = w_note[s.head],
		w = w_base,
		left = []

	for (i = 0; i < MAXPIT; i++)
		left.push(-100)

	/* stem */
	if (s.nflags > -2) {
		if (s.stem > 0) {
			w = -w;
			i = s.notes[0].pit * 2;
			j = (Math.ceil((s.ymx - 2) / 3) + 18) * 2
		} else {
			i = (Math.ceil((s.ymn + 2) / 3) + 18) * 2;
			j = s.notes[s.nhd].pit * 2
		}
		if (i < 0)
			i = 0
		if (j >= MAXPIT)
			j = MAXPIT - 1
		while (i <= j)
			left[i++] = w
	}

	/* notes */
	shift = s.notes[s.stem > 0 ? 0 : s.nhd].shhd;	/* previous shift */
	for (m = 0; m <= s.nhd; m++) {
		w = -s.notes[m].shhd + w_base + shift;
		i = s.notes[m].pit * 2
		if (i < 0)
			i = 0
		else if (i >= MAXPIT - 1)
			i = MAXPIT - 2
		if (w > left[i])
			left[i] = w
		if (s.head != C.SQUARE)
			w -= 1
		if (w > left[i - 1])
			left[i - 1] = w
		if (w > left[i + 1])
			left[i + 1] = w
	}

	return left
}

/* set the right space of a note/chord */
function set_right(s) {
	var	m, i, j, k, shift,
		w_base = w_note[s.head],
		w = w_base,
		flags = s.nflags > 0 && s.beam_st && s.beam_end,
		right = []

	for (i = 0; i < MAXPIT; i++)
		right.push(-100)

	/* stem and flags */
	if (s.nflags > -2) {
		if (s.stem < 0) {
			w = -w;
			i = (Math.ceil((s.ymn + 2) / 3) + 18) * 2;
			j = s.notes[s.nhd].pit * 2;
			k = i + 4
		} else {
			i = s.notes[0].pit * 2;
			j = (Math.ceil((s.ymx - 2) / 3) + 18) * 2
		}
		if (i < 0)
			i = 0
		if (j > MAXPIT)
			j = MAXPIT
		while (i < j)
			right[i++] = w
	}

	if (flags) {
		if (s.stem > 0) {
			if (s.xmx == 0)
				i = s.notes[s.nhd].pit * 2
			else
				i = s.notes[0].pit * 2;
			i += 4
			if (i < 0)
				i = 0
			for (; i < MAXPIT && i <= j - 4; i++)
				right[i] = 11
		} else {
			i = k
			if (i < 0)
				i = 0
			for (; i < MAXPIT && i <= s.notes[0].pit * 2 - 4; i++)
				right[i] = 3.5
		}
	}

	/* notes */
	shift = s.notes[s.stem > 0 ? 0 : s.nhd].shhd	/* previous shift */
	for (m = 0; m <= s.nhd; m++) {
		w = s.notes[m].shhd + w_base - shift;
		i = s.notes[m].pit * 2
		if (i < 0)
			i = 0
		else if (i >= MAXPIT - 1)
			i = MAXPIT - 2
		if (w > right[i])
			right[i] = w
		if (s.head != C.SQUARE)
			w -= 1
		if (w > right[i - 1])
			right[i - 1] = w
		if (w > right[i + 1])
			right[i + 1] = w
	}

	return right
}

/* -- shift the notes horizontally when voices overlap -- */
/* this routine is called only once per tune */
function set_overlap() {
    var	s, s1, s2, s3, i, i1, i2, m, sd, t, dp,
	d, d2, dr, dr2, dx,
	left1, right1, left2, right2, right3, pl, pr,
	sy = cur_sy

	// invert the voices
	function v_invert() {
		s1 = s2;
		s2 = s;
		d = d2;
		pl = left1;
		pr = right1;
		dr2 = dr
	}

	for (s = tsfirst; s; s = s.ts_next) {
		if (s.type != C.NOTE
		 || s.invis) {
			if (s.type == C.STAVES)
				sy = s.sy
			continue
		}

		// set the dot vertical offset of secondary voices
		if (s.second)
			s.dot_low = 1 //true

		/* treat the stem on two staves with different directions */
		if (s.xstem
		 && s.ts_prev.stem < 0) {
			for (m = 0; m <= s.nhd; m++) {
				s.notes[m].shhd -= 7;		// stem_xoff
				s.notes[m].shac += 16
			}
		}

		/* search the next note at the same time on the same staff */
		s2 = s
		while (1) {
			s2 = s2.ts_next
			if (!s2)
				break
			if (s2.time != s.time) {
				s2 = null
				break
			}
			if (s2.type == C.NOTE
			 && !s2.invis
			 && s2.st == s.st)
				break
		}
		if (!s2)
			continue
		s1 = s

		/* no shift if no overlap */
		if (s1.ymn > s2.ymx
		 || s1.ymx < s2.ymn)
			continue

		if (same_head(s1, s2))
			continue

		// special case when only a second and no dots
	    if (!s1.dots && !s2.dots)
		if ((s1.stem > 0 && s2.stem < 0
		  && s1.notes[0].pit == s2.notes[s2.nhd].pit + 1)
		 || (s1.stem < 0 && s2.stem > 0
		  && s1.notes[s1.nhd].pit + 1 == s2.notes[0].pit)) {
			if (s1.stem < 0) {
				s1 = s2;
				s2 = s
			}
			d = s1.notes[0].shhd + 7
			for (m = 0; m <= s2.nhd; m++)	// shift the lower note(s)
				s2.notes[m].shhd += d
			s2.xmx += d
			s1.xmx = s2.xmx		// align the dots
			continue
		}

		/* compute the minimum space for 's1 s2' and 's2 s1' */
		right1 = set_right(s1);
		left2 = set_left(s2);

		s3 = s1.ts_prev
		if (s3 && s3.time == s1.time
		 && s3.st == s1.st && s3.type == C.NOTE && !s3.invis) {
			right3 = set_right(s3)
			for (i = 0; i < MAXPIT; i++) {
				if (right3[i] > right1[i])
					right1[i] = right3[i]
			}
		} else {
			s3 = null
		}
		d = -10
		for (i = 0; i < MAXPIT; i++) {
			if (left2[i] + right1[i] > d)
				d = left2[i] + right1[i]
		}

		if (d < -3			// no clash if no dots clash
		 && ((s2.notes[0].pit & 1)
		  || !(s1.dots || s2.dots)
		  || (!(s1.notes[s1.nhd].pit == s2.notes[0].pit + 2
		    && s1.dot_low)
		   && !(s1.notes[s1.nhd].pit + 2 == s2.notes[0].pit
		    && s2.dot_low))))
			continue

		right2 = set_right(s2);
		left1 = set_left(s1)
		if (s3) {
			right3 = set_left(s3)
			for (i = 0; i < MAXPIT; i++) {
				if (right3[i] > left1[i])
					left1[i] = right3[i]
			}
		}
		d2 = dr = dr2 = -100
		for (i = 0; i < MAXPIT; i++) {
			if (left1[i] + right2[i] > d2)
				d2 = left1[i] + right2[i]
			if (right2[i] > dr2)
				dr2 = right2[i]
			if (right1[i] > dr)
				dr = right1[i]
		}

		/* check for unison with different accidentals
		 * and clash of dots */
		t = 0;
		i1 = s1.nhd;
		i2 = s2.nhd
		while (1) {
			dp = s1.notes[i1].pit - s2.notes[i2].pit
			switch (dp) {
			case 2:
				if (!(s1.notes[i1].pit & 1))
					s1.dot_low = false
				break
			case 1:
				if (s1.notes[i1].pit & 1)
					s2.dot_low = true
				else
					s1.dot_low = false
				break
			case 0:
				if (s1.notes[i1].acc != s2.notes[i2].acc) {
					t = -1
					break
				}
				if (s2.notes[i2].acc) {
					if (!s1.notes[i1].acc)
						s1.notes[i1].acc = s2.notes[i2].acc
					s2.notes[i2].acc = 0
				}
				if (s1.dots && s2.dots
				 && (s1.notes[i1].pit & 1))
					t = 1
				break
			case -1:
				if (s1.notes[i1].pit & 1)
					s2.dot_low = false
				else
					s1.dot_low = true
				break
			case -2:
				if (!(s1.notes[i1].pit & 1))
					s2.dot_low = false
				break
			}
			if (t < 0)
				break
			if (dp >= 0) {
				if (--i1 < 0)
					break
			}
			if (dp <= 0) {
				if (--i2 < 0)
					break
			}
		}

		if (t < 0) {	/* unison and different accidentals */
			unison_acc(s1, s2, i1, i2)
			continue
		}

		sd = 0;
		if (s1.dots) {
			if (!s2.dots
			 || !t)			// if no dot clash
				sd = 1		// align the dots
		} else if (s2.dots) {
			if (d2 + dr < d + dr2)
				sd = 1		/* align the dots */
		}
		pl = left2;
		pr = right2
		if (!s3 && d2 + dr < d + dr2)
			v_invert()
		d += 3
		if (d < 0)
			d = 0;			// (not return!)

		/* handle the previous shift */
		m = s1.stem >= 0 ? 0 : s1.nhd;
		d += s1.notes[m].shhd;
		m = s2.stem >= 0 ? 0 : s2.nhd;
		d -= s2.notes[m].shhd

		/*
		 * room for the dots
		 * - if the dots of v1 don't shift, adjust the shift of v2
		 * - otherwise, align the dots and shift them if clash
		 */
		if (s1.dots) {
			dx = 7.7 + s1.xmx +		// x 1st dot
				3.5 * s1.dots - 3.5 +	// x last dot
				3;			// some space
			if (!sd) {
				d2 = -100;
				for (i1 = 0; i1 <= s1.nhd; i1++) {
					i = s1.notes[i1].pit
					if (!(i & 1)) {
						if (!s1.dot_low)
							i++
						else
							i--
					}
					i *= 2
					if (i < 1)
						i = 1
					else if (i >= MAXPIT - 1)
						i = MAXPIT - 2
					if (pl[i] > d2)
						d2 = pl[i]
					if (pl[i - 1] + 1 > d2)
						d2 = pl[i - 1] + 1
					if (pl[i + 1] + 1 > d2)
						d2 = pl[i + 1] + 1
				}
				if (dx + d2 + 2 > d)
					d = dx + d2 + 2
			} else {
				if (dx < d + dr2 + s2.xmx) {
					d2 = 0
					for (i1 = 0; i1 <= s1.nhd; i1++) {
						i = s1.notes[i1].pit
						if (!(i & 1)) {
							if (!s1.dot_low)
								i++
							else
								i--
						}
						i *= 2
						if (i < 1)
							i = 1
						else if (i >= MAXPIT - 1)
							i = MAXPIT - 2
						if (pr[i] > d2)
							d2 = pr[i]
						if (pr[i - 1] + 1 > d2)
							d2 = pr[i - 1] = 1
						if (pr[i + 1] + 1 > d2)
							d2 = pr[i + 1] + 1
					}
					if (d2 > 4.5
					 && 7.7 + s1.xmx + 2 < d + d2 + s2.xmx)
						s2.xmx = d2 + 3 - 7.7
				}
			}
		}

		for (m = s2.nhd; m >= 0; m--) {
			s2.notes[m].shhd += d
//			if (s2.notes[m].acc
//			 && s2.notes[m].pit < s1.notes[0].pit - 4)
//				s2.notes[m].shac -= d
		}
		s2.xmx += d
		if (sd)
			s1.xmx = s2.xmx		// align the dots
	}
}

/* -- set the stem height -- */
/* this routine is called only once per tune */
// (possible hook)
Abc.prototype.set_stems = function() {
	var s, s2, g, slen, scale,ymn, ymx, nflags, ymin, ymax

	for (s = tsfirst; s; s = s.ts_next) {
		if (s.type != C.NOTE) {
			if (s.type != C.GRACE)
				continue
			ymin = ymax = s.mid
			for (g = s.extra; g; g = g.next) {
				slen = GSTEM
				if (g.nflags > 1)
					slen += 1.2 * (g.nflags - 1);
				ymn = 3 * (g.notes[0].pit - 18);
				ymx = 3 * (g.notes[g.nhd].pit - 18)
				if (s.stem >= 0) {
					g.y = ymn;
					g.ys = ymx + slen;
					ymx = Math.round(g.ys)
				} else {
					g.y = ymx;
					g.ys = ymn - slen;
					ymn = Math.round(g.ys)
				}
				ymx += 4
				ymn -= 4
				if (ymn < ymin)
					ymin = ymn
				else if (ymx > ymax)
					ymax = ymx;
				g.ymx = ymx;
				g.ymn = ymn
			}
			s.ymx = ymax;
			s.ymn = ymin
			continue
		}

		/* shift notes in chords (need stem direction to do this) */
		set_head_shift(s);

		/* if start or end of beam, adjust the number of flags
		 * with the other end */
		nflags = s.nflags
		if (s.beam_st && !s.beam_end) {
			if (s.feathered_beam)
				nflags = ++s.nflags
			for (s2 = s.next; /*s2*/; s2 = s2.next) {
				if (s2.type == C.NOTE) {
					if (s.feathered_beam)
						s2.nflags++
					if (s2.beam_end)
						break
				}
			}
/*			if (s2) */
			    if (s2.nflags > nflags)
				nflags = s2.nflags
		} else if (!s.beam_st && s.beam_end) {
//fixme: keep the start of beam ?
			for (s2 = s.prev; /*s2*/; s2 = s2.prev) {
				if (s2.beam_st)
					break
			}
/*			if (s2) */
			    if (s2.nflags > nflags)
				nflags = s2.nflags
		}

		/* set height of stem end */
		slen = s.fmt.stemheight
		switch (nflags) {
//		case 2: slen += 0; break
		case 3:	slen += 4; break
		case 4:	slen += 8; break
		case 5:	slen += 12; break
		}
		if ((scale = s.p_v.scale) != 1)
			slen *= (scale + 1) * .5;
		ymn = 3 * (s.notes[0].pit - 18)
		if (s.nhd > 0) {
			slen -= 2;
			ymx = 3 * (s.notes[s.nhd].pit - 18)
		} else {
			ymx = ymn
		}
		if (s.ntrem)
			slen += 2 * s.ntrem		/* tremolo */
		if (s.decstm != null) {			// if deco on the stem
			if (nflags <= 0) {
				if (slen < s.decstm + 6)
					slen = s.decstm + 6
			} else {
			    var	t = nflags * 4		// beams

				if (s.beam_st & s.beam_end)
					t += 2		// flags
				if (slen < s.decstm + 4 + t)
					slen = s.decstm + 4 + t
			}
		}
		if (s.stemless) {
			if (s.stem >= 0) {
				s.y = ymn;
				s.ys = ymx
			} else {
				s.ys = ymn;
				s.y = ymx
			}
			s.ymx = ymx + 4;
			s.ymn = ymn - 4
		} else if (s.stem >= 0) {
			if (s.notes[s.nhd].pit > 26
			 && (nflags <= 0
			  || !s.beam_st
			  || !s.beam_end)) {
				slen -= 2
				if (s.notes[s.nhd].pit > 28)
					slen -= 2
			}
			s.y = ymn
			if (s.notes[0].tie)
				ymn -= 3;
			s.ymn = ymn - 4;
			s.ys = ymx + slen
			if (s.ys < s.mid)
				s.ys = s.mid;
			s.ymx = (s.ys + 2.5) | 0
		} else {			/* stem down */
			if (s.notes[0].pit < 18
			 && (nflags <= 0
			  || !s.beam_st || !s.beam_end)) {
				slen -= 2
				if (s.notes[0].pit < 16)
					slen -= 2
			}
			s.ys = ymn - slen
			if (s.ys > s.mid)
				s.ys = s.mid;
			s.ymn = (s.ys - 2.5) | 0;
			s.y = ymx
/*fixme:the tie may be lower*/
			if (s.notes[s.nhd].tie)
				ymx += 3;
			s.ymx = ymx + 4
		}
	}
}

// generate a block symbol
var blocks = []		// array of delayed block symbols

// (possible hook)
Abc.prototype.block_gen = function(s) {
	switch (s.subtype) {
	case "leftmargin":
	case "rightmargin":
	case "pagescale":
	case "pagewidth":
	case "scale":
	case "staffwidth":
		self.set_format(s.subtype, s.param)
		break
	case "mc_start":		// multicol start
		if (multicol) {
			error(1, s, "No end of the previous %%multicol")
			break
		}
		multicol = {
			state: parse.state,
			posy: posy,
			maxy: posy,
			lm: cfmt.leftmargin,
			rm: cfmt.rightmargin,
			w: cfmt.pagewidth,
			sc: cfmt.scale
		}
		break
	case "mc_new":			// multicol new
		if (!multicol || multicol.state != parse.state) {
			error(1, s, "%%multicol new without start")
			break
		}
		if (posy > multicol.maxy)
			multicol.maxy = posy
		cfmt.leftmargin = multicol.lm
		cfmt.rightmargin = multicol.rm
		cfmt.pagewidth = multicol.w
		cfmt.scale = multicol.sc
		posy = multicol.posy
		img.chg = 1 //true
		break
	case "mc_end":			// multicol end
		if (!multicol || multicol.state != parse.state) {
			error(1, s, "%%multicol end without start")
			break
		}
		if (posy < multicol.maxy)
			posy = multicol.maxy
		cfmt.leftmargin = multicol.lm
		cfmt.rightmargin = multicol.rm
		cfmt.pagewidth = multicol.w
		cfmt.scale = multicol.sc
		multicol = undefined
		blk_flush()
		img.chg = 1 //true
		break
	case "ml":
		blk_flush()
		user.img_out(s.text)
		break
	case "newpage":
		if (!user.page_format)
			break
		blk_flush()
		if (blkdiv < 0)		// split the tune
			user.img_out('</div>')
		blkdiv = 2		// start the next SVG in a new page
		break
	case "sep":
		set_page();
		vskip(s.sk1);
		output += '<path class="stroke"\n\td="M';
		out_sxsy((img.width -s.l) / 2 - img.lm, ' ', 0)
		output += 'h' + s.l.toFixed(1) + '"/>\n';
		vskip(s.sk2);
		break
	case "text":
		set_font(s.font)
		use_font(s.font)
		write_text(s.text, s.opt)
		break
	case "title":
		write_title(s.text, true)
		break
	case "vskip":
		vskip(s.sk);
		break
	}
}

/* -- define the start and end of a piece of tune -- */
/* tsnext becomes the beginning of the next line */
function set_piece() {
    var	s, last, p_voice, st, v, nv, tmp, non_empty,
	non_empty_gl = [],
	sy = cur_sy

	function reset_staff(st) {
		var	p_staff = staff_tb[st],
			sy_staff = sy.staves[st]

		if (!p_staff)
			p_staff = staff_tb[st] = {}
		p_staff.y = 0;			// staff system not computed yet
		p_staff.stafflines = sy_staff.stafflines;
		p_staff.staffscale = sy_staff.staffscale;
		p_staff.ann_top = p_staff.ann_bot = 0
	} // reset_staff()

	// adjust the empty flag of brace systems
	function set_brace() {
		var	st, i, empty_fl,
			n = sy.staves.length

		// if a system brace has empty and non empty staves, keep all staves
		for (st = 0; st < n; st++) {
			if (!(sy.staves[st].flags & (OPEN_BRACE | OPEN_BRACE2)))
				continue
			empty_fl = 0;
			i = st
			while (st < n) {
				empty_fl |= non_empty[st] ? 1 : 2
				if (sy.staves[st].flags & (CLOSE_BRACE | CLOSE_BRACE2))
					break
				st++
			}
			if (empty_fl == 3) {	// if both empty and not empty staves
				while (i <= st) {
					non_empty[i] = true;
					non_empty_gl[i++] = true
				}
			}
		}
	} // set_brace()

	// set the top and bottom of the staves
	function set_top_bot() {
	    var	st, p_staff, i, l

		for (st = 0; st <= nstaff; st++) {
			p_staff = staff_tb[st]

			// ledger lines
			// index = line number
			// values = [x symbol, x start, x stop]
			p_staff.hlu = []	// above the staff
			p_staff.hld = []	// under the staff

			l = p_staff.stafflines.length;
			p_staff.topbar = 6 * (l - 1)

			for (i = 0; i < l - 1; i++) {
				switch (p_staff.stafflines[i]) {
				case '.':
				case '-':
					continue
				}
				break
			}
			p_staff.botbar = i * 6
			if (i >= l - 2) {		// 0, 1 or 2 lines
				if (p_staff.stafflines[i] != '.') {
					p_staff.botbar -= 6;
					p_staff.topbar += 6
				} else {		// no line: big bar
					p_staff.botbar -= 12;
					p_staff.topbar += 12
					continue	// no helper line
				}
			}
			if (!non_empty_gl[st])
				continue
		}
	} // set_top_bot()

	// remove the staff system at start of line
	if (tsfirst.type == C.STAVES) {
		s = tsfirst
		tsfirst = tsfirst.ts_next
		tsfirst.ts_prev = null
		if (s.seqst)
			tsfirst.seqst = true
		s.p_v.sym = s.next
		if (s.next)
			 s.next.prev = null
	}

	/* reset the staves */
	nstaff = sy.nstaff
	for (st = 0; st <= nstaff; st++)
		reset_staff(st);
	non_empty = new Uint8Array(nstaff + 1)

	/*
	 * search the next end of line,
	 * and mark the empty staves
	 */
	for (s = tsfirst; s; s = s.ts_next) {
		if (s.nl)
			break
		switch (s.type) {
		case C.STAVES:
			set_brace();
			sy.st_print = non_empty
			sy = s.sy;
			while (nstaff < sy.nstaff)
				reset_staff(++nstaff)
			non_empty = new Uint8Array(nstaff + 1)
			continue

		// the block symbols will be treated after music line generation
		case C.BLOCK:
			if (!s.play) {
				blocks.push(s)
				unlksym(s)
			} else if (s.ts_next && s.ts_next.shrink)
				s.ts_next.shrink = 0
			continue
		}
		st = s.st
		if (st > nstaff) {
			switch (s.type) {
			case C.CLEF:
				staff_tb[st].clef = s	// clef warning/change for new staff
				break
			case C.KEY:
				s.p_v.ckey = s
				break
//useless ?
			case C.METER:
				s.p_v.meter = s
				break
			}
			unlksym(s)
			continue
		}
		if (non_empty[st])
			continue
		switch (s.type) {
		default:
			continue
		case C.BAR:
			if (s.bar_mrep
			 || sy.staves[st].staffnonote > 1)
				break
			continue
		case C.GRACE:
			break
		case C.NOTE:
		case C.REST:
		case C.SPACE:
		case C.MREST:
			if (sy.staves[st].staffnonote > 1)
				break
			if (s.invis)
				continue
			if (sy.staves[st].staffnonote
			 || s.type == C.NOTE)
				break
			continue
		}
		non_empty_gl[st] = non_empty[st] = true
	}
	tsnext = s;

	/* set the last empty staves */
	set_brace()
	sy.st_print = non_empty

	/* define the offsets of the measure bars */
	set_top_bot()

	// if not the end of the tune, set the end of the music line
	if (tsnext) {
		s = tsnext;
		delete s.nl;
		last = s.ts_prev;
		last.ts_next = null;

		// and the end of the voices
		nv = voice_tb.length
		for (v = 0; v < nv; v++) {
			p_voice = voice_tb[v]
			if (p_voice.sym
			 && p_voice.sym.time <= tsnext.time) {
				for (s = last; s; s = s.ts_prev) {
					if (s.v == v) {
						p_voice.s_next = s.next;
						s.next = null;
						break
					}
				}
				if (s)
					continue
			}
			p_voice.s_next = p_voice.sym;
			p_voice.sym = null
		}
	}

	// initialize the music line
	init_music_line()

	// keep the array of the staves to be printed
	gene.st_print = non_empty_gl
}

/* -- position the symbols along the staff -- */
// (possible hook)
Abc.prototype.set_sym_glue = function(width) {
    var	g, x, some_grace, stretch,
	cnt = 4,
	xmin = 0,		// sigma shrink = minimum spacing
	xx = 0,			// sigma natural spacing
	xs = 0,			// sigma unexpandable elements with no space
	xse = 0,		// sigma unexpandable elements with space
	ll = !tsnext ||		// last line? yes
		(tsnext.type == C.BLOCK	// no, but followed by %%command
		 && !tsnext.play)
		|| blocks.length,	//	(abcm2ps compatibility)
	s = tsfirst,
	spf = 1,		// spacing factor
	xx0 = 0

	/* calculate the whole space of the symbols */
	for ( ; s; s = s.ts_next) {
		if (s.type == C.GRACE && !some_grace)
			some_grace = s
		if (s.seqst) {
			xmin += s.shrink
			if (xmin > width) {
			    if (cfmt.singleline)
				width = xmin
			    else
				error(1, s, "Line too much shrunk $1 $2 $3",
					xmin.toFixed(1),
					xx.toFixed(1),
					width.toFixed(1))
//				break
			}
			if (s.space) {
				if (s.space < s.shrink) {
					xse += s.shrink;
					xx += s.shrink
				} else {
//					xx += s.space * spf + s.shrink * (1 - spf)
					xx += s.space
					xx0 += s.shrink
				}
			} else {
				xs += s.shrink
			}
		}
	}

	// can occur when bar alone in a staff system
	if (!xx) {
		realwidth = 0
		return
	}

	// stretch or not?
	s = tsfirst

	if (ll) {
		if ((xx - xx0 + xs) / width > (1 - s.fmt.stretchlast))
			stretch = 1 //true
	} else if (s.fmt.stretchstaff) {
		stretch = 1 //true
	}

	// strong shrink
	if (xmin >= width) {
		x = 0
		for ( ; s; s = s.ts_next) {
			if (s.seqst)
				x += s.shrink;
			s.x = x
		}
//		realwidth = width
		spf_last = .65
	} else {
		if (stretch) {
			if (xx == xse)			// if no space
				xx += 10
			spf = (width - xs - xse) / (xx - xse)
		} else {
			spf = spf_last
			if (ll && spf < s.fmt.stretchlast)
				spf = s.fmt.stretchlast
			else if (!ll)
				spf = 1 - cfmt.maxshrink * .75
			if (spf > (width - xs) / xx)
				spf = (width - xs) / xx
		}
		while (--cnt >= 0) {
			xx = 0;
			xse = 0;
			x = 0
			for (s = tsfirst; s; s = s.ts_next) {
				if (s.seqst) {
					if (s.space) {
						if (s.space * spf <= s.shrink) {
							xse += s.shrink;
							xx += s.shrink;
							x += s.shrink
						} else {
							xx += s.space;
							x += s.space * spf
						}
					} else {
						x += s.shrink
					}
				}
				s.x = x
			}
			if (!stretch && x < width)
				break
			if (Math.abs(x - width) < 0.1)
				break
			if (xx == xse)			// if no space
				xx += 10
			spf = (width - xs - xse) / (xx - xse)
		}
		spf_last = spf
	}
	realwidth = x

	/* set the x offsets of the grace notes */
	for (s = some_grace; s; s = s.ts_next) {
		if (s.type != C.GRACE)
			continue
		if (s.gr_shift)
			x = s.prev.x + s.prev.wr
		else
			x = s.x - s.wl
		for (g = s.extra; g; g = g.next)
			g.x += x
	}
}

// set the starting symbols of the voices for the new music line
function set_sym_line() {
    var	p_v, s,
	v = voice_tb.length

	// set the first symbol of each voice
	while (--v >= 0) {
		p_v = voice_tb[v]
		if (p_v.sym && p_v.s_prev) {
			p_v.sym.prev = p_v.s_prev
			p_v.s_prev.next = p_v.sym
		}
		s = p_v.s_next			// (set in set_piece)
		p_v.s_next = null
		p_v.sym = s
		if (s) {
			if (s.prev)
				s.prev.next = s
			p_v.s_prev = s.prev	// (save for play)
			s.prev = null
		} else {
			p_v.s_prev = null
		}
	}
}

// set the left offset the images
function set_posx() {
	posx = img.lm / cfmt.scale
}

// initialize the start of generation / new music line
// and output the inter-staff blocks if any
function gen_init() {
	var	s = tsfirst,
		tim = s.time

	for ( ; s; s = s.ts_next) {
		if (s.time != tim) {
			set_page()
			return
		}
		switch (s.type) {
		case C.NOTE:
		case C.REST:
		case C.MREST:
		case C.SPACE:
			set_page()
			return
		default:
			continue
		case C.STAVES:
			cur_sy = s.sy
//			break
			continue
		case C.BLOCK:
			if (s.play)
				continue	// keep for play
			self.block_gen(s)
			break
		}
		unlksym(s)
		if (s.p_v.s_next == s)
			s.p_v.s_next = s.next
	}
	tsfirst = null			/* no more notes */
}

/* -- generate the music -- */
// (possible hook)
Abc.prototype.output_music = function() {
    var v, lwidth, indent, lsh, line_height, ts1st, tslast, p_v, meter1,
	nv = voice_tb.length

	set_global()
	if (nv > 1)			// if many voices
		self.set_stem_dir()	// set the stems direction in 'multi'

	for (v = 0; v < nv; v++)
		set_beams(voice_tb[v].sym);	/* decide on beams */

	self.set_stems()		// set the stem lengths

	set_acc_shft()			// set the horizontal offset of accidentals
	if (nv > 1) {			// if many voices
		set_rest_offset();	/* set the vertical offset of rests */
		set_overlap();		/* shift the notes on voice overlap */
	}
	set_allsymwidth(1)		// set the width of all symbols

	// output the blocks and define the page layout
	gen_init()
	if (!tsfirst)
		return

	lsh = get_lshift()

	/* if single line, adjust the page width */
	if (cfmt.singleline) {
		v = get_ck_width();
		lwidth = lsh[0] + v[0] + v[1] + get_width(tsfirst, null)[0]
		v = cfmt.singleline == 2	// if as wide as the page width
			? get_lwidth() : lwidth
		if (v > lwidth)
			lwidth = v
		else
			img.width = lwidth * cfmt.scale + img.lm + img.rm + 2
	} else {

	/* else, split the tune into music lines */
		lwidth = get_lwidth();
		cut_tune(lwidth, lsh)
	}

	// save symbol pointers for play
	ts1st = tsfirst
	v = nv
	while (--v >= 0)
		voice_tb[v].osym = voice_tb[v].sym
	meter1 = ts1st.p_v.meter

	spf_last = .65				// last spacing factor
	while (1) {				/* loop per music line */
		set_piece();
		indent = set_indent(lsh)
		if (!line_height
		 && cfmt.indent
		 && indent < cfmt.indent)
		 	indent = cfmt.indent
		self.set_sym_glue(lwidth - indent)
		if (realwidth) {
			if (img.wx < realwidth)
				img.wx = realwidth
			if (indent) {
				img.wx += indent
				posx += indent
			}
			draw_sym_near();		// delayed output
			line_height = set_staff();
		    if (line_height) {			// if some music
			draw_systems(indent);
			draw_all_sym();
			delayed_update();
				vskip(line_height)
		    }
			if (indent)
				posx -= indent;
		}

		blk_flush()
		while (blocks.length)
			self.block_gen(blocks.shift())
		if (tslast)
			tslast.ts_next.ts_prev = tslast
		if (!tsnext)
			break
		tsnext.ts_prev.ts_next =		// (restore for play)
			tsfirst = tsnext

		// next line
		gen_init()
		if (!tsfirst)
			break
		tslast = tsfirst.ts_prev
		tsfirst.ts_prev = null;
		set_sym_line();
		lwidth = get_lwidth()	// the image size may have changed
	}

	// restore for play
//--fixme: no, good links, but playback crashes!!!
//	tsfirst = ts1st.ts_next				// skip staves
	tsfirst = ts1st
	v = nv
	while (--v >= 0) {
		p_v = voice_tb[v]
		if (p_v.sym && p_v.s_prev)
			p_v.sym.prev = p_v.s_prev
		p_v.sym = p_v.osym
	}
	ts1st.p_v.meter = meter1
}
