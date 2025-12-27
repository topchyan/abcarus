//#javascript
// abcweb2-1.js file to include in (x)html pages with abc2svg-1.js
//
// Copyright (C) 2018-2020 Jean-Francois Moine
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
//
// This script is used in HTML or XHTML files.
// It replaces the ABC sequences defined
// - in <script> elements with the type "text/vnd.abc" or
// - in the HTML elements with the class "abc"
// by music as SVG images.
// The other elements stay in place.
// The script abc2svg-1.js may be loaded before this script.
// It is automatically loaded when not present.
//
// When the file is .html, if the ABC sequence is defined inside
// elements <script type="text/vnd.abc">, there is no constraint
// about the ABC characters. Outside a script vnd.abc, the characters
// '<', '>' and '&' must be replaced by their XML counterparts
// ('&lt;', '&gt;' and '&amp;').
// When the file is .xhtml, if the ABC sequence contains the characters
// '<', '>' or '&', this sequence must be enclosed in a XML comment
// (%<!-- .. %-->) or in a CDATA (%<![CDATA[ .. %]]>).
//
// Tune selection may be done by a 'hash' value in the URL of the page.

window.onerror = function(msg, url, line) {
	if (typeof msg == 'string')
		alert("window error: " + msg +
			"\nURL: " + url +
			"\nLine: " + line)
	else if (typeof msg == 'object')
		alert("window error: " + msg.type + ' ' + msg.target.src)
	else
		alert("window error: " + msg)
	return false
}

    var	user
if (typeof abc2svg == "undefined")
    var	abc2svg = {}

