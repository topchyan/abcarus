// sndaud.js - audio output using HTML5 audio
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

// Audio5 creation

// @conf: configuration object - all items are optional:
//	ac: audio context - (default: created on play start)
//	sfu: soundfont URL (sf2 base64 encoded - default: "Scc1t2")
//	onend: callback function called at end of playing
//		Argument:
//			repv: last repeat variant number
//	onnote: callback function called on note start/stop playing
//		Arguments:
//			i: start index of the note in the ABC source
//			on: true on note start, false on note stop
//	errmsg: function called on error (default: alert)
//		Arguments:
//			error message
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
// @start -
// @stop: start and stop music symbols
// @level: repeat variant (optional, default = 0)
//
// stop() - stop playing
//
// set_vol() - set the current sound volume
// @volume: range [0..1] - undefined = return current value

    var	abcsf2 = []			// SF2 instruments

function Audio5(i_conf) {
    var	po,			// play object
	conf = i_conf,		// configuration
	empty = function() {},
	errmsg,
	ac,			// audio context
	gain,			// global gain
	model,			// device model (for iPad|iPhone|iPod)

	// instruments/notes
	parser,			// SF2 parser
	presets,		// array of presets
	instr = [],		// [voice] bank + instrument
	params = [],		// [instr][key] note parameters per instrument
	rates = [],		// [instr][key] playback rates
	w_instr = 0		// number of instruments being loaded

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
				dl--
			dl--
			l -= 4
		}
		a = new Uint8Array(dl)
		for (i = 0; i < l; i += 4) {
			t =	(b64d[s[i]] << 18) +
				(b64d[s[i + 1]] << 12) +
				(b64d[s[i + 2]] << 6) +
				 b64d[s[i + 3]]
			a[j++] = (t >> 16) & 0xff
			a[j++] = (t >> 8) & 0xff
			a[j++] = t & 0xff
		}
		if (l != s.length) {
			t =	(b64d[s[i]] << 18) +
				(b64d[s[i + 1]] << 12) +
				(b64d[s[i + 2]] << 6) +
				 b64d[s[i + 3]]
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
	function sf2_create(instr, sf2par, sf2pre) {	// parser, presets

		// get the instrument parameters
		// adapted from getInstruments() in sf2-parser.js
		function get_instr(i) {
		    var	generator,
			instrument = sf2par.instrument,
			zone = sf2par.instrumentZone,
			j = instrument[i].instrumentBagIndex,
			jl = instrument[i + 1]
				? instrument[i + 1].instrumentBagIndex
				: zone.length,
			info = []

			while (j < jl) {
				generator =
					sf2par.createInstrumentGenerator_(zone, j)
//				instrumentModulator =
//					sf2par.createInstrumentModulator_(zone, j)

				info.push({
					generator: generator.generator,
//					modulator: instrumentModulator.modulator
				})
				j++
			}
//console.log('created instr: '+instrument[i].instrumentName)
		return {
//			name: instrument[i].instrumentName,
			info: info
		}
	} // get_instr()

	// sf2_create
	    var i, j, k, sid, gen, parm, sample, infos,
		sample_hdr, scale, tune,
		gparm = {			// default parameters
			attack: .01,
			hold: .01,
			decay: .01,
//			sustain: 0,
//			release: .01,
		},
		b = instr >> 7,			// bank
		p = instr % 128,		// preset
		pr = sf2pre

		rates[instr] = []

		// search the bank:preset
		for (i = 0; i < pr.length; i++) {
			gen = pr[i].header
			if (gen.preset == p
			 && gen.bank == b)
				break
		}
		pr = pr[i]
		if (!pr) {
			errmsg('unknown instrument ' + b + ':' + p)
			return			// unknown preset!
		}
		pr = pr.info			// list of gen/mod
		for (k = 0; k < pr.length; k++) {
		    gen = pr[k].generator
//fixme: there may be generator definitions here
//fixme: what when many instruments?
		    if (!gen.instrument)
			continue

		    infos = get_instr(gen.instrument.amount).info
		    for (i = 0; i < infos.length; i++) {
			gen = infos[i].generator

			// check if already a generator for this key range
			j = gen.keyRange.lo
			parm = params[instr][j]
			parm =  Object.create(parm || gparm)

			if (gen.attackVolEnv)
				parm.attack = Math.pow(2,
						gen.attackVolEnv.amount / 1200)
			if (gen.holdVolEnv)
				parm.hold = Math.pow(2,
						gen.holdVolEnv.amount / 1200)
			if (gen.decayVolEnv)
				parm.decay = Math.pow(2,
//						gen.decayVolEnv.amount / 1200) / 3
						gen.decayVolEnv.amount / 1200) / 4
			if (gen.sustainVolEnv)
				parm.sustain = gen.sustainVolEnv.amount / 10	// in dB
//			if (gen.releaseVolEnv)
//				parm.release = Math.pow(2,
//						gen.releaseVolEnv.amount / 1200)
			if (gen.initialAttenuation)
				parm.atte = gen.initialAttenuation / 10		// in dB
			if (gen.sampleModes && gen.sampleModes.amount & 1)
				parm.sm = 1

		    if (gen.sampleID) {
			sid = gen.sampleID.amount
			sample_hdr = sf2par.sampleHeader[sid]
			sample = sf2par.sample[sid]
			parm.buffer = ac.createBuffer(1,
						sample.length,
						sample_hdr.sampleRate)

			sample_cp(parm.buffer, sample)

			if (parm.sm) {
				parm.loopStart = sample_hdr.startLoop /
					sample_hdr.sampleRate
				parm.loopEnd = sample_hdr.endLoop /
					sample_hdr.sampleRate
			}

			// define the notes
			scale = (gen.scaleTuning ?
					gen.scaleTuning.amount : 100) / 100,
			tune = (gen.coarseTune ? gen.coarseTune.amount : 0) +
				(gen.fineTune ? gen.fineTune.amount : 0) / 100 +
				sample_hdr.pitchCorrection / 100 -
				(gen.overridingRootKey ?
					gen.overridingRootKey.amount :
					sample_hdr.originalPitch)
		    }

			for (j = gen.keyRange.lo; j <= gen.keyRange.hi; j++) {
				rates[instr][j] = Math.pow(Math.pow(2, 1 / 12),
							(j + tune) * scale)
				params[instr][j] = parm
			}
		    }
		}
	} // sf2_create()

	// load an instrument (.js file)
	function load_instr(instr) {
		w_instr++
		abc2svg.loadjs(conf.sfu + '/' + instr + '.js',
			function() {
			    var	sf2par = new sf2.Parser(b64dcod(abcsf2[instr]))
				sf2par.parse()
			    var	sf2pre = sf2par.getPresets()
				sf2_create(instr, sf2par, sf2pre)

				if (--w_instr == 0)
					play_start()
			},
			function() {
				errmsg('could not find the instrument ' +
					((instr / 128) | 0).toString() + '-' +
					(instr % 128).toString())
				if (--w_instr == 0)
					play_start()
			})
	} // load_instr()

	// define the instruments of the tune
	function def_instr(s, f, sf2par, sf2pre) {
	    var	i,
		bk = [],		// bank number per voice
		nv = -1,		// highest voice number
		vb = 0			// bitmap of voices with instruments

		// scan from the beginning of the tune
		s = s.p_v.sym
		while (s.ts_prev)
			s = s.ts_prev

		for ( ; s; s = s.ts_next) {
			if (s.v > nv) {			// if new voice
				nv = s.v
				bk[nv] = 0		// bank 0
				if (s.p_v.midictl) {
					if (s.p_v.midictl[0])	// MSB
						bk[s.v] = (bk[s.v] & ~0x1fc000)
								+ (s.p_v.midictl[0] << 14)
					if (s.p_v.midictl[32])	// LSB
						bk[s.v] = (bk[s.v] & ~0x3f80)
								+ (s.p_v.midictl[32] << 7)
				}
			}
			switch (s.subtype) {
			case "midiprog":
				break
			case "midictl":
				if (s.ctrl != 0 && s.ctrl != 32)
					continue	// not bank LSB or MSB
				if (bk[s.v] == undefined)
					bk[s.v] = 0
				if (s.ctrl == 0)			// MSB
					bk[s.v] = (bk[s.v] & ~0x1fc000)
							+ (s.val << 14)
				else					// LSB
					bk[s.v] = (bk[s.v] & ~0x3f80)
							+ (s.val << 7)
//				continue
			default:
				continue
			}
			vb |= 1 << s.v
			i = s.instr
			if (i == undefined) {		// channel only
				if (s.chn != 9)
					continue
				i = bk[s.v] ? 0 : 128 * 128	// bank 256 program 0
			}
			if (bk[s.v]) 
				i += bk[s.v]		// bank number
			if (!params[i]) {
				params[i] = []		// instrument being loaded
				f(i, sf2par, sf2pre)	// sf2_create or load_instr
			}
		}
		nv = (2 << nv) - 1
		if (nv != vb			// if some voice(s) without instrument
		 && !params[0]) {
			params[0] = []		// load the piano
			f(0, sf2par, sf2pre)
		}
	} // def_instr()

	// load the needed instruments
	function load_res(s) {
	    if (abc2svg.sf2
	     || conf.sfu.slice(-4) == ".sf2"
	     || conf.sfu.slice(-3) == ".js") {

		// if the soundfont is loaded as .js
		if (abc2svg.sf2) {
			if (!parser) {
				parser = new sf2.Parser(b64dcod(abc2svg.sf2))
				parser.parse()
				presets = parser.getPresets()
			}

		// load the soundfont if not done yet
		} else if (!parser) {
		    w_instr++
		    if (conf.sfu.slice(-3) == ".js") {
			abc2svg.loadjs(conf.sfu,
				function() {
					load_res(s)	// load the instruments
					if (--w_instr == 0)
						play_start()
				},
				function() {
					errmsg('could not load the sound file '
						+ conf.sfu)
					if (--w_instr == 0)
						play_start()
				})
			return
		    }
		    var	r = new XMLHttpRequest()	// .sf2
			r.open('GET', conf.sfu, true)
			r.responseType = "arraybuffer"
			r.onload = function() {
				if (r.status === 200) {
					parser = new sf2.Parser(
							new Uint8Array(r.response))
					parser.parse()
					presets = parser.getPresets()
					load_res(s)	// load the instruments
					if (--w_instr == 0)
						play_start()
				} else {
					errmsg('could not load the sound file '
						+ conf.sfu)
					if (--w_instr == 0)
						play_start()
				}
			}
			r.onerror = function() {
					errmsg('could not load the sound file '
						+ conf.sfu)
				if (--w_instr == 0)
					play_start()
			}
			r.send()
			return
		}

		// create the instruments and start playing
		def_instr(s, sf2_create, parser, presets)
	    } else {

	// (case instruments as base64 encoded js file,
	//  one file per instrument)
		def_instr(s, load_instr)
	    }
	} // load_res()

	// return the play real time in seconds
	function get_time(po) {
		return po.ac.currentTime
	} // get_time()

	// MIDI control
	function midi_ctrl(po, s, t) {
		switch (s.ctrl) {
		case 0:				// bank MSB
			if (po.v_b[s.v] == undefined)
				po.v_b[s.v] = 0
			po.v_b[s.v] = (po.v_b[s.v] & ~0x1fc000)
					+ (s.val << 14)
			break
		case 7:				// volume
			s.p_v.vol = s.val / 127
			break
		case 10:			// pan
			s.p_v.pan = s.val / 63.5 - 1
					// ((0) -1: left, (127) 1:right, (64) 0)
			break
		case 32:			// bank LSB
			if (po.v_b[s.v] == undefined)
				po.v_b[s.v] = 0
			po.v_b[s.v] = (po.v_b[s.v] & ~0x3f80)
					+ (s.val << 7)
			break
		}
	} // midi_ctrl()

	// MIDI prog or channel
	function midi_prog(po, s) {
	    var	i = s.instr

		po.v_c[s.v] = s.chn
		if (i == undefined) {
			if (s.chn != 9)			// if not channel 9
				return
			i = po.v_b[s.v] ? 0 : 128 * 128	// bank 256 program 0
		}
		if (po.v_b[s.v])
			i += po.v_b[s.v]
		po.c_i[s.chn] = i
//console.log('prog i:'+i+' ch:'+s.chn+' v:'+s.v)
	} // midi_prog()

	// create a note
	// @po = play object
	// @s = symbol
	// @key = MIDI key + detune
	// @t = audio start time
	// @d = duration adjusted for speed
	function note_run(po, s, key, t, d) {
//console.log('run c:'+po.v_c[s.v]+' i:'+po.c_i[po.v_c[s.v]])
	    var	g, st,
		t2 = t,
		c = po.v_c[s.v],
		instr = po.c_i[c],
		k = key | 0,
		parm = params[instr][k],
		o = po.ac.createBufferSource(),
		v = s.p_v.vol == undefined ? 1 : s.p_v.vol	// volume (gain)

		if (!v			// mute voice
		 || !parm)		// if the instrument could not be loaded
			return		// or if it has not this key
		o.buffer = parm.buffer
		if (parm.sm) {
			o.loop = true
			o.loopStart = parm.loopStart
			o.loopEnd = parm.loopEnd
		}
		if (o.detune) {
		    var	dt = (key * 100) % 100
			if (dt)			// if micro-tone
				 o.detune.value = dt
		}
//		o.playbackRate.setValueAtTime(parm.rate, ac.currentTime)
		o.playbackRate.value = po.rates[instr][k]

		g = po.ac.createGain()

		if (parm.atte)			// if initial attenuation
			v /= Math.pow(10, parm.atte / 20)
		if (parm.hold <= .01) {
			g.gain.setValueAtTime(v, t)
		} else {
			if (parm.attack <= .01) {
				g.gain.setValueAtTime(v, t)
			} else {
				g.gain.setValueAtTime(.01, t)
				t2 += parm.attack
				g.gain.linearRampToValueAtTime(v, t2)
			}
			t2 += parm.hold
			g.gain.setValueAtTime(v, t2)
		}

		if (parm.sustain && parm.decay > .01) {
			v = parm.sustain == 100
				? .01			// 100dB -> full attenuation
				: v / Math.pow(10, parm.sustain / 20)
			g.gain.exponentialRampToValueAtTime(v, t2 + parm.decay)
		}

		if (s.p_v.pan != undefined) {	// (control 10)
		    var	p = po.ac.createStereoPanner()
			p.pan.value = s.p_v.pan
					
			o.connect(p)
			p.connect(g)
		} else {
			o.connect(g)
		}
		g.connect(po.gain)

		// start the note
		o.start(t)
		o.stop(t + d)
	} // note_run()

	// wait for all resources, then start playing
	function play_start() {
//console.log('- play start')
		if (po.stop) {			// stop playing
			po.onend(repv)
			return
		}

		// all resources are there
		gain.connect(ac.destination)
		abc2svg.play_next(po)
	} // play_start()

	// Audio5 function

	init_b64d()			// initialize base64 decoding

	if (!conf.sfu)
		conf.sfu = "Scc1t2"	// set the default soundfont location

	// get the device model
	if (navigator.userAgentData
	 && navigator.userAgentData.getHighEntropyValues)
		navigator.userAgentData.getHighEntropyValues(['model'])
			.then(function(ua) {
				model = ua.model
			})
	else
		model = navigator.userAgent

    // public methods
    return {

	// get outputs
	get_outputs: function() {
		return (window.AudioContext || window.webkitAudioContext) ?
				['sf2'] : null
	}, // get_outputs()

	// play the symbols
	play: function(i_start, i_end, i_lvl) {

		// get the callback functions
		errmsg = conf.errmsg || alert

		// play a null file to unlock the iOS audio
		// This is needed for iPhone/iPad/...
		function play_unlock() {
		    var buf = ac.createBuffer(1, 1, 22050),
			src = ac.createBufferSource()

			src.buffer = buf
			src.connect(ac.destination)
			src.start(0)
		}

		// initialize the audio subsystem if not done yet
		if (!gain) {
			ac = conf.ac
			if (!ac) {
				conf.ac = ac = new (window.AudioContext ||
							window.webkitAudioContext)
				if (/iPad|iPhone|iPod/.test(model))
					play_unlock()
			}
			gain = ac.createGain()
			gain.gain.value = conf.gain
		}

		while (i_start.noplay)
			i_start = i_start.ts_next
		po = {
			conf: conf,	// configuration
			onend: conf.onend || empty,
			onnote: conf.onnote || empty,
//			stop: false,	// stop playing
			s_end: i_end,	// last music symbol / null
			s_cur: i_start,	// current music symbol
//			repn: false,	// don't repeat
			repv: i_lvl || 0, // repeat variant number
			tgen: 2,	// // generate by 2 seconds
			get_time: get_time,
			midi_ctrl: midi_ctrl,
			midi_prog: midi_prog,
			note_run: note_run,
			timouts: [],
			v_c: [],	// voice to channel
			c_i: [],	// channel to instrument
			v_b: [],	// voice to bank

			// audio specific
			ac: ac,
			gain: gain,
			rates: rates
		}
		w_instr++			// play lock
		load_res(i_start)
		if (--w_instr == 0)		// all resources are there
			play_start()
	}, // play()

	// stop playing
	stop: function() {
		po.stop = true
		po.timouts.forEach(function(id) {
					clearTimeout(id)
				})
		abc2svg.play_next(po)
		if (gain) {
			gain.disconnect()
			gain = null
		}
	}, // stop()

	// set volume
	set_vol: function(v) {
		if (gain)
			gain.gain.value = v
	} // set_vol()
    } // returned object
} // Audio5()
