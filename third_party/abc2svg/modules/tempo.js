// abc2svg - temponame.js - change/create the beats per minute of a tempo
//
// Copyright (C) 2024 Jean-Francois Moine
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
//
// This module is loaded by %%temponame.
//
// Parameters
//	%%temponame <tempo name> <beats per minute>
// The names of the tempos are in the table abc2svg.tmp_tb (cf util/sndgen.js)

if (typeof abc2svg == "undefined")
    var	abc2svg = {}

abc2svg.temponame = {

    set_fmt: function(of, cmd, parm) {
    var	r

	if (cmd == "temponame") {
		r = /("[^"]+"|\w+)\s+(\d+)/.exec(parm)	// "
		if (r)
			abc2svg.tmp_tb[r[1]] = r[2]
//		else
//			error
		return
	}
	of(cmd, parm)
    }, // set_fmt()

    set_hooks: function(abc) {
	abc.set_format = abc2svg.temponame.set_fmt.bind(abc, abc.set_format)
    } // set_hooks()
} // temponame

if (!abc2svg.mhooks)
	abc2svg.mhooks = {}
abc2svg.mhooks.temponame = abc2svg.temponame.set_hooks