// function called when abc2svg is fully loaded
function dom_loaded() {
    var	abc, i,
	a_inc = {},
	errtxt = '',
	app = "abcweb2",
	elts,				// ABC HTML elements
	a,
	abcsrc = "",			// ABC source
	indx = [],			// indexes of the tunes in abcsrc
	playing,
	abcplay,
	playconf = {
		onend: function() {
			playing = false
		}
	},
	tune_lst,		// array of [tsfirst, voice_tb] per tune
	jsdir = document.currentScript ?
		    document.currentScript.src.match(/.*\//) :
		    (function() {
		     var s_a = document.getElementsByTagName('script')
			for (var k = 0; k < s_a.length; k++) {
				if (s_a[k].src.indexOf('abcweb2-') >= 0)
					return s_a[k].src.match(/.*\//) || ''
			}
			return ""	// ??
		})()

	// abc2svg init argument
	user = {
		read_file: function(fn) {
			return a_inc[fn]
		}, // read_file()
		errmsg: function(msg, l, c) {	// get the errors
			errtxt += clean_txt(msg) + '\n'
		},
		img_out: function(str) {	// image output
			new_page += str
		}
	} // user

	// replace <>& by XML character references
	function clean_txt(txt) {
		return txt.replace(/<|>|&.*?;|&/g, function(c) {
			switch (c) {
			case '<': return "&lt;"
			case '>': return "&gt;"
			case '&': return "&amp;"
			}
			return c
		})
	} // clean_txt()

	// function called on click in the screen
	abc2svg.playseq = function(evt) {
	    var	i, s, t,
		tunes = abc.tunes,	// list of the tunes created by the core
		svg = evt.target,
		e = svg			// keep the clicked element

		// search if click in a SVG image
		while (svg.tagName != 'svg') {
			svg = svg.parentNode
			if (!svg)
				return
		}
		i = svg.getAttribute('class')
		if (!i)
			return
		i = i.match(/tune(\d+)/)
		if (!i)
			return
		i = i[1]		// tune number

		// initialize the play object
		if (!abcplay) {

			// if play-1.js is not loaded, don't come here anymore
			if (typeof AbcPlay == "undefined") {
				abc2svg.playseq = function(){}
				return
			}
			abcplay = AbcPlay(playconf)
		}

		// if first time, get the tunes references
		// and generate the play data of all tunes
		if (tunes.length) {
			tune_lst = tunes.slice(0)	// (array copy)
			while (1) {
				t = tunes.shift()
				if (!t)
					break
				abcplay.add(t[0], t[1])
			}
		}

		// check if click on a music symbol
		// (this works when 'follow' is active)
		s = tune_lst[i][0]		// first symbol of the tune
		i = e.getAttribute('class')
		if (i)
			i = i.match(/abcr _(\d+)_/)
		if (playing) {
			abcplay.stop()
			if (!i)
				return
		}

		if (i) {
			i = i[1]		// symbol offset in the source
			while (s && s.istart != i)
				s = s.ts_next
			if (!s) {		// fixme: error ?!
				alert("play bug: no such symbol in the tune")
				return
			}
		}

		playing = true
		abcplay.play(s, null)
	} // playseq()

	function render() {
	    var	i, sel, elt

		// aweful hack: user.anno_stop must be defined before Abc creation
		// for being set later by follow() !
		if (typeof follow == "function")
			user.anno_stop = function(){}

		abc = new abc2svg.Abc(user)

		// initialize the play follow function
		if (typeof follow == "function")
			follow(abc, user, playconf)

		// do the selection if the hash permits some generation
		// (the hash may be used to identify an element in the HTML document)
		sel = window.location.hash.slice(1)
		if (sel
		 && abcsrc.match(new RegExp(sel)))
			abc.tosvg(app, '%%select ' + decodeURIComponent(sel))

		// generate and replace
		i = 0
		while (1) {

			// get the next ABC element
			elt = document.getElementsByClassName('abc')[0]
			if (!elt)
				break

			new_page = ""

			try {
				abc.tosvg(app, abcsrc, indx[i], indx[i + 1])
			} catch (e) {
				alert("abc2svg javascript error: " + e.message +
					"\nStack:\n" + e.stack)
			}
			abc2svg.abc_end()	// close the page if %%pageheight
			if (errtxt) {
				new_page += 
					'<pre class="nop" style="background:#ff8080">' +
						errtxt + "</pre>\n"
				errtxt = ""
			}
			try {
				elt.outerHTML = new_page
			} catch (e) {
				alert("abc2svg bad generated SVG: " + e.message +
					"\nStack:\n" + e.stack)
			}
			i++
		}

		// prepare for play on click
		window.onclick = abc2svg.playseq
	} // render()

	// convert HTML to ABC
	function toabc(s) {
		return s.replace(/&gt;/g, '>')
			.replace(/&lt;/g, '<')
			.replace(/&amp;/g, '&')
			.replace(/[ \t]+(%%|.:)/g, '$1')
	} // toabc()

	// function to load javascript files
	abc2svg.loadjs = function(fn, relay, onerror) {
	    var	s = document.createElement('script')
		if (/:\/\//.test(fn))
			s.src = fn		// absolute URL
		else
			s.src = jsdir + fn
		if (relay)
			s.onload = relay
		s.onerror = onerror || function() {
			alert('error loading ' + fn)
		}
		document.head.appendChild(s)
	}

	// load the %%abc-include files
	function include() {
	    var	i, j, fn, r,
		page = abcsrc,
		k = 0

		while (1) {
			i = page.indexOf('%%abc-include ', k)
			if (i < 0) {
				render()
				return
			}
			i += 14
			j = page.indexOf('\n', i)
			fn = page.slice(i, j).trim()
			if (!a_inc[fn])
				break
			k = j
		}

		// %%abc-include found: load the file
		r = new XMLHttpRequest()
		r.open('GET', fn, true)		// (async)
		r.onload = function() {
			if (r.status === 200) {
				a_inc[fn] = r.responseText
			} else {
				a_inc[fn] = '%\n'
				alert('Error getting ' + fn + '\n' + r.statusText)
			}
			include()
		}
		r.onerror = function () {
			a_inc[fn] = '%\n'
			alert('Error getting ' + fn + '\n' + r.statusText)
			include()
		}
		r.send()
	} // include()

	// --- dom_loaded() main code ---

	// load the abc2svg core if not done by <script>
	if (!abc2svg.Abc) {
		abc2svg.loadjs("abc2svg-1.js", dom_loaded)
		return
	}

	// accept page formatting
	abc2svg.abc_end = function() {}

	// extract the ABC source
	elts = document.getElementsByTagName('script')
	for (i = 0; i < elts.length; i++) {
		if (elts[i].type != "text/vnd.abc")
			continue
		a = elts[i].getAttribute('class')
		if (a) {
			if (a.indexOf('abc') < 0)
				elts[i].setAttribute('class', a + ' abc')
		} else {
			elts[i].setAttribute('class', 'abc')
		}
	}
	elts = document.getElementsByClassName('abc')
	for (i = 0; i < elts.length; i++) {
		indx[i] = abcsrc.length
		abcsrc += toabc(elts[i].innerHTML) + '\n'
	}
	indx[i] = abcsrc.length

	// load the required modules
	if (abc2svg.modules.load(abcsrc, include))
		include()
} // dom_loaded()

// wait for the page to be loaded
window.addEventListener("load", dom_loaded)
