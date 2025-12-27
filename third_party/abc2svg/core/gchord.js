// abc2svg - gchord.js - chord symbols
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

// -- parse a chord symbol / annotation --
// the result is added in the global variable a_gch
// 'type' may be a single '"' or a string '"xxx"' created by U:
function parse_gchord(type) {
    var	c, text, gch, x_abs, y_abs,
	i, j, istart, iend,
		ann_font = get_font("annotation"),
		h_ann = ann_font.size,
		line = parse.line

	function get_float() {
		var txt = ''

		while (1) {
			c = text[i++]
			if ("1234567890.-".indexOf(c) < 0)
				return parseFloat(txt)
			txt += c
		}
	} // get_float()

	istart = parse.bol + line.index
	if (type.length > 1) {			// U:
		text = type.slice(1, -1);
		iend = istart + 1
	} else {
		i = ++line.index		// search the ending double quote
		while (1) {
			j = line.buffer.indexOf('"', i)
			if (j < 0) {
				syntax(1, "No end of chord symbol/annotation")
				return
			}
			if (line.buffer[j - 1] != '\\'
			 || line.buffer[j - 2] == '\\')	// (string ending with \\")
				break
			i = j + 1
		}
		text = cnv_escape(line.buffer.slice(line.index, j))
		line.index = j
		iend = parse.bol + line.index + 1
	}

	if (ann_font.pad)
		h_ann += ann_font.pad
	i = 0;
	type = 'g'
	while (1) {
		c = text[i]
		if (!c)
			break
		gch = {
			text: "",
			istart: istart,
			iend: iend,
			font: ann_font
		}
		switch (c) {
		case '@':
			type = c;
			i++;
			x_abs = get_float()
			if (c != ',') {
				syntax(1, "',' lacking in annotation '@x,y'");
				y_abs = 0
			} else {
				y_abs = get_float()
				if (c != ' ')
					i--
			}
			gch.x = x_abs;
			gch.y = y_abs
			break
		case '^':
			gch.pos = C.SL_ABOVE
			// fall thru
		case '_':
			if (c == '_')
				gch.pos = C.SL_BELOW
			// fall thru
		case '<':
		case '>':
			i++;
			type = c
			break
		default:
			switch (type) {
			case 'g':
				gch.font = get_font("gchord")
				gch.pos = curvoice.pos.gch || C.SL_ABOVE
				break
			case '^': 
				gch.pos = C.SL_ABOVE
				break
			case '_':
				gch.pos = C.SL_BELOW
				break
			case '@':
				gch.x = x_abs;
				y_abs -= h_ann;
				gch.y = y_abs
				break
			}
			break
		}
		gch.type = type
		while (1) {
			c = text[i]
			if (!c)
				break
			switch (c) {
			default:
				gch.text += c;
				i++
				continue
			case '&':			/* skip "&xxx;" */
				while (1) {
					gch.text += c;
					c = text[++i]
					switch (c) {
					default:
						continue
					case ';':
					case undefined:
					case '\\':
						break
					}
					break
				}
				if (c == ';') {
					i++;
					gch.text += c
					continue
				}
				break
			case '\n':		// abcm2ps compatibility
			case ';':
				break
			}
			i++
			break
		}
		gch.otext = gch.text	// save for play accompaniment
		if (!a_gch)
			a_gch = []
		a_gch.push(gch)
	}
}

// transpose a chord symbol
	function gch_tr1(p, tr) {
	    var	i, o, n, ip,
		csa = p.split('/')

		tr = abc2svg.b40l5[(tr + 202) % 40]	// transpose in the line of fifth
		for (i = 0; i < csa.length; i++) {	// main and optional bass
			p = csa[i];
			o = p.search(/[A-G]/)
			if (o < 0)
				continue		// strange chord symbol!
			ip = o + 1

//	bbb fb cb gb db ab eb bb  f c g d a e b f# c# g# d# a# e# b# f##
//	 -9 -8 -7 -6 -5 -4 -3 -2 -1 0 1 2 3 4 5  6  7  8  9 10 11 12  13
			n = "FCGDAEB".indexOf(p[o]) - 1
			if (p[ip] == '#' || p[ip] == '\u266f') {
				n += 7
				ip++
			} else if (p[ip] == 'b' || p[ip] == '\u266d') {
				n -= 7
				ip++
			}
			n += tr					// transpose

//			// remove chords with double sharps/flats
//			if ((!i && n > 7)			// main chord
//			 || (i && n > 12))			// bass
//				n -= 12
//			else if (i < -7)
//				n += 12

			csa[i] = p.slice(0, o)
				+ "FCGDAEB"[(n + 22) % 7]
				+ (n >= 13 ? '##'
					: n >= 6 ? '#'
					: n <= -9 ? 'bb'
					: n <= -2 ? 'b'
					: '')
				+ p.slice(ip)
		}
		return csa.join('/')
	} // gch_tr1

