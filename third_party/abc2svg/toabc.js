// abc2svg - toabc.js - convert ABC to ABC
//
// Copyright (C) 2016-2024 Jean-Francois Moine
//
// This file is part of abc2svg.
//
// abc2svg is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// abc2svg is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with abc2svg.  If not, see <http://www.gnu.org/licenses/>.

// constants from core/abc2svg.js
    var	C = abc2svg.C,

	OPEN_BRACE = 0x01,
	CLOSE_BRACE = 0x02,
	OPEN_BRACKET = 0x04,
	CLOSE_BRACKET = 0x08,
	OPEN_PARENTH = 0x10,
	CLOSE_PARENTH = 0x20,
	STOP_BAR = 0x40,
	FL_VOICE = 0x80,
	OPEN_BRACE2 = 0x0100,
	CLOSE_BRACE2 = 0x0200,
	OPEN_BRACKET2 = 0x0400,
	CLOSE_BRACKET2 = 0x0800,
	MASTER_VOICE = 0x1000

    var	deco_l = {			// decorations
		dot: '.',
		fermata: 'H',
		emphasis: 'L',
		lowermordent: 'M',
		coda: 'O',
		uppermordent: 'P',
		segno: 'S',
		trill: 'T',
		upbow: 'u',
		downbow: 'v',
		roll: '~'
	},
	old_font = [],
	mode_tb = [			// key modes
		[0, ""],
		[2, "dor"],
		[4, "phr"],
		[-1, "lyd"],
		[1, "mix"],
		[3, "m"],
		[5, "loc"]
	],
	k_tb = [			// key names
		"Cb", "Gb", "Db", "Ab", "Eb", "Bb", "F",
		"C",
		"G", "D", "A", "E", "B", "F#", "C#", "G#", "D#", "A#"
	]

