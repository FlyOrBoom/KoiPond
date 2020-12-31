/* 
 * Koi Pond by Xing Liu (MIT License, 2020)
 * [WIP]
 *
 * Includes code by...
 * - Dave Hoskins: Hash without Sine (https://www.shadertoy.com/view/4djSRW)
 * - Inigo Quilez: 2D SDFs (https://www.iquilezles.org/www/articles/distfunctions2d/distfunctions2d.htm)
 * - Basmanov Daniil: Regular polygon SDF (https://www.shadertoy.com/view/MtScRG)
 *
 */

//-- UTILS
float smin(float a, float b, float k)
{
    float h = clamp( 0.5+0.5*(b-a)/k, 0.0, 1.0 );
    return mix( b, a, h ) - k*h*(1.0-h);
}
mat2 rot(float theta)
{
    float x = cos(theta);
    float y = sin(theta);
    return mat2(x,-y,y,x);
}

//-- HASH
float hash(float p)
{
    p = fract(p * .1031);
    p *= p + 33.33;
    p *= p + p;
    return fract(p);
}
highp float hash(highp vec2 p)
{
    vec3 p3 = fract(vec3(p.xyx) * .1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

//-- NOISE
float value(vec2 p)
{
    vec2 i = floor(p);
    vec2 f = fract(p);
	
	vec2 u = f*f*(3.-2.*f);

    return mix( mix(hash(i+vec2(0,0)),
                    hash(i+vec2(1,0)),
                    u.x),
                    
                mix(hash(i+vec2(0,1)),
                    hash(i+vec2(1,1)),
                    u.x),
                    
                u.y) - 0.5;
}
float skin(vec2 p, float style)
{
    return floor(0.5+pow(
        cos(value(p)/2.),
        50.*ceil(style*6.) // Variation in darkness
    ));

}
//-- DISTANCE FUNCTIONS
float sdCircle( vec2 p, float r )
{
    return length(p) - r;
}

float sdEllipseBound(vec2 p, vec2 r) // Bound
{
    return sdCircle(p*vec2(r.y/r.x,1),r.y);
}
float sdEllipseApprox(vec2 p, vec2 r) 
{
    float k0 = length(p/r);
    float k1 = length(p/(r*r));
    return k0*(k0-1.0)/k1;
}
float sdVesica(vec2 p, float r, float d)
{
    return length(abs(p)-vec2(-d,0))-r;
}
float sdGinko(vec2 p, float r, float m)
{
    float bias = (sign(p.x)*sin(iTime*8.))*.3+1.;
    float cut = sdCircle(vec2(abs(p.x)-r*bias,-p.y),r*bias);
    return max(sdCircle(p,r),-cut);
}
float sdCrescent(vec2 p, float r)
{
    return max(
        sdCircle(vec2(abs(p.x)-r/2.,p.y),r),
        -sdCircle(vec2(abs(p.x)-r/2.,p.y-r/1.9),r)
    );
}
float sdPolygon(vec2 p, float vertices, float radius)
{
    float segmentAngle = TAU/vertices;
    float halfSegmentAngle = segmentAngle*0.5;

    float angleRadians = atan(p.x, p.y);
    float repeat = mod(angleRadians, segmentAngle) - halfSegmentAngle;
    float inradius = radius*cos(halfSegmentAngle);
    float circle = length(p);
    float x = sin(repeat)*circle;
    float y = cos(repeat)*circle - inradius;

    float inside = min(y, 0.0);
    float corner = radius*sin(halfSegmentAngle);
    float outside = length(vec2(max(abs(x) - corner, 0.0), y))*step(0.0, y);
    return inside + outside;
}
float sdKoi(vec2 p)
{
    float d = 1.;

    float r =    0.15*MAX_KOI_SIZE; // length of koi's semi-minor axis
    float head = 0.30*MAX_KOI_SIZE;
    float body = 0.50*MAX_KOI_SIZE;
    float tail = 0.30*MAX_KOI_SIZE;
    float fins = 0.13*MAX_KOI_SIZE;

    if(p.y < 0. ) { // if pixel in head
        d = sdEllipseApprox(p,vec2(r,head));
    } else if(p.y>body){ // if pixel in tail
        d = sdGinko(p-vec2(0,body),tail,2.5);
    }else {
        float vesica_r = (body*body/r+r)/2.; //radii of the two circles that intersect to form a body-high vesica
        d = sdVesica(p,vesica_r,vesica_r-r);
    }
    d = min(d,sdCrescent(p,fins));
    d /= r;
    return d;
}
float sdRipple(vec2 uv)
{
    float h = 0.;
    for (float x = -1.; x<1.; x ++)
    {
        for (float y = -1.; y<1.; y ++)
        {
            vec2 p = vec2(x,y);
            vec2 displacement = vec2(hash(p.xy),hash(p.yx))*2.-1.;
            
            float radius = length(uv-p-displacement);

            float n = iTime-length(displacement)*5.;
            float frequency = radius*50.;
            
            float wave = sin(frequency-(TAU*n));

            h += wave;	
        }
    }
    return h;
}

//-- KOI
vec3 colKoi(vec2 p, float d, int id)
{        
    float style = hash(float(100*id+SEED));
    vec2 q = 5.*(p+style)/MAX_KOI_SIZE;
    float mask = skin(q+3.,style);
        
    vec3 col = vec3(mask);
    
    if(style>.8) {
        col *= vec3(0,.5,1);
    } else if(style>.6) {
        col += vec3(1,0,0);
    } else if(style>.4) {
        col += vec3(1,.5,0);
    } else {
        col *= vec3(1.,.5,.5); col += vec3(1,.3,0);
    }
    
    float h = clamp(-d,0.,1.); // "height" of koi
    
    col = clamp(col,0.,1.);
    
    col *= ceil(3.*h)/12.+.75;
    
    return col;
}

void mainImage( out vec4 fragColor, in vec2 fragCoord )
{
    vec2 uv = (2.0*fragCoord-iResolution.xy)/min(iResolution.x,iResolution.y); // normalize coordinates    
    vec3 col = vec3(.5,.6,.5); // background color

    bool shadow = false;
    
    float ripple = 0.;

    for(int id=0; id<MAX_POPULATION; id++) // front to back
    {
        if(id==population) break;

        vec3 koi = kois[id].xyz;
        vec2 p = koi.xy;
        p += uv;
        p = mod(p-1.,2.)-1.; // tile
        
        if(length(p)>MAX_KOI_SIZE) continue; // skip to next koi if outside bounding circle

        ripple = sdRipple(uv)/800.;

        p *= rot(koi.z);
        p += ripple;
        
        if(sdCircle(vec2(abs(p.x)-.05,p.y+.1)-vec2(0.,0.),.02)<0.) { // eyeballs
            col = vec3(0);
            break;
        }

        p.x+=sin(iTime+p.y*3.+float(id))*.1*p.y; // warp swimming

        float d = sdKoi(p); // exact bounds

        if(d<0.) // if within koi use its color
        {
            col = colKoi(p, d, id);
            break;
        }

        if(sdKoi(p-uv/8.)<0.) shadow = true;
    }

    if(shadow) col *= .9;

    fragColor = vec4(col,1);
}
