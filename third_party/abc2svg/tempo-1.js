// abc2svg - ABC to SVG translator
// @source: https://chiselapp.com/user/moinejf/repository/abc2svg
// Copyright (C) 2014-2025 Jean-François Moine - LGPL3+
// abc2svg - temponame.js - change/create the beats per minute of a tempo
//abc2svg-temponame.js-change/create the beats per minute of a tempo
if(typeof abc2svg=="undefined")
var abc2svg={}
abc2svg.temponame={set_fmt:function(of,cmd,parm){var r
if(cmd=="temponame"){r=/("[^"]+"|\w+)\s+(\d+)/.exec(parm)
if(r)
abc2svg.tmp_tb[r[1]]=r[2]
return}
of(cmd,parm)},set_hooks:function(abc){abc.set_format=abc2svg.temponame.set_fmt.bind(abc,abc.set_format)}}
if(!abc2svg.mhooks)
abc2svg.mhooks={}
abc2svg.mhooks.temponame=abc2svg.temponame.set_hooks
