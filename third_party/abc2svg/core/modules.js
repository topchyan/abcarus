// abc2svg - modules.js - module handling
//
// Copyright (C) 2018-2025 Jean-Francois Moine
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

// empty function
if (!abc2svg.loadjs) {
    abc2svg.loadjs = function(fn, onsuccess, onerror) {
	if (onerror)
		onerror(fn)
    }
}

abc2svg.modules = {
	ambitus: {},
	begingrid: { fn: 'grid3' },
	beginps: { fn: 'psvg' },
	break: {},
	capo: {},
	chordnames: {},
	clip: {},
	clairnote: { fn: 'clair' },
	voicecombine: { fn: 'combine' },
	diagram: { fn: 'diag' },
	equalbars: {},
	fit2box: {},
	gamelan: {},
	grid: {},
	grid2: {},
	jazzchord: {},
	jianpu: {},
	mdnn: {},
	MIDI: {},
	nns: {},
	pageheight: { fn: 'page' },
	pedline: {},
	percmap: { fn: 'perc' },
	playswing: { fn: 'swing' },
	roman: {},
	soloffs: {},
	sth: {},
	strtab: {},
	temperament: { fn: 'temper' },
	temponame: { fn: 'tempo' },
	tropt: {},
	titleformat: { fn: 'tunhd' },

	nreq: 0,

	// scan the file and find the required modules
	// @file: ABC file
	// @relay: (optional) callback function for continuing the treatment
	// @errmsg: (optional) function to display an error message if any
	//	This function gets one argument: the message
	// return true when all modules are loaded
	load: function(file, relay, errmsg) {

		function get_errmsg() {
			if (typeof user == 'object' && user.errmsg)
				return user.errmsg
			if (typeof abc2svg.printErr == 'function')
				return abc2svg.printErr
			if (typeof alert == 'function')
				return function(m) { alert(m) }
			if (typeof console == 'object')
				return console.log
			return function(){}
		} // get_errmsg()

		// call back functions for loadjs()
		function load_end() {
			if (--abc2svg.modules.nreq == 0)
				abc2svg.modules.cbf()
		}

		// test if some keyword in the file
	    var	m, i, fn,
		nreq_i = this.nreq,
		ls = file.match(/(%%|I:).+?\b/g)

		if (!ls)
			return true
		this.cbf = relay ||		// (only one callback function)
			function(){}
		this.errmsg = errmsg || get_errmsg()

		for (i = 0; i < ls.length; i++) {
			fn = ls[i].replace(/\n?(%%|I:)/, '')
			m = abc2svg.modules[fn]
			if (!m || m.loaded)
				continue

			m.loaded = true

			// load the module
			if (m.fn)
				fn = m.fn
			this.nreq++
			abc2svg.loadjs(fn + "-1.js",
					load_end,
					function () {
						abc2svg.modules.errmsg(
							'Error loading the module ' + fn)
						load_end()
					})
		}
		return this.nreq == nreq_i
	}
} // modules
