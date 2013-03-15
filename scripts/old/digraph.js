// Uncompleted reimplementation of NetworkX DiGraph in JavaScript
function DiGraph() {

    var self = this;
    self.graph = {};
    self.node = {};
    self.adj = {};
    self.pred = {};
    self.succ = self.adj;
    self.edge=self.adj;

    self.add_node = function(n, data) {
        if( !self.succ.hasOwnProperty(n) ) {
            self.succ[ n ] = {};
            self.pred[ n ] = {};
            self.node[ n ] = data;
        } else {
            self.node[ n ] = data;
        }
    }

    self.remove_node = function(n) {
        if( !self.node.hasOwnProperty(n)) {
            console.log('Graph does not have node', n);
        }
        delete self.node[ n ];
        var nbrs = self.succ[ n ];
        for( var u in nbrs) {
            if( nbrs.hasOwnProperty(u)) {
                delete self.pred[u][n];
            }
        }
        delete self.succ[n];
        for( var u in self.pred[n]) {
            if( self.pred[n].hasOwnProperty(u)) {
                delete self.succ[u][n];
            }
        }
        delete self.pred[n];
    }

    self.add_edge = function(u, v, data) {
        if(!self.succ.hasOwnProperty(u)) {
            self.succ[u]={};
            self.pred[u]={};
            self.node[u]={};
        }
        if(!self.succ.hasOwnProperty(v)) {
            self.succ[v]={};
            self.pred[v]={};
            self.node[v]={};
        }
        self.succ[u][v]=data;
        self.pred[v][u]=data;
    }

}