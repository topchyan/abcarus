// abc2svg - parse.js - ABC parse
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

var	a_gch,		// array of parsed guitar chords
	a_dcn = [],	// array of parsed decoration names
	multicol,	// multi column object
	maps = {}	// maps object - see set_map()
var	qplet_tb = new Int8Array([ 0, 1, 3, 2, 3, 0, 2, 0, 3, 0 ]),
	ntb = "CDEFGABcdefgab"

// set the source references of a symbol
function set_ref(s) {
	s.fname = parse.fname;
	s.istart = parse.istart;
	s.iend = parse.iend
}

// -- %% pseudo-comment

// clef definition (%%clef, K: and V:)
function new_clef(clef_def) {
	var	s = {
			type: C.CLEF,
			clef_line: 2,
			clef_type: "t",
			v: curvoice.v,
			p_v: curvoice,
			time: curvoice.time,
			dur: 0,
			clef_small : 1 //true
		},
		i = 1

	set_ref(s)

	switch (clef_def[0]) {
	case '"':
		i = clef_def.indexOf('"', 1);
		s.clef_name = clef_def.slice(1, i);
		i++
		break
	case 'a':
		if (clef_def[1] == 'u') {	// auto
			s.clef_type = "a";
			s.clef_auto = true;
			i = 4
			break
		}
		i = 4				// alto
	case 'C':
		s.clef_type = "c";
		s.clef_line = 3
		break
	case 'b':				// bass
		i = 4
	case 'F':
		s.clef_type = "b";
		s.clef_line = 4
		break
	case 'n':				// none
		i = 4
		s.invis = true
		s.clef_none = 1 //true
		break
	case 't':
		if (clef_def[1] == 'e') {	// tenor
			s.clef_type = "c";
			s.clef_line = 4
			break
		}
		i = 6
	case 'G':
//		s.clef_type = "t"		// treble
		break
	case 'p':
		i = 4
	case 'P':				// perc
		s.clef_type = "p";
		s.clef_line = 3;
		break
	default:
		syntax(1, "Unknown clef '$1'", clef_def)
		return //undefined
	}
	if (clef_def[i] >= '1' && clef_def[i] <= '9') {
		s.clef_line = +clef_def[i]
		i++
	}

	// handle the octave (+/-8 - ^/_8)
	delete curvoice.snd_oct
	if (clef_def[i + 1] != '8'
	 && clef_def[i + 1] != '1')
		return s
	switch (clef_def[i]) {			// octave
	case '^':
		s.clef_oct_transp = true
	case '+':
		s.clef_octave = clef_def[i + 1] == '8' ? 7 : 14
		if (!s.clef_oct_transp)		// MIDI higher octave
			curvoice.snd_oct = clef_def[i + 1] == 8 ? 12 : 24
		break
	case '_':
		s.clef_oct_transp = true
	case '-':
		s.clef_octave = clef_def[i + 1] == '8' ? -7 : -14
		if (!s.clef_oct_transp)		// MIDI lower octave
			curvoice.snd_oct = clef_def[i + 1] == 8 ? -12 : -24
		break
	}
	return s
}

// convert an interval to a base-40 interval
function get_interval(param, score) {
    var	i, val, tmp, note, pit

	tmp = new scanBuf;
	tmp.buffer = param
	pit = []
	for (i = 0; i < 2; i++) {
		note = tmp.buffer[tmp.index] ? parse_acc_pit(tmp) : null
		if (!note) {
			if (i != 1 || !score) {
				syntax(1, errs.bad_transp)
				return
			}
			pit[i] = 242			// 'c' (C5)
		} else {
			if (typeof note.acc == "object") {
				syntax(1, errs.bad_transp)
				return
			}
			pit[i] = abc2svg.pab40(note.pit, note.acc)
		}
	}
	return pit[1] - pit[0]
}

// transpose a note for the score
// Return the transposed real accidental
function nt_trans(nt,
		  a) {			// real accidental
    var	ak, an, d, b40, n

	if (typeof a == "object") {		// if microtonal accidental
		n = a[0]			// numerator
		d = a[1]			// denominator
		a = n > 0 ? 1 : -1		// base accidental for transpose
	}

	b40 = abc2svg.pab40(nt.pit, a)
		+ curvoice.tr_sco		// base-40 transposition

	nt.pit = abc2svg.b40p(b40)		// new pitch
	an = abc2svg.b40a(b40)			// new accidental

	if (!d) {				// if not a microtonal accidental
		if (an == -3)			// if triple sharp/flat
			return an
		if (a && !an)
			an = 3			// needed for %%map
		a = an
		if (!nt.acc			// if no old accidental
		 && !curvoice.ckey.k_none)	// and normal key
			a = 0			// no accidental
		nt.acc = a
		return an
	}

	// set the microtonal accidental after transposition
	switch (an) {
	case -2:
		if (n > 0)
			n -= d * 2
		else
			n -= d
		break
	case -1:
		if (n > 0)
			n -= d
		break
	case 0:
	case 3:
		if (n > 0)
			n -= d
		else
			n += d
		break
	case 1:
		if (n < 0)
			n += d
		break
	case 2:
		if (n < 0)
			n += d * 2
		else
			n += d
		break
	}
	nt.acc = [n, d]
	return an
} // nt_trans()

// set the linebreak character
function set_linebreak(param) {
	var i, item

	for (i = 0; i < 128; i++) {
		if (char_tb[i] == "\n")
			char_tb[i] = nil	// remove old definition
	}
	param = param.split(/\s+/)
	for (i = 0; i < param.length; i++) {
		item = param[i]
		switch (item) {
		case '!':
		case '$':
		case '*':
		case ';':
		case '?':
		case '@':
			break
		case "<none>":
			continue
		case "<EOL>":
			item = '\n'
			break
		default:
			syntax(1, "Bad value '$1' in %%linebreak - ignored",
					item)
			continue
		}
		char_tb[item.charCodeAt(0)] = '\n'
	}
}

// set a new user character (U: or %%user)
function set_user(parm) {
    var	k, c, v,
	a = parm.match(/(.)[=\s]*(\[I:.+\]|".+"|!.+!)$/)

	if (!a) {
		syntax(1, 'Lack of starting [, ! or " in U: / %%user')
		return
	}
	c = a[1];
	v = a[2]
	if (c[0] == '\\') {
		if (c[1] == 't')
			c = '\t'
		else if (!c[1])
			c = ' '
	}

	k = c.charCodeAt(0)
	if (k >= 128) {
		syntax(1, errs.not_ascii)
		return
	}
	switch (char_tb[k][0]) {
	case '0':			// nil
	case 'd':
	case 'i':
	case ' ':
		break
	case '"':
	case '!':
	case '[':
		if (char_tb[k].length > 1)
			break
		// fall thru
	default:
		syntax(1, "Bad user character '$1'", c)
		return
	}
	switch (v) {
	case "!beambreak!":
		v = " "
		break
	case "!ignore!":
		v = "i"
		break
	case "!nil!":
	case "!none!":
		v = "d"
		break
	}
	char_tb[k] = v
}

