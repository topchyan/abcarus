// sndgen.js - sound generation
//
// Copyright (C) 2019-2026 Jean-Francois Moine
//
// This file is part of abc2svg.
//
// abc2svg is free software: you can redistribute it and/or modify
// it under the terms of the GNU Lesser General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// abc2svg is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Lesser General Public License for more details.
//
// You should have received a copy of the GNU Lesser General Public License
// along with abc2svg.  If not, see <http://www.gnu.org/licenses/>.

// This script generates the play data which are stored in the music symbols:
// - in all symbols
//	s.ptim = play time
// - in BAR
//	rep_p = on a right repeat bar, pointer to the left repeat symbol
//	rep_s = on the first repeat variant, array of pointers to the next symbols,
//						indexed by the repeat number
// - in NOTE and REST
//	s.pdur = play duration
// - in the notes[] of NOTE
//	s.notes[i].midi

if (!abc2svg)
    var	abc2svg = {}

// tempo table
	abc2svg.tmp_tb = {
		grave:		30,
		lento:		40,
		largo:		50,
		adagio:		66,
		andante:	86,
		moderato:	96,
		allegretto:	112,
		allegro:	130,
		vivace:		150,
		presto:		180,
		prestissimo:	210
	}

function ToAudio() {
 return {

   // generate the play data of a tune
   add: function(first,		// starting symbol
		voice_tb,	// voice table
		cfmt) {		// tune parameters
    var	toaud = this,
	C = abc2svg.C,
	p_time = 0,		// last playing time
	abc_time = 0,		// last ABC time
	play_fac = C.BLEN / 4 * 120 / 60, // play time factor - default: Q:1/4=120
	dt, s_m, d,
	s = first,
	rst = s,		// left repeat (repeat restart)
	rst_fac,		// play factor on repeat restart
	rsk = [],		// repeat variant array (repeat skip)
	b_tim,			// time of last measure bar
	b_typ			// type of last measure bar

	function get_beat() {
	    var	s = first.p_v.meter

		if (!s.a_meter[0])
			return C.BLEN / 4
		if (!s.a_meter[0].bot)
			return (s.a_meter[1]
				&& s.a_meter[1].top == '|')	// (cut time)
					? C.BLEN / 2 : C.BLEN / 4
		if (s.a_meter[0].bot == "8"
		 && s.a_meter[0].top % 3 == 0)
			return C.BLEN / 8 * 3
		return C.BLEN / s.a_meter[0].bot | 0
	} // get_beat()

	// create the starting beats
	function def_beats() {
	    var	i, s2, s3, tim,
		beat = get_beat(),		// time between two beats
		d = first.p_v.meter.wmeasure,	// duration of a measure
		nb = d / beat | 0,		// number of beats in a measure
		v = voice_tb.length,		// beat voice number
		p_v = {				// voice for the beats
			id: "_beats",
			v: v,
//			time:
			sym: {
				type: C.BLOCK,
				v: v,
//				p_v: p_v,
				subtype: "midiprog",
				chn: 9,			// percussion channel
				instr: 16384,	// percussion bank
//				time:
//				next:
				ts_prev: first
//				ts_next: 
			}
//			vol:
		},
		s = {
			type: C.NOTE,
			v: v,
			p_v: p_v,
//			time:
			dur: beat,
			nhd: 0,
			notes: [{
				midi: 37	// Side Stick
			}]
		}

		abc_time = -d			// start time of the beat ticks

		// check for an anacrusis
		for (s2 = first; s2; s2 = s2.ts_next) {
			if (s2.bar_type && s2.time) {
				nb = (2 * d - s2.time) / beat | 0
				abc_time -= d - s2.time
				break
			}
		}

		// add the tempo
		s2 = p_v.sym			// midiprog
		for (s3 = first; s3 && !s3.time; s3 = s3.ts_next) {
			if (s3.type == C.TEMPO) {
				s3 = Object.create(s3)	// new tempo
				s3.v = v
				s3.p_v = p_v
				s3.prev =
					s3.ts_prev = s2
				s2.next =
					s2.ts_next = s3
				s2 = s3
				play_fac = set_tempo(s2)
				break
			}
		}

		voice_tb[v] = p_v
		p_v.sym.p_v = p_v
		first.time = s2.time = tim = abc_time
		if (s3)
			p_v.sym.time = tim
		for (i = 0; i < nb; i++) {
			s3 = Object.create(s)	// new beat tick
			s3.time = tim
			s3.prev = s2
			s2.next = s3
			s3.ts_prev = s2
			s2.ts_next = s3
			s2 = s3
			tim += beat
		}
		s2.ts_next = first.ts_next
		s2.ts_next.ts_prev = s2
		first.ts_next = p_v.sym
		rst = s2.ts_next
	} // def_beats()

	// build the information about the parts (P:)
	function build_parts(first) {
	    var	i, j, c, n, v,
		s = first,
		p = s.parts,
		st = [],
		r = ""

		// build a linear string of the parts
		for (i = 0; i < p.length; i++) {
			c = p[i]
			switch (c) {
			case '.':
				continue
			case '(':
				st.push(r.length)
				continue
			case ')':
				j = st.pop()
				if (j == undefined)
					j = r.length
				continue
			}
			if (c >= 'A' && c <= 'Z') {
				j = r.length
				r += c
				continue
			}
			n = Number(c)
//fixme:one digit is enough!
//			while (1) {
//				c = p[i + 1]
//				if (c < '0' || c > '9')
//					break
//				n = n * 10 + Number(c)
//				i++
//			}
			if (isNaN(n))
				break
			v = r.slice(j)
			if (r.length + v.length * n > 128)
				continue
			while (--n > 0)
				r += v
		}
		s.parts = r

		// build the part table in the first symbol
		// and put the reverse pointers in the P: symbols
		s.p_s = []			// pointers to the parts
		while (1) {
			if (!s.ts_next) {
				while (!s.seqst)
					s = s.ts_prev
				s.part1 = first	// end of tune = end of part
				break
			}
			s = s.ts_next
			if (s.part) {
				s.part1 = first		// reverse pointer
				v = s.part.text[0]	// 1st letter only
				for (i = 0; i < first.parts.length; i++) {
					if (first.parts[i] == v)
						first.p_s[i] = s
				}
			}
		}
	} // build_parts()

	// update the time linkage when the start time has changed
	function relink(s, dt) {
	    var	s2

		s.time += dt			// update time and duration
		if (s.dur)
			s.dur -= dt
		s.seqst = 1 //true		// new time sequence

		if (dt < 0) {			// if move backwards the grace notes
			s2 = s
			do {
				s = s.prev
			} while (s && !s.dur)
			if (s) {
				s.dur += dt
				s.pdur = s.dur / play_fac
				if (s.ts_next == s2) {
					s2 = null	// no linkage change
				} else {
					s = s2.ts_prev
					while (s && s.time >= s2.time)
						s = s.ts_prev
				}
			}
		} else {
			s2 = s.ts_next
			while (s2 && s2.time < s.time)
				s2 = s2.ts_next
		}

		// update the time linkage
		if (s2) {
			s.ts_prev.ts_next = s.ts_next	// remove from the time linkage
			if (s.ts_next)
				s.ts_next.ts_prev = s.ts_prev
			s.ts_prev = s2.ts_prev		// new linkage
			s.ts_next = s2
			if (s2.ts_prev)
				s2.ts_prev.ts_next = s
			s.ts_next.ts_prev = s
			if (s2.time == s.time)
				s2.seqst = 0 //false
		} else if (s.ts_next) {
			s.ts_next.seqst = 1
		}
	} // relink()

	// generate the grace notes
	function gen_grace(s) {
		if (s.midgen)
			return s			// generation already done
		s.midgen = 1 //true
	    var	g, i, n, t, d, prev, s2,
		next = s.next

//fixme: assume the grace notes in the sequence have the same duration
		n = 0
		for (g = s.extra; g; g = g.next)
			n++				// number of notes

		prev = s.prev
		while (prev && !prev.dur)		// search the previous note/rest
			prev = prev.prev

		// before beat
		if (prev
		 && (s.sappo
		  || !next || next.type != C.NOTE)) {
			if (s.sappo) {
				d = C.BLEN / 16
				if (d > prev.dur / 3)
					d = prev.dur / 3
			} else {
				d = prev.dur / 2
			}
			s2 = s.ts_next			// (the grace note will move)
			relink(s, -d)
			s.ptim -= d / play_fac

		// on beat
		} else {
			d = next.dur / 12
			if (!(d & (d - 1)))
				d = next.dur / 2	// no dot
			else
				d = next.dur / 3
			if (s.p_v.key.k_bagpipe)
				d /= 2
			if (d / n < 24)
				d = 24 * n
			if (s.sappo		// (appogiatura at start of tune!)
			 && d > C.BLEN / 16)
				d = C.BLEN / 16
			relink(next, d)
			s2 = s.ts_next			// (the normal note moved)
		}

		d /= n * play_fac
		t = 0
		for (g = s.extra; g; g = g.next) {
			g.dtim = t
			g.pdur = d
			t += d
		}
		return s2.ts_prev
	} // gen_grace()

	// change the tempo
	function set_tempo(s) {
		if (!s.tempo && !s.new_beat) {
		    var	p = (s.tempo_str1 || s.tempo_str2)
			if (!p)
				return play_fac		// no change
		    var	upm = abc2svg.tmp_tb[p.toLowerCase()]

			if (!upm)
				return play_fac		// no change
			upm *= C.BLEN / 240 // (/4/60)
			if (!s_m.a_meter)
				return upm
			if (!s_m.a_meter[0].bot)
				return (s_m.a_meter[1] && s_m.a_meter[1].top == '|')
						? upm * 2 : upm
			if (s_m.a_meter[0].bot == "8"
			 && !(s_m.a_meter[0].top % 3))
			 	return upm / 2 * 3
			return upm * s_m.a_meter[0].bot / 4
		}
	    var	i,
		d = 0,
		n = s.tempo_notes.length

		for (i = 0; i < n; i++)
			d += s.tempo_notes[i]
		if (s.new_beat)
			return play_fac * s.new_beat / d
		return d * s.tempo / 60
	} // set_tempo()

	function set_variant(s) {
	    var	d,
		n = s.text.match(/[1-8]-[2-9]|[1-9,.]|[^\s]+$/g)

		while (1) {
			d = n.shift()
			if (!d)
				break
			if (d[1] == '-')
				for (i = d[0]; i <= d[2]; i++)
					rsk[i] = s
			else if (d >= '1' && d <= '9')
				rsk[Number(d)] = s
			else if (d != ',')
				rsk.push(s)	// last
		}
	} // set_variant()

	// add() main

	// if %%playswing, change the couples of 8th notes
	if (abc2svg.swing)			// if the module is loaded
		abc2svg.swing.swing(first, voice_tb, cfmt)

	// if some chord stuff, set the accompaniment data
	if (cfmt.chord)
		abc2svg.chord(first, voice_tb, cfmt)

	// if some drum stuff, generate the drum sequences
	if (cfmt.drum)
		abc2svg.drum(s, voice_tb, cfmt)

	// if %%playbeats, create the sounds
	s_m = first.p_v.meter			// current meter
	if (cfmt.playbeats
	  && first.p_v.meter.wmeasure != 1)	// if not M:none
		def_beats()

	if (s.parts)
		build_parts(s)

	// set the time parameters
	rst_fac = play_fac
	while (s) {
		if (s.noplay) {			// in display macro sequence
			s = s.ts_next
			continue
		}

		dt = s.time - abc_time
		if (dt != 0) {		// may go backwards after grace notes
			p_time += dt / play_fac
			abc_time = s.time
		}
		s.ptim = p_time

		if (s.part) {			// new part
			rst = s			// new possible restart
			rst_fac = play_fac
		}
		switch (s.type) {
		case C.BAR:
			if (s.time != b_tim) {
				b_tim = s.time
				b_typ = 0
			}
			if (s.text			// if new variant
			 && rsk.length > 1
			 && s.text[0] != '1') {
				if (b_typ & 1)
					break
				b_typ |= 1
				set_variant(s)
				play_fac = rst_fac
				rst = rsk[0]		// reinit the restart
			}

			// right repeat
			if (s.bar_type[0] == ':') {
				if (b_typ & 2)
					break
				b_typ |= 2
				s.rep_p = rst		// :| to |:
				if (rst == rsk[0])
					s.rep_v = rsk	// to know the number of variants
				rst = s			// possible restart (..:|..:|)
			}

			// 1st time repeat
			if (s.text) {
			    if (s.text[0] == '1') {
				if (b_typ & 1)
					break
				b_typ |= 1
				s.rep_s = rsk = [rst]	// repeat skip
							// and memorize the restart
				if (rst.bar_type
				 && rst.bar_type.slice(-1) != ':')
					rst.bar_type += ':' // restart confirmed
				set_variant(s)
				rst_fac = play_fac
			    }

			// left repeat
			} else if (s.bar_type.slice(-1) == ':') {
				if (b_typ & 4)
					break
				b_typ |= 4
				rst = s			// new possible restart
				rst_fac = play_fac
// fixme: does not work when |1 split at end of line
//			} else if (s.rbstop == 2) {
//				if (b_typ & 8)
//					break
//				b_typ |= 8
//				rst = s			// new possible restart
//				rst_fac = play_fac
			}
			break
		case C.GRACE:
			s = gen_grace(s)
			break
		case C.REST:
		case C.NOTE:
			d = s.dur
			d /= play_fac
			s.pdur = d
			break
		case C.METER:
			s_m = s				// current meter
			break
		case C.TEMPO:
			play_fac = set_tempo(s)
			break
		}
		s = s.ts_next
	} // loop
   } // add()
 } // return
} // ToAudio()

