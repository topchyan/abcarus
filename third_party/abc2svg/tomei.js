// abc2svg - tomei.js - convert ABC to MEI
//
// Copyright (C) 2019 Jean-Francois Moine
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

	// generate a new reference
	function new_ref(s) {
		if (!s.ref) {
			s.ref = ++meas.ref
			if (!s.items)
				s.items = ""
			s.items += ' xml:id="a' + s.ref.toString() + '"'
		}
	}

// --- decorations

	// decoration as text (dynam, fing) at end of measure
	// d[1] = tag
	// d[2] = item in the tag
	// d[3] = optional 'place'
	function decotxt1(s, d) {
		new_ref(s)
	    var	t = '\t  <' + d[1] + ' startid="#a' + s.ref + '"'

		//fixme: above or below
		if (d[3])			// place
			t += ' ' + d[3] + '="above"'
		meas.tags.push(t + '>' + d[2] + '</' + d[1] + '>')
	}

	// decoration in a symbol
	// d[1] = tag
	// d[2] = item in the tag
	// d[3] = optional 'place'
	function decosym(s, d) {
//fixme: if no place
//		if (1)
//			return' ' + d[2]

	    var	t = '\t\t<' + d[1]

		if (d[2])
			t += ' ' + d[2]
		//fixme: above or below
		if (d[3])			// place
			t += ' ' + d[3] + '="above"'
		if (!s.tags)
			s.tags = []
		s.tags.push(t + '/>')
	}

	// (decoration either in a symbol or at end of the measure)
	// decoration at end of the measure
	// d[1] = tag
	// d[2] = item in the tag
	// d[3] = optional 'place'
	function decotag1(s, d) {
		new_ref(s)
	    var	t = '\t  <' + d[1] + ' startid="#a' + s.ref + '"'

		if (d[2])
			t += ' ' + d[2]
		//fixme: above or below
		if (d[3])			// place
			t += ' ' + d[3] + '="above"'
		meas.tags.push(t + '/>')
	}

    var	deco_l = {
//		"-("
//		"-)"
//		"~("
//		"~)"
//fixme: form=cres/dim, place=above/below and 2 references
//		"<(": [null, "hairpin"],	// "cres",
//		"<)": [null, "hairpin"],	// "cres",
//		">"
//		">(": [null, "hairpin"],	// "dim",
//		">)": [null, "hairpin"],	// "dim",
		"^": [decosym, "artic", 'artic="marc"', "place"],
//		"+":
		"0": [decotxt1, "fing", "0", "place"],
		"1": [decotxt1, "fing", "1", "place"],
//		"15va("
//		"15va)"
//		"15vb("
//		"15vb)"
		"2": [decotxt1, "fing", "2", "place"],
		"3": [decotxt1, "fing", "3", "place"],
		"4": [decotxt1, "fing", "4", "place"],
		"5": [decotxt1, "fing", "5", "place"],
//		"8va("
//		"8va)"
//		"8vb("
//		"8vb)"
		accent: [decosym, "artic", 'artic="acc"', "place"],
//fixme: plist on notes
//		arpeggio

		breath: [decotag1, "breath"],
//		coda: [null, "O"],
//		crescendo(
//		crescendo)
//		dacapo
//		dacoda
//		"D.C."
//		"D.C.alcoda"
//		"D.C.alfine"
//		diminuendo(
//		diminuendo)
//		"D.S."
//		"D.S.alcoda"
//		"D.S.alfine"
		dot: [decosym, "artic", 'artic="stacc"', "place"],
		downbow: [decosym, "artic", 'artic="dnbow"', "place"],
//		emphasis: [null, "L"],
		f: [decotxt1, "dynam", "f", "place"],
		fermata: [decotag1, "fermata", null, "place"],
		ff: [decotxt1, "dynam", "ff", "place"],
		fff: [decotxt1, "dynam", "fff", "place"],
		ffff: [decotxt1, "dynam", "ffff", "place"],
//		fine
//		gmark
		invertedfermata: [decotag1, "fermata", 'form="inv"', "place"],
//		invertedturn: [decotag1, "fermata", 'form="inv"', "place"],
//		invertedturnx: [decotag1, "fermata", 'form="inv"', "place"],
//		longphrase
		lowermordent: [decotag1, "mordent", 'form="lower"'],
		marcato: [decosym, "artic", 'artic="marc"', "place"],
//		mediumphrase
		mf: [decotxt1, "dynam", "mf", "place"],
		mp: [decotxt1, "dynam", "mp", "place"],
		open: [decosym, "artic", 'artic="open"', "place"],
		p: [decotxt1, "dynam", "p", "place"],
		pralltriller: [decotag1, "mordent", 'form="upper"'],
//		ped
		"ped)": [decotxt1, "pedal", dir="up"],
		"ped(": [decotxt1, "pedal", dir="down"],
//		ped-up
//		plus
		pp: [decotxt1, "dynam", "pp", "place"],
		ppp: [decotxt1, "dynam", "ppp", "place"],
		pppp: [decotxt1, "dynam", "pppp", "place"],
//		rbstop
//		roll: [null, '~'],
//		segno: [null, 'S'],
		sfz: [decotxt1, "dynam", "sfz", "place"],
//		shortphrase
//		slide
		snap: [decosym, "artic", 'artic="snap"', "place"],
		tenuto: [decosym, "artic", 'artic="ten"', "place"],
//		thumb
		trill: [decotag1, "trill", null, "place"],
//2 references
//		"trill(": [null, "trill("],		// place=above/below
//		"trill)": [null, "trill)"],
		turn: [decotag1, "turn", 'form="upper"'],
		turnx: [decotag1, "turn", 'form="lower"'],
		upbow: [decosym, "artic", 'artic="upbow"', "place"],
		uppermordent: [decotag1, "mordent", 'form="upper"']
//		wedge
	}

	// build the decorations of a symbol
	// a decoration may be:
	// - as an item in the symbol (in s.items)
	// - as a tag in the symbol (in s.tags)
	// - as a tag at the end of the measure (in meas.tags)
	function deco_build(s) {
	    var	i, n, d

		for (i = 0; i < s.a_dd.length; i++) {
			n = s.a_dd[i].name
			d = deco_l[n]
//keep until all done
if (!d)
{
abc2svg.printErr('<!-- no conversion of '+n+'-->')
	continue
}
			d[0](s, d)
		}
	} // deco_build()

	// global variables/constants
    var	mode_tb = ["major", "dor", "phr", "lyd", "mix", "minor", "loc"],
	bar_ty = {".|": "dashed",
		"||": "dbl",
		".||": "dbldashed",
		".||": "dbldotted",
		".|": "dotted",
		"|]": "end",
		"": "invis",
		"[|:": "rptstart",
		":[]:": "rptboth",
		":|]": "rptend",
		"|": "single"
	},
	meas = {			// measure
		bar_num: 0,
		no_head: true,
		st: [],
		vo: [],
		ref: 100,
		clefs: [],		// clefs per staff
		tags: []
	}

	// dump the staves at start of tune (no 's') and inside the tune
	function staves_dump(s) {
	    var	v, p_v, staff, in_parenth, ln, stop, s2,
		voice_tb = abc.get_voice_tb(),
		vn = [],
		st = -1,
		sy = s ? s.sy : abc.get_cur_sy()

		// clef in staffDef
		function clef_dump(s) {
		    var	ln = ' clef.shape="'
			switch (s.clef_type) {
			case 't': ln += 'G"'; break
			case 'c': ln += 'C"'; break
			case 'b': ln += 'F"'; break
			case 'p': ln += 'perc"'; break
//fixme: TAB
			default:  return ''
			}
			ln += ' clef.line="' + s.clef_line + '"'
			if (s.clef_octave)
				ln += ' clef.dis="8" clef.dis.place="' +
					(s.clef_octave > 0 ? 'above"' : 'below"')
			return ln
		} // clef_dump()

		// get the number of lines of the staff
		function nl(st) {
		    var	i,
			l = abc.get_staff_tb()[st].stafflines,
			n = 0

			for (i = 0; i < l.length; i++) {
				if (l[i] == '|' || l[i] == '[')
					n++
			}
			return n
		} // nl()

//		meas.sy = sy

		for (v = 0; v < sy.voices.length; v++) {
			p_v = sy.voices[v]
			if (p_v)
				vn[p_v.range] = v
		}

		for (v = 0; v < sy.voices.length; v++) {
			if (vn[v] == undefined)
				continue
			p_v = sy.voices[vn[v]]
			if (p_v.st == st)
				continue
			if (st >= 0) {		// if a previous staff
				if (staff.flags & CLOSE_BRACE2)
					abc2svg.print('\t    </staffGrp>')
				if (staff.flags & CLOSE_BRACE)
					abc2svg.print('\t  </staffGrp>')
				if (staff.flags & CLOSE_BRACKET2)
					abc2svg.print('\t   </staffGrp>')
				if (staff.flags & CLOSE_BRACKET)
					abc2svg.print('\t </staffGrp>')
			}

			staff = sy.staves[++st]

			stop = (staff.flags & STOP_BAR) ?
					' bar.thru="false"' : ''
			if (staff.flags & OPEN_BRACKET)
				abc2svg.print('\t <staffGrp symbol="bracket"' +
						stop + '>')
			if (staff.flags & OPEN_BRACKET2)
				abc2svg.print('\t   <staffGrp symbol="bracket"' +
						stop + '>')
			if (staff.flags & OPEN_BRACE)
				abc2svg.print('\t  <staffGrp symbol="brace"' +
						stop + '>')
			if (staff.flags & OPEN_BRACE2)
				abc2svg.print('\t    <staffGrp symbol="brace"' +
						stop + '>')

			// must have a staff group
			if (v == 0
			 && !(staff.flags & (OPEN_BRACKET |
					OPEN_BRACKET2 |
					OPEN_BRACE |
					OPEN_BRACE2)))
				abc2svg.print('\t <staffGrp>')

			ln = '\t     <staffDef n="' + (st + 1).toString() +
				'" lines="' + nl(st) + '"'
			for (s2 = voice_tb[vn[v]].sym; s2; s2 = s2.next) {
				if (s2.dur)
					break
				if (s2.type == C.CLEF) {
					if (!s2.invis)
						ln += clef_dump(s2)
					meas.clefs[st] = s2
					break
				}
			}
			abc2svg.print(ln + '/>')

		}
		if (staff.flags & CLOSE_BRACE2)
			abc2svg.print('\t    </staffGrp>')
		if (staff.flags & CLOSE_BRACE)
			abc2svg.print('\t  </staffGrp>')
		if (staff.flags & CLOSE_BRACKET2)
			abc2svg.print('\t   </staffGrp>')
		if (staff.flags & CLOSE_BRACKET)
			abc2svg.print('\t </staffGrp>')
		if (!(staff.flags & (CLOSE_BRACKET |
				CLOSE_BRACKET2 |
				CLOSE_BRACE |
				CLOSE_BRACE2)))
			abc2svg.print('\t </staffGrp>')
	} // staves_dump()

