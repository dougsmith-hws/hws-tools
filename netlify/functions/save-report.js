const { getStore } = require('@netlify/blobs');

// Unambiguous chars only (no 0/O, 1/l/I)
const CHARS = 'abcdefghjkmnpqrstuvwxyz23456789';

function makeId(len) {
  let id = '';
  for (let i = 0; i < len; i++) {
    id += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return id;
}

exports.handler = async function (event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: 'Method not allowed' };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, headers, body: 'Invalid JSON' };
  }

  const id = makeId(7);
  const record = {
    ...payload,
    created: new Date().toISOString(),
  };

  const store = getStore('reports');
  await store.set(id, JSON.stringify(record));

  return {
    statusCode: 200,
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id,
      url: `https://tools.homewealthsolutions.com/r/${id}`,
    }),
  };
};