// play some next symbols
//
// This function is called to start playing.
// Playing is stopped on either
// - reaching the 'end' symbol (not played) or
// - reaching the end of tune or
// - seeing the 'stop' flag (user request).
//
// The po object (Play Object) contains the following items:
// - variables
//  - stop: stop flag
//		set by the user to stop playing
//  - s_cur: current symbol (next to play)
//		must be set to the first symbol to be played at startup time
//  - s_end: stop playing on this symbol
//		this symbol is not played. It may be null.
//  - conf
//    - speed: current speed factor
//		must be set to 1 at startup time
//    - new_speed: new speed factor
//		set by the user
// - internal variables
//  - stim: start time
//  - repn: don't repeat
//  - repv: variant number
//  - timouts: array of the current timeouts
//		this array may be used by the upper function in case of hard stop
//  - p_v: voice table used for MIDI control
// - methods
//  - onend: (optional)
//  - onnote: (optional)
//  - note_run: start playing a note
//  - get_time: return the time of the underlaying sound system
abc2svg.play_next = function(po) {

	// handle a tie
	function do_tie(not_s, d) {
	    var	i,
		s = not_s.s,
		C = abc2svg.C,
		v = s.v,
		end_time = s.time + s.dur,
		repv = po.repv

		// search the end of the tie
		while (1) {
			s = s.ts_next
			if (!s || s.time > end_time)
				break
			if (s.type == C.BAR) {
				if (s.rep_p) {
					if (!po.repn) {
						s = s.rep_p
						end_time = s.time
					}
				}
				if (s.rep_s) {
					if (!s.rep_s[repv])
						break
					s = s.rep_s[repv++]
					end_time = s.time
				}
				while (s.ts_next && !s.ts_next.dur)
					s = s.ts_next
				continue
			}
			if (s.time < end_time
			 || !s.ti2)			// if not end of tie
				continue

			i = s.notes.length
			while (--i >= 0) {
				note = s.notes[i]
				if (note.tie_s == not_s) {
					d += s.pdur / po.conf.speed
					return note.tie_e ? do_tie(note, d) : d
				}
			}
		}

		return d
	} // do_tie()

	// set the MIDI controls up to now
	function set_ctrl(po, s2, t) {
	    var	i,
		p_v = s2.p_v,
		s = {
			subtype: "midictl",
			p_v: p_v,
			v: s2.v
		}

		p_v.vol = p_v.pan = undefined	// reset the controllers

		for (i in p_v.midictl) { // MIDI controls at voice start time
			s.ctrl = Number(i)
			s.val = p_v.midictl[i]
			po.midi_ctrl(po, s, t)
		}
		for (s = p_v.sym; s != s2; s = s.next) {
			if (s.subtype == "midictl") {
				po.midi_ctrl(po, s, t)
			} else if (s.subtype == 'midiprog') {
				po.v_c[s.v] = s.chn
				if (s.instr != undefined)
					po.c_i[po.v_c[s.v]] = s.instr
				po.midi_prog(po, s)
			}
		}

		// if no %%MIDI, set 'grand acoustic piano' as the instrument
		i = po.v_c[s2.v]
		if (i == undefined)
			po.v_c[s2.v] = i = s2.v < 9 ? s2.v : s2.v + 1
		if (po.c_i[i] == undefined)
			po.c_i[i] = 0	// piano
		while (p_v.voice_down) {
			p_v = p_v.voice_down
			po.v_c[p_v.v] = i
		}
		po.p_v[s2.v] = true	// synchronization done
	} // set_ctrl()

    // start and continue to play
    function play_cont(po) {
    var	d, i, st, m, note, g, s2, t, maxt, now, p_v,
	C = abc2svg.C,
	s = po.s_cur

	// search the end of a sequence of variants
	function var_end(s) {
	    var	i, s2, s3,
		a = s.rep_v || s.rep_s
		ti = 0

		for (i = 1; i < a.length; i++) {
			s2 = a[i]
			if (s2.time > ti) {
				ti = s2.time
				s3 = s2
			}
		}
		for (s = s3; s != po.s_end; s = s.ts_next) {
			if (s.time == ti)
				continue
			if (s.rbstop == 2)
				break
		}
		po.repv = 1		// repeat end
		return s
	} // var_end()

	while (s.noplay) {
		s = s.ts_next
		if (!s || s == po.s_end) {
			if (po.onend)
				po.onend(po.repv)
			return
		}
	}
	t = po.stim + s.ptim / po.conf.speed	// start time
	now = po.get_time(po)

	// if speed change, shift the start time
	if (po.conf.new_speed) {
		po.stim = t - s.ptim / po.conf.new_speed
		po.conf.speed = po.conf.new_speed
		po.conf.new_speed = 0
	}

	maxt = t + po.tgen		// max time = now + 'tgen' seconds
	po.timouts = []
	while (1) {
		switch (s.type) {
		case C.BAR:
			s2 = null
			if (s.rep_p) {		// right repeat
				po.repv++
				if (!po.repn	// if repeat a first time
				 && (!s.rep_v	// and no variant (anymore)
				  || po.repv <= s.rep_v.length)) {
					s2 = s.rep_p	// left repeat
					po.repn = true
				} else {
					if (s.rep_v)
						s2 = var_end(s)
					po.repn = false
					if (s.bar_type.slice(-1) == ':') // if ::
						po.repv = 1
				}
			}
			if (s.rep_s) {			// first variant
				s2 = s.rep_s[po.repv]	// next variant
				if (s2) {
					po.repn = false
					if (s2 == s)
						s2 = null
				} else {		// end of variants
					s2 = var_end(s)
					if (s2 == po.s_end)
						break
				}
			}
			if (s.bar_type.slice(-1) == ':' // left repeat
			 && s.bar_type[0] != ':')	// but not ::
				po.repv = 1

			if (s2) {			// if skip
				po.stim += (s.ptim - s2.ptim) / po.conf.speed
				s = s2
				while (s && !s.dur)
					s = s.ts_next
				if (!s)
					break		// no ending variant
				t = po.stim + s.ptim / po.conf.speed
				break
			}

		    if (!s.part1) {
			while (s.ts_next && !s.ts_next.seqst) {
				s = s.ts_next
				if (s.part1)
					break
			}
			if (!s.part1)
				break
		    }
		}
	    if (s && s != po.s_end && !s.noplay) {
		switch (s.type) {
		case C.BAR:
			break
		case C.BLOCK:
			if (s.subtype == "midictl") {
				po.midi_ctrl(po, s, t)
			} else if (s.subtype == 'midiprog') {
				po.v_c[s.v] = s.chn
				if (s.instr != undefined)
					po.c_i[po.v_c[s.v]] = s.instr
				po.midi_prog(po, s)
				p_v = s.p_v
				while (p_v.voice_down) {
					p_v = p_v.voice_down
					po.v_c[p_v.v] = s.chn
				}
			}
			break
		case C.GRACE:
			if (!po.p_v[s.v])
				set_ctrl(po, s, t)
			for (g = s.extra; g; g = g.next) {
				d = g.pdur / po.conf.speed
				for (m = 0; m <= g.nhd; m++) {
					note = g.notes[m]
					if (!note.noplay)
					    po.note_run(po, g,
						note.midi,
						t + g.dtim,
//fixme: there may be a tie...
						d)
				}
			}
			break
		case C.NOTE:
		case C.REST:
			if (!po.p_v[s.v])		// if new voice
				set_ctrl(po, s, t)	// set the MIDI controls
			d = s.pdur / po.conf.speed
		    if (s.type == C.NOTE) {
			for (m = 0; m <= s.nhd; m++) {
				note = s.notes[m]
				if (note.tie_s		// end of tie
				 || note.noplay)	// (%%voicecombine)
					continue	// already generated
				po.note_run(po, s,
					note.midi,
					t,
					note.tie_e ?
						do_tie(note, d) : d)
			}
		    }

			// follow the notes/rests while playing
			if (po.onnote && s.istart) {
				i = s.istart
				st = (t - now) * 1000
				po.timouts.push(setTimeout(po.onnote, st, i, true))
				if (d > 2)	// problem when loop on one long note
					d -= .1
				setTimeout(po.onnote, st + d * 1000, i, false)
			}
			break
		}
	    }
		while (1) {
			if (!s || s == po.s_end
			 || !s.ts_next || s.ts_next == po.s_end
			 || po.stop) {
				if (po.onend)
					setTimeout(po.onend,
						(t - now + d) * 1000,
						po.repv)
				po.s_cur = s
				return
			}
			s = s.ts_next

			if (s.part1				// if end of part
			 && po.i_p != undefined) {
				s2 = s.part1.p_s[++po.i_p]	// next part
				if (!s2) {
					s = null		// end of tune
					continue
				}
				po.stim += (s.ptim - s2.ptim) / po.conf.speed
				s = s2
				t = po.stim + s.ptim / po.conf.speed
				po.repv = 1
			}
			if (!s.noplay)
				break
		}
		t = po.stim + s.ptim / po.conf.speed // next time
		if (t > maxt)
			break
	}
	po.s_cur = s

	// delay before next sound generation
	po.timouts.push(setTimeout(play_cont,
				(t - now) * 1000
					- 300,	// wake before end of playing
				po))
    } // play_cont()

    // search the index in the parts
    function get_part(po) {
    var	s, i, s_p
	for (s = po.s_cur; s; s = s.ts_prev) {
		if (s.parts) {
			po.i_p = -1
			return
		}
		s_p = s.part1
		if (!s_p || !s_p.p_s)
			continue
		for (i = 0; i < s_p.p_s.length; i++) {
			if (s_p.p_s[i] == s) {
				po.i_p = i	// index in the parts
				return
			}
		}
	}
    } // get_part()

    // --- play_next ---
	if (po.stop) {
		if (po.onend)
			po.onend(po.repv)
		return
	}

	get_part(po)

	po.stim = po.get_time(po) + .3	// start time + 0.3s
			- po.s_cur.ptim / po.conf.speed
	po.p_v = []			// voice table for the MIDI controls
	if (!po.repv)
		po.repv = 1

	play_cont(po)			// start playing
} // play_next()

// nodejs
if (typeof module == 'object' && typeof exports == 'object')
	exports.ToAudio = ToAudio
