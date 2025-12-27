// sndmem.js - generate play events for use with toaudio5 or tomidi5
//
// Copyright (C) 2020-2022 Jean-Francois Moine
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

// The function abc2svg.sndmem() must be called after the abc2svg generation
// and after the play data have been defined (by the function audio.add
// in util/sndgen.js).
//
// It returns an array of Float32Array:
//	[0]: index of the note in the ABC source
//	[1]: time in seconds
//	[2]: if >= 0: MIDI instrument (MIDI GM number - 1)
//		else: MIDI control message
//	[3]: MIDI note pitch (with cents) / controller
//	[4]: duration			  / controller value
//	[5]: volume (0..1)
//	[6]: voice number

abc2svg.sndmem = function(abc) {
    var	po, i, tune

	// create a note
	// @po = play object
	// @s = symbol
	// @k = MIDI key + detune
	// @t = audio start time (ms)
	// @d = duration adjusted for speed (ms)
	function note_run(po, s, k, t, d) {
		po.a_e.push(new Float32Array([
				s.istart,
				t,
				po.c_i[po.v_c[s.v]],
				k,
				d,
				1,
				s.v]))
	} // note_run()

	// return the play real time in seconds
	function get_time(po) {
		return 0
	} // get_time()

	// MIDI control
	function midi_ctrl(po, s, t) {
		po.a_e.push(new Float32Array([
				s.istart,
				0,	// (time - unused)
				-1,	// MIDI control
				s.ctrl,
				s.val,
				1,
				s.v]))
	} // midi_ctrl()

	// MIDI channel and/or program
	function midi_prog(po, s) {
		po.v_c[s.v] = s.chn
		if (s.instr)
			po.c_i[s.chn] = s.instr
	} // midi_prog()

	// define the play object
	po = {
		conf: {		// configuration
			speed: 1
		},
		tgen: 3600, 	// generate by (for) 1 hour
		get_time: get_time,
		midi_ctrl: midi_ctrl,
		midi_prog: midi_prog,
		note_run: note_run,
		v_c: [],	// voice to channel
		c_i: [],	// channel to instrument

		// sndmem specific
		a_e: []
	}

	// loop on the tunes
	while (1) {

		// get the [first symbol, voice table] of the next tune
		tune = abc.tunes.shift()
		if (!tune)
			break

		po.stop = false
		po.s_end = null
		po.s_cur = tune[0]	// first music symbol
		po.repn = false
		po.repv = 0

		abc2svg.play_next(po)
	}
	return po.a_e
} //sndmem()
