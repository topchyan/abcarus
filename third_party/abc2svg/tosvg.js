// txtmus - tosvg.js - SVG generation
//
// Copyright (C) 2024-2025 Jean-Francois Moine
//
// This file is part of txtmus.
//
// txtmus is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// txtmus is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with txtmus.  If not, see <http://www.gnu.org/licenses/>.

    var	fn,
	out = [],			// output without SVG container
	yo = 0,				// offset of the next SVG
	w = 0				// max width

if (!tm)
    var	tm = abc2svg

// fix the problem about the text multi-coordinates in librsvg
function bug(p) {
    var	i, t, r, x, y, c, o,
	j = 0

	while (1) {
		i = p.indexOf("<text x=", j)
		if (i < 0)
			return p
		j = p.indexOf("</text", i)
		t = p.slice(i, j)

		r = t.match(/x="([^"]+)"\s+y="([^"]+)"[^>]*>(.+)/)
			// r[1] = x list, r[2] = y list, r[3] = characters

		if (!r || r[1].indexOf(',') < 0)
			continue
		x = r[1].split(',')
		y = r[2].split(',')
		k = 0
		o = '<text x="' + x[0] + '" y="' + y[0] + '">' + r[3][0]
		while (++k < x.length)
			o += '\n<tspan x="' + x[k]
				+ (y[k] ? '" y="' + y[k] : '')
				+ '">'
				+ r[3][k] + '</tspan>'
		p = p.replace(t, o)
	}
	// not reached
} //bug()

// entry point from cmdline
tm.abc_init =
tm.mus_init = function(args) {
	user.img_out = function(p) {
	    var	i, h

		switch (p.slice(0, 4)) {
		case "<svg":
			h = p.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/)
			if (w < +h[1])
				w = +h[1]	// max width
			p = bug(p)
			i = p.indexOf('>')
			out.push(p.slice(0, i)
				+ '\n y="' + yo + '"'
				+ p.slice(i))
			yo += +h[2]		// offset next SVG
			break
		default:
			if (p.slice(-6) == "</svg>")
				out.push("</svg>")
			break
		}
	}

	// get the main music source file name
	for (var i = 0; i < args.length; i++) {
		fn = args[i]
		if (!fn || fn[0] != '-')
			break
		i++
	}
} // mus_init()

tm.abc_end =
tm.mus_end = function() {
	tm.print('<svg xmlns="http://www.w3.org/2000/svg" version="1.1"\n\
 xmlns:xlink="http://www.w3.org/1999/xlink"\n\
 viewBox="0 0 ' + w + ' ' + yo + '">\n'
// width="' + w + 'px" height="' + yo + 'px">\n'
		+ out.join('\n')
		+ '\n</svg>')
	if (user.errtxt)
		tm.printErr(user.errtxt)
}
