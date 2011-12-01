#include "Profile.hh"

Profile::Profile( RGBA c ) :
		color( c )
{
}

Profile::~Profile()
{
	keys.clear();
}

void Profile::addKey( Key2D k )
{
	keys.push_back( k );
	return;
}

void Profile::addKey( float x, float y )
{
	keys.push_back( Key2D( x, y ) );
	return; 
}

void Profile::draw(
	Cairo::RefPtr< Cairo::Context > ctx,
	int x0,
	int y0,
	int width,
	int height,
	float scale		
)
{
	float fx0 = static_cast< float >( x0 );
	float fy0 = static_cast< float >( y0 );
	ctx->set_source_rgba(
		color.r,
		color.g,
		color.b,
		color.a );
	ctx->set_fill_rule( Cairo::FILL_RULE_EVEN_ODD );
	ctx->set_antialias( Cairo::ANTIALIAS_DEFAULT );
			
	ctx->begin_new_path();
	
	std::vector< Key2D >::iterator k = keys.begin();
	ctx->move_to(
		scale * ( k->x - fx0 ),
		scale * ( k->y - fy0 ) );
	
	float x1, x2, x3, y1, y2, y3;
	
	++k;
	x1 = scale * ( k->x - fx0 );
	y1 = scale * ( k->y - fy0 );
	++k;
	x2 = scale * ( k->x - fx0 );
	y2 = scale * ( k->y - fy0 );
	for ( ++k; k != keys.end(); ++k )
	{
		x3 = scale * ( k->x - fx0 );
		y3 = scale * ( k->y - fy0 );
		ctx->curve_to(
			x1, y1,
			x2, y2,
			x3, y3 );
		++k;
		x1 = scale * ( k->x - fx0 );
		y1 = scale * ( k->y - fy0 );
		++k;
		x2 = scale * ( k->x - fx0 );
		y2 = scale * ( k->y - fy0 );
	}
	x3 = scale * ( keys[ 0 ].x - fx0 );
	y3 = scale * ( keys[ 0 ].y - fy0 );
	ctx->curve_to(
		x1, y1,
		x2, y2,
		x3, y3 );
	
	ctx->fill();
	return;
}
