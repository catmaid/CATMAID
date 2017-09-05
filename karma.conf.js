// Karma configuration
// Generated on Wed Aug 30 2017 11:16:24 GMT-0400 (EDT)

module.exports = function(config) {
  config.set({
    basePath: '',
    frameworks: ['qunit', 'sinon'],
    files: [
      // jQuery has to be included first, other libraries expect it
      'django/static/js/libs/jquery-lib.js',
      // Raphael needs to be imported explicitly or it will fail
      'django/static/js/libs/raphael-lib.js',
      // Include everything but the CATMAID library
      'django/static/js/libs/!(catmaid-lib).js',
      // Include CATMAID library last
      'django/static/js/libs/catmaid-lib.js',
      // Include CATMAID front-end
      'django/static/js/catmaid.js',
      // Include front-end tests
      'django/applications/catmaid/static/js/tests/*.js'
    ],
    preprocessors: {},
    reporters: ['progress'],
    port: 9876,
    colors: true,
    logLevel: config.LOG_INFO,
    autoWatch: false,
    browsers: ['ChromeHeadless'],
    singleRun: true,
    concurrency: Infinity
  })
}
