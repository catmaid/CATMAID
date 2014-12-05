/**
 * simple slider
 */

var SLIDER_HORIZONTAL = 0;
var SLIDER_VERTICAL = 1;

/**
 * a vertical or horizontal slider
 *
 * it is possible to instantiate the slider by the values min, max and steps or
 * with an array steps containing all possible values
 * internally a steps-array is created for both constructors
 */
Slider = function(
  type,     //!< SLIDER_HORIZONTAL | SLIDER_VERTICAL
  input,    //!< create an input or not
  min,      //!< the minimal value
  max,      //!< the maximal value
  steps,    //!< number of steps, an array of values,
            //!< or an object literal of either for major and minor steps
  def,      //!< default value
  onchange, //!< method to call
  split,    //!< split value
  forceSnap //!< whether to force input to snap to indexed values
  )
{
  /**
   * returns the slider-element for insertion to the document
   */
  this.getView = function()
  {
    return view;
  };
  
  /**
   * returns the input-element for insertion to the document
   */
  this.getInputView = function()
  {
    return inputView;
  };
  
  /**
   * set a value by its index in the value array
   */
  var setByIndex = function( i, cancelOnchange )
  {
    self.setByValue( values[ i ], cancelOnchange );
  };

  /**
   * set the handle position based on the slider value
   *
   * param {number} index Index of the value to move to, may be nonintegral
   */
  var setHandle = function (index)
  {
    if ( values.length > 1 )
      handlePos = 100 * index / ( values.length - 1 );
    else
      handlePos = 0;

    switch ( type )
    {
    case SLIDER_VERTICAL:
      handle.style.height = handlePos + "%";
      barTop.style.height = handlePos + "%";
      barBottom.style.height = ( 100 - handlePos ) + "px";
      // select CSS class
      if (index < splitIndex) {
        barTop.className = "vSliderBarTop";
        barBottom.className = "vSliderBarBottom";
      } else {
        barTop.className = "vSliderBarTop_2";
        barBottom.className = "vSliderBarBottom_2";
      }
      break;
    case SLIDER_HORIZONTAL:
      handle.style.left = handlePos + "%";
      barTop.style.width = handlePos + "%";
      barBottom.style.width = ( 100 - handlePos ) + "%";
      // select CSS class
      if (index < splitIndex) {
        barTop.className = "hSliderBarTop";
        barBottom.className = "hSliderBarBottom";
      } else {
        barTop.className = "hSliderBarTop_2";
        barBottom.className = "hSliderBarBottom_2";
      }
      break;
    }
  };

  /**
   * Set the slider by a value. If forceSnap is false, allows values not in the
   * value set. Assumes the value array is sorted and unique, but no assumptions
   * are made about order or interval.
   */
  this.setByValue = function(val, cancelOnchange) {
    if (self.val === val) return; // If value is unchanged, don't needlessly update.
    var valBin, index;

    if (values.length > 1) {
      valBin = binValue(val, values);

      // If arbitrary values are not allowed, restrict the value to values in
      // the array
      if (forceSnap && valBin.length > 1) {
        valBin.length = 1; // Truncate
        val = values[valBin[0]];
      }

      if (valBin.length > 1) {
        // Linearly interpolate handle position between nearest value ticks
        index = valBin[0] + (val - values[valBin[0]])/(values[valBin[1]] - values[valBin[0]]);
      } else {
        index = valBin[0];
      }
    } else {
      index = 0;
      val = values[0];
      valBin = [0];
    }

    setHandle(index);
    self.val = val;
    ind = valBin[0];

    if (input) {
      // Set input textbox to new value, truncating the value for display
      input.value = Number(val).toFixed(2).replace(/\.?0+$/,"");
    }

    if (!cancelOnchange) self.onchange(self.val);
  };

  /**
   * set a value, priorly check if it is in the value array
   */
  var setByInput = function( e )
  {
    var inputVal = Number(this.value);
    // If not a valid Number, reset slider to previous value (or first value if
    // previous value is also NaN, such as through bad initialization).
    if (isNaN(inputVal)) this.value = isNaN(self.val) ? self.values[0] : self.val;
    else self.setByValue(inputVal);
  };

  /**
   * check if a value is in the value array
   *
   * @returns -1 if not, the index of the value otherwise
   */
  var isValue = function( val )
  {
    var valBin = binValue( val, values );
    return valBin.length === 1 ? valBin[0] : -1;
  };

  /**
   * Find the index of value in a set of sorted bins. If the value is not in the
   * set, find the bins surrounding the value.
   */
  var binValue = function(val, bins) {
    var ascending = bins[0] < bins[bins.length - 1];
    var minVal = ascending ? bins[0] : bins[bins.length - 1];
    var maxVal = !ascending ? bins[0] : bins[bins.length - 1];
    val = Number(val);

    // Clamp val to bins range
    if (val < minVal)
      return [ascending ? 0 : bins.length - 1];
    else if (val > maxVal)
      return [ascending ? bins.length - 1 : 0];

    // Binary search values for bin fitting val
    var i = 0, j = bins.length - 1, n;
    while (j - i > 1)  {
      n = Math.floor((i + j) / 2);

      if (val === bins[n]) {
        return [n];
      } else if (val > bins[n]) {
        if (ascending) i = n;
        else j = n;
      } else {
        if (ascending) j = n;
        else i = n;
      }
    }

    if (val === bins[i]) return [i];
    if (val === bins[j]) return [j];
    return [i, j];
  };

  /**
   * mouse button pressed on handle
   */
  var handleMouseDown = function( e )
  {
    getBarSize();
    virtualHandlePos = barSize * handlePos / 100;
    
    ui.registerEvent( "onmousemove", handleMove );
    ui.registerEvent( "onmouseup", handleMouseUp );
    ui.setCursor( "pointer" );
    ui.catchEvents();
    ui.onmousedown( e );
    
    return false;
  };
  
  /**
   * mouse button released on handle (on the ui.mouseCatcher respectively)
   */
  var handleMouseUp = function( e )
  {
    if ( timer ) window.clearTimeout( timer );
    
    ui.releaseEvents();
    ui.removeEvent( "onmousemove", handleMove );
    ui.removeEvent( "onmouseup", handleMouseUp );
    
    return false;
  };
  
  /**
   * mouse moved on handle (on the mouseCatcher respectively)
   */
  var handleMove = function( e )
  {
    var md;
    switch ( type )
    {
    case SLIDER_VERTICAL:
      md = ui.diffY;
      break;
    case SLIDER_HORIZONTAL:
      md = ui.diffX;
      break;
    }
    getBarSize();
    virtualHandlePos = Math.max( 0, Math.min( barSize, virtualHandlePos + md ) );
    var i = Math.round( virtualHandlePos / barSize * ( values.length - 1 ) );
    setByIndex( i );
    
    return false;
  };
  
  /**
   * mouse wheel over slider, moves the slider step by step
   */
  var mouseWheel = function( e )
  {
    var w = ui.getMouseWheel( e );
    if ( w )
    {
      if ( type == SLIDER_HORIZONTAL ) w *= -1;

      self.move( w > 0 ? 1 : -1, e.shiftKey );
    }
    return false;
  };
  
  /**
   * decreases the index and invoke timeout
   */
  var decrease = function()
  {
    self.move( -1 );
    timer = window.setTimeout( decrease, 250 );
    return;
  };
  
  /**
   * increases the index and invoke timeout
   */
  var increase = function()
  {
    self.move( 1 );
    timer = window.setTimeout( increase, 250 );
    return;
  };

  /**
   * move the slider from outside
   */
  this.move = function( i, major )
  {
    if ( major )
    {
      valBin = binValue( self.val, majorValues );

      if ( i < 0 && valBin.length > 1)
      {
        valBin[0]++;
      }

      setByIndex( isValue( majorValues [ Math.max( 0, Math.min( majorValues.length - 1, valBin[0] + i ) ) ] ) );
    }
    else
    {
      setByIndex( Math.max( 0, Math.min( values.length - 1, ind + i ) ) );
    }
  };

  /**
   * mouse down on the top bar, so move up, setting a timer
   */
  var barTopMouseDown = function( e )
  {
    if ( timer ) window.clearTimeout( timer );
    
    ui.registerEvent( "onmouseup", barMouseUp );
    ui.setCursor( "auto" );
    ui.catchEvents();
    ui.onmousedown( e );
    
    decrease();
    return false;
  };
  
  /**
   * mouse down on the top bar, so move up, setting a timer
   */
  var barBottomMouseDown = function( e )
  {
    if ( timer ) window.clearTimeout( timer );
    
    ui.registerEvent( "onmouseup", barMouseUp );
    ui.setCursor( "auto" );
    ui.catchEvents();
    ui.onmousedown( e );
    
    increase();
    return false;
  };
  
  /**
   * mouse up on the top or bottom bar, so clear the timer
   */
  var barMouseUp = function( e )
  {
    if ( timer ) window.clearTimeout( timer );
    
    ui.releaseEvents();
    ui.removeEvent( "onmouseup", barMouseUp );
    
    return false;
  };

  var getBarSize = function()
  {
    barSize = barSize || parseInt( $( view ).css(
      type === SLIDER_VERTICAL ? 'height' : 'width') );
  };
  
  /**
  * resize the slider
  */
  this.resize = function( newSize )
  {
    var viewSize;
    var axis = type === SLIDER_VERTICAL ? 'height' : 'width';
    // Clamp the new size to be at least twice as large as the slider handle
    viewSize = Math.max( parseInt( $( handle ).css( axis ) ) * 2, newSize );
    barSize = parseInt( $( view ).css( axis ) );
    view.style[ axis ] = viewSize + "px";

    // update the handle position
    setByIndex( ind, true );
    return;
  };
  
  this.update = function(
    min,      //!< the minimal value
    max,      //!< the maximal value
    steps,    //!< number of steps, an array of values,
              //!< or an object literal of either for major and minor steps
    def,      //!< default value
    onchange, //!< method to call
    split     //!< split value
  )
  {
    this.onchange = onchange;

    // If steps is not an object, create one.
    if ( typeof steps !== "object" || Array.isArray( steps ) )
    {
      steps = { major: steps, minor: steps };
    }

    values = [ steps.major, steps.minor ].map( function ( steps ) {
      var values = [];

      if ( typeof steps === "number" )
      {
        var s;
        if ( steps > 1 )
          s = ( max - min ) / ( steps - 1 );
        else
          s = 0;
        for ( var i = 0; i < steps; ++i )
          values[ i ] = i * s + min;
      }
      else if ( typeof steps === "object" )
      {
        values = steps;
      }

      return values;
    } );

    majorValues = values[ 0 ];
    // Combine major and minor values, sort, and filter duplicates.
    values = majorValues.concat( values[ 1 ] ).sort( function ( a, b ) { return a - b; } );
    if ( majorValues[ 0 ] > majorValues[ majorValues.length - 1 ] ) values.reverse();
    values = values.filter( function ( el, ind, arr )
      { return ind === arr.indexOf( el ); } );

    // was a split parameter passed?
    if (split === undefined)
    {
      // disable splitting
      splitIndex = values.length;
    }
    else
    {
      // set split index
      splitIndex = binValue( split, values );
      if ( splitIndex.length > 1)
      {
        splitIndex = splitIndex[1];
      }
      else
      {
        splitIndex = splitIndex[0];
      }
    }
    
    if ( typeof def !== "undefined" )
    {
      self.setByValue( def, true );
    }
    else
    {
      self.setByValue( values[ 0 ], true );
    }

    if (input)
    {
      // Resize input text box size to accomodate the number of digits in range.
      input.size = [min, max].map(function (x) {
          return typeof x === "undefined" ? 0 : x.toString().length;
        }).reduce(function (m, x) { return Math.max(m, x); }, 2) + 1;
    }
    
    return;
  };
  
  // initialise
  
  var self = this;
  if ( type != SLIDER_HORIZONTAL ) type = SLIDER_VERTICAL;
  var inputView;
  var timer;
  
  var virtualHandlePos = 0; // Handle position when dragging as pixels
  var handlePos = 0; // Handle position as percentage of slider
  
  var values;
  var majorValues;
  var ind = 0;  //!< the current index
  this.val = 0;     //!< the current value
  var splitIndex = 0; //!< index where to change div class
  if ( typeof forceSnap === 'undefined' ) forceSnap = true;

  if ( !ui ) ui = new UI();
  
  var view = document.createElement( "div" );
  var barTop = document.createElement( "div" );
  var barBottom = document.createElement( "div" );
  var handle = document.createElement( "div" );

  var barSize;
  
  handle.onmousedown = handleMouseDown;
  barTop.onmousedown = barTopMouseDown;
  barBottom.onmousedown = barBottomMouseDown;
  
  switch ( type )
  {
  case SLIDER_VERTICAL:
    view.className = "vSliderView";
    barTop.className = "vSliderBarTop";
    barBottom.className = "vSliderBarBottom";
    handle.className = "vSliderHandle";
    break;
  case SLIDER_HORIZONTAL:
    view.className = "hSliderView";
    barTop.className = "hSliderBarTop";
    barBottom.className = "hSliderBarBottom";
    handle.className = "hSliderHandle";
    break;
  }
  
  view.appendChild( barTop );
  view.appendChild( handle );
  view.appendChild( barBottom );
  
  if ( input )
  {
    var name = uniqueId();
    
    inputView = document.createElement( "p" );
    inputView.style.paddingLeft = "0.5em";
    input = document.createElement( "input" );
    input.type = "text";
    input.size = "3";
    input.id = input.name = name;
    
    var map = document.createElement( "map" );
    map.id = map.name = "map_" + name;
    var area1 = document.createElement( "area" );
    area1.shape = "rect";
    area1.coords = "0,0,13,9";
    area1.alt = "+";
    var area2 = document.createElement( "area" );
    area2.shape = "rect";
    area2.coords = "0,10,13,18";
    area2.alt = "-";
    
    switch ( type )
    {
    case SLIDER_HORIZONTAL:
      area1.onmousedown = barBottomMouseDown;
      area2.onmousedown = barTopMouseDown;
      break;
    case SLIDER_VERTICAL:
      area1.onmousedown = barTopMouseDown;
      area2.onmousedown = barBottomMouseDown;
      break;
    }
    area1.onmouseup = barMouseUp;
    area2.onmouseup = barMouseUp;
    
    map.appendChild( area1 );
    map.appendChild( area2 );
    
    var img = document.createElement( "img" );
    img.src = STATIC_URL_JS + "images/input_topdown.svg";
    img.setAttribute('onerror', 'this.onerror=null;this.src="' +
      STATIC_URL_JS + 'images/input_topdown.gif";');
    img.alt = "";
    img.useMap = "#map_" + name;
    
    inputView.appendChild( map );
    inputView.appendChild( input );
    inputView.appendChild( img );
    
    inputView.style.display = "none";
    inputView.style.display = "block";
    
    input.onchange = setByInput;
    try
    {
      input.addEventListener( "DOMMouseScroll", mouseWheel, false );
      /* Webkit takes the event but does not understand it ... */
      input.addEventListener( "mousewheel", mouseWheel, false );
    }
    catch ( error )
    {
      try
      {
        input.onmousewheel = mouseWheel;
      }
      catch ( error ) {}
    }
  }
  
  try
  {
    view.addEventListener( "DOMMouseScroll", mouseWheel, false );
    /* Webkit takes the event but does not understand it ... */
    view.addEventListener( "mousewheel", mouseWheel, false );
  }
  catch ( error )
  {
    try
    {
      view.onmousewheel = mouseWheel;
    }
    catch ( error ) {}
  }
  
  this.update( min, max, steps, def, onchange, split);
};
