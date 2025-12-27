// abc2svg - tonotes.js - convert ABC to a list of MIDI notes
//
// Copyright (C) 2021-2025 Jean-Francois Moine
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

// This abc2svg backend script outputs a list of the notes
// as they could be played.
//
// Usage:
//	(abc2svg batch) tonotes.js ABC_files
//
// The result goes to stdout, one note per line, format:
//
//	<time> <MIDI_instrument> <MIDI_pitch> <duration> <voice_number>

// with TAB as the field separator.
// The number after the dot in the voice number indicates a voice overlay.
//
// The time and the durations are in 1/100s.
// Lines starting with '#' are comments.

// don't load tohtml.js
abc2svg.abc_init = function(args) {
}

// but load the sound generator and the chord generator
abc2svg.loadjs('snd-1.js')

abc2svg.abc_end = function() {
    var	n_a = [ "C", "^C", "D", "_E", "E", "F", "^F", "G", "^G", "A", "_B", "B"]

	function pit(v) {
		if (v - (v | 0))
			return v.toFixed(2)
	    var	abc = n_a[v % 12],
		i = (v / 12) | 0
		if (i > 5) {
			abc = abc.toLowerCase()
			while (i-- > 6)
				abc += "'"
		} else {
			while (i++ < 5)
				abc += ","
		}
		return v.toString() + " " + abc
	} // pit()

    var	e, t, vn,
	audio = ToAudio(),		// (in sndgen.js)
	po = {				// play object
		conf: {		// configuration
			speed: 1
		},
		tgen: 3600, 	// generate by (for) 1 hour
		get_time: function() { return -.3},	// (move the time origin)
		midi_ctrl: function(po, s, t) {
			abc2svg.print(' v:' + s.v
					+ '  MIDI control ' + s.ctrl + ' ' + s.val)
		}, // midi_ctrl()
		midi_prog: function(po, s) {
			if (s.instr != undefined)
				abc2svg.print(' v:' + s.v
					+ '  MIDI program '
					+ (s.chn + 1) + ' '
					+ s.instr)
			else
				abc2svg.print(' v:' + s.v
					+ '  MIDI channel ' + (s.chn + 1))
		}, // midi_prog()
		note_run: function(po, s, k, t, d) {
			abc2svg.print(' ' + (t * 100).toFixed(0) +
				'\t' + po.c_i[po.v_c[s.v]] +
				'\t' + pit(k) +
				'\t' + (d * 100).toFixed(0) +
				'\t' + vn[s.p_v.id])
		}, // note_run()
		v_c: [],		// voice to channel
		c_i: []			// channel to instrument
	},
	tunes = abc.tunes.slice(0)	// get a copy of the generated tunes

	// define the voice numbers
	function dvn(v_tb) {
	    var	i, n, p_v,
		v = 0

		vn = {}
		while (1) {
			p_v = v_tb[v]
			if (!p_v)
				break
			if (vn[p_v.id]) {
				v++
				continue
			}
			vn[p_v.id] = v.toString()
			n = 1
			while (1) {
				p_v = p_v.voice_down
				if (!p_v)
					break
				vn[p_v.id] = v.toString() + '.' + n.toString()
				n++
			}
			v++
		}
	} //dvn()

	// ---- abc_end() body ----

	if (user.errtxt)
		abc2svg.printErr("\n--- Errors ---\n" + user.errtxt)

	abc2svg.print('# MIDI flow (time and duration in 1/100s)\n\
# time instr  pitch  duration voice')

	// loop on the tunes and
	while (1) {
		e = tunes.shift()
		if (!e)
			break

		audio.add(e[0], e[1], e[3])	// generate the music
		dvn(e[1])

		t = (e[2].T || '(no title)').replace(/\n/g, ' / ')
		abc2svg.print('# ------- tune ' +
			e[2].X + '. ' +
			t +
			' -------')
			
		po.stop = false
		po.s_end = null
		po.s_cur = e[0]		// first music symbol
		po.repn = false
		po.repv = 0

		abc2svg.play_next(po)
	}
} // abc_end()

abc2svg.abort = function(e) {
	abc2svg.print(e.message + "\n*** Abort ***\n" + e.stack)
	abc2svg.abc_end()
	abc2svg.quit()
}
