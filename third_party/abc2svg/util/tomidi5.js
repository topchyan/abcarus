// tomidi5.js - audio output using HTML5 MIDI
//
// Copyright (C) 2018-2019 Jean-Francois Moine
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

// Midi5 creation

// @conf: configuration object - all items are optional:
//	onend: callback function called at end of playing
//		(no arguments)
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
// @start_index -
// @stop_index: indexes of the play_event array
// @play_event: array of array
//		[0]: index of the note in the ABC source
//		[1]: time in seconds
//		[2]: if >= 0: MIDI instrument (MIDI GM number - 1)
//			else: MIDI control message
//		[3]: MIDI note pitch (with cents) / controller
//		[4]: duration			  / controller value
//		[5]: volume (0..1 - optional)
//		[6]: voice number
//
// stop() - stop playing

function Midi5(i_conf) {
    var	conf = i_conf,		// configuration
	onend = function() {},
	onnote = function() {},
	rf,			// get_outputs result function

// MIDI variables
	op,			// output port
	v_i = [],		// voice (channel) to instrument
	bk = [],		// bank of the voice

// -- play the memorized events --
	evt_idx,		// event index while playing
	iend,			// play array stop index
	stime,			// start playing time in ms
	timouts = []		// note start events

// create a note
// @e[2] = instrument index
// @e[3] = MIDI key + detune
// @e[6] = voice (channel) number
// @t = audio start time (ms)
// @d = duration adjusted for speed (ms)
    function note_run(e, t, d) {
    var	k = e[3] | 0,
	i = e[2],
	c = e[6] & 0x0f,	//fixme
	a = (e[3] * 100) % 100	// detune in cents

	if (bk[c] == 128)			// if bank 128 (percussion)
		c = 9				// force the channel 10
	if (i != v_i[c]) {			// if program change

		// at channel start, reset all controllers
//fixme: does not work with fluidsynth
		if (v_i[c] == undefined)
			op.send(new Uint8Array([0xb0 + c, 121, 0]));

		v_i[c] = i
		op.send(new Uint8Array([0xc0 + c, i & 0x7f]))	// program
	}
	if (a && Midi5.ma.sysexEnabled) {	// if microtone
// fixme: should cache the current microtone values
		op.send(new Uint8Array([
			0xf0, 0x7f,	// realtime SysEx
			0x7f,		// all devices
			0x08,		// MIDI tuning standard
			0x02,		// note change
			i & 0x7f,		// tuning prog number
			0x01,		// number of notes
				k,		// key
				k,		// note
				a / .78125,	// MSB fract
				0,		// LSB fract
			0xf7		// SysEx end
			]), t);
	}
	op.send(new Uint8Array([0x90 + c, k, 127]), t);		// note on
	op.send(new Uint8Array([0x80 + c, k, 0]), t + d - 20) // note off
    } // note_run()

// play the next time sequence
    function play_next(a_e) {
    var	t, e, e2, maxt, st, d, c

	// play the next events
	if (a_e)			// if not stop
		e = a_e[evt_idx]
	if (!op || evt_idx >= iend || !e) {
		onend()
		return
	}
			
	// if speed change, shift the start time
	if (conf.new_speed) {
		stime = window-performance.now() -
				(window.performance.now() - stime) *
					conf.speed / conf.new_speed;
		conf.speed = conf.new_speed;
		conf.new_speed = 0
	}

	timouts = [];
	t = e[1] / conf.speed * 1000;	// start time
	maxt = t + 3000			// max time = evt time + 3 seconds
	while (1) {
		d = e[4] / conf.speed * 1000
		if (e[2] >= 0) {		// if not a MIDI control message
		    if (e[5] != 0)		// if not a rest
			note_run(e, t + stime, d)

		// follow the notes while playing
			st = t + stime - window.performance.now();
			timouts.push(setTimeout(onnote, st, e[0], true));
			setTimeout(onnote, st + d, e[0], false)
		} else {				// MIDI control
			c = e[6] & 0x0f
			op.send(new Uint8Array([0xb0 + c, e[3], e[4]]),
				t + stime)
			if (bk[c] == undefined)
				bk[c] = 0
			switch (e[3]) {
			case 0:			// MSB bank
				bk[c] = (bk[c] & 0x7f) | (e[4] << 7)
				break
			case 32:		// LSB bank
				bk[c] = (bk[c] & 0x3f80) | e[4]
				break
			case 121:		// reset all controllers
				bk = []
				break
			}
		}

		e = a_e[++evt_idx]
		if (!e || evt_idx >= iend) {
			setTimeout(onend,
				t + stime - window.performance.now() + d)
			return
		}
		t = e[1] / conf.speed * 1000
		if (t > maxt)
			break
	}

	// delay before next sound generation
	timouts.push(setTimeout(play_next, (t + stime - window.performance.now())
			- 300,		// wake before end of playing
			a_e))
    } // play_next()

    // MIDI output is possible,
    // return the possible ports in return to get_outputs()
    function send_outputs(access) {
    var	o, os,
	out = [];

	Midi5.ma = access;	// store the MIDI access in the Midi5 function

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

// Midi5 object creation (only one instance)

// public methods
    return {

	// get outputs
	get_outputs: function(f) {
		if (!navigator.requestMIDIAccess) {
			f()			// no MIDI
			return
		}
		rf = f;

		// open MIDI with SysEx
		navigator.requestMIDIAccess({sysex: true}).then(
			send_outputs,
			function(msg) {

				// open MIDI without SysEx
				navigator.requestMIDIAccess().then(
					send_outputs,
					function(msg) {
						rf()
					}
				)
			}
		)
	}, // get_outputs()

	// set the output port
	set_output: function(name) {
	    var o, os
		if (!Midi5.ma)
			return
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

	// play the events
	play: function(istart, i_iend, a_e) {
		if (!a_e || istart >= a_e.length) {
			onend()			// nothing to play
			return
		}

		// get the callback functions
		if (conf.onend)
			onend = conf.onend
		if (conf.onnote)
			onnote = conf.onnote;

		iend = i_iend;
		evt_idx = istart;
if (0) {
// temperament
	op.send(new Uint8Array([
			0xf0, 0x7f,	// realtime SysEx
			0x7f,		// all devices
			0x08,		// MIDI tuning standard
			0x02,		// note change
			0x00,		// tuning prog number
			0x01,		// number of notes
				0x69,		// key
				0x69,		// note
				0x00,		// MSB fract
				0,		// LSB fract
			0xf7		// SysEx end
			]), t);
}

		v_i = [];		// must do a reset of all channels
		stime = window.performance.now() + 200	// start time + 0.2s
			- a_e[evt_idx][1] * conf.speed * 1000;
		play_next(a_e)
	}, // play()

	// stop playing
	stop: function() {
		iend = 0
		timouts.forEach(function(id) {
					clearTimeout(id)
				})
		play_next()
//fixme: op.clear() should exist...
		if (op && op.clear)
			op.clear()
	} // stop()
    }
} // end Midi5
