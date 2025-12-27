// abc2svg - mei.js - MEI front-end
//
// Copyright (C) 2019-2023 Jean-Francois Moine
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

// convert the xml source into a tree
function xml2tree(xml) {
    var	i, j, item, n, no,
	e = 0,
	stack = [],
	root = {
		name: "root"
	},
	o = root

	while (1) {
		i = xml.indexOf('<', e)		// start of tag
		if (i < 0)
			break
		if (i > e + 1) {		// if some content
			item = xml.slice(e + 1, i)
				.replace(/\s*/, '') // remove left spaces
			if (item) {
				if (!o.children)
					o.children = []
				o.children.push({
					name: "text",
					content: item
				})
			}
		}
		e = xml.indexOf('>', i)		// end
		if (e < 0)
//fixme: error
			return root

		switch (xml[i + 1]) {
		case '?':
			continue		// XML header
		case '!':
			e = xml.indexOf('-->', i) // XML comment
			if (e < 0)
				return root
			continue
		case '/':
			item = xml.slice(i + 2, e)
			if (item != o.name) {
				error(1, null, 'Found tag </' + item +
					'> instead of </'+o.name + '>')
				continue
			}
			o = stack.pop()
			if (!o)
				error(1, null, 'No start tag "' + item + '"')
			continue
		}
		item = xml.slice(i + 1, e).trim()
		no = {
			name: item.match(/[\w-]+/)[0],
			ix: i
		}
		if (!o.children)
			o.children = []
		o.children.push(no)
		if (item.slice(-1) != '/') {	// if some content
			stack.push(o)
			o = no
		} else {
			item = item.slice(0, -1).trim()
		}
		item = item.replace(/[^\s]*\s*/, '')
		if (!item)
			continue
		n = item.match(/=|[^\s"=]+|".*?"/g)	// "
		for (j = 0; j < n.length; j += 3) {
			if (n[j + 1] != '='
			 || !n[j + 2]) {
				mus.error(1, null, 'Bad key=value in "' + item + '"')
				break
			}
			no[n[j]] = n[j + 2].slice(1, -1)
		}
	}
	return root
}

// convert MEI to music suitable to the abc2svg generator
Abc.prototype.mei2mus = function(mei) {
    var	curr = {	// various elements while parsing the MEI source
		beam: 0,
		delayed: {},
		fnt: {},
		ftn: 0,
		ids: {},
		meastim: 0,
		mu: C.BLEN / 4,
		pt: .01,		// default unit ! en cm
		tp: []			// tuplets
	},
	acc_ty = {
		"ff": -2,
		"f": -1,
		"s": 1,
		"x": 2,
//		"ss": 2,
		"n": 3
	},
	bar_ty = {
		dashed: ".|",
		dbl: "||",
		dbldashed: ".||",
		dbldotted: ".||",
		dotted: ".|",
		end: "|]",
		invis: "[]",
		rptstart: "|:",
		rptboth: "::",
		rptend: ":|",
		single: "|"
	},
	fn = "",

	// --- functions associated to the start of MIE tags
	fns = {

	// accidental
	accid: function(tag) {
	    var	s = curr.s,
		note = s.notes[s.nhd]

		if (acc_ty[tag.accid])
			note.acc = acc_ty[tag.accid]
	}, // accid()

	arpeg: function(tag) {
	    var	s
		if (!tag.plist)
			return
// plist = list of notes of the chord
		s = tag.plist.split(/\s+/)[0].slice(1)	// top note
		s = curr.ids[s]			// always defined
		s = s.s				// chord
		add_dcn(s, "arpeggio")
	}, // arpeg()

	// articulation inside chord or note
	artic: function(tag) {
		artic(curr.chord || curr.s, tag)
	}, // artic()

	barLine: function(tag) {
	    var	s, ty

		if (tag.form)
			ty = bar_ty[tag.form]
		if (!ty)
			ty = "|"
		s = {
			type: C.BAR,
			istart: tag.ix,
			bar_type: ty,
			dur: 0,
			multi: 0
		}
		sym_link(s)
		if (ty[0] == '.') {
			s.bar_type = ty.slice(1)
			s.bar_dotted = true
		}
	}, // barLine()

	// start of beam
	beam: function(tag) {
		curr.beam = 1
	}, // beam()

	// beam crossing staves or measure bars
	beamSpan: function(tag) {
	    var	s = get_ref(tag),
		s2 = get_ref(tag, s)
		if (!s || !s2)
			return
		s.beam_st = true
		if (s.st == s2.st) {
			while (s != s2) {
				if (s.type == C.BAR)
					s.beam_on = true
			}
//		} else {
//fixme: beams on 2 voices do not work!
		}
		s2.beam_end = true
	}, // beamSpan()

	breath: function(tag) {
	    var	s = get_ref(tag)
		if (!s)
			return
		if (s.s)		// !
			s = s.s
//		tag.place above/below
		add_dcn(s, "breath")
	}, // breath()

	// start of chord
	chord: function(tag) {
	    var	dur = durcnv(tag),
		s = {
			type: C.NOTE,
			istart: tag.ix,
			stem: 0,
			multi: 0,
			nhd: -1,
			xmx: 0,
			dur: dur,
			dur_orig: dur,
			notes: []
		}
		switch (tag["stem.dir"]) {
		case "up": s.stem = 1; break
		case "down": s.stem = -1; break
		}
		switch (curr.beam) {
		case 0:
			s.beam_st = true
			s.beam_end = true
			break
		case 1:
			s.beam_st = true
			curr.beam = 2
			break
		}
//if (0) {
//		switch (tag.tie) {
//		case "i":
//		case "m":
//			curvoice.tie_s = s
//			break
//		}
//}
		if (tag.artic)
			artic(s, tag)
//fixme:cross-staff chord
//		tag.stem.with
//fixme: staff change?
//		tag.staff
		if (tag.grace)
			s.grace = true
		sym_link(s)
		curr.chord = s
	}, // chord()

	clef: function(tag) {
	    var	s = new_clef(tag.shape + tag.line)
		if (s)
			get_clef(s)
	}, // clef()

	composer: set_text,

	// annotation
	dir: set_text,

	// start of division
	div: set_text,

	dynam: set_text,

	// variant ending
	ending: function(tag) {
		curr.ending = tag.n	// "1", "2"
	}, // ending()

	// single element of figured bass - in <harm>
	f: function(tag) {
		if (curr.text)
			curr.text += "\n"
	}, // f()

//	figured bass - in <harm>
//	fb: function(tag) {
//	}, // fb()

	fileDesc: function(tag) {
		return true	// skip
	}, // fileDesc()

	fing: set_text,

	fermata: function(tag) {
	    var	s = get_ref(tag)
		if (!s)
			return
		if (s.s)
			s = s.s
//		tag.place above/below
		add_dcn(s, tag.form != "inv" ? "fermata" : "invertedfermata")
	}, // fermata()

	// group of grace notes
	graceGrp: function(tag) {
//		tag.attach	pre
	},

	// crescendo, diminuendo
	hairpin: function(tag) {
	    var	s = get_ref(tag),
		s2 = get_ref(tag, s)

		if (!s || !s2)
			return
		if (s.s)			// on notes!
			s = s.s
		if (s2.s)
			s2 = s2.s

		switch (tag.place) {
		case "above": s.pos.dyn = C.SL_ABOVE; break
		case "below": s.pos.dyn = C.SL_BELOW; break
		}
		switch (tag.form) {
		default:
//		case "cres":
			add_dcn(s, "<(")
			add_dcn(s2, "<)")
			break
		case "dim":
			add_dcn(s, ">(")
			add_dcn(s2, ">)")
			break
		}
	}, // hairpin()

	// chord symbol (harmony)
	harm: set_text,

	// start of incipit
	incip: function(tag) {
//fixme: skip
return true
//		tosvg(fn, "X:1")
//		parse.state = 1		// inside tune
	}, // incip()

	// start of line or start of line group
	l: function(tag) {
		if (curr.text)
			curr.text += "\n"
	}, // l()

	// start of label or labelAbbr
	label: function(tag) {
		if (curr.st == undefined	// not in staff definition
		 && !curr.staffGrp)		// not in staffGrp
			return true
		set_text(tag)
	}, // label()

	// layer (voice) - must be inside staff
	layer: function(tag) {
	    var	v, p_v, old_sy, s, vid, t,
		st = curr.st,			// ABC staff number
		staff = par_sy.staves[st],
		n = tag.n

		// set the (ABC) start of tune
		if (parse.state < 2) {
			staves_found = 0// don't generate a dummy staff system
			if (staff["meter.sym"] || staff["meter.count"]) {
				new_meter(metercnv(staff))
				curr.mu = meteru(staff)
				delete staff["meter.sym"]
				delete staff["meter.count"]
			}
			get_key(staff["key.sig"] ? keycnv(staff) : "C")
		}

		// build the voice ID = "#staff[#layer]"
		vid = (curr.st + 1).toString()
		if (n && n != "1")
			vid += n

		// if the voice is not in the current staff system, update it
		p_v = new_voice(vid)

		// if a new voice, do a full definition
		if (p_v.new) {
			v = p_v.v
			p_v.st = p_v.cst = st
			p_v.time = curr.meastim

//			// if inside tune, add a new staff system
//			if (voice_tb[v].time != 0 && !curr.newsy) {
//				curr.newsy = true
//				old_sy = par_sy
//				par_sy = clone(par_sy)
//				par_sy.voices = clone(par_sy.voices)
//				par_sy.staves = clone(par_sy.staves)
//				old_sy.next = par_sy
//			}

			if (!par_sy.voices[0])
				par_sy.top_voice = v	// first voice
			if (n)
				n = Number(n) - 1
			else
				n = 0
			par_sy.voices[v] = {
				st: st
//				range: // set below
//				sep:
//				maxsep:
			}

			// sort the voices
			if (!par_sy.rv)
				par_sy.rv = []
			par_sy.rv.push({
				v: v,
				r: st * 10 + n
			})
			par_sy.rv.sort(function(n1, n2) {
				return n1.r - n2.r
			})
			for (n = 0; n < par_sy.rv.length; n++) {
				v = par_sy.rv[n].v
				par_sy.voices[v].range = n
			}
			v = p_v.v
			while (--v >= 0) {
				if (par_sy.voices[v].st == st) {
					p_v.second =
						par_sy.voices[p_v.v].second = true
					break
				}
			}
		}
		if (tag.label) {
			t = tag
		} else if (staff.label) {
			t = staff.label
			staff.label = null
		}
		if (t) {
			p_v.nm = t.label
			p_v.new_name = true
			if (t["label.abbr"])
				p_v.snm = t["label.abbr"]
		}

		get_voice(vid)

		if (staff["clef.shape"]) {		// if clef change
			s = new_clef(clefcnv(staff))
			delete staff["clef.shape"]	// one clef per staff
			if (s) {
				get_clef(s)

				// put the clef before the measure bar
				if (s.prev && s.prev.bar_type) {
					s.next = s.prev
					if (s.prev.prev)
						s.prev.prev.next = s
					else
						s.p_v.sym = s
					s.prev = s.prev.prev
					s.next.prev = s
					s.next.next = null
					curvoice.last_sym = s.next
				}
			}
		}

//if (0) {
//		// if a new voice inside tune, add a measure bar
//		if (new_v)
//			sym_link({
//				type: C.BAR,
//				meas: curr.meas,
////fixme: the bar type depends on the previous measure
//				bar_type: "|",
//				dur: 0,
//				multi: 0
//			})
//}
	}, // layer()

	lb: function(tag) {
//fixme: here for chord symbol/annotation
// may be for page header/footer or ...
//		curr.text += ";"
		curr.text += "\n"
	}, // lb()

	mei: function(tag) {
		if (!tag.meiversion || tag.meiversion[0] != "4")
			error(0, null, "Bad MEI version " + tag.meiversion)
	},

	meter: function(tag) {
	    var	m
		if (tag.count) {
			m = tag.count
			if (tag.unit)
				m += "/" + tag.unit
			new_meter(m)
			m = C.BLEN / (tag.unit ? Number(tag.unit) : 1)
		} else switch (tag.sym) {
			case "common": new_meter("C"); m = 4; break
			case "cut": new_meter("C|"); m = 2; break
		}
		if (m)
			curr.mu = C.BLEN / m
	}, // meter()

	mRest: function(tag) {
	    var	s = {
			type: C.REST,
			istart: tag.ix,
			stem: 0,
			multi: 0,
			nhd: 0,
			xmx: 0,
			dur: curvoice.wmeasure,
			dur_orig: curvoice.wmeasure
		}
//		tag.cutout
		sym_link(s)
		if (curvoice.wmeasure == 1)		// if no meter
			curr.mrest = true
		if (par_sy.staves[s.st].invis)
			s.invis = true
	}, // mRest()

	// new measure
	measure: function(tag) {
		// anacrusis when n="0" type="upbeat"
		curr.meas = tag.n			// for errors
	}, // measure()

	mordent: function(tag) {
//fixme: handle note in chord
	    var	ty,
		s = get_ref(tag)

		if (!s)
			return
		if (s.s)
			s = s.s
//fixme: handle mordent in chord

		switch (tag.form) {
		default:
//		case "upper":
				ty = "uppermordent"; break
		case "lower": ty = "lowermordent"; break
		}
		add_dcn(s, ty)
	}, // mordent()

	multiRest: function(tag) {
	    var	dur = curvoice.wmeasure * tag.num,
		s = {
			type: C.MREST,
			istart: tag.ix,
			stem: 0,
			multi: 0,
			nhd: 0,
			xmx: 0,
			dur: dur,
			dur_orig: dur
		}
		sym_link(s)
	}, // multiRest()

	// start of the tune
	music: function(tag) {
		info.X = "1"
		parse.fname = "mei"
		parse.state = 1		// inside tune
	}, // music()

	note: function(tag) {
	    var	note, s, acc, pit, dur, v, i, vi, gr, ref, st,
		oct = tag.oct,
		id = tag["xml:id"]

		if (!tag.pname) {
			if (tag["pname.ges"]) {
				tag.pname = tag["pname.ges"]	//fixme
//				return
			} else if (tag.sameas) {
				ref = tag.sameas
				if (ref[0] == '#')
					ref = ref.slice(1)
				s = clone(curr.ids[ref])	// always defined
				if (!s.type) {			// if in chord
					note = s
					s = null
				} else {
					s.notes = clone(s.notes)
					s.notes[0] = note = clone(s.notes[0])
					note = s
				}
			} else {
// may be
// <note cue="true" head.shape="slash" stem.dir="up"/>
				return
			}
		}

		if (!note) {
			if (!oct)
				oct = curr.oct
			note = {
				pit: "cdefgab".indexOf(tag.pname.toLowerCase()) +
					oct * 7 - 12,
				shhd: 0,
				shac: 0
			}
		}
		if (curr.chord) {
			s = curr.chord
			dur = s.dur
//fixme: tie in chord?
//			if (s.tie_s)
//				note.tie_ty = C.SL_AUTO
			s.notes[++s.nhd] = note
		} else {
			dur = durcnv(tag)
			if (!s) {
				s = {
					type: C.NOTE,
					stem: 0,
					multi: 0,
					nhd: 0,
					xmx: 0,
					dur: dur,
					dur_orig: dur,
					notes: [note]
				}
			}
			s.istart = tag.ix

			switch (tag["stem.dir"]) {
			case "up": s.stem = 1; break
			case "down": s.stem = -1; break
			}
			if (tag.grace) {	// if in a grace note sequence
				gr = curvoice.last_sym
				if (gr && gr.type != C.GRACE) {
					gr = {			// new grace note
						type: C.GRACE,
						istart: tag.ix,
						dur: 0,
						stem: 0,
						multi: 0
					}
//fixme
//					if (tag["stem.mod"] == "1slash")
//						gr.sappo = true
					sym_link(gr)
					gr.extra = s
				} else {
					gr = gr.extra
					while (gr.next)		// add the note
						gr = gr.next
					gr.next = s
					s.prev = gr
				}
				s.cst = s.st = curvoice.st
				s.v = curvoice.v
				s.p_v = curvoice
			} else {
				switch (curr.beam) {
				case 0:
					s.beam_st = true
					s.beam_end = true
					break
				case 1:
					s.beam_st = true
					curr.beam = 2
					break
				}
				sym_link(s)
			}
		}
		if (id) {
			note.s = s			// chord
			note.m = s.nhd			// note index in the chord
			do_delayed(id, curr.chord ? note : s)
		}
		note.dur = dur
		if (acc_ty[tag.accid])
			note.acc = acc_ty[tag.accid]

//fixme: may have notes of the chord on different staves
		if (tag.staff)
			s.st = curr.st_cnv[tag.staff - 1] // ABC staff number

//fixme:
//		head.auth
//			"smufl"
//fixme:
// if auth == smufl,
//   head.shape is a glyph reference as "#xE000" or "U+E000"
//		switch (tag["head.shape"]) {
//		case "slash":			// ??
//		}
//fixme:
//		switch (tag["head.fill"]) {
//		case "void":
//		case "solid":
//		case "top":
//		case "bottom":
//		case "left":
//		case "right":
//		}
//fixme:
//		tag["head.visible"]
		if (tag.grace)
			s.grace = true
		switch (tag.tuplet) {
		case "i1":
			curr.tp.push(s)
			break
//		case "m1":
//			ignored
		case "t1":
			if (curr.tp.length)
				tp_set(curr.tp.pop(), {
						num: 3,
						numbase: 2
						})
//fixme: else error
			break
		}

//fixme: always <tie> ?
//if (0) {
//		switch (tag.tie) {
//		case "t":
//		case "m":
//			s.tie_s = curvoice.tei_s
////fixme: KO if chord
//			s.notes[0].tie_m = s.notes.length - 1
//			if (tag.tie == "t")
//				break
//			// fall thru
//		case "i":
//			note.tie_ty = C.SL_AUTO
//			curvoice.tei_s = s
//			break
//		}
//}

// used for play ?
//		if (tag.slur) {
//		}

		if (tag.color)
			s.color = tag.color

		curr.s = s			// last note
		curr.oct = oct			// last octave

		// other attributes
		if (tag.artic)
			artic(s, tag)
//fixme:cross-staff chord
//		tag.stem.with
		switch (tag.breaksec) {
		case "1": s.beam_br1 = true; break
		case "2": s.beam_br2 = true; break
		}
//fixme: tag.staff may be used in chords for cross-staff chords
//		tag.staff	# new staff

//fixme: not visual?
//		if (tag.fermata)
//			add_dcn(s, "fermata")
	}, // note()

//	part: function(tag) {
//	}, // part()

//	parts: function(tag) {
//	}, // parts()

	// new page for text
	pb: function(tag) {
	    var	s
//fixme: tag.n (page number)
		if (parse.state >= 2) {
			s = new_block("newpage")
			s.param = tag.n || ""
		} else {
			blk_flush()
			block.newpage = true
		}
	}, // pb()

	pedal: function(tag) {
	    var	dcn,
		s = get_ref(tag)
		if (!s)
			return
		if (s.s)
			s = s.s
		switch (tag.dir) {
		default:
//		case "up":
				dcn = "ped)"; break
		case "down": dcn = "ped("; break
		}
		add_dcn(s, dcn)
	}, // pedal()

	rend: function(tag) {
	    var	font, n,
		f = ""

		if (tag.fontfam)
			f += " " + tag.fontfam
		if (tag.fontname)
			f += " " + tag.fontname
		if (tag.fontweight)
			f += " " + tag.fontweight
		if (tag.fontstyle)
			f += " " + tag.fontstyle
		if (!f)
			f = "*"
		else
			f = f.slice(1)
		if (tag.fontsize) {
			n = parseInt(tag.fontsize) * 1.33	// 72 -> 96 DPI
			f += " " + n.toString()
		} else {
			f += " *"
		}
		if (f != "* *") {
			n = curr.fnt[f]
			if (!n) {
				n = ++curr.ftn
				curr.fnt[f] = n
				param_set_font("setfont-" + n, f)
			}
			curr.text += '$' + n
			curr.rend = true
		}
	}, // rend()

	rest: function(tag) {
	    var	id = tag["xml:id"],
		dur = durcnv(tag),
		s = {
			type: C.REST,
			istart: tag.ix,
			stem: 0,
			multi: 0,
			nhd: 0,
			xmx: 0,
			dur: dur,
			dur_orig: dur
		}

		if (tag.name == "rest") {
			switch (curr.beam) {
			case 0:
				s.beam_st = true
				s.beam_end = true
				break
			case 1:
				s.beam_st = true
				curr.beam = 2
				break
			}
		} else {			// space
			s.invis = true
		}

		sym_link(s)

		if (id)
			do_delayed(id, s)

		switch (tag.tuplet) {
		case "i1":
			curr.tp.push(s)
			break
//		case "m1":
//			ignored
		case "t1":
			if (curr.tp.length)
				tp_set(curr.tp.pop(), {
						num: 3,
						numbase: 2
						})
//fixme: else error
			break
		}
	}, // rest()

	revisionDesc: function(tag) {
		return true	// skip
	}, // revisionDesc()

	// newline for music
	sb: function(tag) {
		voice_tb[0].eoln = true
	}, // sb()

//	score: function(tag) {
//		tag.n
//		tag.id
//	}, // score()

	// score definition (= new staff system)
	// may contain a staffGrp (no staffGrp in <section>?)
	// may appear in section/(ending?) or between section/ending (in score/part)
	scoreDef: function(tag) {
	    var	w, h, v, tmp

		curr.scoreDef = tag

		if (parse.state >= 2) {
//			if (tag["clef.shape"]) {
//				s = new_clef(clefcnv(tag))
//				if (s) {
//					get_clef(s)
////fixme: move the clef - see layer:
//				}
//			}
			if (tag["key.sig"]) {
				tmp = keycnv(tag)
				for (v = 0; v < voice_tb.length; v++) {
					curvoice = voice_tb[v]
					get_key(tmp)
				}
			}
//			if (tag["meter.count"]) {
//				new_meter(metercnv(tag))
//				curr.mu = meteru(tag)
//			}
		}

//		// init the staff system
//		if (!curr.st_cnv)
//			curr.st_cnv = []

		// page layout
//fixme: the value of vu.height is odd!
		// recompute the height/width conversion
		if (tag["page.height"] && tag["page.width"]) {
			h = tag["page.height"]
			w = tag["page.width"]
			if (/^\d+$/.test(h + w))
				curr.pt = h / w > 1.3 ?
						1123.66 / h :	// A4
						1056 / h	// US letter
		}

//		if (tag["page.botmar"])
//			module
//		if (tag["page.height"])
//			module
		if (tag["page.leftmar"])
			self.set_format("leftmargin",
					unitcnv(tag["page.leftmar"]))
		if (tag["page.rightmar"])
			self.set_format("rightmargin",
					unitcnv(tag["page.rightmar"]))
		if (tag["page.scale"])
			self.set_format("pagescale", tag["page.scale"])
//		if (tag["page.topmar"])
//			module
		if (tag["page.width"])
			self.set_format("pagewidth",
					unitcnv(tag["page.width"]))

//		if (tag["music.name"])
//			musicfont = tag["music.name"]
//		if (tag["music.size"])
//fixme

	}, // scoreDef()

//	section: function(tag) {
//	}, // section()

	slur: function(tag) {
	    var	sl,
		s1 = get_ref(tag),
		s2 = get_ref(tag, s1),
		ty = C.SL_AUTO

		if (!s1 || !s2)
			return

		switch (tag.curvedir) {
		case "above": ty = C.SL_ABOVE; break
		case "below": ty = C.SL_BELOW; break
		}
		switch (tag.lform) {
		case "dashed":
		case "dotted": ty |= C.SL_DOTTED; break
		}

		sl = {
			ty: ty,
			ss: s1.s || s1,
			se: s2.s || s2
		}
		if (s1.s)
			sl.nts = s1
		if (s2.s)
			sl.nte = s2	// to note

		if (!s1.sls)
			s1.sls = []
		s1.sls.push(sl)
//fixme: ko if grace note
	}, // slur()

	sourceDesc: function(tag) {
		return true	// skip
	},

	// staff - must be inside measure and must contain layers
	staff: function(tag) {
		curr.st = curr.st_cnv[tag.n - 1]	// ABC staff number
		if (curr.st == undefined) {
			error(1, null, "Unknown staff " + tag.n)
			return true
		}
	    var	staff = par_sy.staves[curr.st]
		switch (tag.visible) {
		case "false":
			staff.invis = true
			break
		case "true":
			staff.invis = false
			break
		}
	}, // staff()

	// staff definition
	// the order in the staffGrp is the (ABC) staff number
	// may appear in scoreDef, measure, staffGrp
	//	between measures (in section/ending)
	//	and between section/ending (in score/part)
	staffDef: function(tag) {
	    var	k, st, def, staff, sy,
		n = tag.n - 1,			// MEI staff number
		grp = curr.staffGrp

		if (!curr.st_cnv)
			curr.st_cnv = []
		else
			st = curr.st_cnv[n]	// ABC staff number
		if (st == undefined) {		// if new staff
			staff = {
				stafflines: '|||||',
				staffscale: 1,
				flags: 0
			}
			if (grp) {
				staff.flags = grp.flags
				grp.flags &= STOP_BAR
			}

			if (parse.state == 3 && !curr.newsy) {
				curr.newsy = true
				sy = par_sy
				par_sy = clone(sy)
				sy.next = par_sy
				par_sy.voices = clone(par_sy.voices)
				par_sy.staves = clone(par_sy.staves)
			}

			st = par_sy.staves.length	// ABC staff number
			par_sy.staves.push(staff)	// new staff
			par_sy.nstaff = st
			curr.st_cnv[n] = st		// MEI to ABC staff conversion
		} else {
			staff = par_sy.staves[st]
		}

		// set the default values from the scoreDef
		def = curr.scoreDef
		if (def) {
			for (k in def) {
				switch (k.slice(0, 3)) {
				case "cle":
				case "key":
				case "met":
					staff[k] = def[k]
					break
				}
			}
		}
		// set the values from the current element
		for (k in tag) {
			switch (k.slice(0, 3)) {
			case "cle":
			case "key":
			case "met":
				staff[k] = tag[k]
				break
			}
		}

//fixme
//		if (!staff["clef.shape"]) {
//			error(1, null, "No clef in staff " + tag.n)
//			staff["clef.shape"] = "G"
//			staff["clef.line"] = "2"
//			staff.lines = "5"
//		}

		if (tag.label) {
			staff.label = tag
		} else if (grp && grp.label) {
			staff.label = {
				label: grp.label
			}
			delete grp.label
		}

//		if (tag["music.name"])
//fixme
//		if (tag["music.size"])
//fixme
		if (tag.spacing) {
//fixme: no unit is 10th of mm ?
		    var	v = tag.spacing.slice(-1)
			if (v >= '0' && v <= '9')
				staff.maxsep = Number(tag.spacing) / 100 * CM
			else
				staff.maxsep = get_unit(tag.spacing)
		}
		if (tag.children)
			curr.st = st
	}, // staffDef()

	// group of staves
	// may be contained in a scoreDef
	staffGrp: function(tag) {
		if (!tag.symbol)
			return			// unused?
	    var	grp = curr.staffGrp
		if (!grp) {
			curr.staffGrp = grp = {
				lvl: 0,
				flags: 0
			}
			switch (tag.symbol) {
			case "brace": grp.flags |= OPEN_BRACE; break
			case "bracket": grp.flags |= OPEN_BRACKET; break
			}
		} else {
			grp.lvl++
			switch (tag.symbol) {
			case "brace": grp.flags |= OPEN_BRACE2; break
			case "bracket": grp.flags |= OPEN_BRACKET2; break
			}
		}
		if (tag["bar.thru"] == "false")
			grp.flags |= STOP_BAR
	}, // staffGrp()

	syl: set_text,

	// start of tempo and title
	tempo: function(tag) {
		set_text(tag)
		if (!tag.children)
			fne[tag.name](tag)
	}, // tempo()

	text: function(tag) {
		if (curr.text != undefined)
			curr.text += tag.content.replace(/[ \t\n]+/g, ' ')
	},

	// tie
	tie: function(tag) {
	    var	m1, m2, not1, not2,
		s1 = get_ref(tag),
		s2 = get_ref(tag, s1),
		ty = C.SL_AUTO

		if (!s1 || !s2)
			return
		switch (tag.curvedir) {
		case "above": ty = C.SL_ABOVE; break
		case "below": ty = C.SL_BELOW; break
		}
		switch (tag.lform) {
		case "dashed":
		case "dotted": ty |= C.SL_DOTTED; break
		}
		if (s1.s) {			// note - note
			not1 = s1
			s1 = s1.s
			not2 = s2
			s2 = s2.s
			not1.tie_ty = ty
			not1.tie_e = not2
			not2.tie_s = not1
		} else {			// chord - chord
			for (m1 = 0; m1 <= s1.nhd; m1++) {
				not1 = s1.notes[m1]
				for (m2 = 0; m2 <= s2.nhd; m2++) {
					not2 = s2.notes[m2]
					if (not1.pit == not2.pit) {
						not1.tie_ty = ty
						not1.tie_e = not2
						not2.tie_s = not1
					}
				}
			}
		}
		s1.ti1 = s2.ti2 = true
	}, // tie()

	trill: function(tag) {
	    var	s2,
		s = get_ref(tag)

		if (!s)
			return
		if (tag.dur || tag["dur.ges"] || tag.endid || tag.tstamp2) {
			s2 = get_ref(tag, s)
			if (!s2)
				return
		}
		if (s.s)			// on note
			s = s.s
		switch (tag.place) {
		case "above": s.pos.orn = C.SL_ABOVE; break
		case "below": s.pos.orn = C.SL_BELOW; break
		}
		if (!s2) {
			add_dcn(s, "trill")
			return
		}
		if (s.time >= s2.time) {
			error(1, null, "Bad trill endings")
			return
		}
		add_dcn(s, "trill(")
		add_dcn(s2, "trill)")
	}, // trill()

	// start of tuplet (one nested level only)
	tuplet: function(tag) {
		curr.tp.push(curvoice.last_sym || true)
	}, //tuplet()

	// start of tupletSpan
	tupletSpan: function(tag) {
	    var	last, next, f,
		s = get_ref(tag),
		s2 = get_ref(tag, s)

		if (!s || !s2)
			return

		if (s.tp.length) {
			tp_fl(s.tp[0].f, tag)
			return
		}

		last = curvoice.last_sym
		curvoice.last_sym = s2
		next = s2.next
		s2.next = null
		tp_set(s, tag)
		s2.next = next
		curvoice.last_sym = last
	}, // tupletSpan()

	verse: function(tag) {
		curr.verse = tag
	}, // verse()

	work: function(tag) {
		curr.work = true
	}, // work()

	}, // fns

	// --- functions associated to the end of MIE tags
	fne = {

	// end of beam
	beam: function(tag) {
		curr.s.beam_end = true
		curr.beam = 0
	}, // beam()

	// end of chord
	chord: function(tag) {
	    var	id = tag["xml:id"]
		if (id)
			do_delayed(id, curr.chord)
		curr.chord = null
	}, // chord()

	// end of composer
	composer: function(tag) {
		if (!curr.text)
			return
		if (info.C == undefined)
			info.C = curr.text
		else
			info.C += "\n" + curr.text
		curr.text = undefined
	}, // composer()

	// end of annotation (dir) / chord symbol (harm) / annotation (dynam)
	dir: function(tag) {
	    var	gch, ty, t, i,
		font = gene.deffont,
		s = get_ref(tag)

		if (!s)
			return
		if (s.s)
			s = s.s
		switch (tag.name) {
		case "dir":
		case "dynam":
			switch (tag.place) {
			default:
//			case "above":
					ty = "^"; break
			case "below": ty = "_"; break
			}
			break
		default:
			ty = "g"
			switch (tag.place) {
			default:
//			case "above":
					s.pos.gch = C.SL_ABOVE; break
			case "below": s.pos.gch = C.SL_BELOW; break
			}
			break
		}
		t = curr.text.split('\n')
		if (t[0][0] == ' ')
			t[0] = t[0].slice(1)
		if (!s.a_gch)
			s.a_gch = []
		for (i = 0; i < t.length; i++) {
			gch = {
				type: ty,
				font: font,
				text: t[i]
			}
			s.a_gch.push(gch)
		}
		curr.text = undefined
	}, // dir()

	// end of division
	div: function(tag) {
	    var s
		switch (tag.type) {
		case undefined:
			s = new_block("text")
			s.text = curr.text
			break
		case "verse":
			if (info.W == undefined)
				info.W = ""
			if (tag.label)
				info.W += tag.label + " "
			info.W += curr.text + "\n\n"
			break
		default:
			error(1, null, "Tag <div> type "+ tag.type + "not treated")
			break
		}
		curr.text = undefined
	}, // div()

	// end of dynam
	dynam: function(tag) {
	    var	t,
		s = get_ref(tag)
		if (!s)
			return
		if (s.s)
			s = s.s
		t = curr.text.replace(/[ \t\n]+/g, ' ')
		if (t[0] == ' ')
			t = t.slice(1)
		switch (tag.place) {
		case "above": s.pos.dyn = C.SL_ABOVE; break
		case "below": s.pos.dyn = C.SL_BELOW; break
		}
		add_dcn(s, t, tag)
		curr.text = undefined
	}, //dynam()

	// end of variant ending
	ending: function(tag) {
	    var	v = voice_tb.length
		while (--v >= 0) {
			if (voice_tb[v].last_sym)
				voice_tb[v].last_sym.rbstop = 2
		}
	}, // ending()

	fing: function(tag) {
	    var	s = get_ref(tag)
		if (!s)
			return
		if (s.s)
			s = s.s
		switch (tag.place) {
		case "above": s.pos.orn = C.SL_ABOVE; break
		case "below": s.pos.orn = C.SL_BELOW; break
		}
		add_dcn(s, curr.text)
		curr.text = undefined
	}, // fing()

//	// end of incipit
//	incip: function(tag) {
//		tosvg(fn, "\n")			// generate
//		curr.st_cnv = null
//		curr.meastim = 0
//		curr.mu = C.BLEN / 4
//	}, // incip()

	// end of label (voice name)
	label: function(tag) {
		if (!curr.text)
			return
	    var	grp = curr.staffGrp,
		st = curr.st			// ABC staff number
		if (st  == undefined) {
			if (grp) {
				grp.label = curr.text
				curr.text = undefined
			}
			return
		}
	    var	staff = par_sy.staves[st]
		if (!staff.label)
			staff.label = {}
		staff.label.label = curr.text
		curr.text = undefined
	}, // label()

	labelAbbr: function(tag) {
		if (!curr.text)
			return
	    var	st = curr.st,			// ABC staff number
		staff = par_sy.staves[st]
		if (!staff.label)
			staff.label = {}
		staff.label["label.abbr"] = curr.text
		curr.text = undefined
	}, // labelAbbr()

	// end of measure
	measure: function(tag) {
	    var	v, s, s2, s3, p_v, tim, ty, dotted,
		n = voice_tb.length

		if (curr.tp.length) {
			error(1, null, "No end of tuplet")
			curr.tp = []
		}

		// change the bars at start of the measure (or start of tune)
		if (tag.left) {
			ty = bar_ty[tag.left]
			if (ty && ty[0] == '.') {
				ty = ty.slice(1)
				dotted = true
			}
		}
		if (ty || curr.ending) {
			for (v = 0; v < n; v++) {
				p_v = voice_tb[v]
				s2 = s = p_v.last_sym
				if (s)
					s = s.prev
				while (s && !s.bar_type)
					s = s.prev
				if (!s) {	// start of tune: add a measure bar
					s3 = p_v.sym
					p_v.last_sym = p_v.sym = null
					curvoice = p_v
					sym_link({
						type: C.BAR,
						istart: tag.ix,
						bar_type: ty || "|",
						dur: 0,
						multi: 0
					})
					s = p_v.last_sym
					p_v.last_sym = s2
					s.next = s3
					if (s3)
						s3.prev = s
					s.time = curr.meastim
				} else if (ty) {
					s.bar_type = ty
				}
				if (dotted)
					s.bar_dotted = true
				if (curr.ending) {
					s.rbstop = 2
					s.rbstart = 2
					s.text = curr.ending
				}
			}
			dotted = false
			ty = null
			delete curr.ending
		}

		// add the ending bar
		if (tag.right)
			ty = bar_ty[tag.right]
		if (!ty)
			ty = "|"

		// if a new staff system, add it at start of the measure
//		// (before the - previous - measure bar)
		// (just after the - previous - measure bar)
		if (curr.newsy) {
			curr.newsy = false
			for (s = voice_tb[par_sy.top_voice].last_sym;
			     s;
			     s = s.prev) {
				if (s.type == C.BAR)
					break
			}
			if (s) {			// ?
				s2 = clone(s)
				s2.type = C.STAVES
				s2.bar_type = 0
				s2.sy = par_sy

//				s2.prev = s.prev
//				s2.prev.next = s2
//				s2.next = s
//				s.prev = s2
				s2.next = s.next
				if (s.next)
					s2.next.prev = s2
				s.next = s2
				s2.prev = s
			}
		}

		// synchronize the voices
		// adjust the duration of the full measure rests
		// add the measure bars
		tim = 0
		for (v = 0; v < n; v++) {
			p_v = voice_tb[v]
			if (p_v.time > tim)
				tim = p_v.time
		}
		if (curr.mrest) {		// if some full measure rests
			curr.mrest = false
			for (v = 0; v < n; v++) {
				p_v = voice_tb[v]
				s = p_v.last_sym // there may be only rest and bar
				if (s && s.type == C.BAR)
					s = s.prev
				if (!s || s.type != C.REST || s.time != curr.meastim)
					continue
				s.dur = s.dur_orig = tim - curr.meastim
//fixme: should set a flag saying 'full measure rest'
				if (s.next)
					s.next.time = tim	// bar time
			}
		}
		if (ty[0] == '.') {
			ty = ty.slice(1)
			dotted = true
		}
		for (v = 0; v < n; v++) {
			p_v = voice_tb[v]
			p_v.time = tim

			s = p_v.last_sym
			if (s && s.time == tim && s.bar_type)
				continue
//			get_voice(p_v.id)
			curvoice = p_v
			s = {
				type: C.BAR,
				istart: tag.ix,
				bar_type: ty,
				dur: 0,
				multi: 0
			}
			if (dotted)
				s.bar_dotted = true
			if (v == par_sy.top_voice)
				s.bar_num = Number(tag.n) + 1
			sym_link(s)
		}
		curr.meastim = tim
	}, // measure()

	// end of the tune
	music: function(tag) {
		sanitize()

//fixme: copy of end_tune()
		generate()
		if (info.W)
			put_words(info.W)
		put_history()
		blk_flush()
	}, // music()

//	// end of page footer
//	pgFoot: function(tag) {
//		<p>
//	}, // pgFoot()

//	// end of page header
//	pgHead: function(tag) {
//		<title>
//		<persName role>
//	}, // pgHead()

	// end of rendition
	rend: function(tag) {
		if (curr.rend) {
			curr.rend = false
			curr.text += "$0"
		}
	}, // rend()

	// end of score definition
	scoreDef: function(tag) {
		curr.scoreDef = null
	}, //scoreDef()

	// end of staff definition
	staffDef: function(tag) {
		delete curr.st
	}, //staffDef()

	// end of staff group
	staffGrp: function(tag) {
	    var	grp = curr.staffGrp,
		st = par_sy.staves.length - 1,	// last staff
		staff = par_sy.staves[st]

		if (!grp)
			return
		if (--grp.lvl < 0) {
			curr.staffGrp = null
			switch (tag.symbol) {
			case "brace": staff.flags |= CLOSE_BRACE; break
			case "bracket": staff.flags |= CLOSE_BRACKET; break
			}
			return
		}
		switch (tag.symbol) {
		case "brace": staff.flags |= CLOSE_BRACE2; break
		case "bracket": staff.flags |= CLOSE_BRACKET2; break
		}
	}, // staffGrp()

	// end of syllabe
	syl: function(tag) {
	    var	t = curr.text.replace(/[ \t\n]+/g, ' ')
		curr.text = undefined

		if (t[0] == ' ')
			t = t.slice(1)

	    var	l, wh, c,
		s = curr.s		// note
		curvoice.have_ly = true
		wh = strwh(t)

		if (curr.verse && curr.verse.n)
			l = curr.verse.n - 1	// verse number (0...n-1)
		else
			l = 0			// ('n' omitted)

		if (t.slice(-1) == '-')
			t = t.slice(0, -1) + '\n'
		switch (tag.con) {		// connector
		case "s":
			t += ' '
			break
		case "d":
			t += '-'
			break
		case "u":
			t += '_'
			break
//		case "t":
//			c = '~'
//			break
//		case "c":
//			break
//		case "v":
//			break
//		case "i":
//			break
//		case "b":
//			break
		}
		switch (tag.wordpos) {
		case "i":			// initial
		case "m":			// middle
			if (t.slice(-2) != "\n") {
				if (c == '_')
					t += c
				t += "\n"
			}
			break
//		case "t":
//			break
		}

		if (!s.a_ly)
			s.a_ly = []
		s.a_ly[l] = {
			t: t,
			font: gene.curfont,
			wh: wh
		}
	}, // syl()

	// end of tempo
	tempo: function(tag) {
	    var	t = curr.text.replace(/[ \t\n]+/g, ' ')
		curr.text = undefined

//		if (t[0] == ' ')
//			t = t.slice(1)
//		if (!t || t == "undefined")
//			return

	    var	s,
		s2 = {
			type: C.TEMPO,
			dur: 0
		}
		if (t)
			s2.tempo_str1 = t
		if (tag.mm) {
			s2.tempo_notes = [curr.mu]
			s2.tempo = tag.mm
		}
		if (parse.state <= 1) {
			info.Q = '"' + t + '"'
			glovar.tempo = s2
			return
		}

		// insert the tempo before the reference
		s = get_ref(tag)
		if (!s)
			return
		s2.prev = s.prev
		s.prev = s2
		s2.next = s
		if (s2.prev)
			s2.prev.next = s2
		else
			s.p_v.sym = s2
		s2.v = s.v
		s2.p_v = s.p_v
		s2.st = s.st
		s2.time = s.time
	}, // tempo()

	// end of title
	title: function(tag) {
	    var	t = curr.text.replace(/[ \t]+/g, ' ')
		curr.text = undefined
		if (t[0] == ' ')
			t = t.slice(1)
		if (parse.state != 3) {
			if (info.T == undefined)
				info.T = t
			else
				info.T += "\n" + t
		} else {
		    var	s = new_block("title")
			s.text = t
		}
	}, // title()

	// end of tuplet
	tuplet: function(tag) {
	   var	s = curr.tp.pop() // symbol before the start of the tuplet
				  // or 'true' if the tune starts with a tuplet

		if (s && (tag.dur || tag.num))
			tp_set(s == true ? curvoice.sym : s.next, tag)
	}, // tuplet()

	// end of work
	work: function(tag) {
		curr.work = false
	}, // work()

	} // fne

	// common code
	fns.lg = fns.l			// start of line group
	fns.labelAbbr = fns.label	// start of labelAbbr
	fns.space = fns.rest		// space
	fns.title = fns.tempo

	fne.harm = fne.dir		// end of chord symbol (harmony)

	// add a decoration into a symbol
	function add_dcn(s, dcn, tag) {
	    var	dd = dd_tb[dcn]

		// build a dynamic decoration
		function build_dyn(t) {
		    var	i,
			str = "",
			dd = {
				name: t,
				func: 6,
				glyph: t,
				h: 18,
				wl: t.length * .3,
				wr: t.length * .7
			}
			for (i = 0; i < t.length; i++) {
				switch (t[i]) {
				case 'f': str += "\ue522"; break
				case 'p': str += "\ue520"; break
				case 'r': str += "\ue523"; break
				case 's': str += "\ue524"; break
				}
			}
			tgls[t] = {
				x: -4,
				y: -6,
				c: str
			}
			return dd
		} // build_dyn()

		if (!dd) {
			if (decos[dcn]) {		// if known decoration
				dd = deco_def(dcn)
			} else {
				if (!tag)
//fixme: error
					return
				if (tag.name != "dynam"
				 || /[^fprs]/.test(dcn)) {
					fne.dir(tag)	// display as annotation
					return
				}
				dd_tb[dcn] = dd = build_dyn(dcn)
			}
		}
		if (!s.a_dd)
			s.a_dd = []
//		switch (tag.place) {
//		default:
////		case "above":
//		case "below":
//fixme: how to force the place of the decoration?
//		}
		s.a_dd.push(dd)
	} // add_dcn()

	// articulation (inside a chord/note)
	function artic(s, tag) {
	    var	dcn, i,
		d_tb = {
		acc: "accent",
		dnbow: "downbow",
		marc: "marcato",
		open: "open",
		snap: "snap",
		spic: "wedge",
		stacc: "dot",
		ten: "tenuto",
		upbow: "upbow",
		},
		d = tag.artic.split(/\s+/)

		switch (tag.place) {
		case "above": s.pos.orn = C.SL_ABOVE; break
		case "below": s.pos.orn = C.SL_BELOW; break
		}
		for (i = 0; i < d.length; i++) {
			dcn = d_tb[d[i]]
			if (dcn)
				add_dcn(s, dcn)
			else
				error(1, null, "Articulation " + d[i] + " not handled")
		}
	} // artic()

	// define a new element reference and
	// resolve its definition in the associated elements
	function do_delayed(id, s) {
	    var	i, n, tag,
		delayed_a = curr.delayed[id]

		curr.ids[id] = s
		if (!delayed_a)
			return		// no element is waiting for this element
		curr.delayed[id] = null

		n = delayed_a.length
		for (i = 0; i < n; i++) {
			tag = delayed_a[i]
			fns[tag.name](tag)
		}
	}

	// convert a clef
	function clefcnv(tag) {
	    var clef = {"G": "G",
			"GG": "G",
			"F": "F",
			"C": "C",
			"perc": "P",
			"TAB": "tab"}[tag["clef.shape"]]
		if (tag["clef.line"])
			clef += tag["clef.line"]
		if (tag["clef.dis"]) {
			if (tag["clef.dis.place"] == "above")
				clef += '+' + tag["clef.dis"]
			else
				clef += '-' + tag["clef.dis"]
		}
		return clef
	} // clefcnv()

	// convert a (CMN) duration
	function durcnv(tag) {
	    var dur

		switch (tag.dur) {
		case "breve": dur = C.BLEN * 2; break
		case "long": dur = C.BLEN * 4; break
//fixme: beat?
		case undefined: dur = C.BLEN / 4; break
		default: dur = C.BLEN / tag.dur
		}
		switch (tag.dots) {
		case "1": dur *= 3/2; break
		case "2": dur *= 7/4; break
		case "3": dur *= 15/8; break
		}
if (isNaN(dur))
error(1, null, "Bad duration " + tag.dur + " tag:" + tag.name)
		return dur
	} // durcnv()

	// change the source reference in error messages
    var	err_old
	function error_new(sev, s, msg, a1, a2, a3, a4) {
		if (!s)
			s = {}
		if (!s.fname)
			s.fname = "(no ref)"
		if (!s.istart)
			s.istart = parse.istart
		err_old(sev, s, msg, a1, a2, a3, a4)
	}
	err_old = error
	error = error_new

	// get the symbol (chord, note or rest) pointed to
	// by startid/endid or tstamp/tstamp2
	// @end is the pointer to the start symbol
	function get_ref(tag, end) {
	    var	s, st, v_rg, v, voice, tim,
		rg = 100,
		ref = tag[end ? "endid" : "startid"]

		if (ref) {
			if (ref[0] == '#')
				ref = ref.slice(1)
			s = curr.ids[ref]	// symbol or note
			if (!s) {		// the symbol is not defined yet
				if (!curr.delayed[ref])
					curr.delayed[ref] = []
				curr.delayed[ref].push(tag)
				return // null
			}
		} else {			// try a time stamp
			ref = end ? tag.tstamp2 : tag.tstamp
			if (!ref) {
				error(1, null, "No "+ (end ? "end" : "start") +
					" reference tag:" + tag.name)
				return //
			}

			if (ref[1] == 'm') {
				if (ref[0] == '0' && ref[2] == '+')
					ref = ref.slice(3)
				else
//fixme: tstamp2 may have more values
					return
			}

			// convert the beat into internal time
			tim = curr.meastim + curr.mu * (ref - 1)

			// search the voice
			st = curr.st_cnv[tag.staff ? (tag.staff - 1) : 0]
//fixme: may be simplified using the voice ID (main voice of the staff is V:<#staff>
			for (v = 0; v < par_sy.voices.length; v++) {
				voice = par_sy.voices[v]
				if (!voice || voice.st != st)
					continue
				if (voice.range < rg) {
					v_rg = v
					rg = voice.range
				}
			}

			if (rg >= 100) {
				error(1, null, "No voice in staff " + st +
					" tag:" + tag.name)
				return
			}

			// and the symbol
			for (s = voice_tb[v_rg].last_sym; s; s = s.prev) {
				if (s.time <= tim) {
					if (ref != 0)
						break
					while (s && s.type != C.BAR)
						s = s.prev
					break
				}
			}
		}

		if (!s) {
			error(1, null, "No symbol at beat " + ref +
				" in staff " + tag.staff + " tag:" + tag.name)
			return
		}

		if (!end)
			return s

		if (s == end) {
			error(1, s, "References on a same element")
			if (!s.next)
				return
			s = s.next
		}
		if (s.time <= end.time) {
			error(0, s, "References going back in time")
			return
		}
		return s
	} // get_ref()

	// convert a key
	function keycnv(tag) {
	    var	sig2kM = {
			"0" : "C",
			"1s": "G",
			"2s": "D",
			"3s": "A",
			"4s": "E",
			"5s": "B",
			"6s": "F#",
			"7s": "C#",
			"1f": "F",
			"2f": "Bb",
			"3f": "Eb",
			"4f": "Ab",
			"5f": "Db",
			"6f": "Gb",
			"7f": "Cb"
		},
		sig2km = {
			"0" : "Am",
			"1s": "Em",
			"2s": "Bm",
			"3s": "F#m",
			"4s": "C#m",
			"5s": "G#m",
			"6s": "D#m",
			"7s": "A#m",
			"1f": "Dm",
			"2f": "Gm",
			"3f": "Cm",
			"4f": "Fm",
			"5f": "Bbm",
			"6f": "Ebm",
			"7f": "Abm"
		}
		return tag["key.mode"] != "minor" ?
			sig2kM[tag["key.sig"]] :
			sig2km[tag["key.sig"]]
	} // keycnv()

	// convert a meter
	function metercnv(tag) {
		switch (tag["meter.sym"]) {
		case "common": return "C"
		case "cut": return "C|"
		}
		if (tag["meter.unit"])
			return tag["meter.count"] + "/" + tag["meter.unit"]
		return tag["meter.count"]
	} // metercnv()

	// get the unit of a meter
	function meteru(tag) {
	    var	mu = 1
		switch (tag["meter.sym"]) {
		case "common": mu = 4; break
		case "cut": mu = 2; break
		}
		if (tag["meter.unit"])
			mu = Number(tag["meter.unit"])
		return C.BLEN / mu
	} // meteru()

	function set_text(tag) {
	    var	f
		switch (tag.name) {
		case "dir": f = "annotation"; break
		case "dynam": f = "dynam"; break
//		case "fing": f = null; break
		case "harm": f = "gchord"; break
		case "syl": f = "vocal"; break
//		case "tempo": f = null; break
		case "title": f = "title"; break
		}
		if (f)
			set_font(f)
		curr.text = ""
	}

	// set tuplet flags
	function tp_fl(f, tag) {
		if (tag["num.visible"] == "false") {
			f[0] = 1			// when = never
		} else {
			if (tag["bracket.visible"] == "false")
				f[1] = 2		// what = nothing
			if (tag["num.format"] == "ratio")
				f[2] = 2		// which = ratio
		}
		switch (tag["bracket.place"]) {
		case "above": f[3] = 1; break		// where = above
		case "below": f[3] = 2; break		// where = below
		}
	} // tp_fl()

	// handle the end of one tuplet
	function tp_set(s, tag) {
	    var	fact, s2, s3, n,
		nbas = tag.numbase || 2,	// numbas default = 2 ?
		f = Object.create(cfmt.tuplets)

		while (s.grace)
			s = s.next

		if (!s.tp)
			s.tp = []
		s.tp.push({
			p: tag.num,
			q: nbas,
			f: f
		})

		tp_fl(f, tag)

		// adjust the duration of the symbols
		if (tag.dur)
			fact = durcnv(tag) / (curvoice.time - s1.time)
		else
			fact = nbas / tag.num

		tp_adj(s, fact)

		s2 = curvoice.last_sym
		if (!s2.dur) {	// if some odd element at end of the tuplet
			for (s3 = s2; !s3.dur; s3 = s3.prev)
				;
			s3.tpe = s2.tpe	// move the end of tuplet
			delete s2.tpe
		}

		n = 0
		for (s3 = s; s3; s3 = s3.next) {
			if (s3.dur)
				n++
		}
		s.tp[s.tp.length - 1].ro = n	// (needed for toabc)
	} // tp_set()

//fixme: no unit is 10th of mm ?
	function unitcnv(v) {
	    var	nv = v.slice(-1)
		if (nv >= '0' && nv <= '9')
			return (v * curr.pt).toString()
		return v
	}

	// check for bugs in the source
	function sanitize() {
	    var	i, v,
		used_st = []

		// check for used staves
		for (v = 0; v < voice_tb.length; v++) {
			i = voice_tb[v].st
			if (i)
				used_st[i] = true
		}
		for (i = par_sy.nstaff; i > 0; i--) {
			if (used_st[i])
				break
		}
		if (i != par_sy.nstaff)
			error(1, null, "Unused staves "+(i+1)+".."+par_sy.nstaff)
		par_sy.nstaff = i
	} // sanitize()

	// convert to music
	function parse_mei(tag) {
		if (fns[tag.name]) {
			parse.istart = tag.ix
			if (fns[tag.name](tag))
				return			// skip when error
		}
		if (!tag.children)
			return
	    var	i,
		n = tag.children.length
		for (i = 0; i < n; i++)
			parse_mei(tag.children[i])
		if (fne[tag.name])
			fne[tag.name](tag)
	} // parse_mei()

	// main code of mei2mus()

	parse.file = mei
	cfmt.graceslurs = false
	glovar.ulen = C.BLEN / 4
	param_set_font("dynamfont", "serifItalicBold 16")

	parse_mei(xml2tree(mei)) // convert to internal music representation

	parse.state = 0		// end of tune
} // mei2mus()
