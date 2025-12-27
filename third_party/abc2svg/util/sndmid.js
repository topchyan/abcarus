// sndmid.js - audio output using HTML5 MIDI
//
// Copyright (C) 2019-2024 Jean-Francois Moine
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

// Midi5 creation

// @conf: configuration object - all items are optional:
//	onend: callback function called at end of playing
//		Argument:
//			repv: last repeat variant number
//	onnote: callback function called on note start/stop playing
//		Arguments:
//			i: start index of the note in the ABC source
//			on: true on note start, false on note stop

//  When playing, the following items must/may be set:
//	speed: (mandatory) must be set to 1
//	new_speed: (optional) new speed value

// Midi5 methods

// get_outputs() - get the output ports
//
// set_output() - set the output port
//
// play() - start playing
// @start -
// @stop: start and stop music symbols
// @level: repeat variant (optional, default = 0)
//
// stop() - stop playing

function Midi5(i_conf) {
    var	po,
	conf = i_conf,		// configuration
	empty = function() {},
	det_tb,			// detune table
	rf,			// get_outputs result function
	op			// output MIDI port

	// return the play real time in seconds
	function get_time(po) {
		return window.performance.now() / 1000
	} // get_time()

    var	mutone = function(k, a, t) {
		if (!det_tb) {
			if (!a)
				return		// no microtone
			det_tb = {}
		}
		if (!Midi5.ma.sysexEnabled) {	// no SysEx
			mutone = empty		// don't come back here anymore
			return
		}
	    var	old_a = det_tb[k]		// previous detune of 'k'

		if ((!old_a && !a)
		 || old_a == a)
			return			// same detune
		det_tb[k] = a

		a *= 163.84			// 16384 / 100
		po.op.send(new Uint8Array([
			0xf0, 0x7f,		// realtime SysEx
			0x7f,			// all devices
			0x08,			// MIDI tuning
			0x02,			// note change
			0,			// tuning prog number
			0x01,			// number of notes
				k,		// key
				k,		// semitone
				(a >> 7) & 0x7f, // fraction of semitone
				a & 0x7f,
			0xf7			// SysEx end
			]), t)
	} // mutone()

	// create a note
	// @po = play object
	// @s = symbol
	// @k = MIDI key + detune
	// @t = audio start time (s)
	// @d = duration adjusted for speed (s)
	function note_run(po, s, k, t, d) {
	    var	j,
		a = (k * 100) % 100,	// detune in cents
		c = po.v_c[s.v],
		i = po.c_i[c]

		k |= 0			// remove the detune value

		t *= 1000		// convert to ms
		d *= 1000

		mutone(k, a, t)		// handle microtone accidentals

		po.op.send(new Uint8Array([0x90 + c, k, 80]), t)	// note on
		po.op.send(new Uint8Array([0x80 + c, k, 0]), t + d - 20) // note off
	} // note_run()

	// send a MIDI control
	function midi_ctrl(po, s, t) {
		po.op.send(new Uint8Array([0xb0 + po.v_c[s.v],
					s.ctrl, s.val]),
			t * 1000)
	} // midi_ctrl()

	// change the channel and/or send a MIDI program	
	function midi_prog(po, s) {
	    var	i,
		c = s.chn

		po.v_c[s.v] = c

		// at channel start, reset and initialize the controllers
		if (po.c_i[c] == undefined) {
//fixme: does not work with fluidsynth
			po.op.send(new Uint8Array([0xb0 + c, 121, 0]))
//fixme: is this useful?
if(0){
			if (s.p_v.midictl) {
			    for (i in s.p_v.midictl)
				po.op.send(new Uint8Array([0xb0 + c,
							i,
							s.p_v.midictl[i]]))
			}
}
		}

		i = s.instr
		if (i != undefined) {		// if not channel only
			po.c_i[c] = i		// send a MIDI program
			po.op.send(new Uint8Array([0xc0 + c, i & 0x7f]))
		}
	} // midi_prog()

	// MIDI output is possible,
	// return the possible ports in return to get_outputs()
	function send_outputs(access) {
	    var	o, os,
		out = []

		Midi5.ma = access	// store the MIDI access in the Midi5 function

		if (access && access.outputs.size > 0) {
			os = access.outputs.values()
			while (1) {
				o = os.next()
				if (!o || o.done)
					break
				out.push(o.value.name)
			}
		}
		rf(out)
	} // send_outputs()

// public methods
	return {

		// get outputs
		get_outputs: function(f) {
			if (!navigator.requestMIDIAccess) {
				f()			// no MIDI
				return
			}
			rf = f

			// open MIDI with SysEx
			navigator.requestMIDIAccess({sysex: true}).then(
				send_outputs,
				function(msg) {
					rf()
				}
			)
		}, // get_outputs()

		// set the output port
		set_output: function(name) {
			if (!Midi5.ma)
				return
		    var o,
			os = Midi5.ma.outputs.values()

			while (1) {
				o = os.next()
				if (!o || o.done)
					break
				if (o.value.name == name) {
					op = o.value
					break
				}
			}
		},

		// play the symbols
		play: function(i_start, i_end, i_lvl) {
			po = {
				conf: conf,	// configuration
				onend: conf.onend || empty,
				onnote: conf.onnote || empty,
//				stop: false,	// stop playing
				s_end: i_end,	// last music symbol / null
				s_cur: i_start,	// current music symbol
//				repn: false,	// don't repeat
				repv: i_lvl || 0, // repeat variant number
				tgen: 2, 	// generate by 2 seconds
				get_time: get_time,
				midi_ctrl: midi_ctrl,
				midi_prog: midi_prog,
				note_run: note_run,
				timouts: [],

				// MIDI specific
				op: op,		// output port
				v_c: [],	// voice to channel
				c_i: []		// channel to instrument
			}

			abc2svg.play_next(po)
		}, // play()

		// stop playing
		stop: function() {
			po.stop = true
			po.timouts.forEach(function(id) {
						clearTimeout(id)
					})
			abc2svg.play_next(po)
//			po.onend(repv)
//fixme: op.clear() should exist...
			if (op && op.clear)
				op.clear()
		} // stop()
	} // returned object
} // end Midi5
