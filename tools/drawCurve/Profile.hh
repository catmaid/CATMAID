#ifndef PROFILE_HH_
#define PROFILE_HH_

#include <vector>
#include <iostream>
#include <cairomm/cairomm.h>

struct Key2D
{
	Key2D(
			float x,
			float y ) :
		x( x ),
		y( y ) {};
	float x;
	float y;
};

struct RGBA
{
	RGBA(
			float r,
			float g,
			float b,
			float a	) :
		r( r ),
		g( g ),
		b( b ),
		a( a ) {};
	float r;
	float g;
	float b;
	float a;
};

class Profile
{
private:
	RGBA color;
	std::vector< Key2D > keys;

public:
	Profile(
		RGBA color
	);
	
	virtual ~Profile();

	/**
	 * add a bezier key
	 */
	void addKey(
		Key2D k
	);

	/**
	 * add a bezier key
	 */
	void addKey(
		float x,
		float y
	);
	
	/**
	 * draw the curve cropped to a specific
	 */
	void draw(
		Cairo::RefPtr< Cairo::Context > ctx,
		int x0,
		int y0,
		int width,
		int height,
		float scale	
	);
};

#endif /*PROFILE_HH_*/