// parser: add the parsed list of chord symbols and annotations
//	to the symbol (note, rest or bar)
//	and transpose the chord symbols
function csan_add(s) {
    var	i, gch

	// there cannot be chord symbols on measure bars
	if (s.type == C.BAR) {
		for (i = 0; i < a_gch.length; i++) {
			if (a_gch[i].type == 'g') {
				error(1, s,
				       "There cannot be chord symbols on measure bars")
				a_gch.splice(i)
			}
		}
	}

	if (curvoice.tr_sco
	 || curvoice.tr_snd) {
		for (i = 0; i < a_gch.length; i++) {
			gch = a_gch[i]
			if (gch.type == 'g') {
				if (curvoice.tr_snd40)
					gch.otext = gch_tr1(gch.text, curvoice.tr_snd40)
				if (curvoice.tr_sco)
					gch.text = gch_tr1(gch.text, curvoice.tr_sco)
			}
		}
	}

	if (s.a_gch)
		s.a_gch = s.a_gch.concat(a_gch)
	else
		s.a_gch = a_gch
	a_gch = null
} // csan_add

// generator: build the chord symbols / annotations
// (possible hook)
Abc.prototype.gch_build = function(s) {

	/* split the chord symbols / annotations
	 * and initialize their vertical offsets */
	var	gch, wh, xspc, ix,
		y_left = 0,
		y_right = 0,
		GCHPRE = .4;		// portion of chord before note

	// change the accidentals in the chord symbols,
	// convert the escape sequences in annotations, and
	// set the offsets
	for (ix = 0; ix < s.a_gch.length; ix++) {
		gch = s.a_gch[ix]
		if (gch.type == 'g') {
			gch.text = gch.text.replace(/##|#|=|bb|b/g,
				function(x) {
					switch (x) {
					case '##': return "&#x1d12a;"
					case '#': return "\u266f"
					case '=': return "\u266e"
					case 'b': return "\u266d"
					}
					return "&#x1d12b;"
				});
		} else {
			if (gch.type == '@'
			 && !user.anno_start && !user.anno_stop) {
				set_font(gch.font)
				gch.text = str2svg(gch.text)
				continue		/* no width */
			}
		}

		/* set the offsets and widths */
		set_font(gch.font);
		gch.text = str2svg(gch.text)
		wh = gch.text.wh
		switch (gch.type) {
		case '@':
			break
		default:
//		case 'g':			// chord symbol
//		case '^':			/* above */
//		case '_':			/* below */
			xspc = wh[0] * GCHPRE
			if (xspc > 8)
				xspc = 8;
			gch.x = -xspc;
			break
		case '<':			/* left */
			gch.x = -(wh[0] + 6);
			y_left -= wh[1];
			gch.y = y_left + wh[1] / 2
			break
		case '>':			/* right */
			gch.x = 6;
			y_right -= wh[1];
			gch.y = y_right + wh[1] / 2
			break
		}
	}

	/* move upwards the top and middle texts */
	y_left /= 2;
	y_right /= 2
	for (ix = 0; ix < s.a_gch.length; ix++) {
		gch = s.a_gch[ix]
		switch (gch.type) {
		case '<':			/* left */
			gch.y -= y_left
			break
		case '>':			/* right */
			gch.y -= y_right
			break
		}
	}
}

