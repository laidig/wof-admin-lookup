'use strict';

const tape = require('tape');
const event_stream = require('event-stream');
const proxyquire = require('proxyquire').noCallThru();
const through = require('through2');

const stream = require('../src/lookupStream');

function test_stream(input, testedStream, callback) {
    const input_stream = event_stream.readArray(input);
    const destination_stream = event_stream.writeArray(callback);

    input_stream.pipe(testedStream).pipe(destination_stream);
}

tape('tests for main entry point', (test) => {
  test.test('config.generate(schema) throwing error should rethrow', (t) => {
    t.throws(() => {
      proxyquire('../index', {
        // verify the schema
        './schema': 'this is the schema',
        'pelias-config': {
          generate: (schema) => {
            t.equals(schema, 'this is the schema');
            throw Error('config is not valid');
          }
        }
      });

    }, /config is not valid/);

    t.end();

  });

  test.test('adminLookup enabled should return a lookupStream', (t) => {
    const stream = proxyquire('../index', {
      // verify the schema
      './schema': 'this is the schema',
      'pelias-config': {
        generate: (schema) => {
          t.equals(schema, 'this is the schema');

          return {
            imports: {
              adminLookup: {
                enabled: true,
                maxConcurrentReqs: 17
              },
              whosonfirst: {
                datapath: 'this is the wof datapath'
              }
            }
          };

        }
      },
      './src/localPipResolver': (datapath) => {
        t.equals(datapath, 'this is the wof datapath');
        return 'this is the resolver';
      },
      './src/lookupStream': (resolver, maxConcurrentReqs) => {
        t.equals(resolver, 'this is the resolver');
        t.equals(maxConcurrentReqs, 17, 'maxConcurrentReqs should be from config');

        return through.obj(function(record, enc, next) {
          record.field1 = 'new value';
          next(null, record);
        });

      }

    }).create();

    const input = [
      { field1: 'old value' }
    ];

    const expected = [
      { field1: 'new value' }
    ];

    test_stream(input, stream, (err, actual) => {
      t.deepEqual(actual, expected, 'something should have changed');
      t.end();
    });


  });

  test.test('adminLookup.enabled = false should return a pass-through stream', (t) => {
    const stream = proxyquire('../index', {
      './schema': 'this is the schema',
      // the mock config
      'pelias-config': {
        generate: (schema) => {
          // verify the schema
          t.equals(schema, 'this is the schema');

          return {
            imports: {
              adminLookup: {
                enabled: false
              }
            }
          };

        }
      },
      './src/localPipResolver': (datapath) => {
        throw Error('localPipResolver should not have been called');
      },
      './src/lookupStream': (resolver, maxConcurrentReqs) => {
        throw Error('lookupStream should not have been called');
      },

    }).create();

    const input = [
      { field1: 'value 1'}
    ];

    test_stream(input, stream, (err, actual) => {
      t.deepEqual(actual, input, 'nothing should have changed');
      t.end();
    });

  });

  test.test('resolver() should return the resolver regardless of adminLookup value', (t) => {
    [true, false].forEach((enabled) => {
      const resolver = proxyquire('../index', {
        // verify the schema
        './schema': 'this is the schema',
        'pelias-config': {
          generate: (schema) => {
            t.equals(schema, 'this is the schema');

            return {
              imports: {
                adminLookup: {
                  enabled: enabled
                },
                whosonfirst: {
                  datapath: 'this is the wof datapath'
                }
              }
            };

          }
        },
        './src/localPipResolver': (datapath) => {
          t.equals(datapath, 'this is the wof datapath');
          return 'this is the resolver';
        }

      }).resolver();

      t.equals(resolver, 'this is the resolver');

    });

    t.end();

  });

});
