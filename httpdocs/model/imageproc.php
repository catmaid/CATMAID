<?

$url = $_GET["url"]; // the URL of the image
$type = $_GET["type"]; // the image type, used for MIME-type

// TODO: Make sure the whole URL can be used with Gmagick
$url = str_replace("http://rablibrary.mpi-cbg.de/catmaid", "..", $url);

//Instantiate a new Gmagick object
$image = new Gmagick( $url );

//Create a border around the image, then simulate how the image will look like as an oil painting
//Notice the chaining of mutator methods which is supported in gmagick
//$image->borderImage("yellow", 8, 8)->oilPaintImage(0.3);

header( 'content-type: image/' . $type );
echo $image;

?>
