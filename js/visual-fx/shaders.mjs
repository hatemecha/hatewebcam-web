export const vertex = `attribute vec2 position; varying vec2 uv;
void main(){uv=position*.5+.5; gl_Position=vec4(position,0.,1.);}`;
// Source -> spatial -> pixel -> channel/color -> temporal -> overlays.
// The previous texture is the processed output, never just a duplicate source frame.
export const fragment = `precision highp float;
varying vec2 uv;
uniform sampler2D source, history;
uniform vec2 resolution;
uniform float time, seed, amount, movement, persistence, scale, delta, hasHistory;
uniform float tiles, feedback, recursion, flow, sorting, pixel, posterize, dither, threshold, edges, rgb, fragments, scan, monochrome;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7))+seed)*43758.5453);}
float lum(vec3 c){return dot(c,vec3(.299,.587,.114));}
vec3 sampleSource(vec2 p){return texture2D(source,clamp(p,vec2(0.),vec2(1.))).rgb;}
void main(){
 vec2 p=uv; float t=time*(.15+movement*1.8)+mod(seed,997.)*.013;
 float band=floor(p.y*(16.+32./scale));
 float jump=hash(vec2(band,floor(t*7.)))-.5;
 p.x+=fragments*jump*.24;
 vec2 tile=floor(p*vec2(10.,7.)/scale);
 float active=step(.45,hash(tile+floor(t*2.)));
 p+=tiles*active*.15*vec2(hash(tile+seed)-.5,hash(tile+seed+7.)-.5);
 p+=flow*.035*vec2(sin(p.y*19.+t*1.7)+sin(p.y*43.-t),cos(p.x*17.-t*.9));
 float cell=1.+pixel*28.*scale;
 vec2 grid=vec2(640.,640.*resolution.y/resolution.x)/cell;
 p=mix(p,(floor(p*grid)+.5)/grid,step(.001,pixel));
 vec3 c=sampleSource(p);
 // Bounded luminance-directed drag: an intentional sorting approximation, 8 samples.
 for(int i=1;i<=8;i++){vec3 s=sampleSource(p+vec2(float(i)*sorting*.007,0.));c=mix(c,s,sorting*step(lum(c),lum(s))*.35);}
 float split=rgb*(.003+.012*(.5+.5*sin(t*2.)));
 c.r= mix(c.r,sampleSource(p+vec2(split,0.)).r,rgb);
 c.b= mix(c.b,sampleSource(p-vec2(split,0.)).b,rgb);
 vec2 px=vec2(1./640.,resolution.x/(640.*resolution.y));
 float edge=abs(lum(sampleSource(p+px))-lum(sampleSource(p-px)))*4.;
 c=mix(c,vec3(edge),edges);
 c=mix(c,vec3(lum(c)),monochrome);
 float pattern=mod(floor(uv.x*grid.x),2.)+2.*mod(floor(uv.y*grid.y),2.);
 c+=(pattern/4.-.375)*dither*.5;
 c=mix(c,step(vec3(.48),c),threshold);
 float levels=max(2.,16.-posterize*14.);
 c=mix(c,floor(clamp(c,0.,1.)*levels+.5)/levels,step(.001,posterize));
 vec2 h=uv-.5; float angle=recursion*.018*delta*(.2+movement*1.6)*(.5+hash(vec2(seed,1.)));
 h=mat2(cos(angle),-sin(angle),sin(angle),cos(angle))*h;
 h/=(1.+recursion*.055*delta);
 h+=flow*.002*delta*vec2(sin(t),cos(t*.7));
 vec3 old=texture2D(history,clamp(h+.5,0.,1.)).rgb;
 float memory=min(.985,feedback*(.92+persistence*.075));
 c=mix(c,old,pow(memory,max(.01,delta))*hasHistory);
 c*=1.-scan*.3*(.5+.5*sin(uv.y*resolution.y*3.14159-t*3.));
 gl_FragColor=vec4(mix(sampleSource(uv),clamp(c,0.,1.),amount),1.);
}`;
