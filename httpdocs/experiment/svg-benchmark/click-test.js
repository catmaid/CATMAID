Node = function( paper, id, parent, x, y, r )
{
	var ox = 0, oy = 0;
	// the id of this node
	this.id = id;
	// the coordinates of this node
	this.ix = x - r;
	this.iy = y - r;

    var startCircle = (new Date()).getTime();
	var c = paper.circle( this.ix, this.iy , r ).attr({
          fill: "hsb(.8, 1, 1)",
          stroke: "none",
          opacity: .5
        });

	var mc = paper.circle( this.ix, this.iy, r + 8 ).attr({
          fill: "rgb(0, 1, 0)",
          stroke: "none",
          opacity: 0
        });
    totalCircle += (new Date()).getTime() - startCircle;


	this.getC = function(){ return c; }

	var children = new Array();
	this.getChildren = function(){ return children; }

	this.children = children;
	this.parent = parent;
	var l;
	if ( parent != null )
		l = paper.path();

	var drawLine = function()
	{
		if (parent != null) {
			l.attr({
                  path: [["M", c.attrs.cx, c.attrs.cy], ["L", parent.getC().attrs.cx, parent.getC().attrs.cy]]
                });
			l.toBack();
		}
	}

	this.drawLine = drawLine;

	mc.move = function( dx, dy, ax, ay, event )
	{
		if (!event.ctrlKey) {
			var x = ox + dx;
			var y = oy + dy;
			c.attr({cx: x,cy: y});
			mc.attr({cx: x,cy: y});
			this.ix = x;
			this.iy = y;
			for ( var i = 0; i < children.length; ++i )
				children[ i ].drawLine();
			drawLine();
		}
	}
	mc.up = function(event)
	{
		if (!event.ctrlKey) {
			c.attr({
                  opacity: .5
                });
		}
	}
	mc.start = function(event)
	{
		// not drag when ctrl pressed
		if (!event.ctrlKey ){
			ox = mc.attr("cx");
			oy = mc.attr("cy");
			c.attr({opacity:1});
		}
	}
	mc.drag( mc.move, mc.start, mc.up );

	mc.click(function (event) {
        });

	mc.mousedown(function (event) {
        });

	mc.mouseup(function (event) {
        });

	mc.dblclick(function (event) {
            alert("this is a node"+id);
        });




}

var totalAll = 0;
var totalClear = 0;
var totalNode = 0;
var totalCircle = 0;
var totalRectangle = 0;

runBenchmark = function() {

    var startAll = (new Date()).getTime();

	var ln = null;

    var x = r.width / 2;
	var y = r.height / 2;

/*
  function sleep(ms)
  {
  var dt = new Date();
  dt.setTime(dt.getTime() + ms);
  while (new Date().getTime() < dt.getTime());
  }
*/

    var loops = 1;

    for(var j = 0; j < loops; ++j) {

        var startClear = (new Date()).getTime();
        r.clear();
        totalClear += (new Date()).getTime() - startClear;

        for (var i = 0; i < 1000; ++i)
            {
                x = Math.min( r.width, Math.max( 0, x + ( .5 - Math.random() ) * 100 ) );
                y = Math.min( r.height, Math.max( 0, y + ( .5 - Math.random() ) * 100 ) );
                var startNode = (new Date()).getTime();
                ln = new Node( r, i, ln, x, y, 2 );
                totalNode += (new Date()).getTime() - startNode;
            }

        while ( ln.parent != null )
            {
                ln.parent.getChildren().push( ln );
                ln.drawLine();
                ln = ln.parent;
            }
    }
    totalAll += (new Date()).getTime() - startAll;
};

var r;
var lastcli;

window.onload = function () {

    r = Raphael("holder", 1200, 400);

    // storing original coordinates
    if(false) {
        r.raphael.mouseup(function (event) {
                // console.log("raphael mouse up");
                lastcli.drawLine();
            });
        r.raphael.mousedown(function (event) {

                // only add if shift is pressed
                if (event.shiftKey) {
                    ln = new Node(r, Math.round(Math.random() * 100), null, event.clientX, event.clientY, 5);
                    // added node is last clicked
                    lastcli = ln;
                } else if (event.ctrlKey) {

                    // draw a line from lastcli to here
                    x = event.clientX;
                    y = event.clientY;

                    // add a new node and set the parent to the last clicked
                    nn = new Node(r, Math.round(Math.random() * 100), null, x, y, 5);
                    nn.parent = lastcli;
                    // add children to lastcli
                    lastcli.children.push(nn);
                    lastcli = nn;
                    /*
                      var l = r.path();
                      l.attr({
                          path: [["M", lastcli.ix, lastcli.iy], ["L", x, y]]
                      });*/

                }
            });
    }
};


var n = 0;

window.onclick = function() {

    runBenchmark();
    ++n;

    var results = document.getElementById('results');
    results.innerHTML = "Run "+n+" times"+
    "<br>For clear(): "+(totalClear / n)+
    "<br>For Node(): "+(totalNode / n)+
    "<br>For circles: "+(totalCircle / n)+
    "<br>For all: "+(totalAll / n);
}