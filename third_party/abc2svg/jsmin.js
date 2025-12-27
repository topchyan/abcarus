// jsmin.js - script to minify JS files
// using QuickJS (https://bellard.org/quickjs/)
//
// Copyright (C) 2020 Jean-François Moine
//
// adapted from
/* jsmin.c
   2013-03-29

Copyright (c) 2002 Douglas Crockford  (www.crockford.com)

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
of the Software, and to permit persons to whom the Software is furnished to do
so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

The Software shall be used for Good, not Evil.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

    var	EOF = undefined,
	theA, theB,
	theLookahead = EOF,
	theX = EOF,
	theY = EOF

function error(s) {
	std.err.printf("JSMIN Error: " + s)
	std.exit(1)
}

/* isAlphanum -- return true if the character is a letter, digit, underscore,
		dollar sign, or non-ASCII character.
*/

function isAlphanum(c) {
	return ((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') ||
		(c >= 'A' && c <= 'Z') || c == '_' || c == '$' || c == '\\' ||
		c > 126)
}


/* get -- return the next character from stdin. Watch out for lookahead. If
		the character is a control character, translate it to a space or
		linefeed.
*/

    var	fb = std.in.readAsString(), // file buffer
	fp = -1			// pointer to the file buffer
function get() {
    var	c = theLookahead

	theLookahead = EOF
	if (c == EOF) {
		c = fb[++fp]
		if (!c)
			return EOF
	}
	if (c >= ' ' || c == '\n')
		return c
	if (c == '\r')
		return '\n'
	return ' '
}


/* peek -- get the next character without getting it.
*/

function peek() {
	theLookahead = get()
	return theLookahead
}


/* next -- get the next character, excluding comments. peek() is used to see
		if a '/' is followed by a '/' or '*'.
*/

function next() {
   var	c = get()
	if  (c == '/') {
		switch (peek()) {
		case '/':
			while (1) {
				c = get()
				if (c <= '\n')
					break
			}
			break
		case '*':
			get()
			while (c != ' ') {
				switch (get()) {
				case '*':
					if (peek() == '/') {
						get()
						c = ' '
					}
					break
				case EOF:
					error("Unterminated comment.")
					break
				}
			}
			break
		}
	}
	theY = theX
	theX = c
	return c
}

    var line = ""
function put(c) {
	if (c == '\n') {
		print(line)
		line = ""
	} else {
		line += c
	}
}

/* action -- do something! What you do is determined by the argument:
		1   Output A. Copy B to A. Get the next B.
		2   Copy B to A. Get the next B. (Delete A).
		3   Get the next B. (Delete B).
   action treats a string as a single character. Wow!
   action recognizes a regular expression if it is preceded by ( or , or =.
*/

function action(d) {
	switch (d) {
	case 1:
		put(theA)
		if (
			(theY == '\n' || theY == ' ') &&
			(theA == '+' || theA == '-' || theA == '*' || theA == '/') &&
			(theB == '+' || theB == '-' || theB == '*' || theB == '/')
		) {
			put(theY)
		}
	case 2:
		theA = theB
		if (theA == '\'' || theA == '"' || theA == '`') {
			while (1) {
				put(theA)
				theA = get()
				if (theA == theB)
					break
				if (theA == '\\') {
					put(theA)
					theA = get()
				}
				if (theA == EOF)
					error("Unterminated string literal.")
			}
		}
	case 3:
		theB = next()
		if (theB == '/' && (
			theA == '(' || theA == ',' || theA == '=' || theA == ':' ||
			theA == '[' || theA == '!' || theA == '&' || theA == '|' ||
			theA == '?' || theA == '+' || theA == '-' || theA == '~' ||
			theA == '*' || theA == '/' || theA == '{' || theA == '\n'
		)) {
			put(theA)
			if (theA == '/' || theA == '*')
				put(' ')
			put(theB)
			while (1) {
				theA = get()
				if (theA == '[') {
					while (1) {
						put(theA)
						theA = get()
						if (theA == ']')
							break
						if (theA == '\\') {
							put(theA)
							theA = get()
						}
						if (theA == EOF)
							error("Unterminated set in Regular Expression literal.")
					}
//jfm
				} else if (theA == '\n') {
					break			// not a regex
				} else if (theA == '/') {
					switch (peek()) {
					case '/':
					case '*':
						error("Unterminated set in Regular Expression literal.")
					}
					break
				} else if (theA =='\\') {
					put(theA)
					theA = get()
				}
				if (theA == EOF)
					error("Unterminated Regular Expression literal.")
				put(theA)
			}
			theB = next()
		}
	}
}


/* jsmin -- Copy the input to the output, deleting the characters which are
		insignificant to JavaScript. Comments will be removed. Tabs will be
		replaced with spaces. Carriage returns will be replaced with linefeeds.
		Most spaces and linefeeds will be removed.
*/

function jsmin() {
//	if (peek() == 0xEF) {
//		get()
//		get()
//		get()
//	}
//jfm - keep the first comment
//	theA = '\n'
//	action(3)
	theA = get()
	theB = get()
	while (theA != EOF) {
		switch (theA) {
		case ' ':
			action(isAlphanum(theB) ? 1 : 2)
			break
		case '\n':
			switch (theB) {
			case '{':
			case '[':
			case '(':
			case '+':
			case '-':
			case '!':
			case '~':
				action(1)
				break
			case ' ':
				action(3)
				break
			default:
				action(isAlphanum(theB) ? 1 : 2)
				break
			}
			break
		default:
			switch (theB) {
			case ' ':
				action(isAlphanum(theA) ? 1 : 3)
				break
//jfm
			case '}':
				action(theA == ';' ? 2 : 1)
				break
			case '\n':
				switch (theA) {
				case '}':
				case ']':
				case ')':
				case '+':
				case '-':
				case '"':
				case '\'':
				case '`':
					action(1)
					break
				default:
					action(isAlphanum(theA) ? 1 : 3)
					break
				}
				break
			default:
				action(1)
				break
			}
		}
	}
}


/* main -- Output any command line arguments as comments
		and then minify the input.
*/
function comments() {
    var	arg,
	args = scriptArgs

	args.shift()		// skip the path of the script
	while (1) {
		arg = args.shift()
		if (!arg)
			break
		print("// " + arg)
	}
}

	comments()
	jsmin()
	if (line)
		print(line)
