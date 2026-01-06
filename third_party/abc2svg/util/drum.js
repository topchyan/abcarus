// drum.js - generation of drum sequences
//
// Copyright (C) 2026 Jean-François Moine
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

abc2svg.drum = function(first,		// first symbol in time
			 voice_tb,	// voice table
			 cfmt) {	// tune parameters
    var	c, i, on, n, nb, ss, v, str, pits, vols, l, dl,
	s = first,
	C = abc2svg.C,
	vdr = {				// create the percussion voice
		v: voice_tb.length,
		id: "_drum",
		time: 0,
		sym: {
			type: C.BLOCK,
			subtype: "midiprog",
			chn: 9,		// percussion channel
//			instr: 0,
			time: 0,
			dur: 0
		}
	},
	_sdr = {			// drum template
		v: vdr.v,
		p_v: vdr,
		type: C.NOTE,
		nhd: 0
	}

	// generate the drum sequences up to %%MIDI drumxx or end of voice
	function gendr(ss, s) {
	    var	c, i, j, sdr, s2,
		ti = ss.time,
		te = s.time + (s.dur || 0),
		d = dl / l		// base note duration

		while (ti < te) {
			j = 0
			for (i = 0; i < str.length; i++) {	// generate 'nb' measures
				c = str[i]
				if (c == 'z') {
					ti += d
					c = str[i + 1]
					if (c >= '2' && c <= '9') {
						ti += (+c - 1) * d
						i++
					}
					continue
				}
				sdr = Object.create(_sdr)
				sdr.time = ti
				s2 = sdr
				sdr.dur = d
				sdr.notes = [{
					dur: d,
					midi: pits[j++]
				}]
				c = str[i + 1]
				if (c >= '2' && c <= '9') {
					sdr.dur *= +c
					sdr.notes[0].dur = sdr.dur
					i++
				}
					if (s2.next) {			// voice linkage
						sdr.next = s2.next
						s2.next = sdr
						sdr.prev = s2
						sdr.next.prev = sdr
					} else {			// first drum symbol
						vdr.last_sym.next = sdr
						sdr.prev = vdr.last_sym
						vdr.last_sym = sdr
					}
					while (s && s.time > ti)	// time linkage
						s = s.ts_prev
					while (s && s.time < ti)
						s = s.ts_next
					while (s && s.time == ti && s.v < sdr.v)
						s = s.ts_next
					if (!s || !s.ts_prev) {
						// If the time chain cannot be walked (unexpected end), drop this drum note
						// rather than crashing playback.
						vdr.last_sym = sdr.prev
						vdr.last_sym.next = null
						ti += sdr.dur
						continue
					}
					sdr.ts_next = s
					sdr.ts_prev = s.ts_prev
					s.ts_prev = sdr
					sdr.ts_prev.ts_next = sdr

				ti += sdr.dur
			}
		}
	} //gendr()

	// -- drum() --

	// link the drum voice
	vdr.sym.p_v = vdr
	vdr.sym.v = vdr.v
	vdr.last_sym = vdr.sym

	while (!s.dur)
		s = s.ts_next
	vdr.sym.ts_prev = s.ts_prev
	vdr.sym.ts_next = s
	vdr.sym.ts_prev.ts_next =
		s.ts_prev = vdr.sym

	// generate the drum sequence per voice
	for (v = 0; v < voice_tb.length; v++) {
		on = str = null
		nb = 1
		for (s = voice_tb[v].sym; s; s = s.next) {
			if (s.subtype != "mididrum")
				continue
			if (s.on)
				on = 1 //true		// on/off
			if (s.nb)
				nb = s.nb		// number of bars
			if (s.txt) {
				str = s.txt.shift()		// string
				n = 0
				for (i = 0; i < str.length; i++)
					if (str[i] == 'd')
						n++
				pits = s.txt.slice(0, n)	//  pitch_list
				if (s.txt.length > n)
					vols = s.txt.slice(n)	// volume_list
				n = 0
				for (i = 0; i < str.length; i++) {
					c = str[i]
					n++
					if (c >= '2' && c <= '9')
						n += +c - 2
				}
				l = n				// number of steps
			}
			if (on && str) {
				ss = s
				c = 0				// drum duration
				i = s.time			// bar time
				while (1) {
					if (!s.next
					 || s.next.subtype == "mididrum")
						break
					s = s.next
					if (s.bar_num && !c) {
						if (!i)
							i = s.time
						else
							dl = c = (s.time - i) * nb
					}
				}
				gendr(ss, s)
			}
		}
	}
	voice_tb.push(vdr)
} // drum()
