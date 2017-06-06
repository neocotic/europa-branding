/*
 * Copyright (C) 2017 Alasdair Mercer, !ninja
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

'use strict';

const async = require('async');
const del = require('del');
const fs = require('fs');
const glob = require('glob');
const path = require('path');
const pngToIco = require('png-to-ico');
const svg2png = require('svg2png');
const SVGO = require('svgo');

const manifest = require('../assets/manifest.json');
const svgo = new SVGO();

const extensions = {
  ico: '.ico',
  png: '.png',
  svg: '.svg'
};
const minifiedExtensionPrefix = '.min';

function build(callback) {
  async.series([
    async.apply(convertAllSvgToPng, manifest.assets.svg2png),
    async.apply(convertAllPngToIco, manifest.assets.png2ico),
    async.apply(optimizeAllSvg)
  ], callback);
}

function convertAllPngToIco(assets, callback) {
  async.eachOfSeries(assets, (sizes, asset, next) => {
    console.log(`Converting ${asset} PNG assets to ICO...`);

    async.eachSeries(sizes, async.apply(convertAllPngToIcoForSize, asset), next);
  }, callback);
}

function convertAllPngToIcoForSize(asset, size, callback) {
  async.waterfall([
    async.apply(glob, `assets/${asset}/**/*-${size}${extensions.png}`),
    (filePaths, next) => async.each(filePaths, async.apply(convertPngToIcoForFile, asset, size), next)
  ], callback);
}

function convertAllSvgToPng(assets, callback) {
  async.eachOfSeries(assets, (sizes, asset, next) => {
    console.log(`Converting ${asset} SVG assets to PNG...`);

    async.waterfall([
      async.apply(glob, `assets/${asset}/**/*${extensions.svg}`, { ignore: '**/*.min.svg' }),
      (filePaths, _next) => async.eachSeries(filePaths, async.apply(convertSvgToPngForFile, asset, sizes), _next)
    ], next);
  }, callback);
}

function convertPngToIco(asset, filePath, baseName, directory, size, callback) {
  console.log(`Converting ${directory} PNG asset of size ${size} to ICO...`);

  async.waterfall([
    async.apply(fs.readFile, filePath),
    async.asyncify((input) => pngToIco(input)),
    async.apply(fs.writeFile, `${directory}/${baseName}${extensions.ico}`)
  ], callback);
}

function convertPngToIcoForFile(asset, size, filePath, callback) {
  let baseName = path.basename(filePath, extensions.png);
  baseName = baseName.substring(0, baseName.indexOf(`-${size}`));
  const directory = path.dirname(filePath);

  async.series([
    async.asyncify(() => del([ `${directory}/${baseName}${extensions.ico}` ])),
    async.apply(convertPngToIco, asset, filePath, baseName, directory, size)
  ], callback);
}

function convertSvgToPng(asset, filePath, baseName, directory, size, callback) {
  console.log(`Converting ${directory} SVG asset of size ${size} to PNG...`);

  const dimensions = size.split('x');

  async.waterfall([
    async.apply(fs.readFile, filePath),
    async.asyncify((input) => svg2png(input, { width: dimensions[0], height: dimensions[1] })),
    async.apply(fs.writeFile, `${directory}/${baseName}-${size}${extensions.png}`)
  ], callback);
}

function convertSvgToPngForFile(asset, sizes, filePath, callback) {
  const baseName = path.basename(filePath, extensions.svg);
  const directory = path.dirname(filePath);

  async.series([
    async.asyncify(() => del([ `${directory}/${baseName}-*${extensions.png}` ])),
    (next) => async.each(sizes, async.apply(convertSvgToPng, asset, filePath, baseName, directory), next)
  ], callback);
}

function optimizeAllSvg(callback) {
  console.log(`Creating optimized SVG assets...`);

  async.waterfall([
    async.asyncify(() => del([ `assets/**/*${minifiedExtensionPrefix}${extensions.svg}` ])),
    async.apply(glob, `assets/**/*${extensions.svg}`),
    (filePaths, next) => async.each(filePaths, async.apply(optimizeSvg), next)
  ], callback);
}

function optimizeSvg(filePath, callback) {
  const baseName = path.basename(filePath, extensions.svg);
  const directory = path.dirname(filePath);

  console.log(`Optimizing ${directory} SVG asset...`);

  async.waterfall([
    async.apply(fs.readFile, filePath, 'utf8'),
    (input, next) => {
      svgo.optimize(input, (result) => {
        if (result.error) {
          next(result.error);
        } else {
          next(null, result.data);
        }
      })
    },
    async.apply(fs.writeFile, `${directory}/${baseName}${minifiedExtensionPrefix}${extensions.svg}`)
  ], callback);
}

build((error) => {
  if (error) {
    throw error;
  } else {
    console.log('Done!');
  }
});
