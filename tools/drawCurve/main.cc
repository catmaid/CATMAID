/**
 * drawCurve
 * a simple tool to draw some bezier curves into png tiles
 *
 * call it with three integer numbers defining tile coordinates and scale
 * followed by the curve definition through std::cin
 *  x0 : column
 *  y0 : row
 *  s  : scale as scale = 1/2^s
 *
 * E.g.
 *
 *  drawCurve 0 0 1 < profiles.dat
 *
 */
/**
 */
#include <boost/lexical_cast.hpp>
#include <vector>
#include <iostream>
#include <string>
#include <cairomm/cairomm.h>
#include "Profile.hh"

const int WIDTH = 256;
const int HEIGHT = 256;

std::vector< Profile > profiles;

int main( int argc, char* argv[] )
{
	using std::cin;
	using boost::lexical_cast;
	
	int x0 = lexical_cast< int >( argv[ 1 ] );
	int y0 = lexical_cast< int >( argv[ 2 ] );
	int s = lexical_cast< int >( argv[ 3 ] );
	int sp = static_cast< int >( pow( 2, s ) );
	float scale = 1.0 / sp;
	x0 = x0 * WIDTH * sp;
	y0 = y0 * HEIGHT * sp;
	
	while ( !cin.eof() )
	{
		float r, g, b, a, x, y;
		cin >> r >> g >> b >> a; 
		Profile p = Profile( RGBA( r, g, b, a ) );
		int n;
		cin >> n;
		for ( int i = 0; i < n; ++i )
		{
			cin >> x >> y;
			p.addKey( x, y );
			cin >> x >> y;
			p.addKey( x, y );
			cin >> x >> y;
			p.addKey( x, y );
		}
		profiles.push_back( p );		
	}
	
    Cairo::RefPtr< Cairo::ImageSurface > surface =
    	Cairo::ImageSurface::create( Cairo::FORMAT_ARGB32, WIDTH, HEIGHT );
    Cairo::RefPtr< Cairo::Context > ctx =
    	Cairo::Context::create( surface );
    
    /*
    Profile p = Profile( RGBA( 1, 0.5, 0, 0.75 ) );
    p.addKey( 120, 20 );
	p.addKey( 200, 20 );
	p.addKey( 200, 200 );
	p.addKey( 120, 200 );
	p.addKey( 20, 200 );
    p.addKey( 20, 20 );
	p.addKey( 120, 20 );
	profiles.push_back( p );
	
	p = Profile( RGBA( 0, 0.5, 1, 0.75 ) );
    p.addKey( 180, 80 );
	p.addKey( 240, 90 );
	p.addKey( 240, 160 );
	p.addKey( 180, 170 );
	p.addKey( 120, 180 );
    p.addKey( 120, 70 );
	p.addKey( 180, 80 );
	profiles.push_back( p );
	*/
	
    for ( std::vector< Profile >::iterator p = profiles.begin(); p != profiles.end(); ++p )
    	p->draw( ctx, x0, y0, WIDTH, HEIGHT, scale );
    
    surface->write_to_png( "profile.png" );
}
