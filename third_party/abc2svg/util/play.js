// snd-1.js - file to include in html pages with abc2svg-1.js for playing
//
// Copyright (C) 2015-2024 Jean-Francois Moine
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

// This file is a wrapper around
// - ToAudio (sndgen.js): generate the play data
// - Audio5 (sndaud.js): play with HTML5 audio API and SF2
// - Midi5 (sndmid.js): play with HTML5 MIDI api
// old version:
// - ToAudio (toaudio.js - convert ABC to audio sequences)
// - Audio5 (toaudio5.js - play the audio sequences with webaudio and SF2)
// - Midi5 (tomidi5.js - play the audio sequences with webmidi)

// AbcPlay methods:
//
// set_sfu() - get/set the soundfont URL
// @url: URL - undefined = return current value
//
// set_speed() - get/set the play speed
// @speed: < 1 slower, > 1 faster - undefined = return current value
//
// set_vol() - get/set the current sound volume
// @volume: range [0..1] - undefined = return current value

function AbcPlay(i_conf) {
    var	conf = i_conf,
	init = {},
	audio = ToAudio(),
	audio5, midi5, current,
	abcplay = {				// returned object (only instance)
		clear: audio.clear,
		add: audio.add,
		set_sfu: function(v) {
			if (v == undefined)
				return conf.sfu
			conf.sfu = v
		},
		set_speed: function(v) {
			if (v == undefined)
				return conf.speed
			conf.new_speed = v
		},
		set_vol: function(v) {
			if (v == undefined)
				return conf.gain;
			conf.gain = v
			if (current && current.set_vol)
				current.set_vol(v)
		},
		play: play,
		stop: vf
	}

	function vf() {}			// void function

	// start playing when no defined output
	function play(istart, i_iend, a_e) {
		init.istart = istart;
		init.i_iend = i_iend;
		init.a_e = a_e
		if (midi5)
			midi5.get_outputs(play2) // get the MIDI ports
		else
			play2()
	} // play()

	// if set, out contains an array of the MIDI output ports
	function play2(out) {
	    var o,
		n = window.sessionStorage && sessionStorage.getItem("audio")

		if (!out)
			out = []
		o = audio5.get_outputs()	// get the HTML5 audio port
		if (o)
			Array.prototype.push.apply(out, o)
		if (out.length == 0) {
			if (conf.onend)		// no output port
				conf.onend()
			return
		}
		if (out.length == 1) {
			o = 0			// only one port
		} else {
			if (n) {		// if port selected in a previous page
				for (o = 0; o < out.length; o++)
					if (out[o] == n)
						break
			}
		    if (!n || o >= out.length) {
			o = -1			// ask which port?
			var pr = "Use"
			for (var i = 0; i < out.length; i++)
				pr += "\n " + i + ": " + out[i]
			var res = window.prompt(pr, '0')
			if (res) {
				o = Number(res)
				if (isNaN(o) || o < 0 || o >= out.length)
					o = -1
			}
			if (!res || o < 0) {
				if (conf.onend)
					conf.onend()
				return
			}

			// memorize the output port for the next pages of the same session
			if (window.sessionStorage)
				sessionStorage.setItem("audio", out[o])
		    }
		}

		// set the current output changing the play functions
		current = out[o] == 'sf2' ? audio5 : midi5;
		abcplay.play = current.play;
		abcplay.stop = current.stop
		if (current.set_output)
			current.set_output(out[o]);
		abcplay.play(init.istart, init.i_iend, init.a_e);
	} // play2()

	// set default configuration values
	conf.gain = 0.7;
	conf.speed = 1;

	// get the play parameters from localStorage
	(function() {
	    var	v
		try {
			if (!localStorage)
				return
		} catch (e) {
			return
		}
	    if (!conf.sfu) {
		v = localStorage.getItem("sfu")
		if (v)
			conf.sfu = v;
	    }
		v = localStorage.getItem("volume")
		if (v)
			conf.gain = Number(v)
	})()

	// initialize the playing engines
	if (typeof Midi5 == "function")
		midi5 = Midi5(conf)
	if (typeof Audio5 == "function")
		audio5 = Audio5(conf);

	return abcplay
} // AbcPlay

// nodejs
if (typeof module == 'object' && typeof exports == 'object')
	exports.AbcPlay = AbcPlay
