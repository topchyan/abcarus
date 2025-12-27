// abc2svg - subs.js - text output
//
// Copyright (C) 2014-2025 Jean-Francois Moine
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

// add font styles
    var	sheet
var add_fstyle = abc2svg.el
    ? function(s) {
    var	e

	font_style += "\n" + s
	if (!abc2svg.styles) {
		e = document.createElement('style')
		document.head.appendChild(e)
		abc2svg.styles = e
	}
	sheet = abc2svg.styles.sheet
	s = s.match(/[^{]+{[^}]+}/g)	// insert each style
	while (1) {
		e = s.shift()
		if (!e)
			break
		sheet.insertRule(e, sheet.cssRules.length)
	}
    } // add_fstyle()
    : function(s) { font_style += "\n" + s }

// width of characters according to the font type
// these tables were created from the font 'Liberation'

// serif
  var
    sw_tb = new Float32Array([
	.000,.000,.000,.000,.000,.000,.000,.000,	// 00
	.000,.000,.000,.000,.000,.000,.000,.000,
	.000,.000,.000,.000,.000,.000,.000,.000,	// 10
	.000,.000,.000,.000,.000,.000,.000,.000,
	.250,.333,.408,.500,.500,.833,.778,.333,	// 20
	.333,.333,.500,.564,.250,.564,.250,.278,
	.500,.500,.500,.500,.500,.500,.500,.500,	// 30
	.500,.500,.278,.278,.564,.564,.564,.444,
	.921,.722,.667,.667,.722,.611,.556,.722,	// 40
	.722,.333,.389,.722,.611,.889,.722,.722,
	.556,.722,.667,.556,.611,.722,.722,.944,	// 50
	.722,.722,.611,.333,.278,.333,.469,.500,
	.333,.444,.500,.444,.500,.444,.333,.500,	// 60
	.500,.278,.278,.500,.278,.778,.500,.500,
	.500,.500,.333,.389,.278,.500,.500,.722,	// 70
	.500,.500,.444,.480,.200,.480,.541,.500]),
// sans-serif
    ssw_tb = new Float32Array([
	.000,.000,.000,.000,.000,.000,.000,.000,	// 00
	.000,.000,.000,.000,.000,.000,.000,.000,
	.000,.000,.000,.000,.000,.000,.000,.000,	// 10
	.000,.000,.000,.000,.000,.000,.000,.000,
	.278,.278,.355,.556,.556,.889,.667,.191,	// 20
	.333,.333,.389,.584,.278,.333,.278,.278,
	.556,.556,.556,.556,.556,.556,.556,.556,	// 30
	.556,.556,.278,.278,.584,.584,.584,.556,
       1.015,.667,.667,.722,.722,.667,.611,.778,	// 40
	.722,.278,.500,.667,.556,.833,.722,.778,
	.667,.778,.722,.667,.611,.722,.667,.944,	// 50
	.667,.667,.611,.278,.278,.278,.469,.556,
	.333,.556,.556,.500,.556,.556,.278,.556,	// 60
	.556,.222,.222,.500,.222,.833,.556,.556,
	.556,.556,.333,.500,.278,.556,.500,.722,	// 70
	.500,.500,.500,.334,.260,.334,.584,.512]),
// monospace
    mw_tb = new Float32Array([
	.0,.0,.0,.0,.0,.0,.0,.0,		// 00
	.0,.0,.0,.0,.0,.0,.0,.0,
	.0,.0,.0,.0,.0,.0,.0,.0,		// 10
	.0,.0,.0,.0,.0,.0,.0,.0,
	.52,.52,.52,.52,.52,.52,.52,.52,	// 20
	.52,.52,.52,.52,.52,.52,.52,.52,
	.52,.52,.52,.52,.52,.52,.52,.52,	// 30
	.52,.52,.52,.52,.52,.52,.52,.52,
	.52,.52,.52,.52,.52,.52,.52,.52,	// 40
	.52,.52,.52,.52,.52,.52,.52,.52,
	.52,.52,.52,.52,.52,.52,.52,.52,	// 50
	.52,.52,.52,.52,.52,.52,.52,.52,
	.52,.52,.52,.52,.52,.52,.52,.52,	// 60
	.52,.52,.52,.52,.52,.52,.52,.52,
	.52,.52,.52,.52,.52,.52,.52,.52,	// 70
	.52,.52,.52,.52,.52,.52,.52,.52])