// get a stafflines value
function get_st_lines(param) {
	if (!param)
		return
	if (/^[\]\[|.':-]+$/.test(param))	// '
		return param.replace(/\]/g, '[')

    var	n = +param
	switch (n) {
	case 0: return "..."
	case 1: return "..|"
	case 2: return ".||"
	case 3: return ".|||"
	}
	if (isNaN(n) || n < 0 || n > 16)
		return //undefined
	return "||||||||||||||||".slice(0, n)
}

// create a block symbol in the tune body
function new_block(subtype) {
    var	s = {
			type: C.BLOCK,
			subtype: subtype,
			dur: 0
		}

	sym_link(s)
	return s
}

// set the voice parameters
// (possible hook)
Abc.prototype.set_vp = function(a) {
    var	s, item, pos, val, clefpit,
	tr_p = 0

	while (1) {
		item = a.shift()
		if (!item)
			break
		if (item.slice(-1) == '='
		 && !a.length) {
			syntax(1, errs.bad_val, item)
			break
		}
		switch (item) {
		case "clef=":
			s = a.shift()		// keep last clef
			break
		case "clefpitch=":
			item = a.shift()		// (<note><octave>)
			if (item) {
				val = ntb.indexOf(item[0])
				if (val >= 0) {
					switch (item[1]) {
					case "'":
						val += 7
						break
					case ',':
						val -= 7
						if (item[2] == ',')
							val -= 7
						break
					}
					clefpit = 4 - val	// 4 = 'G'
					break
				}
			}
			syntax(1, errs.bad_val, item)
			break
		case "octave=":
			val = +a.shift()
			if (isNaN(val))
				syntax(1, errs.bad_val, item)
			else
				curvoice.octave = val
			break
		case "cue=":
			// (ignore cue=off)
//			curvoice.scale = a.shift() == 'on' ? .7 : 1
			if (a.shift() == 'on')
				curvoice.scale = .7
			break
		case "instrument=":

			// instrument=M/N => score=MN and sound=cN
			// (instrument=M == instrument=M/M)
			item = a.shift()
			val = item.indexOf('/')
			if (val < 0) {
				val = get_interval('c' + item)
				if (val == undefined)
					break
				curvoice.sound = val
				tr_p |= 2
				val = 0
			} else {
				val = get_interval('c' + item.slice(val + 1))
				if (val == undefined)
					break
				curvoice.sound = val
				tr_p |= 2
				val = get_interval(item.replace('/', ''))
				if (val == undefined)
					break
			}
			curvoice.score = cfmt.sound ? curvoice.sound : val
			tr_p |= 1
			break
		case "map=":			// %%voicemap
			curvoice.map = a.shift()
			break
		case "name=":
		case "nm=":
			curvoice.nm = a.shift()
			if (curvoice.nm[0] == '"')
				curvoice.nm = cnv_escape(curvoice.nm.slice(1, -1))
			curvoice.new_name = true
			break
		case "stem=":			// compatibility
		case "pos=":			// from %%pos only
			if (item == "pos=")
				item = a.shift()
					.slice(1, -1)	// always inside dble quotes
					.split(' ')
			else
				item = ["stm", a.shift()];
			val = posval[item[1]]
			if (val == undefined) {
				syntax(1, errs.bad_val, "%%pos")
				break
			}
			switch (item[2]) {
			case "align": val |= C.SL_ALIGN; break
			case "center": val |= C.SL_CENTER; break
			case "close": val |= C.SL_CLOSE; break
			}
			if (!pos)
				pos = {}
			pos[item[0]] = val
			break
		case "scale=":			// %%voicescale
			val = +a.shift()
			if (isNaN(val) || val < .5 || val > 2)
				syntax(1, errs.bad_val, "%%voicescale")
			else
				curvoice.scale = val
			break
		case "score=":
			if (cfmt.nedo) {
				syntax(1, errs.notransp)
				break
			}
			// score=MN
			// (score=M == score=Mc)
			item = a.shift()
			if (cfmt.sound)
				break
			val = get_interval(item, true)
			if (val != undefined) {
				curvoice.score = val
				tr_p |= 1
			}
			break
		case "shift=":
			if (cfmt.nedo) {
				syntax(1, errs.notransp)
				break
			}
			val = get_interval(a.shift())
			if (val != undefined) {
				curvoice.shift = val
				tr_p = 3
			}
			break
		case "sound=":
			if (cfmt.nedo) {
				syntax(1, errs.notransp)
				break
			}
// concert-score display: apply sound=
// sounding-score display: apply sound= only if M != c/C
// sound: apply sound=
			val = get_interval(a.shift())
			if (val == undefined)
				break
			curvoice.sound = val
			if (cfmt.sound)
				curvoice.score = val
			tr_p |= 2
			break
		case "subname=":
		case "sname=":
		case "snm=":
			curvoice.snm = a.shift()
			if (curvoice.snm[0] == '"')
				curvoice.snm = curvoice.snm.slice(1, -1);
			break
		case "stafflines=":
			val = get_st_lines(a.shift())
			if (val == undefined) {
				syntax(1, "Bad %%stafflines value")
				break
			}
			if (curvoice.st != undefined)
				par_sy.staves[curvoice.st].stafflines = val
			curvoice.stafflines = val
			break
		case "staffnonote=":
			val = +a.shift()
			if (isNaN(val))
				syntax(1, "Bad %%staffnonote value")
			else
				curvoice.staffnonote = val
			break
		case "staffscale=":
			val = +a.shift()
			if (isNaN(val) || val < .3 || val > 2)
				syntax(1, "Bad %%staffscale value")
			else
				curvoice.staffscale = val
			break
		case "tacet=":
			val = a.shift()
			curvoice.tacet = val || undefined
			break
		case "transpose=":		// (abcMIDI compatibility)
			val = get_transp(a.shift())
			if (val == undefined) {
				syntax(1, errs.bad_transp)
			} else {
				curvoice.sound = val
				if (cfmt.sound)
					curvoice.score = val
				tr_p = 2
			}
			break
		default:
			switch (item.slice(0, 4)) {
			case "treb":
			case "bass":
			case "alto":
			case "teno":
			case "perc":
				s = item
				break
			default:
				if ("GFC".indexOf(item[0]) >= 0)
					s = item
				else if (item.slice(-1) == '=')
					a.shift()
				break
			}
			break
		}
	}
	if (pos) {
		curvoice.pos = clone(curvoice.pos)
		for (item in pos)
			if (pos.hasOwnProperty(item))
				curvoice.pos[item] = pos[item]
	}

	if (s) {
		s = new_clef(s)
		if (s) {
			if (clefpit)
				s.clefpit = clefpit
			get_clef(s)
		}
	}

	// if transposition
	if (tr_p & 2) {			// curvoice.tr_sco is set in key_trans()
		tr_p = (curvoice.sound | 0) + (curvoice.shift | 0)
		if (tr_p)
			curvoice.tr_snd = abc2svg.b40m(tr_p + 122) - 36
							// semi-tone interval
		else if (curvoice.tr_snd)
			curvoice.tr_snd = 0
		curvoice.tr_snd40 = tr_p		// (for play chords)
	}
} // set_vp()

// set the K: / V: parameters
function set_kv_parm(a) {	// array of items
	if (!curvoice.init) {	// add the global parameters if not done yet
		curvoice.init = true
		if (info.V) {
			if (info.V[curvoice.id])
				a = info.V[curvoice.id].concat(a)
			if (info.V['*'])
				a = info.V['*'].concat(a)
		}
	}
	if (a.length)
		self.set_vp(a)
} // set_kv_parm()

// memorize the K:/V: parameters
function memo_kv_parm(vid,	// voice ID (V:) / '*' (K:/V:*)
			a) {	// array of items
	if (!a.length)
		return
	if (!info.V)
		info.V = {}
	if (info.V[vid])
		Array.prototype.push.apply(info.V[vid], a)
	else
		info.V[vid] = a
}

// K: key signature
// return the key and the voice/clef parameters
function new_key(param) {
    var	i, key_end, c, tmp, note,
	sf = "FCGDAEB".indexOf(param[0]) - 1,
	mode = 0,
	s = {
		type: C.KEY,
		dur: 0
	}

	set_ref(s);

	// tonic
	i = 1
    if (sf < -1) {
	switch (param[0]) {
	case 'H':				// bagpipe
		key_end = true
		if (param[1].toLowerCase() != 'p') {
			syntax(1, "Unknown bagpipe-like key")
			break
		}
		s.k_bagpipe = param[1];
		sf = param[1] == 'P' ? 0 : 2;
		i++

		// initialize the temperament if not done yet
		if (!cfmt.temper)
	// detune in cents for just intonation in A
	// (from https://patrickmclaurin.com/wordpress/?page_id=2420)
	//  C    ^C     D    _E     E     F    ^F     G    _A     A    _B     B
	// 15.3 -14.0  -2.0 -10.0   1.9  13.3 -16.0 -31.8 -12.0   0.0  11.4   3.8
	// but 'A' bagpipe = 480Hz => raise Math.log2(480/440)*1200 = 151
			cfmt.temper = new Float32Array([
   //	1.66, 1.37, 1.49, 1.41, 1.53, 1.63, 1.35, 1.19, 1.39, 1.51, 1.62, 1.55
   //   C    ^C     D    _E     E     F    ^F     G    _A      A     _B      B
11.62, 12.55,
     1.66, 2.37, 3.49, 0,
     1.66, 2.37, 3.49, 4.41, 5.53, 0,
		 3.49, 4.41, 5.53, 6.63, 7.35,
		       4.41, 5.53, 6.63, 7.35, 8.19, 0,
				   6.63, 7.35, 8.19, 9.39, 10.51, 0,
					       8.19, 9.39, 10.51, 11.62, 12.55, 0,
							   10.51, 11.62, 12.55,
									     1.66, 1.66
			])
		break
	case 'P':
		syntax(1, "K:P is deprecated");
		sf = 0;
		s.k_drum = true;
		key_end = true
		break
	case 'n':				// none
		if (param.indexOf("none") == 0) {
			sf = 0;
			s.k_none = true;
			i = 4
			break
		}
		// fall thru
	default:
		s.k_map = []
		s.k_mode = 0
		return [s, info_split(param)]
	}
    }

	if (!key_end) {
		switch (param[i]) {
		case '#': sf += 7; i++; break
		case 'b': sf -= 7; i++; break
		}
		param = param.slice(i).trim()
		switch (param.slice(0, 3).toLowerCase()) {
		default:
			if (param[0] != 'm'
			 || (param[1] != ' ' && param[1] != '\t'
			  && param[1] != '\n')) {
				key_end = true
				break
			}
			// fall thru ('m')
		case "aeo":
		case "m":
		case "min": sf -= 3;
			mode = 5
			break
		case "dor": sf -= 2;
			mode = 1
			break
		case "ion":
		case "maj": break
		case "loc": sf -= 5;
			mode = 6
			break
		case "lyd": sf += 1;
			mode = 3
			break
		case "mix": sf -= 1;
			mode = 4
			break
		case "phr": sf -= 4;
			mode = 2
			break
		}
		if (!key_end)
			param = param.replace(/\w+\s*/, '')

		// [exp] accidentals
		if (param.indexOf("exp ") == 0) {
			param = param.replace(/\w+\s*/, '')
			if (!param)
				syntax(1, "No accidental after 'exp'");
			s.exp = 1 //true
		}
		c = param[0]
		if (c == '^' || c == '_' || c == '=') {
			s.k_a_acc = [];
			tmp = new scanBuf;
			tmp.buffer = param
			do {
				note = parse_acc_pit(tmp)
				if (!note)
					break
				s.k_a_acc.push(note);
				c = param[tmp.index]
				while (c == ' ')
					c = param[++tmp.index]
			} while (c == '^' || c == '_' || c == '=');
			param = param.slice(tmp.index)
		} else if (s.exp && param.indexOf("none") == 0) {
			sf = 0
			param = param.replace(/\w+\s*/, '')
		}
	}

	if (sf < -7 || sf > 7) {
		syntax(1, "Key with double sharps/flats")
		if (sf > 7)
			sf -= 12
		else
			sf += 12
	}
	s.k_sf = sf;

	// set the map of the notes with accidentals
	s.k_map = s.k_bagpipe && !sf
		? abc2svg.keys[9]		// implicit F# and C#
		: abc2svg.keys[sf + 7]
	if (s.k_a_acc) {
		s.k_map = Array.prototype.slice.call(s.k_map)	// simple Array
		i = s.k_a_acc.length			// (for micro-accidentals)
		while (--i >= 0) {
			note = s.k_a_acc[i]
			s.k_map[(note.pit + 19) % 7] = note.acc
		}
	}
	s.k_mode = mode

	// key note as base-40
	s.k_b40 = [1,24,7,30,13,36,19, 2 ,25,8,31,14,37,20,3][sf + 7]

	return [s, info_split(param)]
}

// M: meter
function new_meter(p) {
    var	p_v,
	s = {
			type: C.METER,
			dur: 0,
			a_meter: []
		},
		meter = {},
		val, v,
		m1 = 0, m2,
		i = 0, j,
		wmeasure,
		in_parenth;

	set_ref(s)

	if (p.indexOf("none") == 0) {
		i = 4;				/* no meter */
		wmeasure = 1;	// simplify measure numbering and C.MREST conversion
	} else {
		wmeasure = 0
		while (i < p.length) {
			if (p[i] == '=')
				break
			switch (p[i]) {
			case 'C':
				meter.top = p[i++]
				if (!m1) {
					m1 = 4;
					m2 = 4
				}
				break
			case 'c':
			case 'o':
				meter.top = p[i++]
				if (!m1) {
					if (p[i - 1] == 'c') {
						m1 = 2;
						m2 = 4	// c = 2/4
					} else {
						m1 = 3;
						m2 = 4	// o = 3/4
					}
					switch (p[i]) {
					case '|':
						m2 /= 2	// c| = 2/2, o| = 3/2
						break
					case '.':
						m1 *= 3;
						m2 *= 2	// c. = 6/8, o. = 9/8
						break
					}
				}
				break
			case '.':
			case '|':
				m1 = 0;
				meter.top = p[i++]
				break
			case '(':
				if (p[i + 1] == '(') {	/* "M:5/4 ((2+3)/4)" */
					in_parenth = true;
					meter.top = p[i++];
					s.a_meter.push(meter);
					meter = {}
				}
				j = i + 1
				while (j < p.length) {
					if (p[j] == ')' || p[j] == '/')
						break
					j++
				}
				if (p[j] == ')' && p[j + 1] == '/') {	/* "M:5/4 (2+3)/4" */
					i++		/* remove the parenthesis */
					continue
				}			/* "M:5 (2+3)" */
				/* fall thru */
			case ')':
				in_parenth = p[i] == '(';
				meter.top = p[i++];
				s.a_meter.push(meter);
				meter = {}
				continue
			default:
				if (p[i] <= '0' || p[i] > '9') {
					syntax(1, "Bad char '$1' in M:", p[i])
					return
				}
				m2 = 2;			/* default when no bottom value */
				meter.top = p[i++]
				for (;;) {
					while (p[i] >= '0' && p[i] <= '9')
						meter.top += p[i++]
					if (p[i] == ')') {
						if (p[i + 1] != '/')
							break
						i++
					}
					if (p[i] == '/') {
						i++;
						if (p[i] <= '0' || p[i] > '9') {
							syntax(1, "Bad char '$1' in M:", p[i])
							return
						}
						meter.bot = p[i++]
						while (p[i] >= '0' && p[i] <= '9')
							meter.bot += p[i++]
						break
					}
					if (p[i] != ' ' && p[i] != '+')
						break
					if (i >= p.length
					 || p[i + 1] == '(')	/* "M:5 (2/4+3/4)" */
						break
					meter.top += p[i++]
				}
				m1 = eval(meter.top.replace(/ /g, '+'))
				break
			}
			if (!in_parenth) {
				if (meter.bot)
					m2 = +meter.bot
				wmeasure += m1 * C.BLEN / m2
			}
			s.a_meter.push(meter);
			meter = {}
			while (p[i] == ' ')
				i++
			if (p[i] == '+') {
				meter.top = p[i++];
				s.a_meter.push(meter);
				meter = {}
			}
		}
	}
	if (p[i] == '=') {
		val = p.substring(++i).match(/^(\d+)\/(\d+)$/)
		if (!val) {
			syntax(1, "Bad duration '$1' in M:", p.substring(i))
			return
		}
		wmeasure = C.BLEN * val[1] / val[2]
	}
	if (!wmeasure) {
		syntax(1, errs.bad_val, 'M:')
		return
	}
	s.wmeasure = wmeasure

	if (cfmt.writefields.indexOf('M') < 0)
		s.a_meter = []

	if (parse.state != 3) {
		info.M = p;
		glovar.meter = s
		if (parse.state) {

			/* in the tune header, change the unit note length */
			if (!glovar.ulen) {
				if (wmeasure <= 1
				 || wmeasure >= C.BLEN * 3 / 4)
					glovar.ulen = C.BLEN / 8
				else
					glovar.ulen = C.BLEN / 16
			}
			for (v = 0; v < voice_tb.length; v++) {
				voice_tb[v].meter = s;
				voice_tb[v].wmeasure = wmeasure
			}
		}
	} else {
		curvoice.wmeasure = wmeasure
		if (is_voice_sig())
			curvoice.meter = s
		else
			sym_link(s)

		// set the meter of the overlay voices
		for (p_v = curvoice.voice_down; p_v; p_v = p_v.voice_down)
			p_v.wmeasure = wmeasure
	}
}

// link P: or Q:
function link_pq(s, text) {
    var	p_v, s2

	if (curvoice.v == par_sy.top_voice) {
		sym_link(s)
	} else if (voice_tb[par_sy.top_voice].time == s.time) {
		p_v = curvoice
		curvoice = voice_tb[par_sy.top_voice]
		sym_link(s)
		curvoice = p_v
	} else if (voice_tb[par_sy.top_voice].time > s.time) {
		p_v = voice_tb[par_sy.top_voice]
		for (s2 = p_v.sym; ; s2 = s2.next) {
			if (s2.time >= s.time) {
				set_ref(s)
				s.fmt = cfmt
				s.next = s2
				s.prev = s2.prev
				if (s2.prev)
					s.prev.next = s
				else
					p_v.sym = s
				s2.prev = s
				s.v = s2.v
				s.p_v = p_v
				s.st = p_v.st
				break
			}
		}
	} else {
		set_ref(s)
		s.fmt = cfmt
		if (!parse.pq_d)
			parse.pq_d = []
		parse.pq_d.push(s)		// delayed insertion
	}
	if (!parse.pq)
		parse.pq = {}
	parse.pq[text] = s.time
} // link_pq()

/* Q: tempo */
function new_tempo(text) {
    var	i, c, d, nd,
	txt = text,			// (for info.Q)
	s = {
		type: C.TEMPO,
		dur: 0
	}

	// get a note duration
	function get_nd(p) {
	    var	n, d,
		nd = p.match(/(\d+)\/(\d+)/)

		if (nd) {
			d = +nd[2]
			if (d && !isNaN(d) && !(d & (d - 1))) {
				n = +nd[1]
				if (!isNaN(n))
					return C.BLEN * n / d
			}
		}
		syntax(1, "Invalid note duration $1", c)
	} // get_nd()

	set_ref(s)

	if (cfmt.writefields.indexOf('Q') < 0)
		s.invis = true			// don't display

	/* string before */
	if (text[0] == '"') {
		c = text.match(/"([^"]*)"/)		// "
		if (!c) {
			syntax(1, "Unterminated string in Q:")
			return
		}
		s.tempo_str1 = c[1]
		text = text.slice(c[0].length).replace(/^\s+/,'')
	}

	// string after
	if (text.slice(-1) == '"') {
		i = text.indexOf('"')
		s.tempo_str2 = text.slice(i + 1, -1)
		text = text.slice(0, i).replace(/\s+$/,'')
	}

	/* beat */
	i = text.indexOf('=')
	if (i > 0) {
		d = text.slice(0, i).split(/\s+/)
		text = text.slice(i + 1).replace(/^\s+/,'')
		while (1) {
			c = d.shift()
			if (!c)
				break
			nd = get_nd(c)
			if (!nd)
				return
			if (!s.tempo_notes)
				s.tempo_notes = []
			s.tempo_notes.push(nd)
		}

		// tempo value
		if (text.slice(0, 4) == "ca. ") {
			s.tempo_ca = 'ca. '
			text = text.slice(4)
		}
		i = text.indexOf('/')
		if (i > 0) {
			nd = get_nd(text)
			if (!nd)
				return
			s.new_beat = nd
		} else {
			s.tempo = +text
			if (!s.tempo || isNaN(s.tempo)) {
				syntax(1, "Bad tempo value")
				return
			}
		}
	}

	if (parse.state < 2			// if in tune header
	 || (!curvoice.time && !glovar.tempo)) {
		info.Q = txt
		glovar.tempo = s
		return
	}

	if (!glovar.tempo)
		syntax(0, "No previous tempo")
	s.time = curvoice.time
	text = 'Q' + (s.tempo_str1 ? 'S' : '') + s.time
						// accept [Q:"text"][Q:1/4=60]
	if (parse.pq
	 && parse.pq[text] == s.time)
		return				// already seen
	link_pq(s, text)
}

