import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { C, FONT, SPACE } from '../../theme';

// Injected into an Instagram reel WebView (?l=1). Two jobs (IG's CSP blocks injected
// <style>, so we set styles directly):
//  1) keep the page black so any letterboxing reads black, and
//  2) TAP-TO-PLAY: autoplaying the inline video triggers a WKWebView bug where it
//     plays but its GPU layer goes black until a real touch. So we hold the video on
//     its (composited) poster — pausing any non-user play — until the first real touch,
//     then explicitly play() inside that gesture (which starts it AND composites it).
// Posts JSON lifecycle messages: {type:'playing'|'ended'|'paused'}.
export const IG_REEL_JS = `(function(){
  function imp(el,k,v){ if(el&&el.style){ el.style.setProperty(k,v,'important'); } }
  function paint(){ imp(document.documentElement,'background-color','#000'); if(document.body){ imp(document.body,'background-color','#000'); } }
  function post(o){ try{ if(window.ReactNativeWebView){ window.ReactNativeWebView.postMessage(JSON.stringify(o)); } }catch(e){} }
  var tapped=false;
  function play(){ var v=document.querySelector('video'); if(!v){ return; } try{ v.muted=false; var p=v.play(); if(p&&p.catch){ p.catch(function(){}); } }catch(e){} }
  function onTap(){ tapped=true; play(); setTimeout(play,60); setTimeout(play,250); }
  document.addEventListener('touchend', onTap, true);
  document.addEventListener('click', onTap, true);
  function wire(v){
    if(v.__vwired){ return; } v.__vwired=true;
    v.addEventListener('play', function(){ if(!tapped){ try{ v.pause(); }catch(e){} } });
    v.addEventListener('playing', function(){ post({type:'playing'}); });
    v.addEventListener('ended', function(){ post({type:'ended'}); });
    v.addEventListener('pause', function(){ post({type:'paused'}); });
    if(!tapped){ try{ v.pause(); }catch(e){} }
  }
  function scan(){ paint(); var v=document.querySelector('video'); if(v){ wire(v); } }
  scan();
  var n=0, iv=setInterval(function(){ n++; scan(); if(n>120){ clearInterval(iv); } }, 100);
})(); true;`;

// Centered "tap to play" hint. pointerEvents none so the tap passes through to the
// reel WebView (the real touch that starts + composites the inline video).
export function TapToPlayHint() {
  return (
    <View style={s.hint} pointerEvents="none">
      <View style={s.circle}><Text style={s.icon}>▶</Text></View>
      <Text style={s.text}>Tap to play</Text>
    </View>
  );
}

const s = StyleSheet.create({
  hint: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  circle: {
    width: 76, height: 76, borderRadius: 38,
    backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center',
  },
  icon: { color: C.WHITE, fontSize: 30, marginLeft: 4 },
  text: { color: C.WHITE, fontSize: FONT.SIZES.SM, fontFamily: FONT.BODY_MEDIUM, marginTop: SPACE.SM, opacity: 0.9 },
});