// dump the header
function head_dump() {
    var	i, v, s, g, line, ulen, tmp, tmp2, grace, bagpipe, eoln, curv,
	info = abc.info(),
	first = abc.get_tsfirst(),
	voice_tb = abc.get_voice_tb(),
	nv = voice_tb.length,
	vo = [],		// dump line per voice
	vold = [],		// false/true for voice name
	vti = []

	// -- main code of head_dump()

	info.T = info.T ? info.T.replace(/\n/g,'<lb/>') : ''
	abc2svg.print('\
<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="4.0.0">\n\
 <meiHead>\n\
  <fileDesc>\n\
   <titleStmt>\n\
    <title>' + info.T + '</title>\n\
   </titleStmt>\n\
   <pubStmt />\n\
  </fileDesc>\n\
  <encodingDesc>\n\
   <appInfo>\n\
    <application version="' + abc2svg.version + '">\n\
     <name>abc2svg</name>\n\
     <p>Transcoded from ABC</p>\n\
    </application>\n\
   </appInfo>\n\
  </encodingDesc>\n\
  <workList>\n\
   <work>\n' +
	(info.T ? ('\
    <title>\n\
      ' + info.T + '\n\
    </title>\n') : '') +
	(info.C ? ('\
    <composer>\n\
      ' + info.C + '\n\
    </composer>\n') : '') + '\
   </work>\n\
  </workList>\n\
 </meiHead>\n\
 <music>\n\
  <body>\n\
   <mdiv>\n\
     <score>')
	line = '\
       <scoreDef'
	s = voice_tb[0].meter
	if (s.wmeasure != 1) {
		meas.wmeasure = s.wmeasure
		tmp = s.a_meter[0].top
		tmp2 = s.a_meter[0].bot
		if (tmp2)
			line += ' meter.count="' + tmp + '" meter.unit="' + tmp2 + '"'
		else if (tmp == "C")
			line += ' meter.sym="common"'
		else if (tmp == "C|")
			line += ' meter.sym="cut"'
		else
			line += ' meter.count="' + tmp + '"'
	}
	s = voice_tb[0].key
	tmp = s.k_sf
	if (tmp > 0)
		tmp = tmp.toString() + 's'
	else if (tmp < 0)
		tmp = (-tmp).toString() + 'f'
	line += ' key.sig="' + tmp + '" key.mode="' +
		mode_tb[s.k_mode] + '">'
	abc2svg.print(line)

	// output the staff system
	staves_dump()

	abc2svg.print('\
       </scoreDef>\n\
       <section>')
} // head_dump()