// treat the information fields which may embedded
function do_info(info_type, text) {
    var	s, d1, d2, a, vid, tim, v, p_v

	// skip this line if the current voice is ignored
	// but keep the time related definitions
	if (curvoice && curvoice.ignore) {
		switch (info_type) {
		default:
			return
		case 'P':
		case 'Q':
		case 'V':
			break
		}
	}

	switch (info_type) {

	// info fields in any state
	case 'I':
		self.do_pscom(text)
		break
	case 'L':
		a = text.match(/^1\/(\d+)(=(\d+)\/(\d+))?$/)
		if (a) {
			d1 = +a[1]
			if (!d1 || (d1 & (d1 - 1)) != 0)
				break
			d1 = C.BLEN / d1
			if (a[2]) {		// if '='
				d2 = +a[4]
				d2 = d2 ? +a[3] / d2 * C.BLEN : 0
			} else {
				d2 = d1
			}
		} else if (text == "auto") {
			d1 = d2 = -1
		}
		if (!d2) {
			syntax(1, "Bad L: value")
			break
		}
		if (parse.state <= 1) {
			glovar.ulen = d1
		} else {
			curvoice.ulen = d1;
			curvoice.dur_fact = d2 / d1
		}
		break
	case 'M':
		new_meter(text)
		break
	case 'U':
		set_user(text)
		break

	// fields in tune header or tune body
	case 'P':
		if (!parse.state)
			break
		if (parse.state == 1) {
			info.P = text
			break
		}
		s = {
			type: C.PART,
			text: text,
			time: curvoice.time
		}
	    if (info.P) {
		tim = parse.pq && parse.pq[text] // time of previous P: with same text
		if (tim == s.time)
			break				// already seen
		if (tim != null) {
			syntax(1, "Misplaced P:")	// different dates
			break
		}
	    }

		if (cfmt.writefields.indexOf('P') < 0)
			s.invis = 1 //true
		link_pq(s, text)
		break
	case 'Q':
		if (!parse.state)
			break
		new_tempo(text)
		break
	case 'V':
		get_voice(text)
		if (parse.state == 3)
			curvoice.ignore = !par_sy.voices[curvoice.v]
		break

	// key signature at end of tune header or in tune body
	case 'K':
		if (!parse.state)	// ignore if in file header
			break
		get_key(text)
		break

	// info in any state
	case 'N':
	case 'R':
		if (!info[info_type])
			info[info_type] = text
		else
			info[info_type] += '\n' + text
		break
	case 'r':
		if (!user.keep_remark
		 || parse.state != 3)
			break
		s = {
			type: C.REMARK,
			text: text,
			dur: 0
		}
		sym_link(s)
		break
	default:
		syntax(0, "'$1:' line ignored", info_type)
		break
	}
}