function abc_dump(tsfirst, voice_tb, info, cfmt) {
    var	i, v, s, g, line, ulen, tmp, tmp2, grace, bagpipe, curv,
	cfmtg = abc.cfmt(),	// global format
	nv = voice_tb.length,
	vo = [],		// dump line per voice
	vold = [],		// false/true for voice name
	vti = []

	// dump an information field on voice 'v'
	function info_out(inf) {
		if (vo[v].length && vo[v].slice(-1) != '\n')
			line += '[' + inf + ']'
		else
			line += inf + '\n'
	} // info_out()

	function voice_out() {
		function vi_out(v) {
		    var	p_voice = voice_tb[v],
			ln = voice_tb.length == 1 ? '' : 'V:' + p_voice.id

			curv = v
			if (!vold[v]) {
				vold[v] = true
				if (ln		// if not the only voice
				 && p_voice.clef
				 && p_voice.clef.clef_type != 'a')
					ln += ' ' + clef_dump(p_voice.clef)
				if (p_voice.nm) {
					ln += ' nm="' + p_voice.nm + '"'
					font_def("voice", p_voice.nm)
				}
				if (p_voice.snm)
					ln += ' snm="' + p_voice.snm + '"';
				if (p_voice.scale != 1)
					ln += ' scale=' + p_voice.scale
				if (p_voice.uscale)
					ln += ' microscale=' + p_voice.uscale
			}
			if (ln)
				abc2svg.print(ln)

			if (p_voice.instr) {
				for (var s = p_voice.sym; s && s.time == 0; s = s.next) {
					if (s.subtype == "midiprog") {
						p_voice.instr = null
						break
					}
				}
//fixme: the MIDI program may be the one of the channel 10
				if (p_voice.clef.clef_type == "p")
					p_voice.instr = null
				if (p_voice.instr)
					abc2svg.print("%%MIDI program " + p_voice.instr)
				p_voice.instr = null
			}
			if (p_voice.midictl) {
				if (p_voice.midictl[0] == 1
				 && p_voice.midictl[32] == 0) {
					delete p_voice.midictl[0]
					delete p_voice.midictl[32]
					abc2svg.print("%%MIDI channel 10")
				}
				for (k in p_voice.midictl)
					abc2svg.print("%%MIDI control " +
						k + ' ' + p_voice.midictl[k])
				p_voice.midictl = null
			}
			if (p_voice.chn != undefined) {
				abc2svg.print("%%MIDI channel " + (p_voice.chn + 1))
				p_voice.chn = undefined
			}
//fixme: to do
//			if (p_voice.mididrum) {
//				p_voice.mididrum = null
//			}
		} // vi_out()

		for (var v = 0; v < nv; v++) {
			if (vo[v].length == 0)
				continue
			vi_out(v);
			if (vo[v].slice(-1) == '\n')
				vo[v] = vo[v].slice(0, -1)
			abc2svg.print(vo[v])
			vo[v] = ""
		}
	} // voice_out()

	function block_dump(s) {
	    var	ln = "%%" + s.subtype + ' '
		switch (s.subtype) {
		case "midichn":
			s.p_v.chn = s.chn
			s.time = -1	// force %%MIDI
			return
		case "midictl":
			if (!s.p_v.midictl)
				s.p_v.midictl = []
			s.p_v.midictl[s.ctrl] = s.val
			s.time = -1	// force %%MIDI
			return
		case "midiprog":
			s.p_v.instr = s.instr
			s.time = -1	// force %%MIDI
			return
		case "ml":
			ln += s.text
			break
		default:
			ln += s.param
			break
		case "sep":
			ln += s.sk1.toFixed(1) + ' ' +
				s.l.toFixed(1) + ' ' +
				s.sk2.toFixed(1)
			break
		case "skip":
			ln += s.sk
			break
		case "text":
			font_def("text", s.text)
			if (s.text.indexOf('\n') <= 0
			 && (!s.opt || s.opt == 'c')) {
				if (s.opt == 'c')
					ln = "%%center " + s.text
				else
					ln += s.text
				break
			}
			ln = "%%begintext"
			switch (s.opt) {
			case 'c': ln += " center"; break
			case 'f': ln += " fill"; break
			case 'j': ln += " justify"; break
			case 'r': ln += " right"; break
			}
			abc2svg.print(ln +
				'\n%%' + s.text.replace(/\n/g, '\n%%') +
				"\n%%endtext")
			return
		case "title":
			abc2svg.print('T:' + s.text.replace(/\n/g, '\nT:'))
			return
		}
		abc2svg.print(ln)
	} // block_dump()

	function clef_dump(s) {
	    var	ln
		switch (s.clef_type) {
		case 't': ln = "treble"; break
		case 'c': ln = "alto"; break
		case 'b': ln = "bass"; break
		case 'a': ln = "auto"; break
		case 'p': ln = "perc"; break
		default:  ln = s.clef_name; break
		}
		if (s.clef_octave == 7)
			ln += (s.clef_oct_transp ? '^' : '+') + '8'
		else if (s.clef_octave == -7)
			ln += (s.clef_oct_transp ? '_' : '-') + '8'
		return "clef=" + ln
	} // clef_dump()

	function deco_dump(a_dd) {
	    var	i, n, dd,
		ln = ""

//fixme: check if user deco
		for (i = 0; i < a_dd.length; i++) {
			dd = a_dd[i]
			n = dd.name
			if (dd.ty) {
				if (dd.ty != '@')
					line += '!' +dd.ty + n + '!'
				else
					line += '!@' + dd.x + ',' + dd.y + n + '!'
			} else {
				if (deco_l[n])
					line += deco_l[n]
				else
					line += '!' + n + '!'
			}
		}
		return ln
	} // deco_dump

	function dur_dump(dur, grace) {
	    var	d = 0,
		l = grace ? C.BLEN / 4 : ulen,
		ln = ""

		if (dur == l)
			return ""
		while (1) {
			if (dur % l == 0) {
				dur /= l
				if (dur != 1)
					ln += dur.toString()
				break
			}
			dur *= 2
if (d > 6) {
abc2svg.print("% *** bad duration")
break
}
			d++
		}
		if (d > 0)
			ln += "//////".slice(0, d)
		return ln
	} // dur_dump()

    var	ft_w = ['', 'Thin', 'ExtraLight', 'Light', 'Regular',
		'Medium', 'Demi', 'Bold', 'ExtraBold', 'Black']

	function font_def(fn, p) {
	    var	c, f,
		i = p.indexOf('$')

		abc.get_font(fn)		// used font
// fixme: one '$' only
		if (i >= 0) {
			c = p[i + 1]
			if (c >= '1' && c <= '9') {
				c = "u" + c
				f = cfmt[c + "font"]		// user font
//				f.fid = abc.get_font(c).fid	// dump it!
				f.fid = 100 + +c
				f.used = 1
			}
		}
		font_dump()		// dump the new fonts
	} // font_def()

	function font_dump() {
	    var	k, f, def
//		fs = abc.get_font_style().split("\n").shift()

		for (k in cfmt) {
			if (k.slice(-4) != "font")
				continue
			f = cfmt[k]
//			if (f.fid == undefined)
			if (!f.used)
				continue	// not used
			if (old_font[f.fid])
				continue	// already out
			old_font[f.fid] = true
			def = f.name || ""
			if (f.weight)
				def += ft_w[(f.weight / 100) | 0]
			if (f.style)
				def += f.style[0].toUpperCase() + f.style.slice(1)
			if (!def)
				def = "*"
			def += ' ' + (f.size || "*")
			if (f.box)
				def += ' box'
			if (f.pad)
				def += ' padding=' + f.pad.toFixed(1)
			if (f.class)
				def += ' class=' + f.class
			if (f.wadj) {
				def += ' wadj='
				switch (f.wadj) {
				case 'spacing':
					def += 'space'
					break
				case 'spacingAndGlyphs':
					def += 'glyph'
					break
				default:
					def += 'none'
					break
				}
			}
			if (k[0] == "u")
				k = "setfont-" + k[1]
			abc2svg.print('%%' + k + ' ' + def)
		}
	} // font_dump()

	function gch_dump(a_gch) {
	    var i, j, gch

		for (i = 0; i < a_gch.length; i++) {
			gch = a_gch[i]
			font_def(gch.type == 'g' ? "gchord" : "annotation", gch.text)
			line += '"';
			switch (gch.type) {
			case 'g':
				for (j = 0; j < gch.text.length; j++) {
					switch (gch.text.charCodeAt(j)) {
					case 0x266d:
						line += 'b'
						break
					case 0x266e:
						line += '='
						break
					case 0x266f:
						line += '#'
						break
					default:
						line += gch.text[j]
						break
					}
				}
				line += '"'
				continue
			case '@':
				line += '@' + gch.x + ',' + gch.y
				break
			default:
				line += gch.type
			}
			line += gch.text + '"'
		}
	} // gch_dump()

	function header_dump(hl) {
	    var l, i
		for (i = 0; i < hl.length; i++) {
			l = hl[i]
			if (info[l])
				abc2svg.print(l + ':' + info[l].replace(/\n/g, '\n' + l + ':'))
		}
	} // header_dump()

	function key_dump(s, clef) {
	    var	ln, i, a

		if (s.k_bagpipe) {
			bagpipe = true			// for grace notes
			ln = "K:H" + s.k_bagpipe
		} else if (s.k_drum) {
			ln = "K:P"
		} else if (s.k_none) {
			ln = "K:none"
		} else {
			ln = "K:"
			ln += k_tb[s.k_sf + 7 + mode_tb[s.k_mode][0]]
			ln += mode_tb[s.k_mode][1]
		}
		a = s.k_a_acc				// accidental list
		if (a) {
			if (s.k_exp)
				ln += ' exp'
			ln += ' '
			for (i = 0; i < a.length; i++)
				ln += note_dump({}, a[i])
		}

		if (clef && clef.clef_type != 'a')
			ln += ' ' + clef_dump(clef)
//fixme: to continue
		return ln
	} // key_dump()

	function lyric_dump() {
	    var	v, s, i, ly, nly, t, w

		for (v = 0; v < nv; v++) {
			nly = 0;
			w = []
			for (s = voice_tb[v].sym; s; s = s.next) {
				ly = s.a_ly
				if (ly)
					while (nly < ly.length)
						w[nly++] = ""
			}
			if (nly == 0)
				continue
			for (s = voice_tb[v].sym; s; s = s.next) {
				if (s.type != C.NOTE)
					continue
				if (!s.a_ly) {
					for (i = 0; i < nly; i++)
						w[i] += "*"
					continue
				}
				for (i = 0; i < nly; i++) {
					ly = s.a_ly[i]
					if (!w[i])
						w[i] = ""
					if (!ly) {
						w[i] += '*'
						continue
					}
					t = ly.t
					if (ly.ln) {
						w[i] += t
						if (ly.ln == 1)
							w[i] += '-'
					} else {
						t = t.replace(/ /g, '~')
						t = t.replace(/-/g, '\\-')
						if (t.slice(-1) != "-")
							t += ' '
						w[i] += t
					}
				}
			}
			if (w.length != 0) {
				if (voice_tb.length > 1)
					abc2svg.print("V:" + voice_tb[v].id)
				for (i = 0; i < w.length; i++)
					abc2svg.print("w:" + w[i].replace(/\*+$/,""))
			}
		}
	} // lyric_dump()

	function meter_dump(s) {
	    var	i, ln
		if (s.wmeasure == 1)
			return "M:none"
		ln = "M:"
		for (i = 0; i < s.a_meter.length; i++) {
			if (i != 0)
				ln += ' ';
			ln += s.a_meter[i].top
			if (s.a_meter[i].bot)
				ln += '/' + s.a_meter[i].bot
		}
		return ln
	} // meter_dump()

	function note_dump(s, note, tie_ch) {
	    var	p, j, sl, s2, a, d,
		ln = ""

		if (note.sl1)
			ln += slti_dump(note.sl1, '(')
		if (note.a_dd)
			ln += deco_dump(note.a_dd)
		if (note.color)
			ln += "!" + note.color + "!"
		a = note.acc
		if (typeof a == "object") {
			d = a[1]
			a = a[0]
			if (a > 0) {
				ln += '^'
			} else {
				ln += '_'
				a = -a
			}
			ln += dur_dump(C.BLEN / 4 * a / d, true)
		} else {
			switch (a) {
			case -2: ln += '__'; break
			case -1: ln += '_'; break
			case 1: ln += '^'; break
			case 2: ln += '^^'; break
			case 3: ln += '='; break
			}
		}
		p = note.pit
		if (p >= 23) {
			ln += "abcdefg"[p % 7]
			if (p >= 30) {
				ln += "'"
				if (p >= 37)
					ln += "'"
			}
		} else {
			p += 7;			// for very low notes
			ln += "ABCDEFG"[p % 7]
			if (p < 23) {
				ln += ","
				if (p < 16) {
					ln += ","
					if (p < 9)
						ln += ","
				}
			}
		}
		if (!tie_ch && note.tie_ty)
			ln += slti_dump(note.tie_ty, '-')
		while (note.sl2) {
			ln += ')'
			note.sl2--
		}
		return ln
	} // note_dump()

	function slti_dump(fl, ty) {
	    var	ln = ""

		if (fl & C.SL_DOTTED)
			ln += '.'
		ln += ty
		switch (fl & 0x07) {
		case C.SL_ABOVE:
			ln += "'"
			break
		case C.SL_BELOW:
			ln += ','
			break
		}
		return ln
	} // slti_dump()

//fixme: missing: '+' (master voice) and '*' (floating voice)
	function staves_dump(s) {
	    var	v, p_v, staff, ln,
		in_parenth,
		vn = [],
		st = -1,
		sy = s.sy;

		curv = -1;
		ln = "%%score "
		for (v = 0; v < sy.voices.length; v++) {
			p_v = sy.voices[v]
			if (p_v)
				vn[p_v.range] = v
		}
		for (v = 0; v < sy.voices.length; v++) {
			if (vn[v] == undefined || vn[v] < 0)
				continue
			p_v = sy.voices[vn[v]]
			if (p_v.st != st) {
				if (st >= 0) {
					if (in_parenth) {
						ln += ')';
						in_parenth = false
					}
					if (staff.flags & CLOSE_BRACE2)
						ln += '}'
					if (staff.flags & CLOSE_BRACE)
						ln += '}'
					if (staff.flags & CLOSE_BRACKET2)
						ln += ']'
					if (staff.flags & CLOSE_BRACKET)
						ln += ']'
					if (!(staff.flags & STOP_BAR))
						ln += '| '
				}
				staff = sy.staves[++st]
				if (staff.flags & OPEN_BRACKET)
					ln += '['
				if (staff.flags & OPEN_BRACKET2)
					ln += '['
				if (staff.flags & OPEN_BRACE)
					ln += '{'
				if (staff.flags & OPEN_BRACE2)
					ln += '{'
				if (v < vn.length - 1
				 && vn[v + 1] != undefined
				 && vn[v + 1] >= 0
				 && voice_tb[vn[v + 1]].second) {
					ln += '(';
					in_parenth = true
				}
			}
			ln += voice_tb[vn[v]].id + ' '
		}
		if (in_parenth)
			ln += ')'
		if (staff.flags & CLOSE_BRACE2)
			ln += '}'
		if (staff.flags & CLOSE_BRACE)
			ln += '}'
		if (staff.flags & CLOSE_BRACKET2)
			ln += ']'
		if (staff.flags & CLOSE_BRACKET)
			ln += ']';

		// output the following bars
		for (s = s.ts_next; s; s = s.ts_next) {
			if (s.type != C.BAR)
				break
			if (s.time != vti[s.v])
				continue
			sym_dump(s);
			s.del = true
			if (line) {
				vo[s.v] += line
				line = ""
			}
		}
		voice_out();
		abc2svg.print(ln)
		for (v = 0; v < nv; v++)
			vti[v] = s.time
	} // staves_dump()

	function tempo_dump(s) {
	    var	i,
		ln = 'Q:'

		function qdur_dump(dur) {
		    var	d = 0,
			l = C.BLEN
			if (dur == l)
				ln += "1/1"
			while (1) {
				if (dur % l == 0) {
					dur /= l;
					ln += dur.toString()
					break
				}
				dur *= 2
				d++
			}
			if (d > 0)
				ln += '/' + Math.pow(2, d)
		} // qdur_dump()

		if (s.tempo_str1)
			ln += '"' + s.tempo_str1 + '"'
		if (s.tempo_notes && s.tempo_notes.length > 0) {
			for (i = 0; i < s.tempo_notes.length; i++) {
				if (i != 0)
					ln += ' ';
				qdur_dump(s.tempo_notes[i])
			}
		}
		if (s.tempo || s.new_beat) {
			ln += '='
			if (s.tempo_ca)
				ln += s.tempo_ca
			if (s.tempo)
				ln += s.tempo
			else
				qdur_dump(s.new_beat)
		}
		if (s.tempo_str2)
			ln += '"' + s.tempo_str2 + '"'
		info_out(ln)
	} // tempo_dump()

	function tuplet_dump(s) {
	    var	tp

		while (1) {
			tp = s.tp.shift()
			if (!tp)
				break
			line += '(' + tp.p
			if (tp.ro == tp.p
			 && ((tp.p == 2 && tp.q == 3)
			  || (tp.p == 3 && tp.q == 2)
			  || (tp.p == 4 && tp.q == 3)))
				;
			else
				line += ':' + tp.q + ':' + tp.ro
		}
	} // tuplet_dump()

	function sym_dump(s) {
	    var	tie_ch, i, sl

		if (s.repeat_n) {
			if (s.repeat_n < 0)
				line += "[I:repeat " + (-s.repeat_n).toString() +
					' ' + s.repeat_k + ']'
			else
				line += "[I:repeat " + s.repeat_n +
					' ' + s.repeat_k + ']'
		}
		if (s.tp)
			tuplet_dump(s)
		if (s.sls) {
			for (i = 0; i < s.sls.length; i++) {
				sl = s.sls[i];
				if (sl.loc != 'i'
				 && !s.bar_type) {
					if (sl.nts)
						sl.nts.sl1 = sl.ty
					else
						line += slti_dump(sl.ty, '(')
				}
				if (sl.nte) {
					if (sl.nte.sl2)
						sl.nte.sl2++
					else
						sl.nte.sl2 = 1
				} else if (sl.se) {
					if (sl.se.sl2)
						sl.se.sl2++
					else
						sl.se.sl2 = 1
				}
			}
		}
		if (s.a_gch)
			gch_dump(s.a_gch)
		if (s.a_dd)
			line += deco_dump(s.a_dd)
		if (s.color)
			line += "!" + s.color + "!"
		switch (s.type) {
		case C.BAR:
			if (s.beam_on)
				line += "!beamon!"
			if (s.bar_dotted)
				line += '.';
			line += s.bar_type
			if (s.text) {
				if (s.bar_type != '[')
					line += '['
				if (s.text[0] >= '0' && s.text[0] <= '9')
					line += s.text + ' '
				else
					line += '"' + s.text + '"'
			}
			break
		case C.CLEF:
			info_out("K: " + clef_dump(s))
			break
		case C.CUSTOS:
			break
		case C.GRACE:
			line += '{'
			if (s.sappo)
				line += '/'
			for (g = s.extra; g; g = g.next)
				sym_dump(g)
			if (s.gr_shift)
				line += ' ';
			line += '}'
			break
		case C.KEY:
			info_out(key_dump(s))
			break
		case C.METER:
			info_out(meter_dump(s))
			break
		case C.MREST:
			line += s.invis ? 'X' : 'Z'
			if (s.nmes != 1)
				line += s.nmes
			break
		case C.NOTE:
			if (s.stem) {			// if forced stem direction
				if (s.stem > 0) {
					if (s.p_v.pos.stm != C.SL_ABOVE) {
						s.p_v.pos.stm = C.SL_ABOVE
						line += "[I:pos stem up]"
					}
				} else {
					if (s.p_v.pos.stm != C.SL_BELOW) {
						s.p_v.pos.stm = C.SL_BELOW
						line += "[I:pos stem down]"
					}
				}
			}
			tie_ch = s.ti1
			if (s.notes.length == 1) {
				line += note_dump(s, s.notes[0], tie_ch)
			} else {
				for (i = 0; i < s.notes.length; i++) {
					if (!s.notes[i].tie_ty) {
						tie_ch = false
						break
					}
				}
				line += '['
				for (i = 0; i < s.notes.length; i++)
					line += note_dump(s, s.notes[i], tie_ch)
				line += ']'
			}
			if (s.grace) {
				if (bagpipe) {
					tmp = s.dur * 8
				} else {
					tmp = s.dur * 2
					if (s.prev || s.next)
						tmp *= 2
				}
				line += dur_dump(tmp, true)
			} else {
				tmp = s.notes[0].dur	// head duration
				if (s.trem2)
					tmp /= 2;
				line += dur_dump(tmp)
			}
			if (tie_ch)
				line += slti_dump(s.notes[0].tie_ty, '-')
			tmp = s.sl2
			while (tmp) {
				line += ')';
				tmp--
			}
			break
		case C.TEMPO:
			if ((s.invis && cfmt.writefields.indexOf('Q') >= 0)
			 || (!s.invis && cfmt.writefields.indexOf('Q') < 0)) {
				voice_out()
				if (s.invis) {
					abc2svg.print("%%writefields Q 0")
					cfmt.writefields =
						cfmt.writefields.replace('Q', '')
				} else {
					abc2svg.print("%%writefields Q 1")
					cfmt.writefields += 'Q'
				}
			}
			tempo_dump(s)
			break
		case C.REST:
			line += (s.invis ? 'x' : 'z') + dur_dump(s.dur_orig)
			break
		case C.SPACE:
			line += 'y'
			if (s.width != 10)
				line += s.width
			break
		case C.STAVES:
			if (nv == 1)
				break
			staves_dump(s)
			break
		case C.STBRK:
			if (vo[v].length && vo[v].slice(-1) != '\n')
				line += '[I:staffbreak ' + s.xmx.toString() +
					(s.stbrk_forced ? ' f' : '') + ']'
			else
				line += '%%staffbreak ' + s.xmx.toString() +
					(s.stbrk_forced ? ' f' : '') + '\n'
			break
		case C.BLOCK:
			voice_out();
			block_dump(s)
			break
		case C.REMARK:
			info_out('r:' + s.text)
			break
		default:
			voice_out();
			abc2svg.print('% ??sym: ' + abc2svg.sym_name[s.type])
			break
		}
	} // sym_dump()

	function wf_dump() {
	    var i, a,
		wf = "CMOPQsTWw"	// default printed fields

		if (cfmt.writefields == wf)
			return
		a = ""
		for (i = 0; i < cfmt.writefields.length; i++) {
			if (wf.indexOf(cfmt.writefields[i]) < 0)
				a += cfmt.writefields[i]
		}
		if (a)
			abc2svg.print('%%writefields ' + a + " 1")
		a = ""
		for (i = 0; i < wf.length; i++) {
			if (cfmt.writefields.indexOf(wf[i]) < 0)
				a += wf[i]
		}
		if (a)
			abc2svg.print('%%writefields ' + a + " 0")
	} // wf_dump()

	font_dump()

	abc2svg.print('\nX:' + info['X'])
	if (cfmt["abc-version"] != cfmtg["abc-version"])
		abc2svg.print("%%abc-version " + cfmt["abc-version"])
	header_dump("TC")

	abc2svg.print(meter_dump(voice_tb[0].meter));

	ulen = voice_tb[0].ulen < 0 ? C.BLEN / 4 : voice_tb[0].ulen;
	abc2svg.print('L:1/' + (C.BLEN / ulen).toString());

	header_dump("OABDFGRNPSZH")

	wf_dump()

	for (v = 0; v < nv; v++) {
		vo[v] = ""
		vti[v] = 0
	}

	if (info.Q) {
		abc2svg.print("Q:" + info.Q)
		for (s = tsfirst; s; s = s.ts_next) {
			if (s.time)
				break
			if (s.type == C.TEMPO)
				s.del = true
		}
	}

	abc2svg.print(key_dump(voice_tb[0].key, voice_tb[0].clef))

	// loop by time
	for (s = tsfirst; s; s = s.ts_next) {
		v = s.v
		if (s.soln && s.seqst) {
			vo[v] += '$'
			voice_out()
		}
		if (s.part) {			// new part
			voice_out()
			q = s.part
			if (q.invis && cfmt.writefields.indexOf('P') >= 0) {
				abc2svg.print("%%writefields P 0")
				cfmt.writefields =
						cfmt.writefields.replace('P', '')
			} else if (!q.invis && cfmt.writefields.indexOf('P') < 0) {
				abc2svg.print("%%writefields P 1")
				cfmt.writefields += 'P'
			}
			font_def("parts", q.text)
			abc2svg.print('P:' + q.text)
		}
		line = "";

		// (all voices are synchronized on %%score)
		if (s.type != C.STAVES && s.time > vti[v]) {
//fixme: put 'X' if more than one measure
			if (s.time > vti[v] + 2) {
				line += 'x' + dur_dump(s.time - vti[v])
			}
			vti[v] = s.time
		}
		sym_dump(s)
		if (s.dur) {
			vti[v] = s.time + s.dur
			if (s.dur < C.BLEN / 4 && s.beam_end
			 && s.next && s.next.dur && s.next.dur < C.BLEN / 4)
				line += ' '
		}
		if (line)
			vo[v] += line
	}
	voice_out();
	lyric_dump();
	header_dump("W")
} // abc_dump()

// -- local functions
abc2svg.abc_init = function(args) {
	abc2svg.args = args.join(' ')
}

abc2svg.abc_end = function() {
    var	t,
	tunes = abc.tunes.slice(0)	// get a copy of the generated tunes

	t = abc.cfmt()["abc-version"]
	if (t != "1")
		abc2svg.print('%abc-' + t) // explicit ABC version
	abc2svg.print('\
I:abc-creator abc2svg CLI "toabc.js ' + abc2svg.args + '"\n\
I:linebreak $')

	if (user.errtxt)
		abc2svg.print("\n--- Errors ---\n" + user.errtxt)

	while (1) {
		t = tunes.shift()
		if (!t)
			break
		abc_dump(t[0], t[1], t[2], t[3])
	}
}

abc2svg.abort = function(e) {
	abc2svg.print(e.message + "\n*** Abort ***\n" + e.stack);
	abc2svg.abc_end();
	abc2svg.quit()
}