user.img_out = function() {}	// do the generation with no output

// dump a whole measure
function meas_dump(s2) {
    var ln, i, s, t, st, v, staff, voice, tim, g, s1

	// clef in a measure
	function clef_dump(s) {
if (!meas.clefs[s.st])
abc2svg.printErr('!! V:'+s.p_v.id+' '+s.time+' '+s.type+' st '+s.st)
		if (s.clef_type == meas.clefs[s.st].clef_type)
			return
		meas.clefs[s.st] = s
	    var	ln = '\t     <clef shape="'

		switch (s.clef_type) {
		case 't': ln += 'G"'; break
		case 'c': ln += 'C"'; break
		case 'b': ln += 'F"'; break
		case 'p': ln += 'perc"'; break
//fixme: TAB
		default:  return ''
		}
		ln += ' line="' + s.clef_line + '"'
		if (s.clef_octave)
			ln += ' dis="8" dis.place="' +
				(s.clef_octave > 0 ? 'above"' : 'below"')
		abc2svg.print(ln + '/>')
	} // clef_dump()

	// dump a duration
	function dur_dump(dur, nflags) {
	    var	t = (dur / 12) | 0,
		d = ' dur="'

			for (nflags = 5; t; t >>= 1, nflags--) {
				if (t & 1)
					break
			}
		if (nflags == -4)
			d += "long"
		else if (nflags == -3)
			d += "breve"
		else
			d += (1 << (nflags + 2)).toString()
		switch (t) {
		case 3: d += '" dots="1'; break
		case 7: d += '" dots="2'; break
		case 15: d += '" dots="3'; break
		}
		return d + '"'
	} // dur_dump()

	function gch_dump(s) {
		new_ref(s)
	    var i, gch, t

		for (i = 0; i < s.a_gch.length; i++) {
			t = ' startid="#a' + s.ref
			gch = s.a_gch[i]
//			font_def(gch.type == 'g' ? "gchord" : "annotation", gch.text)
			if (gch.type == 'g') {
				t = '\t  <harm' + t + '">' + gch.text + '</harm>'
			} else {
				if (gch.type == "^")
					t += '" place="above"'
				else if (gch.type == "_")
					t += '" place="below"'
				t = '\t  <dir' + t + '>' + gch.text + '</dir>'
			}
			meas.tags.push(t)
		}
	} // gch_dump()

	function note_dump(s) {
	    var m, note, t, item, s2, b_tp, i, r,
		n = s.nhd,
		line = ""

		function ly_dump(s) {
		    var	ly, i,
			nly = s.a_ly.length

			function ly_du1(t) {
			    var	ln = '\t\t <syl'
				switch (t) {
				case '-\n':
				case '_\n':
//fixme: no text...
					return
				default:
					if (t.slice(-1) == "\n") {
						t = t.slice(0, -1)
						ln += ' con="d"'
					}
					break
				}
				abc2svg.print(ln + '>' + t + '</syl>')
			}

			if (nly == 1) {
				ly_du1(s.a_ly[0].t)
				return
			}
			for (i = 0; i < nly; i++) {
				abc2svg.print('\t\t<verse n="' +
						(i + 1).toString() + '">')
				ly_du1(s.a_ly[i].t)
				abc2svg.print('\t\t</verse>')
			}
		} // ly_dump()

		function pit_dump(note) {
		    var pit = (note.opit || note.pit) + 12,
			ln = ' pname="' +
				"cdefgab"[pit % 7] + '" oct="' +
				((pit / 7) | 0).toString() + '"'
			switch (note.acc) {
			case -2: ln += ' accid="ff"'; break
			case -1: ln += ' accid="f"'; break
			case 1: ln += ' accid="s"'; break
			case 2: ln += ' accid="x"'; break
			case 3: ln += ' accid="n"'; break
			}
			return ln
		} // pit_dump()

		// dump the starting beam and tuplets
		function btps_dump(s) {
		    var i, tp, ln, st

			function tp_dump(tp) {
			    var	ln = '\t    <tuplet num="' +
					tp.p + '" numbase="' +
					tp.q
				if (Number(tp.f[0]) == 1) {
					ln +=
					    '" num.visible="false" bracket.visible="false'
				} else {
					switch (Number(tp.f[2])) {
					case 1:	ln += '" bracket.visible="false'; break
					case 2:	ln += '" num.format="ratio'; break
					}
					switch (Number(tp.f[3])) {
					case 1:	ln += '" bracket.place="above'; break
					case 2:	ln += '" bracket.place="below'; break
					}
				}
				abc2svg.print(ln + '">')
			} // tp_dump()

			// if start of a beam, check if crossing a measure bar
//			// or with notes on different staves
			if (s.beam_st && !s.beam_end) {
//				st = s.st
				for (s2 = s.next; ; s2 = s2.next) {
//					if (s2.st != st || s2.type == C.BAR) {
					if (s2.type == C.BAR) {
						while (!s2.beam_end)
							s2 = s2.next
						new_ref(s)
						new_ref(s2)
//						if (s.st != s2.st)
//							beam.with="above" or "below"
						meas.tags.push(
							'\t  <beamSpan startid="#a' +
								s.ref + '" endid="#a' +
								s2.ref + '"/>')
						s2 = null	// the beam is treated
						break
					}
					if (s2.beam_end)
						break
				}
			}
			if (!s2) {			// if no beam
				if (s.tp) {		// but tuplets
					i = s.tp.length
					while (--i >= 0)
						tp_dump(s.tp[i])
				}
				return
			}

			ln = '\t    <beam>'
			if (!s.tp) {			// beam without any tuplet
				abc2svg.print(ln)
				return
			}

			// start of beam and tuplet(s)
			i = 0
			while (i < s.tp.length) {
				tp = s.tp[i]
				r = tp.ro
				for (s2 = s; s2; s2 = s2.next) {
					if (s2.dur)
						r--
					if (s2.beam_end || r < 0)
						break
				}
				if (!s2.beam_end)
					break
				tp_dump(tp)
				i++
			}
			abc2svg.print(ln)
			while (i < s.tp.length)
				tp_dump(s.tp[i++])
		} // btps_dump()

		// -- main of note_dump()

		btps_dump(s)

		if (s.beam_br1 || s.beam_br2) {
			if (!s.items)
				s.items = ""
			s.items += s.beam_br1 ? ' breaksec="1"' :
						' breaksec="2"'
		}
		if (n) {				// chord
			line = '\t      <chord' + dur_dump(s.dur_orig, s.nflags)
			if (s.grace)
				line += ' grace="unknown"'
			if (s.stem > 0)
				line += ' stem.dir="up"'
			else if (s.stem < 0)
				line += ' stem.dir="down"'
			if (s.st != s.p_v.st)
				line += ' staff="' + (s.st + 1).toString() + '"'
			if (s.items)
				line += s.items
			abc2svg.print(line + '>')
			line = ""
			for (m = 0; m <= n; m++) {
				note = s.notes[m]
				line = '\t       <note' + pit_dump(note)
				if (note.items)
					line += note.items
				abc2svg.print(line + '/>')
			}
			if (s.tags)
				abc2svg.print(s.tags.join("\n"))
			if (s.a_ly)
				ly_dump(s)
			abc2svg.print('\t      </chord>')
		} else {				// single note
			line = '\t      <note' + dur_dump(s.dur_orig, s.nflags) +
				pit_dump(s.notes[0])
			if (s.stem > 0)
				line += ' stem.dir="up"'
			else if (s.stem < 0)
				line += ' stem.dir="down"'
			if (s.grace)
				line += ' grace="unknown"'
			if (s.st != s.p_v.st)
				line += ' staff="' + (s.st + 1).toString() + '"'
			if (s.items)
				line += s.items
			if (s.tags || s.a_ly) {
				abc2svg.print(line + '>')
				if (s.tags)
					abc2svg.print(s.tags)
				if (s.a_ly)
					ly_dump(s)
				abc2svg.print('\t      </note>')
			} else {
				abc2svg.print(line + '/>')
			}
		}

		n = s.tpe
		if (s.beam_st || !s.beam_end) {		// if no beam end
			while (--n >= 0)
				abc2svg.print('\t    </tuplet>')
			return
		}
		if (!n) {			// beam end but no tuplet end
			abc2svg.print('\t    </beam>')
			return
		}
		for (s2 = s.prev; s2; s2 = s2.prev) {
			if (s2.beam_st) {
				abc2svg.print('\t    </beam>')
				break
			}
			if (s2.tp) {
				i = s2.tp.length
				while (i > 0 && n > 0) {
					abc2svg.print('\t    </tuplet>')
					i--
					n--
				}
			}
		}
		while (--n >= 0)
			abc2svg.print('\t    </tuplet>')
	} // note_dump()

	function tempo_dump(s) {
		if (s.invis)
			return
	    var	v,
		t = '\t  <tempo place="above" startid="#a',
		s2 = s.ts_next

		while (!s2.dur && s2.type != C.SPACE)
			s2 = s2.ts_next
		new_ref(s2)
		t += s2.ref + '"'

		v = s.tempo
		if (v) {
			if (s.tempo_notes)
				v *= s.tempo_notes[0] / C.BLEN * 4
			t += ' mm="' + v + '"'
		}
		if (!s.tempo_str1 && !s.tempo_str2) {
			meas.tags.push(t + '/>')
		} else {
			meas.tags.push(t + '>')
			t = ''
			if (s.tempo_str1)
				t += s.tempo_str1
			//fixme: note
			if (!t)
				t += ' '
			t += 'fixme=' + s.tempo
			if (s.tempo_str2) {
				if (!t)
					t += ' '
				t += s.tempo_str2
			}
			meas.tags.push('\t  </tempo>')
		}
	} // tempo_dump()

	// -- main of meas_dump()

	// get the start time
	tim = 1000000
	for (st = 0; st < meas.st.length; st++) {
		staff = meas.st[st]
		if (!staff)
			continue
		for (v = 0; v < staff.vo.length; v++) {
			s = staff.vo[v].s[0]
			if (s && s.time < tim) {
				s1 = s
				tim = s.time
			}
		}
	}
	if (!s1)
		return				// !

	if (tim == 0 && s2.time < meas.wmeasure)
		meas.bar_num = -1		// upbeat
	ln = '\t <measure n="' + (++meas.bar_num).toString() +'"'
	if (meas.bar_num == 0)
		ln += ' metcon="false" type="upbeat"'
	if (s1.type == C.BAR			// if bar at start of tune
	 && s1.time == 0) {
		t = s1.bar_type
		if (s1.bar_dotted)
			t = '.' + t
		t = bar_ty[t]
		if (t)
			ln += ' left="' + t + '"'
	}

	if (s2) {
		t = s2.bar_type			// bar at end of measure
		if (s2.bar_dotted)
			t = '.' + t
		t = bar_ty[t]
		if (t && t != "single")
			ln += ' right="' + t + '"'
	}
	abc2svg.print(ln + '>')

	for (st = 0; st < meas.st.length; st++) {
		staff = meas.st[st]
		if (!staff)
			continue
		ln = '\t  <staff n="' + (st + 1).toString() + '"'
		abc2svg.print(ln + '>')
		for (v = 0; v < staff.vo.length; v++) {
			voice = staff.vo[v]
//			if (!voice)
//				continue
			ln = '\t   <layer n="' + (v + 1).toString() + '"'
			abc2svg.print(ln + '>')
			tim = s1.time
			for (i = 0; i < voice.s.length; i++) {
				s = voice.s[i]
				if (s.time > tim)
					abc2svg.print('\t      <space' +
						dur_dump(s.time - tim) + '/>')
				if (s.a_dd)
					deco_build(s)
				if (s.a_gch)
					gch_dump(s)
//fixme:s.repeat_..
//fixme:s.invis
				switch (s.type) {
				case C.CLEF:
					clef_dump(s)
					break
				case C.GRACE:
					for (g = s.extra; g; g = g.next)
						note_dump(g)
					break
//				case C.KEY:
//					break
//				case C.METER:
//					break
//				case C.MREST:
//					break
				case C.NOTE:
					note_dump(s)
					break
				case C.REST:
//fixme: test if full measure
					ln = '\t      <' +
						(s.invis ? 'space' : 'rest') +
						dur_dump(s.dur_orig, s.nflags)
					if (s.items)
						ln += s.items
					if (s.tags) {
						abc2svg.print(ln + '>')
						abc2svg.print(s.tags)
						abc2svg.print('\t      </rest>')
					} else {
						abc2svg.print(ln + '/>')
					}
					break
				case C.TEMPO:
					tempo_dump(s)
					break
				}
				if (s.dur)
					tim = s.time + s.dur
			}
			abc2svg.print('\t   </layer>')
		}
		abc2svg.print('\t  </staff>')
	}

	// output the decorations
	if (meas.tags.length) {
		abc2svg.print(meas.tags.join('\n'))
		meas.tags = []
	}

	abc2svg.print('\t </measure>')
} // meas_dump()

