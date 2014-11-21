/*
* Colorwheel
* Copyright (c) 2010 John Weir (http://famedriver.com)
* Licensed under the MIT (http://www.opensource.org/licenses/mit-license.php) license.
*
* requires jQuery & Raphael
*   http://jquery.com http://raphaeljs.com
*
* see http://jweir.github.com/colorwheel for Usage
*
*/

Raphael.colorwheel = function(target, color_wheel_size, no_segments){
  var canvas,
      current_color,
      current_alpha,
      size,
      segments = no_segments || 60,
      bs_square = {},
      hue_ring = {},
      alpha_rect = {},
      tri_size,
      cursor = {},
      drag_target,
      input_target,
      center,
      parent,
      change_callback,
      drag_callbacks = [function(){}, function(){}],
      offset,
      padding = 2,
      sdim, // holds the dimensions for the saturation square
      rdim; // holds the dimensions for the alpha rectangle

  function point(x, y){ return {x:x, y:y};}
  function radians(a){ return a * (Math.PI/180);}

  function angle(x,y){
    var q = x > 0 ? 0 : 180;
    return q+Math.atan((0 - y)/(0 - x))*180/(Math.PI);
  }

  function create(target, color_wheel_size){
    size     = color_wheel_size;
    tri_size = size/20;
    center   = size/2;
    parent   = $(target);
    canvas   = Raphael(parent[0],size, size);
    canvas.safari();
    current_alpha = 1;

    create_bs_square();
    create_hue_ring();
    create_alpha_rect();
    hue_ring.cursor = cursor_create(tri_size);
    bs_square.cursor = cursor_create(tri_size*0.5);
    alpha_rect.cursor = cursor_create(tri_size*0.5);
    events_setup();
    parent.css({height:size+"px", width:size+"px"});
    disable_select(parent);
    return public_methods();
  }

  function disable_select(target){
    $(target).css({"unselectable": "on","-moz-user-select": "none","-webkit-user-select": "none"});
  }

  function public_methods(){
    return {
      input: input,
      onchange: onchange,
      ondrag : ondrag,
      color : public_set_color
    };
  }

  // Sets a textfield for user input of hex color values
  // TODO don't clear the change callback
  // TODO allow a null target to unbind the input
  function input(target){
    change_callback = null;
    input_target = target;
    $(target).keyup(function(){
      if(this.value.match(/^#([0-9A-F]){3}$|^#([0-9A-F]){6}$/img)){
        set_color(this.value);
        update_color(true);
		run_onchange_event();
      }
    });
    set_color(target.value);
    update_color(true);

    return public_methods();
  }

  function onchange(callback){
    change_callback = callback;
    update_color(false);
    return public_methods();
  }

  function ondrag(start_callback, end_callback){
    drag_callbacks = [start_callback || function(){}, end_callback || function(){}];
    return public_methods();
  }

  function drag(e){
    var x, y, page;

    e.preventDefault(); // prevents scrolling on touch

    page = e.originalEvent.touches ? e.originalEvent.touches[0] : e;

    x = page.pageX - (parent.offset().left + center);
    y = page.pageY - (parent.offset().top + center);

    if(drag_target == hue_ring){
      set_hue_cursor(x,y);
      update_color();
      run_onchange_event();
      return true;
    }
    if(drag_target == bs_square){
      set_bs_cursor(x,y);
      update_color();
      run_onchange_event();
      return true;
    }
    if(drag_target == alpha_rect){
      set_alpha_cursor(x,y);
      update_color();
      run_onchange_event();
      return true;
    }
  }

  function start_drag(event, target){
    event.preventDefault(); // prevents scrolling on touch

    $(document).on('mouseup touchend',stop_drag);
    $(document).on('mousemove touchmove',drag);
    drag_target = target;
    drag(event);
    drag_callbacks[0](current_color);
  }

  function stop_drag(event){
    event.preventDefault(); // prevents scrolling on touch

    $(document).off("mouseup touchend",stop_drag);
    $(document).off("mousemove touchmove",drag);
    drag_callbacks[1](current_color);
    run_onchange_event();
  }

  function events_setup(){
    $([hue_ring.event.node,hue_ring.cursor[0].node]).on("mousedown touchstart",
                                                        function(e){start_drag(e,hue_ring);});
    $([bs_square.b.node, bs_square.cursor[0].node]).on("mousedown touchstart",
                                                       function(e){start_drag(e,bs_square);});
    $([alpha_rect.a.node, alpha_rect.cursor[0].node]).on("mousedown touchstart",
                                                       function(e){start_drag(e,alpha_rect);});
  }

  function cursor_create(size){
    var set = canvas.set().push(
        canvas.circle(0, 0, size).attr({"stroke-width":4, stroke:"#333"}),
        canvas.circle(0, 0, size+2).attr({"stroke-width":1, stroke:"#FFF", opacity:0.5})
    );

    set[0].node.style.cursor = "crosshair";

    return set;
  }

  function set_bs_cursor(x,y){
    x = x+center;
    y = y+center;
    if(x < sdim.x){x = sdim.x}
    if(x > sdim.x+sdim.l){x = sdim.x+sdim.l}
    if(y < sdim.y){y = sdim.y}
    if(y > sdim.y+sdim.l){y = sdim.y + sdim.l}

    bs_square.cursor.attr({cx:x, cy:y}).transform("t0,0");
  }


  function set_hue(color){
    var hex = Raphael.getRGB(color).hex;
    bs_square.h.attr("fill", hex);
  }

  function hue(){
    return Raphael.rgb2hsb(bs_square.h.attr("fill")).h;
  }

  function public_set_color(value, alpha){
    if (typeof alpha !== "undefined") current_alpha = alpha;
    var ret = set_color(value);
    update_color(false);
    return ret;
  }

  function set_color(value){
    if(value === undefined){ return current_color; }

    var temp = canvas.rect(1,1,1,1).attr({fill:value}),
        hsb = canvas.raphael.rgb2hsb(temp.attr("fill"));

    set_bs_cursor(
      (0-sdim.l/2) + (sdim.l*hsb.s),
      sdim.l/2 - (sdim.l*hsb.b));
    set_hue_cursor((360*(hsb.h))-90);
    set_alpha_cursor((current_alpha-0.5)*rdim.w, 0);
    temp.remove();
    return public_methods();
  }

  // Could optimize this method
  function update_color(dont_replace_input_value){
    var x = bs_square.cursor.items[0].attr("cx"),
        y = bs_square.cursor.items[0].attr("cy"),
        hsb = {
          b: 1-(y-sdim.y)/sdim.l,
          s: (x-sdim.x)/sdim.l,
          h: hue()
        };

    current_color = Raphael.hsb2rgb(hsb.h, hsb.s,hsb.b);
    current_alpha = (alpha_rect.cursor.items[0].attr("cx") - rdim.x)/rdim.w;

    var rgbstr = Raphael.format("rgba({0},{1},{2},", current_color.r, current_color.g, current_color.b);
    alpha_rect.a.attr("fill", "180-"+rgbstr+"255)-"+rgbstr+"0)");

    if(input_target){
      var c = current_color.hex;
      if(dont_replace_input_value !== true) { input_target.value = c;}
       if(hsb.b < 0.5){
        $(input_target).css("color", "#FFF");
      } else {
        $(input_target).css("color", "#000");
      }
      input_target.style.background = c;
    }

  }

  // accepts either x,y or d (degrees)
  function set_hue_cursor(mixed_args){
    var d;
    if(arguments.length == 2){
      d = angle(arguments[0],arguments[1]);
    } else {
      d = arguments[0];
    }

    var x = Math.cos(radians(d)) * (center-tri_size-padding);
    var y = Math.sin(radians(d)) * (center-tri_size-padding);
    hue_ring.cursor.attr({cx:x+center, cy:y+center}).transform("t0,0");
    set_hue("hsb("+(d+90)/360+",1,1)");
  }

  function bs_square_dim(){
    if(sdim){ return sdim;}
    var s = size - (tri_size * 4);
    sdim = {
      x:(s/6)+tri_size*2+padding,
      y:(s/6)+tri_size*2+padding,
      l:(s * 2/3)-padding*2
    };
    return sdim;
  }

  function create_bs_square(){
    bs_square_dim();
    box = [sdim.x, sdim.y, sdim.l, sdim.l];

    bs_square.h = canvas.rect.apply(canvas, box).attr({
      stroke:"#EEE", gradient: "0-#FFF-#000", opacity:1});
    bs_square.s = canvas.rect.apply(canvas, box).attr({
      stroke:null, gradient: "0-#FFF-#FFF", opacity:0});
    bs_square.b = canvas.rect.apply(canvas, box).attr({
      stroke:null, gradient: "90-#000-#FFF", opacity:0});
    bs_square.b.node.style.cursor = "crosshair";
  }

  function hue_segement_shape(){
    var path = "M -@W 0 L @W 0 L @W @H L -@W @H z";
    return path.replace(/@H/img, tri_size*2).replace(/@W/img,tri_size);
  }

  function copy_segment(r, d, k){
    var n = r.clone();
    var hue = d*(255/k);

    var s = size/2,
      t = tri_size,
      p = padding;

    n.transform("t"+s+","+(s-t)+"r"+(360/k)*d+"t0,-"+(s-t-p)+"");

    n.attr({"stroke-width":0, fill:"hsb("+d*(1/k)+", 1, 0.85)"});
    hue_ring.hues.push(n);
  }

  function create_hue_ring(){
    var s = hue_segement_shape(),
        tri = canvas.path(s).attr({stroke:"rgba(0,0,0,0)"}).transform("t"+(size/2)+","+padding),
        k = segments; // # of segments to use to generate the hues

    hue_ring.hues = canvas.set();

    for(n=0; n<k; n++){ copy_segment(tri, n, k); }

    // IE needs a slight opacity to assign events
    hue_ring.event = canvas.circle(
      center,
      center,
      center-tri_size-padding).attr({"stroke-width":tri_size*2, opacity:0.01});

    hue_ring.outline = canvas.circle(
      center,
      center,
      center-tri_size-padding).attr({"stroke":"#000", "stroke-width":(tri_size*2)+3, opacity:0.1});
    hue_ring.outline.toBack();
    hue_ring.event.node.style.cursor = "crosshair";
  }

  function alpha_rect_dim(){
    if(rdim){ return rdim;}
    rdim = {
      x:sdim.x+tri_size+padding,
      y:sdim.y+sdim.l+padding,
      w:sdim.l-(2*(tri_size+padding)),
      h:tri_size
    };
    return rdim;
  }

  function create_alpha_rect(){
    alpha_rect_dim();
    box = [rdim.x, rdim.y, rdim.w, rdim.h];
    alpha_rect.bg = [];
    for (var dx = 0; dx < Math.ceil(rdim.w/rdim.h); dx++) {
      var rem = Math.min(rdim.h, rdim.w - dx*rdim.h);
      alpha_rect.bg[2*dx] = canvas.rect.apply(canvas, [rdim.x + dx*rdim.h, rdim.y, rem, rdim.h/2]).attr({
        stroke: null, fill: dx % 2 ? "#888" : "#fff", opacity:1});
      alpha_rect.bg[2*dx+1] = canvas.rect.apply(canvas, [rdim.x + dx*rdim.h, rdim.y + rdim.h/2, rem, rdim.h/2]).attr({
        stroke: null, fill: dx % 2 ? "#fff" : "#888", opacity:1});
    }
    alpha_rect.a = canvas.rect.apply(canvas, box).attr({
      stroke:"#EEE", gradient: "0-rgba(100%,100%,100%,100%)-rgba(100%,100%,100%,0%)", opacity:0});
    alpha_rect.a.node.style.cursor = "crosshair";
  }

  function set_alpha_cursor(x,y){
    x = x+center;
    if(x < rdim.x){x = rdim.x}
    if(x > rdim.x+rdim.w){x = rdim.x+rdim.w}
    y = rdim.y+rdim.h/2;

    alpha_rect.cursor.attr({cx:x, cy:y}).transform("t0,0");
  }

  function run_onchange_event(){
    if (({}).toString.call(change_callback).match(/function/i)){
      change_callback(current_color, current_alpha);
    }
  }

  return create(target, color_wheel_size);
};
