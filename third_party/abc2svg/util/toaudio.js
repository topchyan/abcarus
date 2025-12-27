// toaudio.js - audio generation
//
// Copyright (C) 2015-2019 Jean-Francois Moine
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

// ToAudio creation
function ToAudio() {

  var	C = abc2svg.C,

	a_e,				// event array

	p_time,				// last playing time
	abc_time,			// last ABC time
	play_factor			// play time factor

// ToAudio
  return {

// clear the playing events and
// return the old ones as an array of Float32Array:
//	[0]: index of the note in the ABC source
//	[1]: time in seconds
//	[2]: if >= 0: MIDI instrument (MIDI GM number - 1)
//		else: MIDI control message
//	[3]: MIDI note pitch (with cents) / controller
//	[4]: duration			  / controller value
//	[5]: volume (0..1)
//	[6]: voice number
    clear: function() {
	var a_pe = a_e;
	a_e = null
	return a_pe
    }, // clear()

// add playing events from the ABC model
    add: function(start,		// starting symbol
		voice_tb) {		// voice table
	var	i, n, dt, d, v,
		rep_st_s,		// start of sequence to be repeated
		rep_en_s,		// end ("|1")
		rep_nx_s,		// restart at end of repeat
		rep_st_fac,		// and play factor
		instr = [],		// instrument per voice
		s = start

	// set the accidentals and instruments of the voices
	function set_voices() {
	    var v, p_v, s, mi

		// reset the audio engine
		a_e.push(new Float32Array([
				0,
				0,	// (time)
				-1,	// MIDI control
				121,	// reset all controllers
				0,
				1,
				0]))

		for (v = 0; v < voice_tb.length; v++) {
			p_v = voice_tb[v];

			mi = p_v.instr || 0
			if (p_v.midictl) {
				for (s = p_v.sym; s; s = s.next)
					if (s.dur)	// search a note/rest
						break
				if (!s)
					continue	// no note in this voice
				p_v.midictl.forEach(function(val, i) {
					a_e.push(new Float32Array([
						s.istart,
						0,	// (time)
						-1,	// MIDI control
						i,
						val,
						1,
						v]))
				})
			}
			instr[v] = mi;			// MIDI instrument
		}
	} // set_voices()

	// handle the ties
	function do_tie(s, b40, d) {
	    var	i, note,
		v = s.v,
		end_time = s.time + s.dur

		// search the end of the tie
		for (s = s.ts_next; ; s = s.ts_next) {
			if (!s)
				return d

			// skip if end of sequence to be repeated
			if (s == rep_en_s) {
				s = rep_nx_s
				while (s && s.v != v)
					s = s.ts_next
				if (!s)
					return d
				end_time = s.time
			}
			if (s.time != end_time)
				return d
			if (s.type == C.NOTE && s.v == v)
				break
		}
		i = s.notes.length
		while (--i >= 0) {
			note = s.notes[i]
			if (note.b40 == b40) {
				note.ti2 = true	// don't generate sound anymore
				d += s.dur / play_factor;
				return note.tie_ty ? do_tie(s, b40, d) : d
			}
		}
		return d
	} // do_tie()

	// generate the grace notes
	function gen_grace(s) {
		var	g, i, n, t, d, s2,
			next = s.next

		// before beat
		if (s.sappo) {
			d = C.BLEN / 16
		} else if ((!next || next.type != C.NOTE)
			&& s.prev && s.prev.type == C.NOTE) {
			d = s.prev.dur / 2

		// on beat
		} else {

			// keep the sound elements in time order
			next.ts_prev.ts_next = next.ts_next;
			next.ts_next.ts_prev = next.ts_prev;
			for (s2 = next.ts_next; s2; s2 = s2.ts_next) {
				if (s2.time != next.time) {
					next.ts_next = s2
					next.ts_prev = s2.ts_prev;
					next.ts_prev.ts_next = next;
					s2.ts_prev = next
					break
				}
			}

//			if (!next.dots)
//				d = next.dur / 2
//			else if (next.dots == 1)
//				d = next.dur / 3
//			else
//				d = next.dur * 2 / 7;
			d = next.dur / 12
			if (d & (d - 1) == 0)
				d = next.dur / 2	// no dot
			else
				d = next.dur / 3;
			next.time += d;
			next.dur -= d
		}
		n = 0
		for (g = s.extra; g; g = g.next)
			if (g.type == C.NOTE)
				n++;
		d /= n * play_factor;
		t = p_time
		for (g = s.extra; g; g = g.next) {
			if (g.type != C.NOTE)
				continue
			gen_notes(g, t, d);
			t += d
		}
	} // gen_grace()

	// generate the notes
	function gen_notes(s, t, d) {
		for (var i = 0; i <= s.nhd; i++) {
		    var	note = s.notes[i]

			if (note.ti2)		// tied note
				continue
			a_e.push(new Float32Array([
				s.istart,
				t,
				instr[s.v],
				note.midi,
				note.tie_ty ? do_tie(s, note.b40, d) : d,
				1,
				s.v]))
		}
	} // gen_note()

	// add() main

	if (!a_e) {			// if first call
		a_e = []
		abc_time = p_time = 0;
		play_factor = C.BLEN / 4 * 120 / 60	// default: Q:1/4=120
	} else if (s.time < abc_time) {
		abc_time = s.time
	}

	set_voices()			// initialize the voice parameters

	// loop on the symbols
	while (s) {
//		if (s.type == C.TEMPO
//		 && s.tempo) {
		if (s.tempo) {				// tempo change
			d = 0;
			n = s.tempo_notes.length
			for (i = 0; i < n; i++)
				d += s.tempo_notes[i];
			play_factor = d * s.tempo / 60
		}

		dt = s.time - abc_time
		if (dt > 0) {
			p_time += dt / play_factor;
			abc_time = s.time
		}

		switch (s.type) {
		case C.BAR:
			if (!s.seqst)
				break

			// end of repeat
			if (s == rep_en_s) {
				s = rep_nx_s
				abc_time = s.time

			// right repeat
			} else if (s.bar_type[0] == ':') {
				rep_nx_s = s		// repeat next
				if (!rep_en_s)		// if no "|1"
					rep_en_s = s	// repeat end
				if (rep_st_s) {		// if left repeat
					s = rep_st_s
					play_factor = rep_st_fac;
				} else {	// back to the beginning of the tune
					s = start;
					set_voices();
				}
				abc_time = s.time
				break
			}

			// left repeat
			if (s.bar_type[s.bar_type.length - 1] == ':') {
				rep_st_s = s;
				rep_en_s = null
				rep_st_fac = play_factor

			// 1st time repeat
			} else if (s.text && s.text[0] == '1') {
				rep_en_s = s
			}
			break
		case C.GRACE:
			if (s.time == 0		// if before beat at start time
			 && abc_time == 0) {
				dt = 0
				if (s.sappo)
					dt = C.BLEN / 16
				else if (!s.next || s.next.type != C.NOTE)
					dt = d / 2;
				abc_time -= dt
			}
			gen_grace(s)
			break
		case C.REST:
		case C.NOTE:
			d = s.dur
			if (s.next && s.next.type == C.GRACE) {
				dt = 0
				if (s.next.sappo)
					dt = C.BLEN / 16
				else if (!s.next.next || s.next.next.type != C.NOTE)
					dt = d / 2;
				s.next.time -= dt;
				d -= dt
			}
			d /= play_factor
			if (s.type == C.NOTE)
				gen_notes(s, p_time, d)
			else
				a_e.push(new Float32Array([
					s.istart,
					p_time,
					0,
					0,
					d,
					0,
					s.v]))
			break
		case C.BLOCK:
			switch (s.subtype) {
			case "midictl":
			    a_e.push(new Float32Array([	// generate a MIDI control
				s.istart,
				p_time,
				-1,			// MIDI control
				s.ctrl,
				s.val,
				1,
				s.v]))
				break
			case "midiprog":
				instr[s.v] = s.instr	// %%MIDI program
				break
			}
			break
		}
		s = s.ts_next
	}
    } // add()
  } // return
} // ToAudio

// nodejs
if (typeof module == 'object' && typeof exports == 'object')
	exports.ToAudio = ToAudio