// dump a music line (SVG image)
function glue(of, width) {
   var	s, staff, v, voice, ending,
	tsfirst = this.get_tsfirst()

	of(width)

	function slur_dump(s) {
	    var	i, m, note, note2, sl, refs, refs2, ref, ref2

		function slur_out(ty, r1, r2) {
		    var	line = '\t  <slur startid="#a' + r1 +
				'" endid="#a' + r2 + '"'
			if (ty & C.SL_DOTTED)
				line += ' lform="dotted"'
			switch (ty & 0x07) {
			case C.SL_ABOVE:
				line += ' curvedir="above"'
				break
			case C.SL_BELOW:
				line += ' curvedir="below"'
				break
			}
			meas.tags.push(line + '/>')
		} // slur_out()

		if (s.sls) {
			new_ref(s)
			ref = s.ref
			for (i = 0; i < s.sls.length; i++) {
				sl = s.sls[i]
				note = sl.note
				if (sl.is_note) {
					new_ref(note)
					ref2 = note.ref
				} else {
					new_ref(note.s)
					ref2 = note.s.ref
				}
				slur_out(sl.ty, ref, ref2)
			}
		}
		if (s.sl1) {
			for (m = 0; m <= s.nhd; m++) {
				note = s.notes[m]
				if (note.sls) {
					new_ref(note)
					ref = note.ref
					for (i = 0; i < note.sls.length; i++) {
						sl = note.sls[i]
						note2 = sl.note
						if (sl.is_note) {
							new_ref(note2)
							ref2 = note2.ref
						} else {
							new_ref(note2.s)
							ref2 = note2.s.ref
						}
						slur_out(sl.ty, ref, ref2)
					}
				}
			}
		}

	} // slur_dump()

	function tie_dump(s) {
	    var	m, note, note2, refs, refs2, ref, ref2,
		s2 = s.tie_s

		if (!s.nhd) {
			new_ref(s)
			refs = s.ref
		}
		if (!s2.nhd) {
			new_ref(s2)
			refs2 = s2.ref
		}
		for (m = 0; m <= s.nhd; m++) {
			note = s.notes[m]
			note2 = note.tie_n
			if (refs) {
				ref = refs
			} else {
				new_ref(note)
				ref = note.ref
			}
			if (refs2) {
				ref2 = refs2
			} else {
				new_ref(note2)
				ref2 = note2.ref
			}
			line = '\t  <tie startid="#a' + ref +
				'" endid="#a' + ref2 + '"'
			if (note.tie_ty & C.SL_DOTTED)
				line += ' lform="dotted"'
			switch (note.tie_ty & 0x07) {
			case C.SL_ABOVE:
				line += ' curvedir="above"'
				break
			case C.SL_BELOW:
				line += ' curvedir="below"'
				break
			}
			meas.tags.push(line + '/>')
		}
	} // tie_dump()

	// main code of glue()

	// output the MEI header if not done yet
	if (meas.no_head) {
		meas.no_head = false
		head_dump()
	}

	// loop on the measures
	for (s = tsfirst; s; s = s.ts_next) {
//		if (abc.get_cur_sy() != meas.sy)
//			staves_dump()

		if (ending && s.rbstop)
			ending = 2
		if (s.type == C.BAR)
			continue

		// create the staves and voices if not done yet
		staff = meas.st[s.st]
		if (!staff) {
			meas.st[s.st] = staff = {
				vo: []
			}
		}

//other structure: voice sequences per staff
//		v = staff.vo.length
//		while (--v >= 0) {
//			if (staff.vo[v].v == s.v)
//				break
//		}
//		if (v < 0) {			// new voice in this staff
//			v = staff.vo.length
//			staff.vo.push({
//				v: s.v,
//				s: []		// array of symbols
//			})
//		}
//		voice = staff.vo[v]

//simple structure: use 'staff=' on staff changes
		voice = meas.vo[s.v]
		if (!voice) {
			meas.vo[s.v] = voice = {
				s: []
			}
			staff.vo.push(voice)
		}

		if (s.time == 0 && s.prev && s.prev == C.BAR
		 && voice.s.length == 0)		// start with a bar
			voice.s.push(s.prev)

		voice.s.push(s)

		switch (s.type) {
		case C.GRACE:
		case C.NOTE:
			if (s.sls || s.sl1)
				slur_dump(s)
			if (s.tie_s)
				tie_dump(s)
			break
		case C.STAVES:
			staves_dump(s)
			break
		}

		if (!s.ts_next || s.ts_next.type == C.BAR) {
			if (meas.eol) {
				meas.eol = false
				abc2svg.print('\t <sb/>')
			}
			meas_dump(s.ts_next)
			if (ending == 2) {		// if end of ending
				abc2svg.print('\t</ending>')
				ending = 0
			}
			if (s.ts_next && s.ts_next.text) {	// if ending
				abc2svg.print('\t<ending n="' +
						s.ts_next.text + '">')
				ending = 1
			}
			meas.st = []
			meas.vo = []
		}
	}
	meas.eol = true
} // glue()