/* -- return the character width -- */
function cwid(c, font) {
	var i = c.charCodeAt(0)		// utf-16

	if (i >= 0x80) {		// if not ASCII
		if (i >= 0x300 && i < 0x370)
			return 0;	// combining diacritical mark
		i = 0x61		// 'a'
	}
	return (font || gene.curfont).cw_tb[i]
}
// return the character width with the current font
function cwidf(c) {
	return cwid(c) * gene.curfont.swfac
}

// make XML clean
function clean_txt(p) {
	return p.replace(/<|>|&[^&\s]*?;|&/g, function(c) {
		switch (c) {
		case '<': return "&lt;"
		case '>': return "&gt;"
		case '&': return "&amp;"
		}
		return c		// &xxx;
	})
} // clean_txt()

// estimate the width and height of a string ..
var strwh

(function() {
    if (typeof document != "undefined"
     && abc2svg.el) {

    // .. by the browser

	// change the function
	strwh = function(str) {
		if (str.wh)
			return str.wh

	    var	c,
		el = abc2svg.el,	// hidden <span> created by edit/abcweb/...
		font = gene.curfont,
		h = font.size,
		w = 0,
		n = str.length,
		i0 = 0,
		i = 0

		if (!el.parentElement)		// insert back the <span> in the document
			document.body.appendChild(el)
		el.className = font_class(font)

		if (typeof str == "object") {	// if string already converted
			el.innerHTML = str
			str.wh = [ el.clientWidth, el.clientHeight ]
			return str.wh
		}
		str = clean_txt(str)

		while (1) {
			i = str.indexOf('$', i)
			if (i >= 0) {
				c = str[i + 1]
				if (c == '0') {
					font = gene.deffont
				} else if (c >= '1' && c <= '9') {
					font = get_font("u" + c)
				} else {
					i++
					continue
				}
				el.className = font_class(font)
			}

			el.innerHTML = str.slice(i0, i >= 0 ? i : undefined)
			w += el.clientWidth
//fixme: bad width if space(s) at end of string
			if (el.clientHeight > h)
				h = el.clientHeight

			if (i < 0)
				break
			i += 2;
			i0 = i
		}
		return [w, h]
	}
    } else {

    // .. by internal tables
    strwh = function(str) {
    var	font = gene.curfont,
	swfac = font.swfac,
	h = font.size,
	w = 0,
	i, j, c,
	n = str.length

	for (i = 0; i < n; i++) {
		c = str[i]
		switch (c) {
		case '$':
			c = str[i + 1]
			if (c == '0') {
				font = gene.deffont
			} else if (c >= '1' && c <= '9') {
				font = get_font("u" + c)
			} else {
				c = '$'
				break
			}
			i++;
			swfac = font.swfac
			if (font.size > h)
				h = font.size
			continue
		case '&':
			if (str[i + 1] == ' ')
				break		// normal '&'
			j = str.indexOf(';', i)
			if (j > 0 && j - i < 10) {
				i = j;
				c = 'a'		// XML character reference
			}
			break
		}
		w += cwid(c, font) * swfac
	}
	return [w, h]
    }
  }
})()

