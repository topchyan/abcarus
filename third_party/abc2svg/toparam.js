// abc2svg - toparam - dump the abc2svg parameters
//
// Copyright (C) 2019 Jean-Francois Moine
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

abc2svg.abort = function(e) {
	abc2svg.quit()
}

abc2svg.abc_init = function() {
}

abc2svg.abc_end = function() {
    var	k, v, t,
	cfmt = abc.cfmt()

	if (user.errtxt)
		abc2svg.print("Errors:\n" + user.errtxt)
	abc2svg.print('% abc2svg default parameters\n')
	for (k in cfmt) {
		if (cfmt.hasOwnProperty(k)) {
			v = cfmt[k]
			if (k.slice(-4) == "font") {
				t = v.name || ""
				if (v.weight)
					t += v.weight
				if (v.style)
					t += v.style
				if (!t)
					t = "*"
				if (k[0] == "u")
					k = "setfont-" + k[1]
				v = t + ' ' + (v.size || "*")
			} else if (k == "infoname") {
				t = v.split("\n")
				while (t.length)
					abc2svg.print('%%' + k + ' ' + t.shift())
				continue
			} else if (k.slice(-6) == "margin"
				|| k.slice(0, 4) == "page") {
				v = (v / 37.8).toFixed(2).replace(/\.?0+$/,"") + "cm"
			} else if (k == "writefields") {
				v = v + " 1"
			} else if (v === "") {
				v = '""'
			}
			abc2svg.print('%%' + k + ' ' + v)
		}
	}
}
