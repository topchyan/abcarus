// follow-1.js - file included in snd-1.js
//
// This script permits to follow the notes while playing.
// Scrolling the music may be disabled setting 'no_scroll' in the window object.
//
// Copyright (C) 2015-2022 Jean-Francois Moine
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

// init
function follow(abc, user, playconf) {
    var	keep_types = {
		note: true,
		rest: true
	}

user.anno_stop = function(type, start, stop, x, y, w, h) {
	if (!keep_types[type])
		return

	// create a rectangle
	abc.out_svg('<rect class="abcr _' + start + '_" x="');
	abc.out_sxsy(x, '" y="', y);
	abc.out_svg('" width="' + w.toFixed(2) +
		'" height="' + abc.sh(h).toFixed(2) + '"/>\n')
}

	playconf.onnote = function(i, on) {
	    var	b, e, elts,
		x = 0,
		y = 0

		if (abc2svg.mu)			// if many tunes with same offsets
			elts = abc2svg.mu.d.getElementsByClassName('_' + i + '_')
		else
			elts = document.getElementsByClassName('_' + i + '_')
		if (!elts || !elts.length)
			return			// no symbol?
		e = elts[0]

		e.style.fillOpacity = on ? 0.4 : 0

			// scroll for the element to be in the screen
			if (on && !window.no_scroll) {	
				b = e.getBoundingClientRect()

				// normal
				if (b.top < 0
				 || b.bottom > window.innerHeight * .8)
					y = b.top - window.innerHeight * .3

				// single line
				if (b.left < 0
				 || b.right > window.innerWidth * .8)
					x = b.left - window.innerWidth * .3
				if (x || y)
					window.scrollBy({
						top: y,
						left: x,
						behavior: (x < 0 || y)
								? 'instant'
								: 'smooth'
					})
			}
	}
} // follow()

// create the style of the rectangles
if (typeof document != "undefined")	// snd-1.js can be used out of browser context
(function () {
    var	sty = document.createElement("style")
	sty.innerHTML = ".abcr {fill: #d00000; fill-opacity: 0; z-index: 15}"
	document.head.appendChild(sty)
})()