// convert a string to a SVG text, handling the font changes
// The string size is memorized into the String.
function str2svg(str) {
	// check if the string is already converted
	if (typeof str == "object")
		return str

    var	n_font, wh,
	o_font = gene.deffont,
	c_font = gene.curfont,
	o = ""

	// start a '<tspan>' element
	function tspan(nf, of) {
	    var	cl

		if (nf.class
		 && nf.name == of.name
		 && nf.size == of.size
		 && nf.weight == of.weight
		 && nf.style == of.style)
			cl = nf.class		// change only the class
		 else
			cl = font_class(nf)

		return '<tspan\n\tclass="' + cl + '">'
	} // tspan()

	if (c_font != o_font)
		o = tspan(c_font, o_font)
	o += str.replace(/<|>|&[^&\s]*?;|&|\$./g, function(c){
			switch (c) {
			case '<': return "&lt;"
			case '>': return "&gt;"
			case '&': return "&amp;"
			default:
				if (c[0] != '$')
					break
				if (c[1] == '0')
					n_font = gene.deffont
				else if (c[1] >= '1' && c[1] <= '9')
					n_font = get_font("u" + c[1])
				else
					break
				c = ''
				if (n_font == c_font)
					return c
				if (c_font != o_font)
					c = "</tspan>"
				c_font = n_font
				if (c_font == o_font)
					return c
				return c + tspan(c_font, o_font)
			}
			return c		// &xxx;
		})
	if (c_font != o_font)
		o += "</tspan>"

	// convert to String and memorize the string width and height
	o = new String(o)
	if (abc2svg.el)
		strwh(o)		// browser
	else
		o.wh = strwh(str)	// CLI

	gene.curfont = c_font	// keep the current font for the next paragraph

	return o
} // str2svg()

// set the default and current font
function set_font(xxx) {
	if (typeof xxx == "string")
		xxx = get_font(xxx)
	gene.curfont = gene.deffont = xxx
}

// output a string handling the font changes
function out_str(str) {
	output += str2svg(str)
}

// output a string, handling the font changes
// the action is:
//	'c' align center
//	'r' align right
//	'j' justify - w is the line width
//	otherwise align left
function xy_str(x, y,
		str,		// string or object String with attribute 'wh'
		action,		// default: align left
		w,		// needed for justify
		wh) {		// optional [width, height]
	if (!wh)
		wh = str.wh || strwh(str)
	if (cfmt.singleline || cfmt.trimsvg) {
	    var wx = wh[0]
		switch (action) {
		case 'c':
			wx = wh[0] / 2
			break
		case 'j':
			wx = w
			break
		case 'r':
			wx = 0
			break
		}
		if (img.wx < x + wx)
			img.wx = x + wx
	}

	output += '<text class="' + font_class(gene.deffont)
	if (action != 'j' && str.length > 5
	 && gene.deffont.wadj)
		output += '" lengthAdjust="' + gene.deffont.wadj +
			'" textLength="' + wh[0].toFixed(1);
	output += '" x="';
	out_sxsy(x, '" y="', y)
	switch (action) {
	case 'c':
		output += '" text-anchor="middle">'
		break
	case 'j':
		output += '" textLength="' + w.toFixed(1) + '">'
		break
	case 'r':
		output += '" text-anchor="end">'
		break
	default:
		output += '">'
		break
	}
	out_str(str);
	output += "</text>\n"
}

// move last capitalized word to front when after a comma
function trim_title(title, is_subtitle) {
	var i

	if (cfmt.titletrim) {
		i = title.lastIndexOf(", ")
		if (i < 0 || title[i + 2] < 'A' || title[i + 2] > 'Z') {
			i = 0
		} else if (cfmt.titletrim == 1) {	// (true) compatibility
			if (i < title.length - 7
			 || title.indexOf(' ', i + 3) >= 0)
				i = 0
		} else {
			if (i < title.length - cfmt.titletrim - 2)
				i = 0
		}
		if (i)
			title = title.slice(i + 2).trim() + ' ' + title.slice(0, i)
	}
	if (!is_subtitle
	 && cfmt.writefields.indexOf('X') >= 0)
		title = info.X + '.  ' + title
	if (cfmt.titlecaps)
		return title.toUpperCase()
	return title
}

// return the width of the music line
function get_lwidth() {
	if (img.chg)
		set_page()
	return (img.width - img.lm - img.rm
					- 2)	// for bar thickness at eol
			/ cfmt.scale
}

