// toaudio5.js - audio output using HTML5 audio
//
// Copyright (C) 2015-2021 Jean-Francois Moine
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

// Audio5 creation

// @conf: configuration object - all items are optional:
//	ac: audio context - (default: created on play start)
//	sfu: soundfont URL (sf2 base64 encoded - default: "Scc1t2")
//	onend: callback function called at end of playing
//		(no arguments)
//	onnote: callback function called on note start/stop playing
//		Arguments:
//			i: start index of the note in the ABC source
//			on: true on note start, false on note stop
//	instr_load: function to load the sound font of an instrument
//			(default: js_instr_load)
//		Arguments:
//			instr: MIDI instrument number
//			done: callback function in case of success
//				Arguments: soundfont in binary format
//			fail: callback function in case of error
//				no argument
//	errmsg: function called on error (default: alert)
//
//  When playing, the following items must/may be set:
//	gain: (mandatory) volume, must be set to [0..1]
//	speed: (mandatory) must be set to 1
//	new_speed: (optional) new speed value

// Audio5 methods

// get_outputs() - get the output devices
//	return ['sf2'] or null
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
//
// set_vol() - set the current sound volume
// @volume: range [0..1] - undefined = return current value

    var	abcsf2 = []			// SF2 instruments

function Audio5(i_conf) {
	var	conf = i_conf,		// configuration
		onend = function() {},
		onnote = function() {},
		errmsg,
		ac,			// audio context
		gain,			// global gain

	// instruments/notes
		params = [],		// [instr][key] note parameters per instrument
		rates = [],		// [instr][key] playback rates
		w_instr = 0,		// number of instruments being loaded

	// -- play the memorized events --
		evt_idx,		// event index while playing
		iend,			// play array stop index
		stime,			// start playing time
		timouts = []		// note start events

	// default sound font load function
	function js_instr_load(instr, done, fail) {
		abc2svg.loadjs(conf.sfu + '/' + instr + '.js',
			function() {
				 done(b64dcod(abcsf2[instr]))
			},
			fail
		)
	}
	if (!conf.instr_load)
		conf.instr_load = js_instr_load

	// base64 stuff
	    var b64d = []
	function init_b64d() {
	    var	b64l = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/',
		l = b64l.length
		for (var i = 0; i < l; i++)
			b64d[b64l[i]] = i
		b64d['='] = 0
	}
	function b64dcod(s) {
	    var	i, t, dl, a,
		l = s.length,
		j = 0

		dl = l * 3 / 4			// destination length
		if (s[l - 1] == '=') {
			if (s[l - 2] == '=')
				dl--;
			dl--;
			l -= 4
		}
		a = new Uint8Array(dl)
		for (i = 0; i < l; i += 4) {
			t =	(b64d[s[i]] << 18) +
				(b64d[s[i + 1]] << 12) +
				(b64d[s[i + 2]] << 6) +
				 b64d[s[i + 3]];
			a[j++] = (t >> 16) & 0xff;
			a[j++] = (t >> 8) & 0xff;
			a[j++] = t & 0xff
		}
		if (l != s.length) {
			t =	(b64d[s[i]] << 18) +
				(b64d[s[i + 1]] << 12) +
				(b64d[s[i + 2]] << 6) +
				 b64d[s[i + 3]];
			a[j++] = (t >> 16) & 0xff
			if (j < dl)
				a[j++] = (t >> 8) & 0xff
		}
		return a
	}

	// copy a sf2 sample to an audio buffer
	// @b = audio buffer (array of [-1..1])
	// @s = sf2 sample (PCM 16 bits)
	function sample_cp(b, s) {
	    var	i, n,
		a = b.getChannelData(0)		// destination = array of float32

		for (i = 0; i < s.length; i++)
			a[i] = s[i] / 196608	// volume divided by 6
	}

	// create all notes of an instrument
	function sf2_create(parser, instr) {
	    var i, sid, gen, parm, sampleRate, sample,
//		infos = parser.getInstruments()[0].info;
		j,
		infos = [],
		instrument = parser.instrument,
		zone = parser.instrumentZone

		i = instrument[0].instrumentBagIndex
		j = instrument[1] ? instrument[1].instrumentBagIndex
				  : zone.length
		while (i < j) {
			infos.push({
				generator: parser.
						createInstrumentGenerator_(zone, i)
							.generator
			})
			i++
		}

		rates[instr] = []
		for (i = 0; i < infos.length; i++) {
			gen = infos[i].generator;
			if (!gen.sampleID)	// (empty generator!)
				continue
			sid = gen.sampleID.amount;
			sampleRate = parser.sampleHeader[sid].sampleRate;
			sample = parser.sample[sid];
			parm = {
				attack: Math.pow(2, (gen.attackVolEnv ?
					gen.attackVolEnv.amount : -12000) / 1200),
				hold: Math.pow(2, (gen.holdVolEnv ?
					gen.holdVolEnv.amount : -12000) / 1200),
				decay: Math.pow(2, (gen.decayVolEnv ?
					gen.decayVolEnv.amount : -12000) / 1200) / 3,
				sustain: gen.sustainVolEnv ?
					(gen.sustainVolEnv.amount / 1000) : 0,
//				release: Math.pow(2, (gen.releaseVolEnv ?
//					gen.releaseVolEnv.amount : -12000) / 1200),
				buffer: ac.createBuffer(1,
							sample.length,
							sampleRate)
			}
			parm.hold += parm.attack;
			parm.decay += parm.hold;

			// sustain > 40dB is not audible
			if (parm.sustain >= .4)
				parm.sustain = 0.01	// must not be null
			else
				parm.sustain = 1 - parm.sustain / .4

			sample_cp(parm.buffer, sample)

			if (gen.sampleModes && (gen.sampleModes.amount & 1)) {
				parm.loopStart = parser.sampleHeader[sid].startLoop /
					sampleRate;
				parm.loopEnd = parser.sampleHeader[sid].endLoop /
					sampleRate
			}

			// define the notes
		    var scale = (gen.scaleTuning ?
					gen.scaleTuning.amount : 100) / 100,
			tune = (gen.coarseTune ? gen.coarseTune.amount : 0) +
				(gen.fineTune ? gen.fineTune.amount : 0) / 100 +
				parser.sampleHeader[sid].pitchCorrection / 100 -
				(gen.overridingRootKey ?
					gen.overridingRootKey.amount :
					parser.sampleHeader[sid].originalPitch)

			for (j = gen.keyRange.lo; j <= gen.keyRange.hi; j++) {
				rates[instr][j] = Math.pow(Math.pow(2, 1 / 12),
							(j + tune) * scale);
				params[instr][j] = parm
			}
		}
	} // sf2_create()

	// load an instrument (.js file)
	function load_instr(instr, a_e) {
		w_instr++;
		conf.instr_load(instr,
			function(sf2_bin) {
			    var	parser = new sf2.Parser(sf2_bin);
				parser.parse();
				sf2_create(parser, instr);
				if (--w_instr == 0)
					play_start(a_e)
			},
			function() {
				errmsg('could not find the instrument ' +
					((instr / 128) | 0).toString() + '-' +
					(instr % 128).toString());
				if (--w_instr == 0)
					play_start(a_e)
			})
	} // load_instr()

	// start loading the instruments
	function load_res(a_e) {
	    var	i, e, instr, v,
		bk = []				// bank number

		for (i = evt_idx; i < iend; i++) {
			e = a_e[i]
			if (!e)
				break
			instr = e[2]
			v = e[6]
			if (bk[v] == undefined)
				bk[v] = 0
			if (instr < 0) {
				switch (e[3]) {		// controller
				case 0:			// MSB bank
					bk[v] = (bk[v] & 0x3fff) | (e[4] << 14)
					break
				case 32:		// LSB bank
					bk[v] = (bk[v] & 0x1fc07f) | (e[4] << 7)
					break
				case 121:		// reset all controllers
					bk = []
					break
				}
			} else {
				if (bk[v]) {
					instr &= 0x7f
					instr |= bk[v]
					e[2] = instr	// bank + program
				}
				if (!params[instr]) {
					params[instr] = [];
					load_instr(instr, a_e)
				}
			}
		}
	}

	// create a note
	// @e[2] = instrument index
	// @e[3] = MIDI key + detune
	// @t = audio start time
	// @d = duration adjusted for speed
	function note_run(e, t, d) {
	    var	g, st,
		instr = e[2],
		key = e[3] | 0,
		parm = params[instr][key],
		o = ac.createBufferSource();

		if (!parm)		// if the instrument could not be loaded
			return		// or if it has not this key
		o.buffer = parm.buffer
		if (parm.loopStart) {
			o.loop = true;
			o.loopStart = parm.loopStart;
			o.loopEnd = parm.loopEnd;
		}
		if (o.detune) {
		    var	dt = (e[3] * 100) % 100
			if (dt)			// if micro-tone
				 o.detune.value = dt
		}
//		o.playbackRate.setValueAtTime(parm.rate, ac.currentTime);
		o.playbackRate.value = rates[instr][key];

		g = ac.createGain();
		if (parm.hold < 0.002) {
			g.gain.setValueAtTime(1, t)
		} else {
			if (parm.attack < 0.002) {
				g.gain.setValueAtTime(1, t)
			} else {
				g.gain.setValueAtTime(0, t);
				g.gain.linearRampToValueAtTime(1, t + parm.attack)
			}
			g.gain.setValueAtTime(1, t + parm.hold)
		}

		g.gain.exponentialRampToValueAtTime(parm.sustain,
					t + parm.decay);

		o.connect(g);
		g.connect(gain);

		// start the note
		o.start(t);
		o.stop(t + d)
	} // note_run()

	// play the next time sequence
	function play_next(a_e) {
		var	t, e, e2, maxt, st, d;

		// play the next events
		if (a_e)			// if not stop
			e = a_e[evt_idx]
		if (!e || evt_idx >= iend) {
			onend()
			return
		}

		// if speed change, shift the start time
		if (conf.new_speed) {
			stime = ac.currentTime -
					(ac.currentTime - stime) *
						conf.speed / conf.new_speed;
			conf.speed = conf.new_speed;
			conf.new_speed = 0
		}

		timouts = [];
//fixme: better, count the number of events?
		t = e[1] / conf.speed;		// start time
		maxt = t + 3			// max time = evt time + 3 seconds
		while (1) {
			d = e[4] / conf.speed
			if (e[2] >= 0) {	// if not a MIDI control message
			    if (e[5] != 0)		// if not a rest
				note_run(e, t + stime, d)

			// follow the notes while playing
			    var	i = e[0];
				st = (t + stime - ac.currentTime) * 1000;
				timouts.push(setTimeout(onnote, st, i, true));
				setTimeout(onnote, st + d * 1000, i, false)
			}

			e = a_e[++evt_idx]
			if (!e || evt_idx >= iend) {
				setTimeout(onend,
					(t + stime - ac.currentTime + d) * 1000)
				return
			}
			t = e[1] / conf.speed
			if (t > maxt)
				break
		}

		// delay before next sound generation
		timouts.push(setTimeout(play_next, (t + stime - ac.currentTime)
				* 1000 - 300,	// wake before end of playing
				a_e))
	} // play_next()

	// wait for all resources, then start playing
	function play_start(a_e) {
		if (iend == 0) {	// play stop
			onend()
			return
		}

		// wait for instruments
		if (w_instr != 0)
			return

		// all resources are there
		gain.connect(ac.destination);
		stime = ac.currentTime + .2		// start time + 0.2s
			- a_e[evt_idx][1] * conf.speed;
		play_next(a_e)
	} // play_start()

// Audio5 object creation

	init_b64d();			// initialize base64 decoding

	if (!conf.sfu)
		conf.sfu = "Scc1t2"	// set the default soundfont location

    // external methods
    return {

	// get outputs
	get_outputs: function() {
		return (window.AudioContext || window.webkitAudioContext) ?
				['sf2'] : null
	}, // get_outputs()

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
			onnote = conf.onnote
		errmsg = conf.errmsg || alert

		// play a null file to unlock the iOS audio
		// This is needed for iPhone/iPad/...
		function play_unlock() {
		    var buf = ac.createBuffer(1, 1, 22050),
			src = ac.createBufferSource();
			src.buffer = buf;
			src.connect(ac.destination);
			src.noteOn(0)
		}

		// initialize the audio subsystem if not done yet
		if (!gain) {
			ac = conf.ac
			if (!ac) {
				conf.ac = ac = new (window.AudioContext ||
							window.webkitAudioContext);
				if (/iPad|iPhone|iPod/.test(navigator.userAgent))
					play_unlock()
			}
			gain = ac.createGain();
			gain.gain.value = conf.gain
		}

		iend = i_iend;
		evt_idx = istart;
		load_res(a_e);
		play_start(a_e)
	}, // play()

	// stop playing
	stop: function() {
		iend = 0
		timouts.forEach(function(id) {
					clearTimeout(id)
				})
		play_next()
		if (gain) {
			gain.disconnect();
			gain = null
		}
	}, // stop()

	// set volume
	set_vol: function(v) {
		if (gain)
			gain.gain.value = v
	} // set_vol()
    }
} // end Audio5
