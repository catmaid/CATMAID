/**
 * The WebCola browser build defines window.cola, but cytoscape-cola 2.x looks
 * for it as window.webcola when it is loaded.
 */
window.webcola = window.cola;
