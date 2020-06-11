var path = require('path');
var webpack = require('webpack');
var BundleTracker = require('webpack-bundle-tracker');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');

module.exports = {
  context: __dirname,
  entry: './static/js/index',
  devtool: 'eval-source-map',
  mode: 'development',
  output: {
      path: path.resolve('./static/js/webpack_bundles/'),
      filename: "[name]-[hash].js"
  },

  plugins: [
    new BundleTracker({filename: './webpack-stats.json'}),
    new CleanWebpackPlugin(),
  ]
};
