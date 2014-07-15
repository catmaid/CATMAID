/***
Parser / Function Evaluator

(c) 2006 Jason Gallicchio.
Licensed under the open source (GNU compatible) MIT License

Construct a Parse tree from "A sin(x)"

Data types at the base:
[Boolean, Integer, Rational, Real, Complex, ArbitraryPrecision, Interval, 
DateTime, DateDelta, Graphics, GraphicsObject, Image]

Objects:
[Number, String, Symbol, Function, List/Vector]

Everything is a list with the head being a pointer
to the function and the rest being arguments

Functions with attribute Listable are automatically “threaded” over lists, 
so that they act separately on each list element. 
Most built-in mathematical functions are Listable. 

[add, 3, 9]

Functions:
[add, sub, mul, div, mod, max, min, 
compare, gt, lt, gte, lte, eq, neq,
call,
part,  // Same as [].  Negative values go from end.  Starts with 0. [1,2] is same as [1][2]
first, last,
floor, ceil, real, imag, phase, abs,
pow, exp, log, ln, lg
sinh, cosh, tanh, csch, sech, coth, asinh, acosh, atanh, acsch, asehc, acoth,
sin, cos, tan, csc, sec, cot, asin, acos, atan, acsc, asec, acot,
sind, cosd, tand, cscd, secd, cotd, asind, acosd, atand, acscd, asecd, acotd,  // Degrees
besselh,	//Bessel function of third kind (Hankel function)	 MATLAB®
besseli,	//Modified Bessel function of first kind	MATLAB®
besselj,	//Bessel function of first kind	MATLAB®
besselk,	//Modified Bessel function of second kind	MATLAB®
bessely,	//Bessel function of second kind
legendre, sphericalharmonic, chebyshevt, chebyshevu, hermite, laguerre, lacobi
beta,   //BetaFunction
gamma,  // GammaFunction
erf, erfc, erfcx, erfinv, erfcinv	//Error functions
and, or, not, xor, cmp,
bitget, bitset, bitshift
det, trace, inverse,
delta (dirac), step (heaviside), rect, gauss,
dot, cross, div, grad, curl, del, laplacian,  // On functions or sampled matricies
random, guassrandom,
colon (:)	// Create vectors, array subscripting, and for-loop iterators
checkerboard	//Create checkerboard image
datevec	//Convert date and time to vector of components
datenum //Create date number
datestr	//Create date string
fft, fft2, fftn dct, dct2, fftshift
dec2base	//Convert decimal to base N number in string	 MATLAB®
dec2bin     //Convert decimal to binary number in string	MATLAB®
dec2binvec	//Convert decimal value to binary vector	Data Acquisition Toolbox
dec2hex	    //Convert decimal to hexadecimal number in string
diag	//Diagonal matrices or diagonals of matrix,
eig	//Find eigenvalues and eigenvectors
expm1	//Compute exp(x)-1 accurately for small values of x
factor	//Prime factors
factorial,
for, table, sample,
// I made it up to h
// http://www.mathworks.com/support/functions/alpha_list.html?sec=4
]

Symbolic Calc:
[derivative, integrate, solve, dsolve]

Utility Functions:
[parse, eval, simplify, expand, display, latex, fullform]

Variable List:
[i: new Complex(0,1),
 pi: Math.PI,
 inf: Infinity ]

Functions defined both as JavaScript funcions that can "just be used" and also to be used in
my crazy custom language.
fft([1,4,5,6,7]) returns a JS list.
 
x/y translates into Times[x, Power[y, -1]]

A distinction must be made between array getters and setters "a = b[2]" and "b[2] = a"

The big question is if lists are different from expressions. In mathematica they are.
Expressions have a head that can be a funcion name or even some random expression
This is treated differently from the 0th item in a list.

***/

add = function() {
    // Check if we were passed lists and call map(add)
    var list = do_listable(add, params)
    if (list)
        return list
    
    // All numbers
    // Mixed numbers get promoted to highest type: bool, int, real, complex
    // Numbers plus symbols return expression [add, ]
    // Error is raised otherwise
}
