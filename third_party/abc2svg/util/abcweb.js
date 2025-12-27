// abcweb-1.js file to include in html pages
//
// Copyright (C) 2014-2025 Jean-Francois Moine
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

// This script is used in HTML or XHTML files.
// It replaces the ABC sequences
// - contained in <script> elements with the type "text/vnd.abc", or
// - defined in HTML elements with the class "abc", or
// - starting with "%abc-n" or "X:n" at start of line up to a XML tag
// by music as SVG images.
// The other elements stay in place.
// The script abc2svg-1.js may be loaded before this script.
// It is automatically loaded when not present.
//
// When the file is .html, if the ABC sequence is contained inside
// elements <script type="text/vnd.abc">, there is no constraint
// about the ABC characters. Note that the <script> tag is removed.
// With a container of class "abc", the characters '<', '>' and '&' may be
// replaced by their XML counterparts ('&lt;', '&gt;' and '&amp;').
// When the file is .xhtml, if the ABC sequence contains the characters
// '<', '>' or '&', this sequence must be enclosed in a XML comment
// (%<!-- .. %-->) or in a CDATA (%<![CDATA[ .. %]]>).
//
// ABC parameters may be defined in the query string of the URL.

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

    var	abcplay				// (usable for volume or tempo changes)

if (typeof abc2svg == "undefined")
    var abc2svg = {}

	abc2svg.mu = ""			// container of the current played tune

	abc2svg.abc_end = function() {}	// accept page formatting

	// get the path to the abc2svg scripts
	abc2svg.jsdir = document.currentScript ?
		    document.currentScript.src.match(/.*\//) :
		    (function() {
		     var s_a = document.getElementsByTagName('script')
			for (var k = 0; k < s_a.length; k++) {
				if (s_a[k].src.indexOf("abcweb") >= 0)
					return s_a[k].src.match(/.*\//) || ''
			}
			return ""	// ??
	})()

	// function to load javascript files
	abc2svg.loadjs = function(fn, relay, onerror) {
	    var	s = document.createElement('script')
		if (/:\/\//.test(fn))
			s.src = fn		// absolute URL
		else
			s.src = abc2svg.jsdir + fn
		s.onload = relay
		s.onerror = function() {
			if (onerror)
				onerror(fn)
			else
				alert('error loading ' + fn)
		}
		document.head.appendChild(s)
	} // loadjs()

// function called when abcweb-1.js is fully loaded
function dom_loaded() {
    var	abc, src, outb, err, e,
	a_inc = {},
	tune_lst = [],	// array of [tsfirst, voice_tb, info, cfmt] per tune
			// created on playback start
	html,			// set if some pure HTML in the file
	busy,
	playing,
	playconf = {
		onend: function() {
			playing = 0 //false
		}
	}

	// check which <div> became visible
	// if yes, generate it
	function visible() {
	    var	i, r,
		wh = window.innerHeight || document.documentElement.clientHeight

		while (1) {
			i = abc2svg.alldiv[0]
			if (i == undefined)
				break
			r = abc2svg.music[i].d.getBoundingClientRect()
			if (r.top > wh)
				break
			musgen(i)
			abc2svg.alldiv.shift()
		}
		if (abc2svg.alldiv.length) {
			if (!abc2svg.onscroll) {
				abc2svg.onscroll = visible
				window.addEventListener("scroll", visible)
			}
		} else {
			window.removeEventListener("scroll", visible)
		}
	} // visible()
	
	// get the custom properties of a HTML element
	// from 'class="<class>"' and from 'style="--<key>:<value>"'
	function get_p(e) {
	    var	i, j, k, r,
		o = '',
		sh = document.styleSheets,
		s = e.style,
		c = e.getAttribute("class")

		// from class=".."
		if (c) {
			c = '.' + c				// selector
			for (i = 0; i < sh.length; i++) {
			    try {			// (the css may be protected)
				r = sh[i].cssRules
				for (j = 0; j < r.length; j++) {
					if (r[j].selectorText == c)
						break
				}
				if (j < r.length)
					break
			    } catch(e) {
			    }
			}
			if (i < sh.length) {
				r = r[j]			// rule
				for (i = 0; i < r.style.length; i++) {
					k = r.style[i]
					if (k[0] == '-' && k[1] == '-')
						o += '%%' + k.slice(2) + ' '
							+ r.style.getPropertyValue(k)
							+ '\n'
				}
			}
		}

		// from style=".."
		for (i = 0; i < s.length; i++) {
			k = s[i]
			if (k[0] == '-' && k[1] == '-')
				o += '%%' + k.slice(2) + ' '
					+ s.getPropertyValue(k)
					+ '\n'
		}
		return o
	} // get_p()

	// move the musique sequences to <script> text/vnd.abc
	//	<anytag .. class="abc" .. > ..ABC.. </anytag>
	//	%abc-n ..ABC.. '<' with skip %%beginxxx .. %%endxxx
	//	X:n ..ABC.. '<' with skip %%beginxxx .. %%endxxx
	function move_music(src) {
	    var	re, res, i, j, k, t,
		re_stop = /\n<|\n%.begin[^\s]+/g,
		ss = 0,
		out = ""

		if (/<[^>]* class="[^"]*abc[^"]*/.test(src))	// "
			re = '<[^>]* class="[^"]*abc[^"]*'
		else
			re = '%abc-\\d|X:\\s*\\d'
		re = new RegExp('(^|\n)(' + re + ')', 'g')

		while (1) {
			res = re.exec(src)
			if (!res)
				break
			i = re.lastIndex - res[0].length // end of HTML
			if (i > ss) {
				out += src.slice(ss, i)	// copy HTML
				html = 1
			}
			t = res[2]
			if (t[0] == '<') {
				i = src.indexOf('>', i) + 1 // start of ABC
				j = res[2].indexOf(' ')	// get the tag
				t = res[2].slice(1, j)
				j = src.indexOf('</' + t + '>', i)
				ss = j + t.length + 4
			} else {		// %abc or X:

				// get the end of the ABC sequence
				// including the %%beginxxx/%%endxxx sequences
				//	(that may contain XML)
				re_stop.lastIndex = i
				while (1) {
					res = re_stop.exec(src)
					if (!res || res[0] == "\n<")
						break
					k = src.indexOf(res[0].replace("begin", "end"),
							re_stop.lastIndex)
					if (k < 0)
						break
					re_stop.lastIndex = k
				}
				if (!res || k < 0)
					j = src.length
				else
					j = re_stop.lastIndex - 1
				ss = j
			}
			out += '<script type="text/vnd.abc">\n'
				+ src.slice(i, j)
				+ '</script>\n'
			re.lastIndex = ss		// new HTML start
		}
		out += src.slice(ss)		// copy the last HTML sequence
		if (abc2svg.page && html)
			out += '\
<pre class="nop" style="background:#ff8080">\
Printing may be bad because the file contains pure HTML and %%pageheight\
</pre>\n'
		document.body.innerHTML = out
	} // move_music()

	// save the music sequences and replace them by empty <div>'s
	function save_music() {
	    var i, k, div, c, s, sa

		// get the global parameters
		abc2svg.music = [{
			t: "",			// global parameters
			n: "mus0"
		}]

		// get the parameters from the query string of the URL
		k = location.search
		if (k) {
			k = k.substr(1).split("&")
			for (i = 0; i < k.length; i++)
				abc2svg.music[0].t += "%%"
					+ decodeURIComponent(k[i].replace('=', ' '))
					+ '\n'
		}

		// search the <script>'s of the HTML page
		// and replace the music <script>'s by empty <div>'s
		while (1) {
			sa = document.getElementsByTagName('script')
			for (i = 0; i < sa.length; i++) {
				s = sa[i]
				if (s.type == 'text/vnd.abc')
					break
			}
			if (i >= sa.length)
				break

			c = get_p(s)			// get custom properties
			div = document.createElement('div')
			if (!abc2svg.music[0].t
			 && s.text.indexOf('\nX:') < 0) {
				abc2svg.music[0].t += c + s.innerHTML // global
				if (!abc2svg.music[0].d)
					abc2svg.music[0].d = div
			} else {
				abc2svg.music.push({
					n: "mus" + abc2svg.music.length,
					t: c + s.innerHTML,
					d: div
				})
				div.addEventListener('click', abc2svg.playseq)
			}
			s.parentNode.replaceChild(div, s)
		}
	} // save_music()

	// generate a music sequence
	// @mu = object { t: music source, d: <div> }
	function musgen(ix) {
	    var	mu = abc2svg.music[ix],
		t = mu.t

		if (busy) {
			mu.w = 1 //true
			return
		}
		busy = 1 //true

		// render a music sequence
		function render() {
		    var	i, j, e, o,
			f = abc.cfmt().with_source

			// start the generation
			outb = err = ""
			abc.tosvg(mu.n, t)	// music source

			// mu.d can be null when parameters in query string
			// and no ABC script with global parameters
		    if (mu.d) {
			abc2svg.abc_end(ix)	// end of page (for %%pageheight, abcweb)
			if (err)
				outb += '<pre class="nop" style="background:#ff8080">'
					+ err + "</pre>\n"

			if (f && outb) {
				o = f.indexOf('edit') > 0
					? " contentEditable>" : ">"
				outb = '<pre class="source"'
					+ o
					+ clean_txt(t)
					+ '</pre>\n\
<div class="source">\n'
					+ outb
					+ '</div>\n'
			}
			
			mu.d.innerHTML = outb	// update the browser
		    } // if (mu.d)

			// if some generation waiting, start it
			mu.w = busy = 0 //false
			for (i = 1; i < abc2svg.music.length; i++) {
				if (abc2svg.music[i].w) {
					musgen(i)
					break
				}
			}
		} // render()

		// load the possible %%abc-include files
		function include() {
		    var	i, j, fn, r,
			k = 0

			while (1) {
				i = t.indexOf('%%abc-include ', k)
				if (i < 0) {
					render()
					return
				}
				i += 14
				j = t.indexOf('\n', i)
				fn = t.slice(i, j).trim()
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
					if (abc2svg.modules.load(a_inc[fn], include))
						include()
				} else {
					a_inc[fn] = '%\n'
					alert('Error getting ' + fn + '\n' + r.statusText)
					include()
				}
			}
			r.onerror = function () {
				a_inc[fn] = '%\n'
				alert('Error getting ' + fn + '\n' + r.statusText)
				include()
			}
			r.send()
		} // include()

		// musgen entry
		abc = abc2svg.abc	// reload the Abc instance after edition

		// load the required modules and the include files before rendering
		if (abc2svg.modules.load(t, include))
			include()
	} // musgen()

abc2svg.musgen = musgen			// used in set_music() below

// -- abc2svg init argument
abc2svg.user = {
	read_file: function(fn) {
		return a_inc[fn]
	}, // read_file()
	errmsg: function(msg, l, c) {	// get the errors
		err += clean_txt(msg) + '\n'
	},
	img_out: function(p) {		// image output
		outb += p
	}
    }

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
}

	// function called on click on the music
	abc2svg.playseq = function(evt) {
		if (playing) {		// stop playing
			abcplay.stop()
			return
		}
	    var	i, j, s,
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
			if (typeof AbcPlay == "undefined") { // as snd-1.js not loaded,
				abc2svg.playseq = function(){}	// don't come here anymore
				return
			}
			if (abc.cfmt().soundfont)
				playconf.sfu = abc.cfmt().soundfont
			abcplay = AbcPlay(playconf);
		}

		// if not done yet,
		// generate the play data of the tune
		if (!tune_lst[i]) {
			tune_lst[i] = abc.tunes[i]
			abcplay.add(tune_lst[i][0],
					tune_lst[i][1],
					tune_lst[i][3])
		}

		// check if click on a music symbol
		// (this works when 'follow' is active)
		s = tune_lst[i][0]		// first symbol of the tune
		i = e.getAttribute('class')
		if (i)
			i = i.match(/abcr _(\d+)_/)
		if (i) {
			i = i[1]		// symbol offset in the source
			while (s && s.istart != i)
				s = s.ts_next
			if (!s) {		// fixme: error ?!
				alert("play bug: no such symbol in the tune")
				return
			}
		}

		// keep the container of the tune being played
		while (s && !s.fname)		// (no .fname in the 1st %%staves)
			s = s.ts_next
		for (i = 1; i < abc2svg.music.length; i++) {
			if (abc2svg.music[i].n == s.fname)
				break
		}
		abc2svg.mu = abc2svg.music[i]	// current container

		playing = 1 //true
		abcplay.play(s, null)
	} // playseq()

	// --- dom_loaded() main code ---

	// load the abc2svg core if not done by <script>
	src = document.body.innerHTML
	if (!abc2svg.Abc) {
		abc2svg.loadjs("abc2svg-1.js", dom_loaded)
		return
	}

	// create a hidden span for string width computation
	e = document.createElement("span")
	e.style.position = "absolute"
	e.style.top =
		e.style.padding = 0
	e.style.visibility = "hidden"
	e.style.lineHeight = 1
	document.body.appendChild(e)
	abc2svg.el = e

	if (src.indexOf('type="text/vnd.abc"') < 0)
		move_music(src)

	save_music()	// save the music sequences and replace them by <div>

	// initialize the generation
	abc2svg.abc =				// for external access
	abc = new abc2svg.Abc(abc2svg.user)
	if (typeof follow == "function")	// if snd-1.js loaded
		follow(abc, abc2svg.user, playconf)	// initialize the play follow
	if (abc2svg.music[0].t)
		musgen(0)			// global definitions

	// create a list of all <div>'s
	abc2svg.alldiv = []
	for (var i = 1; i < abc2svg.music.length; i++)
		abc2svg.alldiv.push(i)
	visible()
} // dom_loaded()

// ---- interface for changing the music source and redisplaying it ----
// get the music source of a <div> element
abc2svg.get_music = function(d) {
    var	i, mu

	for (var i = 1; i < abc2svg.music.length; i++) {
		mu = abc2svg.music[i]
		if (mu.d == d)
			return mu.t
	}
//	return ""
} // get_music()

// set the music source of a <div> element and redisplay it
abc2svg.set_music = function(d, t) {
    var	i, mu, tunes

	// remove the tune data that will not be used anymore
	function tune_purge(mu) {
	    var	svg, cl, i,
		e = mu.d.getElementsByTagName('svg')

		for (i = 0; i < e.length; i++) { // look at the SVGs of the sequence
			cl = e[i].getAttribute("class")		// SVG class
			if (cl)
				cl = cl.match(/tune(\d+)/)	// tune number
			if (!cl)
				continue
			tunes[cl[1]] = null
		}
	} // tune_purge()

	for (i = 1; i < abc2svg.music.length; i++) {
		mu = abc2svg.music[i]
		if (mu.d == d) {
			mu.t = t
			tunes = abc2svg.abc.tunes
			tune_purge(mu)
			abc2svg.abc = new abc2svg.Abc(abc2svg.user) // use a new Abc instance

			// copy the old tunes to the new instance
			abc2svg.abc.tunes.push.apply(abc2svg.abc.tunes, tunes)
			if (abc2svg.music[0].t)
				abc2svg.musgen(0)	// global definitions
			abc2svg.musgen(i)
			break
		}
	}
} // set_music()

// check if the document is loaded
if (document.readyState == "loading")
	addEventListener("DOMContentLoaded", dom_loaded, {once:true})
else
	dom_loaded()			// yes, let's go
