/**
 * @license
 * Copyright 2017 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
'use strict';

const objectAssign = require('object-assign');

const flatten = arr => arr.reduce((prev, curr) => prev.concat(curr), []);

const defaultOptions = {
  rel: 'preload',
  include: 'asyncChunks',
  fileBlacklist: [/\.map/]
};

class PreloadPlugin {
  constructor(options) {
    this.options = objectAssign({}, defaultOptions, options);
  }

  apply(compiler) {
    const options = this.options;
    let filesToInclude = '';
    let extractedChunks = [];
    compiler.plugin('compilation', compilation => {
      compilation.plugin('html-webpack-plugin-before-html-processing', (htmlPluginData, cb) => {
        // 'asyncChunks' are chunks intended for lazy/async loading usually generated as
        // part of code-splitting with import() or require.ensure(). By default, asyncChunks
        // get wired up using link rel=preload when using this plugin. This behaviour can be
        // configured to preload all types of chunks or just prefetch chunks as needed.
        if (options.include === undefined || options.include === 'asyncChunks') {
          try {
            extractedChunks = compilation.chunks.filter(chunk => !chunk.isInitial());
          } catch (e) {
            extractedChunks = compilation.chunks;
          }
        } else if (options.include === 'all') {
            // Async chunks, vendor chunks, normal chunks.
          extractedChunks = compilation.chunks;
        } else if (Array.isArray(options.include)) {
          // Keep only user specified chunks
          extractedChunks = compilation
              .chunks
              .filter((chunk) => {
                const chunkName = chunk.name;
                // Works only for named chunks
                if (!chunkName) {
                  return false;
                }
                return options.include.indexOf(chunkName) > -1;
              });
        }

        flatten(extractedChunks.map(chunk => chunk.files)).filter(entry => {
          return this.options.fileBlacklist.every(regex => regex.test(entry) === false);
        }).forEach(entry => {
          if (options.rel === 'preload') {
            // If `as` value is not provided in option, dynamically determine the correct
            // value depends on suffix of filename. Otherwise use the given `as` value.
            let asValue;
            if (!options.as) {
              if (entry.match(/\.css$/)) asValue = 'style';
              else if (entry.match(/\.woff2$/)) asValue = 'font';
              else asValue = 'script';
            } else if (typeof options.as === 'function') {
              asValue = options.as(entry);
            } else {
              asValue = options.as;
            }
            const crossOrigin = asValue === 'font' ? 'crossorigin="crossorigin" ' : '';
            filesToInclude+= `<link rel="${options.rel}" class="dynamic" as="${asValue}" ${crossOrigin}data-href="/${entry}">\n`;
          } else {
            // If preload isn't specified, the only other valid entry is prefetch here
            // You could specify preconnect but as we're dealing with direct paths to resources
            // instead of origins that would make less sense.
            filesToInclude+= `<link rel="${options.rel}" class="dynamic" data-href="/${entry}">\n`;
          }
        });
        if (htmlPluginData.html.indexOf('</head>') !== -1) {
          // If a valid closing </head> is found, update it to include preload/prefetch tags
          htmlPluginData.html = htmlPluginData.html.replace('</head>', filesToInclude + '</head>');
        } else {
          // Otherwise assume at least a <body> is present and update it to include a new <head>
          htmlPluginData.html = htmlPluginData.html.replace('<body>', '<head>' + filesToInclude + '</head><body>');
        }
        cb(null, htmlPluginData);
      });
    });
  }
}

module.exports = PreloadPlugin;