// header generation functions
function write_title(title, is_subtitle) {
    var	h, wh

	if (!title)
		return
	set_page();
	if (is_subtitle) {
		set_font("subtitle");
		h = cfmt.subtitlespace
	} else {
		set_font("title");
		h = cfmt.titlespace
	}
	wh = strwh(title)
	wh[1] += gene.curfont.pad * 2
	vskip(wh[1] + h + gene.curfont.pad)
	h = gene.curfont.pad + wh[1] * .22	// + descent
	if (cfmt.titleleft)
		xy_str(0, h, title, null, null, wh)
	else
		xy_str(get_lwidth() / 2, h, title, "c", null, wh)
}

/* -- output a header format '111 (222)' -- */
function put_inf2r(x, y, str1, str2, action) {
	if (!str1) {
		if (!str2)
			return
		str1 = str2;
		str2 = null
	}
	if (!str2)
		xy_str(x, y, str1, action)
	else
		xy_str(x, y, str1 + ' (' + str2 + ')', action)
}

/* -- write a text block (%%begintext / %%text / %%center) -- */
function write_text(text, action) {
	if (action == 's')
		return				// skip
	set_page();

    var	wh, font, o,
	strlw = get_lwidth(),
		sz = gene.curfont.size,
		lineskip = sz * cfmt.lineskipfac,
		parskip = sz * cfmt.parskipfac,
		i, j, x, words, w, k, ww, str;

	switch (action) {
	default:
//	case 'c':
//	case 'r':
		font = gene.curfont
		switch (action) {
		case 'c': x = strlw / 2; break
		case 'r': x = strlw - font.pad; break
		default: x = font.pad; break
		}
		j = 0
		while (1) {
			i = text.indexOf('\n', j)
			if (i == j) {			// new paragraph
				vskip(parskip);
				blk_flush()
				use_font(gene.curfont)
				while (text[i + 1] == '\n') {
					vskip(lineskip);
					i++
				}
				if (i == text.length)
					break
			} else {
				if (i < 0)
					str = text.slice(j)
				else
					str = text.slice(j, i)
				ww = strwh(str)
				vskip(ww[1] * cfmt.lineskipfac
					+ font.pad * 2)
				xy_str(x, font.pad + ww[1] * .2, str, action)
				if (i < 0)
					break
			}
			j = i + 1
		}
		vskip(parskip);
		blk_flush()
		break
	case 'f':
	case 'j':
		j = 0
		while (1) {
			i = text.indexOf('\n\n', j)
			if (i < 0)
				words = text.slice(j)
			else
				words = text.slice(j, i);
			words = words.split(/\s+/);
			w = k = wh = 0
			for (j = 0; j < words.length; j++) {
				ww = strwh(words[j] + ' ')	// &nbsp;
				w += ww[0]
				if (w >= strlw) {
					vskip(wh * cfmt.lineskipfac)
					xy_str(0, ww[1] * .2,
						words.slice(k, j).join(' '),
						action, strlw,
						[w - ww[0], ww[1]])
					k = j;
					w = ww[0]
					wh = 0
				}
				if (ww[1] > wh)
					wh = ww[1]
			}
			if (w != 0) {			// last line
				vskip(wh * cfmt.lineskipfac)
				xy_str(0, ww[1] * .2, words.slice(k).join(' '))
			}
			vskip(parskip);
			blk_flush()
			if (i < 0)
				break
			while (text[i + 2] == '\n') {
				vskip(lineskip);
				i++
			}
			if (i == text.length)
				break
			use_font(gene.curfont);
			j = i + 2
		}
		break
	}
}

