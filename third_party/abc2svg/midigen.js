// midigen.js - ABC to MIDI file generation using abc2svg
//
// Copyright (C) 2025 Jean-Francois Moine
// License LGPL (see <http://www.gnu.org/licenses/>)
//
// The following function (midigen) generates a MIDI file for each tune
//	and stores this file in the index 4 of the tune (in the tune table).
//
// The ABC code must have been parsed and may be displayed.
// The internal representation of the music is (still) available
//	via the 'tunes' table.
// This table is an array indexed by a tune sequence number (not X:).
// Each element of this table is an array of:
//  0: first symbol of the tune in time order
//  1: voice table
//  2: info (information fields)
//  3: fmt (format parameters)
//
function midigen() {
    var	i, e, ct,
	C = abc2svg.C,
	det_tb,					// detune cache - index = MIDI key
	off_a = [],				// list of note off [note_off, time]
	mid_a = [],				// array of MIDI elements
	eot = 0,
	audio = ToAudio(),			// (in util/sndgen.js)
	tunes = abc.tunes,			// generated tunes
	po = {					// play object
		conf: {				// configuration
			speed: 1
		},
		tgen: 3600, 			// generate by (for) 1 hour
		get_time: function() { return -.3},	// (move the time origin)
		midi_ctrl: midi_ctrl,
		midi_prog: midi_prog,
		note_run: note_run,
		v_c: [],			// voice to channel
		c_i: [],			// channel to instrument
		op: {
			send: function(a, t) {		// send a MIDI event
			    var	i, j, mt

				t = t | 0 + 1		// time in 1000ms, origin 1
//check time
if(t < ct){
abc2svg.printErr("!! Bug: time problem "+t+" "+ct)
t = ct
}

				if ((a[0] & 0xf0) == 0x80) {	// if note off
					off_a.push([a, t])	// memorize it
					if (t > eot)
						eot = t
					return
				}
				if (!t)
					t = ct
				if (t > ct)
					stop_notes(t)
				put_op(a, t)
			} // send()
		} // op
	} // po

	// put a MIDI event in the output stream
	function put_op(a, t) {
		mid_a.push.apply(mid_a, vl(t - ct))	// delta time
		ct = t					// new current time
		mid_a.push.apply(mid_a, a)		// MIDI event
	} // put_op()

	// stop the notes ending at time t
	function stop_notes(t) {
	    var	mt, i, j, a

		while (1) {
			mt = t + 1
			for (i = 0; i < off_a.length; i++) {
				a = off_a[i]
				if (a[1] < mt) {
					mt = a[1]	// minimum time
					j = i
				}
			}
			if (mt > t)
				break
			put_op(off_a[j][0], off_a[j][1])
			off_a.splice(j, 1)		// remove the note off
		}
	} // stop_notes()

	// define a detune if any
	// return the MIDI key
	function mutone(k, dt, t) {
	    var old_dt,
		kn = k

		if (!det_tb) {
			if (!dt)
				return kn	// no microtone
			det_tb = {}
		}
		if (dt > 50)
			kn++
		old_dt = det_tb[kn]		// previous detune of 'k'

		if ((!old_dt && !dt)
		 || old_dt == dt)
			return kn		// same detune
		det_tb[kn] = dt

		dt *= 163.84			// 16384 / 100
		po.op.send([			// send a tuning message
			0xf0,
			0x0b,			// (length when in MIDI file)
			0x7f,			// realtime SysEx
			0x7f,			// all devices
			0x08,			// MIDI tuning
			0x02,			// note change
			0,			// tuning prog number
			0x01,			// number of notes
				kn,		// new key
				k,		// lower semitone
				(dt >> 7) & 0x7f, // fraction of semitone
				dt & 0x7f,
			0xf7			// SysEx end
			], t)
		return kn
	} // mutone()

	// create a note
	// @po = play object
	// @s = symbol
	// @k = MIDI key + detune
	// @t = audio start time (s)
	// @d = duration adjusted for speed (s)
	function note_run(po, s, k, t, d) {
	    var	dt = Math.round((k * 100) % 100), // detune in cents
		c = po.v_c[s.v]			// channel

		k |= 0				// remove the detune value
		t *= 1000			// convert to ms
		k = mutone(k, dt, t)		// handle the detune
		po.op.send([0x90 + c, k, 80], t)		// note on
		po.op.send([0x80 + c, k, 0], t + d * 1000 - 20) // note off
	} // note_run()

	// send a MIDI control
	function midi_ctrl(po, s, t) {
		po.op.send([0xb0 + po.v_c[s.v], s.ctrl, s.val],
			t * 1000)
	} // midi_ctrl()

	// change the channel and/or send a MIDI program	
	function midi_prog(po, s) {
	    var	i,
		c = s.chn

		po.v_c[s.v] = c

		// at channel start, reset and initialize the controllers
		if (po.c_i[c] == undefined)
			po.op.send([0xb0 + c, 121, 0])

		i = s.instr
		if (i != undefined) {		// if not channel only
			po.c_i[c] = i		// send a MIDI program
			po.op.send([0xc0 + c, i & 0x7f])
		}
	} // midi_prog()

	// add a variable length value to the midi array
	function vl(v) {
	    var	a = [ v & 0x7f ]

		while (v >>= 7)
			a.unshift((v & 0x7f) + 0x80)
		return a
	} // vl()

	// create a MIDI file
	// The file is stored in the element 4 of the array of the tune 'e'.
	function midi_create(e) {
	    var	l, s, d, n, i,
		hd = [  0x4d, 0x54, 0x68, 0x64,	// "MThd"
			0, 0, 0, 6,		// header length
			0, 0,			// format 0
			0, 1,			// number of tracks
			1, 224,			// divisions = 480
			0x4d, 0x54, 0x72, 0x6b,	// "MTrk"
			0, 0, 0, 0 ,		// track length (offset = 18)
			0, 0xff, 0x01,		// meta text
			  10, 0x6e, 0x6f, 0x74, 0x65, 0x20, 0x74, 0x72, 0x61, 0x63, 0x6b,
						//	"note track"
			0, 0xff, 0x51,		// meta tempo
			  3, 0, 0, 0,		//	(offset 40)
			0, 0xff, 0x59,		// key signature
			  2, 0, 0,		//	(offset 47)
			0, 0xff, 0x58,		// time signature
			  4, 0, 0, 0, 0,	//	(offset 53)
			0, 0xb0, 7, 0x60,	// ctrl 7 (volume)
			0, 0xb0, 10, 0x40	// ctrl 10 (pan)
		],
		txt = [],			// more information
		tail = vl(eot - ct)

		tail.push(0xff)			// meta-event
		tail.push(0x2f)			// End Of Track
		tail.push(0)

		// tempo
		n = 500000 // = 60000000 / 120	// default Q:1/4=120
		hd[40] = n >> 16
		hd[41] = (n >> 8) & 0xff
		hd[42] = n & 0xff

		// key signature
		s = e[1][0].key			// starting key of the first voice
		hd[47] = s.k_sf			// number of sharps/flats
		hd[48] = s.k_mode == 5		// minor

		// time signature
		s = e[1][0].meter		// starting meter of the first voice
		if (!s.a_meter[0])
			s.a_meter[0] = {top:"4", bot:"4"}
		else if (s.a_meter[0].top == "C"
		 || s.a_meter[0].top == "C|")
			s.a_meter[0].top = "4",
			s.a_meter[0].bot = "4"
		hd[53] = +s.a_meter[0].top
		hd[54] = Math.log2(+s.a_meter[0].bot)
		hd[55] = 24 * +s.a_meter[0].top / +s.a_meter[0].bot
		if (!(s.a_meter[0].top & 1))
			hd[55] *= 2
		hd[56] = 8

		if (e[2].T) {			// T: ?
			n = e[2].T.split("\n")
			l = 1
			while (1) {
				d = n.shift()
				if (!d)
					break
				txt.push.apply(txt,
					[ l,		// dt
					0xff, 0x01,	// meta text
					d.length])
				for (i = 0; i < d.length; i++)
					txt.push(d.charCodeAt(i))
				l = 0
			}
		}

		// set the data length
		l = hd.length - 22 + txt.length + mid_a.length + tail.length
		hd[18] = (l >> 24) & 0xff
		hd[19] = (l >> 16) & 0xff
		hd[20] = (l >> 8) & 0xff
		hd[21] = l & 0xff

		// create the binary file
		e[4] = new Uint8Array(hd.concat(txt, mid_a, tail))
		mid_a.length = 0	// ready for next tune
	} // midi_create()

	// ---- midigen() body ----

	if (user.errtxt)
		abc2svg.printErr("\n--- Errors ---\n" + user.errtxt)

	// loop on the tunes
	for (i = 0; i < tunes.length; i++) {
		e = tunes[i]
		audio.add(e[0], e[1], e[3])	// generate the music

		po.stop = 0 //false
		po.s_end = null
		po.s_cur = e[0]		// first music symbol
		po.repn = 0 //false
		po.repv = 0

		ct = e[2].T ? 1 : 0	// MIDI current time

		abc2svg.play_next(po)	// generate the MIDI events in mid_a

		stop_notes(eot)		// stop all the notes

		midi_create(e)		// create the MIDI file in e[4]

////trace
//abc2svg.print('# ------- tune '
// +e[2].X + '. '
// +(e[2].T || '(no title)').replace(/\n/g, ' / ')
// +' -------')
//var b="",v
//for(var j=0;j<e[4].length;j++){
// v = e[4][j].toString(16)
// if(v.length==1)v="0"+v
// if(!(j%8))b+=" "
// b+=" "+v
// if(!((j+1)%16)){
//  abc2svg.print(b)
//  b=""
// }
//}
//if(b)abc2svg.print(b)

	} // end of tune loop
} // midigen()
