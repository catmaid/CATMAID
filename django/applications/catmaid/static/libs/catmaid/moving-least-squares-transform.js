/* -*- mode: espresso; espresso-indent-level: 2; indent-tabs-mode: nil -*- */
/* vim: set softtabstop=2 shiftwidth=2 tabstop=2 expandtab: */
/* global
  CATMAID
*/

(function(CATMAID) {
  "use strict";

  /* Code from Stephan Saalfeld's mpicbg library at github.com:axtimwalde/mpicbg.git
   *
   * An effort has been made to keep the code as similar as possible to the original java,
   * even if this meant using non-idiomatic javascript.
   * The reason for this is to facilitate checking for correctness.
   */

  var System = {
    arraycopy: function( source, start_source, target, start_target, length ) {
      for ( let k=0; k < length; ++k ) {
        target[ start_target + k ] = source[ start_source + k ];
      }
    }
  };

  var assert = console.assert;

  var Matrix3x3 = {
    det: function(
      m00, m01, m02,
      m10, m11, m12,
      m20, m21, m22 )
    {
      // 'return' can't be alone in a line: returns undefined!
      return m00 * m11 * m22 + 
             m10 * m21 * m02 +
             m20 * m01 * m12 -
             m02 * m11 * m20 -
             m12 * m21 * m00 -
             m22 * m01 * m10;
    }
  };

  var NoninvertibleModelException = function( message ) {
    this.message = message;
    this.name = "NoninvertibleModelException";
  };

  var NotEnoughDataPointsException = function( message ) {
    this.message = message;
    this.name = "NotEnoughDataPointsException";
  };

  var IllDefinedDataPointsException = function( message ) {
    this.message = message;
    this.name = "IllDefinedDataPointsException";
  };




  /** @l: local coordinates
   *  @w: world coordinates, or undefined (will clone local coordinates) */
  var Point = function(l, w) {
    if ( w )
    {
      assert( l.length == w.length, "Local and world coordinates have to have the same dimensionality." );
    }

    // An array of doubles with local coordinates
    this.l = l;

    // An array of doubles with world coordinates
    this.w = w ? w : l.slice(0); // a clone if not given
  };

  Point.prototype = {};

  Point.prototype.getL = function() { return this.l; };

  Point.prototype.getW = function() { return this.w; };

  /**
   * Apply a {@link CoordinateTransform} to the {@link Point}.
   *
   * Transfers the {@link #l local coordinates} to new
   * {@link #w world coordinates}.
   *
   * @param t: a coordinate transform like a MovingLeastSquaresTransform
   */
  Point.prototype.apply = function( t ) {
    var l = this.l;
    var w = this.w;

    System.arraycopy( l, 0, w, 0, l.length );
    t.applyInPlace( w );
  };

  /**
   * Apply a {@link CoordinateTransform} to the {@link Point} by a given amount.
   *
   * Transfers the {@link #l local coordinates} to new
   * {@link #w world coordinates}.
   *
   * @param t: a coordinate transform like a MovingLeastSquaresTransform
   * @param amount 0.0 -> no application, 1.0 -> full application
   */
  Point.prototype.apply2 = function( t, amount ) {
    var l = this.l;
    var w = this.w;

    var a = t.apply( l );
    for ( let i = 0; i < a.length; ++i )
      w[ i ] += amount * ( a[ i ] - w[ i ]);
  };

  /**
   * Apply the inverse of a {@link InvertibleModel} to the {@link Point}.
   *
   * Transfers the {@link #l local coordinates} to new
   * {@link #w world coordinates}.
   *
   * @param t: An InverseCoordinateTransform
   */
  Point.prototype.applyInverse = function( t ) {
    var l = this.l;
    var w = this.w;

    System.arraycopy( l, 0, w, 0, l.length );
    t.applyInverseInPlace ( w );
  };

  /**
   * Estimate the square distance of local and world coordinates.
   *
   * @return square distance
   */
  Point.prototype.squareDistance = function() {
    var l = this.l;
    var w = this.w;

    var sum = 0.0;
    for ( let i = 0; i < l.length; ++i )
    {
      let d = w[ i ] - l[ i ];
      sum += d * d;
    }
    return sum;
  };

  /**
   * Estimate the Euclidean distance of local and world coordinates.
   *
   * @return square distance
   */
  Point.prototype.distance = function()
  {
    return Math.sqrt( this.squareDistance() );
  };

  /**
   * Estimate the square Euclidean distance of two {@link Point Points} in
   * world space.
   *
   * @param p1
   * @param p2
   * @return square distance
   */
  Point.prototype.squareDistance2 = function( p1, p2 )
  {
    assert( p1.w.length == p2.w.length, "Both points have to have the same number of dimensions." );

    var sum = 0.0;
    for ( let i = 0; i < p1.w.length; ++i )
    {
      let d = p1.w[ i ] - p2.w[ i ];
      sum += d * d;
    }
    return sum;
  };

  /**
   * Estimate the square Euclidean distance of two {@link Point Points} in
   * local space.
   *
   * @param p1
   * @param p2
   * @return square distance
   */
  Point.prototype.squareLocalDistance = function( p1, p2 )
  {
    assert( p1.l.length == p2.l.length, "Both points have to have the same number of dimensions." );

    var sum = 0.0;
    for ( let i = 0; i < p1.l.length; ++i )
    {
      let d = p1.l[ i ] - p2.l[ i ];
      sum += d * d;
    }
    return sum;
  };

  /**
   * Clone this {@link Point} instance.
   */
  Point.prototype.clone = function()
  {
    var l = this.l;
    var w = this.w;

    var p = new Point( l.splice( 0 ) );
    for ( let i = 0; i < w.length; ++i )
      p.w[ i ] = w[ i ];
    return p;
  };

  /**
   * Apply a {@link CoordinateTransform} to an {@link Iterable} collection of
   * {@link Point Points}.
   *
   * For each {@link Point}, transfers the {@link #l local coordinates} to
   * new {@link #w world coordinates}.
   *
   * @param t: CoordinateTransform
   * @param points: iterable collection of Point instances
   */
  Point.prototype.apply3 = function( t, points )
  {
    for ( var i=0; i < points.length; ++i )
      points[ i ].apply( t );
  };

  /**
   * Apply an {@link InverseCoordinateTransform} to an {@link Iterable} collection of
   * {@link Point Points}.
   *
   * For each {@link Point}, transfers the {@link #l local coordinates} to
   * new {@link #w world coordinates}.
   *
   * @param t: InverseCoordinateTransform
   * @param points: iterable collection of Point instances
   */
  Point.prototype.applyInverse2 = function( t, points )
  {
    for ( var i=0; i<points.length; ++i )
      points[ i ].applyInverse( t );
  };



  /**
   * Packs multiple constructors into one.
   *
   * @param p1: a Point
   * @param p2: a Point
   * @param weight: (optional) a single scalar, or an array
   * @param strength: (optional) a single scalar
   *
   */
  var PointMatch = function( p1, p2, weight, strength ) {
    this.p1 = p1;
    this.p2 = p2;

    if (undefined === weight) {
      this.weight = 1.0;
      this.weights = [ 1.0 ];
    } else {
      // Either an array, and it is cloned, or a scalar, and thus an array with a single element
      if (Array.isArray( weight )) {
        this.weights = weight.slice( 0 );
        this.calculateWeight();
      } else {
        this.weight = weight;
        this.weights = [ weight ];
      }
    }

    this.strength = strength ? strength : 1.0;
  };

  PointMatch.prototype = {};

  PointMatch.prototype.getP1 = function() { return this.p1; };

  PointMatch.prototype.getP2 = function() { return this.p2; };


  PointMatch.prototype.calculateWeight = function()
  {
    this.weight = 1.0;
    for ( var i=0; i< this.weights.length; ++i )
      this.weight *= this.weights[ i ];
  };

  PointMatch.prototype.getWeight = function() { return this.weight; };

  PointMatch.prototype.setWeight = function( index, weight )
  {
    this.weights[ index ] = weight;
    this.calculateWeight();
  };

  /**
   * Get the last weights element and remove it from the list.  In case that
   * only one element is in the list, the element is not removed but set to
   * 1.0.
   *
   * @return
   */
  PointMatch.prototype.popWeight = function()
  {
    var l = this.weights.length - 1;
    var w = this.weights[ l ];
    if ( l > 0 )
    {
      this.weights = this.weights.slice( 0, l );
      calculateWeight();
    }
    else
      this.weights[ 0 ] = this.weight = 1.0;

    return w;
  };

  /**
   * Append a new element to the right side of the weights list.
   *
   * @param w
   */
  PointMatch.prototype.pushWeight = function( w )
  {
    this.weights = this.weights.slice( 0 ); // clone, to match java semantically
    this.weights.push( w );
    weight *= w;
  };

  /**
   * Get the first weights element and remove it from the list.  In case that
   * only one element is in the list, the element is not removed but set to
   * 1.0.
   *
   * @return
   */
  PointMatch.prototype.shiftWeight = function()
  {
    var l = weights.length - 1;
    var w = weights[ 0 ];
    if ( l > 0 )
    {
      this.weights = this.weights.slice( 1 );
      calculateWeight();
    }
    else
      this.weights[ 0 ] = this.weight = 1.0;

    return w;
  };

  /**
   * Append a new element to the left side of the weights list.
   *
   * @param w
   */
  PointMatch.prototype.unshiftWeight = function( w )
  {
    this.weights = this.weights.slice( 0 ); // clone
    this.weights.unshift( w );
    this.weight *= w;
  };

  PointMatch.prototype.getDistance = function() { return Point.prototype.distance( p1, p2 ); };


  /**
   * Apply a {@link CoordinateTransform} to {@link #p1}, update distance.
   *
   * @param t: CoordinateTransform
   */
  PointMatch.prototype.apply = function( t )
  {
    this.p1.apply( t );
  };

  /**
   * Apply a {@link CoordinateTransform} to {@link #p1} with a given amount,
   * update distance.
   *
   * @param t: CoordinateTransform
   * @param amount
   */
  PointMatch.prototype.apply2 = function( t, amount )
  {
    this.p1.apply2( t, this.strength * amount );
  };

  /**
   * Apply a {@link CoordinateTransform} to {@link #p1} a {@link Collection}
   * of {@link PointMatch PointMatches}, update their distances.
   *
   * @param matches: collection of PointMatch instances
   * @param t: CoordinateTransform
   */
  PointMatch.prototype.apply3 = function( matches, t )
  {
    for ( var i=0; i<matches.length; ++i)
      matches[ i ].apply( t );
  };

  /**
   * Flip all {@link PointMatch PointMatches} from
   * {@linkplain Collection matches} symmetrically and fill
   * {@linkplain Collection flippedMatches} with them, weights remain
   * unchanged.
   *
   * @param matches original set
   * @param flippedMatches result set
   */
  PointMatch.prototype.flip = function(
      matches,
      flippedMatches )
  {
    for ( var i=0; i<matches.length; ++i )
    {
      let match = matches[ i ];
      flippedMatches.push(
          new PointMatch(
              match.p2,
              match.p1,
              match.weights ) );
    }
  };

  /**
   * Flip symmetrically, weights remains unchanged.
   *
   * @param matches: collection of PointMatch instances
   * @return a new collection
   */
  PointMatch.prototype.flip1 = function( matches )
  {
    var list = [];
    PointMatch.prototype.flip( matches, list );
    return list;
  };

  /**
   * @param matches: collection of PointMatch instances
   * @param sourcePoints: empty collection to fill with sourcePoints
   */
  PointMatch.prototype.sourcePoints = function( matches, sourcePoints )
  {
    for ( var i=0; i<matches.length; ++i)
      sourcePoints.push( matches[ i ].getP1() );
  };

  /**
   * @param matches: collection of PointMatch instances
   * @param sourcePoints: empty collection to fill with sourcePoints
   */
  PointMatch.prototype.cloneSourcePoints = function( matches, sourcePoints )
  {
    for ( var i=0; i<matches.length; ++i)
      sourcePoints.push( matches[ i ].getP1().clone() );
  };

  /**
   * @param matches: collection of PointMatch instances
   * @param targetPoints: empty collection to fill with sourcePoints
   */
  PointMatch.prototype.targetPoints = function( matches, targetPoints )
  {
    for ( var i=0; i<matches.length; ++i)
      targetPoints.push( matches[ i ].getP1() );
  };

  /**
   * @param matches: collection of PointMatch instances
   * @param targetPoints: empty collection to fill with sourcePoints
   */
  PointMatch.prototype.cloneTargetPoints = function( matches, targetPoints )
  {
    for ( var i=0; i<matches.length; ++i)
      targetPoints.push( matches[ i ].getP1().clone() );
  };

  PointMatch.prototype.meanDistance = function( matches )
  {
    var d = 0.0;
    for ( var i=0; i<matches.length; ++i )
      d += matches[ i ].getDistance();
    return d / matches.length;
  };

  PointMatch.prototype.maxDistance = function( matches )
  {
    var max = -Number.MIN_VALUE;
    for ( var i=0; i<matches.length; ++i )
    {
      let d = match.getDistance();
      if ( d > max ) max = d;
    }
    return max;
  };


  var MovingLeastSquaresTransform = function() {

    // An array of unique PointMatch entries
    this.matches = [];

    this.model = null;

    this.alpha = 1.0;
  };

  MovingLeastSquaresTransform.prototype = {};

  MovingLeastSquaresTransform.prototype.getModel = function() { return this.model; };

  MovingLeastSquaresTransform.prototype.setModel = function( model ) { this.model = model; };

  MovingLeastSquaresTransform.prototype.getAlpha = function() { return this.alpha; };

  MovingLeastSquaresTransform.prototype.setAlpha = function( alpha ) { this.alpha = alpha; };

  MovingLeastSquaresTransform.prototype.weigh = function( d )
  {
    return 1.0 / Math.pow( d, this.alpha );
  };

  /** @param location: an array of doubles */
  MovingLeastSquaresTransform.prototype.apply = function( location )
  {
    var a = location.slice( 0 ); // clone
    this.applyInPlace( a );
    return a;
  };

  MovingLeastSquaresTransform.prototype.getMatches = function() { return this.matches; };

  MovingLeastSquaresTransform.prototype.setMatches = function( matches )
  {
    this.matches = [].concat( matches ); // clone
    this.model.fit( this.matches );
  };

  /** @param location: an array of doubles to transform. */
  MovingLeastSquaresTransform.prototype.applyInPlace = function( location )
  {
    var model = this.model;
    var weightedMatches = []; // list of PointMatch

    for ( let mi=0; mi<this.matches.length; ++mi )
    {
      let m = this.matches[ mi ];

      let l = m.getP1().getL();

//      /* specific for 2d */
//      final double dx = l[ 0 ] - location[ 0 ];
//      final double dy = l[ 1 ] - location[ 1 ];
//
//      final double weight = m.getWeight() * weigh( 1.0 + Math.sqrt( dx * dx + dy * dy ) );

      let s = 0.0;
      for ( let i = 0; i < location.length; ++i )
      {
        let dx = l[ i ] - location[ i ];
        s += dx * dx;
      }
      if ( s <= 0 )
      {
        let w = m.getP2().getW();
        for ( let i = 0; i < location.length; ++i )
          location[ i ] = w[ i ];
        return;
      }
      let weight = m.getWeight() * this.weigh( s );
      let mw = new PointMatch( m.getP1(), m.getP2(), weight );
      weightedMatches.push( mw );
    }

    try
    {
      model.fit( weightedMatches );
      model.applyInPlace( location );
    }
    catch ( e )
    {
      console.log( e );
    }
  };


  /**
   * Partial implementation. Not all methods are implemented,
   * only those sufficient to operate a MovingLeastSquaresTransform.
   */
  var AffineModel3D = function() {
    this.m00 = 1.0; this.m01 = 0.0; this.m02 = 0.0; this.m03 = 0.0;
    this.m10 = 0.0; this.m11 = 1.0; this.m12 = 0.0; this.m13 = 0.0;
    this.m20 = 0.0; this.m21 = 0.0; this.m22 = 1.0; this.m23 = 0.0;

    this.i00 = 1.0; this.i01 = 0.0; this.i02 = 0.0; this.i03 = 0.0;
    this.i10 = 0.0; this.i11 = 1.0; this.i12 = 0.0; this.i13 = 0.0;
    this.i20 = 0.0; this.i21 = 0.0; this.i22 = 1.0; this.i23 = 0.0;

    this.isInvertible = true;
  };

  AffineModel3D.prototype = {};

  /**
   * @param l: array of double values
   */
  AffineModel3D.prototype.apply = function( l )
  {
    var transformed = l.slice( 0 ); // clone
    this.applyInPlace( transformed );
    return transformed;
  };

  /**
   * @param l: array of double values
   */
  AffineModel3D.prototype.applyInPlace = function( l )
  {
    assert( l.length >= 3, "3d affine transformations can be applied to 3d points only." );

    var l0 = l[ 0 ];
    var l1 = l[ 1 ];
    l[ 0 ] = l0 * this.m00 + l1 * this.m01 + l[ 2 ] * this.m02 + this.m03;
    l[ 1 ] = l0 * this.m10 + l1 * this.m11 + l[ 2 ] * this.m12 + this.m13;
    l[ 2 ] = l0 * this.m20 + l1 * this.m21 + l[ 2 ] * this.m22 + this.m23;
  };

  /**
   * @param l: array of double values
   */
  AffineModel3D.prototype.applyInverse = function( l )
  {
    var transformed = l.slice( 0 );
    this.applyInverseInPlace( transformed );
    return transformed;
  };

  /**
   * @param l: array of double values
   */
  AffineModel3D.prototype.applyInverseInPlace = function( l )
  {
    assert( l.length >= 3, "3d affine transformations can be applied to 3d points only." );

    if ( this.isInvertible )
    {
      let l0 = l[ 0 ];
      let l1 = l[ 1 ];
      l[ 0 ] = l0 * this.i00 + l1 * this.i01 + l[ 2 ] * this.i02 + this.i03;
      l[ 1 ] = l0 * this.i10 + l1 * this.i11 + l[ 2 ] * this.i12 + this.i13;
      l[ 2 ] = l0 * this.i20 + l1 * this.i21 + l[ 2 ] * this.i22 + this.i23;
    }
    else
      throw new NoninvertibleModelException( "Model not invertible." );
  };

  /**
   * Closed form weighted least squares solution as described by
   * \citet{SchaeferAl06}.
   *
   * @param matches: collection of PointMatch instances
   */
  AffineModel3D.prototype.fit = function( matches )
  {
    if ( matches.length < 4 )
      throw new NotEnoughDataPointsException( matches.length + " data points are not enough to estimate a 2d affine model, at least " + MIN_NUM_MATCHES + " data points required." );

    var pcx = 0.0, pcy = 0.0, pcz = 0.0;
    var qcx = 0.0, qcy = 0.0, qcz = 0.0;

    var ws = 0.0;

    for ( let i=0; i<matches.length; ++i )
    {
      let m = matches[ i ];

      let p = m.getP1().getL(); // array
      let q = m.getP2().getW(); // array

      let w = m.getWeight();
      ws += w;

      pcx += w * p[ 0 ];
      pcy += w * p[ 1 ];
      pcz += w * p[ 2 ];
      qcx += w * q[ 0 ];
      qcy += w * q[ 1 ];
      qcz += w * q[ 2 ];
    }
    pcx /= ws;
    pcy /= ws;
    pcz /= ws;
    qcx /= ws;
    qcy /= ws;
    qcz /= ws;

    var
      a00, a01, a02,
           a11, a12,
                a22;
    var
      b00, b01, b02,
      b10, b11, b12,
      b20, b21, b22;

    a00 = a01 = a02 = a11 = a12 = a22 = b00 = b01 = b02 = b10 = b11 = b12 = b20 = b21 = b22 = 0;
    for ( let i=0; i<matches.length; ++i )
    {
      let m = matches[ i ];
      let p = m.getP1().getL(); // array
      let q = m.getP2().getW(); // array
      let w = m.getWeight();

      let px = p[ 0 ] - pcx, py = p[ 1 ] - pcy, pz = p[ 2 ] - pcz;
      let qx = q[ 0 ] - qcx, qy = q[ 1 ] - qcy, qz = q[ 2 ] - qcz;
      a00 += w * px * px;
      a01 += w * px * py;
      a02 += w * px * pz;
      a11 += w * py * py;
      a12 += w * py * pz;
      a22 += w * pz * pz;

      b00 += w * px * qx;
      b01 += w * px * qy;
      b02 += w * px * qz;
      b10 += w * py * qx;
      b11 += w * py * qy;
      b12 += w * py * qz;
      b20 += w * pz * qx;
      b21 += w * pz * qy;
      b22 += w * pz * qz;
    }

    var det =
      a00 * a11 * a22 +
      a01 * a12 * a02 +
      a02 * a01 * a12 -
      a02 * a11 * a02 -
      a12 * a12 * a00 -
      a22 * a01 * a01;

    if ( det == 0 )
      throw new IllDefinedDataPointsException();

    var idet = 1.0 / det;

    var ai00 = ( a11 * a22 - a12 * a12 ) * idet;
    var ai01 = ( a02 * a12 - a01 * a22 ) * idet;
    var ai02 = ( a01 * a12 - a02 * a11 ) * idet;
    var ai11 = ( a00 * a22 - a02 * a02 ) * idet;
    var ai12 = ( a02 * a01 - a00 * a12 ) * idet;
    var ai22 = ( a00 * a11 - a01 * a01 ) * idet;

    this.m00 = ai00 * b00 + ai01 * b10 + ai02 * b20;
    this.m01 = ai01 * b00 + ai11 * b10 + ai12 * b20;
    this.m02 = ai02 * b00 + ai12 * b10 + ai22 * b20;

    this.m10 = ai00 * b01 + ai01 * b11 + ai02 * b21;
    this.m11 = ai01 * b01 + ai11 * b11 + ai12 * b21;
    this.m12 = ai02 * b01 + ai12 * b11 + ai22 * b21;

    this.m20 = ai00 * b02 + ai01 * b12 + ai02 * b22;
    this.m21 = ai01 * b02 + ai11 * b12 + ai12 * b22;
    this.m22 = ai02 * b02 + ai12 * b12 + ai22 * b22;

    this.m03 = qcx - this.m00 * pcx - this.m01 * pcy - this.m02 * pcz;
    this.m13 = qcy - this.m10 * pcx - this.m11 * pcy - this.m12 * pcz;
    this.m23 = qcz - this.m20 * pcx - this.m21 * pcy - this.m22 * pcz;

    this.invert();
  };


  AffineModel3D.prototype.invert = function()
  {
    var det = Matrix3x3.det( this.m00, this.m01, this.m02, this.m10, this.m11, this.m12, this.m20, this.m21, this.m22 );
    if ( det == 0 )
    {
      this.isInvertible = false;
      return;
    }

    this.isInvertible = true;

    var idet = 1.0 / det;

    this.i00 = ( this.m11 * this.m22 - this.m12 * this.m21 ) * idet;
    this.i01 = ( this.m02 * this.m21 - this.m01 * this.m22 ) * idet;
    this.i02 = ( this.m01 * this.m12 - this.m02 * this.m11 ) * idet;
    this.i10 = ( this.m12 * this.m20 - this.m10 * this.m22 ) * idet;
    this.i11 = ( this.m00 * this.m22 - this.m02 * this.m20 ) * idet;
    this.i12 = ( this.m02 * this.m10 - this.m00 * this.m12 ) * idet;
    this.i20 = ( this.m10 * this.m21 - this.m11 * this.m20 ) * idet;
    this.i21 = ( this.m01 * this.m20 - this.m00 * this.m21 ) * idet;
    this.i22 = ( this.m00 * this.m11 - this.m01 * this.m10 ) * idet;

    this.i03 = -this.i00 * this.m03 - this.i01 * this.m13 - this.i02 * this.m23;
    this.i13 = -this.i10 * this.m03 - this.i11 * this.m13 - this.i12 * this.m23;
    this.i23 = -this.i20 * this.m03 - this.i21 * this.m13 - this.i22 * this.m23;
  };


  var transform = {};
  transform.Point = Point;
  transform.PointMatch = PointMatch;
  transform.MovingLeastSquaresTransform = MovingLeastSquaresTransform;
  transform.NoninvertibleModelException = NoninvertibleModelException;
  transform.NotEnoughDataPointsException = NotEnoughDataPointsException;
  transform.AffineModel3D = AffineModel3D;

  CATMAID.transform = transform;

})(CATMAID);
