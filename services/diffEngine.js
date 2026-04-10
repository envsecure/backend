const { diffJson } = require('diff');

/**
 * Computes a unified Git-like diff between two JSON objects using the 'diff' library.
 * Returns an array of change objects { value, added, removed, count }
 */
function compareJSON(oldObj, newObj) {
  // We use diffJson natively. It formats objects down into strings and diffs line by line.
  const changes = diffJson(oldObj || {}, newObj || {});
  
  // Format the changes slightly if needed, but the native output is usually perfect.
  // Example output: [ { value: '{\n  "name": "a"\n}', added: undefined, removed: undefined } ]
  return changes;
}

module.exports = { compareJSON };