/* -- output the words after tune -- */
function put_words(words) {
    var	p, i, j, nw, w, lw, x1, x2, i1, i2, do_flush,
	maxn = 0,			// max number of characters per line
	n = 1				// number of verses

	// output a line of words after tune
	function put_wline(p, x) {
	    var i = 0,
		k = 0

		if (p[0] == '$'		// if font change
		 && p[1] >= '0' && p[1] <= '9') {
			gene.curfont = p[1] == '0' ? gene.deffont
						: get_font("u" + p[1])
			p = p.slice(2)
		}

		if ((p[i] >= '0' && p[i] <= '9') || p[i + 1] == '.') {
			while (i < p.length) {
				i++
				if (p[i] == ' '
				 || p[i - 1] == ':'
				 || p[i - 1] == '.')
					break
			}
			k = i
			while (p[i] == ' ')
				i++
		}

	    var	y = gene.curfont.size * .22		// descent
		if (k != 0)
			xy_str(x, y, p.slice(0, k), 'r')
		if (i < p.length)
			xy_str(x + 5, y, p.slice(i), 'l')
	} // put_wline()

	// estimate the width of the lines
	words = words.split('\n')
	nw = words.length
	for (i = 0; i < nw; i++) {
		p = words[i]
		if (!p) {
			while (i + 1 < nw && !words[i + 1])
				i++
			n++
		} else if (p.length > maxn) {
			maxn = p.length
			i1 = i		// keep this line
		}
	}
	if (i1 == undefined)
		return			// no text in the W: lines!

	set_font("words")
	vskip(cfmt.wordsspace)
	svg_flush()

	w = get_lwidth() / 2		// half line width
	lw = strwh(words[i1])[0]
	i1 = i2 = 0
	if (lw < w) {			// if 2 columns
		j = n >> 1
		for (i = 0; i < nw; i++) {
			p = words[i]
			if (!p) {
				if (--j <= 0)
					i1 = i
				while (i + 1 < nw && !words[i + 1])
					i++
				if (j <= 0) {
					i2 = i + 1
					break
				}
			}
		}
		n >>= 1
	}
	if (i2) {
		x1 = (w - lw) / 2 + 10
		x2 = x1 + w
	} else {				// one column
		x2 = w - lw / 2 + 10
	}

	do_flush = true
	for (i = 0; i < i1 || i2 < nw; i++, i2++) {
		vskip(cfmt.lineskipfac * gene.curfont.size)
		if (i < i1) {
			p = words[i]
			if (p)
				put_wline(p, x1)
			else
				use_font(gene.curfont)
		}
		if (i2 < nw) {
			p = words[i2]
			if (p) {
				put_wline(p, x2)
			} else {


				if (--n == 0) {
					if (i < i1) {
						n++
					} else if (i2 < nw - 1) {

						// center the last verse
						x2 = w - lw / 2 + 10
						svg_flush()
					}
				}
			}
		}

		if (!words[i + 1] && !words[i2 + 1]) {
			if (do_flush) {
				svg_flush()
				do_flush = false
			}
		} else {
			do_flush = true
		}
	}
}

/* -- output history -- */
function put_history() {
	var	i, j, c, str, font, h, w, wh, head,
		names = cfmt.infoname.split("\n"),
		n = names.length

	for (i = 0; i < n; i++) {
		c = names[i][0]
		if (cfmt.writefields.indexOf(c) < 0)
			continue
		str = info[c]
		if (!str)
			continue
		if (!font) {
			font = true;
			set_font("history");
			vskip(cfmt.textspace);
			h = gene.curfont.size * cfmt.lineskipfac
		}
		head = names[i].slice(2)
		if (head[0] == '"')
			head = head.slice(1, -1);
		vskip(h);
		wh = strwh(head);
		xy_str(0, wh[1] * .22, head, null, null, wh);
		w = wh[0];
		str = str.split('\n');
		xy_str(w, wh[1] * .22, str[0])
		for (j = 1; j < str.length; j++) {
			if (!str[j]) {			// new paragraph
				vskip(gene.curfont.size * cfmt.parskipfac)
				continue
			}
			vskip(h);
			xy_str(w, wh[1] * .22, str[j])
		}
		vskip(h * cfmt.parskipfac)
		use_font(gene.curfont)
	}
}