// hook at tune generation start
function mei_output(of) {
	if (meas.done)			// do only one generation
		return
	meas.done = true
	of()
}

// -- local functions
abc2svg.abc_init = function(args) {

	abc.output_music = mei_output.bind(abc, abc.output_music)
	abc.set_sym_glue = glue.bind(abc, abc.set_sym_glue)

	abc2svg.print('<?xml version="1.0" encoding="UTF-8"?>\n\
<?xml-model href="http://music-encoding.org/schema/4.0.0/mei-all.rng"\n\
 type="application/xml" schematypens="http://relaxng.org/ns/structure/1.0"?>\n\
<?xml-model href="http://music-encoding.org/schema/4.0.0/mei-all.rng"\n\
 type="application/xml" schematypens="http://purl.oclc.org/dsdl/schematron"?>')
}

abc2svg.abc_end = function() {
	abc2svg.print('\
       </section>\n\
     </score>\n\
   </mdiv>\n\
  </body>\n\
 </music>\n\
</mei>')
//fixme: terminer derniere mesure si pas barre de fin
//fixme: W: dans <section> - cf
//		/home/jef/abc/mei/McFerrin_Don't_worry.mei
	if (user.errtxt)
		abc2svg.printErr("Errors:\n" + user.errtxt)
}

abc2svg.abort = function(e) {
	abc2svg.printErr(e.message + "\n*** Abort ***\n" + e.stack)
	abc2svg.abc_end()
	abc2svg.quit()
}
