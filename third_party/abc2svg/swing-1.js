// abc2svg - ABC to SVG translator
// @source: https://chiselapp.com/user/moinejf/repository/abc2svg
// Copyright (C) 2014-2026 Jean-François Moine - LGPL3+
// swing.js - module to set a swing feel
"use strict"
if(typeof abc2svg=="undefined")
var abc2svg={}
abc2svg.swing={swing:function(first,voice_tb,cfmt){var v,p_v,sw,s,s2,d,m,beat,anac,cmp,C=abc2svg.C,nv=voice_tb.length
function set_dur(s){cmp=0
if(!s.a_meter[0]||s.a_meter[0].top[0]=='C'||!s.a_meter[0].bot)
beat=C.BLEN/4
else if(s.a_meter[0].bot[0]==8&&s.a_meter[0].top[0]%3==0)
beat=C.BLEN/8*3,cmp=1
else
beat=C.BLEN/s.a_meter[0].bot[0]|0
anac=s.time||0
if(!s.time){var wm=s.wmeasure
while(s&&s.time<wm){if(s.bar_type){anac=wm-s.time
break}
s=s.next}}}
function duradj(s,d){s.dur+=d
for(m=0;m<s.nhd;m++)
s.notes[m].dur+=d}
function timadj(s,s2,tim){while(s!=s2){s=s.next
s.time=tim}
return s}
for(v=0;v<nv;v++){p_v=voice_tb[v]
sw=cfmt.swing||p_v.swing
if(!sw||!p_v.sym)
continue
set_dur(p_v.meter)
for(s=p_v.sym;s.next;s=s.next){if(s.subtype=="swing")
sw=s.sw
if(!sw||!s.dur){if(s.a_meter)
set_dur(s)
continue}
if(((s.time+anac)%beat!=0&&(s.time+anac+s.dur)%beat!=192)||s.dur<192||s.dur==beat)
continue
for(s2=s.next;s2;s2=s2.next){if(s2.dur)
break}
if(!s2)
break
if(!cmp){duradj(s,3.84*(sw[0]-50))
s=timadj(s,s2,s.time+s.dur+3.84*sw[1])
duradj(s,3.84*(sw[2]-50))}else if(s2.dur==192){duradj(s,3.84*(sw[0]-50))
s=timadj(s,s2,s.time+s.dur+3.84*sw[1])
duradj(s,3.84*(sw[2]+sw[3]+sw[4]-100))}else if(s.dur==384){duradj(s,3.84*(sw[0]+sw[1]+sw[2]-100))
s=timadj(s,s2,s.time+s.dur+3.84*sw[3])
duradj(s,3.84*(sw[4]-50))}else{duradj(s,3.84*(sw[0]-50))
s=timadj(s,s2,s.time+s.dur+3.84*sw[1])
duradj(s,3.84*(sw[2]-50))
for(s2=s.next;s2;s2=s2.next){if(s2.dur)
break}
if(!s2)
break
s=timadj(s,s2,s.time+s.dur+3.84*sw[3])
duradj(s,3.84*(sw[4]-50))}
if(s.dur>beat/(cmp?1:2))
s=s.prev}}},set_fmt:function(of,cmd,parm){var parse,sw,curvoice,i,s,t=0
function bad(){abc.syntax(1,"%%playswing %note [ %silence %note ] *")}
if(cmd=="playswing"){parse=this.get_parse(),curvoice=this.get_curvoice()
sw=/(\d+)\s*(\d*)\s*(\d*)\s*(\d*)\s*(\d*)/.exec(parm)
if(sw){sw=sw.splice(1)
for(i=0;i<sw.length;i++){sw[i]=+sw[i]
t+=sw[i]}
if(!sw[0]||t>150)
return bad()
if(!sw[2])
sw[2]=100-sw[0]-sw[1]
if(!sw[4])
sw[4]=150-sw[0]-sw[1]-sw[2]-sw[3]}
if(parse.state>=2){s=this.new_block("swing",1)
s.sw=sw
if(sw)
curvoice.swing=1}else{this.cfmt().swing=sw}
return}
of(cmd,parm)},set_hooks:function(abc){abc.set_format=abc2svg.swing.set_fmt.bind(abc,abc.set_format)}}
if(!abc2svg.mhooks)
abc2svg.mhooks={}
abc2svg.mhooks.swing=abc2svg.swing.set_hooks