// build a new sequence of the parts with clearer names
function part_seq() {
    var	i,
	o = ""

	for (i = 0; i < info.P.length; i++) {
		if (i)
			o += ' '
		o += partname(info.P[i])[1]
	}
	return o
} // part_seq()

// get the meaningful names of a part (P:)
function partname(c) {
    var	i, r, tmp

    if (cfmt.partname) {
	tmp = cfmt.partname.split('\n')

	for (i = 0; i < tmp.length; i++) {
		if (tmp[i][0] == c) {
			r = tmp[i].match(/.\s+(\S+)\s*(.+)?/)
			break
		}
	}
    }
	if (!r)
		return [0, c, c]
	if (!r[2])
		r[2] = r[1]
	if (r[2][0] == '"')
		r[2] = r[2].slice(1, -1)
	return r
} // partname()

/* -- output the tune heading -- */
// (possible hook)
Abc.prototype.tunhd = function() {
    var	i, j, area, composer, origin, rhythm, down1, down2, p,
		lwidth = get_lwidth()

	vskip(cfmt.topspace)

	/* titles */
	if (info.T
	 && cfmt.writefields.indexOf('T') >= 0) {
		i = 0
		while (1) {
			j = info.T.indexOf("\n", i)
			if (j < 0) {
				write_title(info.T.substring(i), i != 0)
				break
			}
			write_title(info.T.slice(i, j), i != 0);
			i = j + 1
		}
	}

	/* rhythm, composer, origin */
	down1 = down2 = 0
	if (parse.ckey.k_bagpipe
	 && !cfmt.infoline
	 && cfmt.writefields.indexOf('R') >= 0)
		rhythm = info.R
	if (rhythm) {
		set_font("composer");
		down1 = cfmt.composerspace + gene.curfont.size + 2
		xy_str(0, -down1 + gene.curfont.size *.22, rhythm)
	}
	area = info.A
	if (cfmt.writefields.indexOf('C') >= 0)
		composer = info.C
	if (cfmt.writefields.indexOf('O') >= 0)
		origin = info.O
	if (composer || origin || cfmt.infoline) {
		var xcomp, align;

		set_font("composer");
		if (cfmt.aligncomposer < 0) {
			xcomp = 0;
			align = ' '
		} else if (cfmt.aligncomposer == 0) {
			xcomp = lwidth * .5;
			align = 'c'
		} else {
			xcomp = lwidth;
			align = 'r'
		}
		if (composer || origin) {
			down2 = cfmt.composerspace + 2
			i = 0
			while (1) {
				down2 += gene.curfont.size
				if (composer)
					j = composer.indexOf("\n", i)
				else
					j = -1
				if (j < 0) {
					put_inf2r(xcomp, -down2 + gene.curfont.size *.22,
						composer ? composer.substring(i) : null,
						origin,
						align)
					break
				}
				xy_str(xcomp, -down2 + gene.curfont.size *.22,
					composer.slice(i, j), align);
				i = j + 1
			}
		}

		rhythm = rhythm ? null : info.R
		if ((rhythm || area) && cfmt.infoline) {

			/* if only one of rhythm or area then do not use ()'s
			 * otherwise output 'rhythm (area)' */
			set_font("info");
			down2 += cfmt.infospace + gene.curfont.size
			put_inf2r(lwidth, -down2 + gene.curfont.size *.22,
				rhythm, area, 'r')
		}
	}

	/* parts */
	if (info.P
	 && cfmt.writefields.indexOf('P') >= 0) {
		set_font("parts");
		i = cfmt.partsspace + gene.curfont.size + gene.curfont.pad
		if (down1 + i > down2)
			down2 = down1 + i
		else
			down2 += i
		p = info.P
		if (cfmt.partname)
			p = part_seq()
		xy_str(0, -down2 + gene.curfont.size *.22, p)
		down2 += gene.curfont.pad
	} else if (down1 > down2) {
		down2 = down1
	}
	vskip(down2 + cfmt.musicspace)
} // tunhd()

// output the tune header
function write_heading() {
	vskip(cfmt.topspace)
	self.tunhd()
} // write_heading()