// -- draw the chord symbols and annotations
// (the staves are not yet defined)
// (unscaled delayed output)
// (possible hook)
Abc.prototype.draw_gchord = function(i, s, x, y) {
	if (s.invis && s.play)	// play sequence: no chord nor annotation
		return
    var	y2,
	an = s.a_gch[i],
	h = an.text.wh[1],
	pad = an.font.pad,
	w = an.text.wh[0] + pad * 2,
	dy = h * .22			// descent

	if (an.font.figb) {
		h *= 2.4
		dy += an.font.size * 1.3
	}

	switch (an.type) {
	case '_':			// below
		y -= h + pad
		break
	case '^':			// above
		y += pad
		break
	case '<':			// left
	case '>':			// right
		if (an.type == '<') {
/*fixme: what symbol space?*/
			if (s.notes[0].acc)
				x -= s.notes[0].shac
			x -= pad
		} else {
			if (s.xmx)
				x += s.xmx
			if (s.dots)
				x += 1.5 + 3.5 * s.dots
			x += pad
		}
		y += (s.type == C.NOTE ?
				(((s.notes[s.nhd].pit + s.notes[0].pit) >> 1) -
						18) * 3 :
				12)		// fixed offset on rests and bars
			- h / 2
		break
	default:			// chord symbol
		if (y >= 0)
			y += pad
		else
			y -= h + pad
		break
	case '@':			// absolute
		y += (s.type == C.NOTE ?
				(((s.notes[s.nhd].pit + s.notes[0].pit) >> 1) -
						18) * 3 :
				12)		// fixed offset on rests and bars
			- h / 2
		if (y > 0) {
			y2 = y + h + pad + 2
			if (y2 > staff_tb[s.st].ann_top)
				staff_tb[s.st].ann_top = y2
		} else {
			y2 = y - 2
			if (y2 < staff_tb[s.st].ann_bot)
				staff_tb[s.st].ann_bot = y2
		}
		break
	}

	if (an.type != '@') {
		if (y >= 0)
			y_set(s.st, 1, x, w, y + h + pad + 2)
		else
			y_set(s.st, 0, x, w, y - pad)
	}

	use_font(an.font)
	set_font(an.font)
	set_dscale(s.st)
	if (user.anno_start)
		user.anno_start("annot", an.istart, an.iend,
			x - 2, y + h + 2, w + 4, h + 4, s)
	xy_str(x, y + dy, an.text)
	if (user.anno_stop)
		user.anno_stop("annot", an.istart, an.iend,
			x - 2, y + h + 2, w + 4, h + 4, s)
} // draw_gchord()

// draw all chord symbols
function draw_all_chsy() {
    var	s, san1, an, i, x, y, w,
	n_an = 0,		// max number of annotations
	minmax = new Array(nstaff + 1)

	// set a vertical offset to all the chord symbols/annotations
	function set_an_yu(j) {
	    var	an, i, s, x, y, w

		for (s = san1 ; s; s = s.ts_next) {
			an = s.a_gch
			if (!an)
				continue
			i = an.length - j - 1
			an = an[i]
			if (!an)
				continue
			if (an.pos == C.SL_ABOVE) {
				x = s.x + an.x
				w = an.text.wh[0]
				if (w && x + w > realwidth)
					x = realwidth - w // let the text in the page
				y = y_get(s.st, 1, x, w)	// y / staff
				if (an.type == 'g' && y < minmax[s.st].yup)
					y = minmax[s.st].yup
			} else if (an.pos == C.SL_BELOW
				|| an.pos == C.SL_HIDDEN) {
				continue
			} else {
				x = s.x + an.x
				y = an.y
			}
			self.draw_gchord(i, s, x, y)
		}
	} // set_an_yu()

	function set_an_yl(i) {
	    var	an, x, y, w

		for (var s = san1 ; s; s = s.ts_next) {
			an = s.a_gch
			if (!an)
				continue
			an = an[i]
			if (!an
			 || an.pos != C.SL_BELOW)
				continue
			x = s.x + an.x
			w = an.text.wh[0]
			if (w && x + w > realwidth)	// let the text inside the page
				x = realwidth - w
			y = y_get(s.st, 0, x, w) - 2	// y / staff
			if (an.type == 'g' && y > minmax[s.st].ydn)
				y = minmax[s.st].ydn
			self.draw_gchord(i, s, x, y)
		}
	} // set_an_yl()

	// get the number of chord symbols / annotations
	// and the vertical offset for the chord symbols
	for (i = 0; i <= nstaff; i++)
		minmax[i] = {
			ydn: staff_tb[i].botbar - 3,
			yup: staff_tb[i].topbar + 4
		}
	for (s = tsfirst; s; s = s.ts_next) {
		an = s.a_gch
		if (!an)
			continue
		if (!san1)
			san1 = s	// first chord symbol / annotation
		i = an.length
		if (i > n_an)
			n_an = i
		while (--i >= 0) {
			if (an[i].type == 'g') {
				an = an[i]
				x = s.x + an.x
				w = an.text.wh[0]
				if (w && x + w > realwidth)
					x = realwidth - w
				if (an.pos == C.SL_ABOVE) {
					y = y_get(s.st, true, x, w)
					if (y > minmax[s.st].yup)
						minmax[s.st].yup = y
				} else if (an.pos == C.SL_BELOW) {
					y = y_get(s.st, false, x, w) - 2
					if (y < minmax[s.st].ydn)
						minmax[s.st].ydn = y
				}
				break
			}
		}
	}
	if (!san1)
		return			// no chord symbol nor annotation

	// draw the elements
	set_dscale(-1)			// restore the scale parameters
	for (i = 0; i < n_an; i++) {
		set_an_yu(i)		// upper offsets
		set_an_yl(i)		// lower offsets
	}
} // draw_all_chsy()
