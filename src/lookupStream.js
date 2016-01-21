var _ = require('lodash');
var parallelStream = require('pelias-parallel-stream');
var peliasConfig = require( 'pelias-config' ).generate();
var countries = require('../data/countries');
var regions = require('../data/regions');
var peliasLogger = require( 'pelias-logger' );

var logger = peliasLogger.get( 'wof-admin-lookup', {
  transports: [
    new peliasLogger.winston.transports.File( {
      filename: 'suspect_wof_records.log',
      timestamp: false
    })
  ]
});

function createLookupStream(resolver) {

  var maxConcurrentReqs = 100;
  if (peliasConfig.imports.adminLookup && peliasConfig.imports.adminLookup.maxConcurrentReqs) {
    maxConcurrentReqs = peliasConfig.adminLookup.maxConcurrentReqs;
  }

  return parallelStream(maxConcurrentReqs, function (doc, enc, callback) {

    // don't do anything if there's no centroid
    if (_.isEmpty(doc.getCentroid())) {
      return callback(null, doc);
    }

    resolver(doc.getCentroid(), function (err, result) {

      // assume errors at this point are fatal, so pass them upstream to kill stream
      if (err) {
        logger.error(err);
        return callback(new Error('PIP server failed:' + err.message));
      }

      // log results w/o country OR any multiples
      if (hasCountry(result)) {
        logger.info('no country', {
          centroid: doc.getCentroid(),
          result: result
        });
      }
      if (hasAnyMultiples(result)) {
        logger.info('multiple values', {
          centroid: doc.getCentroid(),
          result: result
        });
      }

      var regionCode = regions.getCode(result.country, result.region);
      var countryCode = countries.getCode(result.country);

      // set code if available
      if (!_.isUndefined(countryCode)) {
        doc.setAlpha3(countryCode);
      }

      setFields(result.country, doc, 'admin0', 'country');
      setFields(result.region, doc, 'admin1', 'region', regionCode);
      setFields(result.county, doc, 'admin2', 'county');
      setFields(result.locality, doc, 'locality', 'locality');
      setFields(result.localadmin, doc, 'local_admin', 'localadmin');
      setFields(result.neighbourhood, doc, 'neighborhood', 'neighbourhood');

      callback(null, doc);
    });
  });
}

countries.isSupported = function(country) {
  return this.hasOwnProperty(country);
};

countries.getCode = function(countries) {
  if (_.isEmpty(countries)) {
    return undefined;
  }

  if (this.isSupported(countries[0].name)) {
    return this[countries[0].name];
  }

  return undefined;

};

regions.isSupported = function(country, name) {
  return this.hasOwnProperty(country) && this[country].hasOwnProperty(name);
};

regions.getCode = function(countries, regions) {
  if (_.isEmpty(countries) || _.isEmpty(regions)) {
    return undefined;
  }

  var country = countries[0].name;
  var region = regions[0].name;

  if (this.isSupported(country, region)) {
    return this[country][region];
  }

  return undefined;

};

function setFields(values, doc, qsFieldName, wofFieldName, abbreviation) {
  if (!_.isEmpty(values)) {
    doc.setAdmin( qsFieldName, values[0].name);
    doc.addParent( wofFieldName, values[0].name, values[0].id.toString(), abbreviation);
  }
}

function hasCountry(result) {
  return _.isEmpty(result.country);
}

function hasAnyMultiples(result) {
  return Object.keys(result).some(function(element) {
    return result[element].length > 1;
  });
}


module.exports = {
  createLookupStream: createLookupStream
};