// music line parsing functions

/* -- adjust the duration and time of symbols in a measure when L:auto -- */
function adjust_dur(s) {
    var	s2, time, auto_time, i, fac;

	/* search the start of the measure */
	s2 = curvoice.last_sym
	if (!s2)
		return;

	/* the bar time is correct if there are multi-rests */
	if (s2.type == C.MREST
	 || s2.type == C.BAR)			/* in second voice */
		return
	while (s2.type != C.BAR && s2.prev)
		s2 = s2.prev;
	time = s2.time;
	auto_time = curvoice.time - time
	fac = curvoice.wmeasure / auto_time

	if (fac == 1)
		return				/* already good duration */

	for ( ; s2; s2 = s2.next) {
		s2.time = time
		if (!s2.dur || s2.grace)
			continue
		s2.dur *= fac;
		s2.dur_orig *= fac;
		time += s2.dur
		if (s2.type != C.NOTE && s2.type != C.REST)
			continue
		for (i = 0; i <= s2.nhd; i++)
			s2.notes[i].dur *= fac
	}
	curvoice.time = s.time = time
}

/* -- parse a bar -- */
function new_bar() {
	var	s2, c, bar_type,
		line = parse.line,
		s = {
			type: C.BAR,
			fname: parse.fname,
			istart: parse.bol + line.index,
			dur: 0,
			multi: 0		// needed for decorations
		}

	if (vover && vover.bar)			// end of voice overlay
		get_vover('|')
	if (glovar.new_nbar) {			// %%setbarnb
		s.bar_num = glovar.new_nbar;
		glovar.new_nbar = 0
	}
	bar_type = line.char()
	while (1) {
		c = line.next_char()
		switch (c) {
		case '|':
		case '[':
		case ']':
		case ':':
			bar_type += c
			continue
		}
		break
	}
	if (bar_type[0] == ':') {
		if (bar_type == ':') {		// ":" alone
			bar_type = '|';
			s.bar_dotted = true
		} else {
			s.rbstop = 2		// right repeat with end
		}
	}

	// set the annotations and the decorations
	if (a_gch)
		csan_add(s)
	if (a_dcn.length)
		deco_cnv(s)

	/* if the last element is '[', it may start
	 * a chord or an embedded header */
	if (bar_type.slice(-1) == '['
	 && !(/[0-9" ]/.test(c))) {		// "
		bar_type = bar_type.slice(0, -1);
		line.index--;
		c = '['
	}

	// check if a repeat variant
	if (c > '0' && c <= '9') {
		s.text = c
		while (1) {
			c = line.next_char()
			if ("0123456789,.-".indexOf(c) < 0)
				break
			s.text += c
		}
	} else if (c == '"' && bar_type.slice(-1) == '[') {
		s.text = ""
		while (1) {
			c = line.next_char()
			if (!c) {
				syntax(1, "No end of repeat string")
				return
			}
			if (c == '"') {
				line.index++
				break
			}
			s.text += c
		}
	}

	// ']' as the first character indicates a repeat bar stop
	if (bar_type[0] == ']') {
		s.rbstop = 2			// with end
		if (bar_type.length != 1)
			bar_type = bar_type.slice(1)
		else
			s.invis = true
	}

	s.iend = parse.bol + line.index

	if (s.text
	 && bar_type.slice(-1) == '['
	 && bar_type != '[')
		bar_type = bar_type.slice(0, -1)

	// there cannot be variants on a left repeat bar
	if (bar_type.slice(-1) == ':') {	// left repeat
		s.rbstop = 1			// end the bracket
		if (s.text) {
			syntax(1, "Variant ending on a left repeat bar")
			delete s.text
		}
		curvoice.tie_s_rep = null	// no tie anymore on new variant
	}

	// handle the accidentals (ties and repeat)
	if (s.text) {
		s.rbstart = s.rbstop = 2
		if (s.text[0] == '1') {
			curvoice.tie_s_rep = curvoice.tie_s
			if (curvoice.acc_tie)
				curvoice.acc_tie_rep = curvoice.acc_tie.slice()
			else if (curvoice.acc_tie_rep)
				curvoice.acc_tie_rep = null
		} else {
			curvoice.tie_s = curvoice.tie_s_rep
			if (curvoice.acc_tie_rep)
				curvoice.acc_tie = curvoice.acc_tie_rep.slice()
		}
		if (curvoice.norepbra
		 && !curvoice.second)
			s.norepbra = 1 //true
	}

	if (curvoice.ulen < 0)			// L:auto
		adjust_dur(s);

	// merge ":| |:" into "::" and other cases
	if ((bar_type == "[" || bar_type == "|:")
	 && !curvoice.eoln
	 && !s.a_gch && !s.invis) {		// no annotation nor invisible
		s2 = curvoice.last_sym

		// if the previous symbol is also a bar
		if (s2 && s2.type == C.BAR) {
//		&& !s2.a_gch && !s2.a_dd
//		&& !s.a_gch && !s.a_dd) {

				// remove the invisible variant bars
				// when no shift is needed
				if ((bar_type == "["
				  && !s2.text)
				 || s.norepbra) {
					if (s.text) {
						s2.text = s.text
						if (curvoice.st && !s.norepbra
						 && !(par_sy.staves[curvoice.st - 1]
								.flags & STOP_BAR))
							s2.xsh = 4	// volta shift
					}
//					if (s.a_gch)
//						s2.a_gch = s.a_gch
					if (s.norepbra)
						s2.norepbra = 1 //true
					if (s.rbstart)
						s2.rbstart = s.rbstart
					if (s.rbstop)
						s2.rbstop = s.rbstop
//--fixme: pb when on next line and empty staff above
					return
				}

				// merge back-to-back repeat bars
				if (bar_type == "|:") {
					switch (s2.bar_type) {
					case ":|":		// :| + |: => ::
						s2.bar_type = "::";
						s2.rbstop = 2
						return
					}
				}
		}
	}

	/* set some flags */
	switch (bar_type) {
	case "[":
	case "[]":
	case "[|]":
		s.invis = true;
		bar_type = s.rbstart ? "[" : "[]"
		break
	case ":|:":
	case ":||:":
		bar_type = "::"
		break
	case "||":
		if (cfmt["abc-version"] >= "2.2")
			break
		// fall thru - play repeat on double bar when old ABC version
	case "[|":
	case "|]":
		s.rbstop = 2
		break
	}
	s.bar_type = bar_type
	if (!curvoice.lyric_restart)
		curvoice.lyric_restart = s
	if (!curvoice.sym_restart)
		curvoice.sym_restart = s

	sym_link(s);

	s.st = curvoice.st			/* original staff */

	// possibly shift the volta bracket if not on the first staff
	if (s.text && s.st > 0 && !s.norepbra
	 && !(par_sy.staves[s.st - 1].flags & STOP_BAR)
	 && bar_type != '[')
		s.xsh = 4			// volta shift

	if (!s.bar_dotted && !s.invis)
		curvoice.acc = []		// no accidental anymore
}

// parse %%staves / %%score
// return an array of [vid, flags] / null
function parse_staves(p) {
    var	v, vid,
	vids = {},
		a_vf = [],
		err = false,
		flags = 0,
		brace = 0,
		bracket = 0,
		parenth = 0,
		flags_st = 0,
	e,
	a = p.match(/[^[\]|{}()*+\s]+|[^\s]/g)

	if (!a) {
		syntax(1, errs.bad_val, "%%score")
		return // null
	}
	while (1) {
		e = a.shift()
		if (!e)
			break
		switch (e) {
		case '[':
			if (parenth || brace + bracket >= 2) {
				syntax(1, errs.misplaced, '[');
				err = true
				break
			}
			flags |= brace + bracket == 0 ? OPEN_BRACKET : OPEN_BRACKET2;
			bracket++;
			flags_st <<= 8;
			flags_st |= OPEN_BRACKET
			break
		case '{':
			if (parenth || brace || bracket >= 2) {
				syntax(1, errs.misplaced, '{');
				err = true
				break
			}
			flags |= !bracket ? OPEN_BRACE : OPEN_BRACE2;
			brace++;
			flags_st <<= 8;
			flags_st |= OPEN_BRACE
			break
		case '(':
			if (parenth) {
				syntax(1, errs.misplaced, '(');
				err = true
				break
			}
			flags |= OPEN_PARENTH;
			parenth++;
			flags_st <<= 8;
			flags_st |= OPEN_PARENTH
			break
		case '*':
			if (brace && !parenth && !(flags & (OPEN_BRACE | OPEN_BRACE2)))
				flags |= FL_VOICE
			break
		case '+':
			flags |= MASTER_VOICE
			break
		case ']':
		case '}':
		case ')':
			syntax(1, "Bad voice ID in %%score");
			err = true
			break
		default:	// get / create the voice in the voice table
			vid = e
			while (1) {
				e = a.shift()
				if (!e)
					break
				switch (e) {
				case ']':
					if (!(flags_st & OPEN_BRACKET)) {
						syntax(1, errs.misplaced, ']');
						err = true
						break
					}
					bracket--;
					flags |= brace + bracket == 0 ?
							CLOSE_BRACKET :
							CLOSE_BRACKET2;
					flags_st >>= 8
					continue
				case '}':
					if (!(flags_st & OPEN_BRACE)) {
						syntax(1, errs.misplaced, '}');
						err = true
						break
					}
					brace--;
					flags |= !bracket ?
							CLOSE_BRACE :
							CLOSE_BRACE2;
					flags &= ~FL_VOICE;
					flags_st >>= 8
					continue
				case ')':
					if (!(flags_st & OPEN_PARENTH)) {
						syntax(1, errs.misplaced, ')');
						err = true
						break
					}
					parenth--;
					flags |= CLOSE_PARENTH;
					flags_st >>= 8
					continue
				case '|':
					flags |= STOP_BAR
					continue
				}
				break
			}
			if (vids[vid]) {
				syntax(1, "Double voice in %%score")
				err = true
			} else {
				vids[vid] = true
				a_vf.push([vid, flags])
			}
			flags = 0
			if (!e)
				break
			a.unshift(e)
			break
		}
	}
	if (flags_st != 0) {
		syntax(1, "'}', ')' or ']' missing in %%score");
		err = true
	}
	if (err || !a_vf.length)
		return //null
	return a_vf
}

// split an info string
function info_split(text) {
	if (!text)
		return []
    var	a = text.match(/[^\s"=]+=?|"[^"]*"/g)	// "
	if (!a) {
//fixme: bad error text
		syntax(1, "Unterminated string")
		return []
	}
	return a
}

// parse a duration and return [numerator, denominator]
// 'line' is not always 'parse.line'
var reg_dur = /(\d*)(\/*)(\d*)/g		/* (stop comment) */

function parse_dur(line) {
	var res, num, den;

	reg_dur.lastIndex = line.index;
	res = reg_dur.exec(line.buffer)
	if (!res[0])
		return [1, 1];
	num = res[1] || 1;
	den = res[3] || 1
	if (!res[3])
		den *= 1 << res[2].length;
	line.index = reg_dur.lastIndex
	return [+num, +den]
}

// parse the note accidental and pitch
function parse_acc_pit(line) {
    var	note, acc, pit, d, nd,
	c = line.char()

	// optional accidental
	switch (c) {
	case '^':
		c = line.next_char()
		if (c == '^') {
			acc = 2;
			c = line.next_char()
		} else {
			acc = 1
		}
		break
	case '=':
		acc = 3;
		c = line.next_char()
		break
	case '_':
		c = line.next_char()
		if (c == '_') {
			acc = -2;
			c = line.next_char()
		} else {
			acc = -1
		}
		break
	}

	/* look for microtone value */
	if (acc == 1 || acc == -1) {
	    if ((c >= '1' && c <= '9')
	     || c == '/') {			// shortcut
		nd = parse_dur(line);
		if (acc < 0)
			nd[0] = -nd[0]
		if (cfmt.nedo && nd[1] == 1) {
			nd[0] *= 12
			nd[1] *= cfmt.nedo
		}
		acc = nd
		c = line.char()
	    }
	}

	/* get the pitch */
	pit = ntb.indexOf(c) + 16;
	c = line.next_char()
	if (pit < 16) {
		syntax(1, "'$1' is not a note", line.buffer[line.index - 1])
		return //undefined
	}

	// octave
	while (c == "'") {
		pit += 7;
		c = line.next_char()
	}
	while (c == ',') {
		pit -= 7;
		c = line.next_char()
	}
	note = {
		pit: pit,
		shhd: 0,
		shac: 0
	}
	if (acc)
		note.acc = acc
	return note
}

// return the mapping of a note
//
// The global 'maps' object is indexed by the map name.
// Its content is an object ('map') indexed from the map type:
// - normal = ABC note
// - octave = 'o' + ABC note in C..B interval
// - key    = 'k' + scale index
// - tonic  = 't' + mode index
// - any    = '*'
// The 'map' is stored in the note. It is an array of
//	[0] array of heads (glyph names)
//	[1] print (note)
//	[2] color
//	[3] play (note)
function set_map(p_v, note, acc,
		trp_p) {			// flag "do transpose?"
    var	nn = not2abc(note.pit, acc),
	map = maps[p_v.map]

	if (!map)
		return

	// test if 'nn' is in the map
	function map_p() {
		if (map[nn])
			return 1 //true
	    var	sf, d

		nn = 'o' + nn.replace(/[',]+/, '')	// '
		if (map[nn])
			return 1 //true
//fixme: useless
		d = abc2svg.keys[p_v.ckey.k_sf + 7][(note.pit + 75) % 7]
		d = (!d && acc == 3) ? 0 : acc
		nn = 'k' + ['__','_','','^','^^','='][d + 2]	// key chromatic
			+ ntb[(note.pit + 75 - p_v.ckey.k_sf * 11) % 7]
		if (map[nn])
			return 1 //true
		nn = nn.replace(/[_=^]/g,'')		// key diatonic
		if (map[nn])
			return 1 //true
		sf = p_v.ckey.k_sf + [0, 2, 4, -1, 1, 3, -2][p_v.ckey.k_mode]
		if (sf < -7)
			sf += 7
		else if (sf > 7)
			sf -= 7
		d = abc2svg.keys[sf + 7]
				[(note.pit + 75) % 7]
		if (d && acc == 3)
			d = -d
		else if (!d && !acc)
			d = 3
		else
			d = acc - d
		nn = 't' + ['__','_','=','^','^^','']	// tonic chromatic
				[d + 2]
			+ ntb[(note.pit + 75 - p_v.ckey.k_mode
				 - p_v.ckey.k_sf * 11) % 7]
		if (map[nn])
			return 1 //true
		nn = nn.replace(/[_=^]/g,'')		// tonic diatonic
		if (map[nn])
			return 1 //true
		nn = '*'				// any note
		return map[nn]
	} // map_p()

	if (!map_p())					// note in the map?
		return					// no
	map = map[nn]

	if (trp_p) {
		if (map[1] && map[1].notrp)
			note.notrp = 1 //true	// no transpose
		return
	}

	if (map[1]				// if note transpose
	 && !note.map) {			// for the first time
			note.pit = map[1].pit
			note.acc = map[1].acc
			if (map[1].notrp) {
				note.notrp = 1 //true	// no transpose
				note.noplay = 1 //true	// no play
			}
	}
	note.map = map

	if (map[2])				// if color
		note.color = map[2]
	nn = map[3]
	if (nn)					// if play map
		note.midi = pit2mid(nn.pit + 19, nn.acc)
}

/* -- parse note or rest with pitch and length -- */
// 'line' is not always 'parse.line'
function parse_basic_note(line, ulen) {
	var	nd,
		note = parse_acc_pit(line)

	if (!note)
		return //null

	// duration
	if (line.char() == '0') {		// compatibility
		parse.stemless = true;
		line.index++
	}
	nd = parse_dur(line);
	note.dur = ulen * nd[0] / nd[1]
	return note
}

function parse_vpos() {
	var	line = parse.line,
		ty = 0

	if (a_dcn.length && a_dcn[a_dcn.length - 1] == "dot") {
		ty = C.SL_DOTTED
		a_dcn.pop()
	}
	switch (line.next_char()) {
	case "'":
		line.index++
		return ty + C.SL_ABOVE
	case ",":
		line.index++
		return ty + C.SL_BELOW
	case '?':				// slur between staves (like ~)
		line.index++
		return ty + C.SL_CENTER
	}
	return ty + C.SL_AUTO
}

// on end of slur, create the slur
function slur_add(s, nt) {		// nt = note if slur ending on note
    var	i, s2, sl

	// go back and find the last start of slur
	for (i = curvoice.sls.length; --i >= 0; ) {
		sl = curvoice.sls[i]

		// the slur must not start and stop on a same symbol
		if (sl.ss == s)
			continue
		curvoice.sls.splice(i, 1)
		sl.se = s			// ending symbol
		if (nt)
			sl.nte = nt
		s2 = sl.ss			// start of slur
		if (!s2.sls)
			s2.sls = []
		s2.sls.push(sl)

		// set a flag if the slur starts on a grace note
		if (sl.grace)
			sl.grace.sl1 = true
		return
	}

	// the lack of a starting slur may be due to a repeat
	for (s2 = s.prev; s2; s2 = s2.prev) {
		if (s2.type == C.BAR
		 && s2.bar_type[0] == ':'
		 && s2.text) {
			if (!s2.sls)
				s2.sls = [];
			s2.sls.push({
//fixme: should go back to the bar "|1" and find the slur type...
				ty: C.SL_AUTO,
				ss: s2,
				se: s
			})
			if (nt)
				s2.sls[s2.sls.length - 1].nte = nt
			return
		}
	}
//	syntax(1, "End of slur without start")
	if (!s.sls)
		s.sls = [];
	s.sls.push({
		ty: C.SL_AUTO,
		se: s,
		loc: 'i'			// no slur start
	})
	if (nt)
		s.sls[s.sls.length - 1].nte = nt
}

// convert a diatonic pitch and accidental to a MIDI pitch with cents
function pit2mid(pit, acc) {
    var	p = [0, 2, 4, 5, 7, 9, 11][pit % 7],	// chromatic pitch
	o = ((pit / 7) | 0) * 12,		// octave
	p0, p1, s, b40

	if (curvoice.snd_oct)
		o += curvoice.snd_oct
	if (acc == 3)				// if natural accidental
		acc = 0
	if (acc) {
		if (typeof acc == "object") {
			s = acc[0] / acc[1]	// microtonal accidental
			if (acc[1] == 100)	// in cents
				return p + o + s
		} else {
			s = acc			// simple accidental
		}
	} else {
		if (cfmt.temper)
			return cfmt.temper[abc2svg.p_b40[pit % 7]] + o
		return p + o
	}
	if (!cfmt.nedo) {			// non equal temperament
		if (!cfmt.temper) {
			p += o + s		// standard temperament
			return p
		}
	} else {				// equal temperament
		p0 = cfmt.temper[abc2svg.p_b40[pit % 7]]	// main note
		if (typeof acc != "object") {	// if not a fraction
			b40 = abc2svg.p_b40[pit % 7] + acc
			p1 = cfmt.temper[b40]
			if (s > 0) {			// sharp
				if (p1 < p0)
					p1 += 12
			} else {
				if (p1 > p0)
					p1 -= 12
			}
			return p1 + o
		}

		if (acc[1] == cfmt.nedo) {	// fraction with the edo divider
			b40 = abc2svg.p_b40[pit % 7]
			return cfmt.temper[b40] + o + s
		}
	}

	p0 = cfmt.temper[abc2svg.p_b40[pit % 7]]	// main note
	if (s > 0) {					// sharp
		p1 = cfmt.temper[(abc2svg.p_b40[pit % 7] + 1) % 40]
		if (p1 < p0)
			p1 += 12
	} else {					// flat
		p1 = cfmt.temper[(abc2svg.p_b40[pit % 7] + 39) % 40]
		if (p1 > p0)
			p1 -= 12
		s = -s
	}
	return p0 + o + (p1 - p0) * s
} // pit2mid()

// handle the ties
// @s = tie ending smbol
// @tei_s = tie starting symbol
function do_ties(s, tie_s) {
    var	i, m, not1, not2, mid, g,
	nt = 0,
	se = (tie_s.time + tie_s.dur) == curvoice.time	// 'start-end' flag

	for (m = 0; m <= s.nhd; m++) {
		not2 = s.notes[m]
		mid = not2.midi
		if (tie_s.type != C.GRACE) {
			for (i = 0; i <= tie_s.nhd; i++) {
				not1 = tie_s.notes[i]
				if (!not1.tie_ty)
					continue
				if (not1.midi == mid
				 && (!se
				  || !not1.tie_e)) {	// (if unison)
					not2.tie_s = not1
					not2.s = s
					if (se) {
						not1.tie_e = not2
						not1.s = tie_s
					}
					nt++
					break
				}
			}
		} else {
			for (g = tie_s.extra; g; g = g.next) {
				not1 = g.notes[0]	// (fixme: only one note)
				if (!not1.tie_ty)
					continue
				if (not1.midi == mid) {
					g.ti1 = true
					not2.tie_s = not1
					not2.s = s
					not1.tie_e = not2
					not1.s = g
					nt++
					break
				}
			}
		}
	}

	if (!nt)
		error(1, tie_s, "Bad tie")
	else
		s.ti2 = true
} // do_ties()

// (possible hook)
Abc.prototype.new_note = function(grace, sls) {
    var	note, s, in_chord, c, tie_s, acc_tie,
	i, n, s2, nd, res, num, apit, div, ty,
	chdur = 1,
	dpit = 0,
	sl1 = [],
	line = parse.line,
	a_dcn_sav = a_dcn		// save parsed decoration names

	a_dcn = []
	parse.stemless = false;
	s = {
		type: C.NOTE,
		fname: parse.fname,
		stem: 0,
		multi: 0,
		nhd: 0,
		xmx: 0
	}
	s.istart = parse.bol + line.index

	if (curvoice.color)
		s.color = curvoice.color

	if (grace) {
		s.grace = true
	} else {
		if (curvoice.tie_s) {	// if tie from previous note / grace note
			tie_s = curvoice.tie_s
			curvoice.tie_s = null
		}
		if (a_gch)
			csan_add(s)
		if (parse.repeat_n) {
			s.repeat_n = parse.repeat_n;
			s.repeat_k = parse.repeat_k;
			parse.repeat_n = 0
		}
	}
	c = line.char()
	switch (c) {
	case 'X':
		s.invis = true
	case 'Z':
		s.type = C.MREST;
		c = line.next_char()
		s.nmes = (c > '0' && c <= '9') ? line.get_int() : 1;
		if (curvoice.wmeasure == 1) {
			error(1, s, "multi-measure rest, but no measure!")
			return
		}
		s.dur = curvoice.wmeasure * s.nmes

		// convert 'Z'/'Z1' to a whole measure rest
		if (s.nmes == 1) {
			s.type = C.REST;
			s.dur_orig = s.dur;
			s.fmr = 1		// full measure rest
			s.notes = [{
				pit: 18,
				dur: s.dur
			}]
		} else {
			glovar.mrest_p = true
			if (par_sy.voices.length == 1) {
				s.tacet = curvoice.tacet
				delete s.invis	// show the 'H' when 'Xn'
			}
		}
		break
	case 'y':
		s.type = C.SPACE;
		s.invis = true;
		s.dur = 0;
		c = line.next_char()
		if (c >= '0' && c <= '9')
			s.width = line.get_int()
		else
			s.width = 10
		if (tie_s) {
			curvoice.tie_s = tie_s
			tie_s = null
		}
		break
	case 'x':
		s.invis = true
	case 'z':
		s.type = C.REST;
		line.index++;
		nd = parse_dur(line);
		s.dur_orig = ((curvoice.ulen < 0) ?
					C.BLEN :
					curvoice.ulen) * nd[0] / nd[1];
		if (s.dur_orig < 12) {
			error(0, s, "Bad note duration $1", s.dur_orig)
			s.dur_orig = 12
		}
		s.dur = s.dur_orig * curvoice.dur_fact;
		if (s.dur == curvoice.wmeasure)
			s.fmr = 1		// full measure rest
		s.notes = [{
			pit: 18,
			dur: s.dur_orig
		}]
		break
	case '[':			// chord
		in_chord = true;
		c = line.next_char()
		i = line.buffer.indexOf(']', line.index)
		if (i < 0) {
			syntax(1, "No end of chord")
			return
		}
		n = line.index			// save the parser index
		line.index = i + 1		// set the parser to the end of chord
		nd = parse_dur(line)
		chdur = nd[0] / nd[1]		// length factor of the chord
		in_chord = reg_dur.lastIndex	// hack: index after the chord length
		line.index = n			// restore the parser index
		// fall thru
	default:			// accidental, chord, note
		if (curvoice.acc_tie) {
			acc_tie = curvoice.acc_tie
			curvoice.acc_tie = null
		}
		s.notes = []

		// loop on the chord
		while (1) {

			// when in chord, get the slurs and decorations
			if (in_chord) {
				while (1) {
					if (!c)
						break
					i = c.charCodeAt(0);
					if (i >= 128) {
						syntax(1, errs.not_ascii)
						return //null
					}
					ty = char_tb[i]
					switch (ty[0]) {
					case '(':
						sl1.push(parse_vpos());
						c = line.char()
						continue
					case '!':
						if (ty.length > 1)
							a_dcn.push(ty.slice(1, -1))
						else
							get_deco()	// line -> a_dcn
						c = line.next_char()
						continue
					}
					break
				}
			}
			note = parse_basic_note(line,
					s.grace ? C.BLEN / 4 :
					curvoice.ulen < 0 ?
						C.BLEN :
						curvoice.ulen)
			if (!note)
				return //null

			note.dur *= chdur		// chord factor
			if (note.dur < 12) {
				error(0, s, "Bad note duration $1", note.dur)
				note.dur = 12
			}

			if (curvoice.octave)
				note.pit += curvoice.octave * 7

			// get the real accidental
			apit = note.pit + 19		// pitch from C-1
			i = note.acc
			if (!i) {
				if (cfmt["propagate-accidentals"][0] == 'p')
					i = curvoice.acc[apit % 7]
				else
					i = curvoice.acc[apit]
				if (!i)
					i = curvoice.ckey.k_map[apit % 7] || 0
			}

			if (i
			 && !curvoice.ckey.k_drum) {
				if (cfmt["propagate-accidentals"][0] == 'p')
					curvoice.acc[apit % 7] = i
				else if (cfmt["propagate-accidentals"][0] != 'n')
					curvoice.acc[apit] = i
			}

			if (acc_tie && acc_tie[apit])
				i = acc_tie[apit]	// tied note

			// set the MIDI pitch
			if (!note.midi)		// if not map play
				note.midi = pit2mid(apit, i)

			// transpose
			if (curvoice.tr_sco) {
				set_map(curvoice, note, i, 1)	// possible transpose?
			    if (!note.notrp) {			// yes
				i = nt_trans(note, i)
				if (i == -3) {		// if triple sharp/flat
					error(1, s, "triple sharp/flat")
					i = note.acc > 0 ? 1 : -1
					note.pit += i
					note.acc = i
				}
				dpit = note.pit + 19 - apit
			    }
			}
			if (curvoice.tr_snd)
				note.midi += curvoice.tr_snd
			if (curvoice.map)
				set_map(curvoice, note, i)

//fixme: does not work if transposition
			if (i) {
				switch (cfmt["writeout-accidentals"][1]) {
				case 'd':			// added
					s2 = curvoice.ckey
					if (!s2.k_a_acc)
						break
					for (n = 0; n < s2.k_a_acc.length; n++) {
						if ((s2.k_a_acc[n].pit - note.pit)
								% 7 == 0) {
							note.acc = i
							break
						}
					}
					break
				case 'l':			// all
					note.acc = i
					break
				}
			}

			// starting slurs
			if (sl1.length) {
				while (1) {
					i = sl1.shift()
					if (!i)
						break
					curvoice.sls.push({
						ty: i,
						ss: s,
						nts: note	// starting note
					})
				}
			}
			s.notes.push(note)
			if (!in_chord)
				break

			// in chord: get the ending slurs and the ties
			c = line.char()
			while (1) {
				switch (c) {
				case ')':
					slur_add(s, note)
					c = line.next_char()
					continue
				case '-':
					note.tie_ty = parse_vpos()
					note.s = s
					curvoice.tie_s = s
					s.ti1 = true
					if (curvoice.acc[apit]
					 || (acc_tie
					  && acc_tie[apit])) {
						if (!curvoice.acc_tie)
							curvoice.acc_tie = []
						i = curvoice.acc[apit]
						if (acc_tie && acc_tie[apit])
							i = acc_tie[apit]
						curvoice.acc_tie[apit] = i
					}
					c = line.char()
					continue
				case '.':
					c = line.next_char()
					switch (c) {
					case '-':
					case '(':
						a_dcn.push("dot")
						continue
					}
					syntax(1, "Misplaced dot")
					break
				}
				break
			}
			if (a_dcn.length) {
				s.time = curvoice.time	// (needed for !tie)!
				dh_cnv(s, note)
			}

			if (c == ']') {
				line.index = in_chord
				s.nhd = s.notes.length - 1
				break
			}
		}

		// handle the starting slurs
		if (sls.length) {
			while (1) {
				i = sls.shift()
				if (!i)
					break
				curvoice.sls.push({
					ty: i,
					ss: s
					// no starting note
				})
				if (grace)
					curvoice.sls[curvoice.sls.length - 1].grace =
										grace
			}
		}

		// the duration of the chord is the duration of the 1st note
		s.dur_orig = s.notes[0].dur;
		s.dur = s.notes[0].dur * curvoice.dur_fact
		break
	}
	if (s.grace && s.type != C.NOTE) {
		syntax(1, errs.bad_grace)
		return //null
	}

	if (s.notes) {				// if note or rest
		if (!s.fmr) {			// (but not full measure rest)
			n = s.dur_orig / 12	// check its duration
			i = 0
			while (!(n & 1)) {
				n >>= 1
				i++
			}
			if ((n + 1) & n)
				error(0, s, "Non standard note duration $1",
					n + '/' + (1 << (6 - i)))
		}
		if (!grace) {
			switch (curvoice.pos.stm & 0x07) {
			case C.SL_ABOVE: s.stem = 1; break
			case C.SL_BELOW: s.stem = -1; break
			case C.SL_HIDDEN: s.stemless = true; break
			}

			// adjust the symbol duration
			num = curvoice.brk_rhythm
			if (num) {
				curvoice.brk_rhythm = 0;
				s2 = curvoice.last_note
				if (num > 0) {
					n = num * 2 - 1;
					s.dur = s.dur * n / num;
					s.dur_orig = s.dur_orig * n / num
					for (i = 0; i <= s.nhd; i++)
						s.notes[i].dur =
							s.notes[i].dur * n / num;
					s2.dur /= num;
					s2.dur_orig /= num
					for (i = 0; i <= s2.nhd; i++)
						s2.notes[i].dur /= num
				} else {
					num = -num;
					n = num * 2 - 1;
					s.dur /= num;
					s.dur_orig /= num
					for (i = 0; i <= s.nhd; i++)
						s.notes[i].dur /= num;
					s2.dur = s2.dur * n / num;
					s2.dur_orig = s2.dur_orig * n / num
					for (i = 0; i <= s2.nhd; i++)
						s2.notes[i].dur =
							s2.notes[i].dur * n / num
				}
				curvoice.time = s2.time + s2.dur;

				// adjust the time of the grace notes, bars...
				for (s2 = s2.next; s2; s2 = s2.next)
					s2.time = curvoice.time
			}
		} else {		/* grace note - adjust its duration */
			div = curvoice.ckey.k_bagpipe ? 8 : 4
			for (i = 0; i <= s.nhd; i++)
				s.notes[i].dur /= div;
			s.dur /= div;
			s.dur_orig /= div
			if (grace.stem)
				s.stem = grace.stem
		}

		curvoice.last_note = s

		// get the possible ties and end of slurs
		c = line.char()
		while (1) {
			switch (c) {
			case '.':
				if (line.buffer[line.index + 1] != '-')
					break
				a_dcn.push("dot")
				line.index++
				// fall thru
			case '-':
				ty = parse_vpos()
				for (i = 0; i <= s.nhd; i++) {
					s.notes[i].tie_ty = ty
					s.notes[i].s = s
				}
				curvoice.tie_s = grace || s
				curvoice.tie_s.ti1 = true
				for (i = 0; i <= s.nhd; i++) {
					note = s.notes[i]
					apit = note.pit + 19	// pitch from C-1
						- dpit		// (if transposition)
					if (curvoice.acc[apit]
					 || (acc_tie
					  && acc_tie[apit])) {
						if (!curvoice.acc_tie)
							curvoice.acc_tie = []
						n = curvoice.acc[apit]
						if (acc_tie && acc_tie[apit])
							n = acc_tie[apit]
						curvoice.acc_tie[apit] = n
					}
				}
				c = line.char()
				continue
			}
			break
		}

		// handle the ties ending on this chord/note
		if (tie_s)		// if tie from previous note / grace note
			do_ties(s, tie_s)
	}

	sym_link(s)

	if (!grace) {
		if (!curvoice.lyric_restart)
			curvoice.lyric_restart = s
		if (!curvoice.sym_restart)
			curvoice.sym_restart = s
	}

	if (a_dcn_sav.length) {
		a_dcn = a_dcn_sav
		deco_cnv(s, s.prev)
	}
	if (grace && s.ottava)
		grace.ottava = s.ottava
	if (parse.stemless)
		s.stemless = true
	s.iend = parse.bol + line.index
	return s
}

// adjust the duration of the elements in a tuplet
function tp_adj(s, fact) {
    var	d,
	tim = s.time,
	to = curvoice.time - tim,	// previous delta time
	tt = to * fact			// new delta time

	curvoice.time = tim + tt
	while (1) {
//fixme: tuplets in grace notes?
		s.in_tuplet = true
		if (!s.grace) {
			s.time = tim
			if (s.dur) {
				d = Math.round(s.dur * tt / to)	// new duration
				to -= s.dur		// old remaining time
				s.dur = d
				tt -= s.dur		// new remaining time
				tim += s.dur
			}
		}
		if (!s.next) {
			if (s.tpe)
				s.tpe++
			else
				s.tpe = 1
			break
		}
		s = s.next
	}
} // tp_adj()

// get a decoration
function get_deco() {
    var	c,
	line = parse.line,
	i = line.index,		// in case no deco end
	dcn = ""

	while (1) {
		c = line.next_char()
		if (!c) {
			line.index = i
			syntax(1, "No end of decoration")
			return
		}
		if (c == '!')
			break
		dcn += c
	}
	a_dcn.push(dcn)
} // get_deco()

// characters in the music line (ASCII only)
var nil = "0",
    char_tb = [
	nil, nil, nil, nil,		/* 00 - .. */
	nil, nil, nil, nil,
	nil, " ", "\n", nil,		/* . \t \n . */
	nil, nil, nil, nil,
	nil, nil, nil, nil,
	nil, nil, nil, nil,
	nil, nil, nil, nil,
	nil, nil, nil, nil,		/* .. - 1f */
	" ", "!", '"', "i",		/* (sp) ! " # */
	"\n", nil, "&", nil,		/* $ % & ' */
	"(", ")", "i", nil,		/* ( ) * + */
	nil, "-", "!dot!", nil,		/* , - . / */
	nil, nil, nil, nil, 		/* 0 1 2 3 */
	nil, nil, nil, nil, 		/* 4 5 6 7 */
	nil, nil, "|", "i",		/* 8 9 : ; */
	"<", "n", "<", "i",		/* < = > ? */
	"i", "n", "n", "n",		/* @ A B C */
	"n", "n", "n", "n", 		/* D E F G */
	"!fermata!", "d", "d", "d",	/* H I J K */
	"!emphasis!", "!lowermordent!",
		"d", "!coda!",		/* L M N O */
	"!uppermordent!", "d",
		"d", "!segno!",		/* P Q R S */
	"!trill!", "d", "d", "d",	/* T U V W */
	"n", "d", "n", "[",		/* X Y Z [ */
	"\\","|", "n", "n",		/* \ ] ^ _ */
	"i", "n", "n", "n",	 	/* ` a b c */
	"n", "n", "n", "n",	 	/* d e f g */
	"d", "d", "d", "d",		/* h i j k */
	"d", "d", "d", "d",		/* l m n o */
	"d", "d", "d", "d",		/* p q r s */
	"d", "!upbow!",
		"!downbow!", "d",	/* t u v w */
	"n", "n", "n", "{",		/* x y z { */
	"|", "}", "!gmark!", nil,	/* | } ~ (del) */
] // char_tb[]

function parse_music_line() {
	var	grace, last_note_sav, a_dcn_sav, no_eol, s, tps,
		tp = [],
		tpn = -1,
		sls = [],
		line = parse.line

	// check if a transposing macro matches a source sequence
	// if yes return the base note
	function check_mac(m) {
	    var	i, j, b

		for (i = 1, j = line.index + 1; i < m.length; i++, j++) {
			if (m[i] == line.buffer[j])
				continue
			if (m[i] != 'n')		// search the base note
				return //undefined
			b = ntb.indexOf(line.buffer[j])
			if (b < 0)
				return //undefined
			while (line.buffer[j + 1] == "'") {
				b += 7;
				j++
			}
			while (line.buffer[j + 1] == ',') {
				b -= 7;
				j++
			}
		}
		line.index = j
		return b
	} // check_mac()

	// convert a note as a number into a note as a ABC string
	function n2n(n) {
	    var	c = ''

		while (n < 0) {
			n += 7;
			c += ','
		}
		while (n >= 14) {
			n -= 7;
			c += "'"
		}
		return ntb[n] + c
	} // n2n()

	// expand a transposing macro
	function expand(m, b) {
		if (b == undefined)		// if static macro
			return m
	    var	c, i,
		r = "",				// result
		n = m.length

		for (i = 0; i < n; i++) {
			c = m[i]
			if (c >= 'h' && c <= 'z') {
				r += n2n(b + c.charCodeAt(0) - 'n'.charCodeAt(0))
			} else {
				r += c
			}
		}
		return r
	} // expand()

	// parse a macro
	function parse_mac(k, m, b) {
	    var	te, ti, curv, s,
		line_sav = line,
		istart_sav = parse.istart;

		parse.line = line = new scanBuf;
		parse.istart += line_sav.index;

		// if the macro is not displayed
		if (cfmt.writefields.indexOf('m') < 0) {

			// build the display sequence from the original sequence
			line.buffer = k.replace('n', n2n(b))
			s = curvoice.last_sym
			ti = curvoice.time		// start time
			parse_seq(true)
			if (!s)
				s = curvoice.sym
			for (s = s.next ; s; s = s.next)
				s.noplay = true
			te = curvoice.time		// end time
			curv = curvoice

			// and put the macro sequence in a play specific voice
			curvoice = clone_voice(curv.id + '-p')
			if (!par_sy.voices[curvoice.v]) {
				curvoice.second = true
				par_sy.voices[curvoice.v] = {
					st: curv.st,
					second: true,
					range: curvoice.v
				}
			}
			curvoice.time = ti
			s = curvoice.last_sym
			parse.line = line = new scanBuf
			parse.istart += line_sav.index
			line.buffer = expand(m, b)
			parse_seq(true)
			if (curvoice.time != te)
				syntax(1, "Bad length of the macro sequence")
			if (!s)
				s = curvoice.sym
			for ( ; s; s = s.next)
				s.invis = s.play = true
			curvoice = curv
		} else {
			line.buffer = expand(m, b)
			parse_seq(true)
		}

		parse.line = line = line_sav
		parse.istart = istart_sav
	} // parse_mac()

	// parse a music sequence
	function parse_seq(in_mac) {
	    var	c, idx, type, k, s, dcn, i, n, text, note

		while (1) {
			c = line.char()
			if (!c)
				break

			// check if start of a macro
			if (!in_mac && maci[c]) {
				n = undefined
				for (k in mac) {
					if (!mac.hasOwnProperty(k)
					 || k[0] != c)
						continue
					if (k.indexOf('n') < 0) {
						if (line.buffer.indexOf(k, line.index)
								!= line.index)
							continue
						line.index += k.length
					} else {
						n = check_mac(k)
						if (n == undefined)
							continue
					}
					parse_mac(k, mac[k], n)
					n = 1
					break
				}
				if (n)
					continue
			}

			idx = c.charCodeAt(0)
			if (idx >= 128) {
				syntax(1, errs.not_ascii)
				line.index++
				break
			}

			type = char_tb[idx]
			switch (type[0]) {
			case ' ':			// beam break
				s = curvoice.last_note
				if (s) {
					s.beam_end = true
					if (grace)
						grace.gr_shift = true
				}
				break
			case '\n':			// line break
				if (cfmt.barsperstaff)
					break
				curvoice.eoln = true
				break
			case '&':			// voice overlay
				if (grace) {
					syntax(1, errs.bad_grace)
					break
				}
				c = line.next_char()
				if (c == ')') {
					get_vover(c)	// full overlay stop
					break
				}
				get_vover('&')
				continue
			case '(':			// slur start - tuplet - vover
				c = line.next_char()
				if (c > '0' && c <= '9') {	// tuplet
					if (grace) {
						syntax(1, errs.bad_grace)
						break
					}
				    var	pplet = line.get_int(),
					qplet = qplet_tb[pplet],
					rplet = pplet

					c = line.char()
					if (c == ':') {
						c = line.next_char()
						if (c > '0' && c <= '9') {
							qplet = line.get_int();
							c = line.char()
						}
						if (c == ':') {
							c = line.next_char()
							if (c > '0' && c <= '9') {
								rplet = line.get_int();
								c = line.char()
							} else {
								syntax(1, "Invalid 'r' in tuplet")
								continue
							}
						}
					}
					if (qplet == 0 || qplet == undefined)
						qplet = (curvoice.wmeasure % 9) == 0 ?
									3 : 2;
					if (tpn < 0)
						tpn = tp.length	// new tuplet
					tp.push({
						p: pplet,
						q: qplet,
						r: rplet,
						ro: rplet,
						f: curvoice.tup || cfmt.tuplets
					})
					continue
				}
				if (c == '&') {		// voice overlay start
					if (grace) {
						syntax(1, errs.bad_grace)
						break
					}
					get_vover('(')
					break
				}
				line.index--;
				sls.push(parse_vpos())
				continue
			case ')':			// slur end
				s = curvoice.last_sym
				if (s) {
					switch (s.type) {
					case C.SPACE:
						if (!s.notes) {
							s.notes = []
							s.notes[0] = {}
						}
					case C.NOTE:
					case C.REST:
						break
					case C.GRACE:

						// stop the slur on the last grace note
						for (s = s.extra; s.next; s = s.next)
							;
						break
					default:
						s = null
						break
					}
				}
				if (!s) {
					syntax(1, errs.bad_char, c)
					break
				}
				slur_add(s)
				break
			case '!':			// start of decoration
				if (type.length > 1)	// decoration letter
					a_dcn.push(type.slice(1, -1))
				else
					get_deco()	// (line -> a_dcn)
				break
			case '"':
				if (grace) {
					syntax(1, errs.bad_grace)
					break
				}
				parse_gchord(type)
				break
			case '[':
				if (type.length > 1) {	// U: [I:xxx]
					self.do_pscom(type.slice(3, -1))
					break
				}
			    var c_next = line.buffer[line.index + 1]

				if ('|[]: "'.indexOf(c_next) >= 0
				 || (c_next >= '1' && c_next <= '9')) {
					if (grace) {
						syntax(1, errs.bar_grace)
						break
					}
					new_bar()
					continue
				}
				if (line.buffer[line.index + 2] == ':') {
					if (grace) {
						syntax(1, errs.bad_grace)
						break
					}
					i = line.buffer.indexOf(']', line.index + 1)
					if (i < 0) {
						syntax(1, "Lack of ']'")
						break
					}
					text = line.buffer.slice(line.index + 3, i).trim()

					parse.istart = parse.bol + line.index;
					parse.iend = parse.bol + ++i;
					line.index = 0;
					do_info(c_next, text);
					line.index = i
					continue
				}
				// fall thru ('[' is start of chord)
			case 'n':				// note/rest
				s = self.new_note(grace, sls)
				if (!s)
					continue

				// handle the tuplets
				if (grace || !s.notes)
					continue

				if (tpn >= 0) {		// new tuplet
					s.tp = tp.slice(tpn)
					tpn = -1
					if (tps)
						s.tp[0].s = tps	// if nested
					tps = s
				} else if (!tps) {
					continue	// no tuplet active
				}

				k = tp[tp.length - 1]
				if (--k.r > 0)
					continue	// not end of tuplet yet

				while (1) {
					tp_adj(tps, k.q / k.p)
					i = k.ro	// number of notes of this tuplet
					if (k.s)
						tps = k.s  // start of upper tuplet

					tp.pop()		// previous level
					if (!tp.length) {
						tps = null	// done
						break
					}
					k = tp[tp.length - 1]
					k.r -= i
					if (k.r > 0)
						break
				}
				continue
			case '<':				/* '<' and '>' */
				if (!curvoice.last_note) {
					syntax(1, "No note before '<'")
					break
				}
				if (grace) {
					syntax(1, "Cannot have a broken rhythm in grace notes")
					break
				}
				n = c == '<' ? 1 : -1
				while (c == '<' || c == '>') {
					n *= 2;
					c = line.next_char()
				}
				curvoice.brk_rhythm = n
				continue
			case 'i':				// ignore
				break
			case '{':
				if (grace) {
					syntax(1, "'{' in grace note")
					break
				}
				last_note_sav = curvoice.last_note;
				curvoice.last_note = null;
				a_dcn_sav = a_dcn;
				a_dcn = []
				grace = {
					type: C.GRACE,
					fname: parse.fname,
					istart: parse.bol + line.index,
					dur: 0,
					multi: 0
				}
				if (curvoice.color)
					grace.color = curvoice.color
				switch (curvoice.pos.gst & 0x07) {
				case C.SL_ABOVE: grace.stem = 1; break
				case C.SL_BELOW: grace.stem = -1; break
				case C.SL_HIDDEN: grace.stem = 2; break	/* opposite */
				}
				sym_link(grace);
				c = line.next_char()
				if (c == '/') {
					grace.sappo = true	// acciaccatura
					break
				}
				continue
			case '|':
				if (grace) {
					syntax(1, errs.bar_grace)
					break
				}
				new_bar()
				continue
			case '}':
				if (curvoice.ignore) {
					grace = null
					break
				}
				s = curvoice.last_note
				if (!grace || !s) {
					syntax(1, errs.bad_char, c)
					break
				}
				if (a_dcn.length)
					syntax(1, "Decoration ignored");
				grace.extra = grace.next;
				grace.extra.prev = null;
				grace.next = null;
				curvoice.last_sym = grace;
				grace = null
				if (!s.prev			// if one grace note
				 && !curvoice.ckey.k_bagpipe) {
					for (i = 0; i <= s.nhd; i++)
						s.notes[i].dur *= 2;
					s.dur *= 2;
					s.dur_orig *= 2
				}
				curvoice.last_note = last_note_sav;
				a_dcn = a_dcn_sav
				break
			case "\\":
				if (!line.buffer[line.index + 1]) {
					no_eol = true
					break
				}
				// fall thru
			default:
				syntax(1, errs.bad_char, c)
				break
			}
			line.index++
		}
	} // parse_seq()

	if (parse.state != 3)		// if not in tune body
		return

	if (parse.tp) {
		tp = parse.tp
		tpn = parse.tpn
		tps = parse.tps
		parse.tp = null
	}

	parse_seq()

	if (tp.length) {
		parse.tp = tp
		parse.tps = tps
		parse.tpn = tpn
	}
	if (sls.length)
		syntax(1, "Start of slur without note")
	if (grace) {
		syntax(1, "No end of grace note sequence");
		curvoice.last_sym = grace.prev;
		curvoice.last_note = last_note_sav
		if (grace.prev)
			grace.prev.next = null
	}
	if (!no_eol && !cfmt.barsperstaff && !vover
	 && char_tb['\n'.charCodeAt(0)] == '\n')
		curvoice.eoln = true
	if (curvoice.eoln && cfmt.breakoneoln && curvoice.last_note)
		curvoice.last_note.beam_end = true
}
