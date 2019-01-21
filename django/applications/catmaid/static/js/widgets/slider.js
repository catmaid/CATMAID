(function(CATMAID) {

  "use strict";

  /**
   * a vertical or horizontal slider
   *
   * it is possible to instantiate the slider by the values min, max and steps or
   * with an array steps containing all possible values
   * internally a steps-array is created for both constructors
   */
  function Slider(
    type,     //!< Slider.HORIZONTAL | Slider.VERTICAL
    input,    //!< create an input or not
    min,      //!< the minimal value
    max,      //!< the maximal value
    steps,    //!< number of steps, an array of values,
              //!< or an object literal of either for major and minor steps
    def,      //!< default value
    onchange, //!< method to call
    split,    //!< split value
    forceSnap,//!< whether to force input to snap to indexed values
    minMove,  //!< a required minimum change when calling move
    validate  //!< an optional validation function to constrain new values
    )
  {
    if ( type != Slider.HORIZONTAL ) type = Slider.VERTICAL;
    this._type = type;
    this._timer = false;

    this._virtualHandlePos = 0; // Handle position when dragging as pixels
    this._handlePos = 0; // Handle position as percentage of slider

    this._values = [];
    this._majorValues = [];
    this._ind = 0;  //!< the current index
    this.val = undefined;     //!< the current value
    this._splitIndex = 0; //!< index where to change div class
    if ( typeof forceSnap === 'undefined' ) forceSnap = true;
    this._forceSnap = forceSnap;
    this._minMove = minMove;
    this.blurOnChange = true;

    this._view = document.createElement( "div" );
    this._barTop = document.createElement( "div" );
    this._barBottom = document.createElement( "div" );
    this._handle = document.createElement( "div" );

    this._barSize = false;

    this._handle.onpointerdown = this._handlePointerDown.bind(this);
    this._barTop.onpointerdown = this._barPointerDown.bind(this, -1);
    this._barBottom.onpointerdown = this._barPointerDown.bind(this, 1);

    var inputViewClass;

    switch ( type )
    {
    case Slider.VERTICAL:
      this._view.className = "vSliderView";
      this._barTop.className = "vSliderBarTop";
      this._barBottom.className = "vSliderBarBottom";
      this._handle.className = "vSliderHandle";
      inputViewClass = "vSliderInputView";
      break;
    case Slider.HORIZONTAL:
      this._view.className = "hSliderView";
      this._barTop.className = "hSliderBarTop";
      this._barBottom.className = "hSliderBarBottom";
      this._handle.className = "hSliderHandle";
      inputViewClass = "hSliderInputView";
      break;
    }

    this._view.appendChild( this._barTop );
    this._view.appendChild( this._handle );
    this._view.appendChild( this._barBottom );

    // Pre-beind handler for event release. This is necessary because otherwise
    // CATMAID.ui.removeEvent will not recognize methods bound at different times
    // as equal.
    this._boundHandleMove = this._handleMove.bind(this);
    this._boundHandlePointerUp = this._handlePointerUp.bind(this);
    this._boundBarPointerUp = this._barPointerUp.bind(this);

    this.extraValidate = CATMAID.tools.isFn(validate) ? validate : null;

    if ( input )
    {
      var name = CATMAID.tools.uniqueId();

      this._inputView = document.createElement( "p" );
      this._inputView.classList.add(inputViewClass);
      this._inputView.style.paddingLeft = "0.5em";
      this._input = document.createElement( "input" );
      this._input.type = "text";
      this._input.size = "3";
      this._input.id = this._input.name = name;

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
      case Slider.HORIZONTAL:
        area1.onpointerdown = this._barPointerDown.bind(this, 1);
        area2.onpointerdown = this._barPointerDown.bind(this, -1);
        break;
      case Slider.VERTICAL:
        area1.onpointerdown = this._barPointerDown.bind(this, -1);
        area2.onpointerdown = this._barPointerDown.bind(this, 1);
        break;
      }

      area1.onpointerup = this._boundBarPointerUp;
      area2.onpointerup = this._boundBarPointerUp;

      map.appendChild( area1 );
      map.appendChild( area2 );

      var img = document.createElement( "img" );
      img.src = STATIC_URL_JS + "images/input_topdown.svg";
      img.setAttribute('onerror', 'this.onerror=null;this.src="' +
        STATIC_URL_JS + 'images/input_topdown.gif";');
      img.alt = "";
      img.useMap = "#map_" + name;

      this._inputView.appendChild( map );
      this._inputView.appendChild( this._input );
      this._inputView.appendChild( img );

      this._input.onchange = this._setByInputHandler();
      this._input.addEventListener( "wheel", this._mouseWheel.bind(this), false );
    }

    this._view.addEventListener( "wheel", this._mouseWheel.bind(this), false );

    this.update(min, max, steps, def, onchange, split);
  }

  Slider.prototype = {};
  Slider.prototype.constructor = Slider;

  Slider.HORIZONTAL = 0;
  Slider.VERTICAL = 1;

  Slider.prototype.validate = function(val) {
    if (isNaN(val)) {
      return false;
    }
    if (this.extraValidate) {
      return this.extraValidate(val);
    }
    return true;
  };

  /**
   * returns the slider-element for insertion to the document
   */
  Slider.prototype.getView = function()
  {
    return this._view;
  };

  /**
   * returns the input-element for insertion to the document
   */
  Slider.prototype.getInputView = function()
  {
    return this._inputView;
  };

  /**
   * set a value by its index in the value array
   */
  Slider.prototype._setByIndex = function( i, cancelOnchange )
  {
    this.setByValue( this._values[ i ], cancelOnchange );
  };

  /**
   * set the handle position based on the slider value
   *
   * param {number} index Index of the value to move to, may be nonintegral
   */
  Slider.prototype._setHandle = function (index)
  {
    if ( this._values.length > 1 )
      this._handlePos = 100 * index / ( this._values.length - 1 );
    else
      this._handlePos = 0;

    switch ( this._type )
    {
    case Slider.VERTICAL:
      this._handle.style.height = this._handlePos + "%";
      this._barTop.style.height = this._handlePos + "%";
      this._barBottom.style.height = ( 100 - this._handlePos ) + "px";
      // select CSS class
      if (index < this._splitIndex) {
        this._barTop.className = "vSliderBarTop";
        this._barBottom.className = "vSliderBarBottom";
      } else {
        this._barTop.className = "vSliderBarTop_2";
        this._barBottom.className = "vSliderBarBottom_2";
      }
      break;
    case Slider.HORIZONTAL:
      this._handle.style.left = this._handlePos + "%";
      this._barTop.style.width = this._handlePos + "%";
      this._barBottom.style.width = ( 100 - this._handlePos ) + "%";
      // select CSS class
      if (index < this._splitIndex) {
        this._barTop.className = "hSliderBarTop";
        this._barBottom.className = "hSliderBarBottom";
      } else {
        this._barTop.className = "hSliderBarTop_2";
        this._barBottom.className = "hSliderBarBottom_2";
      }
      break;
    }
  };

  /**
   * Set the slider by a value. If forceSnap is false, allows values not in the
   * value set. Assumes the value array is sorted and unique, but no assumptions
   * are made about order or interval.
   */
  Slider.prototype.setByValue = function(val, cancelOnchange, noValidation) {
    var valBin, index;

    if (!noValidation && !this.validate(val)) {
      return;
    }

    if (this._values.length > 1) {
      valBin = this._binValue(val, this._values);

      // If arbitrary values are not allowed, restrict the value to values in
      // the array
      if (this._forceSnap && valBin.length > 1) {
        valBin.length = 1; // Truncate
        val = this._values[valBin[0]];
      }

      if (valBin.length > 1) {
        // Linearly interpolate handle position between nearest value ticks
        index = valBin[0] + (val - this._values[valBin[0]])/(this._values[valBin[1]] - this._values[valBin[0]]);
      } else {
        index = valBin[0];
      }
    } else {
      index = 0;
      val = this._values[0];
      valBin = [0];
    }

    if (val !== this.val) {
      var step = val - this.val;
      this._setHandle(index);
      this.val = val;
      this._ind = valBin[0];

      if (this._input) {
        // Set input textbox to new value, truncating the value for display
        this._input.value = Number(val).toFixed(2).replace(/\.?0+$/,"");

        // increase input textbox size if new value is too big for current box
        var truncatedLength = this._input.value.toString().length;
        if (truncatedLength > this._input.size) {
          this._input.size = truncatedLength + 1;
        }
      }

      if (!cancelOnchange) this.onchange(this.val, step);
    }
  };

  /**
   * set a value, priorly check if it is in the value array
   */
  Slider.prototype._setByInputHandler = function () {
    var self = this;
    return function (e) {
      var inputVal = Number(this.value);
      // Execute validation function if available, otherwise only check if the
      // input is not a number. If the new value is not valud, reset slider to
      // previous value (or first value if previous value is also NaN, such as
      // through bad initialization).
      if (self.validate(inputVal)) {
        self.setByValue(inputVal);
      } else {
        this.value = self.validate(self.val) ? self.val : self._values[0];
      }
      if (e && e.target && self.blurOnChange) {
        e.target.blur();
      }
    };
  };

  /**
   * check if a value is in the value array
   *
   * @returns -1 if not, the index of the value otherwise
   */
  Slider.prototype._isValue = function( val )
  {
    var valBin = this._binValue( val, this._values );
    return valBin.length === 1 ? valBin[0] : -1;
  };

  /**
   * Find the index of value in a set of sorted bins. If the value is not in the
   * set, find the bins surrounding the value.
   */
  Slider.prototype._binValue = function(val, bins) {
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
   * pointer button pressed on handle
   */
  Slider.prototype._handlePointerDown = function( e )
  {
    this._getBarSize();
    this._virtualHandlePos = this._barSize * this._handlePos / 100;

    CATMAID.ui.registerEvent( "onpointermove", this._boundHandleMove );
    CATMAID.ui.registerEvent( "onpointerup", this._boundHandlePointerUp );
    CATMAID.ui.setCursor( "pointer" );
    CATMAID.ui.catchEvents();
    CATMAID.ui.onpointerdown( e );

    return false;
  };

  /**
   * pointer button released on handle (on the ui.mouseCatcher respectively)
   */
  Slider.prototype._handlePointerUp = function( e )
  {
    if ( this._timer ) window.clearTimeout( this._timer );

    CATMAID.ui.releaseEvents();
    CATMAID.ui.removeEvent( "onpointermove", this._boundHandleMove );
    CATMAID.ui.removeEvent( "onpointerup", this._boundHandlePointerUp );

    return false;
  };

  /**
   * pointer moved on handle (on the mouseCatcher respectively)
   */
  Slider.prototype._handleMove = function( e )
  {
    var md;
    switch ( this._type )
    {
    case Slider.VERTICAL:
      md = CATMAID.ui.diffY;
      break;
    case Slider.HORIZONTAL:
      md = CATMAID.ui.diffX;
      break;
    }
    this._getBarSize();
    this._virtualHandlePos = Math.max( 0, Math.min( this._barSize, this._virtualHandlePos + md ) );
    var i = Math.round( this._virtualHandlePos / this._barSize * ( this._values.length - 1 ) );
    this._setByIndex( i );

    return false;
  };

  /**
   * mouse wheel over slider, moves the slider step by step
   */
  Slider.prototype._mouseWheel = function( e )
  {
    var w = CATMAID.ui.getMouseWheel( e );
    if ( w )
    {
      if ( this._type == Slider.HORIZONTAL ) w *= -1;

      this.move( w > 0 ? 1 : -1, e.shiftKey );
    }
    return false;
  };

  Slider.prototype._clampIndex = function (index, major) {
    return Math.max(0, Math.min((major ? this._majorValues.length : this._values.length) - 1, index));
  };

  /**
   * move the slider from outside
   */
  Slider.prototype.move = function( i, major )
  {
    if ( major )
    {
      var valBin = this._binValue( this.val, this._majorValues );

      if ( i < 0 && valBin.length > 1)
      {
        valBin[0]++;
      }

      this._setByIndex( this._isValue( this._majorValues [ this._clampIndex( valBin[0] + i, true ) ] ) );
    }
    else
    {
      var newIndex = this._clampIndex(this._ind + i);
      if (Math.abs(this._values[newIndex] - this.val) < this._minMove) {
        // If the resulting move is below the minMove threshold, try moving twice.
        newIndex = this._clampIndex(newIndex + i);
      }
      this._setByIndex(newIndex);
    }
  };

  /**
   * Move the slider and invoke timeout
   */
  Slider.prototype._moveWithTimeout = function(i, major) {
    this.move(i, major);
    this._timer = window.setTimeout(this._moveWithTimeout.bind(this, i, major), 250);
  };

  /**
   * pointer down on the bar, so move in the specified direction, setting a timer
   */
  Slider.prototype._barPointerDown = function( step, e )
  {
    if ( this._timer ) window.clearTimeout( this._timer );

    CATMAID.ui.registerEvent( "onpointerup", this._boundBarPointerUp );
    CATMAID.ui.setCursor( "auto" );
    CATMAID.ui.catchEvents();
    CATMAID.ui.onpointerdown( e );

    this._moveWithTimeout(step, e.shiftKey);
    return false;
  };

  /**
   * pointer up on the top or bottom bar, so clear the timer
   */
  Slider.prototype._barPointerUp = function( e )
  {
    if ( this._timer ) window.clearTimeout( this._timer );

    CATMAID.ui.releaseEvents();
    CATMAID.ui.removeEvent( "onpointerup", this._boundBarPointerUp );

    return false;
  };

  Slider.prototype._getBarSize = function()
  {
    this._barSize = this._barSize || parseInt( $( this._view ).css(
        this._type === Slider.VERTICAL ? 'height' : 'width') );
  };

  /**
  * resize the slider
  */
  Slider.prototype.resize = function( newSize )
  {
    var axis = this._type === Slider.VERTICAL ? 'height' : 'width';
    // Clamp the new size to be at least twice as large as the slider handle
    var viewSize = Math.max( parseInt( $( this._handle ).css( axis ) ) * 2, newSize );
    this._barSize = parseInt( $( this._view ).css( axis ) );
    this._view.style[ axis ] = viewSize + "px";

    // update the handle position
    this._setByIndex( this._ind, true );
  };

  Slider.prototype.update = function(
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

    this._values = [ steps.major, steps.minor ].map( function ( steps ) {
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

    this._majorValues = this._values[ 0 ];
    // Combine major and minor values, sort, and filter duplicates.
    this._values = this._majorValues.concat( this._values[ 1 ] ).sort( function ( a, b ) { return a - b; } );
    if ( this._majorValues[ 0 ] > this._majorValues[ this._majorValues.length - 1 ] ) this._values.reverse();
    this._values = this._values.filter(function (el, ind, arr) {
      return ind === 0 || el !== arr[ind - 1];
    });

    // was a split parameter passed?
    if (split === undefined)
    {
      // disable splitting
      this._splitIndex = this._values.length;
    }
    else
    {
      // set split index
      this._splitIndex = this._binValue( split, this._values );
      this._splitIndex = this._splitIndex[ this._splitIndex.length > 1 ? 1 : 0 ];
    }

    this.setByValue( typeof def !== "undefined" ? def : this._values[ 0 ], true );

    if (this._input && typeof min !== 'undefined' && typeof max !== 'undefined')
    {
      // Resize input text box size to accomodate the number of digits in range.
      this._input.size = [min, max].map(function (x) {
          return typeof x === "undefined" ? 0 : x.toString().length;
        }).reduce(function (m, x) { return Math.max(m, x); }, 2) + 1;
    }
  };

  CATMAID.Slider = Slider;

})(CATMAID);
