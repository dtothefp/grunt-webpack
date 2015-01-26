/*
 * grunt-webpack
 * https://github.com/sokra/grunt-webpack
 *
 * Copyright (c) 2012 Tobias Koppers @sokra
 * Licensed under the MIT license.
 */

var path = require("path");
var _ = require("lodash");

module.exports = function(grunt) {
  var getWithPlugins = require("../lib/getWithPlugins")(grunt);
  var mergeFunction = require("../lib/mergeFunction")(grunt);

  var webpack = require("webpack");
  var CachePlugin = require("webpack/lib/CachePlugin");
  var ProgressPlugin = require("webpack/lib/ProgressPlugin");

  var targetCachePlugins = {};
  var targetDependencies = {};

  grunt.registerMultiTask('webpack', 'Webpack files.', function() {
    var done = this.async();
    var options = _.merge(
      {x:{
      context: ".",
      output: {
        path: "."
      },
      progress: true,
      stats: {},
      failOnError: true
    }},
    {x:getWithPlugins([this.name, "options"])},
    {x:getWithPlugins([this.name, this.target])},
    mergeFunction
    ).x;
    [].concat(options).forEach(function(options) {
      options.context = path.resolve(process.cwd(), options.context);
      options.output.path = path.resolve(process.cwd(), options.output.path);
    });

    //check environment to remove unwanted config
    if(options.watch && grunt.config.get('environment') !== 'dev') {
      delete options.watch;
    }

    //flatten config for jshint
    if( _.isObject(options.jshint) && !_.isArray(options.jshint) ) {
      _.extend(options.jshint, options.jshint.config.src.options);
      options.jshint.config.tasks[grunt.config.get('environment')].forEach(function(task) {
        _.extend(
          options.jshint,
          options.jshint.config.src[task].options
        );
      });

      delete options.jshint.config;
    }

    //make the concat banner try catch block and inject the filename as a variable
    _.each(options.module.preLoaders, function(loaderObj) {
      if(/inject\-filename\-loader/.test(loaderObj.loader)) {
        loaderObj.loader = loaderObj.loader + '&banner=' + encodeURIComponent(grunt.config.get('concat_banner')) + '&footer=' + encodeURIComponent(grunt.config.get('concat_footer'));
      }
    });

    function construct(constructor, args) {
      function F() {
        return constructor.apply(this, args);
      }
      F.prototype = constructor.prototype;
      return new F();
    }

    var firstOptions = Array.isArray(options) ? options[0] : options;
    var target = this.target;
    var watch = firstOptions.watch;
    var cache = watch ? false : firstOptions.cache;
    var keepalive = this.flags.keepalive || firstOptions.keepalive;
    if(cache) {
      [].concat(options).forEach(function(o) { o.cache = false; });
    }
    var environment = options.environment;
    if(environment) {
      options.envPlugins.forEach(function(pluginList) {
        var pluginEnv = pluginList[0];
        var pluginConst = pluginList[1];
        var pluginArgs = pluginList[2];
        var not = /\!/.test(pluginEnv) && pluginEnv.replace('!', '');
        if(not && not !== environment || pluginEnv === environment) {
          options.plugins.push(construct(pluginConst, pluginArgs));
        }
      });
      if(environment !== 'dev' && options.devtool) {
        delete options.devtool;
      }
      delete options.environment;
      delete options.envPlugins;
    }
    var storeStatsTo = firstOptions.storeStatsTo;
    var statsOptions = firstOptions.stats;
    var failOnError = firstOptions.failOnError;
    var progress = firstOptions.progress;
    var compiler = webpack(options);

    if(cache) {
      var theCachePlugin = targetCachePlugins[target];
      if(!theCachePlugin) {
        theCachePlugin = targetCachePlugins[target] = new CachePlugin();
      }
      compiler.apply(theCachePlugin);
      if(targetDependencies[target]) {
        compiler._lastCompilationFileDependencies = targetDependencies[target].file;
        compiler._lastCompilationContextDependencies = targetDependencies[target].context;
      }
    }

    if(progress) {
      var chars = 0;
      compiler.apply(new ProgressPlugin(function(percentage, msg) {
        if(percentage < 1) {
          percentage = Math.floor(percentage * 100);
          msg = percentage + "% " + msg;
          if(percentage < 100) msg = " " + msg;
          if(percentage < 10) msg = " " + msg;
        }
        for(; chars > msg.length; chars--)
        grunt.log.write("\b \b");
        chars = msg.length;
        for(var i = 0; i < chars; i++)
        grunt.log.write("\b");
        grunt.log.write(msg);
      }));
    }

    if (watch) {
      compiler.watch(options.watchDelay || 200, handler);
    } else {
      compiler.run(handler);
    }
    function handler(err, stats) {
      if(cache) {
        targetDependencies[target] = {
          file: compiler._lastCompilationFileDependencies,
          context: compiler._lastCompilationContextDependencies
        };
      }
      if(err) {
        grunt.log.error(err);
        return done(false);
      }

      if(statsOptions) {
        grunt.log.notverbose.writeln(stats.toString(grunt.util._.merge({
          colors: true,
          hash: false,
          timings: false,
          assets: true,
          chunks: false,
          chunkModules: false,
          modules: false,
          children: true
        }, statsOptions)));
        grunt.verbose.writeln(stats.toString(grunt.util._.merge({
          colors: true
        }, statsOptions)));
      }
      if(typeof storeStatsTo === "string") {
        grunt.config.set(storeStatsTo, stats.toJson());
      }
      if(failOnError && stats.hasErrors()) {
        return done(false);
      }
      if(!keepalive) {
        done();
        done = function(){};
      }
    }
  });

};
