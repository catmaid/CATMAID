var path = require('path');
var webpack = require('webpack');
var BundleTracker = require('webpack-bundle-tracker');

module.exports = {
  context: __dirname,
  entry: './static/js/index',
  devtool: 'eval-source-map',
  output: {
      path: path.resolve('./static/js/webpack_bundles/'),
      filename: "[name]-[hash].js"
  },

  plugins: [
    new BundleTracker({filename: './webpack-stats.json'})
  ]
};
